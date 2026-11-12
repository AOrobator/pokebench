import { parseDoc, type DocBlock } from "./doc.js";
import { InputError } from "./input.js";

export interface ExplainerFile {
  readonly name: string;
  readonly text: string;
}

export interface Explainer {
  readonly slug: string;
  // The source file name, for errors.
  readonly file: string;
  readonly title: string;
  // The status line above the title ("Harness switch · observation · …").
  readonly kicker?: string;
  readonly blocks: readonly DocBlock[];
}

const NAME = /^([a-z0-9][a-z0-9._-]*)\.md$/;

// The generated twins open with a note pointing at their HTML source; the site renders the Markdown itself.
const isTwinNote = (b: DocBlock): boolean => b.kind === "quote" && (b.paras[0] ?? "").startsWith("Markdown twin of");

export function parseExplainer(f: ExplainerFile): Explainer {
  const named = NAME.exec(f.name);
  if (named === null) throw new InputError(`${f.name}: expected a lowercase file name ending in .md`);
  const blocks = parseDoc(f.text, f.name);
  const titleAt = blocks.findIndex((b) => b.kind === "h" && b.level === 1);
  const title = blocks[titleAt];
  if (title?.kind !== "h") throw new InputError(`${f.name}: needs a # title`);
  const [first, ...restBefore] = blocks.slice(0, titleAt);
  const kicker = first?.kind === "p" ? first.text : undefined;
  const before = kicker === undefined ? blocks.slice(0, titleAt) : restBefore;
  return {
    slug: String(named[1]),
    file: f.name,
    title: title.text,
    ...(kicker === undefined ? {} : { kicker }),
    blocks: [...before, ...blocks.slice(titleAt + 1)].filter((b) => !isTwinNote(b)),
  };
}

const HTTPS = /^https:\/\/[^\s"'<>]+$/;
const FRAGMENT = /^#[a-z0-9_-]+$/i;
const SIBLING = /^([a-z0-9][a-z0-9._-]*)\.md(#[a-z0-9_-]+)?$/i;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const README_ENTRY = /^md\/([a-z0-9][a-z0-9._-]*)\.md(#[a-z0-9_-]+)?$/i;

// Where an explainer's link goes on the site: another explainer's page, a fragment, an https page, or,
// for any other path in the repository, its file on GitHub. Nothing may leave the repository. Links are
// read from where their Markdown lives: md/ for an explainer, docs/explainers for the README index.
export function explainerLink(githubUrl: string, what: string, from: "md" | "readme" = "md"): (url: string) => string {
  return (url) => {
    if (HTTPS.test(url) || FRAGMENT.test(url)) return url;
    const page = (from === "md" ? SIBLING : README_ENTRY).exec(url);
    if (page !== null) return `${String(page[1])}.html${page[2] ?? ""}`;
    const [path = "", fragment] = url.split("#");
    const parts = from === "md" ? ["docs", "explainers", "md"] : ["docs", "explainers"];
    for (const seg of path.split("/")) {
      if (!SEGMENT.test(seg)) throw new InputError(`${what}: link "${url}" must be https or a path inside the repository`);
      if (seg === "..") {
        if (parts.pop() === undefined) throw new InputError(`${what}: link "${url}" leaves the repository`);
      } else if (seg !== ".") parts.push(seg);
    }
    if (fragment !== undefined && !/^[a-z0-9_-]+$/i.test(fragment)) throw new InputError(`${what}: link "${url}" has an unusual fragment`);
    return `${githubUrl}/blob/main/${parts.join("/")}${fragment === undefined ? "" : `#${fragment}`}`;
  };
}

const FIGURE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.(?:svg|png)$/i;

export function explainerImage(what: string): (src: string) => string {
  return (src) => {
    if (!FIGURE.test(src)) throw new InputError(`${what}: figure "${src}" must be <explainer>/<file>.svg or .png`);
    return src;
  };
}

export interface IndexItem {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
}

export interface IndexGroup {
  readonly title: string;
  readonly about: string;
  readonly items: readonly IndexItem[];
}

const ITEM = /^- \[(.+?)\]\(md\/([a-z0-9][a-z0-9._-]*)\.md\) · \[HTML\]\([^)]*\) — (.*)$/;

// The groups come from docs/explainers/README.md: each "## " heading, the paragraph under it, and its list.
export function parseExplainerIndex(readme: string): IndexGroup[] {
  const groups: { title: string; about: string; items: IndexItem[] }[] = [];
  for (const line of readme.split("\n").map((l) => l.trimEnd())) {
    const group = groups[groups.length - 1];
    if (line.startsWith("## ")) groups.push({ title: line.slice(3).trim(), about: "", items: [] });
    else if (group === undefined || line === "") continue;
    else if (line.startsWith("- ")) {
      const m = ITEM.exec(line);
      if (m === null) throw new InputError(`explainers README: cannot read "${line}"`);
      group.items.push({ title: String(m[1]), slug: String(m[2]), summary: String(m[3]) });
    } else if (group.about === "") group.about = line;
  }
  return groups;
}

export interface ExplainerGroup {
  readonly title: string;
  readonly about: string;
  readonly items: readonly (IndexItem & { readonly explainer: Explainer })[];
}

export function joinExplainers(groups: readonly IndexGroup[], explainers: readonly Explainer[]): ExplainerGroup[] {
  const bySlug = new Map(explainers.map((e) => [e.slug, e]));
  const seen = new Set<string>();
  const joined = groups.map((g) => ({
    title: g.title,
    about: g.about,
    items: g.items.map((item) => {
      if (seen.has(item.slug)) throw new InputError(`explainers README lists ${item.slug} twice`);
      seen.add(item.slug);
      const explainer = bySlug.get(item.slug);
      if (explainer === undefined) throw new InputError(`explainers README lists ${item.slug}, but there is no md/${item.slug}.md`);
      return { ...item, explainer };
    }),
  }));
  for (const e of explainers) if (!seen.has(e.slug)) throw new InputError(`md/${e.file} is not in the explainers README`);
  return joined;
}
