// Run controls and the next-run switchboard: pure HTML renderers for the
// top bar, the game-screen overlays, the live side panel and the PokéNav
// ★ NEXT RUN page. app.ts owns state, keys and requests.
import type { FeatureInfo, SwitchableFeature } from "@pokebench/agent/features";
import { esc, hms, num } from "./format.js";
import type { RunView } from "./model.js";

export type ControlAction = "pause" | "resume" | "stop" | "cancel_stop" | "abort";
export type Overlay = "pausing" | "paused" | "stopping" | "ended" | "abort_hold" | "aborted" | null;
export const ABORT_HOLD_MS = 1_500;

export interface ArmOutcome {
  readonly runs: number;
  readonly reached: Readonly<Record<string, number>>;
  readonly medianMs: Readonly<Record<string, number>>;
}
export interface FeatureHistory { readonly on: ArmOutcome; readonly off: ArmOutcome }
export type HistoryMap = Readonly<Partial<Record<SwitchableFeature, FeatureHistory | null>>>;

export interface NextRunDraft {
  model: string;
  thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  maxTurns: number;
  maxWallMs: number;
  failureLimit: number;
  maxTokens: number;
  target: string | null;
  features: Record<SwitchableFeature, boolean>;
}
export interface LocalModel { readonly id: string; readonly status: string; readonly vision: boolean; readonly contextWindow: number | null }
export type QueueStatus =
  | { readonly state: "idle" }
  | { readonly state: "queued"; readonly runId: string; readonly waitingFor: string }
  | { readonly state: "launching" | "running"; readonly runId: string }
  | { readonly state: "failed"; readonly runId: string; readonly error: string };

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
// Splits shown on the switchboard bars, in story order.
export const BAR_MILESTONES: readonly (readonly [string, string])[] = [
  ["NEW_GAME_CREATED", "NEW GAME"], ["PLAYER_NAME_CONFIRMED", "NAMED"], ["FIRST_TRUCK_EXIT", "TRUCK"], ["CLOCK_SET", "CLOCK"],
  ["RIVAL_MET", "RIVAL"], ["ROUTE_101", "RT 101"], ["STARTER_CHOSEN", "STARTER"],
];
export const TARGETS = ["NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "CLOCK_SET", "RIVAL_MET", "STARTER_CHOSEN", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "PETALBURG_CITY", "RUSTBORO_CITY", "STONE_BADGE"] as const;

const GROUPS = [["observation", "OBSERVATION · WHAT THE MODEL SEES"], ["guidance", "GUIDANCE · HOW THE HARNESS HELPS"], ["guard", "GUARDS · WHAT CAN INTERVENE"]] as const;

// Which controls apply, from the recorded control state of a live run.
export function availableActions(view: RunView, live: boolean): Set<ControlAction> {
  if (!live || view.end !== null) return new Set();
  const state = view.control.state;
  if (state === "running") return new Set(["pause", "stop", "abort"]);
  if (state === "pause_pending") return new Set(["resume", "stop", "abort"]);
  if (state === "paused") return new Set(["resume", "stop", "abort"]);
  if (state === "stop_pending") return new Set(["cancel_stop", "abort"]);
  return new Set();
}

export function controlBar(view: RunView, live: boolean, holdFraction: number | null): string {
  const actions = availableActions(view, live);
  const paused = view.control.state === "paused" || view.control.state === "pause_pending";
  const button = (action: ControlAction, cls: string, label: string): string =>
    `<button type="button" class="${cls}" data-control="${action}"${actions.has(action) ? "" : " disabled"}>${label}</button>`;
  const stopping = view.control.state === "stop_pending";
  const abort = holdFraction === null ? "" : ` style="--hold:${String(Math.round(holdFraction * 100))}%"`;
  return [
    ...(view.end === null ? [] : ['<button type="button" data-dismiss-overlay>CLOSE</button>']),
    paused ? button("resume", "resume", "▶ RESUME") : button("pause", "pause", "⏸ PAUSE"),
    stopping ? button("cancel_stop", "cancel", "↺ CANCEL STOP") : button("stop", "stop", "■ STOP"),
    `<button type="button" class="abort${holdFraction === null ? "" : " holding"}" data-control="abort"${actions.has("abort") ? "" : " disabled"}${abort}>✖ ABORT <span>hold to abort</span></button>`,
  ].join("");
}

export function stateLabel(view: RunView, live: boolean): { cls: string; text: string } {
  if (view.end !== null) return { cls: "ended", text: view.end.reason === "operator_abort" ? "ABORTED" : "ENDED" };
  if (!live) return { cls: "idle", text: "REPLAY" };
  const labels = { running: ["live", "RUNNING"], pause_pending: ["pausing", "PAUSING"], paused: ["paused", "PAUSED"], stop_pending: ["stopping", "STOPPING"], ended: ["ended", "ENDED"] } as const;
  const [cls, text] = labels[view.control.state];
  return { cls, text };
}

// Run time excludes operator pauses, for the clock, the time cap and splits.
export function runSeconds(view: RunView, nowMs: number): number {
  if (view.startMs === null) return 0;
  const end = view.end === null ? nowMs : (view.lastMs ?? nowMs);
  return Math.max(0, (end - view.startMs - view.control.pausedBefore(end)) / 1000);
}

export function overlayKind(view: RunView, live: boolean, holding: boolean, closed: boolean): Overlay {
  if (holding) return "abort_hold";
  if (view.end !== null) {
    if (closed || !live) return null;
    return view.end.reason === "operator_abort" ? "aborted" : "ended";
  }
  if (!live) return null;
  if (view.control.state === "paused") return "paused";
  if (view.control.state === "pause_pending") return "pausing";
  if (view.control.state === "stop_pending") return "stopping";
  return null;
}

// Drawn inside the GBA screen (288×192 SVG units), like a game text box.
export function overlay(kind: Overlay, view: RunView, nowMs: number, holdFraction = 0): string {
  if (kind === null) return "";
  const turn = String(view.turn);
  const at = hms(runSeconds(view, nowMs));
  const text = (y: number, cls: string, value: string): string => `<text class="scr-t ${cls}" x="144" y="${String(y)}" text-anchor="middle">${value}</text>`;
  const box = (fill: string, stroke: string, title: string, titleCls: string, lines: [string, string][], extra = ""): string =>
    `<g class="overlay ${kind}" role="status" aria-label="${esc(title)}"><rect width="288" height="192" fill="#0e1626" opacity=".6"/><rect x="24" y="36" width="240" height="112" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="4"/><rect x="30" y="42" width="228" height="100" rx="7" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>${text(70, `l ${titleCls}`, title)}${lines.map(([cls, line], n) => text(90 + 16 * n, `s ${cls}`, line)).join("")}${extra}</g>`;
  if (kind === "pausing") return box("#ffd447", "#7a5410", "⏸ PAUSING", "", [["", `finishing turn ${turn}, then holding`], ["", "no further model call"], ["r", "Use RESUME or STOP above"]]);
  if (kind === "paused") return box("#ffd447", "#7a5410", "⏸ PAUSED", "", [["", `after turn ${turn} · no model call`], ["", `time cap clock stopped at ${at}`], ["r", view.control.emulatorFrozen === false ? "emulator NOT frozen" : "Use RESUME or STOP above"]]);
  if (kind === "stopping") return box("#1e2c44", "#ff9b4a", "■ STOPPING", "y", [["w", `finishing turn ${turn}, then ending`], ["w", "Use CANCEL STOP above"], ["w", "still counted in results"]], '<rect x="64" y="128" width="160" height="8" rx="3" fill="#2a3e60" stroke="#ff9b4a" stroke-width="2"/><rect class="sweep" x="66" y="130" width="60" height="4" rx="2" fill="#ff9b4a"/>');
  if (kind === "abort_hold") {
    const width = Math.round(156 * Math.max(0, Math.min(1, holdFraction)));
    return box("#f8f8f8", "#d03a3a", "✖ ABORT RUN?", "r", [["", "kills the model call now"], ["r", "run is EXCLUDED from results"]], `<rect x="64" y="118" width="160" height="16" rx="4" fill="#fff" stroke="#d03a3a" stroke-width="2"/><rect class="hold" x="66" y="120" width="${String(width)}" height="12" rx="3" fill="#d03a3a"/>${text(130, "s", "Hold ABORT… release cancels")}`);
  }
  const reached = view.milestones.filter((m) => m.origin !== "present_at_start");
  if (kind === "aborted") return box("#d03a3a", "#6a1818", "✖ ABORTED", "w", [["w", `turn ${turn} · model call cancelled`], ["w", "excluded from results"], ["w", "Use CLOSE above"]]);
  return box("#f8f8f8", "#2f9e57", "■ RUN ENDED", "g", [["", `${esc(view.end?.reason ?? "")} · turn ${turn} · ${at}`], ["", `furthest: ${esc(reached.at(-1)?.name.replace(/_/g, " ") ?? "none")} · ${String(reached.length)} splits`], ["", "Use CLOSE above"]]);

}

function bar(label: string, fraction: number, value: string, of: string): string {
  const width = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return `<div class="stat">${label}<b>${value}</b>${of}${of === "" ? "" : `<div class="track"><i class="${width > 80 ? "hot" : ""}" style="width:${String(width)}%"></i></div>`}</div>`;
}

export function sideStats(view: RunView, nowMs: number): string {
  const start = view.start;
  const turns = start?.budgets.max_turns;
  const wall = start?.budgets.max_wall_ms;
  const seconds = runSeconds(view, nowMs);
  const failures = view.retry === null ? 0 : view.retry.attempt;
  const limit = start?.evaluation?.failure_limit ?? view.retry?.limit ?? 3;
  const context = view.context?.est_tokens ?? 0;
  const window = start?.model.context_window ?? 0;
  return [
    bar("TURN", turns === undefined ? 0 : view.turn / turns, String(view.turn), turns === undefined ? "" : `of ${String(turns)}`),
    bar("TIME", wall === undefined ? 0 : (seconds * 1000) / wall, hms(seconds), wall === undefined ? "" : `of ${hms(wall / 1000)}`),
    `<div class="stat">FAILURES<b>${String(failures)}</b>of ${String(limit)}</div>`,
    bar("CONTEXT", window === 0 ? 0 : context / window, `${num(Math.round(context / 1000))}k`, window === 0 ? "" : `of ${num(Math.round(window / 1000))}k`),
  ].join("");
}

export interface BestSplits { readonly run: string; readonly milestones: readonly { readonly name: string; readonly offsetMs: number }[] }

export function splitStrip(view: RunView, best: BestSplits | null): string {
  const startMs = view.startMs;
  const reached = new Map(startMs === null ? [] : view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => [m.name, (m.ms - startMs - view.control.pausedBefore(m.ms)) / 1000]));
  const bests = new Map(best?.milestones.map((m) => [m.name, m.offsetMs / 1000]) ?? []);
  const next = BAR_MILESTONES.find(([name]) => !reached.has(name))?.[0];
  const chips = BAR_MILESTONES.map(([name, label]) => `<span class="${reached.has(name) ? "done" : name === next ? "next" : ""}">${label}${reached.has(name) ? " ✔" : ""}</span>`).join("");
  const rows = BAR_MILESTONES.map(([name, label]) => {
    const at = reached.get(name);
    const ref = bests.get(name);
    const delta = at === undefined || ref === undefined ? `<span class="d na">${name === next ? "next" : ""}</span>` : `<span class="d ${at <= ref ? "g" : "r"}">${at <= ref ? "−" : "+"}${hms(Math.abs(at - ref))}</span>`;
    return `<span>${label}</span><span class="t${at === undefined ? " na" : ""}">${at === undefined ? "—" : hms(at)}</span>${delta}`;
  }).join("");
  return `<div class="mspl">${chips}</div><div class="splitrows"><span class="small muted">SPLIT</span><span class="small muted t">THIS RUN</span><span class="small muted d">VS BEST</span>${rows}</div>${best === null ? '<p class="small muted">no comparable best run yet</p>' : ""}`;
}

