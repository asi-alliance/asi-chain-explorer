#!/bin/sh

# ASI-Chain Explorer Docker Entrypoint Script
# This script handles environment variable substitution in production builds

set -e

# Keep the monitoring upstream server-side; the browser uses /api/indexer/status.
export INDEXER_STATUS_URL="${INDEXER_STATUS_URL:-http://host.docker.internal:9090/status}"
case "$INDEXER_STATUS_URL" in
    http://*/status|https://*/status) ;;
    *) echo "INDEXER_STATUS_URL must be an HTTP(S) URL ending in /status" >&2; exit 1 ;;
esac
envsubst '${INDEXER_STATUS_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Function to replace environment variables in built files
replace_env_vars() {
    echo "🔧 Configuring environment variables..."
    
    # Find the main JS file
    MAIN_JS=$(find /usr/share/nginx/html/static/js -name "main.*.js" | head -1)
    
    if [ -n "$MAIN_JS" ]; then
        echo "📄 Found main JS file: $MAIN_JS"
        
        # Replace environment variables
        sed -i "s|REACT_APP_GRAPHQL_URL_PLACEHOLDER|${REACT_APP_GRAPHQL_URL:-http://localhost:8080/v1/graphql}|g" "$MAIN_JS"
        sed -i "s|REACT_APP_GRAPHQL_WS_URL_PLACEHOLDER|${REACT_APP_GRAPHQL_WS_URL:-ws://localhost:8080/v1/graphql}|g" "$MAIN_JS"
        sed -i "s|REACT_APP_RCHAIN_NODE_URL_PLACEHOLDER|${REACT_APP_RCHAIN_NODE_URL:-http://localhost:40453}|g" "$MAIN_JS"
        
        echo "✅ Environment variables configured"
    else
        echo "⚠️  Main JS file not found, using default configuration"
    fi
}

# Replace environment variables if in production mode
if [ "${NODE_ENV:-production}" = "production" ]; then
    replace_env_vars
fi

echo "🚀 Starting ASI-Chain Explorer..."

# Execute the main command
exec "$@"
