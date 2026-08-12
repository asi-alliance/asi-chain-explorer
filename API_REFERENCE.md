# API Reference

Complete reference for the ASI Chain Explorer GraphQL API.

## Base URL

```
HTTP Endpoint:  http://localhost:8080/v1/graphql
Console:        http://localhost:8080/console
```

## Authentication

For production deployments, include the Hasura admin secret in request headers:

```http
x-hasura-admin-secret: your-admin-secret-here
```

For public read access, Hasura must be configured with an unauthorized role
`public` (`HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public`). The indexer setup script
(`scripts/full-init-hasura.sh` in the indexer repo) grants the `public` role
SELECT on every tracked table/view with `limit: 5000`, plus EXECUTE on the
tracked SQL functions. **Aggregate queries (`<table>_aggregate { ... }`) are
only enabled for `deployments`, `transfers`, and `transaction_history_view`**
(`allow_aggregations: true`). All other tables/views keep
`allow_aggregations: false` — calling `<table>_aggregate` on them returns a
`validation-failed` error for the public role. If the explorer frontend hits
such an aggregate, it stays anonymous and the request fails silently
(Apollo `errorPolicy: "ignore"`) — keep that in mind when adding new
count-style queries.

## GraphQL Schema

> **DAG-aware schema.** This indexer follows the `dag_support` schema:
> `blocks` primary key is `block_hash` (NOT `block_number`). A single
> `block_number` may have multiple blocks (fork). Block parents live in the
> `block_parents` junction table — `blocks` has no `parent_hash` column.

### Types

#### blocks

Represents a blockchain block with all associated metadata. **Primary key:
`block_hash`** — `block_number` is NOT unique (a DAG fork can reuse a height).

```graphql
type blocks {
  block_hash: String!
  block_number: bigint!
  timestamp: bigint!
  proposer: String!
  state_hash: String
  state_root_hash: String
  pre_state_hash: String
  seq_num: Int
  sig: String
  sig_algorithm: String
  shard_id: String
  extra_bytes: String
  version: Int
  deployment_count: Int
  finalization_status: String!
  bonds_map: jsonb
  justifications: jsonb
  fault_tolerance: numeric
  created_at: timestamp!

  # Relationships
  deployments: [deployments!]!            # via block_hash
  transfers: [transfers!]!                # via block_hash
  validator_bonds: [validator_bonds!]!     # via block_hash
  block_validators: [block_validators!]!   # via block_hash
  balance_states: [balance_states!]!       # via block_hash
  network_stats: [network_stats!]!         # via block_number
  parent_links: [block_parents!]!          # rows where this block is the child
  child_links: [block_parents!]!           # rows where this block is the parent
}
```

> There is no `parent_hash` column. Use the `parent_links` array relationship
> to navigate up the DAG, or `get_block_ancestors` / `get_block_descendants`
> for transitive traversal.

#### block_parents

DAG junction table — a block may have multiple parents.

```graphql
type block_parents {
  block_hash: String!    # child block (FK -> blocks.block_hash, ON DELETE CASCADE)
  parent_hash: String!   # parent block (no FK — parent may not be indexed yet)
  parent_index: Int!
  created_at: timestamp!

  # Relationships
  child_block: blocks!     # via block_hash
  parent_block: blocks!    # manual, via parent_hash -> block_hash
}
```
Composite PK: `(block_hash, parent_hash)`.

#### deployments

Smart contract deployment / transaction. **Primary key: `deploy_id`.**

```graphql
type deployments {
  deploy_id: String!
  block_hash: String!
  block_number: bigint!
  deployer: String!               # full public key
  deployer_address: String!       # ASI address derived from deployer public key
  term: String!                   # Rholang source
  timestamp: bigint!              # epoch ms
  sig: String!
  sig_algorithm: String
  phlo_price: bigint
  phlo_limit: bigint
  phlo_cost: bigint
  valid_after_block_number: bigint
  errored: Boolean
  error_message: String           # NULL when no error; from node's systemDeployError
  deployment_type: String
  seq_num: Int
  shard_id: String
  status: String                  # ALWAYS "included" in production (no lifecycle RPC)
  created_at: timestamp!

  # Relationships
  block: blocks!                  # via block_hash
  transfers: [transfers!]!        # via deploy_id
}
```

