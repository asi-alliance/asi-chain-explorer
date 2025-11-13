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

ASI Chain Explorer consists of **two independent components**:

- **Indexer** (Backend): Python-based blockchain data synchronization service that extracts and stores blockchain data in PostgreSQL
- **Explorer** (Frontend): React-based web interface that provides visualization and querying capabilities through GraphQL

**These services run separately and can be deployed independently.**

The system indexes blockchain data including blocks, deployments, transfers, validators, and network statistics, making it accessible through a GraphQL API powered by Hasura.

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
├── explorer/                # Frontend web application
│   ├── src/
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

#### 1. Start Explorer Frontend 

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

## License

Copyright 2025 Artificial Superintelligence Alliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS
