import type { SeriesRuns } from "../catalog.js";
import { count, hms, milestoneLabel, progress, progressLong, span } from "../format.js";
import { html, join, type Html } from "../html.js";
import { BADGES, LEAGUE } from "../milestones.js";
import { medals } from "../medals.js";
import { harness, help, modelHref, modelKind, runHref, type ModelGroup } from "./common.js";

const bestOf = (g: ModelGroup, assisted: boolean): SeriesRuns | undefined => g.series.find((s) => s.entry.assisted === assisted);

function best(label: string, s: SeriesRuns | undefined): Html {
  if (s === undefined) return html``;
  return html`<dt>${label}</dt><dd>${medals(s.entry.level)}<span class="sub">${progressLong(s.entry.level, s.entry.furthest)} in ${hms(s.entry.seconds)}</span></dd>`;
}

export function modelsIndex(groups: readonly ModelGroup[]): Html {
  const cards = groups.map((g) => html`<section class="card model">
  <h2><a href="${modelHref("", g.meta.slug)}">${g.meta.name}</a></h2>
  <p class="kind">${modelKind(g.meta)}</p>
  <dl class="kv">${best("BEST WITH HELP", bestOf(g, true))}${best("BEST WITHOUT HELP", bestOf(g, false))}</dl>
</section>`);
  return html`<div class="win intro"><p>Every model we have run through the harness, with its best run with and without extra help in the game. Each model's page lists all of its runs.</p></div>
<div class="cards">${cards}</div>`;
}

function summary(g: ModelGroup): string {
  const helped = bestOf(g, true);
  const plain = bestOf(g, false);
  if (helped !== undefined && plain !== undefined) return `${progress(helped.entry.level)} with help. ${progress(plain.entry.level)} without.`;
  return g.series.slice(0, 1).map((s) => `${progress(s.entry.level)} in ${hms(s.entry.seconds)}${s.entry.assisted ? ", with help" : ""}.`).join("");
}

function seriesLine(s: SeriesRuns): Html {
  const e = s.entry;
  const ids = join(s.all.map((r) => html`${r.short}`), " → ");
  return html`<p>${e.assisted ? "With help" : "Without help"}: ${progressLong(e.level, e.furthest)} in ${hms(e.seconds)}, run${s.all.length > 1 ? "s" : ""} ${ids}.</p>`;
}

function runRows(s: SeriesRuns): Html[] {
  return s.all.map((r) => {
    const id = r.release === undefined ? html`<span class="mono">${r.short}</span>` : html`<a class="mono" href="${runHref("../", r)}">${r.short}</a>`;
    const when = r.linked === undefined ? r.date : `${r.date} · linked run ${r.linked}`;
    return html`<tr><td>${id}<span class="sub">${when}</span></td><td>${help(s.entry)}</td><td data-l="STARTED FROM">${r.start}</td><td data-l="RESULT">${r.result}</td><td class="num" data-l="TURNS">${count(r.turns)}</td><td class="c-harn">${harness(r)}</td></tr>`;
  });
}

function delta(a: number | undefined, b: number | undefined): Html {
  if (a === undefined || b === undefined) return html`—`;
  if (a < b) return html`<span class="faster">▲ ${span(b - a)} faster</span>`;
  if (a > b) return html`<span class="slower">▼ ${span(a - b)} slower</span>`;
  return html`even`;
}

function splits(helped: SeriesRuns, plain: SeriesRuns): Html {
  const a = helped.entry.milestones;
  const b = plain.entry.milestones;
  const rows = [...BADGES, ...LEAGUE].filter((m) => a.has(m) || b.has(m)).map((m) => {
    const ta = a.get(m);
    const tb = b.get(m);
    return html`<tr><td>${milestoneLabel(m)}</td><td class="num">${ta === undefined ? "not reached" : hms(ta)}</td><td class="num">${tb === undefined ? "not reached" : hms(tb)}</td><td class="num">${delta(ta, tb)}</td></tr>`;
  });
  return html`<h2 class="sect">SPLITS: WITH HELP AGAINST WITHOUT</h2>
<div class="card"><div class="tbl"><table class="tight">
<thead><tr><th>MILESTONE</th><th class="num">WITH HELP</th><th class="num">WITHOUT HELP</th><th class="num">WITH HELP WAS</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="note">Time from the start of each model's best run with help and without, hours:minutes:seconds.</p></div>`;
}

export function modelPage(g: ModelGroup): Html {
  const m = g.meta;
  const head = `${m.name.toUpperCase()} · ${modelKind(m)} · REASONING EFFORT ${m.effort.toUpperCase()} · CONTEXT WINDOW ${count(m.context)} TOKENS`;
  const helped = bestOf(g, true);
  const plain = bestOf(g, false);
  return html`<section class="dialog hero">
  <p class="t-red">${head}</p>
  <h1 class="headline">${summary(g)}</h1>
  ${g.series.map(seriesLine)}
</section>
<h2 class="sect">RUNS</h2>
<div class="card"><div class="tbl"><table class="stackp">
<thead><tr><th>RUN ID</th><th>HELP</th><th>STARTED FROM</th><th>RESULT</th><th class="num">TURNS</th><th class="c-harn">HARNESS SETTINGS</th></tr></thead>
<tbody>${g.series.flatMap(runRows)}</tbody></table></div></div>
${helped !== undefined && plain !== undefined ? splits(helped, plain) : html``}`;
}
