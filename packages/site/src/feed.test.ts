import { describe, expect, it } from "vitest";
import { POST_CLEARS, POST_HELLO } from "../test-support/fixture.js";
import { feed, rfc822 } from "./feed.js";
import { parsePosts } from "./posts.js";

const posts = () => parsePosts([{ name: "2026-11-02-hello.md", text: POST_HELLO }, { name: "2026-11-11-model-a-clears.md", text: POST_CLEARS }], new Set(["model-a"]));

// Well-formed enough for RSS readers: every start tag closes in order, and no bare & or < in text.
function balanced(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self === "/") continue;
    if (close === "/") {
      if (stack.pop() !== name) return false;
    } else stack.push(String(name));
  }
  const text = body.replace(/<[^>]*>/g, "");
  return stack.length === 0 && !/&(?!amp;|lt;|gt;|quot;|#39;)/.test(text) && !text.includes("<");
}

describe("rfc822", () => {
  it("writes noon in New York with the offset for that date", () => {
    expect(rfc822("2026-11-11")).toBe("Wed, 11 Nov 2026 12:00:00 -0500");
    expect(rfc822("2026-07-04")).toBe("Sat, 04 Jul 2026 12:00:00 -0400");
  });

  it("switches at the second Sunday of March and the first Sunday of November", () => {
    expect(rfc822("2026-03-07")).toMatch(/-0500$/);
    expect(rfc822("2026-03-08")).toMatch(/-0400$/);
    expect(rfc822("2026-10-31")).toMatch(/-0400$/);
    expect(rfc822("2026-11-01")).toMatch(/-0500$/);
    expect(rfc822("2027-03-14")).toMatch(/-0400$/);
    expect(rfc822("2027-03-13")).toMatch(/-0500$/);
  });
});

describe("feed", () => {
  it("is well-formed RSS 2.0 with the channel fields", () => {
    const x = feed("https://example.github.io/pokebench/", posts());
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">')).toBe(true);
    expect(balanced(x)).toBe(true);
    expect(x).toContain("<title>PokéBench updates</title>");
    expect(x).toContain("<link>https://example.github.io/pokebench/updates.html</link>");
    expect(x).toContain("<description>");
  });

  it("has one item per post, newest first, with absolute links, permalink guids, dates and escaped first paragraphs", () => {
    const x = feed("https://example.github.io/pokebench/", posts());
    const items = x.split("<item>").slice(1);
    expect(items).toHaveLength(2);
    const first = String(items[0]);
    expect(first).toContain("<title>Model A clears the game &amp; more</title>");
    expect(first).toContain("<link>https://example.github.io/pokebench/updates/2026-11-11-model-a-clears.html</link>");
    expect(first).toContain('<guid isPermaLink="true">https://example.github.io/pokebench/updates/2026-11-11-model-a-clears.html</guid>');
    expect(first).toContain("<pubDate>Wed, 11 Nov 2026 12:00:00 -0500</pubDate>");
    expect(first).toContain("<description>Model A beat the game in one run, see run ab07 &amp; the code. It used just verify-release &lt;b&gt;too&lt;/b&gt;.</description>");
    expect(String(items[1])).toContain("Hello");
  });

  it("catches unbalanced markup in the test helper", () => {
    expect(balanced("<a><b></a></b>")).toBe(false);
    expect(balanced("<a>x & y</a>")).toBe(false);
  });
});
