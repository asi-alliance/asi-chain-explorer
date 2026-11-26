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
8. [Contributing](#contributing)
9. [License](#license)

---

## Overview


ASI Chain Explorer is a React-based web interface that provides real-time visualization and exploration of ASI Chain blockchain data through GraphQL,
while the Python indexer backend runs separately to synchronize and store blockchain data in PostgreSQL.

**Indexer** [https://github.com/asi-alliance/asi-chain-indexer](https://github.com/asi-alliance/asi-chain-indexer)


**These services run separately and can be deployed independently.**

The system indexes blockchain data including blocks, deployments, transfers, validators, and network statistics, making it accessible through a GraphQL API powered by Hasura.

## Core Functionality
- **Block Explorer**: Real-time block monitoring with detailed information, grouped by DAG height
- **Height Overview**: A height can contain several sibling blocks; `/height/{height}` lists every sibling with finalization status, parent/child links and previous/next height navigation
- **Search**: One header omnibox for heights, block hashes, deploy IDs, indexed transfers and vault addresses, with grouped results, a `Ctrl/Cmd+K` palette, recent searches and ASI amount-range filters on the Transfers tab
- **Transaction Viewer**: Details with the executed fee in ASI (`phlo_cost × phlo_price`), one copyable transaction ID, a compact status tooltip, local absolute timestamps, relative age and `Genesis` labels for block-0 RChain mainnet records
- **CSV Export**: An `Export CSV` action at the bottom of Recent Blocks and the transaction tables downloads up to 5000 recent rows (`recent_blocks.csv`, `recent_deployments.csv` or `recent_transfers.csv`)
- **Pending Deploys** (optional): Deploys in the validators' deploy buffers that no indexed block includes yet, updated live over the GraphQL WebSocket (Pending page). Shown only when the indexer reads validator buffers
- **Native Transfer Calls**: Calls that a deploy started or completed, with pending, completed, rejected or coalesced status (Transfers tab of a deploy)
- **Validator Dashboard**: Current validators with stake distribution; inactive validators are listed separately and are not counted in totals
- **Network Statistics**: Simplified Network Dashboard view
- **Genesis Funding**: Complete visibility of initial token distribution
- **Shareable views**: Home filters (`?q=`, `?finalized=0` for all blocks), the `/transactions` tab (`?tab=transfers`) and transaction detail tabs (`?tab=code`, `?tab=transfers`, `?tab=block`) live in the URL; every route also sets a descriptive browser title
- **Finalized by default**: Recent Blocks starts with Finalized only checked; `?finalized=0` explicitly shows all blocks
- **Mobile Recent Blocks**: below 600 px the Height column stays pinned while the table scrolls horizontally; the search, Clear and Finalized-only controls stack without horizontal overflow
- **Loading and Retry**: Recent Blocks uses skeleton rows, network cards and height summaries use skeleton cards, and failed stats/blocks/height reads show an explicit Retry without discarding the last loaded data
- **Status Legend**: Confirmed and Unfinalized labels sit under the Recent Blocks filters with the same colours as the table and height overview
- **Route fallback**: Unknown paths render a 404 page with the attempted path, chain search and recovery links; the legacy `/blocks` path redirects to `/`

## Architecture

### System Components

```

┌─────────────────────────────────────────────────────────────┐
│                   Hasura GraphQL + Indexer                  │
│  - Hasura GraphQL Engine                                    │
│  - GraphQL API over HTTP and WebSocket                      │
│  - WebSocket subscriptions for pending deploys              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ GraphQL (HTTP + WebSocket)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  React Explorer Frontend                    │
│  - Block browser and DAG height overview                    │
│  - Transaction viewer with fee in ASI                       │
│  - Validator dashboard                                      │
│  - Network statistics                                       │
│  - Lazy-loaded routes                                       │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Block Synchronization**: Indexer reads blocks, deploy reports and the pending-deploy buffers from the ASI Chain node through its gRPC and HTTP APIs
2. **Data Processing**: Each block is processed to extract deployments, transfers, validator bonds, and network state
3. **Database Storage**: Processed data is stored in PostgreSQL with proper relationships and indices
4. **GraphQL Exposure**: Hasura automatically generates GraphQL API from database schema
5. **Frontend Query**: React application queries the GraphQL API over HTTP and polls for block and statistics updates; pending deploys, indexer status and outgoing pending deploys use WebSocket subscriptions with an HTTP fallback
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
- **React.lazy**: Route-level code splitting; charts and the syntax highlighter
  load only on the pages that use them

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

#### Or use the deploy-docker.sh script

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
in the image proxies indexer status and address balances. Without a GraphQL proxy, use
absolute Hasura URLs.

`REACT_APP_NATIVE_TOKEN_DECIMALS` stays a build-time value. Indexed rows carry
their own `token_decimals`; this fallback applies to wallet balances from nodes
that report no `nativeTokenDecimals`, and to deploy fees or amounts whose block
has no token metadata. Rows without it use 18 on current networks. Build a
separate image only when the fallback must change.

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_GRAPHQL_URL` | Hasura GraphQL HTTP endpoint: `http(s)://` URL or same-origin path. Required | `npm start` only: `http://localhost:8080/v1/graphql` |
| `REACT_APP_GRAPHQL_WS_URL` | Hasura GraphQL WebSocket endpoint: `ws(s)://` URL or same-origin path. Required | `npm start` only: `ws://localhost:8080/v1/graphql` |
| `REACT_APP_INDEXER_API_URL` | Public base path for indexer status and address balances | `/api/indexer` |
| `REACT_APP_RCHAIN_NODE_URL` | Node HTTP API for the wallet balance lookup (not mounted in the current UI) | Same origin |
| `INDEXER_STATUS_URL` | Server-side indexer `/status` URL for nginx (runtime, not in the bundle) | `http://host.docker.internal:9090/status` |
| `REACT_APP_NATIVE_TOKEN_DECIMALS` | Fallback precision for balances, fees and amounts whose source row has no `token_decimals`. Build time only, also in the Docker image | `18` |
| `REACT_APP_FEEDBACK_FORM_URL` | URL that receives the feedback form | Empty |
| `REACT_APP_JSAPI_URL`, `REACT_APP_CAPTCHA_TOKEN` | AWS WAF CAPTCHA for the feedback form | Empty |

## Documentation

For detailed technical documentation, see:

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, component interactions, database schema, and performance considerations
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete GraphQL API reference with query examples and best practices
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** - Development setup, debugging, and optimization guidelines
- **[ROADMAP.md](ROADMAP.md)** - Scope shipped in the current PR and remaining explorer work

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

Production nginx proxies `GET /api/indexer/status` to `INDEXER_STATUS_URL`.
For `GET /api/indexer/address/{address}` it replaces the upstream `/status`
suffix with `/api/address/{address}`. Static hosting requires an equivalent
ingress route with caching disabled and an indexer that implements address lookup.
The address page captures the indexer's `last_indexed_block` and highest transfer ID
when opened. It shows the captured height and warns when it trails the balance.
All, Incoming and Outgoing share these bounds. Self-transfers appear once in All
and in both directional views. Pages continue after the last displayed block
number and transfer ID in descending order. Select **Refresh** to fetch the latest
finalized balance and return to the first page of newly indexed history with the
same direction filter. A refresh keeps the previous balance visible while the
lookup runs; if the lookup fails, the page reports the error and labels the block
as the last loaded one. The balance keeps at most eight decimals, truncated
without rounding up; a positive balance below that precision reads
`<0.00000001 ASI`. A dotted underline marks a truncated balance; hover or focus
it to see the exact amount in a tooltip. A
failed read is retried twice; the warning offers **Retry**, and leaving the page
does not cancel a read that is still in flight. A back/forward-cache restore
refreshes the snapshot. When the indexer tracks pending deploys, the page also
lists the latest deploys that this address submitted, above the indexed transfers.
These are deploy submissions, not transfers: they do not change the finalized
balance and do not appear as transfer rows. Incoming pending transfers stay
invisible until their deploy executes and the indexer stores the block.
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

- `/` - Home dashboard with network overview and Recent Blocks with a footer CSV export; finalized-only is the default, `?q=` preserves the search and `?finalized=0` shows all blocks
- `/blocks` - Redirects to `/`; the home page is the block list
- `/height/:height` - Height overview; a height with several DAG siblings lists every sibling
- `/block/hash/:blockHash` - Details for one specific block
- `/block/:blockNumber` - Legacy height URL; redirects to `/height/:blockNumber` and preserves the query string
- `/transactions` - Transaction list with one icon tab row and a footer CSV export; `?tab=transfers` opens the Transfers tab
- `/pending` - Deploys in the validators' deploy buffers that no indexed block includes yet (the navigation tab appears only when the indexer tracks pending deploys)
- `/transaction/:transactionId` - Deploy details: executed fee in ASI, code, transfers with native transfer calls and block. Shows one copyable ID, a status tooltip, local and relative timestamps; block-0 records carry a Genesis label. `?tab=code`, `?tab=transfers` and `?tab=block` open a tab directly. A pending deploy shows its pending state until it is indexed.
- `/validators` - Current validators; inactive validators in a separate table
- `/validator-history` - Validator history
- `/statistics` - Network Dashboard only
- `/search` - Search results for a height, hash, deploy ID or address, with type tabs and copy/share actions
- `/address/:address` - Spendable balance at the latest finalized block and indexed transfer history
- `/indexer-status` - Indexer health monitoring
- Any unknown path - 404 page with the chain search and recovery links

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
- `package.json` - Dependencies; the lockfile is generated locally and is gitignored
- `tsconfig.json` - TypeScript config
- `Dockerfile` - Container definition
- `docker-compose.standalone.yml` - Docker Compose config
- `docker-entrypoint.sh` - Runtime configuration
- `docker/write-runtime-config.sh` - Writes and validates `/config.js`
- `nginx.conf` - Web server config
- `deploy-docker.sh` - Deployment automation


## Performance Metrics

- **Initial JS**: ~228 kB gzip for the shell and home page
- **On-demand chunks**: Statistics (charts) ~135 kB gzip; the transaction detail vendor chunk (code highlighter and toast styles) ~229 kB gzip
- **Recent Blocks**: 2 s polling, also while the finalized-only filter is on; a text search pauses it
- **Live pending data**: WebSocket subscriptions with a 5 s HTTP fallback
- **Home filter**: 250 ms debounce; the header omnibox uses six-row batches per result type
- **Docker Image**: ~80MB (nginx Alpine runtime)

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

Pending deploys are optional. A deploy waits only in the buffer of the validator
that received it: nodes do not gossip deploys, and an observer rejects them. The
explorer shows the Pending tab only when the indexer reports the
`pending_deploys_status` row in `indexer_state`, which it writes only while its
`PENDING_DEPLOYS_NODES` lists the validators. Navigation, the Pending list and deploy details share one status subscription.
The Pending page reads the list
through GraphQL subscriptions on `REACT_APP_GRAPHQL_WS_URL`.
Hasura can batch subscribers to each query shape. With a 500 ms refetch interval,
even one visible Pending page refreshes both the list and status twice per second.
Hidden tabs pause their subscriptions and fallback polling. If the WebSocket
fails, or the server does not acknowledge the connection within 5 seconds,
visible pages poll over HTTP every 5 seconds and retry the subscription
every 30 seconds until live data arrives. If both transports fail, the deploy
detail page reports that it cannot verify the status.
An empty detail lookup starts an inclusion watch even when pending tracking is
off or the deploy has already left the buffer. The watch stops after three
minutes. Select **Check again** to resume.
Transfers, bonds and blocks supply their own `token_decimals`, so historical
8-decimal rows and 18-decimal rows display with their original units. Missing
historical metadata retains the legacy 8-decimal interpretation.

Deploy fees use the same units. The transaction page shows
`phlo_cost × phlo_price` atomic units converted with the including block's
`token_decimals`, keeps the raw phlo counters visible, and shows
`phlo_limit × phlo_price` as the precharge that the node refunds down to the
executed cost. A pending deploy has no executed cost yet and shows no fee.

Wallet balances read `nativeTokenDecimals` from the node's `/api/status` and accept
both legacy `ExprInt` and BigInt `ExprBigInt` responses. For older nodes without
metadata, the build-time `REACT_APP_NATIVE_TOKEN_DECIMALS` fallback defaults to 18.
Docker builds accept the same build argument. Changing a display setting does not
rescale tokens or upgrade a chain's denomination.

Validation: `CI=true npm test -- --watchAll=false --runInBand`,
`npx tsc --noEmit`, and `npm run build`. The suite currently has 394 tests
in 40 suites.
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
