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

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const HTTPS = /^https:\/\/[^\s"'<>]+$/;
const RELATIVE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*(?:#[a-z0-9_-]+)?$/i;

function href(url: string, root: string, what: string): string {
  if (HTTPS.test(url)) return url;
  if (RELATIVE.test(url)) return root + url;
  throw new InputError(`${what}: link "${url}" must be https or a relative path inside the site`);
}

export function renderInline(text: string, root: string, what: string): Html {
  const parts: Html[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    parts.push(html`${text.slice(at, m.index)}`);
    const [, code, bold, label, url] = m;
    if (code !== undefined) parts.push(html`<code>${code}</code>`);
    else if (bold !== undefined) parts.push(html`<b>${renderInline(bold, root, what)}</b>`);
    else parts.push(html`<a href="${href(String(url), root, what)}">${renderInline(String(label), root, what)}</a>`);
    at = m.index + m[0].length;
  }
  parts.push(html`${text.slice(at)}`);
  return join(parts, "");
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
  return text.replace(INLINE, (_all, code: string | undefined, bold: string | undefined, label: string | undefined) => code ?? plainText(bold ?? String(label)));
}
