import type { FeatureInfo } from "@pokebench/agent/features";
// HTML for each panel of the Open PokéNav layout. Every value comes from the
// folded event log; a panel without its data says so instead of guessing.
import type { RunEvent } from "@pokebench/agent/events";
import { esc, hms, num, signedDelta } from "./format.js";
import { dataHtml, jsonHtml, richText } from "./inspectformat.js";
import { ROUTE103_RIVAL_SPLITS } from "./frontier.js";
import { ASSUMED_TIMING, MILESTONE_ORDER, type RunView } from "./model.js";

export const NO_DATA = '<span class="nodata">no data</span>';

const MB = 1024 * 1024;
const BADGES = 8;
const ARROW: Readonly<Record<string, string>> = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→" };

export interface Baseline {
  readonly run: string;
  readonly milestones: readonly { readonly name: string; readonly offsetMs: number; readonly derived?: boolean }[];
}

// Run time against the time cap: operator pauses are excluded.
function wallSeconds(view: RunView, nowMs: number): number {
  if (view.end !== null) return (view.end.wall_ms - view.control.pausedBefore(view.lastMs ?? nowMs)) / 1000;
  return (nowMs - (view.startMs ?? nowMs) - view.control.pausedBefore(nowMs)) / 1000;
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
      const fraction = mon.max_hp == null || mon.hp == null || mon.max_hp === 0 ? 0 : mon.hp / mon.max_hp;
      return `<div class="pm"><span>${esc(mon.species ?? "Unknown Pokémon · harness bug")}</span><span>Lv${String(mon.level)} · ${String(mon.hp)}/${String(mon.max_hp)}</span><div class="hpbar"><i class="${hpLevel(fraction)}" style="width:${(fraction * 100).toFixed(0)}%"></i></div></div>`;
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
  const context = view.contextReadout();
  rows.push(
    context === null
      ? budgetMissing("CONTEXT", NO_DATA)
      : budgetBar("CONTEXT", context.tokens / window, `${context.measured ? "" : "~"}${num(context.tokens)} / ${num(window)}`),
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
  const { max_turns, max_tokens } = start.budgets;
  const max_wall_ms = view.control.maxWallMs ?? start.budgets.max_wall_ms;
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
  return Math.abs(seconds) < 1 ? `<span>${signedDelta(seconds)}</span>` : `<span class="${seconds < 0 ? "d-ahead" : "d-behind"}">${signedDelta(seconds)}</span>`;
}

export function splits(view: RunView, baseline: Baseline | null, nowMs: number, frontier: Baseline | null = null, compact = false): { summary: string; table: string } {
  const startMs = view.startMs;
  if (startMs === null) return { summary: "no data", table: `<p>${NO_DATA}</p>` };
  const reached = new Map(view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => [m.name, (m.ms - startMs - view.control.pausedBefore(m.ms)) / 1000]));
  const reference = (run: Baseline | null) => new Map(run?.milestones.map((m) => [m.name, m]) ?? []);
  const bases = reference(baseline), bests = reference(frontier);
  const names = new Set<string>([...MILESTONE_ORDER, ...reached.keys(), ...bases.keys(), ...bests.keys()]);
  const elapsed = wallSeconds(view, nowMs);
  const newStory = new Set(["PLAYER_NAME_CONFIRMED", "FIRST_TRUCK_EXIT", "MOM_CLOCK_INSTRUCTION", "MOM_RIVAL_INSTRUCTION", "RIVAL_MET", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_GYM_COMPLETE", "ROCK_TOMB_RECEIVED"]);
  const nativeProgress = (name:string) => name.startsWith("ROUTE_102_TRAINER_") || name.startsWith("ROUTE_104_TRAINER_") || ["ROXANNE_DEFEATED","FIRST_POKEMON_CAUGHT","FIRST_POKECENTER_HEAL","FIRST_EVOLUTION"].includes(name);
  const remainingNative = (name:string) => name.startsWith("PETALBURG_WOODS_TRAINER_") || name.startsWith("ROUTE_116_TRAINER_") || ["ROUTE_115", "ROUTE_116", "RUSTURF_TUNNEL"].includes(name);
  const supported = (name: string) => name === "BIRCH_RESCUE_REQUESTED" ? view.start?.harness_features.includes("birch-rescue-requested-v1") === true || reached.has(name) : name === "RIVAL_HOUSE_EXITED" ? view.start?.harness_features.includes("rival-house-exit-v1") === true || reached.has(name) : name === "ROUTE_101_AFTER_HANDOFF" ? view.start?.harness_features.includes("route-101-after-handoff-v1") === true || reached.has(name) : name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK" ? view.start?.harness_features.includes("bedroom-exit-v1") === true || reached.has(name) : ROUTE103_RIVAL_SPLITS.has(name) ? view.start?.harness_features.includes("route103-rival-splits-v1") === true || reached.has(name) : remainingNative(name) ? view.start?.harness_features.includes("remaining-native-milestones-v1") === true || reached.has(name) : nativeProgress(name) ? view.start?.harness_features.includes("native-progress-activity-v1") === true || reached.has(name) : name.startsWith("RUSTBORO_GYM_TRAINER_") ? view.start?.harness_features.includes("rustboro-gym-trainer-milestones-v1") === true || reached.has(name) : ["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED"].includes(name) ? view.start?.harness_features.includes("post-clock-navigation-milestones-v1") === true || reached.has(name) : name === "NEW_GAME_CREATED" ? view.start?.harness_features.includes("new-game-created-v1") === true || reached.has(name) : !newStory.has(name) || view.start?.harness_features.includes("story-milestones-v2") === true || reached.has(name);
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
    const note = current?.derived === true ? ` title="Recovered from recorded game state · evidence ${current.evidence?.map(seq => `#${String(seq)}`).join(", ") ?? `#${String(current.seq)}`} · first observation (upper bound)"` : "";
    return `<tr class="${cls}"><td class="n">${splitName(name)}${current?.derived === true ? "*" : ""}</td><td class="t"${note}>${time}</td>${compact ? "" : `${cell(name, at, bases)}${cell(name, at, bests)}`}</tr>`;
  });
  const summary = `${String(view.milestones.filter((m) => m.origin !== "present_at_start").length)} reached${next === undefined ? "" : ` · next ${splitName(next)}`} · ${baseline === null ? "no baseline" : "vs baseline"}${frontier === null ? "" : " + frontier"}`;
  const labels = `<p class="comparison-note">Baseline: ${baseline === null ? "none eligible" : esc(baseline.run)}<br>Frontier run: ${frontier === null ? "none eligible" : esc(frontier.run)}<br>The baseline shares this run's start. The frontier is the frontier graph's agent frontier: furthest New Game start, then fastest. Harness versions may differ. — = not recorded/reached; no delta until reached. * = recovered from recorded game state; first observation time is an upper bound.</p>`;
  return { summary, table: `${compact ? "" : labels}<table class="splits"><thead><tr><th>Milestone</th><th>Current</th>${compact ? "" : "<th>Baseline<br>time / Δ</th><th>Frontier<br>time / Δ</th>"}</tr></thead><tbody>${rows.join("")}</tbody></table>` };
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
  return `<span class="chipb">${ARROW[button] ?? ""}${esc(button)}</span>`;
}

