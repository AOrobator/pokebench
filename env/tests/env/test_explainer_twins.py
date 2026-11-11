import json
import xml.etree.ElementTree as ET

import pytest

from pokebench_env import explainer_twins as t

SVG_NS = "{http://www.w3.org/2000/svg}"

THEME = (
    '<style id="pb-emerald">@font-face{font-family:x;src:url(/fonts/a.woff2)}'
    "body,body *{--card:#ffffff!important;--fg:#283038!important}</style>"
)


def page(body, css="", head=""):
    return (
        f"<!doctype html><html><head><title>T</title><style>{css}</style>{THEME}{head}</head>"
        f"<body><main>{body}</main></body></html>"
    )


def twin(body, css="", page_id="demo", siblings=("demo", "other")):
    return t.convert(page_id, page(body, css), frozenset(siblings))


def md(body, css=""):
    text = twin(body, css).markdown
    return text.split("\n\n", 2)[2] if text.startswith("# ") else text


# ---------------------------------------------------------------- scrub


def test_scrub_removes_machine_and_chat_details():
    text = (
        "/Users/someone/dev/x and /home/pi/y at box.example.ts.net:8447 on 100.101.2.3, "
        "10.0.0.7 and 192.168.1.20, not 127.0.0.1 or 1.2.3.4; (private link removed), "
        "cmsg_redactedad3858052928, mail a.b@gmail.com, branch claude/ledge-hops, "
        "codex/foo-bar.v2 but not .claude/skills or cursor/state"
    )
    out = t.scrub(text)
    assert "someone" not in out and "~/dev/x" in out and "~/y" in out
    assert "<tailnet-host>" in out and "ts.net" not in out
    assert out.count("<private-ip>") == 3 and "127.0.0.1" in out and "1.2.3.4" in out
    assert "<chat-link>" in out and "<chat-id>" in out and "<email>" in out
    assert out.count("a working branch") == 2
    assert ".claude/skills" in out and "cursor/state" in out


def test_tidy_branches_rewrites_branch_only_sentences():
    text = (
        "- Branch `a working branch`; commit abc.\n"
        "Branch a working branch. Tests pass.\n"
        "Candidate branch `a working branch` landed. Branch a working branch here\n"
        "| Branch: a working branch |"
    )
    out = t.tidy_branches(text)
    assert out.splitlines()[0] == "- Commit abc."
    assert out.splitlines()[1] == "Tests pass."
    assert "Candidate a working branch landed." in out
    assert "A working branch here" in out or "a working branch here" in out
    assert "`" not in out


# ---------------------------------------------------------------- SVG


def test_split_svgs_handles_nesting_and_unterminated():
    html, svgs = t.split_svgs("a<svg><svg></svg></svg>b<SVG x=1></SVG>c</svg>")
    assert svgs == ["<svg><svg></svg></svg>", "<SVG x=1></SVG>"]
    assert html == 'a<pbsvg data-i="0"></pbsvg>b<pbsvg data-i="1"></pbsvg>c</svg>'
    html, svgs = t.split_svgs("x<svg><rect/>")
    assert svgs == [] and html == "x"


def test_parse_svg_fixes_html_entities_and_namespaces():
    root = t.parse_svg(
        '<svg viewBox="0 0 10 10"><text>a&nbsp;b&amp;c</text><use xlink:href="#p"/></svg>'
    )
    assert root is not None
    assert root.find(f"{SVG_NS}text").text == "a\xa0b&c"
    assert t.parse_svg("<svg><rect></svg>") is None


def test_hidden_holders():
    assert t.is_hidden_holder(t.parse_svg('<svg width="0" height="0"><rect/></svg>'))
    assert t.is_hidden_holder(t.parse_svg("<svg><defs><pattern id='p'/></defs></svg>"))
    assert t.is_hidden_holder(t.parse_svg('<svg aria-hidden="true"><rect/></svg>'))
    assert not t.is_hidden_holder(t.parse_svg("<svg><rect/></svg>"))


