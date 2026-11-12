// A small Markdown subset for update posts: paragraphs, "## " headings, "- " lists, **bold**, `code` and
// [links](url). Everything is escaped; raw HTML shows as text. Links are https or plain relative site paths.
import { html, join, type Html } from "./html.js";
import { InputError } from "./input.js";

export type Block =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "h2"; readonly text: string }
  | { readonly kind: "ul"; readonly items: readonly string[] };

export function parseMarkdown(text: string, what: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    const [first] = lines;
    if (first === undefined) continue;
    if (first.startsWith("#")) {
      if (!/^## \S/.test(first) || lines.length > 1) throw new InputError(`${what}: only "## " headings, each on its own line, are supported ("${first}")`);
      blocks.push({ kind: "h2", text: first.slice(3).trim() });
    } else if (lines.some((l) => l.startsWith("- "))) {
      if (!lines.every((l) => l.startsWith("- "))) throw new InputError(`${what}: every line of a list must start with "- "`);
      blocks.push({ kind: "ul", items: lines.map((l) => l.slice(2).trim()) });
    } else {
      blocks.push({ kind: "p", text: lines.join(" ") });
    }
  }
  return blocks;
}

const INLINE = new RegExp(
  [
    "`(?<code>[^`]+)`",
    "\\\\(?<esc>[\\\\`*_{}\\[\\]()#+\\-.!|<>~])",
    "(?<br><br\\s*/?>)",
    '<a id="(?<anchor>[a-z0-9_-]+)"></a>',
    "&(?<ent>gt|lt|amp|quot|#39);",
    "!\\[(?<alt>[^\\]]*)\\]\\((?<src>[^)\\s]+)\\)",
    "\\[(?<label>(?:[^\\[\\]\\\\]|\\\\.)+)\\]\\((?<url>[^)\\s]+)\\)",
    "\\*(?![\\s*])(?<em>(?:[^*]|\\*\\*[^*]+\\*\\*)+?)(?<!\\s)\\*(?!\\*)",
    "\\*(?=\\*\\*)(?<em2>(?:[^*]|\\*\\*[^*]+\\*\\*)+?)(?<!\\s)\\*(?!\\*)",
    "\\*\\*(?<bold>.+?)\\*\\*",
    // Any other tag, and any comment, doctype or processing instruction (<! or <?), fails in explainer mode.
    "(?<tag></?[a-zA-Z][^>]*>|<[!?])",
  ].join("|"),
  "g",
);
const ENTITIES: Readonly<Record<string, string>> = { gt: ">", lt: "<", amp: "&", quot: '"', "#39": "'" };
const HTTPS = /^https:\/\/[^\s"'<>]+$/;
const RELATIVE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*(?:#[a-z0-9_-]+)?$/i;

export interface InlineOptions {
  // Names the source in errors.
  readonly what: string;
  // Explainer mode: <br>, <a id> anchors and the five entities are read, and any other raw HTML fails.
  // Post mode (false): all of them stay text.
  readonly html: boolean;
  // Maps a link's URL to the href to write; throws InputError to refuse it.
  readonly link: (url: string) => string;
  // Maps an image's path to the src to write; without it, images are refused.
  readonly image?: (src: string) => string;
}

export function inlineHtml(text: string, o: InlineOptions): Html {
  const parts: Html[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    parts.push(html`${text.slice(at, m.index)}`);
    at = m.index + m[0].length;
    const g = m.groups ?? {};
    if (g.code !== undefined) parts.push(html`<code>${g.code}</code>`);
    else if (g.esc !== undefined) parts.push(html`${g.esc}`);
    else if (g.label !== undefined) parts.push(html`<a href="${o.link(String(g.url))}">${inlineHtml(g.label, o)}</a>`);
    else if (g.em !== undefined || g.em2 !== undefined) parts.push(html`<em>${inlineHtml(String(g.em ?? g.em2), o)}</em>`);
    else if (g.bold !== undefined) parts.push(html`<b>${inlineHtml(g.bold, o)}</b>`);
    else if (g.alt !== undefined) {
      if (o.image === undefined) throw new InputError(`${o.what}: an image is not allowed here ("${m[0]}")`);
      parts.push(html`<img src="${o.image(String(g.src))}" alt="${g.alt}" loading="lazy">`);
    } else if (!o.html) parts.push(html`${m[0]}`);
    else if (g.br !== undefined) parts.push(html`<br>`);
    else if (g.anchor !== undefined) parts.push(html`<span id="${g.anchor}"></span>`);
    else if (g.ent !== undefined) parts.push(html`${String(ENTITIES[g.ent])}`);
    else throw new InputError(`${o.what}: raw HTML "${m[0]}" is not supported`);
  }
  parts.push(html`${text.slice(at)}`);
  return join(parts, "");
}

function postLink(root: string, what: string): (url: string) => string {
  return (url) => {
    if (HTTPS.test(url)) return url;
    if (RELATIVE.test(url)) return root + url;
    throw new InputError(`${what}: link "${url}" must be https or a relative path inside the site`);
  };
}

export function renderInline(text: string, root: string, what: string): Html {
  return inlineHtml(text, { what, html: false, link: postLink(root, what) });
}

export function renderBlocks(blocks: readonly Block[], root: string, what: string): Html {
  return join(blocks.map((b) => {
    if (b.kind === "h2") return html`<h2>${renderInline(b.text, root, what)}</h2>`;
    if (b.kind === "ul") return html`<ul>${b.items.map((i) => html`<li>${renderInline(i, root, what)}</li>`)}</ul>`;
    return html`<p>${renderInline(b.text, root, what)}</p>`;
  }), "\n");
}

// The words without the markup, for the feed's plain-text descriptions.
export function plainText(text: string): string {
  return text.replace(INLINE, (all: string, ...args: unknown[]) => {
    const g = args.at(-1) as Readonly<Record<string, string | undefined>>;
    const inner = g.bold ?? g.em ?? g.em2 ?? g.label;
    if (inner !== undefined) return plainText(inner);
    return g.code ?? g.esc ?? g.alt ?? all;
  });
}
