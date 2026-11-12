import { describe, expect, it } from "vitest";
import { at } from "../test-support/at.js";
import { EXPLAINER_ALPHA, EXPLAINER_BETA, EXPLAINER_README } from "../test-support/fixture.js";
import { explainerLink, joinExplainers, parseExplainer, parseExplainerIndex } from "./explainers.js";
import { InputError } from "./input.js";

describe("parseExplainer", () => {
  it("takes the title from the # heading, the line above it as the kicker, and drops the Markdown-twin note", () => {
    const e = parseExplainer({ name: "alpha-v1.md", text: EXPLAINER_ALPHA });
    expect(e.slug).toBe("alpha-v1");
    expect(e.title).toBe("Alpha tiles");
    expect(e.kicker).toBe("Harness switch · observation · `alpha-v1` · off by default");
    expect(e.blocks.some((b) => b.kind === "quote" && b.paras.some((p) => p.startsWith("Markdown twin")))).toBe(false);
    expect(e.blocks.some((b) => b.kind === "h" && b.level === 1)).toBe(false);
  });

  it("has no kicker when the heading comes first", () => {
    expect(parseExplainer({ name: "beta-v1.md", text: EXPLAINER_BETA }).kicker).toBeUndefined();
  });

  it("rejects a file without a # title or with a bad name", () => {
    expect(() => parseExplainer({ name: "x.md", text: "No title." })).toThrow(/x\.md/);
    expect(() => parseExplainer({ name: "Bad Name.md", text: "# T" })).toThrow(InputError);
  });
});

describe("explainerLink", () => {
  const link = explainerLink("https://github.com/example/pokebench", "x.md");
  it("points sibling Markdown at the built page and keeps fragments and https", () => {
    expect(link("beta-v1.md")).toBe("beta-v1.html");
    expect(link("beta-v1.md#how")).toBe("beta-v1.html#how");
    expect(link("#overview")).toBe("#overview");
    expect(link("https://example.com/x")).toBe("https://example.com/x");
  });

  it("sends repository paths to GitHub and refuses anything that leaves the repository or is not https", () => {
    expect(link("../../packages/agent/src/features.ts")).toBe("https://github.com/example/pokebench/blob/main/packages/agent/src/features.ts");
    expect(link("../features.md#list")).toBe("https://github.com/example/pokebench/blob/main/docs/features.md#list");
    expect(() => link("../../../../etc/passwd")).toThrow(/x\.md/);
    expect(() => link("http://example.com")).toThrow(InputError);
    expect(() => link("javascript:alert(1)")).toThrow(InputError);
  });
});

describe("parseExplainerIndex", () => {
  it("reads the groups, their descriptions and each entry's title and summary", () => {
    const groups = parseExplainerIndex(EXPLAINER_README);
    expect(groups.map((g) => [g.title, g.about, g.items.length])).toEqual([["What the model sees", "Readouts built from game memory.", 1], ["Guards and loop breakers", "Checks that catch a stuck model.", 1]]);
    expect(at(at(groups, 0).items, 0)).toEqual({ slug: "alpha-v1", title: "Alpha tiles", summary: "Names the `four` tiles." });
  });

  it("rejects a list line it cannot read", () => {
    expect(() => parseExplainerIndex("## G\n\nAbout.\n\n- [x](y.md)")).toThrow(/README/);
  });
});

describe("joinExplainers", () => {
  const files = [parseExplainer({ name: "alpha-v1.md", text: EXPLAINER_ALPHA }), parseExplainer({ name: "beta-v1.md", text: EXPLAINER_BETA })];
  it("puts every explainer in exactly one group", () => {
    const joined = joinExplainers(parseExplainerIndex(EXPLAINER_README), files);
    expect(joined.map((g) => g.items.map((i) => i.explainer.slug))).toEqual([["alpha-v1"], ["beta-v1"]]);
  });

  it("rejects an explainer missing from the index, and an index entry with no file", () => {
    expect(() => joinExplainers(parseExplainerIndex(EXPLAINER_README), [...files, parseExplainer({ name: "gamma-v1.md", text: "# G\n\nx" })])).toThrow(/gamma-v1/);
    expect(() => joinExplainers(parseExplainerIndex(EXPLAINER_README), files.slice(0, 1))).toThrow(/beta-v1/);
    expect(() => joinExplainers(parseExplainerIndex(`${EXPLAINER_README}\n## Again\n\nA.\n\n- [Beta](md/beta-v1.md) · [HTML](beta-v1.html) — Again.\n`), files)).toThrow(/beta-v1/);
  });
});