def test_svg_box_variants():
    assert t.svg_box(t.parse_svg('<svg viewBox="1,2 30 40"/>')) == t.Box(1, 2, 30, 40)
    assert t.svg_box(t.parse_svg('<svg viewBox="a b c d"/>')) is None
    assert t.svg_box(t.parse_svg('<svg width="20px" height="10"/>')) == t.Box(0, 0, 20, 10)
    assert t.svg_box(t.parse_svg('<svg width="100%"/>')) is None


def test_css_blocks_and_prune():
    css = (
        "/* c */@import url(x.css);@charset 'utf-8';@font-face{src:url(a)}"
        ":root{--a:1}.box{fill:red}.nope{fill:blue}text{font:9px x}p{color:red}"
        "@media (max-width:9px){.box{stroke:1}.nope{stroke:2}}@media print{.nope{x:1}}"
        "@keyframes k{from{opacity:0}to{opacity:1}}.flow rect,.card .x{fill:green}"
        "#tag{fill:pink}#gone{fill:pink}"
    )
    scope = t.Scope(
        frozenset({"box"}),
        frozenset({"svg", "rect", "text"}),
        frozenset({"tag"}),
        frozenset({"flow"}),
        frozenset({"div", "figure"}),
        frozenset(),
    )
    out = t.prune_css(css, scope)
    assert "@import" not in out and "@font-face" not in out
    assert "@charset 'utf-8';" in out
    assert ":root{--a:1}" in out and ".box{fill:red}" in out and "text{font:9px x}" in out
    assert ".nope" not in out and "p{" not in out
    assert "@media (max-width:9px){.box{stroke:1}}" in out and "print" not in out
    assert "@keyframes k" in out
    assert "rect{fill:green}" in out and ".card" not in out
    assert "#tag{fill:pink}" in out and "#gone" not in out


def test_rewrite_selector_edges():
    scope = t.Scope(
        frozenset({"a"}),
        frozenset({"svg", "g"}),
        frozenset(),
        frozenset({"o"}),
        frozenset({"main"}),
    )
    assert t.rewrite_selector("", scope) is None
    assert t.rewrite_selector(":root", scope) == ":root"
    assert t.rewrite_selector(":root .zz", scope) is None
    assert t.rewrite_selector("main > .o svg .a:hover", scope) == "svg .a:hover"
    assert t.rewrite_selector("g[data-x='1']::before", scope) == "g[data-x='1']::before"
    assert t.rewrite_selector("main", scope) is None


def test_standalone_svg_is_self_contained():
    shared = t.collect_defs(
        [
            t.parse_svg(
                '<svg width="0"><defs><pattern id="grass"><use href="#blade"/></pattern><path'
                ' id="blade"/></defs></svg>'
            )
        ]
    )
    root = t.parse_svg(
        '<svg viewBox="0 0 40 20" style="position:absolute"><rect class="g"'
        ' fill="url(#grass)"/></svg>'
    )
    css = ".g{stroke:var(--fg)}.flow text{fill:red}svg rect{fill:none}"
    out = t.standalone_svg(
        root, shared, css, "--fg:#283038!important", [t.Node("div", {"class": "flow"})]
    )
    tree = ET.fromstring(out)
    kids = [child.tag.split("}")[1] for child in tree]
    assert kids[:3] == ["style", "rect", "defs"]
    style = tree.find(f"{SVG_NS}style").text
    assert ".g{stroke:var(--fg)}" in style and "text{fill:red}" not in style
    assert "svg rect{fill:none}" in style
    assert ":root,:root *{--fg:#283038!important}" in style
    bg = tree.findall(f"{SVG_NS}rect")[0]
    assert bg.get("style") == "fill:#ffffff;stroke:none" and bg.get("width") == "40"
    assert tree.get("width") == "40" and tree.get("height") == "20"
    assert "style" not in tree.attrib
    assert {d.get("id") for d in tree.find(f"{SVG_NS}defs")} == {"grass", "blade"}


