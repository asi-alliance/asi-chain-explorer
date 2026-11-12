#!/usr/bin/env bash
# Tests served_js_absent (scripts/lib/served-js.sh) without Docker or a network.
# A stub curl serves files from a fixture site. The check must fail on a leak in
# a large asset, on an asset or manifest that does not download, and on a
# manifest without JavaScript. Issue #60.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Stub curl: supports -f, -s, -S, -o FILE and one http://fixture.test URL.
# A missing file exits 22 like curl -f. Without -o it writes to stdout.
mkdir "$work/bin"
cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
out= url=
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o) out=$2; shift 2 ;;
        -*) shift ;;
        *) url=$1; shift ;;
    esac
done
file="$SITE/${url#http://fixture.test/}"
if [ ! -f "$file" ]; then
    echo "curl: (22) The requested URL returned error: 404" >&2
    exit 22
fi
if [ -n "$out" ]; then cp "$file" "$out"; else cat "$file"; fi
STUB
chmod +x "$work/bin/curl"
export PATH="$work/bin:$PATH"

# shellcheck source=scripts/lib/served-js.sh
. "${SERVED_JS_LIB:-$root/scripts/lib/served-js.sh}"

outcome=
pass() { outcome=pass; }
fail() { outcome=fail; }

failures=0
MARKER=dotenv.example.test
PATTERN='(build-default|dotenv)\.example\.test'

# site NAME: a fixture site with a manifest that lists main.js and chunk.js.
site() {
    SITE="$work/$1"
    export SITE
    mkdir -p "$SITE/static/js"
    printf '{"files":{"main.js":"/static/js/main.js","chunk.js":"/static/js/chunk.js"}}' > "$SITE/asset-manifest.json"
    echo 'console.log("clean")' > "$SITE/static/js/main.js"
    # 1 MiB of short lines, like a bundle: grep -q can stop after the first block.
    yes 'var a = 1;' | head -c 1048576 > "$SITE/static/js/chunk.js" || true
}

expect() {
    local name=$1 expected=$2
    outcome=none
    served_js_absent "$name" http://fixture.test "$PATTERN"
    if [ "$outcome" = "$expected" ]; then
        echo "ok   $name: $expected"
    else
        echo "FAIL $name: expected $expected, got $outcome"; failures=$((failures + 1))
    fi
}

site clean
expect "clean assets, one of 1 MiB" pass

site leak-start
{ printf '%s\n' "$MARKER"; cat "$SITE/static/js/chunk.js"; } > "$SITE/chunk.tmp" && mv "$SITE/chunk.tmp" "$SITE/static/js/chunk.js"
expect "1 MiB asset that starts with the marker" fail

site leak-end
printf '%s' "$MARKER" >> "$SITE/static/js/chunk.js"
expect "1 MiB asset that ends with the marker" fail

site missing-asset
rm "$SITE/static/js/chunk.js"
expect "asset that returns 404" fail

site missing-manifest
rm "$SITE/asset-manifest.json"
expect "manifest that returns 404" fail

site empty-manifest
echo '{"files":{}}' > "$SITE/asset-manifest.json"
expect "manifest without JavaScript" fail

if [ "$failures" -ne 0 ]; then
    echo "$failures served JavaScript check test(s) failed" >&2
    exit 1
fi
echo "all served JavaScript check tests passed"
