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
9. [Contributing](#contributing)
10. [License](#license)

---

## Overview


ASI Chain Explorer is a React-based web interface that provides real-time visualization and exploration of ASI Chain blockchain data through GraphQL,
while the Python indexer backend runs separately to synchronize and store blockchain data in PostgreSQL.

**Indexer** [https://github.com/asi-alliance/asi-chain-indexer](https://github.com/asi-alliance/asi-chain-indexer)


**These services run separately and can be deployed independently.**

The system indexes blockchain data including blocks, deployments, transfers, validators, and network statistics, making it accessible through a GraphQL API powered by Hasura.

## Core Functionality
- **Block Explorer**: Real-time block monitoring with detailed information
- **Transaction Viewer**: Comprehensive transaction details including deployments and transfers
- **Pending Deploys**: Deploys in the node deploy buffers that no indexed block includes yet (Pending page)
- **Native Transfer Calls**: Calls that a deploy started or completed, with pending, completed, rejected or coalesced status (Transfers tab of a deploy)
- **Validator Dashboard**: Current validators with stake distribution; inactive validators are listed separately and are not counted in totals
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

1. **Block Synchronization**: Indexer reads blocks, deploy reports and the pending-deploy buffers from the ASI Chain node through its gRPC and HTTP APIs
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
- **date-fns 3.6.0**: Date formatting
- **lucide-react 0.536.0**: Icons
- **papaparse 5.5.3**: CSV parsing
- **react-window 1.8.8**: Virtual scrolling

### Infrastructure

- **PostgreSQL 18.6**: Primary data store (indexer stack)
- **Hasura GraphQL Engine v2.51.4**: GraphQL API layer (indexer stack)
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
- Node.js 22 (for local frontend development; the Docker build and CI use Node.js 22)

### Quick Start with Docker Compose

#### Start Explorer Frontend 

The frontend provides the web UI for browsing blockchain data. Start the
[indexer stack](https://github.com/asi-alliance/asi-chain-indexer#readme) first
and run its `scripts/full-init-hasura.sh`. The script gives the public role read
access to the tables and views that the explorer queries.

```bash
# In the repository root
cp .env.example .env
# Set the GraphQL URLs and INDEXER_STATUS_URL for your indexer stack

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

1. Install dependencies (the same commands as the Docker build):
```bash
npm install --legacy-peer-deps
npm install --legacy-peer-deps --no-save ajv@^8.12.0 ajv-keywords@^5.1.0
```

2. Create a `.env` file:
```bash
REACT_APP_GRAPHQL_URL=http://localhost:8080/v1/graphql
REACT_APP_GRAPHQL_WS_URL=ws://localhost:8080/v1/graphql
```

3. Start the development server:
```bash
npm start
```

Application will open at http://localhost:3000

## Configuration

### Explorer Environment Variables

[.env.example](.env.example) lists every variable that the code, the Dockerfile
or nginx reads. Every `REACT_APP_*` value is public: every visitor can read it.
Do not put a credential in one. The explorer sends no Hasura admin secret or
bearer token: it reads only what the public role exposes.

The four endpoint variables (GraphQL HTTP, GraphQL WebSocket, indexer API, node
URL) are runtime values in the Docker image. The container writes them to
`/config.js` at startup, so one image works for every network. Docker build
arguments with the same names only set defaults. The container exits when
`REACT_APP_GRAPHQL_URL` or `REACT_APP_GRAPHQL_WS_URL` is missing, uses the wrong
or an uppercase scheme, has a port outside 1-65535, contains credentials, a query
or a fragment, or contains characters such as quotes, backslashes, angle brackets
or spaces. The browser applies the same rules (`scripts/runtime-config-cases.tsv`).
With `npm start` and `npm run build`, these variables are build-time values. A
production bundle without them shows a configuration error and never falls back
to localhost.

A same-origin path such as `/v1/graphql` needs a reverse proxy in front of the
explorer that routes that path to Hasura, for both HTTP and WebSocket. The nginx
in the image proxies only `/api/indexer/status`. Without such a proxy, use
absolute Hasura URLs.

`REACT_APP_NATIVE_TOKEN_DECIMALS` stays a build-time value. It only sets the
wallet-balance precision for nodes that report no `nativeTokenDecimals`. Indexed
rows carry their own `token_decimals`, and rows without it use 8. Build a
separate image only when the wallet lookup must use a different fallback.

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_GRAPHQL_URL` | Hasura GraphQL HTTP endpoint: `http(s)://` URL or same-origin path. Required | `npm start` only: `http://localhost:8080/v1/graphql` |
| `REACT_APP_GRAPHQL_WS_URL` | Hasura GraphQL WebSocket endpoint: `ws(s)://` URL or same-origin path. Required | `npm start` only: `ws://localhost:8080/v1/graphql` |
| `REACT_APP_INDEXER_API_URL` | Base path of the indexer status request | `/api/indexer` |
| `REACT_APP_RCHAIN_NODE_URL` | Node HTTP API for the wallet balance lookup (not mounted in the current UI) | Same origin |
| `INDEXER_STATUS_URL` | Server-side indexer `/status` URL for nginx (runtime, not in the bundle) | `http://host.docker.internal:9090/status` |
| `REACT_APP_NATIVE_TOKEN_DECIMALS` | Wallet-balance precision for nodes without `nativeTokenDecimals`. Build time only, also in the Docker image | `8` |
| `REACT_APP_FEEDBACK_FORM_URL` | URL that receives the feedback form | Empty |
| `REACT_APP_JSAPI_URL`, `REACT_APP_CAPTCHA_TOKEN` | AWS WAF CAPTCHA for the feedback form | Empty |

## Documentation

For detailed technical documentation, see:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, component interactions, database schema, and performance considerations
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete GraphQL API reference with query examples and best practices
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Development setup, debugging, and optimization guidelines

## Support

For issues or questions:
- GitHub Issues: [asi-chain-explorer](https://github.com/asi-alliance/asi-chain-explorer/issues)
- Documentation: [ASI Chain Docs](https://docs.asichain.io/explorer/usage/)



## Environment Configuration

### Core Environment Variables
```env
REACT_APP_GRAPHQL_URL=http://localhost:8080/v1/graphql
REACT_APP_GRAPHQL_WS_URL=ws://localhost:8080/v1/graphql
REACT_APP_INDEXER_API_URL=/api/indexer
INDEXER_STATUS_URL=http://host.docker.internal:9090/status
```

The explorer needs no Hasura credential and does not send one. Every page uses
the Hasura `public` role. Before you deploy this image, make sure that the target
Hasura has:

- `HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public`. Without it, every page fails.
- The public-role permissions of the indexer's `scripts/full-init-hasura.sh`:
  `select` on the explorer tables and views with `limit: 5000`, and aggregates
  on `deployments`, `transfers`, `transaction_history_view` and `pending_deploys`.

The `GraphQL Schema` workflow validates every explorer operation against the
schema that Hasura gives to an unauthenticated request after that script. It does
not check the row limit. The CSV export requests 5000 rows, so a lower limit
shortens the export.

Run the published image with the public endpoints of the target network:

```bash
docker run -p 3001:80 \
  -e REACT_APP_GRAPHQL_URL=https://hasura.example.com/v1/graphql \
  -e REACT_APP_GRAPHQL_WS_URL=wss://hasura.example.com/v1/graphql \
  -e INDEXER_STATUS_URL=http://asi-indexer:9090/status \
  asi-explorer:latest
```

`scripts/test-docker-image.sh` builds the image and checks this startup contract.

## API Endpoints

The indexer status page polls the current indexer's `/status` response every five
seconds after the preceding request completes. It displays the stored sync cursor
against the node's finalized height. Missing data and failed requests show an
unavailable state; failed refreshes clear the previous status.

Production nginx proxies only `GET /api/indexer/status` to `INDEXER_STATUS_URL`.
Set that server-side URL to the monitoring endpoint reachable from the explorer
container. Compose supplies a host-gateway alias for the default host port 9090;
on a shared Docker network it can instead be `http://asi-indexer:9090/status`.
Keep `REACT_APP_INDEXER_API_URL=/api/indexer` for this same-origin proxy. For local
development, use a reverse proxy for the same path, or set the build-time variable
to a monitoring proxy that permits the development origin. The indexer itself
does not enable browser CORS. The browser never needs an admin credential.
Keep the indexer database timezone at UTC: its current monitoring response emits
timestamps without a timezone suffix. Nginx resolves the monitoring upstream at
startup; reload it if a named upstream's address changes.
When using a shared-network container name, start that upstream first so its name
resolves before nginx starts.

### Local Development
- **Explorer UI**: `http://localhost:3001` (Docker Compose) or `http://localhost:3000` (`npm start`)
- **GraphQL**: `http://localhost:8080/v1/graphql` (if running locally)

## Available Pages

- `/` - Home dashboard with network overview
- `/blocks` - Block explorer with pagination
- `/block/:blockNumber`, `/block/hash/:blockHash` - Block details
- `/transactions` - Transaction list
- `/pending` - Deploys in the node deploy buffers that no indexed block includes yet
- `/transaction/:transactionId` - Deploy details: overview, code, transfers with native transfer calls, block. A pending deploy shows its pending state until it is indexed.
- `/validators` - Current validators; inactive validators in a separate table
- `/validator-history` - Validator history
- `/statistics` - Network Dashboard only
- `/search` - Advanced search interface
- `/indexer-status` - Indexer health monitoring

The `/transfers` and `/deployments` routes are disabled in `src/App.tsx`.

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
- `docker/write-runtime-config.sh` - Writes and validates `/config.js`
- `nginx.conf` - Web server config
- `deploy-docker.sh` - Deployment automation


## Performance Metrics

- **Initial Load**: < 2 seconds
- **Block Updates**: Real-time via WebSocket
- **Search Response**: < 500ms
- **Bundle Size**: ~533KB gzipped
- **Docker Image**: ~50MB (Alpine Linux)
- **Memory Usage**: ~100MB

## Troubleshooting

### Common Issues

1. **Container won't start**
   - Ensure Docker is running: `docker info`
   - Check port 3001 is available: `lsof -i :3001`

2. **No data showing**
   - Verify GraphQL endpoint: `curl -s http://localhost:8080/v1/graphql -H 'content-type: application/json' -d '{"query":"{ blocks(limit: 1) { block_number } }"}'`
   - Check container logs: `docker logs asi-explorer`

3. **Build failures**
   - Clear Docker cache: `docker system prune -a`
   - Rebuild: `./deploy-docker.sh rebuild`

## License

Copyright 2025 Artificial Superintelligence Alliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS

## Contributing

Known issues and bugs are tracked in the [Issues](https://github.com/asi-alliance/asi-chain-explorer/issues) section.  
If you encounter a problem that is not listed, please feel free to open a new issue and provide as much detail as possible.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Exact token amounts

Raw balances and stake arithmetic use JavaScript `bigint`. Amounts cross JSON and
GraphQL as decimal strings and stay strings for display; monetary values must not
be parsed as JavaScript floating-point numbers. Unsafe numeric responses are
rejected instead of displaying a rounded balance.

Deploy the matching indexer before this explorer: migrations through **006**,
the documented history repair, and Hasura metadata from
`scripts/full-init-hasura.sh`. The explorer reads `pending_deploys` and the
`native_transfer_lifecycle` view, which only that metadata exposes. Keep
`HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true`.
Transfers, bonds and blocks supply their own `token_decimals`, so historical
8-decimal rows and 18-decimal rows display with their original units. Missing
historical metadata retains the legacy 8-decimal interpretation.

Wallet balances read `nativeTokenDecimals` from the node's `/api/status` and accept
both legacy `ExprInt` and BigInt `ExprBigInt` responses. For older nodes without
metadata, the build-time `REACT_APP_NATIVE_TOKEN_DECIMALS` fallback defaults to 8.
Docker builds accept the same build argument. Changing a display setting does not
rescale tokens or upgrade a chain's denomination.

Validation: `CI=true npm test -- --watchAll=false --runInBand`,
`npx tsc --noEmit`, and `npm run build`.
The `Tests` workflow runs these checks on pull requests to `dev` and `main` and
on pushes to `dev`. Its build runs with `CI=true`, so a lint warning fails the
check. The Docker build does not set `CI`; run `CI=true npm run build` locally
to see the same result.

### GraphQL schema compatibility

`npm run validate:graphql -- <hasura-graphql-endpoint>` checks every GraphQL
operation under `src/` against the schema that Hasura exposes to the public role.
The check reports unknown fields, wrong argument and variable types, and
aggregates that the public role cannot read. It does not run the queries.

The `GraphQL Schema` workflow runs this check against the indexer stack: the
indexer `docker-compose.yml` with its migrations and `scripts/full-init-hasura.sh`.
It runs on pull requests to `dev`, on pushes to `dev` and once a day, against
indexer `dev`. A manual run can select another indexer branch, tag or commit.