> `status` is hardcoded to `"included"` by the gRPC client (the node's
> `DeployInfo` proto has no status field). Use `errored` + `error_message` to
> detect failed deploys.

#### transfers

ASI token transfer extracted from a deployment. **Primary key: `id`.**

```graphql
type transfers {
  id: bigint!
  deploy_id: String!
  block_hash: String!
  block_number: bigint!
  from_address: String!
  from_public_key: String         # NULL when sender is a pure ASI address
  to_address: String!
  amount_dust: bigint!
  amount_asi: numeric!
  status: String                  # "success" | "failed" | "genesis_mint" | "genesis_bond"
  timestamp: bigint!             # epoch ms (when the transfer happened)
  created_at: timestamp!         # when indexed

  # Relationships
  deployment: deployments!        # via deploy_id
  block: blocks!                 # via block_hash
  sender_validator: validators   # manual, via from_public_key -> public_key
}
```

#### validators

```graphql
type validators {
  public_key: String!
  name: String                    # may hold full public key (up to 160 chars)
  total_stake: bigint
  first_seen_block: bigint
  last_seen_block: bigint
  status: String                  # "active" | "bonded" | "quarantine" | "inactive"
  created_at: timestamp!
  updated_at: timestamp!

  # Relationships
  validator_bonds: [validator_bonds!]!     # manual, public_key -> validator_public_key
  block_validators: [block_validators!]!  # manual, public_key -> validator_public_key
  transfers_sent: [transfers!]!           # manual, public_key -> from_public_key
}
```

#### validator_bonds

```graphql
type validator_bonds {
  id: bigint!
  block_hash: String!
  block_number: bigint!
  validator_public_key: String!
  stake: bigint!                  # in dust

  # Relationships
  block_by_hash: blocks!          # via block_hash
  validator: validators!          # manual
  # UNIQUE (block_hash, validator_public_key)
}
```

#### block_validators

Many-to-many between blocks and validators (justifications). **Composite PK
only — no `id`, no `block_number`, no `role` columns.**

```graphql
type block_validators {
  block_hash: String!            # FK -> blocks.block_hash (CASCADE)
  validator_public_key: String!

  # Relationships
  block: blocks!                 # via block_hash
  validator: validators!         # manual, validator_public_key -> public_key
}
```

#### balance_states

Address balance snapshot with bonded/unbonded split.

```graphql
type balance_states {
  id: bigint!
  address: String!
  block_hash: String!
  block_number: bigint!
  unbonded_balance_dust: bigint!
  unbonded_balance_asi: numeric!
  bonded_balance_dust: bigint!
  bonded_balance_asi: numeric!
  total_balance_dust: bigint!    # GENERATED ALWAYS AS (unbonded + bonded) STORED
  total_balance_asi: numeric!    # GENERATED ALWAYS AS (unbonded + bonded) STORED
  updated_at: timestamp!
  # UNIQUE (address, block_hash)

  # Relationships
  block: blocks!                 # via block_hash
}
```

#### network_stats

```graphql
type network_stats {
  id: bigint!
  block_number: bigint!
  total_validators: Int!
  active_validators: Int!
  validators_in_quarantine: Int
  consensus_participation: numeric!
  consensus_status: String!
  timestamp: timestamp!         # SQL TIMESTAMP (not bigint epoch)
}
```

#### epoch_transitions

⚠️ Schema exists but the current indexer does NOT populate this table.

```graphql
type epoch_transitions {
  id: bigint!
  epoch_number: bigint!
  start_block: bigint!
  end_block: bigint!
  active_validators: Int!
  quarantine_length: Int!
  timestamp: timestamp!
}
```

#### indexer_state

Key-value store of indexer sync metadata (`last_indexed_block`, etc.).

```graphql
type indexer_state {
  key: String!
  value: String!
  updated_at: timestamp!
}
```

### Views

Tracking-only views exposed via GraphQL (read-only).

#### network_stats_view

Analytics over the last 100 non-genesis blocks: `total_blocks`,
`avg_block_time_seconds`, `earliest_block_time`, `latest_block_time`.

```graphql
type network_stats_view {
  total_blocks: bigint
  avg_block_time_seconds: numeric
  earliest_block_time: bigint
  latest_block_time: bigint
}
```

#### block_ancestors_view / block_descendants_view

