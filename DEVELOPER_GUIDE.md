# Developer Guide

This guide provides detailed information for developers working on the ASI Chain Explorer project.

## Development Environment Setup

### System Requirements

- Operating System: Linux, macOS, or Windows with WSL2
- Docker Desktop 20.10+
- Python 3.11+
- Node.js 20+
- PostgreSQL 14+ (for local development without Docker)
- Git

### IDE Recommendations

**Python Development:**
- PyCharm Professional or VS Code with Python extension
- Recommended VS Code extensions:
  - Python
  - Pylance
  - SQLAlchemy

**Frontend Development:**
- VS Code or WebStorm
- Recommended VS Code extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features
  - GraphQL
  - Apollo GraphQL

### Code Style and Linting

#### Python

The project uses the following tools for code quality:

```bash
# Format code
black src/ --line-length 100

# Check style
flake8 src/ --max-line-length 100 --ignore E203,W503

# Type checking
mypy src/ --strict
```

#### TypeScript/JavaScript

```bash
# Type checking (automatic during build)
npm run build
```

## Project Structure Details

### Indexer Module Organization

```
indexer/src/
├── main.py              # Application entry point and IndexerService orchestrator
├── rust_indexer.py      # RustBlockIndexer - primary indexer implementation
├── rust_cli_client.py   # RustCLIClient - Rust CLI wrapper for blockchain operations
├── database.py          # Database - connection and session management
├── models.py            # SQLAlchemy ORM models (Block, Deployment, Transfer, etc.)
├── config.py            # Settings - Pydantic configuration model
├── monitoring.py        # MonitoringServer - Prometheus metrics and health checks
├── reorg_handler.py     # ReorgHandler - chain reorganization handling
├── resilience.py        # Error recovery mechanisms
├── rchain_client.py     # Legacy RChain client
├── indexer.py           # Legacy indexer implementation
├── event_system.py      # Event processing system
└── cache.py             # Caching utilities
```

### Frontend Module Organization

```
explorer/src/
├── components/          # Reusable UI components
│   ├── Layout.tsx
│   ├── BlockCard.tsx
│   ├── StatsCard.tsx
│   ├── LoadingSpinner.tsx
│   ├── NetworkDashboard.tsx
│   ├── BlockVisualization.tsx
│   ├── WalletSearch.tsx
│   ├── TransactionTrackerImproved.tsx
│   ├── AdvancedSearch.tsx
│   ├── RecentTransactionsExporter.tsx
│   ├── AnimatePresenceWrapper.tsx
│   ├── ConnectionStatus.tsx
│   ├── TransactionTracker.tsx
│   ├── RealtimeActivityFeed.tsx
│   └── Logo.tsx
│
├── pages/              # Route components
│   ├── HomePage.tsx
│   ├── BlocksPage.tsx
│   ├── BlockDetailPage.tsx
│   ├── TransactionsPage.tsx
│   ├── TransactionDetailPage.tsx
│   ├── TransfersPage.tsx
│   ├── ValidatorsPage.tsx
│   ├── ValidatorHistoryPage.tsx
│   ├── StatisticsPage.tsx
│   ├── DeploymentsPage.tsx
│   ├── SearchResultsPage.tsx
│   └── IndexerStatusPage.tsx
│
├── graphql/            # GraphQL operations
│   ├── queries.ts      # Query and subscription definitions
│   └── combined-advanced-search.graphql
│
├── services/           # Business logic
│   ├── websocketService.ts
│   └── walletService.ts
│
├── hooks/              # Custom React hooks
│   └── useGenesisFunding.ts
│
├── utils/              # Utility functions
│   ├── constants.ts
│   ├── parseGenesisFunding.ts
│   └── calculateBlockTime.ts
│
└── types/              # TypeScript definitions
    └── index.ts
```

## Database Operations

### Connecting to Database

Using psql:

```bash
# Local development
psql -U indexer -d asichain -h localhost

# Docker container
docker exec -it asi-indexer-db psql -U indexer -d asichain
```

### Useful GraphQL Queries

Check indexer progress:

```graphql
query GetIndexerStatus {
  blocks(order_by: { block_number: desc }, limit: 1) {
    block_number
    timestamp
  }
}
```

