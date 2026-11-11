"""Markdown twins of the HTML explainers, readable on GitHub.

Each ``docs/explainers/<id>.html`` gets ``docs/explainers/md/<id>.md``; its inline SVG
diagrams become ``md/<id>/fig-N.svg`` (with the page's style rules and a solid background)
and its data-URI images ``md/<id>/img-N.png``. The same pass writes the explainer index
``docs/explainers/README.md`` and the switch table ``docs/features.md``. The HTML stays the
source; every output is a pure function of the inputs, so a drift check can regenerate and
compare.

The core works on strings and returns ``{repo-relative path: bytes}``; ``main`` is the thin
disk entrypoint.
"""

from __future__ import annotations

import base64
import binascii
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from html.entities import name2codepoint
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol

EXPLAINERS = "docs/explainers"
TWINS = f"{EXPLAINERS}/md"
INDEX = f"{EXPLAINERS}/README.md"
FEATURES_MD = "docs/features.md"
FEATURES_TS = "packages/agent/src/features.ts"
PANELS_TS = "packages/viewer/src/panels.ts"
NEXT_RUN_TS = "packages/viewer/src/next-run.ts"
RUN_SNAPSHOT = "docs/data/run-67d7-features.json"
GENERATOR = "env/pokebench_env/explainer_twins.py"
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
BACKGROUND = "#ffffff"
BASE_FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif'

ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

VOID = frozenset("area base br col embed hr img input link meta param source track wbr".split())
SKIP = frozenset("head style script noscript template button input select textarea".split())
BLOCK = frozenset(
    "address article aside blockquote body details dd div dl dt figcaption figure footer "
    "h1 h2 h3 h4 h5 h6 header hr html li main nav ol p pre section summary table tbody td "
    "tfoot th thead tr ul".split()
)
CONTAINERS = frozenset(
    "address article aside body div footer header html main nav section tbody thead tfoot".split()
)


# ---------------------------------------------------------------- privacy and branch scrub

_SCRUBS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"/Users/[^/\s\"'<>`]+/"), "~/"),
    (re.compile(r"/home/[^/\s\"'<>`]+/"), "~/"),
    (re.compile(r"\b[\w-]+(?:\.[\w-]+)*\.ts\.net\b(?::\d+)?"), "<tailnet-host>"),
    (
        re.compile(
            r"(?<![\d.])(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01])"
            r"|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}(?![\d.])"
        ),
        "<private-ip>",
    ),
    (re.compile(r"https?://claude\.ai/[^\s)\"'<>`]*"), "<chat-link>"),
    (re.compile(r"\b(?:cmsg|chan|session|local)_[0-9A-Za-z-]{12,}\b"), "<chat-id>"),
    (re.compile(r"[\w.+-]+@(?:gmail|icloud|me|outlook|hotmail)\.com\b"), "<email>"),
    (
        re.compile(r"(?<![\w./~-])(?:claude|codex)/[A-Za-z0-9][\w./-]*[\w]"),
        "a working branch",
    ),
    (
        re.compile(r"\b(?:andrew\W?orobator|a?orobator|andrew|The operator)\b", re.I),
        "Operator",
    ),
)


def scrub(text: str) -> str:
    """Remove machine paths, tailnet hosts, private IPs, chat ids, emails, branch names and the
    operator's real name (written as Operator, the operator's decision 2026-11-11)."""
    for pattern, replacement in _SCRUBS:
        text = pattern.sub(replacement, text)
    return text


# ---------------------------------------------------------------- tiny DOM


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list[Node | str] = field(default_factory=list)

    def text(self) -> str:
        out: list[str] = []
        for child in self.children:
            if isinstance(child, str):
                out.append(child)
            elif child.tag == "br":
                out.append("\n")
            elif child.tag not in SKIP:
                out.append(child.text())
        return "".join(out)

    def find_all(self, tag: str) -> list[Node]:
        found: list[Node] = []
        for child in self.children:
            if isinstance(child, Node):
                if child.tag == tag:
                    found.append(child)
                found.extend(child.find_all(tag))
        return found


