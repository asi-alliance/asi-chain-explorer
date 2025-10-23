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

### Useful Database Queries

```sql
-- Check indexer progress
SELECT value FROM indexer_state WHERE key = 'last_indexed_block';

-- Count entities
SELECT 
  (SELECT COUNT(*) FROM blocks) as blocks,
  (SELECT COUNT(*) FROM deployments) as deployments,
  (SELECT COUNT(*) FROM transfers) as transfers,
  (SELECT COUNT(*) FROM validators) as validators;

-- Recent blocks
SELECT block_number, block_hash, timestamp, deployment_count 
FROM blocks 
ORDER BY block_number DESC 
LIMIT 10;

-- Deployment statistics by type
SELECT 
  deployment_type, 
  COUNT(*) as count,
  AVG(phlo_cost) as avg_phlo_cost
FROM deployments 
GROUP BY deployment_type 
ORDER BY count DESC;

-- Top validators by stake
SELECT public_key, total_stake, status
FROM validators
ORDER BY total_stake DESC
LIMIT 10;

-- Failed deployments
SELECT deploy_id, deployer, error_message, block_number
FROM deployments
WHERE errored = true
ORDER BY block_number DESC
LIMIT 20;

-- Analyze tables for query optimization
ANALYZE blocks;
ANALYZE deployments;
ANALYZE transfers;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
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

2. **Real-time updates not working:**
   - Check WebSocket connection in browser DevTools
   - Verify subscription query syntax
   - Check Hasura subscription configuration

3. **Apollo Client cache issues:**
   - Clear cache: `client.clearStore()`
   - Check cache policy for query
   - Inspect cache with Apollo DevTools extension

## Performance Optimization

### Database Optimization

1. **Add indices for frequently queried columns:**

```sql
CREATE INDEX idx_custom_query ON table_name(column1, column2);
```

2. **Use EXPLAIN ANALYZE to understand query plans:**

```sql
EXPLAIN ANALYZE
SELECT * FROM blocks WHERE block_number > 1000
ORDER BY block_number DESC
LIMIT 10;
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

## Deployment Checklist

### Pre-deployment

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Performance testing completed
- [ ] Security review completed

### Deployment Steps

1. Build images:
```bash
docker build -t asi-indexer:v1.0.0 ./indexer
docker build -t asi-explorer:v1.0.0 ./explorer
```

2. Tag for registry:
```bash
docker tag asi-indexer:v1.0.0 registry.example.com/asi-indexer:v1.0.0
docker tag asi-explorer:v1.0.0 registry.example.com/asi-explorer:v1.0.0
```

3. Push to registry:
```bash
docker push registry.example.com/asi-indexer:v1.0.0
docker push registry.example.com/asi-explorer:v1.0.0
```

4. Update production environment
5. Apply database migrations
6. Deploy new containers
7. Verify health checks
8. Monitor metrics

### Post-deployment

- [ ] Verify indexer is syncing
- [ ] Check GraphQL API responsiveness
- [ ] Test frontend functionality
- [ ] Monitor error rates
- [ ] Review logs for issues

## Common Issues and Solutions

### Issue: Indexer falls behind chain tip

**Symptoms:** `blocks_behind` metric increasing over time

**Solutions:**
1. Increase `BATCH_SIZE` to process more blocks per cycle
2. Reduce `SYNC_INTERVAL` to sync more frequently
3. Increase database connection pool
4. Optimize database queries with better indices

### Issue: Frontend shows stale data

**Symptoms:** Data not updating in real-time

**Solutions:**
1. Check WebSocket connection status
2. Verify subscription queries are active
3. Enable polling as fallback:
   ```typescript
   useQuery(GET_BLOCKS, { pollInterval: 5000 })
   ```

### Issue: GraphQL query timeouts

**Symptoms:** 504 Gateway Timeout errors

**Solutions:**
1. Reduce query depth/complexity
2. Add pagination to large result sets
3. Increase Hasura timeout settings
4. Add database indices for queried fields

### Issue: Database connection exhaustion

**Symptoms:** "Too many connections" errors

**Solutions:**
1. Increase PostgreSQL `max_connections`
2. Reduce `DATABASE_POOL_SIZE` if set too high
3. Check for connection leaks in code
4. Implement connection pooling at application level

## Contributing Guidelines

### Branch Strategy

- `main` - Production-ready code
- `dev` - Development branch
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `release/*` - Release preparation branches

### Commit Messages

Follow conventional commits format:

```
feat(indexer): add genesis balance tracking
fix(frontend): correct block timestamp display
docs(readme): update installation instructions
refactor(database): optimize validator queries
```

### Pull Request Process

1. Create feature branch from `dev`
2. Implement changes with tests
3. Update documentation if needed
4. Create PR with description of changes
5. Address review comments
6. Merge after approval

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