function pips(history: FeatureHistory): string {
  const max = Math.max(history.on.runs, history.off.runs, 1);
  const height = (n: number): number => Math.max(2, Math.round((22 * n) / max));
  const cells = BAR_MILESTONES.map(([name, label]) => {
    const on = history.on.reached[name] ?? 0, off = history.off.reached[name] ?? 0;
    return `<span class="pip"><span class="bars"><i style="height:${String(height(on))}px"></i><i class="off" style="height:${String(height(off))}px"></i></span><b>${String(on)}·${String(off)}</b>${label}</span>`;
  }).join("");
  return `<div class="pips">${cells}</div><div class="legend"><span><i></i>runs with it ON (${String(history.on.runs)})</span><span><i class="off"></i>runs with it OFF (${String(history.off.runs)})</span></div>`;
}

function historyTable(history: FeatureHistory): string {
  const median = (arm: ArmOutcome, name: string): string => arm.medianMs[name] === undefined ? '<td class="na">—</td>' : `<td>${hms(Math.round((arm.medianMs[name] ?? 0) / 1000))}</td>`;
  const rows = BAR_MILESTONES.map(([name, label]) => {
    const on = history.on.reached[name] ?? 0, off = history.off.reached[name] ?? 0;
    return `<tr><td>${label}</td><td class="${on / history.on.runs > off / history.off.runs ? "g" : ""}">${String(on)}/${String(history.on.runs)}</td><td class="${off / history.off.runs > on / history.on.runs ? "g" : ""}">${String(off)}/${String(history.off.runs)}</td>${median(history.on, name)}${median(history.off, name)}</tr>`;
  }).join("");
  return `<table class="etab"><thead><tr><th>MILESTONE</th><th>REACHED · ON</th><th>REACHED · OFF</th><th>MEDIAN SPLIT · ON</th><th>MEDIAN SPLIT · OFF</th></tr></thead><tbody>${rows}</tbody></table><p class="small muted">Strict: ${String(history.on.runs)} runs with this ON vs ${String(history.off.runs)} with it OFF, same model, thinking, budget and every other feature. Median split counts only runs that reached it; paused time excluded.</p>`;
}

