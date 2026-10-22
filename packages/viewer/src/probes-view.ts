// The probes page (design N, runs/mockups/probes-viewer/n.html): the big lane header, party-style case slots with
// ON/OFF pills and a gap bar, the selected case as a battle scene with one square per sample, the gap bar under the
// squares, the sample reader, and the folded "Is the difference real?" plot with its reading guide. Pure HTML strings.
import { gap, grade, laneTail, nyTime, parseKey, pOf, pText, tally, verdict, type Call, type Gap, type Grade, type Tally } from "./probe-stats.js";
import type { LaneState, ProbeCase, ProbeDetail, ProbeLane, ProbeSample, ProbeSummary } from "./probes.js";

export interface ViewState {
  readonly probe: string;
  readonly group: string;
  readonly caseId: string;
  readonly sample: string | null;
  readonly blind: boolean;
  readonly plot: boolean;
}
export interface ModelGroup { readonly key: string; readonly lanes: readonly string[] }

const STATES: readonly LaneState[] = ["running", "complete", "stopped", "unknown"];
const GRADES: readonly { id: Grade; name: string; short: string }[] = [
  { id: "dif", name: "Departs from the recorded call", short: "DEPARTS" },
  { id: "rep", name: "Repeats the recorded call", short: "REPEATS" },
  { id: "err", name: "Error or text only", short: "ERROR" },
  { id: "unk", name: "Ungraded: recorded call unknown", short: "UNGRADED" },
];

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const numOrNull = (v: unknown): v is number | null => v === null || (typeof v === "number" && v >= 0);
const esc = (v: string): string => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function laneOk(v: unknown): boolean {
  return record(v) && isStr(v.id) && STATES.includes(v.state as LaneState) && isInt(v.completed) && isInt(v.planned);
}
export function parseProbeList(v: unknown): ProbeSummary[] {
  if (!Array.isArray(v) || !v.every((p) => record(p) && isStr(p.id) && isStr(p.title) && isStr(p.feature) && strOrNull(p.started) && typeof p.live === "boolean" && Array.isArray(p.lanes) && p.lanes.every(laneOk)))
    throw new Error("probe list from the server has an unexpected shape");
  return v as ProbeSummary[];
}
function caseOk(c: unknown): boolean {
  return record(c) && isStr(c.id) && isStr(c.run) && isInt(c.turn) && (c.split === "development" || c.split === "heldout") && isStr(c.title) && strOrNull(c.at) && strOrNull(c.frame)
    && (c.sourceKind === undefined || (c.sourceKind === "synthetic" && c.at === null && c.frame === null && c.recorded === null))
    && (c.recorded === null || (record(c.recorded) && isStr(c.recorded.tool) && record(c.recorded.args)));
}
function sampleOk(s: unknown): boolean {
  return record(s) && isStr(s.lane) && isStr(s.case) && isStr(s.arm) && isInt(s.sample) && isStr(s.at) && isInt(s.elapsedMs) && isStr(s.key) && isStr(s.thinking);
}
export function parseProbe(v: unknown): ProbeDetail {
  if (!record(v) || !isStr(v.id) || !isStr(v.title) || !isStr(v.feature) || !strOrNull(v.tier) || !Array.isArray(v.arms) || !v.arms.every(isStr)
    || !Array.isArray(v.cases) || !v.cases.every(caseOk) || !Array.isArray(v.samples) || !v.samples.every(sampleOk) || !Array.isArray(v.problems) || !v.problems.every(isStr)
    || !Array.isArray(v.lanes) || !v.lanes.every((l) => laneOk(l) && record(l) && strOrNull(l.model) && strOrNull(l.started) && strOrNull(l.ended) && strOrNull(l.current) && numOrNull(l.ceilingMs)))
    throw new Error("probe from the server has an unexpected shape");
  return v as unknown as ProbeDetail;
}

export function parseHash(hash: string): { probe: string | null; caseId: string | null } {
  let text: string;
  try { text = decodeURIComponent(hash.replace(/^#/, "")); } catch { return { probe: null, caseId: null }; }
  if (text === "") return { probe: null, caseId: null };
  const slash = text.indexOf("/");
  return slash < 0 ? { probe: text, caseId: null } : { probe: text.slice(0, slash), caseId: text.slice(slash + 1) || null };
}
export const hashOf = (probe: string, caseId: string): string => `#${encodeURIComponent(probe)}/${encodeURIComponent(caseId)}`;

// Lanes that run the same model share a group; a group is the only unit the page ever tallies (INV-1).
export function modelGroups(p: ProbeDetail): ModelGroup[] {
  const groups = new Map<string, string[]>();
  for (const lane of p.lanes) {
    // The full model id is the key: two models whose names end alike stay apart (INV-1).
    const key = lane.model === null ? `lane:${lane.id}` : `model:${lane.model}`;
    groups.set(key, [...(groups.get(key) ?? []), lane.id]);
  }
  return [...groups].map(([key, lanes]) => ({ key, lanes }));
}
// The label a model id shows: its last path part without a .gguf suffix.
export const modelLabel = (id: string | null): string => (id === null ? "unknown model" : (id.split("/").pop() ?? id).replace(/\.gguf$/i, ""));
const groupLabel = (key: string): string => (key.startsWith("model:") ? modelLabel(key.slice("model:".length)) : "unknown model");

// The group to keep after a refresh: the same key, or else the group now holding the old group's first lane.
export function keepGroup(before: ProbeDetail, after: ProbeDetail, group: string): string {
  const groups = modelGroups(after);
  if (groups.some((g) => g.key === group)) return group;
  const lane = modelGroups(before).find((g) => g.key === group)?.lanes[0];
  return groups.find((g) => lane !== undefined && g.lanes.includes(lane))?.key ?? defaultGroup(after);
}

export function defaultGroup(p: ProbeDetail): string {
  const groups = modelGroups(p);
  const size = (g: ModelGroup): number => p.samples.filter((s) => g.lanes.includes(s.lane)).length;
  return groups.reduce<ModelGroup | null>((best, g) => (best === null || size(g) > size(best) ? g : best), null)?.key ?? "";
}

export const sampleId = (s: ProbeSample): string => `${s.lane}/${s.case}/${s.arm}/${String(s.sample)}`;
const shortCase = (id: string): string => (/^case-0*\d+$/.test(id) ? `C${id.replace(/^case-0*/, "")}` : id.toUpperCase());
const pct = (t: Tally): number => (t.n === 0 ? 0 : Math.round((100 * t.dif) / t.n));
const median = (xs: readonly number[]): number => { const v = [...xs].sort((a, b) => a - b); return v.length === 0 ? 0 : v[Math.floor(v.length / 2)] ?? 0; };

interface Ctx {
  readonly p: ProbeDetail;
  readonly st: ViewState;
  readonly lanes: readonly string[];
  readonly on: string;
  readonly off: string;
  name(arm: string): string;
  samples(caseId: string, arm: string): ProbeSample[];
  t(caseId: string | null, arm: string, split?: "development" | "heldout"): Tally;
  gradeOf(s: ProbeSample): Grade;
}
function context(p: ProbeDetail, st: ViewState): Ctx {
  const lanes = modelGroups(p).find((g) => g.key === st.group)?.lanes ?? [];
  const [on = "on", off = "off"] = p.arms;
  const recorded = new Map<string, Call | null>(p.cases.map((c) => [c.id, c.recorded]));
  const gradeOf = (s: ProbeSample): Grade => grade(s.key, recorded.get(s.case) ?? null);
  const inGroup = p.samples.filter((s) => lanes.includes(s.lane));
  const split = new Map(p.cases.map((c) => [c.id, c.split]));
  const synthetic = new Set(p.cases.filter((c) => c.sourceKind === "synthetic").map((c) => c.id));
  return {
    p, st, lanes, on, off, gradeOf,
    name: (arm) => (st.blind ? (arm === on ? "X" : "Y") : arm.toUpperCase()),
    samples: (caseId, arm) => inGroup.filter((s) => s.case === caseId && s.arm === arm).sort((a, b) => a.lane.localeCompare(b.lane) || a.sample - b.sample),
    t: (caseId, arm, sp) => tally(inGroup.filter((s) => s.arm === arm && (caseId === null ? !synthetic.has(s.case) : s.case === caseId) && (sp === undefined || split.get(s.case) === sp)).map(gradeOf)),
  };
}

function typeBadge(c: Ctx, arm: string): string {
  const color = c.st.blind ? "#59636e" : arm === c.on ? "#6890f0" : "#a8a878";
  return `<span class="pr-type"><b>${c.st.blind ? "ARM" : esc(c.p.feature.replace(/-v\d+$/, "").split("-")[0]?.toUpperCase() ?? "ARM")}/</b><em style="background:${color}">${esc(c.name(arm))}</em></span>`;
}
function hp(frac: number, label: string): string {
  const level = frac > 0.5 ? "" : frac > 0.2 ? " mid" : " low";
  return `<span class="pr-hp"><span class="pr-hp-l">${esc(label)}</span><span class="pr-hp-t"><span class="pr-hp-f${level}" style="width:${String(Math.round(frac * 100))}%"></span></span></span>`;
}
function gapBar(g: Gap | null, size: "big" | "small"): string {
  if (g === null) return `<span class="pr-gap ${size}"><span class="pr-gap-c"></span></span>`;
  const at = (v: number): string => `${((v + 1) * 50).toFixed(2)}%`;
  const color = g.d > 1e-4 ? "#2f9e57" : g.d < -1e-4 ? "#d03a3a" : "#8a96a3";
  return `<span class="pr-gap ${size}" title="gap ${String(Math.round(g.d * 100))} points, range ${String(Math.round(g.lo * 100))} to ${String(Math.round(g.hi * 100))}"><span class="pr-gap-c"></span><span class="pr-gap-r" style="left:${at(g.lo)};width:${((g.hi - g.lo) * 50).toFixed(2)}%"></span><span class="pr-gap-m" style="left:${at(g.d)};background:${color}"></span></span>`;
}
function legend(c: Ctx): string {
  const any = (g: Grade): boolean => c.p.samples.some((s) => c.lanes.includes(s.lane) && c.gradeOf(s) === g);
  return `<div class="pr-legend">${GRADES.filter((g) => g.id !== "unk" || any("unk")).map((g) => `<span><i class="pr-sw ${g.id}"></i>${g.short}</span>`).join("")}</div>`;
}
function plannedPerArm(c: Ctx): number {
  const per = c.p.cases.length * Math.max(1, c.p.arms.length);
  return c.p.lanes.filter((l) => c.lanes.includes(l.id)).reduce((sum, l) => sum + Math.floor(l.planned / per), 0);
}

function header(c: Ctx, now: number, list: readonly ProbeSummary[]): string {
  const live = c.p.lanes.some((l) => l.state === "running");
  const picker = list.length > 1
    ? `<select class="pr-pick" data-probe aria-label="Probe">${list.map((p) => `<option value="${esc(p.id)}"${p.id === c.p.id ? " selected" : ""}>${esc(p.id)}${p.live ? " · live" : ""}</option>`).join("")}</select>`
    : `<span class="pr-id">${esc(c.p.id)}</span>`;
  const tile = (l: ProbeLane): string => {
    const ms = median(c.p.samples.filter((s) => s.lane === l.id).map((s) => s.elapsedMs));
    return `<div class="pr-kpi"><div class="pr-k">${esc(l.id.toUpperCase())} · ${esc(modelLabel(l.model).toUpperCase())}</div><div class="pr-v">${String(l.completed)}/${String(l.planned)}</div>${hp(l.planned === 0 ? 0 : l.completed / l.planned, l.state === "complete" ? "OK" : l.state === "running" ? "RUN" : "—")}<div class="pr-tail">${esc(laneTail(l, ms, now))}</div></div>`;
  };
  const synthetic = c.p.cases.filter((x) => x.sourceKind === "synthetic").length;
  const historical = c.p.cases.length - synthetic;
  const countLabel = synthetic === 0 ? `${String(historical)} recorded turns` : `${String(historical)} recorded turn${historical === 1 ? "" : "s"} + ${String(synthetic)} synthetic case${synthetic === 1 ? "" : "s"}`;
  const held = c.p.cases.some((x) => x.sourceKind !== "synthetic" && x.split === "heldout");
  const on = c.t(null, c.on, held ? "heldout" : undefined), off = c.t(null, c.off, held ? "heldout" : undefined);
  const summary = historical === 0 ? '<div class="pr-kpi"><div class="pr-k">SYNTHETIC CASES</div><div class="pr-tail">Study rubric required; no recorded calls to compare.</div></div>' : `<div class="pr-kpi"><div class="pr-k">${synthetic > 0 ? "RECORDED " : ""}${held ? "HELD-OUT" : "ALL CASES"} DEPARTS · ${esc(c.name(c.on))} VS ${esc(c.name(c.off))}</div><div class="pr-v">${String(pct(on))}% · ${String(pct(off))}%</div><div class="pr-tail">${String(on.dif)}/${String(on.n)} vs ${String(off.dif)}/${String(off.n)} · ${pText(pOf(on, off))}</div><div class="pr-tail">hand rubric not graded yet</div></div>`;
  const problems = c.p.problems.length === 0 ? "" : `<details class="pr-problems"><summary>${String(c.p.problems.length)} PROBLEM${c.p.problems.length === 1 ? "" : "S"} READING THIS PROBE</summary><ul>${c.p.problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
  return `<section class="box pr-head"><div class="pr-titlebar">${picker}<span class="pr-mode${live ? " live" : ""}">${live ? "LIVE" : "ENDED"}</span><span class="pr-asof">AS OF ${esc(nyTime(now))} NY</span></div>
<h1>${esc(c.p.title)}</h1><p class="pr-sub">${esc(c.p.feature)}${c.p.tier === null ? "" : ` · ${esc(c.p.tier)}`} · ${countLabel}, ${esc(c.name(c.on))} vs ${esc(c.name(c.off))}, the next tool call sampled per arm. No game actions run.</p>
<div class="pr-kpis">${c.p.lanes.map(tile).join("")}${summary}</div>${problems}</section>`;
}
function tools(c: Ctx): string {
  const groups = modelGroups(c.p).map((g) => `<button type="button" data-group="${esc(g.key)}" aria-pressed="${String(g.key === c.st.group)}">${esc(groupLabel(g.key).toUpperCase())} · ${esc(g.lanes.map((l) => l.toUpperCase()).join("+"))}</button>`).join("");
  return `<section class="box pr-tools">${legend(c)}<div class="pr-segs"><div class="pr-seg" role="group" aria-label="Model">${groups}</div><div class="pr-seg"><button type="button" data-blind aria-pressed="${String(c.st.blind)}">ARM-BLIND</button></div></div></section>`;
}
function slots(c: Ctx): string {
  return `<aside class="pr-party" aria-label="Cases">${c.p.cases.map((k) => {
    const a = c.t(k.id, c.on), b = c.t(k.id, c.off);
    return `<button type="button" class="pr-slot" data-case="${esc(k.id)}" aria-current="${String(k.id === c.st.caseId)}"><span class="pr-slot-top"><span class="pr-slot-id">${esc(shortCase(k.id))}${k.sourceKind === "synthetic" ? " · SYNTHETIC" : ` T${String(k.turn)}`}</span><span>${k.split === "heldout" ? "HELD" : "DEV"}</span></span><span class="pr-slot-nm">${esc(k.title)}</span>${hp(a.n === 0 ? 0 : a.dif / a.n, c.name(c.on))}${hp(b.n === 0 ? 0 : b.dif / b.n, c.name(c.off))}${gapBar(k.sourceKind === "synthetic" ? null : gap(a, b), "small")}</button>`;
  }).join("")}</aside>`;
}
function scene(c: Ctx, k: ProbeCase): string {
  const side = (arm: string, cls: string): string => {
    const t = c.t(k.id, arm);
    return `<div class="pr-side ${cls}">${typeBadge(c, arm)}<div class="pr-big">${String(t.dif)}/${String(t.n)}</div>${hp(t.n === 0 ? 0 : t.dif / t.n, "GO")}<div class="pr-side-n">REPEATS ${String(t.rep)} · ERROR ${String(t.err)}</div></div>`;
  };
  const frame = k.sourceKind === "synthetic" ? '<div class="pr-noframe">SYNTHETIC<br>NO RECORDED FRAME</div>' : k.frame === null ? '<div class="pr-noframe">NO FRAME</div>' : `<img class="pr-frame" src="/api/runs/${encodeURIComponent(k.run)}/frames/${encodeURIComponent(k.frame)}" alt="${esc(k.run)} at turn ${String(k.turn)}">`;
  return `<section class="pr-scene">${side(c.on, "foe")}<div class="pr-screen">${frame}<div class="pr-cap">${k.sourceKind === "synthetic" ? "CONSTRUCTED CASE" : `${esc(k.run.slice(-4))} · TURN ${String(k.turn)}${k.at === null ? "" : ` · ${esc(nyTime(k.at))} NY`}`}</div></div>${side(c.off, "me")}</section>`;
}
function callHtml(call: Call): string {
  const args = Object.entries(call.args).filter(([key]) => key !== "because").map(([key, v]) => `${key}=${JSON.stringify(v)}`).join(" ");
  const because = typeof call.args.because === "string" ? `<span class="pr-because">because: ${esc(call.args.because)}</span>` : "";
  return `<div class="pr-call">${esc(call.tool)}${args === "" ? "" : ` ${esc(args)}`}${because}</div>`;
}
function verdictHtml(c: Ctx, a: Tally, b: Tally): string {
  const v = verdict(a, b, c.name(c.on), c.name(c.off));
  return `<p class="pr-verdict"><b>${esc(v.lead)}</b>${v.detail === "" ? "" : ` ${esc(v.detail)}`}</p>`;
}
function main(c: Ctx, k: ProbeCase): string {
  const planned = plannedPerArm(c);
  const row = (arm: string): string => {
    const xs = c.samples(k.id, arm), t = c.t(k.id, arm);
    const squares = xs.map((s) => `<button type="button" class="pr-sq ${c.gradeOf(s)}" data-sample="${esc(sampleId(s))}" aria-current="${String(sampleId(s) === c.st.sample)}" title="${esc(s.key.split(" ")[0] ?? "")}"></button>`).join("");
    return `<div class="pr-armrow">${typeBadge(c, arm)}<div class="pr-sqs" data-arm="${esc(arm)}">${squares}${'<span class="pr-sq todo"></span>'.repeat(Math.max(0, planned - xs.length))}</div><span class="pr-n">${String(t.dif)}/${String(t.n)}</span></div>`;
  };
  const a = c.t(k.id, c.on), b = c.t(k.id, c.off), g = gap(a, b);
  if (k.sourceKind === "synthetic") return `<section class="box pr-main"><h3>${esc(shortCase(k.id))} · SYNTHETIC · ${esc(k.title)}</h3>${row(c.on)}${row(c.off)}<p class="pr-note">Synthetic fixture: no recorded call, historical frame or acquisition outcome. These samples require the study's rubric and are excluded from recorded-call departure summaries and plots.</p></section>`;
  const recorded = k.recorded === null ? '<p class="pr-note">Recorded call unknown: the source run is missing, so these squares are ungraded.</p>' : `<div class="pr-recorded"><div class="pr-note">Recorded call (what the model did in the real run)</div>${callHtml(k.recorded)}</div>`;
  return `<section class="box pr-main"><h3>${esc(shortCase(k.id))} T${String(k.turn)} · ${esc(k.title)}</h3>${verdictHtml(c, a, b)}${row(c.on)}${row(c.off)}
<div class="pr-armrow pr-gaprow"><span class="pr-gap-lbl">GAP</span><div>${gapBar(g, "big")}<div class="pr-key"><span class="l">◀ ${esc(c.name(c.off))} <span class="w">DEPARTS </span>MORE</span><span class="r">${esc(c.name(c.on))} <span class="w">DEPARTS </span>MORE ▶</span></div></div><span class="pr-n">${g === null ? "" : String(Math.round(g.d * 100))}</span></div>
<p class="pr-note">The square is the gap between the two rows of squares above; the line is the range it probably sits in. <b>A line that crosses the middle means too close to call.</b></p>
<p class="pr-note">Green means the sampled call differs from the call the model made in the real run, which for a loop case usually means it broke the loop. It is an automatic stand-in until the hand rubric is graded.</p>${recorded}</section>`;
}
function reader(c: Ctx): string {
  const s = c.p.samples.find((x) => sampleId(x) === c.st.sample && c.lanes.includes(x.lane));
  if (s === undefined) return '<section class="box pr-reader"><h3>SAMPLE</h3><p class="pr-note">Pick a square to read its reasoning and exact call.</p></section>';
  const g = GRADES.find((x) => x.id === c.gradeOf(s)) ?? GRADES[0];
  const call = parseKey(s.key);
  return `<section class="box pr-reader"><h3>SAMPLE</h3><div class="pr-chips">${typeBadge(c, s.arm)}<span class="pr-chip ${g?.id ?? ""}">${g?.short ?? ""}</span><span class="pr-chip plain">${esc(s.lane.toUpperCase())} #${String(s.sample + 1)}</span><span class="pr-chip plain">${esc(nyTime(s.at))} · ${(s.elapsedMs / 1000).toFixed(1)}s</span></div>
${call === null ? `<div class="pr-call">${esc(s.key)}</div>` : callHtml(call)}<div class="pr-dialog">${esc(s.thinking === "" ? "(no thinking recorded)" : s.thinking)}</div></section>`;
}
function plot(c: Ctx, phone: boolean): string {
  const W = phone ? 360 : 820, L = phone ? 26 : 280, R = phone ? 26 : 110, rowH = phone ? 58 : 32;
  const X = (v: number): number => L + ((v + 1) / 2) * (W - L - R);
  let y = 52, rows = "";
  for (const split of ["development", "heldout"] as const) {
    const cases = c.p.cases.filter((k) => k.sourceKind !== "synthetic" && k.split === split);
    if (cases.length === 0) continue;
    rows += `<text x="8" y="${String(y + 18)}" font-size="9" fill="#d03a3a">${split === "heldout" ? "HELD-OUT" : "DEVELOPMENT"}</text>`;
    y += rowH;
    for (const item of [...cases.map((k) => ({ k, on: c.t(k.id, c.on), off: c.t(k.id, c.off) })), { k: null, on: c.t(null, c.on, split), off: c.t(null, c.off, split) }]) {
      const g = gap(item.on, item.off), cy = phone ? y + 44 : y + rowH / 2, ty = phone ? y + 12 : cy - 1;
      const name = item.k === null ? "POOLED" : `${shortCase(item.k.id)} T${String(item.k.turn)}`;
      const sub = item.k === null ? "all cases in this group" : item.k.title.slice(0, 44);
      const color = g === null ? "#8a96a3" : g.d > 1e-4 ? "#2f9e57" : g.d < -1e-4 ? "#d03a3a" : "#8a96a3";
      const mark = g === null ? "" : item.k === null
        ? `<polygon points="${String(X(g.lo))},${String(cy)} ${String(X(g.d))},${String(cy - 8)} ${String(X(g.hi))},${String(cy)} ${String(X(g.d))},${String(cy + 8)}" fill="#283038"/>`
        : `<line x1="${String(X(g.lo))}" x2="${String(X(g.hi))}" y1="${String(cy)}" y2="${String(cy)}" stroke="#283038" stroke-width="3"/><rect x="${String(X(g.d) - 6)}" y="${String(cy - 6)}" width="12" height="12" fill="${color}" stroke="#283038" stroke-width="2"/>`;
      const current = item.k !== null && item.k.id === c.st.caseId;
      rows += `<g${item.k === null ? "" : ` data-case="${esc(item.k.id)}"`}><rect x="0" y="${String(y)}" width="${String(W)}" height="${String(rowH)}" fill="${current ? "#fff1c2" : "transparent"}"/><text x="8" y="${String(ty)}" font-size="9" fill="#283038">${esc(name)}</text><text x="8" y="${String(phone ? ty + 14 : cy + 10)}" font-size="7" fill="#59636e">${esc(sub)}</text>${mark}<text x="${String(phone ? W - 8 : W - R + 8)}" y="${String(phone ? ty : cy + 3)}" text-anchor="${phone ? "end" : "start"}" font-size="7" fill="#59636e">${String(item.on.dif)}/${String(item.on.n)} · ${String(item.off.dif)}/${String(item.off.n)}</text></g>`;
      y += rowH;
    }
  }
  const ticks = [-1, -0.5, 0, 0.5, 1].map((v) => `<line x1="${String(X(v))}" x2="${String(X(v))}" y1="46" y2="${String(y)}" stroke="${v === 0 ? "#283038" : "#c9d6e6"}" stroke-width="${v === 0 ? "2" : "1"}"${v === 0 ? "" : ' stroke-dasharray="3 3"'}/><text x="${String(X(v))}" y="${String(y + 14)}" text-anchor="middle" font-size="7" fill="#59636e">${v > 0 ? "+" : ""}${String(v * 100)}</text>`).join("");
  const notes = `<rect x="${String(X(-1))}" y="8" width="${String(X(0) - X(-1) - 4)}" height="22" rx="5" fill="#fde3e3"/><text x="${String(X(-0.5))}" y="23" text-anchor="middle" font-size="7" fill="#8a2020">◀ ${esc(c.name(c.off))}${phone ? "" : " DEPARTS"} MORE</text><rect x="${String(X(0) + 4)}" y="8" width="${String(X(1) - X(0) - 4)}" height="22" rx="5" fill="#e2f5e8"/><text x="${String(X(0.5))}" y="23" text-anchor="middle" font-size="7" fill="#1d6b3a">${esc(c.name(c.on))}${phone ? "" : " DEPARTS"} MORE ▶</text>`;
  return `<svg class="pr-plot" viewBox="0 0 ${String(W)} ${String(y + 34)}" role="img" aria-label="Gap in departure rate per case">${notes}${ticks}${rows}<text x="${String((L + W - R) / 2)}" y="${String(y + 28)}" text-anchor="middle" font-size="7" fill="#59636e">${esc(c.name(c.on))} − ${esc(c.name(c.off))}, POINTS</text></svg>`;
}
function guide(c: Ctx): string {
  const a = esc(c.name(c.on)), b = esc(c.name(c.off));
  return `<div class="pr-guide"><h4>HOW TO READ THIS PLOT</h4><ol>
<li><b>One row per case.</b> The square is how much more often ${a} departed from the recorded call than ${b}, in percentage points.</li>
<li><b>Right of the center line</b> means ${a} departed more; <b>left</b> means ${b} did. Green squares lean ${a}, red lean ${b}.</li>
<li><b>The line through the square</b> is the range the true gap probably sits in (about 95% sure). A few samples per arm make it wide.</li>
<li><b>If the line crosses the center</b>, these samples can't tell the arms apart yet. Only a line that stays on one side is a real lean.</li>
<li><b>Diamonds</b> pool a group of cases. Samples from one prompt aren't independent runs, so read diamonds as a rough guide, not proof.</li></ol></div>`;
}

export function pageHtml(p: ProbeDetail, st: ViewState, now: number, phone: boolean, list: readonly ProbeSummary[] = []): string {
  const c = context(p, st);
  const k = p.cases.find((x) => x.id === st.caseId) ?? p.cases[0];
  if (k === undefined) return `${header(c, now, list)}<section class="box"><p class="pr-note">This probe has no cases.</p></section>`;
  return `${header(c, now, list)}${tools(c)}<div class="pr-layout">${slots(c)}<div class="pr-col">${scene(c, k)}${main(c, k)}${reader(c)}</div></div>
<section class="box"><details class="pr-more"${st.plot ? " open" : ""}><summary>IS THE DIFFERENCE REAL? · ${p.cases.some((x) => x.sourceKind === "synthetic") ? "RECORDED CASES ONLY" : "ALL CASES"}</summary><div class="pr-plotwrap"><div>${plot(c, phone)}</div>${guide(c)}</div></details></section>`;
}
