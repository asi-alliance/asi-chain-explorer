#!/bin/sh

# ASI-Chain Explorer Docker Entrypoint Script
# Writes the nginx configuration and the browser's public endpoint configuration
# (/config.js) from the container environment, then starts nginx.

set -e

# Keep the monitoring upstream server-side; the browser uses /api/indexer/status.
export INDEXER_STATUS_URL="${INDEXER_STATUS_URL:-http://host.docker.internal:9090/status}"
case "$INDEXER_STATUS_URL" in
    http://*/status|https://*/status) ;;
    *) echo "INDEXER_STATUS_URL must be an HTTP(S) URL ending in /status" >&2; exit 1 ;;
esac
envsubst '${INDEXER_STATUS_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Public endpoints for the browser. A missing or unsafe value stops the container
# instead of serving a bundle that connects to an unrelated default service.
if ! /usr/local/bin/write-runtime-config.sh /usr/share/nginx/html/config.js; then
    echo "Set REACT_APP_GRAPHQL_URL and REACT_APP_GRAPHQL_WS_URL to the public Hasura endpoints" >&2
    exit 1
fi
echo "Explorer endpoints: GraphQL ${REACT_APP_GRAPHQL_URL}, subscriptions ${REACT_APP_GRAPHQL_WS_URL}"

exec "$@"