const CONTROL_ICON = { pause: "⏸", resume: "▶", stop: "■", cancel_stop: "↺", abort: "✖", extend_30m: "＋", extend_60m: "＋" } as const;
function controlRow(event: Extract<RunEvent, { type: "operator_control" }>): string {
  if (event.action === "extend_30m" || event.action === "extend_60m") {
    const limits = event.previous_max_wall_ms !== undefined && event.max_wall_ms !== undefined ? ` · ${hms(event.previous_max_wall_ms / 1000)} → ${hms(event.max_wall_ms / 1000)}` : "";
    return `＋ Extend ${event.action === "extend_30m" ? "30 minutes" : "1 hour"} · ${esc(event.status)}${limits} · original evaluation horizon unchanged · request ${String(event.request)}`;
  }
  const name = event.action.replace("_", " ");
  const status = event.status === "pending" ? "requested" : event.status === "failed" ? "FAILED" : event.status;
  const detail = event.status === "failed" ? " · emulator still frozen; the run stays paused" : event.status === "pending"
    ? event.action === "stop" ? " · ends after the current turn" : " · holds before the next model call"
    : `${event.paused_ms === undefined ? "" : ` · paused ${String(Math.round(event.paused_ms / 1000))}s`}${event.emulator_frozen === undefined ? "" : event.emulator_frozen ? " · emulator frozen" : " · emulator NOT frozen"}`;
  return `${CONTROL_ICON[event.action]} ${name} ${status}${detail} · request ${String(event.request)}`;
}

