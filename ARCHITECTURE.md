# ASI Chain Explorer - Architecture Documentation

## System Architecture

### High-Level Design

The ASI Chain Explorer implements a three-tier architecture:

1. **Data Layer**: PostgreSQL database with normalized schema for blockchain data
2. **API Layer**: Hasura GraphQL Engine providing auto-generated API with real-time capabilities via polling
3. **Presentation Layer**: React-based web application with Apollo Client for data management

### Component Interactions

#### Indexer Service

The indexer service is the core backend component responsible for blockchain data extraction and storage. It is developed in a separate repository (`asi-chain-indexer`, branch `dag_support`) and talks to the ASI Chain node **via gRPC** (the previous Rust-CLI based client has been removed — `feat: remove rust-cli`).

> **DAG-aware design.** The indexer follows the DAG support model: `blocks`
> primary key is `block_hash` (NOT `block_number`), a single `block_number`
> may host multiple blocks (forks), and block parents live in the
> `block_parents` junction table — `blocks` has no `parent_hash` column.

**Key Classes and Modules:**

1. **RustBlockIndexer** (`src/rust_indexer.py`)
   - Primary indexer implementation; the name is kept for compatibility but it now uses the gRPC client (not a Rust CLI)
   - Handles block synchronization, deployment processing, and validator tracking
   - Implements continuous sync loop with configurable interval
   - Processes blocks in batches for optimal performance
   - Walks DAG parents: Each block may have multiple parents (stored in `block_parents`)

2. **GrpcNodeClient** (`src/grpc_node_client.py`)
   - Async wrapper around the ASI Chain node's `DeployServiceV1` gRPC API
   - Streams blocks by height range from `getBlocksByHeights`, fetches `lastFinalizedBlock`, etc.
   - `activeValidators` is fetched over the node's HTTP API (`/api/validators`) because no gRPC RPC exposes it
   - Decodes protobuf manually (`_to_dict`) so genesis deploys with `phloLimit = 2^63-1` don't overflow BIGINT inserts

3. **Database** (`src/database.py`)
   - Manages PostgreSQL connections using asyncpg and SQLAlchemy
   - Provides async context managers for database sessions
   - Handles connection pooling and transaction management
   - Includes methods for state tracking: `get_last_indexed_block()`, `set_last_indexed_block()`

4. **Models** (`src/models.py`)
   - SQLAlchemy ORM models: Block, BlockParent, Deployment, Transfer, Validator, ValidatorBond, BlockValidator, BalanceState, EpochTransition, NetworkStats, IndexerState
   - Includes relationships between entities
   - Defines indices for query optimization
   - Contains computed properties for derived values

5. **MonitoringServer** (`src/monitoring.py`)
   - Exposes Prometheus metrics for operational visibility
   - Provides health check endpoint
   - Tracks indexing progress and performance

6. **IndexerService** (`src/main.py`)
   - Main service orchestrator that coordinates all components
   - Handles startup, shutdown, and signal management
   - Initializes database, gRPC node client, and monitoring server

**Transfer Extraction Patterns:**

The indexer extracts ASI transfers from Rholang deployment terms using multiple regex patterns:

```python
TRANSFER_PATTERNS = [
    # Standard ASIVault transfer with literal address
    r'@vault!\s*\(\s*"transfer"\s*,\s*"([0-9a-zA-Z0-9]{52,56})"\s*,\s*(\d+)\s*,',
    
    # Variable-based transfer
    r'@vault!\s*\(\s*"transfer"\s*,\s*(\w+)\s*,\s*(\d+)\s*,',
    
    # Match pattern with ASI addresses
    r'match\s*\(\s*"([0-9a-zA-Z0-9]{52,56})"\s*,\s*"([0-9a-zA-Z0-9]{52,56})"\s*,\s*(\d+)\s*\)',
    
    # ASIVault findOrCreate pattern
    r'ASIVault!\s*\(\s*"findOrCreate"\s*,\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*(\d+)\s*\)',
]

# Direct transfer pattern for specific deployment formats
DIRECT_TRANSFER_PATTERN = r'match \("(1111[^"]+)", "(1111[^"]+)", (\d+)\)'

# Address binding patterns to resolve variables
ADDRESS_BINDING_PATTERNS = [
    # match "address" { varName =>
    r'match\s*"([0-9a-zA-Z0-9]{54,56})"\s*\{\s*(\w+)\s*=>',
    
    # varName = "address"
    r'(\w+)\s*=\s*"([0-9a-zA-Z0-9]{54,56})"',
    
    # match ("from", "to", amount) { (varFrom, varTo, varAmount) =>
    r'match\s*\(\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*\d+\s*\)\s*\{\s*\((\w+)\s*,\s*(\w+)\s*,\s*\w+\)\s*=>',
]
```

