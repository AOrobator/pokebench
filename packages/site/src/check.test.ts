import { describe, expect, it } from "vitest";
import { problems } from "./check.js";

const page = (body: string, head = ""): string => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("problems: zero network (INV-3)", () => {
  it("allows plain outbound links", () => {
    expect(problems(new Map([["index.html", page('<a href="https://github.com/x">GitHub</a>')]]))).toEqual([]);
  });

  it("flags a remote image, script, stylesheet, iframe and source", () => {
    const out = problems(new Map([["index.html", page(
      '<img src="https://cdn.example/x.png"><script src="//cdn.example/x.js"></script><iframe src="http://x"></iframe><picture><source srcset="https://x/a.png 2x"></picture>',
      '<link rel="stylesheet" href="https://fonts.example/css">',
    )]]));
    expect(out).toHaveLength(5);
    expect(out.every((p) => p.startsWith("index.html: network"))).toBe(true);
  });

  it("flags remote CSS url() and @import", () => {
    const out = problems(new Map([["site.css", "@import url(https://x/a.css);\n.a { background: url('https://x/b.png'); }\n@import 'https://x/c.css';"]]));
    expect(out).toHaveLength(3);
  });

  it("flags a remote url in an inline style attribute", () => {
    expect(problems(new Map([["index.html", page('<div style="background:url(https://x/y.png)"></div>')]]))).toHaveLength(1);
  });

  it("flags remote references however the attribute is quoted", () => {
    const out = problems(new Map([["index.html", page("<img src='https://x/a.png'><img src=https://x/b.png>")]]));
    expect(out).toEqual(['index.html: network request to "https://x/a.png"', 'index.html: network request to "https://x/b.png"']);
  });

  it("flags any attribute that would fetch from the network: poster, object data, meta refresh", () => {
    const out = problems(new Map([["index.html", page(
      '<video poster="https://x/p.png"></video><object data="//x/o.swf"></object>',
      '<meta http-equiv="refresh" content="0; url=https://x/">',
    )]]));
    expect(out).toHaveLength(3);
  });

  it("flags remote url() and @import inside a <style> element", () => {
    const out = problems(new Map([["index.html", page("", "<style>@import 'https://x/a.css'; .a { background: url(https://x/b.png) }</style>")]]));
    expect(out).toHaveLength(2);
  });

  it("ignores data: urls and in-page fragments", () => {
    expect(problems(new Map([["index.html", page('<a href="#top">top</a><img src="data:image/png;base64,AAA">')]]))).toEqual([]);
  });
});

describe("problems: every local reference resolves", () => {
  it("flags a page linking to a page that was not built", () => {
    expect(problems(new Map([["index.html", page('<a href="results.html">Results</a>')]]))).toEqual([
      'index.html: "results.html" is not a built file',
    ]);
  });

  it("resolves relative paths from nested pages and css", () => {
    const outputs = new Map<string, string | Uint8Array>([
      ["index.html", page('<a href="models/a.html">A</a><img src="img/x.png">')],
      ["models/a.html", page('<a href="../index.html">Home</a><link rel="stylesheet" href="../site.css">')],
      ["site.css", ".x { background: url(icons/i.svg); }"],
      ["icons/i.svg", new Uint8Array([1])],
      ["img/x.png", new Uint8Array([1])],
    ]);
    expect(problems(outputs)).toEqual([]);
  });

  it("ignores a query string or fragment on a local link", () => {
    const outputs = new Map<string, string | Uint8Array>([["index.html", page('<a href="index.html#stats">x</a>')]]);
    expect(problems(outputs)).toEqual([]);
  });

  it("flags a root-absolute path, which breaks when the site is served from a subfolder", () => {
    const outputs = new Map<string, string | Uint8Array>([["models/a.html", page('<link rel="stylesheet" href="/site.css">')], ["models/site.css", ""], ["site.css", ""]]);
    expect(problems(outputs)).toEqual(['models/a.html: "/site.css" is root-absolute; use a relative path']);
  });

  it("checks local references in single-quoted and unquoted attributes too", () => {
    expect(problems(new Map([["index.html", page("<img src='img/a.png'><img src=img/b.png>")]]))).toEqual([
      'index.html: "img/a.png" is not a built file',
      'index.html: "img/b.png" is not a built file',
    ]);
  });

  it("flags a path that climbs out of the site", () => {
    expect(problems(new Map([["index.html", page('<img src="../secret.png">')]]))).toEqual(['index.html: "../secret.png" leaves the site']);
  });

  it("checks every srcset candidate", () => {
    const out = problems(new Map<string, string | Uint8Array>([
      ["index.html", page('<picture><source srcset="img/a.png 1x, img/b.png 2x"></picture>')],
      ["img/a.png", new Uint8Array([1])],
    ]));
    expect(out).toEqual(['index.html: "img/b.png" is not a built file']);
  });

  it("does not scan binary files", () => {
    expect(problems(new Map([["img/x.png", new TextEncoder().encode("url(https://x)")]]))).toEqual([]);
  });
});