class _Builder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {k: v or "" for k, v in attrs})
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.stack[-1].children.append(Node(tag, {k: v or "" for k, v in attrs}))

    def handle_endtag(self, tag: str) -> None:
        for depth in range(len(self.stack) - 1, 0, -1):
            if self.stack[depth].tag == tag:
                del self.stack[depth:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def parse_html(source: str) -> Node:
    builder = _Builder()
    builder.feed(source)
    builder.close()
    return builder.root


# ---------------------------------------------------------------- SVG extraction

_SVG_TAG = re.compile(r"<svg\b|</svg\s*>", re.I)
_STYLE_BLOCK = re.compile(r"<style\b([^>]*)>(.*?)</style\s*>", re.S | re.I)
_ENTITY = re.compile(r"&([A-Za-z][A-Za-z0-9]*);")
_XML_ENTITIES = frozenset({"amp", "lt", "gt", "quot", "apos"})


def split_svgs(source: str) -> tuple[str, list[str]]:
    """Replace each top-level ``<svg>…</svg>`` with a placeholder element; return the SVGs."""
    svgs: list[str] = []
    out: list[str] = []
    depth = 0
    start = 0
    cursor = 0
    for match in _SVG_TAG.finditer(source):
        if match.group(0).startswith("</"):
            if depth == 0:
                continue
            depth -= 1
            if depth == 0:
                svgs.append(source[start : match.end()])
                out.append(f'<pbsvg data-i="{len(svgs) - 1}"></pbsvg>')
                cursor = match.end()
        else:
            if depth == 0:
                out.append(source[cursor : match.start()])
                start = match.start()
            depth += 1
    if depth == 0:
        out.append(source[cursor:])
    return "".join(out), svgs


def _xml_entities(svg: str) -> str:
    def fix(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in _XML_ENTITIES or name not in name2codepoint:
            return match.group(0)
        return f"&#{name2codepoint[name]};"

    return _ENTITY.sub(fix, svg)


def parse_svg(svg: str) -> ET.Element | None:
    text = _xml_entities(svg)
    if "xmlns=" not in text.split(">", 1)[0]:
        text = text.replace("<svg", f'<svg xmlns="{SVG_NS}"', 1)
    if "xlink:" in text and "xmlns:xlink" not in text.split(">", 1)[0]:
        text = text.replace("<svg", f'<svg xmlns:xlink="{XLINK_NS}"', 1)
    try:
        return ET.fromstring(text)  # noqa: S314 - repository HTML, no external entities
    except ET.ParseError:
        return None


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def is_hidden_holder(root: ET.Element) -> bool:
    """Not a figure: zero size, only <defs> (the page's pattern store), or decorative."""
    if root.get("width") in {"0", "0px"} or root.get("height") in {"0", "0px"}:
        return True
    if root.get("aria-hidden") == "true":
        return True
    kids = [_local(child.tag) for child in root]
    return bool(kids) and all(kid in {"defs", "style", "title", "desc"} for kid in kids)


def collect_defs(roots: Iterable[ET.Element]) -> dict[str, ET.Element]:
    found: dict[str, ET.Element] = {}
    for root in roots:
        for defs in root.iter(f"{{{SVG_NS}}}defs"):
            for child in defs.iter():
                ident = child.get("id")
                if ident and child is not defs and ident not in found:
                    found[ident] = child
    return found


_REF = re.compile(r"url\(\s*['\"]?#([^)'\"\s]+)['\"]?\s*\)")


def _refs(element: ET.Element) -> set[str]:
    refs: set[str] = set()
    for node in element.iter():
        for key, value in node.attrib.items():
            if _local(key) == "href" and value.startswith("#"):
                refs.add(value[1:])
            refs.update(_REF.findall(value))
        if _local(node.tag) == "style" and node.text:
            refs.update(_REF.findall(node.text))
    return refs


def add_missing_defs(root: ET.Element, shared: Mapping[str, ET.Element], css: str) -> None:
    own = {node.get("id") for node in root.iter() if node.get("id")}
    wanted = sorted(_refs(root) | set(_REF.findall(css)))
    pulled: list[ET.Element] = []
    seen: set[str] = set()
    queue = list(wanted)
    while queue:
        ident = queue.pop(0)
        if ident in own or ident in seen or ident not in shared:
            continue
        seen.add(ident)
        pulled.append(shared[ident])
        queue.extend(sorted(_refs(shared[ident])))
    if pulled:
        defs = ET.Element(f"{{{SVG_NS}}}defs")
        defs.extend(pulled)
        root.insert(0, defs)


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.fullmatch(r"\s*([0-9.]+)\s*(?:px)?\s*", value)
    return float(match.group(1)) if match else None


def svg_box(root: ET.Element) -> Box | None:
    view = root.get("viewBox") or root.get("viewbox")
    if view:
        parts = [p for p in re.split(r"[\s,]+", view.strip()) if p]
        try:
            x, y, w, h = (float(p) for p in parts)
        except ValueError:
            return None
        return Box(x, y, w, h)
    width = _number(root.get("width"))
    height = _number(root.get("height"))
    return Box(0, 0, width, height) if width and height else None


def _fmt(value: float) -> str:
    return f"{value:g}"


# --- CSS: copy the page's rules, keep only those that can match inside this SVG.


def page_css(source: str) -> tuple[str, str]:
    """Return (page rules without the Emerald theme, Emerald variable overrides)."""
    own: list[str] = []
    overrides = ""
    for attrs, body in _STYLE_BLOCK.findall(source):
        if 'id="pb-emerald"' in attrs:
            match = re.search(r"body\s*,\s*body\s*\*\s*\{([^}]*)\}", body)
            if match:
                overrides = match.group(1).strip()
        else:
            own.append(body)
    return "\n".join(own), overrides


def _strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def css_blocks(css: str) -> list[tuple[str, str]]:
    """Split a stylesheet into top-level (prelude, body) pairs; body excludes braces."""
    out: list[tuple[str, str]] = []
    i = 0
    n = len(css)
    while i < n:
        open_at = css.find("{", i)
        semi = css.find(";", i)
        if semi != -1 and (open_at == -1 or semi < open_at):
            prelude = css[i:semi].strip()
            if prelude:
                out.append((prelude, ""))
            i = semi + 1
            continue
        if open_at == -1:
            break
        depth = 0
        j = open_at
        while j < n:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((css[i:open_at].strip(), css[open_at + 1 : j]))
        i = j + 1
    return out


_CLASS_TOKEN = re.compile(r"\.(-?[_a-zA-Z][\w-]*)")
_ID_TOKEN = re.compile(r"#(-?[_a-zA-Z][\w-]*)")
_TYPE_TOKEN = re.compile(r"(?:^|[\s>+~(,])([a-zA-Z][\w-]*)")


@dataclass(frozen=True)
class Scope:
    """What a selector can match: elements inside the SVG, and the SVG's page ancestors."""

    classes: frozenset[str]
    tags: frozenset[str]
    ids: frozenset[str]
    outer_classes: frozenset[str] = frozenset()
    outer_tags: frozenset[str] = frozenset()
    outer_ids: frozenset[str] = frozenset()


def _fits(
    compound: str, classes: frozenset[str], tags: frozenset[str], ids: frozenset[str]
) -> bool:
    bare = re.sub(r"\[[^\]]*\]", "", compound)
    bare = re.sub(r"::?[\w-]+(\([^)]*\))?", lambda m: m.group(1) or "", bare)
    if any(c not in classes for c in _CLASS_TOKEN.findall(bare)):
        return False
    if any(i not in ids for i in _ID_TOKEN.findall(bare)):
        return False
    stripped = _CLASS_TOKEN.sub(" ", _ID_TOKEN.sub(" ", bare))
    return all(t.lower() in tags for t in _TYPE_TOKEN.findall(stripped))


def rewrite_selector(selector: str, scope: Scope) -> str | None:
    """The selector as it applies inside the standalone SVG, or None when it cannot match.

    Leading compounds that only the page ancestors satisfy (``.flow rect``, ``figure svg``)
    are dropped, so the rule still reaches the SVG's own elements.
    """
    selector = selector.strip()
    if not selector:
        return None
    if selector.startswith(":root"):
        return selector if _fits(selector[5:], scope.classes, scope.tags, scope.ids) else None
    parts = re.split(r"(\s*[>+~]\s*|\s+)", selector)
    compounds = parts[0::2]
    inside = (scope.classes, scope.tags, scope.ids)
    outside = (scope.outer_classes, scope.outer_tags, scope.outer_ids)
    start = 0
    while (
        start < len(compounds) - 1
        and not _fits(compounds[start], *inside)
        and _fits(compounds[start], *outside)
    ):
        start += 1
    if not all(_fits(c, *inside) for c in compounds[start:]):
        return None
    return "".join(parts[start * 2 :])


def prune_css(css: str, scope: Scope) -> str:
    kept: list[str] = []
    for prelude, body in css_blocks(_strip_comments(css)):
        lower = prelude.lower()
        if lower.startswith("@font-face") or lower.startswith("@import"):
            continue
        if lower.startswith("@media") or lower.startswith("@supports"):
            inner = prune_css(body, scope)
            if inner:
                kept.append(f"{prelude}{{{inner}}}")
            continue
        if lower.startswith("@"):
            kept.append(f"{prelude}{{{body}}}" if body else prelude + ";")
            continue
        selectors = [rewrite_selector(sel, scope) for sel in prelude.split(",")]
        live = [sel for sel in selectors if sel]
        if live:
            kept.append(f"{','.join(live)}{{{body.strip()}}}")
    return "\n".join(kept)


def standalone_svg(
    root: ET.Element,
    shared: Mapping[str, ET.Element],
    css: str,
    overrides: str,
    ancestors: Sequence[Node] = (),
) -> bytes:
    """Make one page SVG self-contained: its style rules, shared defs, size and background."""

    def scope() -> Scope:
        classes: set[str] = set()
        tags: set[str] = {"svg"}
        ids: set[str] = set()
        for node in root.iter():
            tags.add(_local(node.tag).lower())
            classes.update((node.get("class") or "").split())
            if node.get("id"):
                ids.add(node.get("id") or "")
        return Scope(
            frozenset(classes),
            frozenset(tags),
            frozenset(ids),
            frozenset(c for a in ancestors for c in a.attrs.get("class", "").split()),
            frozenset(a.tag for a in ancestors) | {"html", "body"},
            frozenset(a.attrs["id"] for a in ancestors if a.attrs.get("id")),
        )

    add_missing_defs(root, shared, prune_css(css, scope()))
    rules = prune_css(css, scope())
    style_text = f":root{{font-family:{BASE_FONT};color:#283038}}\n{rules}"
    if overrides:
        style_text += f"\n:root,:root *{{{overrides}}}"
    style_text += "\n:root{position:static!important;opacity:1!important;transform:none!important}"
    for attr in ("style",):
        if attr in root.attrib and "position:absolute" in root.attrib[attr].replace(" ", ""):
            del root.attrib[attr]
    box = svg_box(root)
    if box is not None:
        if "viewBox" not in root.attrib:
            root.set("viewBox", " ".join(_fmt(v) for v in (box.x, box.y, box.w, box.h)))
        root.attrib.pop("viewbox", None)
        if _number(root.get("width")) is None:
            root.set("width", _fmt(box.w))
        if _number(root.get("height")) is None:
            root.set("height", _fmt(box.h))
        bg = ET.Element(
            f"{{{SVG_NS}}}rect",
            {"x": _fmt(box.x), "y": _fmt(box.y), "width": _fmt(box.w), "height": _fmt(box.h)},
        )
    else:
        bg = ET.Element(f"{{{SVG_NS}}}rect", {"width": "100%", "height": "100%"})
    bg.set("style", f"fill:{BACKGROUND};stroke:none")
    style = ET.Element(f"{{{SVG_NS}}}style")
    style.text = "\n" + style_text + "\n"
    root.insert(0, bg)
    root.insert(0, style)
    for node in root.iter():
        if node.text:
            node.text = scrub(node.text)
        if node.tail:
            node.tail = scrub(node.tail)
        for key, value in node.attrib.items():
            node.set(key, scrub(value))
    return (ET.tostring(root, encoding="unicode") + "\n").encode()


# ---------------------------------------------------------------- Markdown rendering

_WS = re.compile(r"[ \t\r\n\f]+")
_LINE_START = re.compile(r"^(#{1,6}\s|>|[-+*]\s|=+\s*$|\d+[.)]\s)")
_URL_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


def escape_text(text: str) -> str:
    text = text.replace("\\", "\\\\")
    text = re.sub(r"([`*\[\]~])", r"\\\1", text)
    text = re.sub(r"(?<!\w)_|_(?!\w)", r"\\_", text)
    text = re.sub(r"&(?=#?\w+;)", "&amp;", text)
    return text.replace("<", "&lt;").replace(">", "&gt;")


def code_span(text: str) -> str:
    text = _WS.sub(" ", text)
    if not text.strip():
        return ""
    longest = max((len(r) for r in re.findall(r"`+", text)), default=0)
    fence = "`" * (longest + 1)
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return f"{fence}{pad}{text}{pad}{fence}"


SOFT = "\x01"  # a space only where neither neighbour already has one
_SPACE = " \t\n" + SOFT


def soften(text: str) -> str:
    text = re.sub(
        f"[ ]*{SOFT}+[ ]*", lambda m: " " if m.start() and m.end() < len(text) else "", text
    )
    return text.replace(SOFT, "")


def _wrap(marker: str, inner: str) -> str:
    stripped = inner.strip(_SPACE)
    if not stripped:
        return inner
    lead = " " if inner[:1] in _SPACE else ""
    trail = " " if inner[-1:] in _SPACE else ""
    return f"{lead}{marker}{stripped}{marker}{trail}"


@dataclass
class Page:
    """Everything one explainer's conversion needs and produces."""

    page_id: str
    sibling_ids: frozenset[str]
    svgs: list[str]
    shared_defs: dict[str, ET.Element]
    css: str
    overrides: str
    anchors: set[str]
    ancestors: dict[int, list[Node]] = field(default_factory=dict)
    files: dict[str, bytes] = field(default_factory=dict)
    figures: int = 0
    images: int = 0
    lost_svgs: int = 0

    def figure(self, index: int, alt: str) -> str:
        root = parse_svg(self.svgs[index])
        if root is None:
            self.lost_svgs += 1
            return ""
        if is_hidden_holder(root):
            return ""
        self.figures += 1
        name = f"{self.page_id}/fig-{self.figures}.svg"
        self.files[name] = standalone_svg(
            root, self.shared_defs, self.css, self.overrides, self.ancestors.get(index, [])
        )
        label = alt or root.get("aria-label") or _svg_title(root) or f"Diagram {self.figures}"
        return f"![{_alt(label)}]({name})"

    def image(self, node: Node) -> str:
        src = node.attrs.get("src", "")
        alt = node.attrs.get("alt", "") or f"Image {self.images + 1}"
        match = re.match(r"data:image/(png|jpeg|gif|webp);base64,(.*)", src, re.S)
        if not match:
            return ""
        try:
            data = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
        except (binascii.Error, ValueError):
            return ""
        self.images += 1
        ext = "jpg" if match.group(1) == "jpeg" else match.group(1)
        name = f"{self.page_id}/img-{self.images}.{ext}"
        self.files[name] = data
        return f"![{_alt(alt)}]({name})"

    def link(self, href: str) -> str | None:
        target = self._target(href.strip())
        if target is None or scrub(target) != target:
            return None
        return re.sub(r"[\s()<>\\]", lambda m: f"%{ord(m.group(0)):02X}", target)

    def _target(self, href: str) -> str | None:
        if href.startswith("#"):
            return href
        if re.match(r"https?://(127\.0\.0\.1|localhost)\b", href):
            return None
        if _URL_SCHEME.match(href):
            return href if href.startswith(("https://", "http://", "mailto:")) else None
        path, _, frag = href.partition("#")
        tail = f"#{frag}" if frag else ""
        if "/" not in path and path.endswith(".html") and path[:-5] in self.sibling_ids:
            return f"{path[:-5]}.md{tail}"
        if path == "README.md":
            return f"../README.md{tail}"
        return None


def _svg_title(root: ET.Element) -> str:
    title = root.find(f"{{{SVG_NS}}}title")
    return (title.text or "").strip() if title is not None else ""


def _alt(text: str) -> str:
    return _WS.sub(" ", text).replace("[", "(").replace("]", ")").strip()


class Renderer:
    def __init__(self, page: Page) -> None:
        self.page = page

    # --- inline

    def inline(self, nodes: Sequence[Node | str]) -> str:
        return "".join(self.inline_one(n) for n in nodes)

    def inline_one(self, node: Node | str) -> str:
        if isinstance(node, str):
            return escape_text(_WS.sub(" ", scrub(node)))
        tag = node.tag
        if tag in SKIP:
            return ""
        if tag == "br":
            return "<br>"
        if tag == "pbsvg":
            return self.page.figure(int(node.attrs.get("data-i", "0")), "")
        if tag == "img":
            return self.page.image(node)
        if tag == "code" or tag == "kbd" or tag == "samp" or tag == "tt":
            return code_span(scrub(node.text()))
        inner = self.inline(node.children)
        if node.attrs.get("class") and tag not in {"a"} and inner.strip(_SPACE):
            inner = SOFT + inner + SOFT
        if tag in {"strong", "b"}:
            return _wrap("**", inner)
        if tag in {"em", "i", "cite", "var"}:
            return _wrap("*", inner)
        if tag in {"del", "s", "strike"}:
            return _wrap("~~", inner)
        if tag == "q":
            return f"“{inner.strip(_SPACE)}”"
        if tag in {"sub", "sup"}:
            return f"<{tag}>{inner.strip()}</{tag}>" if inner.strip() else ""
        if tag == "a":
            target = self.page.link(node.attrs.get("href", ""))
            text = soften(inner.strip(_SPACE)).strip()
            if not text or target is None:
                return inner
            return f"[{text}]({target})"
        return inner

    # --- blocks

    def blocks(self, node: Node) -> list[str]:
        out: list[str] = []
        run: list[Node | str] = []

        def flush() -> None:
            text = paragraph(self.inline(run))
            if text:
                out.append(text)
            run.clear()

        for child in node.children:
            if isinstance(child, Node) and (child.tag in BLOCK or child.tag == "pbsvg-block"):
                flush()
                out.extend(self.block(child))
            elif isinstance(child, Node) and child.tag in SKIP:
                continue
            else:
                run.append(child)
        flush()
        return out

    def anchor(self, node: Node) -> str:
        ident = node.attrs.get("id", "")
        return f'<a id="{html.escape(ident)}"></a>' if ident in self.page.anchors else ""

    def block(self, node: Node) -> list[str]:
        anchor = self.anchor(node)
        result = self._block(node)
        if anchor:
            result = [anchor, *result] if result else [anchor]
        return result

    def _block(self, node: Node) -> list[str]:
        tag = node.tag
        if tag in CONTAINERS:
            return self.blocks(node)
        if tag == "p" or tag == "figcaption" or tag == "dd":
            body = self.blocks(node)
            if tag == "figcaption":
                return [
                    f"*{b}*" if b and "\n" not in b and not b.startswith("!") else b for b in body
                ]
            return body
        if tag == "dt":
            text = paragraph(self.inline(node.children))
            return [_wrap("**", text)] if text else []
        if tag == "dl":
            return self.blocks(node)
        if re.fullmatch(r"h[1-6]", tag):
            text = soften(_WS.sub(" ", self.inline(node.children))).strip()
            text = re.sub(r"\s*<br>\s*", " ", text)
            return [f"{'#' * int(tag[1])} {text}"] if text else []
        if tag == "hr":
            return ["---"]
        if tag == "pre":
            return [fenced(scrub(node.text()))]
        if tag in {"ul", "ol"}:
            return [self.list_block(node)] if node.find_all("li") else []
        if tag == "li":
            return self.blocks(node)
        if tag == "blockquote":
            inner = "\n\n".join(self.blocks(node))
            return ["\n".join(f"> {line}".rstrip() for line in inner.split("\n"))] if inner else []
        if tag == "details":
            return self.details(node)
        if tag == "summary":
            return [paragraph(self.inline(node.children))]
        if tag == "figure":
            return self.figure(node)
        if tag == "table":
            return [self.table(node)]
        if tag in {"tr", "td", "th"}:
            return self.blocks(node)
        return self.blocks(node)

    def list_block(self, node: Node) -> str:
        items: list[str] = []
        number = int(node.attrs.get("start", "1") or "1") if node.tag == "ol" else 0
        for child in node.children:
            if not (isinstance(child, Node) and child.tag == "li"):
                continue
            marker = f"{number}. " if node.tag == "ol" else "- "
            number += 1
            body = ""
            for block in self.blocks(child):
                nested = re.match(r"(- |\d+\. )", block) is not None
                body += ("\n" if nested else "\n\n") + block if body else block
            indent = " " * len(marker)
            lines = body.split("\n")
            text = (
                marker
                + lines[0]
                + "".join("\n" + (indent + line if line else "") for line in lines[1:])
            )
            items.append(text.rstrip())
        loose = any("\n\n" in item for item in items)
        return ("\n\n" if loose else "\n").join(items)

    def details(self, node: Node) -> list[str]:
        summary = next(
            (c for c in node.children if isinstance(c, Node) and c.tag == "summary"), None
        )
        label = _WS.sub(" ", scrub(summary.text())).strip() if summary else "Details"
        rest = Node("div", {}, [c for c in node.children if c is not summary])
        inner = self.blocks(rest)
        return [
            f"<details>\n<summary>{html.escape(label, quote=False)}</summary>",
            *inner,
            "</details>",
        ]

    def figure(self, node: Node) -> list[str]:
        caption = next(
            (c for c in node.children if isinstance(c, Node) and c.tag == "figcaption"), None
        )
        alt = _WS.sub(" ", scrub(caption.text())).strip() if caption else ""
        out: list[str] = []
        run: list[Node | str] = []

        def flush() -> None:
            text = paragraph(self.inline(run))
            if text:
                out.append(text)
            run.clear()

        for child in node.children:
            if isinstance(child, Node) and child.tag == "pbsvg":
                flush()
                image = self.page.figure(int(child.attrs.get("data-i", "0")), alt)
                if image:
                    out.append(image)
            elif isinstance(child, Node) and child.tag in BLOCK:
                flush()
                out.extend(self.block(child))
            else:
                run.append(child)
        flush()
        return out

    def cell(self, node: Node) -> str:
        parts: list[str] = []
        for block in self.blocks(node):
            if block.startswith("```"):
                lines = block.split("\n")[1:-1]
                parts.append("<br>".join(code_span(line) for line in lines if line.strip()))
            else:
                parts.append(block.replace("\n", " "))
        text = "<br>".join(p for p in parts if p)
        return text.replace("|", "\\|")

    def table(self, node: Node) -> str:
        rows: list[tuple[bool, list[str]]] = []
        for row in node.find_all("tr"):
            cells: list[str] = []
            header = True
            for cell in row.children:
                if not (isinstance(cell, Node) and cell.tag in {"td", "th"}):
                    continue
                header = header and cell.tag == "th"
                cells.append(self.cell(cell))
                span = (
                    int(cell.attrs.get("colspan", "1") or "1")
                    if cell.attrs.get("colspan", "1").isdigit()
                    else 1
                )
                cells.extend([""] * (max(span, 1) - 1))
            if cells:
                rows.append((header, cells))
        if not rows:
            return ""
        width = max(len(cells) for _, cells in rows)
        if not rows[0][0] and width == 2 and not any(h for h, _ in rows):
            return "\n".join(
                f"- **{a.strip()}**: {b.strip()}" if a.strip() else f"- {b.strip()}"
                for _, (a, b) in rows
            )
        if rows[0][0]:
            head, body = rows[0][1], rows[1:]
        else:
            head, body = [""] * width, rows

        def line(cells: list[str]) -> str:
            padded = cells + [""] * (width - len(cells))
            return "| " + " | ".join(c.strip() for c in padded) + " |"

        sep = "|" + "|".join(["---"] * width) + "|"
        return "\n".join([line(head), sep, *(line(cells) for _, cells in body)])


def paragraph(text: str) -> str:
    text = soften(_WS.sub(" ", text)).strip()
    text = re.sub(r"\s*<br>\s*", "<br>\n", text).strip()
    if text.endswith("<br>"):
        text = text[: -len("<br>")].rstrip()
    lines = [("\\" + line if _LINE_START.match(line) else line) for line in text.split("\n")]
    return "\n".join(lines)


def fenced(text: str) -> str:
    if text.startswith("\n"):
        text = text[1:]
    text = text.rstrip("\n ")
    longest = max((len(r) for r in re.findall(r"`{3,}", text)), default=2)
    fence = "`" * max(3, longest + 1)
    return f"{fence}\n{text}\n{fence}"


# ---------------------------------------------------------------- one explainer


@dataclass(frozen=True)
class Twin:
    page_id: str
    title: str
    summary: str
    markdown: str
    files: dict[str, bytes]
    figures: int
    images: int
    lost_svgs: int


def _drop_branch_rows(body: Node) -> None:
    """Status tables lose their Branch/Worktree rows: those name internal working branches."""
    for table in body.find_all("table"):
        for parent in [table, *table.find_all("tbody"), *table.find_all("thead")]:
            kept: list[Node | str] = []
            for child in parent.children:
                if isinstance(child, Node) and child.tag == "tr":
                    first = next(
                        (
                            c
                            for c in child.children
                            if isinstance(c, Node) and c.tag in {"td", "th"}
                        ),
                        None,
                    )
                    label = _WS.sub(" ", first.text()).strip().lower() if first else ""
                    if label in {"branch", "worktree", "branch and worktree", "working branch"}:
                        continue
                kept.append(child)
            parent.children = kept


_BRANCH = "a working branch"
_BRANCH_LEAD = re.compile(
    r"(^|^- |^\| |(?<=[.!?] ))[Bb]ranch:?\s+`?" + _BRANCH + r"`?(?:\s*[.;,:]\s*|\s*$)", re.M
)


def tidy_branches(markdown: str) -> str:
    """Turn sentences that only named a scrubbed working branch into plain prose."""

    def lead(match: re.Match[str]) -> str:
        return match.group(1) + "\x02"

    text = _BRANCH_LEAD.sub(lead, markdown)
    text = re.sub(r"\x02(\S)", lambda m: m.group(1).upper(), text).replace("\x02", "")
    text = text.replace(f"`{_BRANCH}`", _BRANCH)
    text = re.sub(r"\bBranch " + _BRANCH, "A working branch", text)
    return re.sub(r"\b(?:[Bb]ranch|on branch) " + _BRANCH, _BRANCH, text)


def svg_ancestors(root: Node) -> dict[int, list[Node]]:
    """For each SVG placeholder, the page elements around it, outermost first."""
    found: dict[int, list[Node]] = {}

    def walk(node: Node, chain: list[Node]) -> None:
        for child in node.children:
            if isinstance(child, Node):
                if child.tag == "pbsvg":
                    found[int(child.attrs.get("data-i", "0"))] = list(chain)
                else:
                    walk(child, [*chain, child])

    walk(root, [])
    return found


def _first(node: Node, tag: str) -> Node | None:
    found = node.find_all(tag)
    return found[0] if found else None


def _summary_sentence(text: str) -> str:
    text = _WS.sub(" ", scrub(text)).strip()
    parts = sentences(text)
    sentence = parts[0] if parts else text
    if len(sentence) > 220:
        sentence = sentence[:217].rsplit(" ", 1)[0] + "…"
    return sentence


_NOT_LEAD = re.compile(r"eyebrow|kicker|crumb|meta|tag|chip|badge|pill|cap|note|small", re.I)


def lead_summary(body: Node, page_id: str) -> str:
    """One sentence for the index: the page's lead paragraph, never its eyebrow or tags."""
    paragraphs = body.find_all("p")
    for p in paragraphs:
        if re.search(r"\b(lead|sub|intro|dek|standfirst)\b", p.attrs.get("class", "")):
            text = _WS.sub(" ", p.text()).strip()
            if text:
                return one_line(text)
    for p in paragraphs:
        text = _WS.sub(" ", p.text()).strip()
        if _NOT_LEAD.search(p.attrs.get("class", "")) or len(text.split()) < 6:
            continue
        if page_id in text[:80] or " · " in text[:60]:
            continue
        return one_line(text)
    return ""


def convert(page_id: str, source: str, sibling_ids: frozenset[str]) -> Twin:
    """Convert one explainer page to its Markdown twin and extracted figures."""
    css, overrides = page_css(source)
    stripped, svgs = split_svgs(source)
    shared = collect_defs(r for r in (parse_svg(s) for s in svgs) if r is not None)
    root = parse_html(stripped)
    anchors = {
        a.attrs["href"][1:] for a in root.find_all("a") if a.attrs.get("href", "").startswith("#")
    }
    page = Page(page_id, sibling_ids, svgs, shared, css, overrides, anchors, svg_ancestors(root))
    title_node = _first(root, "title")
    h1 = _first(root, "h1")
    title = scrub(_WS.sub(" ", (h1 or title_node or Node("x")).text()).strip()) or page_id
    body = _first(root, "main") or _first(root, "body") or root
    _drop_branch_rows(body)
    summary = lead_summary(body, page_id)
    blocks = Renderer(page).blocks(body)
    if not any(b.startswith("# ") for b in blocks):
        blocks.insert(0, f"# {escape_text(title)}")
    note = (
        f"> Markdown twin of [{page_id}.html](../{page_id}.html), generated from the HTML by "
        f"`just explainer-twins`. The HTML is the source; edit it, not this file."
    )
    first_h1 = next(i for i, b in enumerate(blocks) if b.startswith("# "))
    blocks.insert(first_h1 + 1, note)
    markdown = scrub("\n\n".join(b for b in blocks if b.strip()) + "\n")
    markdown = re.sub(r"\n{3,}", "\n\n", tidy_branches(markdown))
    files = {f"{TWINS}/{page_id}.md": markdown.encode()}
    files.update({f"{TWINS}/{name}": data for name, data in sorted(page.files.items())})
    return Twin(page_id, title, summary, markdown, files, page.figures, page.images, page.lost_svgs)


# ---------------------------------------------------------------- feature registry (TS source)


@dataclass(frozen=True)
class Feature:
    id: str
    group: str
    title: str
    description: str
    switchable: bool


def _js_strings(source: str) -> dict[str, str]:
    """Top-level ``const NAME="...";`` string constants."""
    found: dict[str, str] = {}
    for match in re.finditer(
        r'^const ([A-Z_][A-Z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*")\s*;', source, re.M
    ):
        found[match.group(1)] = json.loads(match.group(2))
    return found


_TOKEN = re.compile(
    r'\s*(?:("(?:[^"\\]|\\.)*")|(\'(?:[^\'\\]|\\.)*\')|(`(?:[^`\\]|\\.)*`)|(null)'
    r"|([A-Za-z_$][\w$]*)|(\+)|(,)|(\)))",
    re.S,
)


def _call_args(source: str, start: int, consts: Mapping[str, str]) -> tuple[list[str | None], int]:
    """Parse simple JS call arguments (string literals, +, identifiers, null) from ``start``."""
    args: list[str | None] = []
    current: str | None = None
    has_value = False
    i = start
    while True:
        match = _TOKEN.match(source, i)
        if not match:
            raise ValueError(f"cannot parse feature arguments at offset {i}")
        i = match.end()
        dq, sq, tpl, null, ident, plus, _comma, close = match.groups()
        value: str | None
        if dq is not None:
            value = json.loads(dq)
        elif sq is not None or tpl is not None:
            body = (sq or tpl or "")[1:-1]
            body = re.sub(r"\$\{[^}]*\}", "N", body)
            value = re.sub(r"\\(.)", r"\1", body)
        elif null is not None:
            value = None
        elif ident is not None:
            value = consts.get(ident, ident)
        elif plus is not None:
            continue
        else:
            if has_value:
                args.append(current)
            current, has_value = None, False
            if close is not None:
                return args, i
            continue
        current = value if not has_value or current is None or value is None else current + value
        has_value = True


def parse_features(source: str) -> list[Feature]:
    consts = _js_strings(source)
    consts.update(
        {
            m.group(1): m.group(2)
            for m in re.finditer(r'^const (\w+)\s*=\s*"([^"]*)"\s*;', source, re.M)
        }
    )
    start = source.index("export const FEATURES")
    end = source.index("\n];", start)
    region = source[start:end]
    features: list[Feature] = []
    for match in re.finditer(r"\b(on|measured)\(", region):
        args, _ = _call_args(region, match.end(), consts)
        if match.group(1) == "on":
            ident, group, title, _needs, description = (args + [None] * 5)[:5]
            switchable = True
        else:
            ident, title, description = (args + [None] * 3)[:3]
            group, switchable = "measurement", False
        if ident and title is not None and description is not None and group:
            features.append(Feature(ident, group, title, description, switchable))
    return features


def parse_explainer_map(panels: str) -> dict[str, str]:
    start = panels.index("FEATURE_EXPLAINERS")
    end = panels.index("});", start)
    return dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)\.html"', panels[start:end]))


def parse_default_off(next_run: str) -> set[str]:
    """Switches the viewer's next-run draft starts with OFF: everything not named is ON.

    Reads the DEFAULT_NEXT_RUN features literal, then every later
    ``Object.assign(DEFAULT_NEXT_RUN.features, {...})`` in file order.
    """
    start = next_run.index("DEFAULT_NEXT_RUN")
    literal = next_run.index("features:", start)
    chunks = [next_run[literal : next_run.index("}", literal)]]
    for match in re.finditer(
        r"Object\.assign\(\s*DEFAULT_NEXT_RUN\.features\s*,\s*\{([^}]*)\}", next_run
    ):
        chunks.append(match.group(1))
    state: dict[str, bool] = {}
    for chunk in chunks:
        for ident, value in re.findall(r'"([a-z0-9-]+)"\s*:\s*(true|false)', chunk):
            state[ident] = value == "true"
    return {ident for ident, on in state.items() if not on}


_LEADING_NOISE = re.compile(
    r"^(?:(?:Bug fix(?: that goes in the bundle arm only)?|Bundle arm only|Default off|default off"
    r"|on in both arms|Measurement only|Server side|Agent side only)\b"
    r"[^.;:]*?(?:\([^)]*\))?[,;.:]\s*)+",
    re.I,
)


_BOILERPLATE = re.compile(
    r"\b(default|bundle|experimental|arms?|switch|bug ?fix|operator|The operator|needs|meant|enabled"
    r"|applicable|correctness|only|lane)\b",
    re.I,
)
_ABBREV = re.compile(
    r"(?:\b(?i:prof|mrs?|ms|dr|st|mt|exp|lv|vs|etc|e\.g|i\.e|approx)|\bNo|\b[A-Z])\.$"
)


def sentences(text: str) -> list[str]:
    """Split prose into sentences without breaking after PROF., e.g. or an initial."""
    out: list[str] = []
    for piece in re.findall(r".+?[.!?](?=\s|$)|.+$", text):
        if out and _ABBREV.search(out[-1]):
            out[-1] += piece
        else:
            out.append(piece)
    return [p.strip() for p in out if p.strip()]


def one_line(description: str) -> str:
    """The first sentence that says what the switch does, not where it is on by default."""
    text = _WS.sub(" ", description).strip()
    text = _LEADING_NOISE.sub("", text)
    text = re.sub(r"^\([^)]*\)[.,;:]?\s*", "", text)
    for sentence in sentences(text):
        words = sentence.split()
        if len(words) < 10 and _BOILERPLATE.search(sentence):
            continue
        sentence = sentence.strip()
        return _summary_sentence(sentence[:1].upper() + sentence[1:])
    return _summary_sentence(text)


# ---------------------------------------------------------------- index and features table

GROUP_TITLES: tuple[tuple[str, str, str], ...] = (
    (
        "observation",
        "What the model sees",
        "Readouts built from game memory and placed beside the screenshot: maps, people, warps, "
        "menus, battles.",
    ),
    (
        "guidance",
        "Guidance and tools",
        "Prompt text, navigation tools and automatic input handling that help the model act on "
        "what it sees.",
    ),
    (
        "guard",
        "Guards and loop breakers",
        "Checks that catch a stuck or looping model, refuse unsafe actions, or end a stalled run "
        "under limits the operator set.",
    ),
    (
        "measurement",
        "Measurement",
        "Recording only: milestones, splits and evidence the viewer and reports read. The model "
        "never sees these.",
    ),
    (
        "other",
        "Harness, viewer and tooling",
        "How runs are launched, recorded, verified and shown, and audits that are not a single "
        "switch.",
    ),
)

INDEX_INTRO = """# PokéBench explainers

PokéBench measures how far language models get in Pokémon Emerald when they play through a
harness: a set of tools and readouts drawn from the game's own memory. Every behavior the
harness adds is a feature switch, and every switch has an explainer that says what changes for
the model, why it was added, where the facts come from in the game, and what is still unproven.

Each explainer exists twice:

- **Markdown** (`md/<id>.md`): reads on GitHub. Diagrams are separate SVG files in `md/<id>/`.
- **HTML** (`<id>.html`): the source, with the same text and diagrams in one self-contained
  page. Download it or open it from a local checkout; it makes no network requests.

The Markdown twins and this index are generated (`just explainer-twins`); edit the HTML.
[`../features.md`](../features.md) lists every switch with its default and whether it was on
in the reference run 67d7.

Status sections record what was true when each page was written: the tests, live proofs and
reviews at that time. Older pages can describe workflows the project has since retired.
"""


def build_index(twins: Sequence[Twin], groups: Mapping[str, str]) -> str:
    by_group: dict[str, list[Twin]] = {key: [] for key, _, _ in GROUP_TITLES}
    for twin in twins:
        by_group.setdefault(groups.get(twin.page_id, "other"), []).append(twin)
    parts = [INDEX_INTRO.rstrip()]
    counts = ", ".join(
        f"{len(by_group[key])} {title.lower()}" for key, title, _ in GROUP_TITLES if by_group[key]
    )
    parts.append(f"{len(twins)} explainers: {counts}.")
    for key, title, blurb in GROUP_TITLES:
        members = sorted(by_group[key], key=lambda t: (t.title.lower(), t.page_id))
        if not members:
            continue
        lines = [f"## {title}", blurb]
        rows = []
        for twin in members:
            summary = f" — {twin.summary}" if twin.summary else ""
            rows.append(
                f"- [{escape_text(twin.title)}](md/{twin.page_id}.md) · "
                f"[HTML]({twin.page_id}.html){summary}"
            )
        lines.append("\n".join(rows))
        parts.append("\n\n".join(lines))
    return "\n\n".join(parts) + "\n"


@dataclass(frozen=True)
class RunSnapshot:
    run: str
    features: Mapping[str, bool]


def build_features_table(
    features: Sequence[Feature],
    default_off: set[str],
    explainers: Mapping[str, str],
    twin_ids: set[str],
    run: RunSnapshot,
) -> str:
    order = {key: i for i, (key, _, _) in enumerate(GROUP_TITLES)}
    rows = sorted(features, key=lambda f: (order.get(f.group, 99), f.id))
    head = (
        "# Harness feature switches\n\n"
        f"Generated from `{FEATURES_TS}` by `just explainer-twins`; do not edit by hand.\n\n"
        "- **Default**: the viewer's next-run default (`packages/viewer/src/next-run.ts`). "
        "Presets and fixed-run definitions set their own values.\n"
        f"- **Run {run.run}**: whether the switch was on in that run's `run_start` event "
        "(its recorded feature settings). Blank: the switch did not exist yet.\n"
        "- Measurement features only record; the model never sees them.\n\n"
        f"{len(rows)} features.\n"
    )
    lines = [
        "| Group | Switch | What it does | Default | Run " + run.run + " | Explainer |",
        "|---|---|---|---|---|---|",
    ]
    for feature in rows:
        default = (
            "always" if not feature.switchable else ("off" if feature.id in default_off else "on")
        )
        state = run.features.get(feature.id)
        ran = "" if state is None else ("on" if state else "off")
        page = explainers.get(feature.id, feature.id)
        link = f"[{page}](explainers/md/{page}.md)" if page in twin_ids else ""
        what = escape_text(one_line(feature.description)).replace("|", "\\|")
        lines.append(f"| {feature.group} | `{feature.id}` | {what} | {default} | {ran} | {link} |")
    return head + "\n" + "\n".join(lines) + "\n"


def snapshot_from_events(first_event: str) -> dict[str, object]:
    """The committed 67d7 snapshot, from a run's first ``run_start`` event line."""
    event = json.loads(first_event)
    if event.get("type") != "run_start":
        raise ValueError("expected a run_start event")
    evaluation = event["evaluation"]
    features = {k: bool(v) for k, v in sorted(evaluation["features"].items())}
    run_id = str(event["run"])
    return {
        "run": run_id.rsplit("_", 1)[-1],
        "preset": evaluation.get("preset_id"),
        "features_sha256": evaluation.get("features_sha256"),
        "features": features,
    }


# ---------------------------------------------------------------- whole generation


@dataclass(frozen=True)
class Inputs:
    pages: Mapping[str, str]  # explainer id -> HTML
    features_ts: str
    panels_ts: str
    next_run_ts: str
    run_snapshot: str  # JSON


@dataclass(frozen=True)
class Output:
    files: dict[str, bytes]
    twins: tuple[Twin, ...]


def generate(inputs: Inputs) -> Output:
    ids = frozenset(inputs.pages)
    twins = tuple(convert(pid, inputs.pages[pid], ids) for pid in sorted(ids))
    features = parse_features(inputs.features_ts)
    explainers = parse_explainer_map(inputs.panels_ts)
    groups: dict[str, str] = {}
    by_id = {f.id: f for f in features}
    for feature in features:
        page = explainers.get(feature.id, feature.id)
        if page in ids:
            groups.setdefault(page, feature.group)
    for pid in ids:
        if pid not in groups and pid in by_id:
            groups[pid] = by_id[pid].group
    snapshot = json.loads(inputs.run_snapshot)
    run = RunSnapshot(str(snapshot["run"]), dict(snapshot["features"]))
    files: dict[str, bytes] = {}
    for twin in twins:
        files.update(twin.files)
    files[INDEX] = scrub(build_index(twins, groups)).encode()
    files[FEATURES_MD] = scrub(
        build_features_table(
            features, parse_default_off(inputs.next_run_ts), explainers, set(ids), run
        )
    ).encode()
    return Output(dict(sorted(files.items())), twins)


# ---------------------------------------------------------------- thin disk entrypoint


class Store(Protocol):
    def read_text(self, rel: str) -> str: ...
    def list_files(self, rel_dir: str) -> list[str]: ...
    def read_bytes(self, rel: str) -> bytes | None: ...
    def write_bytes(self, rel: str, data: bytes) -> None: ...
    def remove(self, rel: str) -> None: ...


class DiskStore:  # pragma: no cover - the disk boundary; logic is tested with an in-memory store
    def __init__(self, root: Path) -> None:
        self.root = root

    def read_text(self, rel: str) -> str:
        return (self.root / rel).read_text(encoding="utf-8")

    def list_files(self, rel_dir: str) -> list[str]:
        base = self.root / rel_dir
        if not base.exists():
            return []
        return sorted(p.relative_to(self.root).as_posix() for p in base.rglob("*") if p.is_file())

    def read_bytes(self, rel: str) -> bytes | None:
        path = self.root / rel
        return path.read_bytes() if path.is_file() else None

    def write_bytes(self, rel: str, data: bytes) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def remove(self, rel: str) -> None:
        (self.root / rel).unlink()


def read_inputs(store: Store) -> Inputs:
    pages = {
        Path(rel).stem: store.read_text(rel)
        for rel in store.list_files(EXPLAINERS)
        if rel.count("/") == EXPLAINERS.count("/") + 1 and rel.endswith(".html")
    }
    return Inputs(
        pages,
        store.read_text(FEATURES_TS),
        store.read_text(PANELS_TS),
        store.read_text(NEXT_RUN_TS),
        store.read_text(RUN_SNAPSHOT),
    )


def drift(store: Store, output: Output) -> list[str]:
    problems: list[str] = []
    for rel, data in output.files.items():
        current = store.read_bytes(rel)
        if current is None:
            problems.append(f"missing: {rel}")
        elif current != data:
            problems.append(f"differs: {rel}")
    for rel in store.list_files(TWINS):
        if rel not in output.files:
            problems.append(f"stale: {rel}")
    return problems


def write(store: Store, output: Output) -> int:
    changed = 0
    for rel, data in output.files.items():
        if store.read_bytes(rel) != data:
            store.write_bytes(rel, data)
            changed += 1
    for rel in store.list_files(TWINS):
        if rel not in output.files:
            store.remove(rel)
            changed += 1
    return changed


def run(argv: Sequence[str], store: Store, say: Callable[[str], None]) -> int:
    command = argv[0] if argv else "write"
    if command == "snapshot":
        if len(argv) != 2:
            say("usage: snapshot <events.jsonl>")
            return 2
        first = store.read_text(argv[1]).split("\n", 1)[0]
        data = json.dumps(snapshot_from_events(first), indent=2, sort_keys=True) + "\n"
        store.write_bytes(RUN_SNAPSHOT, data.encode())
        say(f"wrote {RUN_SNAPSHOT}")
        return 0
    output = generate(read_inputs(store))
    figures = sum(t.figures for t in output.twins)
    images = sum(t.images for t in output.twins)
    lost = [t.page_id for t in output.twins if t.lost_svgs]
    if command == "check":
        problems = drift(store, output)
        for problem in problems:
            say(problem)
        if problems:
            say(f"{len(problems)} generated file(s) out of date: run `just explainer-twins`")
            return 1
        say(
            f"explainer twins up to date: {len(output.twins)} pages, "
            f"{figures} SVGs, {images} images"
        )
        return 0
    if command != "write":
        say(f"unknown command: {command} (write, check, snapshot)")
        return 2
    changed = write(store, output)
    say(f"{len(output.twins)} twins, {figures} SVGs, {images} images; {changed} file(s) changed")
    if lost:
        say("SVGs that did not parse: " + ", ".join(lost))
    return 0


def main() -> None:  # pragma: no cover - entrypoint
    import subprocess

    top = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True
    ).stdout.strip()
    sys.exit(run(sys.argv[1:], DiskStore(Path(top)), print))


if __name__ == "__main__":  # pragma: no cover
    main()
