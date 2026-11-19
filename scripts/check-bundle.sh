#!/usr/bin/env bash
# Fails when a production build contains a browser credential or a compiled-in
# default endpoint in the served code. Source maps are skipped: they hold the
# sources, including development defaults that the production code never runs.
# Usage: scripts/check-bundle.sh [build-dir]. Issue #60.
set -euo pipefail

build=${1:-build}
[ -d "$build/static/js" ] || { echo "no $build/static/js: run npm run build first" >&2; exit 1; }

status=0
check_absent() {
    local description=$1 pattern=$2
    if grep -rIlE --exclude=*.map -- "$pattern" "$build" >/dev/null; then
        echo "FAIL $description:" >&2
        grep -rIoE --exclude=*.map -- "$pattern" "$build" | sort -u | head -5 >&2
        status=1
    else
        echo "ok   no $description"
    fi
}

check_absent "Hasura admin secret header" 'x-hasura-admin-secret'
check_absent "admin secret or bearer token variable" 'REACT_APP_(HASURA_ADMIN_SECRET|AUTH_TOKEN)'
check_absent "bearer authorization header" 'Bearer '
check_absent "localhost endpoint" 'localhost:(8080|40453|9090)'
check_absent "entrypoint placeholder" '_PLACEHOLDER'

grep -q 'src="/config.js"' "$build/index.html" || { echo "FAIL index.html does not load /config.js" >&2; status=1; }
[ "$status" -eq 0 ] && echo "ok   index.html loads /config.js"
exit "$status"
