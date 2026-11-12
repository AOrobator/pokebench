import { describe, expect, it } from "vitest";
import { EXPLAINER_ALPHA } from "../test-support/fixture.js";
import { parseDoc, renderDoc } from "./doc.js";
import { InputError } from "./input.js";
import { inlineHtml, type InlineOptions } from "./markdown.js";

const opts: InlineOptions = {
  what: "x.md",
  html: true,
  link: (u) => (u.startsWith("https://") || u.startsWith("#") ? u : `L(${u})`),
  image: (s) => `I(${s})`,
};
const render = (md: string): string => renderDoc(parseDoc(md, "x.md"), opts).value;

describe("inlineHtml in explainer mode", () => {
  it("renders italics, italics around bold, escapes, line breaks, anchors and the five entities", () => {
    expect(inlineHtml("*a* and ***B.** c*", opts).value).toBe("<em>a</em> and <em><b>B.</b> c</em>");
    expect(inlineHtml("\\[text\\] a\\*b", opts).value).toBe("[text] a*b");
    expect(inlineHtml("one<br>two<br/>", opts).value).toBe("one<br>two<br>");
    expect(inlineHtml('<a id="overview"></a>x', opts).value).toBe('<span id="overview"></span>x');
    expect(inlineHtml("a &gt; b &lt; c &amp; d &quot;e&quot; &#39;f&#39;", opts).value).toBe("a &gt; b &lt; c &amp; d &quot;e&quot; &#39;f&#39;");
  });

  it("keeps code spans literal", () => {
    expect(inlineHtml("`\\p <br> *x*`", opts).value).toBe("<code>\\p &lt;br&gt; *x*</code>");
  });

  it("does not treat a lone or spaced asterisk as emphasis", () => {
    expect(inlineHtml("5 * 3 and a* b", opts).value).toBe("5 * 3 and a* b");
  });

  it("renders images through the image rule and links through the link rule", () => {
    expect(inlineHtml("![a <b>](f/fig-1.svg) [t](y.md)", opts).value).toBe('<img src="I(f/fig-1.svg)" alt="a &lt;b&gt;" loading="lazy"> <a href="L(y.md)">t</a>');
  });

  it("fails on raw HTML it does not know, naming the file", () => {
    expect(() => inlineHtml("a <b>bold</b>", opts)).toThrow(InputError);
    expect(() => inlineHtml('<img src="x">', opts)).toThrow(/x\.md/);
    expect(() => inlineHtml('<a href="https://x">y</a>', opts)).toThrow(/raw HTML/);
  });

  it("fails on an image where images are not allowed", () => {
    expect(() => inlineHtml("![a](b.png)", { what: "p.md", html: false, link: (u) => u })).toThrow(/image/);
  });
});

describe("parseDoc and renderDoc", () => {
  it("renders headings one to three and rejects deeper ones", () => {
    expect(render("# A\n\n## B\n\n### C")).toBe("<h1>A</h1>\n<h2>B</h2>\n<h3>C</h3>");
    expect(() => parseDoc("#### D", "x.md")).toThrow(/x\.md/);
  });

  it("joins wrapped paragraph lines", () => {
    expect(render("one\ntwo\n\nthree")).toBe("<p>one two</p>\n<p>three</p>");
  });

  it("renders fenced code literally, escaped, with its line breaks", () => {
    expect(render("```\na <b> & *c*\n  d\n```")).toBe("<pre><code>a &lt;b&gt; &amp; *c*\n  d</code></pre>");
    expect(() => parseDoc("```\nnever closed", "x.md")).toThrow(/fence/);
  });

  it("renders tables with header, rows and escaped pipes", () => {
    expect(render("| A | B |\n|---|:-:|\n| `x \\| y` | 2 |")).toBe(
      '<div class="tbl"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>x | y</code></td><td>2</td></tr></tbody></table></div>',
    );
    expect(() => parseDoc("| A |\n| B |", "x.md")).toThrow(/table/);
  });

  it("renders quotes, with blank quote lines starting new paragraphs", () => {
    expect(render("> a<br>\n> b\n>\n> c")).toBe("<blockquote><p>a<br> b</p><p>c</p></blockquote>");
  });

  it("renders bulleted and numbered lists, with indented continuation lines", () => {
    expect(render("- a\n  more\n- b")).toBe("<ul><li>a more</li><li>b</li></ul>");
    expect(render("3. x\n4. y")).toBe('<ol start="3"><li>x</li><li>y</li></ol>');
  });

  it("renders an image on its own line as a figure", () => {
    expect(render("![Alt](f/fig-1.svg)")).toBe('<figure class="fig"><img src="I(f/fig-1.svg)" alt="Alt" loading="lazy"></figure>');
  });

  it("renders details with a summary, and rejects unbalanced or summary-less ones", () => {
    expect(render("<details>\n<summary>More</summary>\n\nInside.\n\n</details>")).toBe("<details><summary>More</summary>\n<p>Inside.</p></details>");
    expect(() => parseDoc("<details>\n\nx", "x.md")).toThrow(/details/);
    expect(() => parseDoc("</details>", "x.md")).toThrow(/details/);
    expect(() => parseDoc("<details>\nx\n</details>", "x.md")).toThrow(/summary/);
  });

  it("parses every construct the fixture explainer uses", () => {
    const kinds = parseDoc(EXPLAINER_ALPHA, "alpha-v1.md").map((b) => b.kind);
    expect(kinds).toEqual(["p", "h", "quote", "p", "h", "fig", "p", "h", "table", "pre", "quote", "ul", "ol", "details"]);
  });
});