export interface SwitchboardInput {
  readonly features: readonly FeatureInfo[];
  readonly draft: NextRunDraft;
  readonly live: ReadonlySet<string> | null;
  readonly history: HistoryMap;
  readonly expanded: ReadonlySet<string>;
  // While a queued run is waiting, its settings cannot change.
  readonly locked?: boolean;
}

export function switchboard({ features, draft, live, history, expanded, locked = false }: SwitchboardInput): string {
  const differs = (f: FeatureInfo): boolean => live !== null && f.switchable && live.has(f.id) !== draft.features[f.id as SwitchableFeature];
  const row = (f: FeatureInfo): string => {
    const id = f.id as SwitchableFeature;
    const on = draft.features[id];
    const h = history[id] ?? null;
    const needsOff = f.needs !== null && !draft.features[f.needs];
    const evidence = h === null
      ? `<span class="eff-empty">No matching runs yet. Needs past runs identical to this setup except for this feature.</span>`
      : `${pips(h)}<button type="button" class="xbtn" data-expand="${f.id}" aria-expanded="${String(expanded.has(f.id))}">${expanded.has(f.id) ? "▼ HIDE MILESTONES + SPLITS" : "▶ MILESTONES + SPLITS"}</button>${expanded.has(f.id) ? historyTable(h) : ""}`;
    return `<div class="frow${on ? "" : " off"}${differs(f) ? " differs" : ""}"><label class="cbwrap"><input type="checkbox" data-feature="${f.id}"${on ? " checked" : ""}${locked || (!on && needsOff) ? " disabled" : ""} aria-label="${esc(f.title)}"><span class="cb${on ? " on" : ""}">${on ? "✔" : ""}</span></label><span class="nm"><span>${esc(f.title)}${differs(f) ? '<span class="diffmark">DIFFERS FROM LIVE RUN</span>' : ""}</span><i>${esc(f.description)}</i>${evidence}<u>${esc(f.id)}</u></span><span class="req">${f.needs === null ? "" : `needs ${esc(f.needs)}`}</span></div>`;
  };
  const groups = GROUPS.map(([group, title]) => {
    const items = features.filter((f) => f.group === group);
    const count = items.filter((f) => draft.features[f.id as SwitchableFeature]).length;
    return `<div class="fgroup"><h4><span>${title}</span><span class="counter">${String(count)}/${String(items.length)} ON</span></h4>${items.map(row).join("")}</div>`;
  }).join("");
  const measured = features.filter((f) => f.group === "measurement").map((f) => `<div class="frow locked"><span class="cb lock">🔒</span><span class="nm"><span>${esc(f.title)}</span><i>${esc(f.description)}</i><u>${esc(f.id)}</u></span><span></span></div>`).join("");
  return `${groups}<div class="fgroup"><h4>MEASUREMENT · ALWAYS ON</h4><p class="small muted">These only record and score the run. They never change what the model sees, so they stay on and every run is scored the same way.</p>${measured}</div>`;
}

export function differenceCount(features: readonly FeatureInfo[], draft: NextRunDraft, live: ReadonlySet<string> | null): number {
  if (live === null) return 0;
  return features.filter((f) => f.switchable && live.has(f.id) !== draft.features[f.id as SwitchableFeature]).length;
}

export function queueText(status: QueueStatus): string {
  if (status.state === "idle") return "One local model, so the next run waits for the live one.";
  if (status.state === "queued") return `Queued ${esc(status.runId)} · waiting for ${esc(status.waitingFor)}.`;
  if (status.state === "failed") return `Launch failed: ${esc(status.error)}`;
  return `${status.state === "launching" ? "Launching" : "Running"} ${esc(status.runId)}.`;
}