def test_standalone_svg_without_size_and_viewbox_attr_case():
    root = t.parse_svg("<svg><circle r='3'/></svg>")
    tree = ET.fromstring(t.standalone_svg(root, {}, "", ""))
    assert tree.findall(f"{SVG_NS}rect")[0].get("width") == "100%"
    root = t.parse_svg('<svg viewbox="0 0 5 6" width="9"><g id="own"/></svg>')
    root.attrib["viewbox"] = root.attrib.pop("viewbox", "0 0 5 6")
    tree = ET.fromstring(t.standalone_svg(root, {"own": ET.Element("g")}, "", ""))
    assert (
        tree.get("viewBox") == "0 0 5 6" and tree.get("width") == "9" and tree.get("height") == "6"
    )


# ---------------------------------------------------------------- Markdown


def test_headings_paragraphs_emphasis_and_soft_spaces():
    out = md(
        "<p class='eyebrow'>Harness switch</p><h1>Title</h1>"
        "<h2><span class='tag'>OFF</span>Ledges <br>drawn</h2>"
        "<p>Some <b> bold </b>and <em>em</em>, <del>gone</del>, <q>quote</q>, H<sub>2</sub>O "
        "<i> </i><span class='chip'>A</span><span class='chip'>B</span> * [x] _y_ a_b 1 &lt; 2"
        " &amp;amp;</p>"
        "<p># not a heading<br>- not a list</p><hr>"
    )
    assert "Harness switch" in out
    assert "## OFF Ledges drawn" in out
    assert "Some **bold** and *em*, ~~gone~~, “quote”, H<sub>2</sub>O" in out
    assert "A B" in out
    assert "\\* \\[x\\] \\_y\\_ a_b 1 &lt; 2 &amp;amp;" in out
    assert "\\# not a heading<br>\n\\- not a list" in out
    assert "---" in out


def test_twin_header_and_title_fallback():
    result = twin("<p>Just a paragraph here that is long enough to be a lead.</p>")
    lines = result.markdown.split("\n\n")
    assert lines[0] == "# T"
    assert lines[1].startswith("> Markdown twin of [demo.html](../demo.html)")
    assert result.title == "T"
    assert result.summary == "Just a paragraph here that is long enough to be a lead."


def test_lists_nested_and_ordered():
    out = md(
        "<ul><li>one</li><li>two<ul><li>inner</li></ul></li></ul>"
        "<ol start='3'><li><p>a</p><p>b</p></li><li>c</li></ol><ul></ul>"
    )
    assert "- one\n- two\n  - inner\n" in out
    assert "3. a\n\n   b\n\n4. c" in out


def test_code_and_pre():
    out = md(
        "<p><code>a`b</code> <kbd>`x</kbd> <code> </code></p><pre>\nline"
        " <span>1</span>\n```\n</pre>"
    )
    assert "``a`b``" in out and "`` `x ``" in out
    assert "````\nline 1\n```\n````" in out


def test_links():
    out = md(
        "<p id='top'><a href='other.html#x'>sib</a> <a href='https://e.com'>ext</a> "
        "<a href='http://127.0.0.1:8791/r'>local</a> <a href='../reports/x.html'>rep</a> "
        "<a href='javascript:x'>js</a> <a href='#top'>up</a> <a href='README.md'>idx</a> "
        "<a>bare</a> <a href='https://e.com'></a></p>"
    )
    assert '<a id="top"></a>' in out
    assert "[sib](other.md#x)" in out and "[ext](https://e.com)" in out
    assert "local rep js" in out and "[up](#top)" in out and "[idx](../README.md)" in out
    assert "bare" in out