**Deployment Classification:**

Deployments are classified by analyzing their Rholang term content:
- `asi_transfer`: Contains ASIVault and transfer operations
- `validator_operation`: Contains validator or bond operations
- `finalizer_contract`: Contains finalizer operations
- `registry_lookup`: Contains registry lookup operations
- `auction_contract`: Contains auction operations
- `smart_contract`: Default for other contracts
- `genesis_mint`: Genesis ASI allocations
- `genesis_bond`: Genesis validator bonds

### Database Design

#### Database Schema

The system uses PostgreSQL to store all blockchain data with the following core tables. Schema follows the `dag_support` migration
(`asi-chain-indexer/migrations/000_comprehensive_initial_schema.sql`).

**blocks**

Stores blockchain block data with complete metadata. **Primary key:
`block_hash`** — `block_number` is NOT unique (a DAG fork can reuse a height).

Key fields:
- `block_hash` (VARCHAR(64), **PRIMARY KEY**): Block hash
- `block_number` (BIGINT, NOT NULL): Block height (not unique — DAG may have multiple blocks at the same height)
- `timestamp` (BIGINT): Block timestamp in epoch milliseconds
- `proposer` (VARCHAR(160)): Validator public key who proposed the block
- `state_hash` / `state_root_hash` / `pre_state_hash` (VARCHAR(64)): State hashes
- `seq_num` (INTEGER), `sig` (VARCHAR(200)), `sig_algorithm` (VARCHAR(20)), `shard_id` (VARCHAR(20)),
  `extra_bytes` (TEXT), `version` (INTEGER)
- `deployment_count` (INTEGER): Number of deployments in block (kept in sync by trigger)
- `finalization_status` (VARCHAR(20), NOT NULL): `'finalized'` or `'unfinalized'` — real status from node, no default
- `bonds_map` (JSONB): Validator bonds at this block
- `justifications` (JSONB): Block justifications
- `fault_tolerance` (NUMERIC(5,4)): Fault tolerance metric
- `created_at` (TIMESTAMP, default NOW()): When indexed

> **DAG parents**: this table has no `parent_hash` column. Parents live in the `block_parents` junction table (one block → many parents). Use the `parent_links` array relationship in GraphQL.

**block_parents**

DAG junction table — a block may have multiple parents (one row per parent edge).

Key fields:
- `block_hash` (VARCHAR(64), composite PK, FK → `blocks.block_hash` ON DELETE CASCADE): Child block
- `parent_hash` (VARCHAR(64), composite PK, no FK — parent may not be indexed yet): Parent block
- `parent_index` (INTEGER, default 0): Order of this parent among the block's parents
- `created_at` (TIMESTAMP, default NOW())

**deployments**

Stores smart contract deployments and transactions. **Primary key: `deploy_id`.**

Key fields:
- `deploy_id` (VARCHAR(200), PK): Deployment signature
- `block_hash` (VARCHAR(64), FK → `blocks.block_hash` ON DELETE CASCADE): Block containing this deployment
- `block_number` (BIGINT): Block height (denormalised, no FK)
- `deployer` (VARCHAR(200)): Full deployer public key
- `deployer_address` (VARCHAR(150)): ASI address derived from deployer public key
- `term` (TEXT): Rholang code
- `timestamp` (BIGINT): Deployment timestamp in epoch milliseconds
- `sig` (VARCHAR(200)), `sig_algorithm` (VARCHAR(20), default `'secp256k1'`)
- `phlo_cost` (BIGINT), `phlo_price` (BIGINT), `phlo_limit` (BIGINT)
- `valid_after_block_number` (BIGINT)
- `errored` (BOOLEAN): Deployment error status
- `error_message` (TEXT): Error description if errored (sourced from node's `systemDeployError`
  — NULL when no error)