Schema-holder views (return 0 rows themselves) that type the output of the
`get_block_ancestors` / `get_block_descendants` SQL functions.

```graphql
type block_ancestors_view {
  ancestor_hash: String
  ancestor_number: bigint
  depth: Int
}

type block_descendants_view {
  descendant_hash: String
  descendant_number: bigint
  depth: Int
}
```

#### network_metrics_view

Schema-holder view (composite type) for `get_network_metrics`'s return.
Returns 0 rows by itself — call `get_network_metrics()` instead.
Columns: `bucket_start` (timestamptz), `bucket_end` (timestamptz),
`avg_block_time_seconds` (numeric), `avg_tps` (numeric),
`deployments_count` (bigint), `transfers_count` (bigint).

#### transaction_history_view

Combined wallet transaction history — `deployments LEFT JOIN transfers`,
one row per transfer, or one row per deployment that produced no transfer.
Hasura-tracked with public SELECT (`limit: 5000`,
**`allow_aggregations: true`**) — this is the only view (alongside the
`deployments` and `transfers` tables) where public aggregate queries work.

```graphql
type transaction_history_view {
  transfer_id: bigint            # NULL when type = "not_transfer"
  deploy_id: String!
  block_hash: String!
  block_number: bigint!
  timestamp: bigint!             # deployment timestamp (epoch ms)
  type: String!                  # "transfer" | "not_transfer"
  deployer_address: String!
  from_address: String           # NULL when type = "not_transfer"
  to_address: String
  from_public_key: String
  amount_asi: numeric
  status: String                 # transfer status; NULL when type = "not_transfer"
}
```

### SQL Functions (callable GraphQL fields)

These are tracked in Hasura as custom GraphQL fields with public EXECUTE
permissions. Use them as top-level query fields.

| Field | Signature | Description |
|---|---|---|
| `get_block_ancestors` | `(p_block_hash: String!)` → `[block_ancestors_view]` | Recursively returns all ancestor blocks by walking `block_parents` (`UNION`-deduplicated, no cycle guard). |
| `get_block_descendants` | `(p_block_hash: String!)` → `[block_descendants_view]` | Recursively returns all descendant blocks (symmetric to ancestors). |
| `get_network_metrics` | `(p_range_hours: Int = 24, p_divisions: Int = 7)` → `[network_metrics_view]` | Hybrid: reads pre-aggregated `network_metrics_buckets` (fast) or falls back to raw `blocks`/`deployments`/`transfers` aggregation (slow). |
| `refresh_network_metrics_buckets` | `(p_lookback_hours: Int = 720, p_bucket_seconds: Int = 600)` → `void` | Cron-friendly incremental refresh of `network_metrics_buckets`. Not normally called from GraphQL — run via psql/cron. |

```graphql
query Ancestors($hash: String!) {
  get_block_ancestors(p_block_hash: $hash) {
    ancestor_hash
    ancestor_number
    depth
  }
}
```

## Queries

### Get Latest Blocks

```graphql
query GetLatestBlocks($limit: Int = 10, $offset: Int = 0) {
  blocks(
    limit: $limit
    offset: $offset
    order_by: { block_number: desc }
  ) {
    block_number
    block_hash
    timestamp
    proposer
    deployment_count
    state_hash
    pre_state_hash
    state_root_hash
    bonds_map
    fault_tolerance
    finalization_status
    # DAG parents — there is no parent_hash column on blocks
    parent_links {
      parent_index
      parent_block {
        block_hash
        block_number
      }
    }
    deployments {
      deploy_id
      deployer
      deployer_address
      term
      timestamp
      deployment_type
      phlo_cost
      errored
    }
  }
}
```

### Search Blocks by Hash

```graphql
query SearchBlocksByHash($search: String!, $limit: Int = 10, $offset: Int = 0) {
  blocks(
    limit: $limit
    offset: $offset
    order_by: { block_number: desc }
    where: {
      block_hash: { _ilike: $search }
    }
  ) {
    block_number
    block_hash
    timestamp
    deployment_count
  }
}
```

### Get Block Details

> `block_number` is NOT unique in a DAG — a fork can have multiple blocks at
> the same height. Querying by `block_number` returns a list; for a specific
> block, query by `block_hash` instead.

