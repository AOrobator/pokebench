import { InputError, type ChartData, type Points, type SiteData } from "./input.js";
import { levelOf, TOP_LEVEL, type Milestone } from "./milestones.js";

export interface Entry {
  readonly chartLabel: string;
  readonly model: string;
  readonly slug: string;
  readonly local: boolean;
  readonly assisted: boolean;
  readonly help?: string;
  readonly note?: string;
  readonly runs: readonly string[];
  readonly milestones: ReadonlyMap<Milestone, number>;
  readonly level: number;
  readonly furthest: Milestone;
  readonly seconds: number;
  readonly costUsd: number;
  readonly estimated: boolean;
}

export interface HumanEntry {
  readonly name: string;
  readonly note: string;
  readonly level: number;
  readonly seconds: number;
}

export interface Standings {
  readonly entries: readonly Entry[];
  readonly human: HumanEntry;
  readonly best: Entry;
  // Only when an assisted run leads: assisted runs are never pooled with or hidden behind unassisted ones.
  readonly bestUnhelped?: Entry;
  readonly cheapest?: Entry;
  readonly cheapestBadges: number;
}

function human(chart: ChartData, site: SiteData): HumanEntry {
  const splits = chart.human.splitsSeconds;
  for (let i = splits.length - 1; i >= 0; i--) {
    const s = splits[i];
    if (typeof s === "number") return { ...site.human, level: Math.min(i + 1, TOP_LEVEL), seconds: s };
  }
  throw new InputError("the human record has no split");
}

export function standings(chart: ChartData, points: Points, site: SiteData): Standings {
  const known = new Set(chart.series.map((s) => s.label));
  for (const m of site.series) if (!known.has(m.chartLabel)) throw new InputError(`site.json: "${m.chartLabel}" is not a chart series`);
  const entries = chart.series.map((c): Entry => {
    const meta = site.series.find((m) => m.chartLabel === c.label);
    if (meta === undefined) throw new InputError(`no site.json series entry for "${c.label}"`);
    const p = points.series.find((x) => x.label === c.label);
    if (p === undefined) throw new InputError(`no chart points for "${c.label}"`);
    return {
      ...meta,
      assisted: c.assisted,
      runs: p.runs,
      milestones: p.milestones,
      level: levelOf(p.milestones, p.furthest, p.furthestSeconds),
      furthest: p.furthest,
      seconds: p.furthestSeconds,
      costUsd: p.costUsd,
      estimated: c.estimated,
    };
  });
  entries.sort((a, b) => b.level - a.level || a.seconds - b.seconds);
  const best = entries[0];
  if (best === undefined) throw new InputError("the charts have no series");
  const unhelped = entries.filter((e) => !e.assisted);
  const bestUnhelped = best.assisted ? unhelped[0] : undefined;
  const cheapest = unhelped.filter((e) => e.level >= site.cheapestBadges).sort((a, b) => a.costUsd - b.costUsd)[0];
  return {
    entries,
    human: human(chart, site),
    best,
    ...(bestUnhelped === undefined ? {} : { bestUnhelped }),
    ...(cheapest === undefined ? {} : { cheapest }),
    cheapestBadges: site.cheapestBadges,
  };
}
