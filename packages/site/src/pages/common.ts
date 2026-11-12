import type { Catalog, SeriesRuns } from "../catalog.js";
import { usd } from "../format.js";
import { html, join, type Html } from "../html.js";
import type { ModelMeta, RunInfo } from "../input.js";
import type { Entry, Standings } from "../standings.js";

// One model with its chart series (best first).
export interface ModelGroup {
  readonly meta: ModelMeta;
  readonly series: readonly SeriesRuns[];
}

// Everything a page may show, already validated and joined.
export interface SiteView {
  readonly st: Standings;
  readonly cat: Catalog;
  // Ordered by each model's best series.
  readonly groups: readonly ModelGroup[];
  readonly githubUrl: string;
}

export function groupModels(models: readonly ModelMeta[], series: readonly SeriesRuns[]): ModelGroup[] {
  const rank = (m: ModelMeta): number => series.findIndex((s) => s.entry.slug === m.slug);
  return [...models].sort((a, b) => rank(a) - rank(b)).map((meta) => ({ meta, series: series.filter((s) => s.entry.slug === meta.slug) }));
}

export function modelKind(m: ModelMeta): string {
  return m.kind === "local" ? "OUR GPUS (local)" : "CLOUD MODEL";
}

// "(assisted)", "(local)" or "(local, assisted)"; empty for a cloud run without help.
export function where(e: Entry): string {
  const tags = [...(e.local ? ["local"] : []), ...(e.assisted ? ["assisted"] : [])];
  return tags.length === 0 ? "" : `(${tags.join(", ")})`;
}

export function modelHref(root: string, slug: string): string {
  return `${root}models/${slug}.html`;
}

export function runHref(root: string, run: RunInfo): string {
  return `${root}runs/${run.short}.html`;
}

// A short run id, linked to its page only when the run was released.
export function runId(root: string, run: RunInfo): Html {
  return run.release === undefined ? html`<span class="mono">${run.short}</span>` : html`<a href="${runHref(root, run)}" class="mono">${run.short}</a>`;
}

export function runIds(root: string, runs: readonly RunInfo[]): Html {
  return join(runs.map((r) => runId(root, r)), " → ");
}

export function harness(run: RunInfo): Html {
  return html`<span class="mono">${run.preset}</span><span class="sub mono">code ${run.code}</span>`;
}

export function cost(e: Entry): Html {
  return e.estimated ? html`about ${usd(e.costUsd)}<span class="sub">estimate</span>` : html`${usd(e.costUsd)}`;
}

export function help(e: Entry): Html {
  if (!e.assisted) return html`None`;
  return e.help === undefined ? html`Assisted` : html`Assisted<span class="sub">${e.help}</span>`;
}

export function chart(root: string, name: string, alt: string, width: number, height: number, caption: string): Html {
  return html`<figure class="chart wide">
  <picture><source media="(prefers-color-scheme: dark)" srcset="${root}img/${name}-dark.png"><img src="${root}img/${name}.png" alt="${alt}" width="${String(width)}" height="${String(height)}" loading="lazy"></picture>
  <figcaption>${caption}</figcaption>
</figure>`;
}

// Data text may mark code with backticks: `just setup`. Everything is escaped; only the code spans become markup.
export function inline(text: string): Html {
  return join(text.split("`").map((part, i) => (i % 2 === 1 ? html`<code>${part}</code>` : html`${part}`)), "");
}
