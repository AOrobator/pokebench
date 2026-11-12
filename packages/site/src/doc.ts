// The Markdown the explainers use: # to ### headings, paragraphs, - and 1. lists with indented
// continuation lines, > quotes, | tables, ``` fences, figures on their own line, and <details> blocks
// with a <summary> line. Inline text goes through inlineHtml in explainer mode, so any other raw HTML fails.
import { html, join, type Html } from "./html.js";
import { InputError } from "./input.js";
import { inlineHtml, type InlineOptions } from "./markdown.js";

export type DocBlock =
  | { readonly kind: "h"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "pre"; readonly text: string }
  | { readonly kind: "quote"; readonly paras: readonly string[] }
  | { readonly kind: "ul"; readonly items: readonly string[] }
  | { readonly kind: "ol"; readonly start: number; readonly items: readonly string[] }
  | { readonly kind: "table"; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: "fig"; readonly alt: string; readonly src: string }
  | { readonly kind: "details"; readonly summary: string; readonly blocks: readonly DocBlock[] };

const FENCE = /^```/;
const HEADING = /^(#+) (.*)$/;
const BULLET = /^[-*] (.*)$/;
const NUMBERED = /^(\d+)\. (.*)$/;
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const SUMMARY = /^<summary>(.*)<\/summary>$/;
const SEPARATOR = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || line.startsWith("|") || line.startsWith(">") || BULLET.test(line) || NUMBERED.test(line)
    || line === "<details>" || line === "</details>" || SUMMARY.test(line);
}

// Splits a table row on pipes that are not escaped; an escaped pipe becomes a plain one.
function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replaceAll("\\|", "|"));
}

interface Frame {
  readonly blocks: DocBlock[];
  summary?: string;
}

export function parseDoc(text: string, what: string): DocBlock[] {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const root: Frame = { blocks: [] };
  const stack: Frame[] = [root];
  const top = (): Frame => stack[stack.length - 1] ?? root;
  let i = 0;
  const take = (test: (l: string) => boolean): string[] => {
    const out: string[] = [];
    while (i < lines.length && test(lines[i] ?? "")) out.push(lines[i++] ?? "");
    return out;
  };
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const push = (b: DocBlock): void => {
      top().blocks.push(b);
    };
    if (FENCE.test(line)) {
      const close = lines.findIndex((l, j) => j > i && FENCE.test(l));
      if (close < 0) throw new InputError(`${what}: a code fence is never closed`);
      push({ kind: "pre", text: lines.slice(i + 1, close).join("\n") });
      i = close + 1;
      continue;
    }
    if (line === "<details>") {
      stack.push({ blocks: [] });
      i++;
      continue;
    }
    const summary = SUMMARY.exec(line);
    if (summary !== null && stack.length > 1 && top().summary === undefined && top().blocks.length === 0) {
      top().summary = String(summary[1]);
      i++;
      continue;
    }
    if (line === "</details>") {
      const frame = stack.pop();
      if (frame === undefined || stack.length === 0) throw new InputError(`${what}: </details> without <details>`);
      if (frame.summary === undefined) throw new InputError(`${what}: <details> needs a <summary> line first`);
      push({ kind: "details", summary: frame.summary, blocks: frame.blocks });
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = String(heading[1]).length;
      if (level > 3) throw new InputError(`${what}: headings deeper than ### are not supported ("${line}")`);
      push({ kind: "h", level: level as 1 | 2 | 3, text: String(heading[2]).trim() });
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows = take((l) => l.startsWith("|"));
      const [head, sep, ...body] = rows;
      if (head === undefined || sep === undefined || !SEPARATOR.test(sep)) throw new InputError(`${what}: a table needs a header row and a --- separator row`);
      push({ kind: "table", head: cells(head), rows: body.map(cells) });
      continue;
    }
    if (line.startsWith(">")) {
      const paras: string[][] = [[]];
      for (const l of take((x) => x.startsWith(">"))) {
        const t = l.replace(/^> ?/, "");
        if (t.trim() === "") paras.push([]);
        else paras[paras.length - 1]?.push(t);
      }
      push({ kind: "quote", paras: paras.filter((p) => p.length > 0).map((p) => p.join(" ")) });
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (BULLET.test(line) || numbered !== null) {
      const marker = numbered === null ? BULLET : NUMBERED;
      const items: string[] = [];
      for (const l of take((x) => marker.test(x) || /^\s+\S/.test(x))) {
        const m = marker.exec(l);
        if (m === null) items[items.length - 1] = `${items[items.length - 1] ?? ""} ${l.trim()}`.trim();
        else items.push(String(m[m.length - 1]));
      }
      push(numbered === null ? { kind: "ul", items } : { kind: "ol", start: Number(numbered[1]), items });
      continue;
    }
    const figure = FIGURE.exec(line);
    if (figure !== null) {
      push({ kind: "fig", alt: String(figure[1]), src: String(figure[2]) });
      i++;
      continue;
    }
    const para = [line, ...(i++, take((l) => l.trim() !== "" && !startsBlock(l)))];
    push({ kind: "p", text: para.map((l) => l.trim()).join(" ") });
  }
  if (stack.length > 1) throw new InputError(`${what}: <details> is never closed`);
  return root.blocks;
}

export function renderDoc(blocks: readonly DocBlock[], o: InlineOptions): Html {
  const inline = (t: string): Html => inlineHtml(t, o);
  return join(blocks.map((b): Html => {
    switch (b.kind) {
      case "h":
        return b.level === 1 ? html`<h1>${inline(b.text)}</h1>` : b.level === 2 ? html`<h2>${inline(b.text)}</h2>` : html`<h3>${inline(b.text)}</h3>`;
      case "p":
        return html`<p>${inline(b.text)}</p>`;
      case "pre":
        return html`<pre><code>${b.text}</code></pre>`;
      case "quote":
        return html`<blockquote>${b.paras.map((p) => html`<p>${inline(p)}</p>`)}</blockquote>`;
      case "ul":
        return html`<ul>${b.items.map((t) => html`<li>${inline(t)}</li>`)}</ul>`;
      case "ol":
        return html`<ol start="${String(b.start)}">${b.items.map((t) => html`<li>${inline(t)}</li>`)}</ol>`;
      case "table":
        return html`<div class="tbl"><table><thead><tr>${b.head.map((c) => html`<th>${inline(c)}</th>`)}</tr></thead><tbody>${b.rows.map((r) => html`<tr>${r.map((c) => html`<td>${inline(c)}</td>`)}</tr>`)}</tbody></table></div>`;
      case "fig":
        return html`<figure class="fig">${inline(`![${b.alt}](${b.src})`)}</figure>`;
      case "details":
        return html`<details><summary>${inline(b.summary)}</summary>\n${renderDoc(b.blocks, o)}</details>`;
    }
  }), "\n");
}
