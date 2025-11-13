<div align="center">

# ASI Chain: Block Explorer

[![Status](https://img.shields.io/badge/Status-BETA-FFA500?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-explorer)
[![Version](https://img.shields.io/badge/Version-0.1.0-A8E6A3?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-explorer/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-1A1A1A?style=for-the-badge)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-Available-C4F0C1?style=for-the-badge)](https://docs.asichain.io/explorer/usage/)

<h3>Blockchain Explorer and Indexer Infrastructure for ASI Chain</h3>

Part of the [**Artificial Superintelligence Alliance**](https://superintelligence.io) ecosystem

*Uniting Fetch.ai, SingularityNET and CUDOS*

</div>

---

**ASI Chain Explorer** is a modern, real-time blockchain explorer that provides comprehensive insights into blocks, transactions, validators, and network statistics on the ASI Chain network through an intuitive web interface.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Documentation](#documentation)
8. [Monitoring](#monitoring)
9. [License](#license)

---

## Overview


ASI Chain Explorer is a React-based web interface that provides real-time visualization and exploration of ASI Chain blockchain data through GraphQL,
while the Python indexer backend runs separately to synchronize and store blockchain data in PostgreSQL.

**Indexer** [https://github.com/asi-alliance/asi-chain-explorer](https://github.com/asi-alliance/asi-chain-explorer)


**These services run separately and can be deployed independently.**

The system indexes blockchain data including blocks, deployments, transfers, validators, and network statistics, making it accessible through a GraphQL API powered by Hasura.

## Core Functionality
- **Block Explorer**: Real-time block monitoring with detailed information
- **Transaction Viewer**: Comprehensive transaction details including deployments and transfers
- **Validator Dashboard**: Active validator monitoring with stake distribution (deduplication fixed)
- **Network Statistics**: Simplified Network Dashboard view
- **Search**: Universal search for blocks, transactions, and addresses
- **Genesis Funding**: Complete visibility of initial token distribution

## Architecture

### System Components

```

┌─────────────────────────────────────────────────────────────┐
│                   Hasura GraphQL + Indexer                  │
│  - GraphQL API                                              │
│  - Real-time queries with polling                           │
│  - Query optimization                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ GraphQL (HTTP)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  React Explorer Frontend                    │
│  - Block browser                                            │
│  - Transaction viewer                                       │
│  - Validator dashboard                                      │
│  - Network statistics                                       │
│  - Real-time updates via polling                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Block Synchronization**: Indexer queries ASI Chain node via Rust CLI to retrieve blocks within configured height ranges
2. **Data Processing**: Each block is processed to extract deployments, transfers, validator bonds, and network state
3. **Database Storage**: Processed data is stored in PostgreSQL with proper relationships and indices
4. **GraphQL Exposure**: Hasura automatically generates GraphQL API from database schema
5. **Frontend Query**: React application queries GraphQL API with automatic polling for updates
6. **User Interface**: Data is rendered in the web interface with visualizations and navigation

## Technology Stack

- **React 19.1.1**: UI framework
- **TypeScript 4.9.5**: Type-safe JavaScript
- **Apollo Client 3.13.9**: GraphQL client with caching and polling
- **React Router 7.7.1**: Client-side routing
- **Framer Motion 11.11.17**: UI animations
- **Recharts 3.1.1**: Data visualization
- **date-fns 4.1.0**: Date formatting
- **lucide-react 0.536.0**: Icons
- **papaparse 5.5.3**: CSV parsing
- **react-window 1.8.8**: Virtual scrolling

### Infrastructure

- **PostgreSQL 14**: Primary data store
- **Hasura GraphQL Engine 2.36.0**: GraphQL API layer
- **Docker**: Containerization
- **nginx**: Frontend web server

## Project Structure

```
asi-chain-explorer/
│   src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route-based page components
│   │   ├── graphql/         # GraphQL queries and subscriptions
│   │   ├── services/        # Business logic services
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions
│   │   ├── types/           # TypeScript type definitions
│   │   └── styles/          # Global styles
│   ├── public/              # Static assets
│   ├── docker-compose.standalone.yml
│   ├── Dockerfile           # Production container image
│   ├── nginx.conf           # Nginx configuration
│   └── package.json         # Node.js dependencies
│
└── .github/
    └── workflows/           # CI/CD pipeline definitions
```

## Installation

### Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher
- Node.js 20 (for local frontend development)

### Quick Start with Docker Compose

#### Start Explorer Frontend 

The frontend provides the web UI for browsing blockchain data. Before starting the frontend, ensure you've completed Step 3 from the indexer setup (Hasura configuration scripts).

```bash
cd ../explorer

# Create and configure .env file in /explorer directory
cp .env.example .env
# Edit .env with your node configuration

# Start frontend
docker compose -f docker-compose.standalone.yml up -d
```

Frontend will be available at http://localhost:3001

**Note:** The indexer works independently - you can use the GraphQL API (http://localhost:8080/v1/graphql) without running the frontend.

#### Or use ./deploy.sh script

```bash
# Deploy with script
./deploy-docker.sh start

# Other commands
./deploy-docker.sh stop     # Stop the explorer
./deploy-docker.sh restart  # Restart the explorer
./deploy-docker.sh logs     # View logs
./deploy-docker.sh status   # Check status
./deploy-docker.sh rebuild  # Rebuild after code changes
```


### Local Development Setup

#### Explorer

1. Navigate to explorer directory:
```bash
cd explorer
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
REACT_APP_GRAPHQL_URL=http://localhost:8080/v1/graphql
REACT_APP_HASURA_ADMIN_SECRET=myadminsecretkey
```

4. Start development server:
```bash
npm start
```

Application will open at http://localhost:3000

## Configuration

### Explorer Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_GRAPHQL_URL` | Hasura GraphQL HTTP endpoint | `http://localhost:8080/v1/graphql` |
| `REACT_APP_HASURA_ADMIN_SECRET` | Hasura admin secret for authentication | Empty |
| `REACT_APP_NETWORK_NAME` | Network display name | `ASI Chain` |
| `REACT_APP_POLLING_INTERVAL` | Polling interval for data updates (ms) | `5000` |

## Documentation

For detailed technical documentation, see:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, component interactions, database schema, and performance considerations
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete GraphQL API reference with query examples and best practices
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Development setup, debugging, and optimization guidelines

## Support

For issues or questions:
- GitHub Issues: [asi-chain/explorer](https://github.com/asi-alliance/asi-chain/issues)
- Documentation: [ASI Chain Docs](../docs/)



## Environment Configuration

### Core Environment Variables
```env
# Production (.env.production.secure)
REACT_APP_GRAPHQL_URL=http://localhost:8080/v1/graphql
REACT_APP_GRAPHQL_WS_URL=ws://localhost:8080/v1/graphql
REACT_APP_INDEXER_API_URL=http://localhost:9090
REACT_APP_HASURA_ADMIN_SECRET=myadminsecretkey
REACT_APP_NETWORK_NAME=ASI Chain
REACT_APP_ENVIRONMENT=production

# Local Development (.env)
REACT_APP_GRAPHQL_URL=http://localhost:8080/v1/graphql
REACT_APP_HASURA_ADMIN_SECRET=myadminsecretkey
```

## API Endpoints

### Local Development
- **Explorer UI**: `http://localhost:3001`
- **GraphQL**: `http://localhost:8080/v1/graphql` (if running locally)

## Available Pages

- `/` - Home dashboard with network overview
- `/blocks` - Block explorer with pagination
- `/block/:number` - Individual block details
- `/transactions` - Transaction list with improved count display
- `/transaction/:id` - Transaction details
- `/validators` - Active validator list (deduplicated)
- `/validator/:pubkey` - Validator details and history
- `/deployments` - Smart contract deployments
- `/transfers` - Token transfer history
- `/statistics` - Network Dashboard only
- `/search` - Advanced search interface
- `/indexer-status` - Indexer health monitoring

## Docker Container Management

```bash
# Check container status
docker ps | grep asi-explorer

# View container health
docker inspect asi-explorer --format='{{.State.Health.Status}}'

# Check environment variables
docker exec asi-explorer printenv | grep REACT_APP

# Remove container and image
docker stop asi-explorer
docker rm asi-explorer
docker rmi asi-explorer:latest
```

## File Structure

### Essential Files (Production Required)
- `src/` - React application source
- `public/` - Static assets
- `package.json`, `package-lock.json` - Dependencies
- `tsconfig.json` - TypeScript config
- `Dockerfile` - Container definition
- `docker-compose.standalone.yml` - Docker Compose config
- `docker-entrypoint.sh` - Runtime configuration
- `nginx.conf` - Web server config
- `.env.production.secure` - Production environment
- `deploy-docker.sh` - Deployment automation


## Performance Metrics

- **Initial Load**: < 2 seconds
- **Block Updates**: Real-time via WebSocket
- **Search Response**: < 500ms
- **Bundle Size**: ~533KB gzipped
- **Docker Image**: ~50MB (Alpine Linux)
- **Memory Usage**: ~100MB
- **Network Data**: 322+ blocks indexed

## Troubleshooting

### Common Issues

1. **Container won't start**
   - Ensure Docker is running: `docker info`
   - Check port 3001 is available: `lsof -i :3001`

2. **No data showing**
   - Verify GraphQL endpoint: `curl http://13.251.66.61:8080/v1/graphql`
   - Check container logs: `docker logs asi-explorer`

3. **Build failures**
   - Clear Docker cache: `docker system prune -a`
   - Rebuild: `./deploy-docker.sh rebuild`

## License

Copyright 2025 Artificial Superintelligence Alliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS

## Contributing

Please see the main [Contributing Guide](../CONTRIBUTING.md) for details on contributing to the explorer.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