def test_tables():
    out = md(
        "<table><thead><tr><th>A</th><th>B|C</th><th>D</th></tr></thead>"
        "<tbody><tr><td colspan='2'>wide</td><td><pre>x\ny</pre></td></tr>"
        "<tr><td colspan='z'>q</td></tr></tbody></table>"
        "<table><tr><td>Branch</td><td>claude/x</td></tr><tr><td>Tests</td><td>pass</td></tr>"
        "<tr><td></td><td>note</td></tr></table>"
        "<table><tr><td>1</td><td>2</td><td>3</td></tr></table><table></table>"
    )
    assert "| A | B\\|C | D |\n|---|---|---|\n| wide |  | `x`<br>`y` |\n| q |  |  |" in out
    assert "Branch" not in out and "- **Tests**: pass\n- note" in out
    assert "|  |  |  |\n|---|---|---|\n| 1 | 2 | 3 |" in out


def test_details_blockquote_dl_and_figures():
    svg = "<svg viewBox='0 0 4 4'><title>T1</title><rect/></svg>"
    result = twin(
        "<details><summary>More <b>info</b></summary><p>inside</p></details>"
        "<details><p>no summary</p></details>"
        "<blockquote><p>q1</p><p>q2</p></blockquote><blockquote></blockquote>"
        "<dl><dt>term</dt><dd>def</dd><dt></dt></dl>"
        f"<figure>{svg}<figcaption>Cap [1]</figcaption><p>after</p>text</figure>"
        f"<p>inline {svg}</p><figure><svg><rect></svg><figcaption>x</figcaption></figure>"
        "<svg width='0'><defs/></svg><div>loose<svg viewBox='0 0 1 1'"
        " aria-label='L'><rect/></svg></div>"
        "<img src='data:image/png;base64,iVBORw0K' alt='frame'><img"
        " src='data:image/jpeg;base64,/9j/'>"
        "<img src='data:image/png;base64,***'><img src='x.png'>"
        "<script>bad()</script><button>no</button>"
    )
    out = result.markdown
    assert "<details>\n<summary>More info</summary>\n\ninside\n\n</details>" in out
    assert "<summary>Details</summary>" in out
    assert "> q1\n>\n> q2" in out
    assert "**term**\n\ndef" in out
    assert "![Cap (1)](demo/fig-1.svg)\n\n*Cap \\[1\\]*\n\nafter\n\ntext" in out
    assert "inline ![T1](demo/fig-2.svg)" in out
    assert "![L](demo/fig-3.svg)" in out
    assert "![frame](demo/img-1.png)" in out and "![Image 2](demo/img-2.jpg)" in out
    assert "bad()" not in out and "no" not in out.split("\n")
    assert result.figures == 3 and result.images == 2 and result.lost_svgs == 1
    assert sorted(result.files) == [
        "docs/explainers/md/demo.md",
        "docs/explainers/md/demo/fig-1.svg",
        "docs/explainers/md/demo/fig-2.svg",
        "docs/explainers/md/demo/fig-3.svg",
        "docs/explainers/md/demo/img-1.png",
        "docs/explainers/md/demo/img-2.jpg",
    ]


def test_unclosed_and_stray_tags_keep_text():
    out = md("<p>a <best guess> b</p></div><section><p>c")
    assert "a" in out and "b" in out and "c" in out


def test_lead_summary_prefers_lead_and_skips_eyebrows():
    body = t.parse_html(
        "<p class='eyebrow'>demo · switch</p><p>short one</p>"
        "<p>demo-id appears early in this long enough paragraph text</p>"
        "<p>Default off. The real lead says what it does for the model.</p>"
    )
    assert t.lead_summary(body, "demo-id") == "The real lead says what it does for the model."
    lead = t.parse_html("<p>x</p><p class='lead'>PROF. BIRCH speaks first. Then more.</p>")
    assert t.lead_summary(lead, "x") == "PROF. BIRCH speaks first."
    assert t.lead_summary(t.parse_html("<p class='lead'> </p>"), "x") == ""
    long = "word " * 80
    assert t.lead_summary(t.parse_html(f"<p>{long}</p>"), "x").endswith("…")


# ---------------------------------------------------------------- features