export function eventText(event: RunEvent, view?: RunView): string | null {
  switch (event.type) {
    case "assistant": return `${event.thinking === "" ? "response" : "thinking"} · turn ${String(event.turn)}: ${esc((event.thinking || event.text || "no text recorded").slice(0, 200))}`;
    case "operator_control": return controlRow(event);
    case "objective_update": return `${esc(event.objective.status)}: ${esc(event.objective.title)}`;
    case "objective_attempt": return `${esc(event.attempt.buttons.join(", "))}: ${esc(event.attempt.outcome)}${event.attempt.warning === null ? "" : ` · ${esc(event.attempt.warning)}`}`;
    case "tool_call":
      return `${esc(event.name)}(${esc(JSON.stringify(event.args))})`;
    case "tool_result": {
      const frames = event.frames.map((frame) => ` · ${esc(frame.path)}`).join("");
      return `${event.is_error ? "ERROR" : "ok"} ${String(event.duration_ms)}ms → ${esc(event.text.slice(0, 200))}${frames}`;
    }
    case "navigation_context":return `Navigation memory delivered · ${String(event.evidence.length)} retained references · ${esc(event.text.slice(0,200))}`;
    case "milestone_hint":return `Milestone hint sent to the model · ${esc(event.text)}`;
    case "dialogue_auto_advance":return `Dialogue auto-advance (${event.tool}) · B ×${String(event.auto_presses)}${event.battle_auto_presses===undefined?"":` (${String(event.battle_auto_presses)} in battle)`} · stopped: ${esc(event.stop.replaceAll("_"," "))} · ${esc(event.detail)}${event.dropped.length===0?"":` · ${String(event.dropped.length)} requested inputs not sent (${esc(event.dropped.join(", "))})`} · ${String(event.pages.length)} pages${event.pages.map((page,i)=>` · ${String(i+1)}. ${page.battle_turn===undefined?"":`battle turn ${String(page.battle_turn)}: `}${page.speaker===null?"":`${esc(page.speaker)}${page.speaker_source==="faced_sprite"?" (sprite kind)":page.speaker_source==="faced_target"?" (faced object)":""}: `}“${esc(page.text)}”`).join("")}`;
    case "loop_breaker":return event.stage===1?`Loop breaker stage 1 · ${String(event.collapsed)} duplicate ${event.collapsed===1?"turn":"turns"} left out of the request (${String(event.repeats)} identical ${event.trigger==="no_tool_call"?"replies with no tool call":"turns"} in a row)`:`Loop breaker stage 2 note sent to the model (${event.trigger==="no_tool_call"?"reply with no tool call":"fixed point"}, ${String(event.repeats)} in a row) · ${esc(event.text??"")}`;
    case "auto_talk":return `Loop breaker stage 3 auto-talk (${event.trigger==="no_tool_call"?"replies with no tool call":"fixed point"}, ${String(event.repeats)} in a row) · ${event.outcome==="talked"?"talked to":event.outcome==="unreachable"?"could not reach":event.outcome==="none"?"no one untalked on this map":"the field was not free"}${event.target===null?"":` ${esc(event.target.name)} at (${String(event.target.x)},${String(event.target.y)})`} · ${String(event.walks)} walks, ${String(event.tried)} tried${event.text===null?"":` · ${esc(event.text)}`}`;
    case "unfinished_activity":return `Unfinished activity ${event.change} · ${esc(event.trainer)} (trainer ${String(event.trainer_id)}) · map ${String(event.map_id[0])}/${String(event.map_id[1])} · ${esc(event.text)}`;
    case "stall_gate":return `Stall briefing held (${event.kind==="map_cycle"?"map back-and-forth":"milestone drought"}, level ${String(event.level)}) · ${esc(event.character)} ${event.reason==="untalked"?"is on this map and has not been talked to since the last story milestone":"is getting closer"} · map ${String(event.map_id[0])}/${String(event.map_id[1])}`;
    case "people_id_card":return `ID card added to the ${esc(event.tool)} result (${event.reason==="first"?"first sight":"back in view, card changed"}) · ${esc(event.key)} · ${esc(event.text)}`;
    case "low_hp_trainer_warning":return `Low-HP trainer warning added to the ${esc(event.tool)} result · ${esc(event.species)} ${String(event.hp)}/${String(event.max_hp)} HP · rival ${esc(event.rival)} at (${String(event.x)},${String(event.y)}) · ${esc(event.text)}`;
    case "heal_before_trainers_warning":return `Heal before trainers warning added to the ${esc(event.tool)} result · ${event.trainers.map(t=>`object ${String(t.local_id)} ${esc(t.sprite_kind??"unknown")} at (${String(t.x)},${String(t.y)})`).join(", ")} · ${event.heal===null?"no healing place named":`${event.heal.kind==="pokemon_center"?"POKéMON CENTER":"home"} in ${esc(event.heal.town)}, ${String(event.heal.hops)} map changes`} · ${esc(event.text)}`;
    case "story_battle_warning":return `Story battle warning added to the ${esc(event.tool)} result · ${esc(event.opponent)}${event.x===null||event.y===null?"":` at (${String(event.x)},${String(event.y)})`} · ${event.party.map(p=>`${esc(p.species)} ${String(p.hp)}/${String(p.max_hp)}`).join(", ")} · ${esc(event.text)}`;
    case "story_goal_away":return `Story goal walk-away note added to the ${esc(event.tool)} result · ${esc(event.speaker)}, turn ${String(event.line_turn)} · ${event.steps.map(st=>st.measure==="tiles"?`${esc(st.to_name)} (${String(st.from.x)},${String(st.from.y)}) → (${String(st.to.x)},${String(st.to.y)}): ${String(st.before)} → ${String(st.after)} tiles`:`${esc(st.from_name)} → ${esc(st.to_name)}: ${String(st.before)} → ${String(st.after)} maps`).join("; ")} · ${esc(event.text)}`;
    case "destination_citation":return `navigate_to because ${event.verdict==="found"?`found in the turn ${String(event.found_turn ?? 0)} result`:event.verdict==="not_found"?"not found in anything shown":"too short to check"} · to (${String(event.x)},${String(event.y)}) on map ${String(event.map_id[0])}/${String(event.map_id[1])} · “${esc(event.because)}”${event.text===null?"":` · ${esc(event.text)}`}`;
    case "text_only_supervisor":return `Text-only supervisor note ${String(event.note)}/${String(event.limit)} sent after ${String(event.replies)} replies with no tool call · ${esc(event.text)}`;
    case "ledger_context":return `Instruction ledger delivered · ${String(event.evidence.length)} references · ${esc(event.text.slice(0,200))}`;
    case "belief_ledger":return `Disproved beliefs ledger delivered · ${String(event.entries)} entr${event.entries===1?"y":"ies"} · ${String(event.evidence.length)} references · ${esc(event.text)}`;
    case "decision_input":return `snapshot for decision ${String(event.decision_turn)} · state #${String(event.state_seq)} · ${esc(event.text.slice(0,200))}`;
    case "wait_input":return `WAIT ${String(event.duration_ms)} ms (host time) · action ${esc(event.tool_call_id)}`;
    case "button_press": {
      const chips = event.buttons.map(chip).join("");
      if (event.hold_frames === undefined) {
        return `${chips} timing not logged (assumed hold ${String(ASSUMED_TIMING.hold_frames)}f · release ${String(ASSUMED_TIMING.release_frames)}f)`;
      }
      return `${chips} hold ${String(event.hold_frames)}f · release ${String(event.release_frames ?? 0)}f`;
    }
    case "battle_choice": {
      const move=event.move;const target=event.target;
      const choice=move?.name??(event.action==="switch"?`switch to party slot ${String((event.switch_party_slot??0)+1)}`:event.action==="item"?`item #${String(event.item_id)}`:event.action);
      return `Battle ${String(event.battle)} · turn ${String(event.battle_turn)} · ${"species" in event.actor?`${esc(event.actor.species)} Lv${String(event.actor.level)}`:"Trainer"} chose ${esc(choice)}${target===null?"":` → ${esc(target.species)} Lv${String(target.level)}`}${move===null?"":` · PP ${String(move.pp)}`} · ${esc(event.origin)} · committed frame ${String(event.frame)} · execution unobserved`;
    }
    case "native_action": return `${esc(event.kind.replaceAll("_"," "))} · ${esc(JSON.stringify(event.details))} · frame ${String(event.frame)} (first observed)`;
    case "activity": {
      const pokemon=event.pokemon;
      const detail=pokemon===undefined?"":` · ${esc(pokemon.species)} Lv${String(pokemon.from_level)}→${String(pokemon.to_level)}`;
      return `${esc(event.kind.replaceAll("_"," "))} ×${String(event.count)}${detail} · evidence ${event.evidence.map(seq=>`#${String(seq)}`).join(", ")} · first observation (upper bound)`;
    }
    case "milestone":
      return `★ ${esc(event.name)}${event.kind === undefined ? "" : ` · ${event.kind}`}${event.origin === "present_at_start" ? " · already present when run started" : ""}${event.evidence === undefined ? "" : ` · evidence ${event.evidence.map((seq) => `#${String(seq)}`).join(", ")}`}`;
    case "loop_guard":
      return view === undefined ? `Loop ${esc(event.kind.replaceAll("_"," "))} ${esc("mode" in event && event.mode === "diagnostic" ? `diagnostic: ${event.phase.replace("_", " ")}` : event.phase)}: ${esc(event.message)} · evidence ${event.evidence.map(seq=>`#${String(seq)}`).join(", ")}` : esc(view.loopLabel(event));
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
      return `run ended: ${event.reason}${event.target_proof===undefined?"":` · native target ${esc(event.target_proof.name)} · milestone #${String(event.target_proof.milestone_seq)} · state evidence ${event.target_proof.state_evidence.map(seq=>`#${String(seq)}`).join(", ")}`} · furthest ${esc(event.furthest_milestone ?? "none")} · ${String(event.turns)} turns`;
    default:
      return null;
  }
}