- `deployment_type` (VARCHAR(50)): Classification (asi_transfer, smart_contract, etc.)
- `status` (VARCHAR(20), default `'included'`): **ALWAYS `"included"`** in production —
  the gRPC client hardcodes it because the node's block-stream `DeployInfo` proto
  has no `status` field. Use `errored` + `error_message` to detect failed deploys.
- `seq_num` (INTEGER), `shard_id` (VARCHAR(20))
- `created_at` (TIMESTAMP, default NOW())

**transfers**

Extracted ASI token transfers from deployments. **Primary key: `id`.**

Key fields:
- `id` (BIGSERIAL, PK): Auto-incrementing identifier
- `deploy_id` (VARCHAR(200), FK → `deployments.deploy_id` ON DELETE CASCADE): Source deployment
- `block_hash` (VARCHAR(64), FK → `blocks.block_hash` ON DELETE CASCADE): Block containing the transfer
- `block_number` (BIGINT): Block height (denormalised, no FK)
- `from_address` (VARCHAR(150)): Sender ASI address
- `from_public_key` (VARCHAR(150), NULL when sender is a pure ASI address): Sender public key
- `to_address` (VARCHAR(150)): Recipient address
- `amount_dust` (BIGINT): Amount in dust units (1 ASI = 100,000,000 dust)
- `amount_asi` (NUMERIC(20,8)): Amount in ASI units (8 decimals — NOT bigint)
- `status` (VARCHAR(20), default `'success'`): Production values — `'success'` / `'failed'` /
  `'genesis_mint'` / `'genesis_bond'`
- `timestamp` (BIGINT): Transfer timestamp (epoch ms — when the transfer happened)
- `created_at` (TIMESTAMP): When indexed

**block_validators**

Many-to-many relationship between blocks and validators (justifications).
Composite PK only — **no `id`, no `block_number`, no `role` columns**.

Key fields:
- `block_hash` (VARCHAR(64), composite PK, FK → `blocks.block_hash` ON DELETE CASCADE)
- `validator_public_key` (VARCHAR(200), composite PK): Validator public key who signed/justified

**validators**

Network validators and their staking information.

Key fields:
- `public_key` (VARCHAR(200), PK): Validator public key
- `name` (VARCHAR(160)): Validator name (may store full public key up to 160 chars)
- `total_stake` (BIGINT, default 0): Current staked amount in dust
- `first_seen_block` (BIGINT) / `last_seen_block` (BIGINT)
- `status` (VARCHAR(20), default `'bonded'`): `active` / `bonded` / `quarantine` / `inactive`
- `created_at` / `updated_at` (TIMESTAMP, default NOW())

**validator_bonds**

Historical record of validator stakes at each block.

Key fields:
- `id` (BIGSERIAL, PK)
- `block_hash` (VARCHAR(64), FK → `blocks.block_hash` ON DELETE CASCADE)
- `block_number` (BIGINT, denormalised, no FK)
- `validator_public_key` (VARCHAR(200))
- `stake` (BIGINT, NOT NULL): Bonded amount in dust
- UNIQUE (`block_hash`, `validator_public_key`)

**balance_states**

Address balance tracking with bonded/unbonded separation.

Key fields:
- `id` (BIGSERIAL, PK)
- `address` (VARCHAR(150))
- `block_hash` (VARCHAR(64), FK → `blocks.block_hash` ON DELETE CASCADE)
- `block_number` (BIGINT, denormalised, no FK)
- `unbonded_balance_asi` (NUMERIC(20,8)) / `unbonded_balance_dust` (BIGINT): Liquid balance
- `bonded_balance_asi` (NUMERIC(20,8)) / `bonded_balance_dust` (BIGINT): Staked balance
- `total_balance_asi` / `total_balance_dust` (GENERATED ALWAYS AS `unbonded + bonded` STORED)
- `updated_at` (TIMESTAMP)
- UNIQUE (`address`, `block_hash`)

