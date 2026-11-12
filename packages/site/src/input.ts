import { isMilestone, type Milestone } from "./milestones.js";

export class InputError extends Error {}

export interface ChartSeries {
  readonly label: string;
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

export interface SiteData {
  readonly githubUrl: string;
  readonly dataDate: string;
  readonly cheapestBadges: number;
  readonly human: { readonly name: string; readonly note: string };
  readonly series: readonly SeriesMeta[];
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

export function parseSiteData(v: unknown): SiteData {
  const doc = obj(v, "site.json");
  only(doc, "site.json", ["github_url", "data_date", "cheapest_badges", "human", "series"]);
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
  return {
    githubUrl,
    dataDate: text(doc.data_date, "data_date"),
    cheapestBadges,
    human: { name: text(human.name, "human.name"), note: text(human.note, "human.note") },
    series,
  };
}