export function inspector(event: RunEvent | undefined): string {
  if (event === undefined) return '<p class="nodata">select a trace row to see its complete recorded events</p>';
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
  const evaluation = view.start?.evaluation;
  const experiment = evaluation?.experiment;
  const label = experiment !== undefined ? ` · EXPERIMENT ${experiment.id} · ARM ${experiment.arm} · TRIAL ${String(experiment.trial)}/${String(experiment.of)}` : evaluation !== undefined ? ` · PRESET ${evaluation.preset_id}` : "";
  return `POKéNAV · ${view.start?.run ?? "NO RUN"}${label}`;
}

// The header strip: which experiment, arm and trial (or preset) is on screen.
export function runIdentity(view: RunView): string {
  const start = view.start;
  if (start === null) return "";
  const cell = (label: string, value: string, cls = "", extra = ""): string => `<div class="id-cell${cls}"><small>${label}</small><span>${esc(value)}</span>${extra}</div>`;
  const evaluation = start.evaluation;
  const experiment = evaluation?.experiment;
  const cells: string[] = [];
  if (experiment !== undefined) {
    const dots = Array.from({ length: experiment.of }, (_, i) => `<i class="${i + 1 < experiment.trial ? "done" : i + 1 === experiment.trial ? "now" : ""}"></i>`).join("");
    cells.push(cell("EXPERIMENT", experiment.id, " id-exp"), cell("ARM", experiment.arm, " id-arm"), cell("TRIAL", `${String(experiment.trial)} of ${String(experiment.of)}`, "", `<div class="trial-dots" title="trial ${String(experiment.trial)} of ${String(experiment.of)}">${dots}</div>`));
  } else if (evaluation !== undefined) {
    cells.push(cell("PRESET", evaluation.preset_id, " id-exp"));
  }
  cells.push(cell("MODEL · THINKING", `${start.model.id} · ${start.sampling.thinking_level}`), cell("RUN", `…${start.run.slice(-4)}`));
  return cells.join("");
}

export function fieldContext(view: RunView): string {
  const context = view.state?.world_context;
  const story = view.state?.story;
  const storyText = story == null ? "Story state: not recorded for this run." : "Story state (game memory):\n" + Object.entries(story).map(([field, value]) => `${field.replaceAll("_", " ")}: ${value === null ? "unknown" : value === true ? "yes" : value === false ? "no" : String(value)}`).join("\n");
  const topology=view.state?.topology;
  const topologyText=topology==null ? "" : `Map bounds: X=0..${String(topology.width-1)}, Y=0..${String(topology.height-1)}\n${topology.connections.map(c=>`${c.direction} → ${c.destination_name}; offset ${String(c.offset)}`).join("\n")}\nMap connections are conditional; terrain and story state may block passage.`;
  const storyHtml = `<pre>${esc(storyText)}</pre>` + (topologyText===""?"":`<pre>${esc(topologyText)}</pre>`);
  if (context == null) return story == null && topology == null ? `<p>${NO_DATA}</p>` : storyHtml;
  const objects = context.objects.map((o) => `${o.sprite_kind ?? "unknown sprite"} · map ${String(o.map_id[0])}/${String(o.map_id[1])} object ${String(o.local_id)} at (${String(o.x)},${String(o.y)})`).join("\n");
  const triggers = context.triggers.map((t) => `script tile (${String(t.x)},${String(t.y)}): condition ${t.condition_met === true ? "matches" : t.condition_met === false ? "does not match" : "unavailable"}`).join("\n");
  const dialogue = context.dialogue === null ? "Field-message text unavailable; the box may still be visible." : `Active message buffer (may include text not yet displayed):\n${context.dialogue}`;
  const diagnostic=context.message_diagnostic === undefined ? "" : `\nSTATE COVERAGE ERROR: ${context.message_diagnostic}`;
  const activity=context.field_activity === undefined ? "" : `\nField activity: ${context.field_activity.phase}; not an input-ready field message; owner 0x${context.field_activity.owner.toString(16).toUpperCase()}`;
  const message=context.message == null ? "" : `\nField-message phase: ${context.message.phase}; buffer cursor ${String(context.message.cursor)}; advance input ${context.message.ready ? "ready" : "not ready"}`;
  return storyHtml + `<pre>${esc(objects)}\n${esc(triggers)}\n${esc(dialogue)}${esc(message)}${esc(activity)}${esc(diagnostic)}</pre>`;
}