**network_stats**

Network-wide statistics captured at specific blocks.

Key fields:
- `id` (BIGSERIAL, PK)
- `block_number` (BIGINT)
- `total_validators` / `active_validators` (INTEGER)
- `validators_in_quarantine` (INTEGER, default 0)
- `consensus_participation` (NUMERIC(5,2), NOT NULL)
- `consensus_status` (VARCHAR(20), NOT NULL)
- `timestamp` (**SQL TIMESTAMP**, default `CURRENT_TIMESTAMP` — NOT bigint epoch)

**epoch_transitions**

Track epoch transitions and validator set changes. ⚠️ Schema exists but the
current indexer does NOT populate this table.

Key fields:
- `id` (BIGSERIAL, PK)
- `epoch_number` (BIGINT, UNIQUE)
- `start_block` (BIGINT) / `end_block` (BIGINT)
- `active_validators` (INTEGER) / `quarantine_length` (INTEGER)
- `timestamp` (TIMESTAMP, default `CURRENT_TIMESTAMP`)

**indexer_state**

Indexer operational state (key-value): `last_indexed_block`, `indexer_version`, `schema_version`.

Key fields:
- `key` (VARCHAR(50), PK)
- `value` (TEXT)
- `updated_at` (TIMESTAMP)

**network_metrics_buckets**

Pre-aggregated metrics buckets consumed by `get_network_metrics` (fast path).

Key fields:
- `bucket_start` (timestamptz, PK)
- `bucket_end` (timestamptz, NOT NULL)
- `avg_block_time_sec` (numeric)
- `deployments_count` (BIGINT, default 0)
- `transfers_count` (BIGINT, default 0)
- Index: `(bucket_start, bucket_end)`

#### Normalization and Relationships

The database schema follows third normal form with the following relationship
structure (DAG-aware — `block_hash` is the canonical PK for `blocks`,
`block_number` is denormalised on children for query convenience):

```
blocks (1) ←→ (N) deployments         via block_hash
blocks (1) ←→ (N) transfers          via block_hash
blocks (1) ←→ (N) validator_bonds    via block_hash
blocks (1) ←→ (N) balance_states     via block_hash
blocks (1) ←→ (N) block_validators   via block_hash
blocks (1) ←→ (N) network_stats       via block_number (denormalised)
deployments (1) ←→ (N) transfers      via deploy_id
validators (1) ←→ (N) validator_bonds  manual, public_key -> validator_public_key
validators (1) ←→ (N) block_validators manual, public_key -> validator_public_key
validators (1) ←→ (N) transfers_sent   manual, public_key -> from_public_key
blocks (1) ←→ (N) block_parents       via block_hash (child side, parent_links)
blocks (1) ←→ (N) block_parents       manual, block_hash -> parent_hash (child side, child_links)
```

#### Views

The schema exposes several read-only views tracked in Hasura:

- **`network_stats_view`** — analytics over the last 100 non-genesis blocks:
  `total_blocks`, `avg_block_time_seconds`, `earliest_block_time`, `latest_block_time`.
- **`transaction_history_view`** — `deployments LEFT JOIN transfers`, one row
  per transfer (or one row per deployment that produced no transfer). Hasura-tracked
  with `allow_aggregations: true` (used as a paginated wallet-history source).
- **`block_ancestors_view` / `block_descendants_view`** — schema-holder views
  (return 0 rows themselves) that type the return of the `get_block_ancestors`
  / `get_block_descendants` SQL functions.
- **`network_metrics_view`** — schema-holder composite type for the return of
  `get_network_metrics`. Returns 0 rows by itself — call `get_network_metrics()`.

#### SQL Functions

Tracked in Hasura as custom GraphQL fields (with public EXECUTE permission):

- **`get_block_ancestors(p_block_hash varchar)`** → `SETOF block_ancestors_view`.
  Recursive CTE walking `block_parents` upward. `UNION`-deduplicated, no cycle guard.