FEATURES_TS = """
const RAM = "ram-state-v1";
const LONG="Bundle arm only, default off (the operator 2026-10-20). Warns before a gym.";
export const FEATURES: readonly FeatureInfo[] = [
  on("ram-state-v1", "observation", "RAM", null, "Reads the game's memory every observation."),
  on("gym-warn-v1", "guard", "GYM", RAM, LONG),
  on("tpl-v1", "guidance", "TPL", null, `Default off. Uses ${String(X.length)} cps | p.`),
  on("sq-v1", "guidance", "SQ", null, 'Says \\'hi\\' to people ' + "joined."),
  measured("split-v1", "SPLIT", "Records the split time."),
];
"""
PANELS_TS = (
    "export const FEATURE_EXPLAINERS:Readonly<Record<string,string>>=Object.freeze({\n"
    ' "gym-warn-v1":"gym-page.html",\n});\n'
)
NEXT_RUN_TS = (
    'export const DEFAULT_NEXT_RUN: NextRun = { model: "", features: { ...ALL_ON,'
    ' "gym-warn-v1": false, "sq-v1":false } };\n'
    'Object.assign(DEFAULT_NEXT_RUN.features, {"sq-v1":true,"tpl-v1":false});\n'
)


def test_parse_features():
    features = t.parse_features(FEATURES_TS)
    assert [f.id for f in features] == [
        "ram-state-v1",
        "gym-warn-v1",
        "tpl-v1",
        "sq-v1",
        "split-v1",
    ]
    assert features[1].description.startswith("Bundle arm only")
    assert features[2].description == "Default off. Uses N cps | p."
    assert features[3].description == "Says 'hi' to people joined."
    assert features[4].group == "measurement" and not features[4].switchable
    with pytest.raises(ValueError):
        t.parse_features('export const FEATURES = [\n on("x", ?);\n];')


def test_maps_defaults_and_one_line():
    assert t.parse_explainer_map(PANELS_TS) == {"gym-warn-v1": "gym-page"}
    assert t.parse_default_off(NEXT_RUN_TS) == {"gym-warn-v1", "tpl-v1"}
    assert (
        t.one_line("Bundle arm only, default off (the operator). Warns before a gym.")
        == "Warns before a gym."
    )
    assert t.one_line("(note) adds a line.") == "Adds a line."
    assert t.one_line("Needs x-v1. Enabled in both arms.") == "Needs x-v1."
    assert t.sentences("Run heard MT. CHIMNEY. Next.") == ["Run heard MT. CHIMNEY.", "Next."]


def test_snapshot_from_events():
    line = json.dumps(
        {
            "type": "run_start",
            "run": "2026-11-10T15-37-43_lane_67d7",
            "evaluation": {
                "preset_id": "p",
                "features_sha256": "h",
                "features": {"b": 1, "a": False},
            },
        }
    )
    snap = t.snapshot_from_events(line)
    assert snap == {
        "run": "67d7",
        "preset": "p",
        "features_sha256": "h",
        "features": {"a": False, "b": True},
    }
    assert list(snap["features"]) == ["a", "b"]
    with pytest.raises(ValueError):
        t.snapshot_from_events(json.dumps({"type": "turn"}))


SNAPSHOT = json.dumps({"run": "67d7", "features": {"ram-state-v1": True, "gym-warn-v1": False}})
PAGES = {
    "ram-state-v1": page(
        "<h1>RAM readout</h1><p class='lead'>Shows memory beside the screenshot.</p>"
    ),
    "gym-page": page("<h1>Gym warning</h1><p>Warns before a gym when the party is hurt badly.</p>"),
    "viewer-tool": page("<h1>Viewer tool</h1><p>A tool page that is not a switch at all.</p>"),
}


def inputs():
    return t.Inputs(PAGES, FEATURES_TS, PANELS_TS, NEXT_RUN_TS, SNAPSHOT)


