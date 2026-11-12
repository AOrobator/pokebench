import { describe, expect, it } from "vitest";
import { InputError } from "./input.js";
import { parseMarkdown, plainText, renderBlocks, renderInline } from "./markdown.js";

describe("parseMarkdown", () => {
  it("splits paragraphs, ## headings and - lists at blank lines, joining wrapped lines", () => {
    expect(parseMarkdown("One\ntwo.\n\n## Head\n\n- a\n- b\n\nLast.", "p")).toEqual([
      { kind: "p", text: "One two." },
      { kind: "h2", text: "Head" },
      { kind: "ul", items: ["a", "b"] },
      { kind: "p", text: "Last." },
    ]);
  });

  it("ignores extra blank lines and trailing spaces", () => {
    expect(parseMarkdown("\n\nA  \n\n\n\nB\n", "p")).toEqual([{ kind: "p", text: "A" }, { kind: "p", text: "B" }]);
  });

  it("rejects headings other than ##, and a list mixed with plain lines", () => {
    expect(() => parseMarkdown("# Big", "post.md")).toThrow(InputError);
    expect(() => parseMarkdown("### Small", "post.md")).toThrow(/post\.md/);
    expect(() => parseMarkdown("- a\nb", "post.md")).toThrow(/list/);
  });
});

describe("renderInline", () => {
  it("renders bold, code and links, escaping everything else", () => {
    expect(renderInline("a **b** `c<d>` [e & f](runs/x.html) <i>g</i>", "", "p").value).toBe(
      'a <b>b</b> <code>c&lt;d&gt;</code> <a href="runs/x.html">e &amp; f</a> &lt;i&gt;g&lt;/i&gt;',
    );
  });

  it("prefixes relative links with the page's root and leaves https links alone", () => {
    expect(renderInline("[r](results.html) [g](https://github.com/x)", "../", "p").value).toBe('<a href="../results.html">r</a> <a href="https://github.com/x">g</a>');
  });

  it("keeps an unmatched marker as text", () => {
    expect(renderInline("a ** b ` c [d]", "", "p").value).toBe("a ** b ` c [d]");
  });

  it("rejects links that are not https or plain relative site paths", () => {
    for (const bad of ["http://x.com", "javascript:alert(1)", "/abs.html", "../up.html", "//host/x", "a/../b.html"]) {
      expect(() => renderInline(`[x](${bad})`, "", "post.md")).toThrow(/post\.md/);
    }
  });

  it("allows a fragment on a relative link", () => {
    expect(renderInline("[x](method.html#turn)", "", "p").value).toBe('<a href="method.html#turn">x</a>');
  });
});

describe("renderBlocks", () => {
  it("renders paragraphs, headings and lists", () => {
    expect(renderBlocks([{ kind: "p", text: "a" }, { kind: "h2", text: "H" }, { kind: "ul", items: ["x", "**y**"] }], "", "p").value).toBe(
      "<p>a</p>\n<h2>H</h2>\n<ul><li>x</li><li><b>y</b></li></ul>",
    );
  });
});

describe("plainText", () => {
  it("drops the markup and keeps the words", () => {
    expect(plainText("a **b** `c` [d](x.html) & e")).toBe("a b c d & e");
  });
});