- **`get_block_descendants(p_block_hash varchar)`** → `SETOF block_descendants_view`.
  Symmetric to ancestors, walks `block_parents` downward.
- **`get_network_metrics(p_range_hours int = 24, p_divisions int = 7)`**
  → `SETOF network_metrics_view`. Hybrid: if `network_metrics_buckets` has data,
  reads pre-aggregated buckets (fast); otherwise computes from raw
  `blocks`/`deployments`/`transfers` (slow fallback).
- **`refresh_network_metrics_buckets(p_lookback_hours int = 720, p_bucket_seconds int = 600)`**
  → `void`. Cron-friendly incremental refresh. Should be called on a schedule
  (e.g. every 10 min) — otherwise `get_network_metrics` falls back to the slow path.

#### Key Design Decisions

1. **Block as Primary Entity, DAG-aware**: `blocks` is keyed by `block_hash`
   (not `block_number`). A single `block_number` may have multiple blocks
   (DAG forks). All other entities reference blocks through `block_hash`
   (`block_number` is denormalised for query convenience only).
2. **Multi-parent DAG**: parents live in the `block_parents` junction table
   (one block → many parents). The `parent_hash` column has no FK constraint
   because a parent may not be indexed yet when its children arrive.
3. **Flexible Validator Keys**: Validator public keys stored as VARCHAR(200) to
   accommodate full-length keys (130 characters) with room for abbreviated formats
4. **JSONB for Complex Data**: Bonds map and justifications stored as JSONB for flexibility and efficient querying
5. **Computed Columns**: Total balances in balance_states calculated using PostgreSQL GENERATED ALWAYS AS for automatic calculation
6. **Pre-aggregated metrics**: `network_metrics_buckets` + `get_network_metrics`
   avoid re-scanning raw tables on every dashboard request
7. **Comprehensive Indexing**: Indices on:
   - All foreign keys
   - Timestamp fields for chronological queries
   - Hash fields with varchar_pattern_ops for prefix searches
   - Status and type fields for filtering
   - Address fields for transfer lookups

#### Transaction Guarantees

All block processing occurs within database transactions to ensure atomicity. If any operation fails during block processing, the entire block transaction is rolled back, maintaining database consistency.

### GraphQL API Layer

#### Hasura Configuration

Hasura is configured by the indexer's `scripts/full-init-hasura.sh` (run from
`deploy.sh` after the containers come up). It:

1. Auto-tracks all tables, the analytics views, and the SQL functions (with
   public EXECUTE permissions on the functions).
2. Creates both FK-based and manual relationships (manual relationships are
   used where the parent row may not exist yet — e.g. `block_parents.parent_hash`,
   or where there is no FK constraint — e.g. `validators` ↔ `validator_bonds`).
3. Enables query subscriptions with the polling mechanism.
4. Provides role-based access control. **The `public` role (the unauthorized
   role, set by `HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public`) gets SELECT on
   every tracked table/view with `limit: 5000`.** Aggregate queries
   (`<table>_aggregate { aggregate { count } }`, `sum`, `avg`, etc.) are
   **only enabled for `deployments`, `transfers` and `transaction_history_view`**
   (`allow_aggregations: true`). All other tables/views keep
   `allow_aggregations: false` — calling `<table>_aggregate` on them returns
   `validation-failed` for the public role, which is what the explorer's
   transactions page was hitting before the indexer was reconfigured. The
   deploy self-test in `deploy.sh` verifies this split.

> **Frontend implication.** Anonymous (no admin-secret) callers can issue
> count-style aggregates only against `deployments`, `transfers`, and
> `transaction_history_view`. Any new count-style query in the explorer that
> targets another table (e.g. `blocks_aggregate`, `validators_aggregate`)
> must either be admin-authenticated, or the indexer's
> `AGGREGATE_ENABLED_TABLES` list in `full-init-hasura.sh` must be extended.

