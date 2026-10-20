// The run-analysis reports (runs/reports/run-analysis/<YYYY-MM-DD_slug>/index.html) the viewer lists and serves.
// Each report may carry a report.json written by the run-analysis skill; without one (or with one that does not
// validate) the list falls back to the page's own <title> and the folder's date.
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";

export interface ReportEntry {
  readonly slug: string;
  readonly date: string;
  readonly title: string;
  // What kind of analysis it is, shown as a type badge: FRONTIER, COOK, EXPERIMENT, AUDIT, CENSUS or REPORT.
  readonly kind: string;
  readonly verdict: string | null;
  // The furthest story milestone the report names (a frontier milestone id), for its STORY bar.
  readonly frontier: string | null;
  readonly facts: readonly (readonly [string, string])[];
  readonly trainer: string | null;
}

const SLUG = /^(\d{4}-\d{2}-\d{2})_[a-z0-9][a-z0-9-]*$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};
const TITLE_BYTES = 16 * 1024;

const reportsDir = (runsRoot: string): string => join(runsRoot, "reports", "run-analysis");
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;

function head(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(TITLE_BYTES), n = readSync(fd, buffer, 0, TITLE_BYTES, 0);
    return buffer.subarray(0, n).toString("utf8");
  } finally { closeSync(fd); }
}

function pageTitle(path: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head(path));
  const title = match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return title === "" ? null : title;
}

interface Meta { title?: string; kind?: string; verdict?: string; frontier?: string; facts?: [string, string][]; trainer?: string }
function meta(dir: string): Meta {
  const path = join(dir, "report.json");
  if (!existsSync(path)) return {};
  let v: unknown;
  try { v = JSON.parse(readFileSync(path, "utf8")); } catch { return {}; }
  if (!record(v) || v.version !== 1) return {};
  const { title, kind, verdict, frontier, facts, trainer } = v;
  if ((title !== undefined && !text(title, 200)) || (kind !== undefined && !(typeof kind === "string" && /^[A-Z]{2,16}$/.test(kind)))
    || (verdict !== undefined && !text(verdict, 600)) || (frontier !== undefined && !(typeof frontier === "string" && /^[A-Z0-9_]{2,64}$/.test(frontier)))
    || (trainer !== undefined && !(typeof trainer === "string" && /^[a-z]{2,16}$/.test(trainer)))
    || (facts !== undefined && !(Array.isArray(facts) && facts.length <= 6 && facts.every(f => Array.isArray(f) && f.length === 2 && text(f[0], 60) && text(f[1], 120))))) return {};
  return v;
}

export function listReports(runsRoot: string): ReportEntry[] {
  const dir = reportsDir(runsRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(slug => SLUG.test(slug) && existsSync(join(dir, slug, "index.html"))).sort().reverse().map((slug): ReportEntry => {
    const m = meta(join(dir, slug));
    return { slug, date: SLUG.exec(slug)?.[1] ?? "", title: m.title ?? pageTitle(join(dir, slug, "index.html")) ?? slug, kind: m.kind ?? "REPORT",
      verdict: m.verdict ?? null, frontier: m.frontier ?? null, facts: m.facts ?? [], trainer: m.trainer ?? null };
  });
}

// A file of one report, or null: only plain path segments with a served extension, and never a path whose real
// location (after symlinks) leaves the report's folder. An empty path is the report's index page.
export function reportFile(runsRoot: string, slug: string, parts: readonly string[]): { path: string; type: string } | null {
  if (!SLUG.test(slug)) return null;
  const wanted = parts.length === 0 ? ["index.html"] : parts;
  if (!wanted.every(p => SEGMENT.test(p))) return null;
  const type = TYPES[extname(wanted[wanted.length - 1] ?? "").toLowerCase()];
  if (type === undefined) return null;
  const folder = join(reportsDir(runsRoot), slug), path = join(folder, ...wanted);
  try {
    const real = realpathSync(path), base = realpathSync(folder);
    if (!real.startsWith(base + sep) || !statSync(real).isFile()) return null;
  } catch { return null; }
  return { path, type };
}