Count entities:

```graphql
query GetEntityCounts {
  blocks_aggregate {
    aggregate {
      count
    }
  }
  deployments_aggregate {
    aggregate {
      count
    }
  }
  transfers_aggregate {
    aggregate {
      count
    }
  }
  validators_aggregate {
    aggregate {
      count
    }
  }
}
```

Recent blocks:

```graphql
query GetRecentBlocks {
  blocks(limit: 10, order_by: { block_number: desc }) {
    block_number
    block_hash
    timestamp
    deployment_count
  }
}
```

Deployment statistics by type:

```graphql
query GetDeploymentsByType {
  deployments_aggregate(group_by: deployment_type) {
    aggregate {
      count
      avg {
        phlo_cost
      }
    }
    nodes {
      deployment_type
    }
  }
}
```

Top validators by stake:

```graphql
query GetTopValidators {
  validators(order_by: { total_stake: desc }, limit: 10) {
    public_key
    total_stake
    status
  }
}
```

Failed deployments:

```graphql
query GetFailedDeployments {
  deployments(
    where: { errored: { _eq: true } }
    order_by: { block_number: desc }
    limit: 20
  ) {
    deploy_id
    deployer
    error_message
    block_number
  }
}
```

## Debugging

### Indexer Debugging

Enable debug logging:

```bash
# In .env
LOG_LEVEL=DEBUG
LOG_FORMAT=text
```

View logs:

```bash
# With Docker
docker logs asi-indexer -f

# Local development
python -m src.main
```

### Frontend Debugging

1. **GraphQL queries not returning data:**
   - Check Hasura console at http://localhost:8080
   - Test query in GraphiQL interface
   - Verify table relationships are configured

2. **Data not updating:**
   - Check polling interval configuration
   - Verify Apollo Client cache policies
   - Check browser console for errors

3. **Apollo Client cache issues:**
   - Clear cache: `client.clearStore()`
   - Check cache policy for query
   - Inspect cache with Apollo DevTools extension

## Performance Optimization

### Database Optimization

Add indices for frequently queried columns using GraphQL admin queries or direct SQL access.

Use GraphQL aggregate queries efficiently:

```graphql
query GetAggregateStats {
  blocks_aggregate {
    aggregate {
      count
      max {
        block_number
      }
    }
  }
}
```

### Indexer Optimization

1. **Batch size tuning:** Adjust `BATCH_SIZE` based on network latency and block processing time
2. **Connection pooling:** Increase `DATABASE_POOL_SIZE` if queries are timing out
3. **Async operations:** Ensure all I/O operations use async/await

### Frontend Optimization

1. **Query optimization:**

```typescript
// Use pagination
const { data } = useQuery(GET_BLOCKS, {
  variables: { limit: 20, offset: page * 20 }
});

// Use field selection (only request needed fields)
const { data } = useQuery(gql`
  query {
    blocks(limit: 10) {
      block_number
      block_hash
    }
  }
`);
```

2. **Component memoization:**

```typescript
import { memo, useMemo } from 'react';

const BlockCard = memo(({ block }) => {
  const formattedDate = useMemo(
    () => new Date(block.timestamp).toLocaleString(),
    [block.timestamp]
  );
  
  return <div>{formattedDate}</div>;
});
```

3. **Polling optimization:**

Configure appropriate polling intervals based on data freshness requirements:

```typescript
useQuery(GET_LATEST_BLOCKS, { 
  pollInterval: 5000  // Poll every 5 seconds
});
```

## Resources

### Documentation

- [SQLAlchemy ORM](https://docs.sqlalchemy.org/en/20/)
- [Hasura GraphQL Engine](https://hasura.io/docs/latest/graphql/core/index.html)
- [Apollo Client](https://www.apollographql.com/docs/react/)
- [React Router](https://reactrouter.com/en/main)
- [Pydantic](https://docs.pydantic.dev/)

### Tools

- [pgAdmin](https://www.pgadmin.org/) - PostgreSQL administration
- [Postman](https://www.postman.com/) - API testing
- [Apollo Studio](https://studio.apollographql.com/) - GraphQL development
