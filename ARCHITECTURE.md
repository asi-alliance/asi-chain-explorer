# ASI Chain Explorer - Architecture Documentation

## System Architecture

### High-Level Design

The ASI Chain Explorer implements a three-tier architecture:

1. **Data Layer**: PostgreSQL database with normalized schema for blockchain data
2. **API Layer**: Hasura GraphQL Engine providing auto-generated API with real-time capabilities
3. **Presentation Layer**: React-based web application with Apollo Client for data management

### Component Interactions

#### Indexer Service

The indexer service is the core backend component responsible for blockchain data extraction and storage.

**Key Classes and Modules:**

1. **RustBlockIndexer** (`rust_indexer.py`)
   - Primary indexer implementation using Rust CLI client
   - Handles block synchronization, deployment processing, and validator tracking
   - Implements continuous sync loop with configurable interval
   - Processes blocks in batches for optimal performance
   - Methods: `start()`, `stop()`, `_sync_blocks()`, `_process_block()`, `_process_deployment_enhanced()`, `_extract_transfers()`, `_process_validators()`, `_update_validator_states()`, `_check_epoch_transitions()`, `_update_network_stats()`, `_verify_main_chain()`

2. **RustCLIClient** (`rust_cli_client.py`)
   - Wrapper around Rust CLI executable for blockchain operations
   - Provides async methods for all blockchain queries
   - Handles command execution, output parsing, and error handling
   - Implements health checks and connection verification
   - Methods: `get_last_finalized_block()`, `get_blocks_by_height()`, `get_block_details()`, `get_deploy_info()`, `get_bonds()`, `get_active_validators()`, `get_epoch_info()`, `show_block_deploys()`, `get_network_consensus()`, `show_main_chain()`, `health_check()`

3. **Database** (`database.py`)
   - Manages PostgreSQL connections using asyncpg and SQLAlchemy
   - Provides async context managers for database sessions
   - Handles connection pooling and transaction management
   - Includes methods for state tracking: `get_last_indexed_block()`, `set_last_indexed_block()`

4. **Models** (`models.py`)
   - SQLAlchemy ORM models: Block, Deployment, Transfer, Validator, ValidatorBond, BalanceState, EpochTransition, NetworkStats, IndexerState, BlockValidator
   - Includes relationships between entities
   - Defines indices for query optimization
   - Contains computed properties for derived values

5. **MonitoringServer** (`monitoring.py`)
   - Exposes Prometheus metrics for operational visibility
   - Provides health check endpoint
   - Tracks indexing progress and performance

6. **IndexerService** (`main.py`)
   - Main service orchestrator that coordinates all components
   - Handles startup, shutdown, and signal management
   - Initializes database, Rust CLI client, and monitoring server

**Transfer Extraction Patterns:**

The indexer extracts REV transfers from Rholang deployment terms using multiple regex patterns:

```python
TRANSFER_PATTERNS = [
    # Standard RevVault transfer with literal address
    r'@vault!\s*\(\s*"transfer"\s*,\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*(\d+)\s*,',
    
    # Variable-based transfer
    r'@vault!\s*\(\s*"transfer"\s*,\s*(\w+)\s*,\s*(\d+)\s*,',
    
    # Match pattern with REV addresses
    r'match\s*\(\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*(\d+)\s*\)',
    
    # RevVault findOrCreate pattern
    r'RevVault!\s*\(\s*"findOrCreate"\s*,\s*"([0-9a-zA-Z0-9]{54,56})"\s*,\s*(\d+)\s*\)',
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
- `rev_transfer`: Contains RevVault and transfer operations
- `validator_operation`: Contains validator or bond operations
- `finalizer_contract`: Contains finalizer operations
- `registry_lookup`: Contains registry lookup operations
- `auction_contract`: Contains auction operations
- `smart_contract`: Default for other contracts
- `genesis_mint`: Genesis REV allocations
- `genesis_bond`: Genesis validator bonds

### Database Design

#### Normalization and Relationships

The database schema follows third normal form with the following relationship structure:

```
blocks (1) ←→ (N) deployments
blocks (1) ←→ (N) validator_bonds
blocks (1) ←→ (N) balance_states
deployments (1) ←→ (N) transfers
validators (1) ←→ (N) validator_bonds
```

#### Key Design Decisions

1. **Block as Primary Entity**: All other entities reference blocks through `block_number` or `block_hash`

2. **Flexible Validator Keys**: Validator public keys stored as VARCHAR(200) to accommodate full-length keys (130 characters) with room for abbreviated formats

3. **JSONB for Complex Data**: Bonds map and justifications stored as JSONB for flexibility and efficient querying

4. **Computed Columns**: Total balances in balance_states calculated using PostgreSQL GENERATED ALWAYS AS for automatic calculation

5. **Comprehensive Indexing**: Indices on:
   - All foreign keys
   - Timestamp fields for chronological queries
   - Hash fields with varchar_pattern_ops for prefix searches
   - Status and type fields for filtering
   - Address fields for transfer lookups

#### Transaction Guarantees

All block processing occurs within database transactions to ensure atomicity. If any operation fails during block processing, the entire block transaction is rolled back, maintaining database consistency.

### GraphQL API Layer

#### Hasura Configuration

Hasura is configured to:

1. Auto-track all tables in the public schema
2. Create relationships based on foreign keys
3. Enable real-time subscriptions via WebSockets
4. Provide role-based access control
5. Expose public read access for queries and subscriptions

Configuration in docker-compose.yml:
- `HASURA_GRAPHQL_LIVE_QUERIES_MULTIPLEXED_REFETCH_INTERVAL`: 500ms
- `HASURA_GRAPHQL_LIVE_QUERIES_MULTIPLEXED_BATCH_SIZE`: 100
- `HASURA_GRAPHQL_STREAMING_QUERIES_MULTIPLEXED_REFETCH_INTERVAL`: 500ms
- `HASURA_GRAPHQL_STREAMING_QUERIES_MULTIPLEXED_BATCH_SIZE`: 100
- `HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES`: true (for JavaScript number compatibility)

#### Query Optimization

Hasura implements several optimizations:

1. **Query Multiplexing**: Batches similar queries for efficiency
2. **Live Query Optimization**: Uses LISTEN/NOTIFY for real-time updates
3. **Connection Pooling**: Reuses database connections
4. **Query Depth Limiting**: Prevents overly complex nested queries

#### Real-time Subscriptions

Subscriptions use PostgreSQL NOTIFY mechanism implemented via triggers:

- `notify_new_block()`: Triggered on INSERT to blocks table
- `notify_new_transfer()`: Triggered on INSERT to transfers table

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
3. **Subscription Integration**: Real-time updates merged into cache
4. **Type Policies**: Defined for blocks, deployments, and validators

Cache configuration from apollo-client.ts:

```typescript
typePolicies: {
  blocks: {
    keyFields: ['block_number'],
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

1. Component subscribes to GraphQL subscription
2. Hasura listens for PostgreSQL notifications
3. On new data, Hasura pushes update via WebSocket
4. Apollo Client receives update and updates cache
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
5. **Triggers**: Automatic deployment count updates and real-time notifications

#### Frontend Performance

1. **Code Splitting**: Routes lazy-loaded for faster initial load
2. **Query Batching**: Apollo batches multiple queries
3. **Pagination**: Large lists paginated to reduce data transfer
4. **Virtual Scrolling**: react-window used for very large lists
5. **Memoization**: Expensive computations cached with useMemo and memo
6. **Fragment-based Queries**: Reusable fragments reduce query complexity

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
3. **Connection Recovery**: Automatic WebSocket reconnection
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
