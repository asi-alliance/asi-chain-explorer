# Sourced by scripts/test-docker-image.sh and scripts/test-served-js-check.sh.
# The caller defines pass NAME, fail MESSAGE and the work directory $work.

# served_js_absent NAME BASE PATTERN: passes only when asset-manifest.json and
# every JavaScript asset that it lists download from BASE, and no asset matches
# the extended regular expression PATTERN. A download or scan error fails.
# Each file is downloaded before grep runs: with pipefail, `curl | grep -q`
# reports a failure when grep stops reading early, which hides a match.
served_js_absent() {
    local name=$1 base=$2 pattern=$3 dir assets asset status problems=0
    dir=$(mktemp -d "$work/served-js.XXXXXX")
    if ! curl -fsS -o "$dir/manifest.json" "$base/asset-manifest.json"; then
        fail "$name: cannot download asset-manifest.json"
        rm -rf "$dir"; return 0
    fi
    assets=$(grep -oE '"/static/js/[^"]+\.js"' "$dir/manifest.json" | tr -d '"' || true)
    if [ -z "$assets" ]; then
        fail "$name: no JavaScript assets in asset-manifest.json"
        rm -rf "$dir"; return 0
    fi
    for asset in $assets; do
        if ! curl -fsS -o "$dir/asset.js" "$base$asset"; then
            fail "$name: cannot download $asset"; problems=$((problems + 1)); continue
        fi
        status=0
        grep -qE -- "$pattern" "$dir/asset.js" || status=$?
        case "$status" in
            0) fail "$name: $asset matches $pattern"; problems=$((problems + 1)) ;;
            1) ;;
            *) fail "$name: cannot scan $asset (grep exit $status)"; problems=$((problems + 1)) ;;
        esac
    done
    rm -rf "$dir"
    if [ "$problems" -eq 0 ]; then pass "$name"; fi
}