```graphql
query GetBlockDetails($blockHash: String!) {
  blocks(where: { block_hash: { _eq: $blockHash } }) {
    block_number
    block_hash
    timestamp
    proposer
    state_hash
    state_root_hash
    pre_state_hash
    deployment_count
    bonds_map
    justifications
    fault_tolerance
    finalization_status
    # DAG parents (multiple)
    parent_links {
      parent_index
      parent_block {
        block_hash
        block_number
      }
    }
    # DAG children (blocks that list this block as a parent)
    child_links {
      child_block {
        block_hash
        block_number
      }
    }
    deployments {
      deploy_id
      deployer
      deployer_address
      term
      deployment_type
      phlo_cost
      phlo_price
      phlo_limit
      errored
      error_message
      status
      transfers {
        id
        from_address
        to_address
        amount_asi
        amount_dust
        status
      }
    }
  }
}
```

### Get Block by Height (DAG-aware)

```graphql
query GetBlocksByHeight($height: bigint!) {
  blocks(where: { block_number: { _eq: $height } }) {
    block_hash
    block_number
    timestamp
    proposer
    finalization_status
  }
}
```

### Get Block Ancestors / Descendants (DAG traversal)

```graphql
query GetBlockAncestors($blockHash: String!) {
  get_block_ancestors(p_block_hash: $blockHash) {
    ancestor_hash
    ancestor_number
    depth
  }
}

query GetBlockDescendants($blockHash: String!) {
  get_block_descendants(p_block_hash: $blockHash) {
    descendant_hash
    descendant_number
    depth
  }
}
```

### Get All Transfers

```graphql
query GetAllTransfers($limit: Int = 50, $offset: Int = 0) {
  transfers(
    limit: $limit
    offset: $offset
    order_by: { created_at: desc }
  ) {
    id
    deploy_id
    block_hash
    block_number
    from_address
    from_public_key
    to_address
    amount_asi
    amount_dust
    status
    timestamp
    created_at
    deployment {
      deploy_id
      block_number
      timestamp
      errored
    }
  }
}
```

### Get Address Transfers

```graphql
query GetAddressTransfers($address: String!, $limit: Int = 20) {
  transfers(
    where: {
      _or: [
        { from_address: { _eq: $address } }
        { to_address: { _eq: $address } }
      ]
    }
    limit: $limit
    order_by: { created_at: desc }
  ) {
    id
    deploy_id
    block_hash
    block_number
    from_address
    from_public_key
    to_address
    amount_asi
    amount_dust
    status
    timestamp
    created_at
  }
}
```

### Get Active Validators

```graphql
query GetActiveValidators {
  validators(order_by: { total_stake: desc }) {
    public_key
    name
    status
    total_stake
    first_seen_block
    last_seen_block
    created_at
    updated_at
  }
  validator_bonds(order_by: { block_number: desc }, limit: 100) {
    validator_public_key
    stake
    block_number
  }
  blocks(limit: 1000, order_by: { block_number: desc }) {
    block_number
    proposer
  }
}
```

### Get Network Statistics

```graphql
query GetNetworkStats {
  network_stats(limit: 1, order_by: {id: desc}) {
    id
    total_validators
    active_validators
    validators_in_quarantine
    consensus_participation
    consensus_status
    block_number
    timestamp
  }
}
```

### Get Deployments by Type

```graphql
query GetDeploymentsByType {
  deployments_aggregate(group_by: deployment_type) {
    aggregate {
      count
      avg {
        phlo_cost
      }
      sum {
        phlo_cost
      }
    }
    nodes {
      deployment_type
    }
  }
}
```

### Get Latest Deployments

```graphql
query GetLatestDeployments($limit: Int = 5) {
  deployments(
    limit: $limit
    order_by: { timestamp: desc }
  ) {
    deploy_id
    deployer
    deployer_address
    term
    timestamp
    deployment_type
    phlo_cost
    errored
    error_message
    status
    block_number
    block_hash
  }
}
```

### Get Indexer Status

```graphql
query GetIndexerStatus {
  blocks(order_by: { block_number: desc }, limit: 1) {
    block_number
    timestamp
  }
}
```

### Aggregate Queries

