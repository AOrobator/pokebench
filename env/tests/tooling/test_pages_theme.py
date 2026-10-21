"""`scripts/pages.sh theme` gives a local HTML page the Emerald PokéNav theme.

The page's text stays as it was.
"""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PAGES = ROOT / "scripts" / "pages.sh"
BLOCK = re.compile(r'<style id="pb-emerald">.*?</style>\n', re.S)


def theme(*pages: Path) -> None:
    subprocess.run([str(PAGES), "theme", *map(str, pages)], cwd=ROOT, check=True)


def check(*pages: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PAGES), "check", *map(str, pages)], cwd=ROOT, capture_output=True, text=True
    )


def test_head_page_gets_one_block_after_its_own_css_with_the_font_inline(tmp_path: Path) -> None:
    page = tmp_path / "report.html"
    page.write_text(
        "<!doctype html><html><head><style>h1{color:red}</style></head>"
        "<body><main><h1>Roxanne (2 of 3)</h1></main></body></html>"
    )
    theme(page)
    text = page.read_text()
    assert text.count('<style id="pb-emerald">') == 1
    assert (
        text.index("h1{color:red}") < text.index('<style id="pb-emerald">') < text.index("</head>")
    )
    assert "url(data:font/woff2;base64," in text
    assert "/fonts/press-start-2p.woff2" not in text
    assert "<main data-pb-emerald>" not in text
    assert check(page).returncode == 0


def test_rerun_is_byte_identical(tmp_path: Path) -> None:
    page = tmp_path / "explainer.html"
    page.write_text("<!doctype html><meta charset=utf-8><style>p{}</style><h1>T</h1><p>x</p>")
    theme(page)
    once = page.read_text()
    theme(page)
    assert page.read_text() == once


def test_main_less_page_is_wrapped_once_and_text_is_unchanged(tmp_path: Path) -> None:
    source = (
        "<!doctype html><html lang=en><meta charset=utf-8>"
        "<style>body{max-width:760px}</style><h1>Clock</h1><p>Default OFF.</p>"
    )
    first, second = tmp_path / "a.html", tmp_path / "b.html"
    first.write_text(source)
    second.write_text(source)
    theme(first, second)
    for page in (first, second):
        text = page.read_text()
        assert text.count("<main") == 1 and text.count("</main>") == 1
        assert (
            text.index('<style id="pb-emerald">')
            < text.index("<main data-pb-emerald>")
            < text.index("<h1>")
        )
        assert text.rstrip().endswith("</main>")
        assert (
            BLOCK.sub("", text).replace("<main data-pb-emerald>\n", "").replace("</main>\n", "")
            == source
        )


def test_colour_scheme_queries_pin_the_light_palette(tmp_path: Path) -> None:
    page = tmp_path / "glm.html"
    page.write_text(
        "<!doctype html><html><head><style>:root{--bg:#000}"
        "@media (prefers-color-scheme: light){:root{--bg:#fff}}"
        "@media (prefers-color-scheme:dark){:root{--bg:#111}}</style></head>"
        "<body><main></main></body></html>"
    )
    theme(page)
    css = BLOCK.sub("", page.read_text())
    assert "prefers-color-scheme" not in css
    assert "@media (min-width:0px){:root{--bg:#fff}}" in css
    assert "@media (min-width:1000000px){:root{--bg:#111}}" in css


def test_main_less_page_closes_main_before_html_end(tmp_path: Path) -> None:
    page = tmp_path / "pilot.html"
    page.write_text(
        "<!doctype html><html><meta charset=utf-8><style>p{}</style><h1>T</h1></html>\n"
    )
    theme(page)
    text = page.read_text()
    assert text.index("<h1>") < text.index("</main>") < text.index("</html>")


def test_main_opens_inside_body_not_head(tmp_path: Path) -> None:
    page = tmp_path / "report.html"
    page.write_text(
        "<!doctype html><html><head><style>p{}</style></head>"
        '<body class="r"><h1>T</h1></body></html>'
    )
    theme(page)
    text = page.read_text()
    assert (
        text.index("</head>")
        < text.index('<body class="r">')
        < text.index("<main data-pb-emerald>")
    )
    assert text.index("<main data-pb-emerald>") < text.index("<h1>") < text.index("</main>")
    assert text.index("</main>") < text.index("</body>")
    assert text.index('<style id="pb-emerald">') < text.index("</head>")


def test_rerun_repairs_an_earlier_wrap(tmp_path: Path) -> None:
    page = tmp_path / "old.html"
    page.write_text(
        "<!doctype html><html><meta charset=utf-8><style>p{}</style>"
        '<style id="pb-emerald">\nx</style>\n'
        "<main data-pb-emerald>\n<h1>T</h1></html></main>\n"
    )
    theme(page)
    text = page.read_text()
    assert text.count("<main") == 1 and text.count("</main>") == 1
    assert text.index("<h1>") < text.index("</main>") < text.index("</html>")


def test_colour_scheme_text_outside_styles_is_left_alone(tmp_path: Path) -> None:
    prose = "<p><code>@media (prefers-color-scheme: dark)</code> is ignored.</p>"
    page = tmp_path / "css.html"
    page.write_text(
        "<!doctype html><html><head><style>@media (prefers-color-scheme: dark){p{}}</style></head>"
        f"<body><main>{prose}</main></body></html>"
    )
    theme(page)
    text = page.read_text()
    assert prose in text
    assert "@media (min-width:1000000px){p{}}" in text


def test_crlf_and_utf8_survive(tmp_path: Path) -> None:
    page = tmp_path / "crlf.html"
    page.write_bytes(
        (
            "<!doctype html>\r\n<html><head><style>p{}</style></head>\r\n"
            "<body><main><h1>POKéMON</h1></main></body></html>\r\n"
        ).encode()
    )
    theme(page)
    data = page.read_bytes()
    assert "<h1>POKéMON</h1>".encode() in data
    assert b"<!doctype html>\r\n<html>" in data and data.endswith(b"</html>\r\n")


def test_orphan_wrap_marker_never_cuts_the_page(tmp_path: Path) -> None:
    source = (
        "<!doctype html><html><head></head><body><main data-pb-emerald>\n<h1>T</h1></body></html>"
    )
    page = tmp_path / "orphan.html"
    page.write_text(source)
    theme(page)
    assert BLOCK.sub("", page.read_text()) == source
