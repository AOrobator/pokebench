import { esc } from "./format.js";

// Presentation only: token text stays identical to the original JSON document.
export function jsonHtml(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  const tokens = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  let output = "";
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const start = match.index;
    const token = match[0];
    const kind = token.startsWith('"')
      ? /^\s*:/.test(text.slice(start + token.length)) ? "key" : "string"
      : /^(true|false|null)$/.test(token) ? "literal" : "number";
    output += esc(text.slice(offset, start)) + `<span class="json-${kind}">${esc(token)}</span>`;
    offset = start + token.length;
  }
  return `<pre class="syntax-json"><code>${output + esc(text.slice(offset))}</code></pre>`;
}

function inline(text: string): string {
  const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let output = "";
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    output += esc(text.slice(offset, match.index));
    const [whole, code, label, url, strong, emphasis] = match;
    if (code !== undefined) output += `<code>${esc(code)}</code>`;
    else if (label !== undefined && url !== undefined && /^https?:\/\//i.test(url))
      output += `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    else if (strong !== undefined) output += `<strong>${esc(strong)}</strong>`;
    else if (emphasis !== undefined) output += `<em>${esc(emphasis)}</em>`;
    else output += esc(whole);
    offset = match.index + whole.length;
  }
  return output + esc(text.slice(offset));
}

function codeBlock(text: string, language: string): string {
  if (language.toLowerCase() === "json") {
    try { return jsonHtml(JSON.parse(text) as unknown); } catch { /* Keep incomplete code readable. */ }
  }
  return `<pre class="code-block"><code>${esc(text)}</code></pre>`;
}

// Supported Markdown stays deliberately text-only: raw HTML is never enabled.
export function richText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (/^[{[]/.test(trimmed)) {
    try { const value: unknown = JSON.parse(trimmed); return dataHtml(value); } catch { /* Plain text, not valid JSON. */ }
  }
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length > 0) { blocks.push(`<p>${paragraph.map(inline).join("<br>")}</p>`); paragraph = []; }
    if (list !== null) {
      const tag = list.ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      list = null;
    }
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const fence = /^\s*```([^\s`]*)\s*$/.exec(line);
    if (fence !== null) {
      flush(); const code: string[] = [];
      while (++index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? "")) code.push(lines[index] ?? "");
      blocks.push(codeBlock(code.join("\n"), fence[1] ?? "")); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (line.trim() === "") flush();
    else if (heading !== null) {
      flush(); const level = Math.min(6, (heading[1]?.length ?? 1) + 2);
      blocks.push(`<h${String(level)}>${inline(heading[2] ?? "")}</h${String(level)}>`);
    } else if (item !== null) {
      const ordered = item[1] === undefined;
      if (paragraph.length > 0 || (list !== null && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] }; list.items.push(item[2] ?? "");
    } else if (quote !== null) {
      flush(); blocks.push(`<blockquote>${inline(quote[1] ?? "")}</blockquote>`);
    } else { if (list !== null) flush(); paragraph.push(line); }
  }
  flush(); return blocks.join("");
}

// Decode multiline/Markdown string leaves separately; JSON above remains valid.
function decodedFields(value: unknown): string {
  const queue: {value: unknown; path: string}[] = [{value, path: ""}];
  const sections: string[] = [];
  for (let index = 0; index < queue.length; index++) {
    const entry = queue[index];
    if (entry === undefined) continue;
    if (typeof entry.value === "string") {
      if (/\n|\*\*|```|^#\s/.test(entry.value))
        sections.push(`<section class="decoded-field"><h4>${esc(entry.path)}</h4>${richText(entry.value)}</section>`);
    } else if (entry.value !== null && typeof entry.value === "object") {
      for (const [key, child] of Object.entries(entry.value)) queue.push({value: child as unknown, path: entry.path === "" ? key : `${entry.path}.${key}`});
    }
  }
  return sections.join("");
}

export function dataHtml(value: unknown): string { return jsonHtml(value) + decodedFields(value); }
