import { hms, progressLong } from "../format.js";
import { html, type Html } from "../html.js";
import { medals } from "../medals.js";
import type { SeriesRuns } from "../catalog.js";
import { chart, cost, harness, modelHref, runIds, where, type SiteView } from "./common.js";

function humanRow(v: SiteView): Html {
  const h = v.st.human;
  return html`<tr class="ref"><td class="rank c-rank">—</td><td class="c-model">${h.name} <span class="pill ref">HUMAN WORLD RECORD</span><span class="sub">${h.note}</span></td><td class="c-far">${medals(h.level)}<span class="sub">${progressLong(h.level)}</span></td><td class="num c-time">${hms(h.seconds)}</td><td class="num c-cost">—</td><td class="c-harn">—</td><td class="c-run">video</td></tr>`;
}

function row(githubUrl: string, runs: SeriesRuns, rank: number): Html {
  const e = runs.entry;
  const tag = where(e);
  const label = tag === "" ? html`` : html` <span class="where">${tag}</span>`;
  const subText = e.help ?? e.note;
  const sub = subText === undefined ? html`` : html`<span class="sub">${subText}</span>`;
  const cls = e.assisted ? html` class="assisted"` : html``;
  return html`<tr${cls}><td class="rank c-rank">${String(rank)}</td><td class="c-model"><a href="${modelHref("", e.slug)}">${e.model}</a>${label}${sub}</td><td class="c-far">${medals(e.level)}<span class="sub">${progressLong(e.level, e.furthest)}</span></td><td class="num c-time">${hms(e.seconds)}</td><td class="num c-cost">${cost(e)}</td><td class="c-harn">${harness(githubUrl, runs.first)}</td><td class="c-run"><span class="lab">RUN ID </span>${runIds("", runs.all)}</td></tr>`;
}

export function results(v: SiteView): Html {
  const rows = [...v.cat.bySeries.values()].map((r, i) => row(v.githubUrl, r, i + 1));
  return html`<div class="win intro"><p>Each model's best run: how far it got, how long that took from the start of the run (hours:minutes:seconds), and what its tokens would have cost at the providers' list prices up to that point. Every run is ranked in one list; runs that had extra help in the game are marked (assisted), with what help they had.</p></div>
${chart("", "badges-over-time", "Badges over time: each model's best run, gym badges then the Elite Four and Champion, by hours from the start of the run, against the human world record", 2676, 2214, "Badges over time: when each best run earned each gym badge and beat each Elite Four member, against the human world record. Dotted lines and hollow points are assisted runs.")}
<section class="card">
  <div class="tbl"><table class="lb"><thead><tr><th>#</th><th>MODEL</th><th>FURTHEST PROGRESS</th><th class="num">TIME TO IT</th><th class="num">COST AT API PRICES</th><th class="c-harn">HARNESS SETTINGS</th><th>RUN</th></tr></thead><tbody>${humanRow(v)}${rows}</tbody></table></div>
  <p class="note">Ranked by furthest progress, then time. Runs marked (assisted) had extra help in the game; what helped is under the model's name. Models with both kinds of run appear twice; only the assisted row is marked. Models marked (local) ran on our own GPUs; a cost marked estimate is priced at the cheapest provider that sells that model. Linked runs each started from the previous one's save.</p>
</section>
${chart("", "badges-for-the-money", "How far each best run got against its cost at API prices", 2676, 1934, "Badges for the money: how far each best run got against what its tokens would have cost up to that point.")}`;
}
