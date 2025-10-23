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

For public read access, authentication may not be required depending on Hasura configuration.

## GraphQL Schema

### Types

#### Block

Represents a blockchain block with all associated metadata.

```graphql
type blocks {
  block_number: bigint!
  block_hash: String!
  parent_hash: String!
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
  finalization_status: String
  bonds_map: jsonb
  justifications: jsonb
  fault_tolerance: numeric
  created_at: timestamp!
  
  # Relationships
  deployments: [deployments!]!
  validator_bonds: [validator_bonds!]!
}
```

#### Deployment

Represents a smart contract deployment or transaction.

```graphql
type deployments {
  deploy_id: String!
  block_hash: String!
  block_number: bigint!
  deployer: String!
  term: String!
  timestamp: bigint!
  sig: String!
  sig_algorithm: String
  phlo_price: bigint
  phlo_limit: bigint
  phlo_cost: bigint
  valid_after_block_number: bigint
  errored: Boolean
  error_message: String
  deployment_type: String
  seq_num: Int
  shard_id: String
  status: String
  created_at: timestamp!
  
  # Relationships
  block: blocks!
  transfers: [transfers!]!
}
```

#### Transfer

Represents a REV token transfer extracted from a deployment.

```graphql
type transfers {
  id: bigint!
  deploy_id: String!
  block_number: bigint!
  from_address: String!
  to_address: String!
  amount_dust: bigint!
  amount_rev: numeric!
  status: String
  created_at: timestamp!
  
  # Relationships
  deployment: deployments!
}
```

#### Validator

Represents a network validator.

```graphql
type validators {
  public_key: String!
  name: String
  total_stake: bigint
  first_seen_block: bigint
  last_seen_block: bigint
  status: String
  created_at: timestamp!
  updated_at: timestamp!
  
  # Relationships
  bonds: [validator_bonds!]!
}
```

#### ValidatorBond

Historical record of validator stake at specific block.

```graphql
type validator_bonds {
  id: bigint!
  block_hash: String!
  block_number: bigint!
  validator_public_key: String!
  stake: bigint!
  
  # Relationships
  block: blocks!
  validator: validators!
}
```

#### BalanceState

Address balance at specific block.

```graphql
type balance_states {
  id: bigint!
  address: String!
  block_number: bigint!
  unbonded_balance_dust: bigint!
  unbonded_balance_rev: numeric!
  bonded_balance_dust: bigint!
  bonded_balance_rev: numeric!
  total_balance_dust: bigint!
  total_balance_rev: numeric!
  updated_at: timestamp!
  
  # Relationships
  block: blocks!
}
```

#### NetworkStats

Network-wide statistics at specific block.

```graphql
type network_stats {
  id: bigint!
  block_number: bigint!
  total_validators: Int!
  active_validators: Int!
  validators_in_quarantine: Int
  consensus_participation: numeric!
  consensus_status: String!
  timestamp: timestamp!
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
    parent_hash
    timestamp
    proposer
    deployment_count
    state_hash
    pre_state_hash
    state_root_hash
    bonds_map
    fault_tolerance
    finalization_status
    deployments {
      deploy_id
      deployer
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

```graphql
query GetBlockDetails($blockNumber: bigint!) {
  blocks(where: { block_number: { _eq: $blockNumber } }) {
    block_number
    block_hash
    parent_hash
    timestamp
    proposer
    state_root_hash
    pre_state_hash
    deployment_count
    bonds_map
    justifications
    fault_tolerance
    deployments {
      deploy_id
      deployer
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
        amount_rev
        amount_dust
        status
      }
    }
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
    from_address
    to_address
    amount_rev
    amount_dust
    status
    block_number
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
    from_address
    to_address
    amount_rev
    amount_dust
    status
    block_number
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
    term
    timestamp
    deployment_type
    phlo_cost
    errored
    status
    block_number
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
        amount_rev
      }
      avg {
        amount_rev
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
    parent_hash
    timestamp
    proposer
    deployment_count
    deployments {
      deploy_id
      deployer
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
    from_address
    to_address
    amount_rev
    amount_dust
    status
    block_number
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
    amount_rev
    created_at
  }
}
```

### Poll for Network Stats

```graphql
query PollForNetworkStats {
  network_stats_view {
    total_blocks
    avg_block_time_seconds
    earliest_block_time
    latest_block_time
  }
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
        amount_rev
      }
      avg {
        amount_rev
      }
    }
  }
  transfers_aggregate_failed: transfers_aggregate(where: {status: {_neq: "success"}}) {
    aggregate {
      count
    }
  }
  validators_aggregate {
    aggregate {
      count
    }
  }
  validator_bonds_aggregate {
    aggregate {
      count
    }
  }
}
```

### Poll for New Deployments

```graphql
query PollForNewDeployments($limit: Int = 20) {
  deployments(
    limit: $limit
    order_by: { created_at: desc }
  ) {
    deploy_id
    block_hash
    block_number
    deployer
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