// Viewer reference summaries, source-checked against game-tools.ts,
// navigation.ts, navigation-memory.ts, objective-tools.ts and state-decision.ts.
// Historical run headers contain tool names, not versioned tool schemas.
const TOOL_REFERENCE: Readonly<Record<string, readonly [description:string, inputs:string, outputs:string, example:string]>> = {
 choose_evolution:["Choose whether the current POKéMON evolution completes or stops; neither option is recommended.","decision: required evolve or cancel. Acts only at a fresh native cancellation window.","The submitted choice, native outcome when verified, and a fresh screenshot/readout. Refuses when no eligible evolution is waiting.",'{"decision":"evolve"}'],
 observe: ["Inspect the current game. With battle-decision-ready-v1, pending ordinary battle text advances to the next choice.", "None. Send an empty object {}.", "A 240×160 screenshot plus observation text. State/map detail depends on the run’s observation switches; decoded state is retained in tool details.", '{}'],

 press: ["Press Game Boy Advance buttons in order, then inspect the result. Buttons are contextual to the current screen.", "buttons: required array of 1–8 values: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. walking: optional boolean; true suppresses automatic running. Interface safety may submit only the first requested button.", "A fresh screenshot and observation text, submitted-button acknowledgement, and optional before/after feedback. State is retained in tool details. Invalid requests or server failures return errors.", '{"buttons":["RIGHT"],"walking":true}'],
 navigate_to: ["Walk toward a model-chosen coordinate on the current map using A*. It does not press A or choose a destination.", "x, y: required nonnegative integers. map_id: required [group, number], each integer 0–255, matching the current map. walking: optional boolean. Local mode allows up to 8 button attempts; whole-map mode and terrain support depend on enabled features.", "Navigation status and button-attempt count, final observation/screenshot, and details containing state plus navigation {status, commands, target}. May stop before arrival on a lock, blocked movement or map change.", '{"x":5,"y":1,"map_id":[1,2]}'],
 navigate_to_target: ["Navigate to one game-owned person, object, interaction, warp, or walking connection, then activate it once.", "map_id: required current [group, number]. target: one listed identity: object local_id; interaction kind plus x/y; warp x/y; or connection direction.", "Selected identity, interruption or activation status, final observation, and details containing verified state plus semantic_navigation. Battle, dialogue, menus, scripts, forced movement, unavailable field ownership, and map changes return control immediately.", '{"map_id":[1,2],"target":{"kind":"object","local_id":3}}'],
 explore_map: ["Deterministically select and try one reachable, not-yet-attempted interaction or walking connection on the current map.", "None. Send an empty object {}.", "The delegated semantic-navigation result for exactly one target. Interruptions return immediately; a target is remembered as attempted only once activation was attempted.", '{}'],
 note_contradiction: ["Record that the game differed from what the model expected. It is pinned in the instruction ledger and changes nothing in the game.", "expected: required, 1–200 characters. observed: required, 1–300 characters. evidence: 1–4 event numbers the model was shown (delivered states or dialogue).", "A confirmation line. Unknown evidence or empty text is rejected; the ledger keeps the newest 8 contradictions.", '{"expected":"The person here would be the professor","observed":"The object at 10,8 is SCIENTIST_1","evidence":[4803]}'],
 get_next_milestone: ["HINT ARM: name the next main story milestone the game has not recorded yet. Presses nothing.", "No inputs.", "The next milestone in plain words and how many of the main-path milestones to the first badge are done.", '{}'],
 recall_dialogue: ["Search every dialogue page the model was shown this run. Reads past observations only; presses nothing.", "contains: optional words, up to 80 characters, case-insensitive. room: optional location-name text, up to 80 characters. last: optional integer 1–20, default 8.", "Quoted pages, newest first, each with event number, turn, location, position and the faced character when the readout named one. Replies stay under 6,000 characters and say how many pages matched, were shown and were omitted.", '{"contains":"neighbor","last":5}'],
 remember_destination: ["Retain a destination hypothesis across context pruning. This does not select a route or prove completion.", "destination: required string, 1–300 characters. evidence: required array of 1–4 distinct nonnegative event IDs known to the navigation ledger.", "Text acknowledgement: Retained MODEL HYPOTHESIS: followed by the destination. Unknown or unsuitable evidence is rejected.", '{"destination":"Inspect the observed doorway","evidence":[42]}'],
 get_objectives: ["Read the fixed goal, current objective and full attempt history.", "None. Send an empty object {}.", "JSON text containing goal, native_catalog, objective and attempts. The objective can be null when none is set.", '{}'],
 set_objective: ["Select a native milestone task or propose a provisional local plan using observed evidence. Completion behavior depends on the recorded objective features.", "Required fields: title, supports_goal, evidence, completion, obstacle, next_decision. Title/supports_goal/next_decision: 1–2000 characters; obstacle: up to 2000. evidence: 1–16 distinct nonnegative event IDs. completion: {kind: milestone, name}, {kind: state, field, value}, or {kind: visual, description}. State values must match the field type: started/in_battle boolean; money/party_count number; screen/name/location/badge string. Milestone names must belong to the native catalog.", "JSON text of the objective record, including ID/revision, goal, plan, status, evidence and completion evidence. Native task titles/verification are harness-owned when native completion is enabled; invalid inputs/evidence are rejected.", '{"title":"Confirm the player name","supports_goal":"Advance the opening","evidence":[42],"completion":{"kind":"milestone","name":"PLAYER_NAME_CONFIRMED"},"obstacle":"","next_decision":"Inspect the current naming screen"}'],
 update_objective: ["Revise the active objective’s status, obstacle, next decision and evidence. A retry reason supports a reassessed attempt where the repeat guard applies.", "Required fields: status (active, blocked, completed or reported_complete), evidence (1–16 distinct nonnegative event IDs), obstacle, next_decision, retry_reason. Text fields: up to 2000 characters; next_decision must be nonempty. Completion claims remain subject to native verification and objective rules.", "JSON text of the updated objective record. Invalid evidence, status transitions or unsupported completion claims return errors; this tool does not grade the benchmark itself.", '{"status":"active","evidence":[42],"obstacle":"Movement was blocked","next_decision":"Inspect another approach","retry_reason":""}'],
 act: ["Choose one action from the current snapshot in state-only decision mode.", "Either {kind: press, buttons: [1–8 supported buttons]} or {kind: wait, duration_ms: integer 1–2000}. Do not combine buttons and duration_ms. Waiting measures host time, not guaranteed emulator frames.", "A fresh screenshot and observation text with press feedback or a wait acknowledgement; state is retained in tool details. A fresh snapshot is also supplied for the next decision; invalid action shapes are rejected.", '{"kind":"wait","duration_ms":100}'],
};

