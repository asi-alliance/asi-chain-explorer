#!/bin/sh
# Writes the browser's public endpoint configuration as a JavaScript file.
# Usage: write-runtime-config.sh <output-file>
# Reads REACT_APP_GRAPHQL_URL and REACT_APP_GRAPHQL_WS_URL (required),
# REACT_APP_INDEXER_API_URL (default /api/indexer) and REACT_APP_RCHAIN_NODE_URL
# (optional). Exits non-zero, without writing, when a value is missing or unsafe.
# Every value is public: it is served to every visitor.

set -eu

output=${1:?usage: write-runtime-config.sh <output-file>}
newline='
'
failed=0

fail() {
    echo "runtime config: $1" >&2
    failed=1
}

# check NAME SCHEMES REQUIRED: SCHEMES is an ERE alternation such as "https?".
check() {
    name=$1
    schemes=$2
    required=$3
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        [ "$required" = required ] && fail "$name is required"
        return 0
    fi
    case "$value" in
        *"$newline"*) fail "$name must be a single line"; return 0 ;;
        //*) fail "$name must not be a protocol-relative URL"; return 0 ;;
    esac
    # src/runtimeConfig.ts uses the same grammar, and scripts/runtime-config-cases.tsv
    # holds the cases that both must agree on. Characters outside these sets
    # (quotes, backslashes, angle brackets, spaces) could break out of the
    # generated JavaScript string, so they are rejected rather than escaped.
    # Credentials, a query and a fragment are rejected too.
    # A host is a name, a dotted IPv4 address or a bracketed IPv6 address. The
    # last label of a name must not be a number (all digits or 0x...): browsers
    # parse such a host as IPv4 and reject it when it is not a valid address.
    last='([A-Za-z_-][A-Za-z0-9_-]*|[1-9][A-Za-z0-9_-]*[A-Za-z_-][A-Za-z0-9_-]*|0[A-WYZa-wyz_-][A-Za-z0-9_-]*|0[0-9][A-Za-z0-9_-]*[A-Za-z_-][A-Za-z0-9_-]*)'
    octet='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
    h='[0-9A-Fa-f]{1,4}'
    ipv6="($h:){7}$h|($h:){1,7}:|($h:){1,6}:$h|($h:){1,5}(:$h){1,2}|($h:){1,4}(:$h){1,3}|($h:){1,3}(:$h){1,4}|($h:){1,2}(:$h){1,5}|$h:(:$h){1,6}|:((:$h){1,7}|:)"
    host="(([A-Za-z0-9_-]*\\.)*$last\\.?|($octet\\.){3}$octet|\\[($ipv6)\\])"
    port='(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?'
    path='(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?'
    relative='/([A-Za-z0-9._~!$&()*+,;=:@%-][A-Za-z0-9._~!$&()*+,;=:@%/-]*)?'
    if ! printf '%s' "$value" | grep -Eq "^(($schemes)://$host$port$path|$relative)\$"; then
        case "$schemes" in
            'https?') kind='http or https' ;;
            *) kind='ws or wss' ;;
        esac
        fail "$name must be a $kind URL (lowercase scheme, host, optional port 1-65535, path) or a path starting with /, without credentials, query, fragment or unsafe characters"
    fi
}

: "${REACT_APP_INDEXER_API_URL:=/api/indexer}"

check REACT_APP_GRAPHQL_URL 'https?' required
check REACT_APP_GRAPHQL_WS_URL 'wss?' required
check REACT_APP_INDEXER_API_URL 'https?' optional
check REACT_APP_RCHAIN_NODE_URL 'https?' optional

[ "$failed" -eq 0 ] || exit 1

tmp="$output.tmp.$$"
printf 'window.__ASI_EXPLORER_CONFIG__ = Object.freeze({"REACT_APP_GRAPHQL_URL":"%s","REACT_APP_GRAPHQL_WS_URL":"%s","REACT_APP_INDEXER_API_URL":"%s","REACT_APP_RCHAIN_NODE_URL":"%s"});\n' \
    "$REACT_APP_GRAPHQL_URL" "$REACT_APP_GRAPHQL_WS_URL" "$REACT_APP_INDEXER_API_URL" "${REACT_APP_RCHAIN_NODE_URL:-}" > "$tmp"
mv "$tmp" "$output"