```graphql
query GetAggregatedStats {
  blocks_aggregate {
    aggregate {
      count
      max {
        block_number
      }
    }
  }
  
  deployments_aggregate {
    aggregate {
      count
      avg {
        phlo_cost
      }
      sum {
        phlo_cost
      }
    }
  }
  
  failed_deployments: deployments_aggregate(
    where: { errored: { _eq: true } }
  ) {
    aggregate {
      count
    }
  }
  
  transfers_aggregate {
    aggregate {
      count
      sum {
        amount_asi
      }
      avg {
        amount_asi
      }
    }
  }
  
  validators_aggregate {
    aggregate {
      count
    }
  }
}
```

## Real-time Queries (Polling)

Hasura provides real-time data updates through polling-based live queries. The frontend uses Apollo Client with `pollInterval` to automatically refetch data at specified intervals.

### Poll for New Blocks

```graphql
query PollForNewBlocks($limit: Int = 5) {
  blocks(
    limit: $limit
    order_by: { block_number: desc }
  ) {
    block_number
    block_hash
    timestamp
    proposer
    deployment_count
    parent_links {
      parent_index
      parent_block {
        block_hash
        block_number
      }
    }
    deployments {
      deploy_id
      deployer
      deployer_address
      term
      timestamp
      deployment_type
      phlo_cost
      errored
    }
  }
}
```

### Poll for New Transfers

```graphql
query PollForNewTransfers($limit: Int = 10) {
  transfers(
    limit: $limit
    order_by: { created_at: desc }
  ) {
    id
    deploy_id
    block_hash
    block_number
    from_address
    from_public_key
    to_address
    amount_asi
    amount_dust
    status
    timestamp
    created_at
  }
}
```

### Poll for Network Activity

```graphql
query PollForNetworkActivity {
  blocks(limit: 1, order_by: { block_number: desc }) {
    block_number
    timestamp
    deployment_count
  }
  transfers(limit: 1, order_by: { created_at: desc }) {
    id
    amount_asi
    created_at
  }
}
```

### Poll for Network Stats

> Public aggregate queries are only enabled on `deployments`, `transfers`
> and `transaction_history_view`. `blocks_aggregate`, `validators_aggregate`,
> `validator_bonds_aggregate` will fail with `validation-failed` for the
> anonymous `public` role — restrict those to admin-authenticated clients.

```graphql
query PollForNetworkStats {
  network_stats_view {
    total_blocks
    avg_block_time_seconds
    earliest_block_time
    latest_block_time
  }
  deployments_aggregate {
    aggregate {
      count
      avg {
        phlo_cost
      }
    }
  }
  deployments_aggregate_failed: deployments_aggregate(where: {errored: {_eq: true}}) {
    aggregate {
      count
    }
  }
  transfers_aggregate {
    aggregate {
      count
      sum {
        amount_asi
      }
      avg {
        amount_asi
      }
    }
  }
  transfers_aggregate_failed: transfers_aggregate(where: {status: {_neq: "success"}}) {
    aggregate {
      count
    }
  }
}
```

### Poll for Network Metrics (time-bucketed)

Uses the `get_network_metrics` SQL function (hybrid: pre-aggregated buckets
or raw aggregation fallback). Requires the `public` EXECUTE permission,
which the indexer's Hasura init script grants.

```graphql
query PollForNetworkMetrics($rangeHours: Int = 24, $divisions: Int = 7) {
  get_network_metrics(p_range_hours: $rangeHours, p_divisions: $divisions) {
    bucket_start
    bucket_end
    avg_block_time_seconds
    avg_tps
    deployments_count
    transfers_count
  }
}
```

### Poll for New Deployments

```graphql
query PollForNewDeployments($limit: Int = 20) {
  deployments(
    limit: $limit
    order_by: { timestamp: desc }
  ) {
    deploy_id
    block_hash
    block_number
    deployer
    deployer_address
    term
    timestamp
    deployment_type
    phlo_cost
    errored
    error_message
    status
    created_at
  }
}
```

## Filtering and Sorting

### Comparison Operators

- `_eq` - Equal to
- `_neq` - Not equal to
- `_gt` - Greater than
- `_gte` - Greater than or equal to
- `_lt` - Less than
- `_lte` - Less than or equal to
- `_in` - In array
- `_nin` - Not in array
- `_is_null` - Is NULL
- `_like` - Pattern match (case-sensitive)
- `_ilike` - Pattern match (case-insensitive)

### Logical Operators

- `_and` - Logical AND
- `_or` - Logical OR
- `_not` - Logical NOT

