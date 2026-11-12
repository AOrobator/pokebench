import { describe, expect, it } from "vitest";
import { at } from "../test-support/at.js";
import { POST_CLEARS, POST_HELLO } from "../test-support/fixture.js";
import { InputError } from "./input.js";
import { parsePosts } from "./posts.js";

const slugs = new Set(["model-a", "model-b"]);
const one = (name: string, text: string) => parsePosts([{ name, text }], slugs);
const post = (front: string[], body = "Body.") => ["---", ...front, "---", "", body].join("\n");

describe("parsePosts", () => {
  it("reads front matter and body, newest first", () => {
    const posts = parsePosts([{ name: "2026-11-02-hello.md", text: POST_HELLO }, { name: "2026-11-11-model-a-clears.md", text: POST_CLEARS }], slugs);
    expect(posts.map((p) => p.name)).toEqual(["2026-11-11-model-a-clears", "2026-11-02-hello"]);
    const a = at(posts, 0);
    expect(a).toMatchObject({ date: "2026-11-11", title: "Model A clears the game & more", models: ["model-a"] });
    expect(a.first).toContain("**one run**");
    expect(at(posts, 1).models).toEqual([]);
  });

  it("orders posts of one date by file name", () => {
    const posts = parsePosts([{ name: "2026-11-11-b.md", text: post(["date: 2026-11-11", "title: B"]) }, { name: "2026-11-11-a.md", text: post(["date: 2026-11-11", "title: A"]) }], slugs);
    expect(posts.map((p) => p.name)).toEqual(["2026-11-11-a", "2026-11-11-b"]);
  });

  it("rejects a file name that is not YYYY-MM-DD-slug.md or disagrees with the date", () => {
    expect(() => one("hello.md", post(["date: 2026-11-11", "title: T"]))).toThrow(/hello\.md/);
    expect(() => one("2026-11-11-Hello.md", post(["date: 2026-11-11", "title: T"]))).toThrow(InputError);
    expect(() => one("2026-11-10-x.md", post(["date: 2026-11-11", "title: T"]))).toThrow(/date/);
  });

  it("rejects a date that is not a real day", () => {
    expect(() => one("2026-02-30-x.md", post(["date: 2026-02-30", "title: T"]))).toThrow(/date/);
  });

  it("rejects missing, unknown and repeated front matter fields", () => {
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11"]))).toThrow(/title/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "author: me"]))).toThrow(/unknown field "author"/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "title: U"]))).toThrow(/twice/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title T"]))).toThrow(/key: value/);
  });

  it("rejects a post without front matter or without a first paragraph", () => {
    expect(() => one("2026-11-11-x.md", "Just text.")).toThrow(/front matter/);
    expect(() => one("2026-11-11-x.md", "---\ndate: 2026-11-11\ntitle: T\n")).toThrow(/front matter/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T"], "## Only a heading"))).toThrow(/paragraph/);
  });

  it("rejects models that are not a [list] of known model slugs", () => {
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "models: [model-z]"]))).toThrow(/model-z/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "models: model-a"]))).toThrow(/models/);
    expect(one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "models: [model-a, model-b]"]))[0]?.models).toEqual(["model-a", "model-b"]);
    expect(one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T", "models: []"]))[0]?.models).toEqual([]);
  });

  it("rejects two posts with one name, and bad links in the body", () => {
    expect(() => parsePosts([{ name: "2026-11-11-x.md", text: post(["date: 2026-11-11", "title: T"]) }, { name: "2026-11-11-x.md", text: post(["date: 2026-11-11", "title: T"]) }], slugs)).toThrow(/twice/);
    expect(() => one("2026-11-11-x.md", post(["date: 2026-11-11", "title: T"], "[x](javascript:1)"))).toThrow(/2026-11-11-x\.md/);
  });
});
