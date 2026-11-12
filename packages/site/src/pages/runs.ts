import type { SeriesRuns } from "../catalog.js";
import { count, hms, progress, size, usd } from "../format.js";
import { html, type Html } from "../html.js";
import type { Release, RunInfo } from "../input.js";
import { TOP_LEVEL } from "../milestones.js";
import { help, inline, modelHref, runHref, traces, type ModelGroup } from "./common.js";

interface Listed {
  readonly run: RunInfo;
  readonly series: SeriesRuns;
  readonly group: ModelGroup;
}

export function listRuns(groups: readonly ModelGroup[]): Listed[] {
  return groups
    .flatMap((group) => group.series.flatMap((series) => series.all.map((run) => ({ run, series, group }))))
    .sort((a, b) => Date.parse(b.run.started) - Date.parse(a.run.started));
}

export function runsIndex(githubUrl: string, groups: readonly ModelGroup[]): Html {
  const rows = listRuns(groups).map(({ run, series, group }) => {
    const id = run.release === undefined ? html`<span class="mono">${run.short}</span>` : html`<a class="mono" href="${runHref("", run)}">${run.short}</a>`;
    return html`<tr><td>${id}</td><td data-l="MODEL"><a href="${modelHref("", group.meta.slug)}">${group.meta.name}</a></td><td data-l="DATE">${run.date}</td><td data-l="HELP">${help(series.entry)}</td><td data-l="RESULT">${run.result}</td><td class="num" data-l="TURNS">${count(run.turns)}</td><td data-l="TRACES">${traces(githubUrl, run)}</td></tr>`;
  });
  return html`<div class="win intro"><p>Every run on the leaderboard, newest first. A run with a linked id has a released record you can download and check.</p><p>Under TRACES, the thinking file has one line per turn with the model's reasoning, and the trace is the full record of every model call. The two GPT runs played through Codex also have a Codex transcript; GPT's reasoning is encrypted, so their thinking files hold no readable reasoning.</p></div>
<div class="card"><div class="tbl"><table class="stackp">
<thead><tr><th>RUN ID</th><th>MODEL</th><th>DATE</th><th>HELP</th><th>RESULT</th><th class="num">TURNS</th><th>TRACES</th></tr></thead>
<tbody>${rows}</tbody></table></div></div>`;
}

function headline(run: RunInfo, series: SeriesRuns): Html {
  const turns = html`<span class="t-blue">${count(run.turns)} TURNS</span>`;
  // The series totals describe this run only when it is the whole series.
  if (series.all.length > 1) return turns;
  const e = series.entry;
  return html`${turns}<span class="t-blue">${progress(e.level).toUpperCase()}</span><span class="t-blue">${hms(e.seconds)}</span><span class="t-blue">${e.estimated ? `ABOUT ${usd(e.costUsd)} AT API PRICES (ESTIMATE)` : `${usd(e.costUsd)} AT API PRICES`}</span>`;
}

function files(githubUrl: string, r: Release): Html {
  const rows = r.assets.map((a) => html`<tr><td><a class="mono" href="${`${githubUrl}/releases/download/${r.tag}/${a.name}`}">${a.name}</a></td><td class="num" data-l="SIZE">${size(a.bytes)}</td><td>${a.about}</td><td class="c-harn"><code>${a.openWith}</code></td></tr>`);
  return html`<div class="card"><div class="tbl"><table class="stackp">
<thead><tr><th>FILE</th><th class="num">SIZE</th><th>WHAT IT IS</th><th class="c-harn">OPEN WITH</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="note">${r.assetsNote}</p></div>`;
}

export function runPage(githubUrl: string, group: ModelGroup, series: SeriesRuns, run: RunInfo, r: Release): Html {
  const m = group.meta;
  const team = r.team.map((p, i) => html`<tr><td class="rank">${String(i + 1)}</td><td><b>${p.species}</b></td><td class="num" data-l="LEVEL">${String(p.level)}</td><td class="num c-harn">${p.hp}</td><td data-l="MOVES">${p.moves}</td><td class="c-harn">${p.item}</td><td data-l="CAUGHT">${p.caught}</td></tr>`);
  const facts = r.facts.map((f) => html`<dt>${f.label}</dt><dd>${inline(f.text)}</dd>`);
  const checks = r.check.map((c) => html`<div class="card"><h3>${c.title}</h3><ol class="steps">${c.steps.map((s) => html`<li>${inline(s)}</li>`)}</ol></div>`);
  const notes = r.notes.map((n) => html`<div class="card"><h3>${n.title}</h3><p>${inline(n.text)}</p></div>`);
  return html`<section class="dialog hero">
  <p class="t-red">${r.kicker}</p>
  <h1 class="headline">${r.title}</h1>
  <p>${r.startedText}</p>
  <p>${r.endedText}</p>
  <p class="facts">${headline(run, series)}</p>
</section>
<div class="btns"><a class="go" href="${`${githubUrl}/releases/tag/${r.tag}`}">DOWNLOAD THE RELEASE</a></div>
<div class="split even">
  <div class="card"><h3>RUN FACTS</h3>
    <dl class="kv"><dt>MODEL</dt><dd><a href="${modelHref("../", m.slug)}">${m.name}</a>, reasoning effort ${m.effort}, context window ${count(m.context)} tokens</dd>${facts}</dl></div>
  <div class="win"><p>One command checks the release: <code>${r.verify}</code>. It needs no model, GPU or network, and prints PASS or FAIL for each check.</p></div>
</div>
<h2 class="sect">${series.entry.level === TOP_LEVEL ? "HALL OF FAME TEAM" : "FINAL TEAM"}</h2>
<div class="card"><div class="tbl"><table class="stackp">
<thead><tr><th>#</th><th>POKéMON</th><th class="num">LEVEL</th><th class="num c-harn">HP</th><th>MOVES</th><th class="c-harn">HELD ITEM</th><th>CAUGHT</th></tr></thead>
<tbody>${team}</tbody></table></div>
<p class="note">${r.teamNote}</p></div>
<h2 class="sect">HOW TO CHECK IT</h2>
<div class="split even">${checks}</div>
${notes.length === 0 ? html`` : html`<div class="stack notes">${notes}</div>`}
<h2 class="sect">FILES</h2>
${files(githubUrl, r)}`;
}