function toolReference(name:string,automaticRunning:boolean):string {
 const base=Object.hasOwn(TOOL_REFERENCE,name)?TOOL_REFERENCE[name]:undefined;
 const reference=automaticRunning&&base!==undefined&&name==="press"?[base[0],"buttons: required array of 1–8 values: A, B, START, SELECT, UP, DOWN, LEFT, RIGHT. The harness automatically holds B for ordinary directional travel only when the fresh native readout permits running; the model has no walking override. Interface safety may submit only the first requested button.",base[2],'{"buttons":["RIGHT"]}']as const:automaticRunning&&base!==undefined&&name==="navigate_to"?[base[0],"x, y: required nonnegative integers. map_id: required [group, number], each integer 0–255, matching the current map. The harness automatically runs eligible steps; the model has no walking override. Local mode allows up to 8 button attempts; whole-map mode and terrain support depend on enabled features.",base[2],base[3]]as const:base;
 return `<article class="config-tool" data-tool="${esc(name)}"><h5>${esc(name)}</h5>${reference===undefined?'<p>Documentation unavailable for this recorded tool. Its historical inputs and outputs were not recorded.</p>':`<p>${esc(reference[0])}</p><dl><dt>INPUTS</dt><dd>${esc(reference[1])}</dd><dt>OUTPUTS</dt><dd>${esc(reference[2])}</dd></dl><details><summary>INPUT EXAMPLE</summary><pre>${esc(reference[3])}</pre><p>Illustrative shape only. Coordinates, map IDs and evidence must come from the actual run.</p></details>`}</article>`;
}

