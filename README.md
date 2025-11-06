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

**ASI Chain Explorer** provides comprehensive blockchain data synchronization and web-based interface for exploring blocks, transactions, validators, and network statistics on the ASI Chain network.

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

ASI Chain Explorer consists of two primary components:

- **Indexer**: Python-based blockchain data synchronization service that extracts and stores blockchain data in PostgreSQL
- **Explorer**: React-based web interface that provides visualization and querying capabilities through GraphQL

The system indexes blockchain data including blocks, deployments, transfers, validators, and network statistics, making it accessible through a GraphQL API powered by Hasura.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     ASI Chain Node                          │
│                  (RChain-based Network)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ gRPC/HTTP
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Rust CLI Client                          │
│         (Blockchain Data Extraction Interface)              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Command Execution
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Python Indexer Service                     │
│  - Block synchronization                                    │
│  - Deployment processing                                    │
│  - Transfer extraction                                      │
│  - Validator tracking                                       │
│  - Network statistics                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ asyncpg/SQLAlchemy
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   PostgreSQL Database                       │
│  Tables: blocks, deployments, transfers, validators,        │
│          validator_bonds, balance_states, network_stats     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Database Connection
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Hasura GraphQL Engine                     │
│  - Auto-generated GraphQL API                               │
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

### Indexer (Backend)

- **Python 3.11**: Core programming language
- **asyncio**: Asynchronous processing framework
- **SQLAlchemy 2.0.31**: ORM and database abstraction
- **asyncpg 0.29.0**: PostgreSQL async driver
- **Pydantic 2.7.4**: Configuration and data validation
- **pydantic-settings 2.3.4**: Settings management
- **structlog 24.2.0**: Structured logging
- **prometheus-client 0.20.0**: Metrics exposure
- **aiohttp 3.9.5**: HTTP client
- **click 8.1.7**: CLI interface
- **tenacity 8.5.0**: Retry logic

### Explorer (Frontend)

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
├── indexer/                    # Backend indexer service
│   ├── src/
│   │   ├── main.py            # Entry point and service orchestration
│   │   ├── indexer.py         # Legacy indexer implementation
│   │   ├── rust_indexer.py    # Enhanced Rust CLI-based indexer
│   │   ├── rust_cli_client.py # Rust CLI wrapper client
│   │   ├── database.py        # Database connection management
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   ├── config.py          # Configuration management
│   │   ├── monitoring.py      # Prometheus metrics
│   │   ├── reorg_handler.py   # Chain reorganization handling
│   │   ├── resilience.py      # Error recovery mechanisms
│   │   ├── rchain_client.py   # Legacy RChain client
│   │   ├── event_system.py    # Event processing
│   │   └── cache.py           # Caching utilities
│   ├── migrations/
│   │   └── 000_comprehensive_initial_schema.sql
│   ├── scripts/               # Hasura configuration scripts
│   ├── docker-compose.yml     # Local development stack
│   ├── Dockerfile            # Production container image
│   └── requirements.txt       # Python dependencies
│
├── explorer/                  # Frontend web application
│   ├── src/
│   │   ├── components/       # Reusable UI components
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
- Python 3.11 (for local indexer development)

### Quick Start with Docker Compose

1. Clone the repository:
```bash
git clone https://github.com/your-org/asi-chain-explorer.git
cd asi-chain-explorer
```

2. Start the indexer stack:
```bash
cd indexer
docker compose up -d
```

This starts:
- PostgreSQL database (port 5432)
- Indexer service (monitoring on port 9090)
- Hasura GraphQL Engine (port 8080)

3. Start the explorer frontend:
```bash
cd ../explorer
docker compose -f docker-compose.standalone.yml up -d
```

Frontend will be available at http://localhost:3001

### Local Development Setup

#### Indexer

1. Navigate to indexer directory:
```bash
cd indexer
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file from template:
```bash
cp .env.template .env
```

5. Configure environment variables (see Configuration section)

6. Start PostgreSQL:
```bash
docker compose up -d postgres
```

7. Run migrations:
```bash
psql -U indexer -d asichain -h localhost -f migrations/000_comprehensive_initial_schema.sql
```

8. Start indexer:
```bash
python -m src.main
```

#### Explorer

1. Navigate to explorer directory:
```bash
cd explorer
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
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

### Indexer Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_HOST` | ASI Chain node hostname | `localhost` |
| `GRPC_PORT` | Node gRPC port for blockchain operations | `40412` |
| `HTTP_PORT` | Node HTTP port for status queries | `40413` |
| `NODE_URL` | RChain node HTTP API endpoint | `http://localhost:40453` |
| `NODE_TIMEOUT` | HTTP request timeout in seconds | `30` |
| `RUST_CLI_PATH` | Path to Rust CLI executable | `/rust-client/target/release/node_cli` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://indexer:indexer_pass@localhost:5432/asichain` |
| `DATABASE_POOL_SIZE` | Database connection pool size | `20` |
| `DATABASE_POOL_TIMEOUT` | Database pool timeout in seconds | `10` |
| `SYNC_INTERVAL` | Seconds between sync cycles | `5` |
| `BATCH_SIZE` | Number of blocks per batch | `100` |
| `START_FROM_BLOCK` | Initial block to start indexing | `0` |
| `MONITORING_PORT` | Prometheus metrics port | `9090` |
| `HEALTH_CHECK_INTERVAL` | Health check interval in seconds | `60` |
| `LOG_LEVEL` | Logging level (DEBUG/INFO/WARNING/ERROR) | `INFO` |
| `LOG_FORMAT` | Log format (json/text) | `json` |
| `ENABLE_REV_TRANSFER_EXTRACTION` | Extract REV transfers from deployments | `true` |
| `ENABLE_METRICS` | Enable Prometheus metrics | `true` |
| `ENABLE_HEALTH_CHECK` | Enable health check endpoint | `true` |
| `HASURA_ADMIN_SECRET` | Hasura admin secret (not used by indexer) | Empty |

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

## Monitoring

### Indexer Metrics

The indexer exposes Prometheus metrics at `http://localhost:9090/metrics`:

- `asi_indexer_blocks_processed_total`: Total blocks processed
- `asi_indexer_sync_errors_total`: Total sync errors encountered
- `asi_indexer_last_indexed_block`: Last successfully indexed block number
- `asi_indexer_blocks_behind`: Number of blocks behind chain tip
- `asi_indexer_processing_time_seconds`: Block processing time histogram

### Health Checks

Indexer health endpoint: `http://localhost:9090/health`

Returns:
```json
{
  "status": "healthy",
  "last_indexed_block": 12345,
  "blocks_behind": 0,
  "database_connected": true
}
```

## License

Copyright 2025 Artificial Superintelligence Alliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS
