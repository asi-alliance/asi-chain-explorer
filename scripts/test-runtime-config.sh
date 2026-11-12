#!/usr/bin/env bash
# Tests docker/write-runtime-config.sh: valid endpoints are written as a
# JavaScript object, missing or unsafe endpoints stop the container. Issue #60.
# SH selects the shell, for example SH="busybox sh" to match the nginx:alpine image.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
writer="$root/docker/write-runtime-config.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# run ENV... : runs the writer under POSIX sh with only the given variables.
run() {
    rm -f "$work/config.js"
    env -i PATH="$PATH" "$@" ${SH:-sh} "$writer" "$work/config.js" 2>"$work/stderr"
}

expect_ok() {
    local name=$1 expected=$2
    shift 2
    if run "$@" && [ "$(cat "$work/config.js")" = "$expected" ]; then
        echo "ok   $name"
    else
        echo "FAIL $name"; cat "$work/stderr"; cat "$work/config.js" 2>/dev/null || true
        failures=$((failures + 1))
    fi
}

expect_rejected() {
    local name=$1 message=$2
    shift 2
    if run "$@"; then
        echo "FAIL $name: accepted"; failures=$((failures + 1))
    elif [ -e "$work/config.js" ]; then
        echo "FAIL $name: wrote a file"; failures=$((failures + 1))
    elif ! grep -q -- "$message" "$work/stderr"; then
        echo "FAIL $name: expected '$message' in:"; cat "$work/stderr"; failures=$((failures + 1))
    else
        echo "ok   $name"
    fi
}

HTTP=REACT_APP_GRAPHQL_URL=https://hasura.example.test/v1/graphql
WS=REACT_APP_GRAPHQL_WS_URL=wss://hasura.example.test/v1/graphql

expect_ok "writes non-default endpoints" \
    'window.__ASI_EXPLORER_CONFIG__ = Object.freeze({"REACT_APP_GRAPHQL_URL":"https://hasura.example.test/v1/graphql","REACT_APP_GRAPHQL_WS_URL":"wss://hasura.example.test/v1/graphql","REACT_APP_INDEXER_API_URL":"/api/indexer","REACT_APP_RCHAIN_NODE_URL":"https://node.example.test:40453"});' \
    "$HTTP" "$WS" REACT_APP_RCHAIN_NODE_URL=https://node.example.test:40453

expect_ok "accepts same-origin paths and IP hosts" \
    'window.__ASI_EXPLORER_CONFIG__ = Object.freeze({"REACT_APP_GRAPHQL_URL":"/v1/graphql","REACT_APP_GRAPHQL_WS_URL":"ws://192.0.2.10:8080/v1/graphql","REACT_APP_INDEXER_API_URL":"/indexer","REACT_APP_RCHAIN_NODE_URL":""});' \
    REACT_APP_GRAPHQL_URL=/v1/graphql REACT_APP_GRAPHQL_WS_URL=ws://192.0.2.10:8080/v1/graphql REACT_APP_INDEXER_API_URL=/indexer

expect_rejected "missing endpoints" "REACT_APP_GRAPHQL_URL is required"
expect_rejected "missing WebSocket endpoint" "REACT_APP_GRAPHQL_WS_URL is required" "$HTTP"
expect_rejected "WebSocket URL for HTTP" "REACT_APP_GRAPHQL_URL must be" \
    REACT_APP_GRAPHQL_URL=wss://hasura.example.test/v1/graphql "$WS"
expect_rejected "HTTP URL for subscriptions" "REACT_APP_GRAPHQL_WS_URL must be" \
    "$HTTP" REACT_APP_GRAPHQL_WS_URL=https://hasura.example.test/v1/graphql
expect_rejected "quote breaks out of the string" "REACT_APP_GRAPHQL_URL must be" \
    'REACT_APP_GRAPHQL_URL=https://evil.example.test/"});alert(1);//' "$WS"
expect_rejected "backslash" "REACT_APP_GRAPHQL_URL must be" \
    'REACT_APP_GRAPHQL_URL=https://hasura.example.test/v1\graphql' "$WS"
expect_rejected "script tag" "REACT_APP_GRAPHQL_URL must be" \
    'REACT_APP_GRAPHQL_URL=https://hasura.example.test/</script>' "$WS"
expect_rejected "space" "REACT_APP_GRAPHQL_URL must be" \
    'REACT_APP_GRAPHQL_URL=https://hasura.example.test/v1 graphql' "$WS"
expect_rejected "newline" "REACT_APP_GRAPHQL_URL must be a single line" \
    "REACT_APP_GRAPHQL_URL=https://hasura.example.test/v1/graphql
x" "$WS"
expect_rejected "credentials in URL" "REACT_APP_GRAPHQL_URL must be" \
    REACT_APP_GRAPHQL_URL=https://admin:secret@hasura.example.test/v1/graphql "$WS"
expect_rejected "protocol-relative URL" "protocol-relative" \
    REACT_APP_GRAPHQL_URL=//hasura.example.test/v1/graphql "$WS"
expect_rejected "javascript scheme" "REACT_APP_GRAPHQL_URL must be" \
    'REACT_APP_GRAPHQL_URL=javascript:alert(1)' "$WS"
expect_rejected "invalid optional node URL" "REACT_APP_RCHAIN_NODE_URL must be" \
    "$HTTP" "$WS" REACT_APP_RCHAIN_NODE_URL=ftp://node.example.test

if [ "$failures" -ne 0 ]; then
    echo "$failures runtime config test(s) failed" >&2
    exit 1
fi
echo "all runtime config tests passed"
