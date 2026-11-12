import { isMilestone, type Milestone } from "./milestones.js";

export class InputError extends Error {}

export interface ChartSeries {
  readonly label: string;
  readonly runs: readonly string[];
  readonly assisted: boolean;
  readonly estimated: boolean;
}

export interface ChartData {
  readonly human: { readonly splitsSeconds: readonly (number | null)[] };
  readonly series: readonly ChartSeries[];
}

export interface PointSeries {
  readonly label: string;
  readonly runs: readonly string[];
  readonly milestones: ReadonlyMap<Milestone, number>;
  readonly furthest: Milestone;
  readonly furthestSeconds: number;
  readonly costUsd: number;
}

export interface Points {
  readonly pricesAsOf: string;
  readonly series: readonly PointSeries[];
}

export interface SeriesMeta {
  readonly chartLabel: string;
  readonly model: string;
  readonly slug: string;
  readonly local: boolean;
  readonly help?: string;
  readonly note?: string;
}

export interface ModelMeta {
  readonly slug: string;
  readonly name: string;
  readonly kind: "cloud" | "local";
  readonly effort: string;
  readonly context: number;
}

export interface SiteData {
  readonly githubUrl: string;
  // The published site's address, for the feed's absolute links.
  readonly baseUrl: string;
  readonly dataDate: string;
  readonly cheapestBadges: number;
  readonly human: { readonly name: string; readonly note: string };
  readonly series: readonly SeriesMeta[];
  readonly models: readonly ModelMeta[];
}

export interface ReleaseAsset {
  readonly name: string;
  readonly bytes: number;
  readonly about: string;
  readonly openWith: string;
}

export interface TeamMember {
  readonly species: string;
  readonly level: number;
  readonly hp: string;
  readonly moves: string;
  readonly item: string;
  readonly caught: string;
}

export interface Release {
  readonly tag: string;
  readonly kicker: string;
  readonly title: string;
  readonly startedText: string;
  readonly endedText: string;
  readonly facts: readonly { readonly label: string; readonly text: string }[];
  readonly verify: string;
  readonly team: readonly TeamMember[];
  readonly teamNote: string;
  readonly check: readonly { readonly title: string; readonly steps: readonly string[] }[];
  readonly notes: readonly { readonly title: string; readonly text: string }[];
  readonly assets: readonly ReleaseAsset[];
  readonly assetsNote: string;
}

export const TRACE_LABELS = ["thinking", "trace", "Codex transcript"] as const;
export type TraceLabel = (typeof TRACE_LABELS)[number];

export interface Traces {
  readonly tag: string;
  readonly files: readonly { readonly label: TraceLabel; readonly name: string }[];
}

export interface RunInfo {
  readonly id: string;
  // The last four characters of the id, as the viewer and the results name runs.
  readonly short: string;
  readonly started: string;
  // The calendar date in the run's own time zone.
  readonly date: string;
  readonly start: string;
  readonly result: string;
  readonly turns: number;
  readonly preset: string;
  readonly code: string;
  readonly linked?: string;
  readonly release?: Release;
  // Released per-run files (the model's thinking, the full trace) in a GitHub release.
  readonly traces?: Traces;
}

type Obj = Readonly<Record<string, unknown>>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new InputError(`${what}: expected an object`);
  return v as Obj;
}

function only(o: Obj, what: string, allowed: readonly string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new InputError(`${what}: unknown field "${k}"`);
}

function list(v: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(v)) throw new InputError(`${what}: expected a list`);
  return v as readonly unknown[];
}

