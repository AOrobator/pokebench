import { InputError } from "./input.js";
import { parseMarkdown, renderBlocks, type Block } from "./markdown.js";

export interface PostFile {
  readonly name: string;
  readonly text: string;
}

export interface Post {
  // The file name without ".md"; the page is updates/<name>.html.
  readonly name: string;
  readonly date: string;
  readonly title: string;
  readonly models: readonly string[];
  readonly blocks: readonly Block[];
  // The first paragraph's Markdown, for the index, Home and the feed.
  readonly first: string;
}

const FILE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const LINE = /^([a-z_]+):\s*(.*)$/;
const FIELDS: readonly string[] = ["date", "title", "models"];

export function realDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return day.getUTCFullYear() === y && day.getUTCMonth() === Number(mo) - 1 && day.getUTCDate() === d;
}

function frontMatter(file: PostFile): { readonly fields: ReadonlyMap<string, string>; readonly body: string } {
  const lines = file.text.split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) throw new InputError(`${file.name}: expected a front matter block between --- lines`);
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    const m = LINE.exec(line);
    if (m === null) throw new InputError(`${file.name}: front matter line "${line}" is not key: value`);
    const [, key, value] = m;
    const k = String(key);
    if (!FIELDS.includes(k)) throw new InputError(`${file.name}: unknown field "${k}"`);
    if (fields.has(k)) throw new InputError(`${file.name}: "${k}" is given twice`);
    fields.set(k, String(value).trim());
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
}

function models(value: string | undefined, file: string, known: ReadonlySet<string>): string[] {
  if (value === undefined) return [];
  const m = /^\[(.*)\]$/.exec(value);
  if (m === null) throw new InputError(`${file}: models: expected [slug, ...]`);
  const slugs = String(m[1]).split(",").map((s) => s.trim()).filter((s) => s !== "");
  for (const s of slugs) if (!known.has(s)) throw new InputError(`${file}: models: unknown model "${s}"`);
  return slugs;
}

function parsePost(file: PostFile, known: ReadonlySet<string>): Post {
  const named = FILE.exec(file.name);
  if (named === null) throw new InputError(`${file.name}: expected a file name like YYYY-MM-DD-slug.md`);
  const { fields, body } = frontMatter(file);
  const date = fields.get("date") ?? "";
  if (!realDate(date)) throw new InputError(`${file.name}: date "${date}" is not a real YYYY-MM-DD day`);
  if (named[1] !== date) throw new InputError(`${file.name}: the file name's date is not the post's date ${date}`);
  const title = fields.get("title") ?? "";
  if (title === "") throw new InputError(`${file.name}: missing title`);
  const blocks = parseMarkdown(body, file.name);
  renderBlocks(blocks, "", file.name);
  const first = blocks.find((b): b is Extract<Block, { kind: "p" }> => b.kind === "p");
  if (first === undefined) throw new InputError(`${file.name}: needs a first paragraph`);
  return { name: file.name.slice(0, -3), date, title, models: models(fields.get("models"), file.name, known), blocks, first: first.text };
}

// Newest first; posts of one date in file-name order.
export function parsePosts(files: readonly PostFile[], knownModels: ReadonlySet<string>): Post[] {
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.name)) throw new InputError(`${f.name}: the same post is given twice`);
    seen.add(f.name);
  }
  return files.map((f) => parsePost(f, knownModels)).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}
