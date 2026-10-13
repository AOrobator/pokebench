// HTML for each panel of the Open PokéNav layout. Every value comes from the
// folded event log; a panel without its data says so instead of guessing.
import type { RunEvent } from "@pokebench/agent/events";
import { esc, hms, num, signedDelta } from "./format.js";
import { dataHtml, jsonHtml, richText } from "./inspectformat.js";
import { ASSUMED_TIMING, MILESTONE_ORDER, type RunView } from "./model.js";

export const NO_DATA = '<span class="nodata">no data</span>';

const MB = 1024 * 1024;
const BADGES = 8;
const ARROW: Readonly<Record<string, string>> = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→" };

export interface Baseline {
  readonly run: string;
  readonly milestones: readonly { readonly name: string; readonly offsetMs: number; readonly derived?: boolean }[];
}

function wallSeconds(view: RunView, nowMs: number): number {
  if (view.end !== null) return view.end.wall_ms / 1000;
  return (nowMs - (view.startMs ?? nowMs)) / 1000;
}

function kv(rows: readonly (readonly [string, string, boolean?])[]): string {
  return `<dl class="kv">${rows.map(([k, v, warn]) => `<dt>${k}</dt><dd${warn === true ? ' class="warn"' : ""}>${v}</dd>`).join("")}</dl>`;
}

const NOT_STARTED = "not started";

function place(state: { location: string | null; screen: string }): string {
  return state.location === null ? `${esc(state.screen)} (${NOT_STARTED})` : esc(state.location);
}

export function trainerCard(view: RunView, nowMs: number): string {
  if (view.start === null) return `<p>${NO_DATA}</p>`;
  const state = view.state;
  const badges =
    state === null
      ? NO_DATA
      : Array.from({ length: BADGES }, (_, i) => `<i class="${i < state.badges.length ? "got" : ""}" title="${esc(state.badges[i] ?? "")}"></i>`).join("");
  return (
    (view.legacyState ? '<p class="nodata">Historical vendor readout; accurate state unavailable for this run.</p>' : "") +
    kv([
      ["TIME", hms(wallSeconds(view, nowMs))],
      ["PLAY", state === null ? NO_DATA : state.play_time_s === null ? NOT_STARTED : hms(state.play_time_s)],
      ["MAP", state === null ? NO_DATA : place(state)],
      ["MONEY", state === null ? NO_DATA : state.money === null ? NOT_STARTED : `₽${num(state.money)}`],
      ["TURN", String(view.turn)],
      ...(state?.active_ui == null ? [] : [["INTERFACE", esc(state.active_ui.phase)], ...(state.active_ui.value == null ? [] : [["VALUE", esc(state.active_ui.value)]]), ["SELECTION", esc(state.active_ui.selected ?? "unavailable")], ["INPUT", state.active_ui.ready === null ? "unavailable" : state.active_ui.ready ? "ready" : "not ready"], ...(state.active_ui.diagnostic === null ? [] : [["STATE COVERAGE ERROR", esc(state.active_ui.diagnostic)]])] as [string, string][]),
      ...(state?.naming == null ? [] : [["NAME ENTRY", esc(state.naming.text || "(empty)")], ["CURSOR", esc(`${state.naming.page}: ${state.naming.key} (${String(state.naming.column)},${String(state.naming.row)})`)]] as [string, string][]),
      ["CONTROLS", state?.field_controls_locked === true ? "locked" : state?.field_controls_locked === false ? "available" : NO_DATA],
    ]) + `<div class="badges">${badges}</div>`
  );
}

function level(fraction: number): string {
  return fraction > 0.8 ? "low" : fraction > 0.55 ? "mid" : "";
}

function hpLevel(fraction: number): string {
  return fraction < 0.25 ? "low" : fraction < 0.5 ? "mid" : "";
}

export function party(view: RunView): string {
  if (view.state === null) return `<p>${NO_DATA}</p>`;
  if (view.state.party.length === 0) return '<p class="nodata">no Pokémon yet</p>';
  return `<div class="party">${view.state.party
    .map((mon) => {
      const fraction = mon.max_hp === 0 ? 0 : mon.hp / mon.max_hp;
      return `<div class="pm"><span>${esc(mon.species)}</span><span>Lv${String(mon.level)} · ${String(mon.hp)}/${String(mon.max_hp)}</span><div class="hpbar"><i class="${hpLevel(fraction)}" style="width:${(fraction * 100).toFixed(0)}%"></i></div></div>`;
    })
    .join("")}</div>`;
}

function budgetBar(label: string, fraction: number, value: string): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return `<div class="row"><span class="l">${label}</span><div class="budget-track"><i class="${level(clamped)}" style="width:${(clamped * 100).toFixed(0)}%"></i></div><span class="v">${value}</span></div>`;
}

function budgetMissing(label: string, text: string): string {
  return `<div class="row"><span class="l">${label}</span><span class="v">${text}</span></div>`;
}

export function budgets(view: RunView, nowMs: number): string {
  const start = view.start;
  if (start === null) return `<p>${NO_DATA}</p>`;
  const rows: string[] = [];
  const window = start.model.context_window;
  rows.push(
    view.context === null
      ? budgetMissing("CONTEXT", NO_DATA)
      : budgetBar("CONTEXT", view.context.est_tokens / window, `${num(view.context.est_tokens)} / ${num(window)}`),
  );
  rows.push(
    view.disk === null
      ? budgetMissing("DISK", NO_DATA)
      : budgetBar("DISK", view.disk.bytes / view.disk.cap_bytes, `${(view.disk.bytes / MB).toFixed(1)} MB / ${String(Math.round(view.disk.cap_bytes / MB))} MB`),
  );
  rows.push(
    view.retry === null
      ? budgetMissing("RETRIES", '<span class="nodata">no retries yet</span>')
      : budgetBar("RETRIES", view.retry.attempt / view.retry.limit, `${String(view.retry.attempt)} / ${String(view.retry.limit)}`),
  );
  const { max_turns, max_tokens, max_wall_ms } = start.budgets;
  if (max_turns !== undefined) rows.push(budgetBar("TURNS", view.turn / max_turns, `${String(view.turn)} / ${num(max_turns)}`));
  if (max_tokens !== undefined) {
    const used = view.tokens.input + view.tokens.output;
    rows.push(budgetBar("TOKENS", used / max_tokens, `${num(used)} / ${num(max_tokens)}`));
  }
  if (max_wall_ms !== undefined) {
    const wall = wallSeconds(view, nowMs);
    rows.push(budgetBar("WALL", (wall * 1000) / max_wall_ms, `${hms(wall)} / ${hms(max_wall_ms / 1000)}`));
  }
  return `<div class="llmmix">${rows.join("")}</div>`;
}

export function counters(view: RunView): string {
  if (view.start === null) return `<p>${NO_DATA}</p>`;
  const lat = view.latencies;
  const latency =
    lat.length === 0
      ? NO_DATA
      : `${((lat.at(-1) ?? 0) / 1000).toFixed(1)}s · avg ${(lat.reduce((a, b) => a + b, 0) / lat.length / 1000).toFixed(1)}s`;
  const stuck = view.stuck;
  return kv([
    ["MODEL", esc(view.start.model.id)],
    ["TOKENS", num(view.tokens.input + view.tokens.output)],
    ["TOK/S", view.lastTps === null ? NO_DATA : view.lastTps.toFixed(1)],
    ["LATENCY", latency],
    ["LOCATION", view.state === null ? NO_DATA : place(view.state)],
    ["INVALID CALLS", String(view.retry?.count ?? 0)],
    ["TOOL ERRORS", String(view.toolErrors), view.toolErrors > 0],
    ["COMPACTIONS", String(view.compactions)],
    ["MODEL ERRORS", String(view.modelErrors), view.modelErrors > 0],
    ["STUCK", stuck === null ? NO_DATA : `${String(stuck.now)} · max ${String(stuck.max)}`, (stuck?.now ?? 0) >= 3],
  ]);
}

const splitName = (name: string): string => esc(name.replace(/_/g, " ").toLowerCase()) + (name === "PLAYER_NAME_SET" ? " (gameplay start)" : "");

function deltaSpan(seconds: number): string {
  return `<span class="${seconds <= 0 ? "d-ahead" : "d-behind"}">${signedDelta(seconds)}</span>`;
}

