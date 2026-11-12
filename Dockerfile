# ASI-Chain Explorer Dockerfile
# Multi-stage build for production optimization

# Stage 1: Build the React application
FROM node:22.23.4-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies needed for build)
RUN npm install --legacy-peer-deps && \
    npm install ajv@^8.12.0 ajv-keywords@^5.1.0 --save-dev --legacy-peer-deps


# Copy source code
COPY . .

# Build-time settings. Public endpoints are not compiled in: the production
# image reads them at container start (see the production stage).
ENV REACT_APP_ENVIRONMENT=production
ENV REACT_APP_API_TIMEOUT=30000
ENV REACT_APP_NETWORK_NAME="ASI Chain"
ENV REACT_APP_NETWORK_ID=asi-mainnet
ENV REACT_APP_ENABLE_WEBSOCKETS=true
ENV REACT_APP_ENABLE_POLLING=true
ENV REACT_APP_POLLING_INTERVAL=5000

ARG REACT_APP_NATIVE_TOKEN_DECIMALS=8
ENV REACT_APP_NATIVE_TOKEN_DECIMALS=${REACT_APP_NATIVE_TOKEN_DECIMALS}

# Build the React application for production
RUN npm run build

# Stage 2: Serve the application with nginx
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY --from=builder /app/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy environment configuration script
COPY --from=builder /app/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=builder /app/docker/write-runtime-config.sh /usr/local/bin/write-runtime-config.sh
RUN chmod +x /docker-entrypoint.sh /usr/local/bin/write-runtime-config.sh

# Public endpoints, written to /config.js at container start. The build
# arguments only set defaults. Runtime environment variables override them.
# GraphQL HTTP and WebSocket URLs are required: without them the container
# exits. Never put a credential here: every value is served to visitors.
ARG REACT_APP_GRAPHQL_URL=
ARG REACT_APP_GRAPHQL_WS_URL=
ARG REACT_APP_INDEXER_API_URL=/api/indexer
ARG REACT_APP_RCHAIN_NODE_URL=
ENV REACT_APP_GRAPHQL_URL=${REACT_APP_GRAPHQL_URL} \
    REACT_APP_GRAPHQL_WS_URL=${REACT_APP_GRAPHQL_WS_URL} \
    REACT_APP_INDEXER_API_URL=${REACT_APP_INDEXER_API_URL} \
    REACT_APP_RCHAIN_NODE_URL=${REACT_APP_RCHAIN_NODE_URL}

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

# Stage 3: Development mode (optional)
FROM node:22.23.4-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install

# Copy source code
COPY . .

# Expose development port
EXPOSE 3000

# Start development server
CMD ["npm", "start"]