function text(v: unknown, what: string): string {
  if (typeof v !== "string" || v.length === 0) throw new InputError(`${what}: expected non-empty text`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new InputError(`${what}: expected true or false`);
  return v;
}

function amount(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new InputError(`${what}: expected a number of at least 0`);
  return v;
}

function whole(v: unknown, what: string, min: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new InputError(`${what}: expected a whole number of at least ${String(min)}`);
  return v;
}

function matching(v: unknown, what: string, pattern: RegExp, expected: string): string {
  const t = text(v, what);
  if (!pattern.test(t)) throw new InputError(`${what}: expected ${expected}`);
  return t;
}

function optionalText(o: Obj, key: string, what: string): { readonly [k: string]: string } {
  return key in o ? { [key]: text(o[key], `${what}.${key}`) } : {};
}

export function parseChartData(v: unknown): ChartData {
  const doc = obj(v, "chart data");
  const human = obj(doc.human, "chart data human");
  const splitsSeconds = list(human.splits_seconds, "human.splits_seconds").map((s, i) => {
    if (s === null) return null;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 0) throw new InputError(`human.splits_seconds[${String(i)}]: expected whole seconds or null`);
    return s;
  });
  const series = list(doc.series, "series").map((raw, i) => {
    const what = `series[${String(i)}]`;
    const s = obj(raw, what);
    const cost = obj(s.cost, `${what}.cost`);
    return {
      label: text(s.label, `${what}.label`),
      runs: list(s.runs, `${what}.runs`).map((r, j) => text(r, `${what}.runs[${String(j)}]`)),
      assisted: bool(s.assisted, `${what}.assisted`),
      estimated: "estimated" in cost ? bool(cost.estimated, `${what}.cost.estimated`) : false,
    };
  });
  return { human: { splitsSeconds }, series };
}