export function splits(view: RunView, baseline: Baseline | null, nowMs: number, best: Baseline | null = null): { summary: string; table: string } {
  const startMs = view.startMs;
  if (startMs === null) return { summary: "no data", table: `<p>${NO_DATA}</p>` };
  const reached = new Map(view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => [m.name, (m.ms - startMs) / 1000]));
  const reference = (run: Baseline | null) => new Map(run?.milestones.map((m) => [m.name, m]) ?? []);
  const bases = reference(baseline), bests = reference(best);
  const names = new Set<string>([...MILESTONE_ORDER, ...reached.keys(), ...bases.keys(), ...bests.keys()]);
  const elapsed = wallSeconds(view, nowMs);
  const newStory = new Set(["PLAYER_NAME_CONFIRMED", "FIRST_TRUCK_EXIT", "MOM_CLOCK_INSTRUCTION", "MOM_RIVAL_INSTRUCTION", "RIVAL_MET", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_GYM_COMPLETE", "ROCK_TOMB_RECEIVED"]);
  const supported = (name: string) => name === "NEW_GAME_CREATED" ? view.start?.harness_features.includes("new-game-created-v1") === true || reached.has(name) : !newStory.has(name) || view.start?.harness_features.includes("story-milestones-v2") === true || reached.has(name);
  const present = new Set(view.milestones.filter((m) => m.origin === "present_at_start").map((m) => m.name));
  const next = [...names].find((name) => supported(name) && !reached.has(name) && !present.has(name));
  const cell = (name: string, at: number | undefined, refs: ReturnType<typeof reference>) => {
    const target = refs.get(name);
    if (target === undefined) return '<td class="d nodata">—</td>';
    const time = target.offsetMs / 1000;
    const note = target.derived === true ? "First recorded RAM observation (upper bound)" : "Recorded milestone";
    return `<td class="d" title="${note}">${hms(time)}${at === undefined ? "" : `<br>${deltaSpan(at - time)}`}</td>`;
  };
  const rows = [...names].map((name) => {
    const at = reached.get(name);
    const current = view.milestones.find((m) => m.name === name);
    const cls = at !== undefined ? "done" : name === next ? "next" : "todo";
    const time = present.has(name) ? "already<br>present" : !supported(name) ? "not<br>recorded" : at !== undefined ? hms(at) : view.end === null && cls === "next" ? `${hms(elapsed)}…` : "—";
    const note = current?.derived === true ? ' title="First recorded RAM observation (upper bound)"' : "";
    return `<tr class="${cls}"><td class="n">${splitName(name)}${current?.derived === true ? "*" : ""}</td><td class="t"${note}>${time}</td>${cell(name, at, bases)}${cell(name, at, bests)}</tr>`;
  });
  const summary = `${String(view.milestones.filter((m) => m.origin !== "present_at_start").length)} reached${next === undefined ? "" : ` · next ${splitName(next)}`} · ${baseline === null ? "no baseline" : "vs baseline"}${best === null ? "" : " + best"}`;
  const labels = `<p class="comparison-note">Baseline: ${baseline === null ? "none eligible" : esc(baseline.run)}<br>Best historical run: ${best === null ? "none eligible" : esc(best.run)}<br>Same start; harness versions may differ. Best = furthest progress, then fastest to that point. — = not recorded/reached; no delta until reached. * = clock confirmed by recorded RAM state, time is an upper bound.</p>`;
  return { summary, table: `${labels}<table class="splits"><thead><tr><th>Milestone</th><th>Current</th><th>Baseline<br>time / Δ</th><th>Best<br>time / Δ</th></tr></thead><tbody>${rows.join("")}</tbody></table>` };
}

export function thinkingDialog(view: RunView, nowMs: number): { head: string; body: string } {
  if (view.start === null) return { head: "NO RUN", body: NO_DATA };
  if (view.start.harness_features.includes("probe")) {
    const last = view.events.findLast((event) => event.type === "tool_result");
    return { head: `MANUAL PROBE · step ${String(view.turn)}`, body: last?.type === "tool_result" ? esc(last.text) : NO_DATA };
  }
  if (view.isThinking && view.turnStartMs !== null) {
    const { thinking, text } = view.streaming;
    const reply = text === "" ? "" : `<span class="reply">${esc(text)}</span>`;
    return {
      head: `AGENT is thinking… ${((nowMs - view.turnStartMs) / 1000).toFixed(1)}s`,
      body: `${esc(thinking)}${reply}<span class="cursor"></span>`,
    };
  }
  const thought = view.lastThought;
  if (thought === null) return { head: view.end === null ? "AGENT is waiting…" : `RUN ENDED · ${view.end.reason}`, body: NO_DATA };
  const head = `AGENT thought for ${(thought.latencyMs / 1000).toFixed(1)}s · turn ${String(thought.turn)}`;
  if (thought.thinking !== "") return { head, body: esc(thought.thinking) };
  return { head, body: `<span class="nodata">no thinking recorded</span> ${esc(thought.reply)}` };
}

function chip(button: string): string {
  return `<span class="chipb">${ARROW[button] ?? ""}${button}</span>`;
}

function rowBody(event: RunEvent, view?: RunView): string | null {
  switch (event.type) {
    case "assistant": return `${event.thinking === "" ? "response" : "thinking"} · turn ${String(event.turn)}: ${esc((event.thinking || event.text || "no text recorded").slice(0, 200))}`;
    case "objective_update": return `${esc(event.objective.status)}: ${esc(event.objective.title)}`;
    case "objective_attempt": return `${esc(event.attempt.buttons.join(", "))}: ${esc(event.attempt.outcome)}${event.attempt.warning === null ? "" : ` · ${esc(event.attempt.warning)}`}`;
    case "tool_call":
      return `${esc(event.name)}(${esc(JSON.stringify(event.args))})`;
    case "tool_result": {
      const frames = event.frames.map((frame) => ` · ${esc(frame.path)}`).join("");
      return `${event.is_error ? "ERROR" : "ok"} ${String(event.duration_ms)}ms → ${esc(event.text.slice(0, 200))}${frames}`;
    }
    case "button_press": {
      const chips = event.buttons.map(chip).join("");
      if (event.hold_frames === undefined) {
        return `${chips} timing not logged (assumed hold ${String(ASSUMED_TIMING.hold_frames)}f · release ${String(ASSUMED_TIMING.release_frames)}f)`;
      }
      return `${chips} hold ${String(event.hold_frames)}f · release ${String(event.release_frames ?? 0)}f`;
    }
    case "milestone":
      return `★ ${esc(event.name)}${event.kind === undefined ? "" : ` · ${event.kind}`}${event.origin === "present_at_start" ? " · already present when run started" : ""}${event.evidence === undefined ? "" : ` · evidence ${event.evidence.map((seq) => `#${String(seq)}`).join(", ")}`}`;
    case "loop_guard":
      return view === undefined ? `Loop ${esc(event.kind)} ${esc(event.phase)}: ${esc(event.message)} · evidence ${event.evidence.map(seq=>`#${String(seq)}`).join(", ")}` : esc(view.loopLabel(event));
    case "retry":
      return `✗ retry ${String(event.attempt)}/${String(event.limit)}: ${esc(event.reason)}`;
    case "telemetry_error":
      return `✗ ${event.source} read failed: ${esc(event.message)}`;
    case "compaction":
      return `context compacted ${num(event.from_tokens)} → ${num(event.to_tokens)} tokens`;
    case "disk_usage":
      return `frames at ${String(event.percent)}% of the ${String(Math.round(event.cap_bytes / MB))} MB cap`;
    case "frames_evicted":
      return `evicted ${String(event.files)} frames (${(event.bytes / 1024).toFixed(1)} KB) from ${esc(event.from_run)}`;
    case "run_end":
      return `run ended: ${event.reason} · furthest ${esc(event.furthest_milestone ?? "none")} · ${String(event.turns)} turns`;
    default:
      return null;
  }
}

export function actionRow(event: RunEvent, view?: RunView): string | null {
  const body = rowBody(event, view);
  if (body === null) return null;
  const error = (event.type === "tool_result" && event.is_error) || event.type === "retry" || (event.type === "loop_guard" && event.phase !== "recovered") || event.type === "telemetry_error" ? " ev-error" : "";
  return `<div class="ev ev-${event.type}${error}" data-seq="${String(event.seq)}"><span class="seq">#${String(event.seq)}</span><span class="tag">${event.type}</span><span class="body">${body}</span></div>`;
}

export function inspector(event: RunEvent | undefined): string {
  if (event === undefined) return '<p class="nodata">click a log row to see its raw event</p>';
  const record = event as unknown as Record<string, unknown>;
  const sections = ["thinking", "text", "message", "reason", "system_prompt"].flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.trim() !== ""
      ? [`<section class="event-content"><h4>${esc(key.replaceAll("_", " "))}</h4>${richText(value)}</section>`]
      : [];
  });
  const data = ["args", "objective", "attempt"].flatMap((key) => record[key] === undefined ? [] : [`<section class="event-content"><h4>${esc(key)}</h4>${dataHtml(record[key])}</section>`]);
  return `<header class="event-heading">#${String(event.seq)} · ${esc(event.type)} · turn ${String(event.turn)}</header>${sections.join("")}${data.join("")}<details class="raw-event"${sections.length + data.length === 0 ? " open" : ""}><summary>Raw event JSON</summary>${jsonHtml(event)}</details>`;
}

