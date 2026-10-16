#!/usr/bin/env bash
# Local HTML deliverables (mockups, reports, reviews, explainers) for the operator.
#   pages.sh serve              serve runs/mockups on http://127.0.0.1:8791/ (idempotent)
#   pages.sh check FILE...      fail if a page would make any network request on load
#   pages.sh inline-fonts FILE... replace viewer font URLs with data: URIs, in place
set -euo pipefail

root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
pages="$root/runs/mockups"
port=8791

link() {
    [[ -e "$pages/$1" || -L "$pages/$1" ]] || ln -s "$2" "$pages/$1"
}

serve() {
    mkdir -p "$pages" "$root/runs/reports" "$root/runs/reviews"
    link reports ../reports
    link reviews ../reviews
    link explainers ../../docs/explainers
    link experiments ../../docs/experiments
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "pages already at http://127.0.0.1:$port/"
        return
    fi
    nohup python3 -m http.server "$port" --bind 127.0.0.1 --directory "$pages" \
        >"$root/runs/pages-$port.log" 2>&1 &
    echo "pages at http://127.0.0.1:$port/"
}

check() {
    local bad=0 f
    for f in "$@"; do
        if grep -nEo '<(script|img|iframe|source|video|audio|embed)[^>]*src=["'"'"']?(https?:)?//[^"'"'"' >]*|<link[^>]*href=["'"'"']?(https?:)?//[^"'"'"' >]*|url\(["'"'"']?((https?:)?//|\.\./|/)[^)]*\)|@import[^;]*|fetch\([^)]*\)' "$f"; then
            echo "^ $f loads something from outside the page" >&2
            bad=1
        fi
    done
    return "$bad"
}

inline_fonts() {
    python3 -I - "$root/packages/viewer/static/fonts" "$@" <<'PY'
import base64, pathlib, re, sys
fonts = pathlib.Path(sys.argv[1])
pattern = re.compile(r"url\((['\"]?)[^)'\"]*?/fonts/([a-z0-9-]+\.woff2)\1\)")
for name in sys.argv[2:]:
    page = pathlib.Path(name)
    text = page.read_text()
    def data_uri(match):
        encoded = base64.b64encode((fonts / match.group(2)).read_bytes()).decode()
        return f"url(data:font/woff2;base64,{encoded})"
    page.write_text(pattern.sub(data_uri, text))
PY
}

case "${1:-}" in
    serve) serve ;;
    check) shift; check "$@" ;;
    inline-fonts) shift; inline_fonts "$@" ;;
    *) echo "usage: pages.sh serve | check FILE... | inline-fonts FILE..." >&2; exit 2 ;;
esac