export const FEATURE_EXPLAINERS:Readonly<Record<string,string>>=Object.freeze({
 "observed-instructions-v1":"observed-instructions-v1.html",
 "original-speed-pacing-v1":"original-speed-pacing-v1.html",
 "safe-navigation-strides-v1":"safe-navigation-strides-v1.html",
 "evolution-decision-v1":"evolution-decision-v1.html",
 "automatic-running-v1":"automatic-running-v1.html",
 "visited-terrain-navigation-v1":"visited-terrain-navigation-v1.html",
 "semantic-navigation-v1":"semantic-navigation-v1.html",
 "deterministic-exploration-v1":"deterministic-exploration-v1.html",
 "just-in-time-prompt-v1":"just-in-time-prompt-v1.html",
 "just-in-time-prompt-v2":"just-in-time-prompt-v2.html",
 "navigation-evidence-memory-v1":"navigation-evidence-memory-v1.html",
 "bounded-navigation-v1":"astar-navigation.html",
 "ledge-hops-v1":"ledge-hops-v1.html",
 "one-way-tiles-v1":"one-way-tiles-v1.html",
 "elevation-transitions-v1":"elevation-transitions.html",
 "counter-talk-v1":"counter-talk-v1.html",
 "walkable-floor-v1":"walkable-floor-v1.html",
 "grass-cost-navigation-v1":"grass-cost-switch.html",
 "game-evidence-priority-v1":"game-evidence-priority-v1.html",
 "dialogue-log-v1":"dialogue-log-v1.html",
 "loop-guard-supervisor-v1":"loop-guard-supervisor-v1.html",
 "instruction-ledger-v1":"instruction-ledger-v1.html",
 "next-milestone-hint-v1":"next-milestone-hint-v1.html",
 "double-context-window-v1":"double-context-window-v1.html",
 "fresh-retry-v1":"fresh-retry-v1.html",
 "named-warp-destinations-v1":"named-warp-destinations-v1.html",
 "character-presence-v1":"character-presence-v1.html",
 "dialogue-auto-advance-v1":"dialogue-auto-advance-v1.html",
 "warp-arrival-settle-v1":"warp-arrival-settle-v1.html",
 "dialogue-context-kept-v1":"dialogue-context-kept-v1.html",
 "transition-loop-detection-v1":"transition-loop-detection-v1.html",
 "connection-edge-tiles-v1":"connection-edge-tiles-v1.html",
 "pushback-loop-detection-v1":"pushback-loop-detection-v1.html",
 "pushback-press-result-v1":"pushback-press-result-v1.html",
 "battle-observation-loop-v1":"battle-observation-loop-v1.html",
 "ineffective-loops-v1":"ineffective-loops-v1.html",
 "milestone-stall-stop-v1":"milestone-stall-stop-v1.html",
 "text-only-supervisor-v1":"text-only-supervisor-v1.html",
 "navigation-refusal-reasons-v1":"navigation-refusal-reasons-v1.html",
 "transition-press-result-v1":"transition-press-result-v1.html",
 "blocked-batch-result-v1":"blocked-batch-result-v1.html",
 "explorer-guidance-v1":"explorer-guidance-v1.html",
 "explorer-guidance-v2":"explorer-guidance-v2.html",
 "in-game-naming-readout-v1":"in-game-naming-readout-v1.html",
 "no-nickname-guidance-v1":"no-nickname-guidance-v1.html",
 "battle-text-auto-advance-v1":"battle-text-auto-advance-v1.html",
 "stall-briefing-v1":"stall-briefing-v1.html",
 "bedroom-exit-v1":"bedroom-exit-v1.html",
 "route103-rival-splits-v1":"route103-rival-splits-v1.html",
 "battle-details-v2":"battle-details-v2.html",
 "displayed-place-names-v1":"displayed-place-names-v1.html",
 "readout-rules-in-prompt-v1":"readout-rules-in-prompt-v1.html",
 "briefing-exits-v1":"briefing-exits-v1.html",
 "untaken-exits-v1":"untaken-exits-v1.html",
 "battle-triage-guidance-v1":"battle-triage-guidance-v1.html",
 "adjacent-tiles-v1":"adjacent-tiles-v1.html",
 "battle-message-waiting-v1":"battle-message-waiting-v1.html",
 "script-line-presence-v1":"script-line-presence-v1.html",
 "offscreen-objects-v1":"offscreen-objects-v1.html",
 "navigate-first-prompt-v1":"navigate-first-prompt-v1.html",
 "presence-penalty-v1":"presence-penalty-v1.html",
 "disproved-beliefs-v1":"disproved-beliefs-v1.html",
 "same-plan-breaker-v1":"same-plan-breaker-v1.html",
 "levelup-box-v1":"levelup-box-v1.html",
 "people-ledger-v1":"people-ledger-v1.html",
 "trainer-heal-guidance-v1":"trainer-heal-guidance-v1.html",
 "low-hp-trainer-warning-v1":"low-hp-trainer-warning-v1.html",
 "low-hp-trainer-warning-v2":"low-hp-trainer-warning-v2.html",
 "briefing-battle-outcomes-v1":"briefing-battle-outcomes-v1.html",
 "trainer-opponent-v1":"briefing-battle-outcomes-v1.html",
 "blocked-exit-fact-v1":"blocked-exit-fact-v1.html",
 "battle-loss-recap-v1":"battle-loss-recap-v1.html",
 "transition-coherence-v1":"transition-coherence-v1.html",
 "readout-truth-v1":"readout-truth-v1.html",
 "birch-speech-pages-v1":"birch-speech-pages-v1.html",
 "blackout-readout-v1":"blackout-readout-v1.html",
 "surf-gated-exits-v1":"surf-gated-exits-v1.html",
 "navigation-truth-v1":"navigation-truth-v1.html",
 "navigation-refusal-reasons-v2":"navigation-refusal-reasons-v2.html",
 "cross-map-goal-v1":"cross-map-goal-v1.html",
 "people-id-cards-v1":"people-id-cards-v1.html",
 "open-goal-prompt-v1":"open-goal-prompt-v1.html",
 "story-destinations-v1":"story-destinations-v1.html",
 "exit-reachability-v1":"exit-reachability-v1.html",
 "heal-before-trainers-v1":"heal-before-trainers-v1.html",
 "harness-trust-v1":"harness-trust-v1.html",
 "cited-destination-v1":"cited-destination-v1.html",
 "harness-trust-v2":"harness-trust-v1.html",
 "battle-move-tool-v1":"battle-move-tool-v1.html",
 "tutorial-party-owner-v1":"tutorial-party-owner-v1.html",
 "mid-frame-readout-v1":"mid-frame-readout-v1.html",
 "unset-dynamic-warp-v1":"unset-dynamic-warp-v1.html",
 "status-names-v1":"status-names-v1.html",
 "surf-gated-exits-v2":"surf-gated-exits-v2.html",
 "instruction-ledger-v2":"instruction-ledger-v2.html",
 "no-exit-here-v1":"no-exit-here-v1.html",
 "bag-healing-items-v1":"bag-healing-items-v1.html",
 "battle-menu-loop-v1":"battle-menu-loop-v1.html",
 "clock-view-loop-v1":"clock-view-loop-v1.html",
 "stale-story-goal-v1":"stale-story-goal-v1.html",
 "stale-story-goal-v2":"stale-story-goal-v2.html",
 "input-cuts-v1":"input-cuts-v1.html",
 "loop-guard-screen-v1":"loop-guard-screen-v1.html",
 "reopened-dialogue-loop-v1":"reopened-dialogue-loop-v1.html",
 "dialog-button-b-v1":"dialog-button-b-v1.html",
 "faced-interaction-history-v1":"faced-interaction-history-v1.html",
 "save-state-task-truth-v1":"save-state-task-truth-v1.html",
 "cache-aligned-window-v1":"cache-aligned-window-v1.html",
 "jit-guide-reuse-v1":"jit-guide-reuse-v1.html",
 "scripted-place-guidance-v1":"scripted-place-guidance-v1.html",
 "trigger-script-loop-v1":"trigger-script-loop-v1.html",
 "battle-refusal-loop-v1":"battle-refusal-loop-v1.html",
 "battle-effective-damage-v1":"battle-effective-damage-v1.html",
 "deterministic-warp-navigation-v1":"deterministic-warp-navigation-v1.html",
 "battle-decision-ready-v1":"battle-decision-ready-v1.html",
 "ineffective-navigation-v2":"ineffective-navigation-v2.html",
 "supervisor-briefing-v2":"supervisor-briefing-v2.html",
 "reachable-story-guidance-v1":"reachable-story-guidance-v1.html",
 "text-only-supervisor-v2":"text-only-supervisor-v2.html",
 "starter-decision-salience-v1":"starter-decision-salience-v1.html",
 "context-token-budget-v1":"context-token-budget-v1.html",
 "briefing-repeat-count-v1":"briefing-repeat-count-v1.html",
 "navigate-already-here-v1":"navigate-already-here-v1.html",
 "fixed-point-breaker-v1":"fixed-point-breaker-v1.html",
 "story-character-stall-gate-v1":"story-character-stall-gate-v1.html",
 "positive-supervisor-v1":"positive-supervisor-v1.html",
 "unfinished-activity-v1":"unfinished-activity-v1.html",
});