export function brand(view: RunView): string {
  return `POKéNAV · ${view.start?.run ?? "NO RUN"}`;
}

export function fieldContext(view: RunView): string {
  const context = view.state?.world_context;
  const story = view.state?.story;
  const storyText = story == null ? "Story state: not recorded for this run." : "Story state (game memory):\n" + Object.entries(story).map(([field, value]) => `${field.replaceAll("_", " ")}: ${value === null ? "unknown" : value === true ? "yes" : value === false ? "no" : String(value)}`).join("\n");
  const storyHtml = `<pre>${esc(storyText)}</pre>`;
  if (context == null) return story == null ? `<p>${NO_DATA}</p>` : storyHtml;
  const objects = context.objects.map((o) => `${o.sprite_kind ?? "unknown sprite"} · map ${String(o.map_id[0])}/${String(o.map_id[1])} object ${String(o.local_id)} at (${String(o.x)},${String(o.y)})`).join("\n");
  const triggers = context.triggers.map((t) => `script tile (${String(t.x)},${String(t.y)}): condition ${t.condition_met === true ? "matches" : t.condition_met === false ? "does not match" : "unavailable"}`).join("\n");
  const dialogue = context.dialogue === null ? "Field-message text unavailable; the box may still be visible." : `Active message buffer (may include text not yet displayed):\n${context.dialogue}`;
  return storyHtml + `<pre>${esc(objects)}\n${esc(triggers)}\n${esc(dialogue)}</pre>`;
}