Configuration in docker-compose.yml:
- `HASURA_GRAPHQL_LIVE_QUERIES_MULTIPLEXED_REFETCH_INTERVAL`: 500ms
- `HASURA_GRAPHQL_LIVE_QUERIES_MULTIPLEXED_BATCH_SIZE`: 100
- `HASURA_GRAPHQL_STREAMING_QUERIES_MULTIPLEXED_REFETCH_INTERVAL`: 500ms
- `HASURA_GRAPHQL_STREAMING_QUERIES_MULTIPLEXED_BATCH_SIZE`: 100
- `HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES`: true (for JavaScript number compatibility)

#### Query Optimization

Hasura implements several optimizations:

1. **Query Multiplexing**: Batches similar queries for efficiency
2. **Polling-based Updates**: Uses periodic database queries for live data
3. **Connection Pooling**: Reuses database connections
4. **Query Depth Limiting**: Prevents overly complex nested queries

#### Real-time Updates

The system provides real-time updates through Apollo Client's polling mechanism. The frontend configures appropriate polling intervals based on data freshness requirements. Database triggers (notify_new_block, notify_new_transfer) are available but polling is the primary method for updates.

### Frontend Architecture

#### Component Hierarchy

```
App
├── Layout (Navigation, Header)
│   ├── HomePage
│   │   ├── NetworkDashboard
│   │   ├── RecentTransactionsExporter
│   │   └── RealtimeActivityFeed
│   ├── BlocksPage
│   │   └── BlockCard (list)
│   ├── BlockDetailPage
│   │   ├── BlockVisualization
│   │   └── TransactionTracker
│   ├── TransactionsPage
│   │   └── TransactionTrackerImproved
│   ├── TransactionDetailPage
│   ├── TransfersPage
│   ├── ValidatorsPage
│   │   └── StatsCard (list)
│   ├── ValidatorHistoryPage
│   ├── StatisticsPage
│   ├── DeploymentsPage
│   ├── SearchResultsPage
│   ├── IndexerStatusPage
│   ├── WalletSearch
│   ├── AdvancedSearch
│   └── Logo
└── ConnectionStatus
```

#### State Management

Apollo Client manages all application state:

1. **Normalized Cache**: Entities cached by their primary key
2. **Cache Policies**: Configured per query for optimal performance
3. **Polling Integration**: Regular queries for data updates
4. **Type Policies**: Defined for blocks, deployments, and validators

Cache configuration from apollo-client.ts:

```typescript
typePolicies: {
  blocks: {
    keyFields: ['block_number'],   // ⚠ NOTE: actual PK is block_hash (DAG-aware);
                                      //   block_number is NOT unique and can collide across forks.
                                      //   Consider switching this to ['block_hash'] to avoid cache
                                      //   collisions when the same height has multiple blocks.
  },
  deployments: {
    keyFields: ['deploy_id'],
  },
  validators: {
    keyFields: ['public_key'],
  },
}
```

#### Real-time Data Flow

1. Component executes GraphQL query/subscription
2. Apollo Client fetches data from Hasura
3. Polling mechanism triggers periodic refetch
4. On new data, Apollo Client updates cache
5. React components automatically re-render with new data

### Performance Considerations

#### Indexer Performance

1. **Batch Processing**: Processes up to 100 blocks (configurable) in single database transaction
2. **Async Operations**: All I/O operations are asynchronous using asyncio
3. **Connection Pooling**: Maintains pool of 20 database connections (configurable)
4. **Incremental Sync**: Only fetches new blocks since last sync
5. **Rate Limiting**: Small delays (0.1s) between block fetches to avoid overwhelming node

#### Database Performance

1. **Strategic Indexing**: Indices on all foreign keys and frequently queried columns
2. **JSONB Indexing**: GIN indices on JSONB columns for fast lookups
3. **Partial Indices**: Pattern-matching indices for hash lookups using varchar_pattern_ops
4. **Generated Columns**: Automatic calculation of total balances
5. **Triggers**: Automatic deployment count updates and notification system

#### Frontend Performance