export function harnessConfig(view:RunView,registry:readonly FeatureInfo[]=[]):string {
 const start=view.start;if(start===null)return '<p class="nodata">No run configuration recorded.</p>';
 const missing="not recorded",evaluation=start.evaluation;
 const explicit:Readonly<Record<string,boolean>>=evaluation===undefined?{}:{"deterministic-loop-guard-v1":evaluation.flags.loopGuard,"active-ui-ownership-v1":evaluation.flags.activeUi,"contextual-interface-docs-v1":evaluation.flags.interfaceDocs,"objective-tracking-v1":evaluation.flags.objectives};
 const fallback:Readonly<Record<string,readonly[string,string,string]>>={
  "deterministic-loop-guard-v1":["LOOP GUARD","Warns on repeated planning, observations, actions, cycles and rejections; can end persistent loops.","guard"],
  "active-ui-ownership-v1":["ACTIVE UI OWNERSHIP","Reports the interface that owns input, its selection and readiness.","guidance"],
  "contextual-interface-docs-v1":["INTERFACE DOCS","Supplies screen-specific control documentation.","guidance"],
  "objective-tracking-v1":["OBJECTIVE TRACKING","Maintains an objective record and requires an active objective before pressing.","guard"],
 };
 const ids=[...new Set([...registry.map(f=>f.id),...start.harness_features,...Object.keys(explicit)])];
 const cards=ids.map(id=>{
  const info=registry.find(f=>f.id===id),known=Object.hasOwn(fallback,id)?fallback[id]:undefined;
  const explicitValue=Object.hasOwn(explicit,id)?explicit[id]:undefined;
  const state=start.harness_features.includes(id)?explicitValue===false?"conflict":"on":explicitValue===undefined?"unknown":explicitValue?"on":"off";
  const title=info?.title??known?.[0]??id.replaceAll("-"," ");const description=info?.description??known?.[1]??"Recorded feature ID. A description is unavailable in this viewer’s feature catalog.";
  const file=Object.hasOwn(FEATURE_EXPLAINERS,id)?FEATURE_EXPLAINERS[id]:undefined;
  return {group:info?.group??known?.[2]??"other",state,html:`<article class="config-feature config-${state}" data-feature="${esc(id)}"><header><h5>${esc(title)}</h5><span class="config-badge">${state==="unknown"?"NOT RECORDED":state.toUpperCase()}</span></header><p>${esc(description)}</p><footer><code>${esc(id)}</code>${file===undefined?"":`<a href="/explainers/${file}" target="_blank" rel="noopener" aria-label="Read explainer: ${esc(title)}">READ EXPLAINER ↗</a>`}</footer></article>`};
 });
 const groups=[["observation","OBSERVATION","What the model can see"],["guidance","GUIDANCE","How the harness helps"],["guard","GUARDS","What can intervene"],["measurement","MEASUREMENT","Recorded evidence and scoring"],["other","RECORDED POLICIES","Other recorded feature IDs"]]as const;
 const sections=groups.map(([id,title,description])=>{const list=cards.filter(c=>c.group===id||id==="other"&&!groups.some(g=>g[0]===c.group));return list.length===0?"":`<section class="config-group"><h4>${title}<span>${description}</span></h4><div class="config-feature-grid">${list.map(c=>c.html).join("")}</div></section>`;}).join("");
 const box=(title:string,rows:readonly(readonly[string,string])[])=>`<section class="config-summary-card"><h4>${title}</h4>${kv(rows)}</section>`;
 return `<div class="config-overview"><span class="config-readonly">◈ READ ONLY</span><p>Recorded settings for <strong>${esc(start.run)}</strong></p><div class="config-counts"><span>${String(cards.filter(c=>c.state==="on").length)} ON</span><span>${String(cards.filter(c=>c.state==="off").length)} OFF</span><span>${String(cards.filter(c=>c.state==="unknown").length)} NOT RECORDED</span>${cards.some(c=>c.state==="conflict")?'<span>CONFLICT · inspect raw configuration</span>':""}</div></div><div class="config-summary-grid">`+
 box("MODEL",[["MODEL",esc(start.model.id)],["CONTEXT WINDOW",num(start.model.context_window)],["VISION",start.model.vision?"supported":"not supported"],["THINKING",esc(start.sampling.thinking_level)],["OUTPUT TOKEN CAP",num(start.sampling.max_tokens)]])+
 box("BUDGET & GOAL",[["TIME CAP",(view.control.maxWallMs??start.budgets.max_wall_ms)===undefined?missing:hms((view.control.maxWallMs??start.budgets.max_wall_ms??0)/1000)],...(view.control.maxWallMs===null?[]:[["ORIGINAL EVALUATION CAP",hms((start.budgets.max_wall_ms??0)/1000)]] as [string,string][]),["TURN CAP",start.budgets.max_turns===undefined?missing:String(start.budgets.max_turns)],["FAILURE LIMIT",evaluation===undefined?missing:String(evaluation.failure_limit)],["STOP AT MILESTONE",evaluation===undefined?missing:evaluation.target===null?"NONE · play to budget":esc(evaluation.target)]])+
 box("BUILD & PRESET",[["PRESET",esc(evaluation?.preset_id??missing)],["HARNESS SOURCE",esc(start.harness.commit)+(start.harness.dirty?" · dirty":" · clean")],["START STATE",esc(start.start_state.kind)],["VENDOR PIN",esc(start.vendor_pin)],["PI VERSION",esc(start.pi_version)]])+`</div><p class="config-provenance">Statuses come from this run’s recorded header. Missing IDs stay NOT RECORDED, not guessed OFF. Descriptions come from the viewer’s feature catalog and may be newer than a historical run. This page never edits next-run settings.</p>${sections}<section class="config-summary-card"><h4>AVAILABLE TOOLS</h4><p class="config-provenance">Tools listed by this run’s recorded header. Reference documentation reflects this viewer build; names are not recorded with historical tool schemas. Outputs and limits depend on the run’s enabled features.</p><div class="config-tool-grid">${start.tools.map(name=>toolReference(name,start.harness_features.includes("automatic-running-v1"))).join("")||"none recorded"}</div></section><p class="config-provenance">Model weight digest, endpoint, temperature and other serving defaults: not recorded in this run header.</p><details class="config-raw"><summary>RECORDED SYSTEM PROMPT</summary><pre>${esc(start.system_prompt)}</pre></details><details class="config-raw"><summary>RAW RUN CONFIGURATION</summary>${jsonHtml(start)}</details>`;
}