export function objectiveStatus(objective: NonNullable<RunView["objective"]>): string {
  if (objective.status === "completed") return objective.verification === undefined ? "historical completion (not native verified)" : `game verified (${objective.verification.origin.replaceAll("_", " ")})`;
  return objective.status === "reported_complete" ? "reported complete (provisional local plan)" : objective.status;
}

export function objectivePanel(view: RunView): string {
  const objective = view.objective;
  if (objective === null) return '<p class="nodata">No objective recorded for this run.</p>';
  const history = view.attempts.map((attempt) => `<li>${esc(attempt.buttons.join(", "))}: ${esc(attempt.outcome)} · evidence #${String(attempt.before_seq)}→#${attempt.after_seq === null ? "unavailable" : String(attempt.after_seq)}${attempt.failure_count > 1 ? ` · ${String(attempt.failure_count)} matching failures` : ""}${attempt.warning === null ? "" : `<br>${esc(attempt.warning)}`}${attempt.retry_justification === null ? "" : `<br>Reassessment: ${esc(attempt.retry_justification)}`}</li>`).join("");
  return `<p><strong>${esc(objective.title)}</strong> · ${esc(objectiveStatus(objective))}</p>` + kv([
    ["GOAL", esc(objective.goal)], ["SUPPORTS", esc(objective.supports_goal)],
    ["EVIDENCE", objective.evidence.map((seq) => `#${String(seq)}`).join(", ")],
    ["COMPLETION", esc(objective.completion.kind === "milestone" ? `Native milestone ${objective.completion.name}` : objective.completion.kind === "state" ? `${objective.completion.field} = ${String(objective.completion.value)}` : `${objective.completion.description} (visual report)`)],
    ["OBSTACLE", esc(objective.obstacle || "none recorded")], ["NEXT DECISION", esc(objective.next_decision)],
    ["COMPLETION EVIDENCE", objective.completion_evidence.map((seq) => `#${String(seq)}`).join(", ") || "not completed"],
  ]) + `<details><summary>Attempt history (${String(view.attempts.length)})</summary><ol class="attempts">${history}</ol></details>`;
}