1. **Code Splitting**: Routes lazy-loaded for faster initial load
2. **Query Batching**: Apollo batches multiple queries
3. **Pagination**: Large lists paginated to reduce data transfer
4. **Virtual Scrolling**: react-window used for very large lists
5. **Memoization**: Expensive computations cached with useMemo and memo
6. **Fragment-based Queries**: Reusable fragments reduce query complexity
7. **Polling Optimization**: Configurable intervals based on data freshness needs

### Scalability

#### Horizontal Scaling

1. **Indexer**: Could run multiple instances with block range partitioning (not currently implemented)
2. **Hasura**: Stateless, can run multiple instances behind load balancer
3. **Frontend**: Static files served from CDN

#### Vertical Scaling

1. **Database**: Primary bottleneck, scales with hardware
2. **Connection Pooling**: Adjustable pool size based on load (DATABASE_POOL_SIZE)
3. **Batch Size**: Configurable to balance throughput and latency (BATCH_SIZE)

### Security

#### Authentication

- Hasura admin secret required for mutations
- Public read access for queries and subscriptions
- Environment-based configuration prevents secret exposure

#### Data Validation

1. **Pydantic Models**: Validate all configuration in config.py
2. **SQLAlchemy Constraints**: Enforce data integrity at database level
3. **Type Safety**: TypeScript ensures type correctness in frontend

#### Network Security

1. **CORS Configuration**: Restricts API access to allowed origins (configured as "*" in development)
2. **HTTPS**: Should be configured for production deployments
3. **Rate Limiting**: Can be configured at nginx/reverse proxy level

### Monitoring and Observability

#### Metrics Collection

Indexer exposes Prometheus metrics:

- Counter: Blocks processed, errors encountered
- Gauge: Current block height, blocks behind
- Histogram: Block processing time distribution

#### Logging

Structured logging with structlog configured in main.py:

- JSON format for production (configurable via LOG_FORMAT)
- Text format for development
- Log levels: DEBUG, INFO, WARNING, ERROR

#### Health Checks

Monitoring server provides health endpoints:

- `/health`: Overall system health
- `/metrics`: Prometheus metrics endpoint

Health check includes:
- Last indexed block number
- Blocks behind chain tip
- Database connection status
- Node connection status

### Error Handling and Resilience

#### Indexer Error Recovery

1. **Retry Logic**: tenacity library used for retry with exponential backoff
2. **Transaction Rollback**: Failed block processing rolled back atomically
3. **State Persistence**: Last indexed block persisted in indexer_state table for recovery
4. **Health Monitoring**: Prometheus alerts on sustained errors

#### Frontend Error Handling

1. **Error Boundaries**: Catch component errors gracefully (AnimatePresenceWrapper)
2. **Query Error Policies**: Configure retry and fallback behavior in Apollo Client
3. **Polling Recovery**: Automatic restart of polling on connection recovery
4. **Offline Support**: Graceful degradation when API unavailable

### Data Synchronization Process

#### Block Sync Cycle

1. Get current state from database (last_indexed_block)
2. Query node for latest finalized block
3. Calculate batch range (start = last_indexed + 1, end = min(start + batch_size, latest))
4. Fetch block summaries using `get_blocks_by_height()`
5. For each block summary:
   - Fetch full block details using `get_block_details()`
   - Process block in database transaction
   - Extract and store deployments
   - Extract and store transfers
   - Update validator information
6. Update last_indexed_block in database
7. Sleep for SYNC_INTERVAL seconds
8. Repeat

#### Additional Background Tasks

Every N blocks, the indexer performs:

- Validator state updates (using `get_bonds()` and `get_active_validators()`)
- Epoch transition checks (every 100 blocks)
- Network statistics updates (every 50 blocks)
- Main chain verification (every 500 blocks)

### Genesis Block Handling

The indexer has special handling for block 0 (genesis block):

1. Extracts genesis data from blockchain state
2. Creates synthetic deployments for genesis allocations
3. Creates synthetic transfers representing initial funding
4. Initializes balance_states for genesis addresses
5. Records genesis validator bonds

Genesis data extraction uses `_extract_genesis_from_state()` which:
- Parses validator bonds from genesis block bonds_map
- Attempts to resolve full validator keys from early blocks
- Falls back to abbreviated keys if full keys not found
