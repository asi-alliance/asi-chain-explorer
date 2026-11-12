#!/usr/bin/env bash
# Builds the production image and checks its startup contract (issue #60):
# - missing or unsafe endpoints stop the container;
# - runtime endpoints reach the served /config.js, uncached, over build defaults;
# - the served code contains no browser credential or localhost endpoint.
# Usage: scripts/test-docker-image.sh  (needs Docker and curl)
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
image=asi-explorer-config-test:$$
label=asi-explorer-config-test=$$
failures=0

cleanup() {
    docker ps -aq --filter "label=$label" | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker image rm -f "$image" "$image-defaults" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1" >&2; failures=$((failures + 1)); }

HTTP_URL=https://hasura.example.test/v1/graphql
WS_URL=wss://hasura.example.test/v1/graphql
NODE_URL=https://node.example.test:40453

docker build -q --target production -t "$image" "$root" >/dev/null
docker build -q --target production -t "$image-defaults" \
    --build-arg REACT_APP_GRAPHQL_URL=https://build-default.example.test/v1/graphql \
    --build-arg REACT_APP_GRAPHQL_WS_URL=wss://build-default.example.test/v1/graphql \
    "$root" >/dev/null

# expect_exit NAME MESSAGE IMAGE [ENV...]: the container must stop with MESSAGE in its log.
expect_exit() {
    local name=$1 message=$2 tag=$3
    shift 3
    local args=() id code
    for pair in "$@"; do args+=(-e "$pair"); done
    id=$(docker run -d --label "$label" "${args[@]}" "$tag")
    code=$(timeout 30 docker wait "$id" || echo running)
    if [ "$code" != running ] && [ "$code" != 0 ] && docker logs "$id" 2>&1 | grep -q -- "$message"; then
        pass "$name (exit $code)"
    else
        fail "$name (exit $code)"; docker logs "$id" 2>&1 | tail -5 >&2
    fi
}

# serve IMAGE [ENV...]: starts the container and prints its base URL.
serve() {
    local tag=$1 args=() id port
    shift
    for pair in "$@"; do args+=(-e "$pair"); done
    # Same host alias as docker-compose.standalone.yml: nginx resolves the indexer
    # status upstream at startup.
    id=$(docker run -d --label "$label" --add-host host.docker.internal:host-gateway \
        -p 127.0.0.1::80 "${args[@]}" "$tag")
    port=$(docker port "$id" 80/tcp | head -1 | sed 's/.*://')
    for _ in $(seq 1 30); do
        curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1 && break
        sleep 1
    done
    echo "http://127.0.0.1:$port"
}

expect_exit "rejects a container without endpoints" "REACT_APP_GRAPHQL_URL is required" "$image"
expect_exit "rejects a container without a WebSocket endpoint" "REACT_APP_GRAPHQL_WS_URL is required" \
    "$image" REACT_APP_GRAPHQL_URL=$HTTP_URL
expect_exit "rejects an unsafe endpoint" "REACT_APP_GRAPHQL_URL must be" \
    "$image" 'REACT_APP_GRAPHQL_URL=https://x.example.test/"});alert(1);//' REACT_APP_GRAPHQL_WS_URL=$WS_URL

base=$(serve "$image" REACT_APP_GRAPHQL_URL=$HTTP_URL REACT_APP_GRAPHQL_WS_URL=$WS_URL REACT_APP_RCHAIN_NODE_URL=$NODE_URL)
config=$(curl -fsS -D "$root/.config-headers" "$base/config.js")
expected="window.__ASI_EXPLORER_CONFIG__ = Object.freeze({\"REACT_APP_GRAPHQL_URL\":\"$HTTP_URL\",\"REACT_APP_GRAPHQL_WS_URL\":\"$WS_URL\",\"REACT_APP_INDEXER_API_URL\":\"/api/indexer\",\"REACT_APP_RCHAIN_NODE_URL\":\"$NODE_URL\"});"
[ "$config" = "$expected" ] && pass "serves runtime endpoints in /config.js" || { fail "served /config.js"; echo "$config" >&2; }
grep -qi '^cache-control: no-store' "$root/.config-headers" && pass "/config.js is not cached" || fail "/config.js cache headers"
rm -f "$root/.config-headers"
curl -fsS "$base/" | grep -q 'src="/config.js"' && pass "index.html loads /config.js" || fail "index.html does not load /config.js"

assets=$(curl -fsS "$base/asset-manifest.json" | grep -oE '"/static/js/[^"]+\.js"' | tr -d '"')
[ -n "$assets" ] || fail "no JavaScript assets in asset-manifest.json"
leaks=0
for asset in $assets; do
    if curl -fsS "$base$asset" | grep -qE 'x-hasura-admin-secret|REACT_APP_(HASURA_ADMIN_SECRET|AUTH_TOKEN)|localhost:(8080|40453)'; then
        fail "served $asset contains a credential header or localhost endpoint"; leaks=1
    fi
done
[ "$leaks" -eq 0 ] && pass "served JavaScript has no credential or localhost endpoint"

base=$(serve "$image-defaults")
curl -fsS "$base/config.js" | grep -q '"REACT_APP_GRAPHQL_URL":"https://build-default.example.test/v1/graphql"' \
    && pass "build arguments act as defaults" || fail "build-argument defaults"
base=$(serve "$image-defaults" REACT_APP_GRAPHQL_URL=$HTTP_URL REACT_APP_GRAPHQL_WS_URL=$WS_URL)
curl -fsS "$base/config.js" | grep -q "\"REACT_APP_GRAPHQL_URL\":\"$HTTP_URL\"" \
    && pass "runtime variables override build defaults" || fail "runtime override of build defaults"

if [ "$failures" -ne 0 ]; then
    echo "$failures image check(s) failed" >&2
    exit 1
fi
echo "all image checks passed"