### Examples

**Filter blocks by timestamp range:**
```graphql
query GetBlocksByTimeRange($start: bigint!, $end: bigint!) {
  blocks(
    where: {
      _and: [
        { timestamp: { _gte: $start } }
        { timestamp: { _lte: $end } }
      ]
    }
    order_by: { block_number: asc }
  ) {
    block_number
    timestamp
  }
}
```

**Filter deployments by type and error status:**
```graphql
query GetFilteredDeployments($types: [String!]!, $errored: Boolean!) {
  deployments(
    where: {
      _and: [
        { deployment_type: { _in: $types } }
        { errored: { _eq: $errored } }
      ]
    }
  ) {
    deploy_id
    deployment_type
    errored
  }
}
```

## Pagination

### Offset-based Pagination

```graphql
query GetPaginatedBlocks($limit: Int!, $offset: Int!) {
  blocks(
    limit: $limit
    offset: $offset
    order_by: { block_number: desc }
  ) {
    block_number
    block_hash
  }
  
  blocks_aggregate {
    aggregate {
      count
    }
  }
}
```

### Cursor-based Pagination

```graphql
query GetBlocksAfterCursor($cursor: bigint!, $limit: Int!) {
  blocks(
    where: { block_number: { _lt: $cursor } }
    limit: $limit
    order_by: { block_number: desc }
  ) {
    block_number
    block_hash
  }
}
```

## Error Handling

GraphQL errors are returned in the response with descriptive messages:

```json
{
  "errors": [
    {
      "message": "field 'invalid_field' not found in type: 'blocks'",
      "extensions": {
        "path": "$.selectionSet.blocks.selectionSet.invalid_field",
        "code": "validation-failed"
      }
    }
  ]
}
```

Common error codes:
- `validation-failed` - Query validation error
- `constraint-violation` - Database constraint violation
- `permission-denied` - Authorization error
- `not-found` - Entity not found

## Best Practices

1. **Always use pagination** for large result sets
2. **Select only needed fields** to reduce response size
3. **Configure appropriate polling intervals** based on data freshness requirements
4. **Implement error handling** on the client side
5. **Cache query results** when appropriate
6. **Use variables** instead of string concatenation
7. **Batch queries** when fetching multiple related entities
8. **Monitor query performance** and add indices as needed

## Client Examples

### JavaScript/TypeScript (Apollo Client)

```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:8080/v1/graphql',
  cache: new InMemoryCache(),
});

// Query
const GET_LATEST_BLOCKS = gql`
  query GetLatestBlocks($limit: Int!) {
    blocks(limit: $limit, order_by: { block_number: desc }) {
      block_number
      block_hash
      timestamp
    }
  }
`;

const { data } = await client.query({
  query: GET_LATEST_BLOCKS,
  variables: { limit: 10 },
});

// Polling
const POLL_BLOCKS = gql`
  query {
    blocks(limit: 5, order_by: { block_number: desc }) {
      block_number
      block_hash
    }
  }
`;

client.watchQuery({
  query: POLL_BLOCKS,
  pollInterval: 5000, // Poll every 5 seconds
}).subscribe({
  next: (result) => console.log(result.data),
  error: (error) => console.error(error),
});
```

### Python (gql)

```python
from gql import gql, Client
from gql.transport.requests import RequestsHTTPTransport

transport = RequestsHTTPTransport(
    url='http://localhost:8080/v1/graphql',
    headers={'x-hasura-admin-secret': 'your-secret'}
)

client = Client(transport=transport, fetch_schema_from_transport=True)

query = gql('''
    query GetLatestBlocks($limit: Int!) {
        blocks(limit: $limit, order_by: { block_number: desc }) {
            block_number
            block_hash
            timestamp
        }
    }
''')

result = client.execute(query, variable_values={'limit': 10})
print(result)
```

### cURL

```bash
curl -X POST \
  http://localhost:8080/v1/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "query GetLatestBlocks($limit: Int!) { blocks(limit: $limit, order_by: { block_number: desc }) { block_number block_hash timestamp } }",
    "variables": {
      "limit": 10
    }
  }'
```

## Support

For API issues or questions:
- Check the GraphiQL console at http://localhost:8080/console
- Review query logs in Hasura console
- Verify database schema matches expected structure
- Consult Hasura documentation for advanced features
