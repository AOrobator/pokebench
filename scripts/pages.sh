#!/usr/bin/env bash
# Local HTML deliverables (mockups, reports, reviews, explainers) for the operator.
#   pages.sh serve              serve runs/mockups on http://127.0.0.1:8791/ (idempotent)
#   pages.sh check FILE...      fail if a page would make any network request on load
#   pages.sh inline-fonts FILE... replace viewer font URLs with data: URIs, in place
#   pages.sh theme FILE...      add (or refresh) the Emerald theme, docs/design/emerald-pages.css, in place
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
from __future__ import annotations
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

# The theme pins the light palette: a page's prefers-color-scheme queries are rewritten so its
# dark block never applies and its light block always does. A page with no <main> gets one around its
# body content, since the theme draws the PokéNav screen on <main>. Re-running replaces the block.
theme() {
    python3 -I - "$(git rev-parse --show-toplevel)" "$@" <<'PY'
from __future__ import annotations
import base64, pathlib, re, sys
top = pathlib.Path(sys.argv[1])
font = base64.b64encode((top / "packages/viewer/static/fonts/press-start-2p.woff2").read_bytes()).decode()
css = (top / "docs/design/emerald-pages.css").read_text(encoding="utf-8").replace(
    "url(/fonts/press-start-2p.woff2)", f"url(data:font/woff2;base64,{font})"
)
block = f'<style id="pb-emerald">\n{css}</style>\n'
old = re.compile(r'<style id="pb-emerald">.*?</style>\n?', re.S)
wrap = "<main data-pb-emerald>\n"
style = re.compile(r"(<style\b[^>]*>)(.*?)(</style>)", re.S | re.I)
dark = re.compile(r"\(\s*prefers-color-scheme\s*:\s*dark\s*\)", re.I)
light = re.compile(r"\(\s*prefers-color-scheme\s*:\s*light\s*\)", re.I)


def pin_light(match: re.Match[str]) -> str:
    rules = light.sub("(min-width:0px)", dark.sub("(min-width:1000000px)", match.group(2)))
    return match.group(1) + rules + match.group(3)


def first(pattern: str, text: str) -> re.Match[str] | None:
    return re.search(pattern, text, re.I)


def last(pattern: str, text: str) -> re.Match[str] | None:
    found = None
    for found in re.finditer(pattern, text, re.I):
        pass
    return found


for name in sys.argv[2:]:
    page = pathlib.Path(name)
    with page.open(encoding="utf-8", newline="") as handle:
        text = old.sub("", handle.read())
    closing = text.rfind("</main>\n")
    if wrap in text and closing > text.find(wrap):
        text = text[:closing] + text[closing + len("</main>\n"):]
        text = text.replace(wrap, "", 1)
    text = style.sub(pin_light, text)
    if (head := first(r"</head\s*>", text)) is not None:
        at = head.start()
    elif (styles := last(r"</style\s*>", text)) is not None:
        at = styles.end()
    else:
        doctype = first(r"<!doctype[^>]*>", text)
        at = doctype.end() if doctype else 0
    text = text[:at] + block + text[at:]
    if first(r"<main\b", text) is None:
        body = first(r"<body\b[^>]*>", text)
        head = first(r"</head\s*>", text)
        opening = body.end() if body else head.end() if head else at + len(block)
        close = first(r"</body\s*>", text) or first(r"</html\s*>", text)
        closing = close.start() if close else len(text.rstrip())
        text = text[:opening] + wrap + text[opening:closing] + "</main>\n" + text[closing:]
    with page.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)
PY
}

case "${1:-}" in
    serve) serve ;;
    check) shift; check "$@" ;;
    inline-fonts) shift; inline_fonts "$@" ;;
    theme) shift; theme "$@" ;;
    *) echo "usage: pages.sh serve | check FILE... | inline-fonts FILE... | theme FILE..." >&2; exit 2 ;;
esac