export function parsePoints(v: unknown): Points {
  const doc = obj(v, "chart points");
  const series = list(doc.series, "points.series").map((raw, i) => {
    const what = `points.series[${String(i)}]`;
    const s = obj(raw, what);
    const milestones = new Map<Milestone, number>();
    for (const [name, t] of Object.entries(obj(s.milestones, `${what}.milestones`))) {
      if (!isMilestone(name)) throw new InputError(`${what}.milestones: unknown milestone "${name}"`);
      milestones.set(name, amount(t, `${what}.milestones.${name}`));
    }
    const furthest = text(s.furthest, `${what}.furthest`);
    if (!isMilestone(furthest)) throw new InputError(`${what}.furthest: unknown milestone "${furthest}"`);
    const furthestSeconds = milestones.get(furthest);
    if (furthestSeconds === undefined) throw new InputError(`${what}.furthest: "${furthest}" is not among its milestones`);
    return {
      label: text(s.label, `${what}.label`),
      runs: list(s.runs, `${what}.runs`).map((r, j) => text(r, `${what}.runs[${String(j)}]`)),
      milestones,
      furthest,
      furthestSeconds,
      costUsd: amount(s.cost_usd, `${what}.cost_usd`),
    };
  });
  return { pricesAsOf: text(doc.prices_as_of, "points.prices_as_of"), series };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Parsed by the URL standard and required to print back unchanged, so every link built from it is absolute and valid.
function validBaseUrl(value: string): boolean {
  // An empty ? or # parses as no query or fragment but still changes where joined links point.
  if (/[?#]/.test(value) || !URL.canParse(value)) return false;
  const u = new URL(value);
  return u.protocol === "https:" && u.hostname !== "" && u.username === "" && u.password === "" && u.search === "" && u.hash === "" && u.pathname.endsWith("/") && u.href === value;
}

export function parseSiteData(v: unknown): SiteData {
  const doc = obj(v, "site.json");
  only(doc, "site.json", ["github_url", "base_url", "data_date", "cheapest_badges", "human", "series", "models"]);
  const githubUrl = text(doc.github_url, "github_url");
  if (!githubUrl.startsWith("https://")) throw new InputError("github_url: expected an https URL");
  const cheapestBadges = doc.cheapest_badges;
  if (typeof cheapestBadges !== "number" || !Number.isInteger(cheapestBadges) || cheapestBadges < 1 || cheapestBadges > 8) {
    throw new InputError("cheapest_badges: expected a whole number from 1 to 8");
  }
  const human = obj(doc.human, "human");
  only(human, "human", ["name", "note"]);
  const series = list(doc.series, "series").map((raw, i) => {
    const what = `series[${String(i)}]`;
    const s = obj(raw, what);
    only(s, what, ["chart_label", "model", "slug", "local", "help", "note"]);
    const slug = text(s.slug, `${what}.slug`);
    if (!SLUG.test(slug)) throw new InputError(`${what}.slug: expected lowercase letters, digits and hyphens`);
    return {
      chartLabel: text(s.chart_label, `${what}.chart_label`),
      model: text(s.model, `${what}.model`),
      slug,
      local: bool(s.local, `${what}.local`),
      ...optionalText(s, "help", what),
      ...optionalText(s, "note", what),
    };
  });
  const models = list(doc.models, "models").map((raw, i): ModelMeta => {
    const what = `models[${String(i)}]`;
    const m = obj(raw, what);
    only(m, what, ["slug", "name", "kind", "effort", "context"]);
    const kind = m.kind;
    if (kind !== "cloud" && kind !== "local") throw new InputError(`${what}.kind: expected "cloud" or "local"`);
    return {
      slug: matching(m.slug, `${what}.slug`, SLUG, "lowercase letters, digits and hyphens"),
      name: text(m.name, `${what}.name`),
      kind,
      effort: text(m.effort, `${what}.effort`),
      context: whole(m.context, `${what}.context`, 1),
    };
  });
  const bySlug = new Map<string, ModelMeta>();
  for (const m of models) {
    if (bySlug.has(m.slug)) throw new InputError(`models: two entries for "${m.slug}"`);
    bySlug.set(m.slug, m);
  }
  series.forEach((s, i) => {
    const m = bySlug.get(s.slug);
    if (m === undefined) throw new InputError(`series[${String(i)}]: no models entry for "${s.slug}"`);
    if (m.name !== s.model) throw new InputError(`series[${String(i)}].model: "${s.model}" is not "${m.name}", the name of model "${s.slug}"`);
    if (s.local !== (m.kind === "local")) throw new InputError(`series[${String(i)}].local: model "${s.slug}" is ${m.kind}`);
  });
  for (const m of models) if (!series.some((s) => s.slug === m.slug)) throw new InputError(`models: no series uses "${m.slug}"`);
  const baseUrl = text(doc.base_url, "base_url");
  if (!validBaseUrl(baseUrl)) throw new InputError("base_url: expected an https URL with a host and a path ending in /, and no user, query or fragment");
  return {
    githubUrl,
    baseUrl,
    dataDate: text(doc.data_date, "data_date"),
    cheapestBadges,
    human: { name: text(human.name, "human.name"), note: text(human.note, "human.note") },
    series,
    models,
  };
}

const STARTED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?[+-](\d{2}):(\d{2})$/;

// The shape alone allows 2026-99-99T99:99; also require a real calendar date, a real time and an offset
// within ±14:00, so sorting by Date.parse always has a number.
function realStart(value: string): boolean {
  const m = STARTED.exec(value);
  if (m === null) return false;
  // The seconds group is optional, so a group can be undefined at run time despite its type.
  const [y, mo, d, h, mi, sec, oh, om] = (m.slice(1) as (string | undefined)[]).map((x) => Number(x ?? "0"));
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const dateOk = day.getUTCFullYear() === y && day.getUTCMonth() === Number(mo) - 1 && day.getUTCDate() === d;
  const timeOk = Number(h) < 24 && Number(mi) < 60 && Number(sec) < 60;
  const offsetOk = Number(oh) * 60 + Number(om) <= 14 * 60 && Number(om) < 60;
  return dateOk && timeOk && offsetOk && Number.isFinite(Date.parse(value));
}
const COMMIT = /^[0-9a-f]{9}$/;
const LINKED = /^[1-9]\d* of [1-9]\d*$/;
// Release tags and asset names go into download URLs, so they stay plain names.
const URL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function texts(v: unknown, what: string): readonly string[] {
  return list(v, what).map((x, i) => text(x, `${what}[${String(i)}]`));
}

function parseRelease(v: unknown, what: string): Release {
  const r = obj(v, what);
  only(r, what, ["tag", "kicker", "title", "started_text", "ended_text", "facts", "verify", "team", "team_note", "check", "notes", "assets", "assets_note"]);
  const facts = list(r.facts, `${what}.facts`).map((raw, i) => {
    const w = `${what}.facts[${String(i)}]`;
    const f = obj(raw, w);
    only(f, w, ["label", "text"]);
    return { label: text(f.label, `${w}.label`), text: text(f.text, `${w}.text`) };
  });
  const team = list(r.team, `${what}.team`).map((raw, i): TeamMember => {
    const w = `${what}.team[${String(i)}]`;
    const t = obj(raw, w);
    only(t, w, ["species", "level", "hp", "moves", "item", "caught"]);
    return {
      species: text(t.species, `${w}.species`),
      level: whole(t.level, `${w}.level`, 1),
      hp: text(t.hp, `${w}.hp`),
      moves: text(t.moves, `${w}.moves`),
      item: text(t.item, `${w}.item`),
      caught: text(t.caught, `${w}.caught`),
    };
  });
  const assets = list(r.assets, `${what}.assets`).map((raw, i): ReleaseAsset => {
    const w = `${what}.assets[${String(i)}]`;
    const a = obj(raw, w);
    only(a, w, ["name", "bytes", "about", "open_with"]);
    return {
      name: matching(a.name, `${w}.name`, URL_NAME, "a plain file name"),
      bytes: whole(a.bytes, `${w}.bytes`, 0),
      about: text(a.about, `${w}.about`),
      openWith: text(a.open_with, `${w}.open_with`),
    };
  });
  return {
    tag: matching(r.tag, `${what}.tag`, URL_NAME, "a plain tag name"),
    kicker: text(r.kicker, `${what}.kicker`),
    title: text(r.title, `${what}.title`),
    startedText: text(r.started_text, `${what}.started_text`),
    endedText: text(r.ended_text, `${what}.ended_text`),
    facts,
    verify: text(r.verify, `${what}.verify`),
    team,
    teamNote: text(r.team_note, `${what}.team_note`),
    check: list(r.check, `${what}.check`).map((raw, i) => {
      const w = `${what}.check[${String(i)}]`;
      const c = obj(raw, w);
      only(c, w, ["title", "steps"]);
      return { title: text(c.title, `${w}.title`), steps: texts(c.steps, `${w}.steps`) };
    }),
    notes: list(r.notes, `${what}.notes`).map((raw, i) => {
      const w = `${what}.notes[${String(i)}]`;
      const n = obj(raw, w);
      only(n, w, ["title", "text"]);
      return { title: text(n.title, `${w}.title`), text: text(n.text, `${w}.text`) };
    }),
    assets,
    assetsNote: text(r.assets_note, `${what}.assets_note`),
  };
}

function isTraceLabel(v: unknown): v is TraceLabel {
  return (TRACE_LABELS as readonly unknown[]).includes(v);
}

function parseTraces(v: unknown, what: string): Traces {
  const t = obj(v, what);
  only(t, what, ["tag", "files"]);
  const files = list(t.files, `${what}.files`).map((raw, i) => {
    const w = `${what}.files[${String(i)}]`;
    const f = obj(raw, w);
    only(f, w, ["label", "name"]);
    if (!isTraceLabel(f.label)) throw new InputError(`${w}.label: expected one of ${TRACE_LABELS.join(", ")}`);
    return { label: f.label, name: matching(f.name, `${w}.name`, URL_NAME, "a plain file name") };
  });
  return { tag: matching(t.tag, `${what}.tag`, URL_NAME, "a plain tag name"), files };
}

export function parseRuns(v: unknown): readonly RunInfo[] {
  const doc = obj(v, "runs.json");
  only(doc, "runs.json", ["runs"]);
  const seen = new Set<string>();
  return list(doc.runs, "runs").map((raw, i): RunInfo => {
    const what = `runs[${String(i)}]`;
    const r = obj(raw, what);
    only(r, what, ["id", "started", "start", "result", "turns", "preset", "code", "linked", "release", "traces"]);
    const id = text(r.id, `${what}.id`);
    if (id.length < 5) throw new InputError(`${what}.id: expected an id longer than its four-character short id`);
    const short = id.slice(-4);
    if (!/^[a-z0-9]{4}$/.test(short)) throw new InputError(`${what}.id: its last four characters "${short}" must be lowercase letters and digits`);
    if (seen.has(short)) throw new InputError(`${what}.id: short id "${short}" is used twice`);
    seen.add(short);
    const started = text(r.started, `${what}.started`);
    if (!realStart(started)) throw new InputError(`${what}.started: expected a real ISO date and time with a UTC offset`);
    return {
      id,
      short,
      started,
      date: started.slice(0, 10),
      start: text(r.start, `${what}.start`),
      result: text(r.result, `${what}.result`),
      turns: whole(r.turns, `${what}.turns`, 1),
      preset: text(r.preset, `${what}.preset`),
      code: matching(r.code, `${what}.code`, COMMIT, "a 9-character commit"),
      ...("linked" in r ? { linked: matching(r.linked, `${what}.linked`, LINKED, '"n of m"') } : {}),
      ...("release" in r ? { release: parseRelease(r.release, `${what}.release`) } : {}),
      ...("traces" in r ? { traces: parseTraces(r.traces, `${what}.traces`) } : {}),
    };
  });
}