def test_generate_index_and_features_table():
    output = t.generate(inputs())
    index = output.files["docs/explainers/README.md"].decode()
    assert (
        "3 explainers: 1 what the model sees, 1 guards and loop breakers, 1 harness, viewer"
        " and tooling." in index
    )
    assert (
        index.index("## What the model sees") < index.index("## Guards") < index.index("## Harness")
    )
    assert (
        "- [RAM readout](md/ram-state-v1.md) · [HTML](ram-state-v1.html) — Shows memory beside"
        " the screenshot." in index
    )
    assert "## Guidance and tools" not in index
    table = output.files["docs/features.md"].decode()
    assert "5 features." in table
    assert (
        "| observation | `ram-state-v1` | Reads the game's memory every observation. | on | on"
        " | [ram-state-v1](explainers/md/ram-state-v1.md) |" in table
    )
    assert (
        "| guard | `gym-warn-v1` | Warns before a gym. | off | off |"
        " [gym-page](explainers/md/gym-page.md) |" in table
    )
    assert "| guidance | `tpl-v1` | Uses N cps \\| p. | off |  |  |" in table
    assert "| measurement | `split-v1` | Records the split time. | always |  |  |" in table
    assert list(output.files) == sorted(output.files)


class MemoryStore:
    def __init__(self, files):
        self.files = dict(files)
        self.removed = []

    def read_text(self, rel):
        return self.files[rel].decode() if isinstance(self.files[rel], bytes) else self.files[rel]

    def list_files(self, rel_dir):
        return sorted(k for k in self.files if k.startswith(rel_dir + "/"))

    def read_bytes(self, rel):
        value = self.files.get(rel)
        return value.encode() if isinstance(value, str) else value

    def write_bytes(self, rel, data):
        self.files[rel] = data

    def remove(self, rel):
        self.removed.append(rel)
        del self.files[rel]


def repo():
    files = {f"docs/explainers/{pid}.html": html for pid, html in PAGES.items()}
    files.update(
        {
            "docs/explainers/sub/skip.html": "<p>nested</p>",
            t.FEATURES_TS: FEATURES_TS,
            t.PANELS_TS: PANELS_TS,
            t.NEXT_RUN_TS: NEXT_RUN_TS,
            t.RUN_SNAPSHOT: SNAPSHOT,
            "docs/explainers/md/old.md": b"stale",
        }
    )
    return MemoryStore(files)


def test_run_write_then_check_then_drift():
    store = repo()
    said = []
    assert t.run(["check"], store, said.append) == 1
    assert "stale: docs/explainers/md/old.md" in said and any(
        s.startswith("missing:") for s in said
    )
    said.clear()
    assert t.run([], store, said.append) == 0
    assert said[0].startswith("3 twins, 0 SVGs, 0 images;")
    assert store.removed == ["docs/explainers/md/old.md"]
    assert "docs/explainers/md/sub" not in " ".join(store.files)
    said.clear()
    assert t.run(["check"], store, said.append) == 0 and said == [
        "explainer twins up to date: 3 pages, 0 SVGs, 0 images"
    ]
    store.files["docs/features.md"] = b"edited"
    said.clear()
    assert t.run(["check"], store, said.append) == 1 and said[0] == "differs: docs/features.md"
    assert t.run(["write"], store, said.append) == 0 and said[-1].endswith("1 file(s) changed")


def test_run_reports_unparsed_svgs_and_bad_commands():
    store = repo()
    store.files["docs/explainers/broken.html"] = page("<h1>B</h1><svg><rect></svg>")
    said = []
    assert t.run(["write"], store, said.append) == 0
    assert said[-1] == "SVGs that did not parse: broken"
    assert t.run(["nope"], store, said.append) == 2
    assert t.run(["snapshot"], store, said.append) == 2


def test_run_snapshot_writes_committed_json():
    store = repo()
    store.files["runs/x/events.jsonl"] = (
        json.dumps({"type": "run_start", "run": "r_67d7", "evaluation": {"features": {"z": True}}})
        + "\n{}\n"
    )
    said = []
    assert t.run(["snapshot", "runs/x/events.jsonl"], store, said.append) == 0
    data = json.loads(store.files[t.RUN_SNAPSHOT])
    assert data["run"] == "67d7" and data["features"] == {"z": True}
