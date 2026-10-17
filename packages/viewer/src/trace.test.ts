// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { NAME_CONFIRMED } from "../../agent/test-support/events.js";
import { BASE_MS, Log, START, assistant, fullRun, m4Run, must, state } from "../test-support/events.js";
import { eventText } from "./panels.js";
import { STAR_SVG, TRACE_CHIPS, TraceBuilder, moreButton, sideGroups, sideTraceHtml, showsInTrace, traceGroups, traceHtml, traceRow, type TraceCategory, type TraceStep } from "./trace.js";

function build(events: readonly RunEvent[]): TraceBuilder {
  const builder = new TraceBuilder();
  for (const event of events) builder.add(event);
  return builder;
}
const ALL: ReadonlySet<TraceCategory> = new Set(TRACE_CHIPS.map((chip) => chip.id));
const steps = (builder: TraceBuilder): TraceStep[] => builder.turns.flatMap((turn) => turn.steps());
const dom = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

function supervisedRun(): Log {
  const log = new Log();
  log.add(0, START);
  log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 2500 } });
  log.add(2000, assistant({ thinking: "Line one\nline two" }));
  log.add(2001, { type: "tool_call", turn: 1, id: "c1", name: "press", args: { buttons: ["A"] } });
  log.add(2002, { type: "button_press", turn: 1, tool_call_id: "c1", buttons: ["A"], hold_frames: 10, release_frames: 8 });
  log.add(2003, { type: "native_action", turn: 1, id: 1, kind: "native_input", frame: 120, server_timestamp: 1, details: { buttons: ["A"] } });
  log.add(2100, { type: "tool_result", turn: 1, id: "c1", name: "press", is_error: false, duration_ms: 99, text: "pressed A\nPress result: unchanged world position/facing\n" + "x".repeat(4000), frames: [] });
  log.add(2101, { type: "loop_guard", turn: 1, kind: "ineffective", phase: "warning", mode: "enforced", calls: 14, message: "Repeating.", evidence: [6] });
  log.add(2102, { type: "loop_guard", turn: 1, kind: "ineffective", phase: "supervisor", mode: "enforced", calls: 14, message: "SUPERVISOR: You are looping.\nStop and get your bearings.", evidence: [6] });
  log.add(3000, { type: "turn_start", turn: 2, context: { messages: 3, images: 1, est_tokens: 5000 } });
  log.add(3500, { type: "navigation_context", turn: 2, text: "NAVIGATION EVIDENCE <memory>", evidence: [6] });
  return log;
}

type Body = Parameters<Log["add"]>[1];
const X = '<b class="inject">x</b>';
// One sample of every event type; a new RunEvent type fails to compile here until it is added.
const SAMPLES: { [K in RunEvent["type"]]: Extract<Body, { type: K }> } = {
  run_start: START,
  turn_start: { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } },
  assistant_delta: { type: "assistant_delta", turn: 1, thinking: X, text: "" },
  assistant: assistant({ thinking: X, text: X }) as Extract<Body, { type: "assistant" }>,
  tool_call: { type: "tool_call", turn: 1, id: "c1", name: "<b>x", args: { buttons: ["A"] } },
  button_press: { type: "button_press", turn: 1, tool_call_id: "c1", buttons: ["A"], hold_frames: 10, release_frames: 8 },
  wait_input: { type: "wait_input", turn: 1, tool_call_id: "c1", duration_ms: 60 },
  tool_result: { type: "tool_result", turn: 1, id: "c1", name: "press", is_error: false, duration_ms: 9, text: X, frames: [] },
  state: { ...state(NAME_CONFIRMED), type: "state" } as Extract<Body, { type: "state" }>,
  navigation_context: { type: "navigation_context", turn: 1, text: X, evidence: [1] },
  ledger_context: { type: "ledger_context", turn: 1, text: X, evidence: [1] },
  belief_ledger: { type: "belief_ledger", turn: 1, text: X, entries: 1, evidence: [1] },
  milestone_hint: { type: "milestone_hint", turn: 1, text: X, milestone: "CLOCK_SET" },
  decision_input: { type: "decision_input", turn: 1, decision_turn: 1, state_seq: 1, text: X, frames: [{ path: "frames/000002_0.png", sha1: "a".repeat(40) }] },
  human_input: { type: "human_input", turn: 0, id: 1, start_frame: 0, end_frame: 6, buttons: ["A"], start_ms: BASE_MS, end_ms: BASE_MS + 100, request_seq: 1, session: "keyboard" },
  human_sample: { type: "human_sample", turn: 0, frame: 12, paused: false, screenshot: { path: "frames/000004_0.png", sha1: "a".repeat(40) } },
  milestone: { type: "milestone", turn: 1, name: "<b>PLAYER_NAME_SET", server_timestamp: 2 },
  activity: { type: "activity", turn: 1, kind: "save_attempt", count: 2, server_timestamp: 1, evidence: [1, 2] },
  native_action: { type: "native_action", turn: 1, id: 1, kind: "harness_bug", frame: 120, server_timestamp: 1, details: { note: X } },
  battle_choice: { type: "battle_choice", turn: 1, id: 1, frame: 120, recorded_ms: BASE_MS + 200, battle: 2, battle_turn: 3, action: "move", action_id: 0, origin: "selected", actor: { battler: 0, position: 0, party_slot: 0, species_id: 25, species: "PIKACHU", identity: "1:2", level: 10, hp: 20, max_hp: 30 }, move: { id: 55, name: "WATER GUN", slot: 0, pp: 25 }, target: null, item_id: null, switch_party_slot: null, source: { main_func: 0x0803d2e9, communication: [5, 5], battle_type: 0 } },
  loop_guard: { type: "loop_guard", turn: 1, kind: "cycle", phase: "supervisor", mode: "enforced", calls: 3, message: X, evidence: [1] },
  retry: { type: "retry", turn: 1, reason: X, attempt: 1, limit: 3 },
  text_only_supervisor: { type: "text_only_supervisor", turn: 1, replies: 3, note: 1, limit: 3, text: X },
  people_id_card: { type: "people_id_card", turn: 1, tool: X, tool_call_id: X, key: "name:MAY", reason: "first", text: X },
  low_hp_trainer_warning: { type: "low_hp_trainer_warning", turn: 1, tool: X, species: X, hp: 3, max_hp: 21, rival: "MAY", x: 10, y: 3, map_id: [0, 18], money: 3000, items: [{ name: X, quantity: 1 }], text: X },
  story_battle_warning: { type: "story_battle_warning", turn: 1, tool: X, kind: "aqua_grunt", opponent: X, x: null, y: null, map_id: [24, 11], party: [{ species: X, hp: 3, max_hp: 21 }], money: 3000, items: [{ name: X, quantity: 1 }], text: X },
  story_goal_away: { type: "story_goal_away", turn: 1, tool: X, speaker: X, line_turn: 1, quote: X, targets: [{ name: X, map_id: [1, 4] }], steps: [{ measure: "tiles", from_map: [0, 18], to_map: [0, 18], from_name: X, to_name: X, from: { x: 9, y: 13 }, to: { x: 9, y: 10 }, before: 8, after: 11, way: X }, { measure: "maps", from_map: [0, 10], to_map: [0, 18], from_name: X, to_name: X, from: { x: 1, y: 0 }, to: { x: 1, y: 21 }, before: 3, after: 4, way: null }], text: X },
  destination_citation: { type: "destination_citation", turn: 1, tool_call_id: X, because: X, verdict: "not_found", found_turn: null, x: 1, y: 2, map_id: [0, 9], text: X },
  dialogue_auto_advance: { type: "dialogue_auto_advance", turn: 1, tool_call_id: "c1", tool: "press", requested: ["A", "A"], sent: ["A"], dropped: ["A"], auto_presses: 2, pages: [{ state_seq: 3, map: X, map_id: [1, 4], position: { x: 1, y: 2 }, speaker: X, speaker_source: "faced_sprite", text: X }], stop: "field_free", detail: X, duration_ms: 400 },
  telemetry_error: { type: "telemetry_error", turn: 1, source: "state", message: X },
  compaction: { type: "compaction", turn: 1, from_tokens: 9000, to_tokens: 1000 },
  disk_usage: { type: "disk_usage", turn: 1, bytes: 1, cap_bytes: 10, percent: 10 },
  frames_evicted: { type: "frames_evicted", turn: 1, from_run: "2026-10-11T21-00-00_old", files: 3, bytes: 1500 },
  operator_control: { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: true },
  objective_update: { type: "objective_update", turn: 1, objective: { id: "o1", revision: 1, goal: "Reach gym", title: X, supports_goal: "Observed", evidence: [0], completion: { kind: "visual", description: "Clock" }, obstacle: "", next_decision: "Face north", status: "active", completion_evidence: [] } },
  objective_attempt: { type: "objective_attempt", turn: 1, attempt: { id: "p1", objective_id: "o1", buttons: ["A"], before_seq: 0, after_seq: 1, outcome: "no_change", failure_count: 2, warning: X, retry_justification: null } },
  run_end: { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 10, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } },
};
function everyType(): Log {
  const log = new Log();
  for (const [i, body] of Object.values(SAMPLES).entries()) log.add(i, body);
  return log;
}

describe("every event type (INV-1)", () => {
  const log = everyType();
  const all = steps(build(log.events));

  it("puts each event activity history showed into a titled step, and leaves the rest to their panels", () => {
    for (const event of log.events) {
      const step = all.find((s) => s.seqs.includes(event.seq));
      expect(step !== undefined, event.type).toBe(eventText(event) !== null);
      expect(showsInTrace(event), event.type).toBe(eventText(event) !== null);
      if (step !== undefined) expect(step.titleHtml, event.type).not.toBe("");
    }
  });

  it("keeps every type but emulator rows visible under the default chips", () => {
    const on = new Set(TRACE_CHIPS.filter((chip) => chip.on).map((chip) => chip.id));
    expect(all.filter((step) => !on.has(step.category))).toEqual([]);
    const emulator = new Log();
    emulator.add(0, { type: "native_action", turn: 1, id: 1, kind: "menu_changed", frame: 1, server_timestamp: 1, details: {} });
    expect(steps(build(emulator.events)).map((step) => step.category)).toEqual(["eng"]);
  });

  it("escapes every recorded string it renders", () => {
    const root = dom(all.map((step) => traceRow(step)).join(""));
    expect(root.querySelector(".inject, b")).toBeNull();
    expect(root.textContent).toContain(X);
  });
});

describe("TraceBuilder", () => {
  it("groups events by turn and folds a tool call's press and result into its step", () => {
    const builder = build(fullRun().events);
    expect(builder.turns.map((turn) => turn.turn)).toEqual([0, 1, 2]);
    const turn1 = must(builder.turns[1]).steps();
    expect(turn1.map((step) => step.kind)).toEqual(["assistant", "tool_call", "milestone"]);
    expect(must(turn1[1]).seqs).toEqual([5, 6, 9]);
  });

  it("keeps seq order inside a turn (INV-2)", () => {
    for (const turn of build(m4Run()).turns) {
      const keys = turn.steps().map((step) => step.key);
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
    }
  });

  it("shows every event that activity history showed, and nothing it hid (INV-1)", () => {
    for (const events of [fullRun().events, m4Run(), supervisedRun().events]) {
      const shown = new Set(steps(build(events)).flatMap((step) => step.seqs));
      for (const event of events) expect(shown.has(event.seq), `${event.type} #${String(event.seq)}`).toBe(eventText(event) !== null);
    }
  });

  it("counts a version bump only for events the trace shows", () => {
    const builder = new TraceBuilder();
    const log = fullRun();
    builder.add(must(log.events[0]));
    expect(builder.version).toBe(0);
    builder.add(must(log.events[1]));
    expect(builder.version).toBe(1);
  });

  it("adds the viewer's loop-guard attribution to guard rows when given one", () => {
    const builder = new TraceBuilder((event) => `label for #${String(event.seq)}`);
    for (const event of supervisedRun().events) builder.add(event);
    const guards = steps(builder).filter((step) => step.category === "guard" || step.category === "sup");
    expect(guards.map((step) => dom(traceRow(step)).querySelector(".tl-body")?.textContent)).toEqual([expect.stringContaining("label for #7"), expect.stringContaining("label for #8")]);
  });

  it("keeps an orphan press or result as its own action step", () => {
    const log = new Log();
    log.add(0, { type: "button_press", turn: 1, tool_call_id: "gone", buttons: ["B"] });
    log.add(1, { type: "tool_result", turn: 1, id: "gone", name: "state", is_error: true, duration_ms: 3, text: "boom", frames: [] });
    log.add(2, { type: "wait_input", turn: 1, tool_call_id: "gone", duration_ms: 60 });
    const all = steps(build(log.events));
    expect(all.map((step) => step.category)).toEqual(["act", "act", "act"]);
    expect(all[1]?.status).toBe("error");
    expect(dom(traceRow(must(all[1]))).querySelector(".tl-body pre")?.textContent).toBe("boom");
  });
});

describe("chips", () => {
  it("count steps per category and start with emulator rows off", () => {
    const counts = build(supervisedRun().events).counts;
    expect(counts).toMatchObject({ think: 1, act: 1, sup: 1, guard: 1, eng: 1, mem: 1, ms: 0 });
    expect(TRACE_CHIPS.find((chip) => chip.id === "eng")?.on).toBe(false);
    expect(TRACE_CHIPS.filter((chip) => chip.id !== "eng").every((chip) => chip.on)).toBe(true);
  });
});

describe("traceRow", () => {
  const all = steps(build(supervisedRun().events));
  const byKind = (category: TraceCategory): TraceStep => must(all.find((step) => step.category === category));

  it("renders the supervisor exactly like any other row; only the icon differs (INV-3)", () => {
    const sup = dom(traceRow(byKind("sup"))).firstElementChild as HTMLElement;
    const guard = dom(traceRow(byKind("guard"))).firstElementChild as HTMLElement;
    expect(sup.tagName).toBe(guard.tagName);
    expect(sup.className).toBe(guard.className);
    const recovered = new Log();
    recovered.add(0, { type: "loop_guard", turn: 1, kind: "cycle", phase: "recovered", mode: "enforced", calls: 4, message: "Recovered.\nMore.", evidence: [1] });
    const plain = dom(traceRow(must(steps(build(recovered.events))[0]))).firstElementChild as HTMLElement;
    const shape = (row: Element): string[] => [...row.querySelectorAll("*")].filter((el) => el.closest(".tl-icon") === null && el.closest(".tl-body") === null).map((el) => `${el.tagName}.${el.className}`);
    expect(shape(sup)).toEqual(shape(plain));
    expect(sup.querySelector(".st")).toBeNull();
    expect(sup.querySelector(".tl-title")?.textContent).toBe("Supervisor note");
    expect(sup.querySelector(".tl-icon")?.textContent).toBe("SUP");
    expect(sup.querySelector(".tl-res")?.textContent).toBe("You are looping.");
    expect(sup.querySelector(".tl-body")?.textContent).toContain("Stop and get your bearings.");
    expect(sup.hasAttribute("open")).toBe(false);
  });

  it("shows stall-briefing-v1 notes as supervisor rows with their full headline", () => {
    const log = new Log();
    log.add(0, { type: "loop_guard", turn: 1, kind: "map_cycle", phase: "supervisor", mode: "enforced", calls: 9, message: "SUPERVISOR: You are stalling. You have walked between A and B 2 times.\nStop and get your bearings:", evidence: [1, 2] });
    log.add(1, { type: "loop_guard", turn: 2, kind: "milestone_drought", phase: "supervisor", mode: "enforced", calls: 12, message: "SUPERVISOR: You are stalling. There has been no new story milestone for 5 minutes of play.", evidence: [3] });
    const rows = steps(build(log.events)).map((step) => dom(traceRow(step)).firstElementChild as HTMLElement);
    expect(rows.map((row) => row.querySelector(".tl-title")?.textContent)).toEqual(["Supervisor note", "Supervisor note"]);
    expect(rows[0]?.querySelector(".tl-res")?.textContent).toBe("You are stalling. You have walked between A and B 2 times.");
    expect(rows[1]?.querySelector(".tl-body")?.textContent).toContain("no new story milestone for 5 minutes of play");
  });

  it("folds a tool call's full result, and the result folds on its own", () => {
    const row = dom(traceRow(byKind("act"))).firstElementChild as HTMLDetailsElement;
    expect(row.tagName).toBe("DETAILS");
    expect(row.open).toBe(false);
    expect(row.querySelector(".tl-title")?.textContent).toBe("Pressed A");
    expect(row.querySelector(".tl-res")?.textContent).toBe("→ unchanged world position/facing");
    expect(row.querySelector(".st.warn")?.textContent).toBe("no effect");
    const result = must(row.querySelector<HTMLDetailsElement>("details.res-d"));
    expect(result.open).toBe(true);
    expect(result.querySelector("pre")?.textContent).toContain("x".repeat(4000));
    expect(row.querySelector(".args")?.textContent).toContain("hold 10f · release 8f");
  });

  it("marks milestones with an inline SVG star, not a text glyph (INV-4)", () => {
    const row = dom(traceRow(must(steps(build(fullRun().events)).find((step) => step.category === "ms"))));
    const icon = must(row.querySelector(".tl-icon"));
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.textContent.trim()).toBe("");
    expect(row.textContent).not.toMatch(/[★*]/);
    expect(STAR_SVG).toContain("<svg");
    expect(row.querySelector(".tl-title")?.textContent).toBe("Milestone GAME RUNNING");
  });

  it("escapes recorded text", () => {
    const memory = dom(traceRow(byKind("mem")));
    expect(memory.innerHTML).toContain("&lt;memory&gt;");
    expect(memory.querySelector("script, memory")).toBeNull();
  });

  it("shows thinking, its reply and a model error in the body", () => {
    const log = new Log();
    log.add(0, assistant({ thinking: "", text: "Only a reply", error: "terminated" }));
    const row = dom(traceRow(must(steps(build(log.events))[0])));
    expect(row.querySelector(".tl-title")?.textContent).toBe("Replied");
    expect(row.querySelector(".st.error")).not.toBeNull();
    expect(row.textContent).toContain("Only a reply");
    expect(row.textContent).toContain("terminated");
  });

  it("puts a turn gutter on the row when asked", () => {
    expect(dom(traceRow(byKind("think"), "T1")).querySelector(".tg")?.textContent).toBe("T1");
  });

  it("keeps every press a navigate_to call made, and names the call, not a press", () => {
    const log = new Log();
    log.add(0, { type: "tool_call", turn: 1, id: "n", name: "navigate_to", args: { x: 4, y: 2, map_id: [0, 9] } });
    log.add(1, { type: "button_press", turn: 1, tool_call_id: "n", buttons: ["RIGHT"], hold_frames: 10, release_frames: 8 });
    log.add(2, { type: "button_press", turn: 1, tool_call_id: "n", buttons: ["UP"], hold_frames: 12, release_frames: 6 });
    log.add(3, { type: "tool_result", turn: 1, id: "n", name: "navigate_to", is_error: false, duration_ms: 50, text: "Navigation: arrived", frames: [] });
    const step = must(steps(build(log.events))[0]);
    const row = dom(traceRow(step));
    expect(row.querySelector(".tl-title")?.textContent).toContain("navigate_to");
    expect(step.desc).toBe("#0 · 2 presses · 50 ms");
    const args = row.querySelector(".args")?.textContent ?? "";
    expect(args).toContain("→RIGHT hold 10f · release 8f");
    expect(args).toContain("↑UP hold 12f · release 6f");
  });

  it("escapes a tool name used as its icon", () => {
    const log = new Log();
    log.add(0, { type: "tool_call", turn: 1, id: "q", name: "<b>x", args: {} });
    const row = dom(traceRow(must(steps(build(log.events))[0])));
    expect(row.querySelector("b")).toBeNull();
    expect(row.querySelector(".tl-icon")?.textContent).toBe("<B>");
  });

  it("gives an empty answer a plain row with nothing to expand", () => {
    const log = new Log();
    log.add(0, assistant({ thinking: "", text: "" }));
    expect(must(steps(build(log.events))[0]).body).toBeNull();
  });

  it("titles an answer that only failed as a model error", () => {
    const log = new Log();
    log.add(0, assistant({ thinking: "", text: "", error: "terminated" }));
    const row = dom(traceRow(must(steps(build(log.events))[0])));
    expect(row.querySelector(".tl-title")?.textContent).toBe("Model error");
    expect(row.querySelector(".tl-res")?.textContent).toBe("terminated");
  });

  it("shows each row's event number and keeps emulator rows marked first observed", () => {
    const all = steps(build(supervisedRun().events));
    expect(all.every((step) => step.desc.startsWith(`#${String(step.key)}`))).toBe(true);
    expect(all.find((step) => step.category === "eng")?.desc).toBe("#5 · frame 120 (first observed)");
  });

  it("flags unrecovered enforced loop guards as errors, but not the supervisor, diagnostics or recoveries", () => {
    const all = steps(build(supervisedRun().events));
    expect(all.find((step) => step.category === "guard")?.status).toBe("error");
    expect(all.find((step) => step.category === "sup")?.status).toBeNull();
  });

  it("names tools without a press, waits, diagnostics and other run events", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, { type: "tool_call", turn: 1, id: "n", name: "navigate_to", args: { x: 11, y: 19, map_id: [0, 9] } });
    log.add(2, { type: "wait_input", turn: 1, tool_call_id: "n", duration_ms: 60 });
    log.add(3, { type: "tool_call", turn: 1, id: "o", name: "observe", args: {} });
    log.add(4, { type: "loop_guard", turn: 1, kind: "cycle", phase: "would_warn", mode: "diagnostic", calls: 3, message: "Maybe looping", evidence: [1] });
    log.add(5, { type: "loop_guard", turn: 1, kind: "cycle", phase: "recovered", calls: 4, message: "Recovered", evidence: [1] });
    log.add(6, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: false });
    const all = steps(build(log.events));
    expect(all.map((step) => step.kind)).toEqual(["tool_call", "tool_call", "loop_guard", "loop_guard", "operator_control"]);
    expect(all[2]?.status).toBeNull();
    expect(all[3]?.status).toBeNull();
    const text = all.map((step) => dom(traceRow(step)).textContent).join("\n");
    expect(text).toContain("navigate_to");
    expect(text).toContain("waiting for result");
    expect(text).toContain("WAIT 60 ms");
    expect(text).toContain("diagnostic: would warn");
    expect(text).toContain("Loop guard · cycle recovered");
    expect(all.find((step) => step.kind === "operator_control")?.status).toBe("error");
  });
});

describe("traceHtml", () => {
  const builder = build(supervisedRun().events);

  it("lists turns newest first and filters by chip", () => {
    const root = dom(traceHtml(builder.turns, ALL, { elapsed: (ms) => (ms - BASE_MS) / 1000, live: null, limit: 50, page: 50 }));
    expect([...root.querySelectorAll(".turn-h")].map((h) => h.firstChild?.textContent?.trim())).toEqual(["TURN 2", "TURN 1"]);
    const noSup = dom(traceHtml(builder.turns, new Set<TraceCategory>(["think", "act"]), { elapsed: (ms) => (ms - BASE_MS) / 1000, live: null, limit: 50, page: 50 }));
    expect(noSup.textContent).not.toContain("Supervisor note");
    expect(noSup.querySelectorAll(".turn-h")).toHaveLength(1);
  });

  it("opens the live turn on its thinking, always expanded (INV-6)", () => {
    const root = dom(traceHtml(builder.turns, new Set<TraceCategory>(["act"]), { elapsed: (ms) => (ms - BASE_MS) / 1000, live: { turn: 3 }, limit: 50, page: 50 }));
    const first = must(root.firstElementChild);
    expect(first.textContent).toContain("TURN 3");
    const live = must(root.querySelector(".live-row"));
    expect(live.tagName).toBe("DIV");
    expect(live.querySelector("[data-live-text]")).not.toBeNull();
    const ongoing = dom(traceHtml(builder.turns, ALL, { elapsed: (ms) => (ms - BASE_MS) / 1000, live: { turn: 2 }, limit: 50, page: 50 }));
    expect(ongoing.firstElementChild?.getAttribute("data-group")).toBe("t2");
    expect([...must(ongoing.firstElementChild).children].map((el) => el.classList.contains("live-row") ? "live" : el.className)).toEqual(["turn-h", "tl", "live"]);
  });

  it("caps the turns it renders and offers the rest", () => {
    const root = dom(traceHtml(build(m4Run()).turns, ALL, { elapsed: null, live: null, limit: 1, page: 50 }));
    expect(root.querySelectorAll(".turn-h")).toHaveLength(1);
    expect(root.querySelector("[data-trace-more]")?.textContent).toMatch(/SHOW \d+ OLDER TURNS/);
  });

  it("renders only the turns on screen of a long run", () => {
    const log = new Log();
    for (let turn = 1; turn <= 2000; turn += 1) {
      log.add(turn * 10, assistant({ turn, thinking: `Turn ${String(turn)}` }));
      log.add(turn * 10 + 1, { type: "tool_call", turn, id: `c${String(turn)}`, name: "press", args: { buttons: ["A"] } });
      log.add(turn * 10 + 2, { type: "tool_result", turn, id: `c${String(turn)}`, name: "press", is_error: false, duration_ms: 1, text: "y".repeat(5000), frames: [] });
    }
    const turns = build(log.events).turns;
    const html = traceHtml(turns, ALL, { elapsed: null, live: null, limit: 50, page: 50 });
    expect(html.match(/class="turn-h"/g)).toHaveLength(50);
    expect(html.length).toBeLessThan(50 * 5000 + 100_000);
    expect(html).toContain("SHOW 50 OLDER TURNS");
  });

  it("changes a turn's stamp only when that turn's rows or the filter change", () => {
    const builder = build(supervisedRun().events);
    const stamps = (on: ReadonlySet<TraceCategory>): string[] => traceGroups(builder.turns, on, { elapsed: (ms) => (ms - BASE_MS) / 1000, live: null, limit: 50, page: 50 }).groups.map((g) => g.stamp);
    const before = stamps(ALL);
    builder.add(new Log().add(0, { type: "retry", turn: 1, reason: "x", attempt: 1, limit: 3 }));
    const after = stamps(ALL);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(stamps(new Set<TraceCategory>(["think"]))[0]).not.toBe(before[0]);
  });

  it("keeps a turn's stamp when only a hidden row arrives, on the trace and the side panel", () => {
    const builder = build(supervisedRun().events);
    const on = new Set(TRACE_CHIPS.filter((chip) => chip.on).map((chip) => chip.id));
    const options = { elapsed: null, live: null, limit: 50, page: 50 };
    const before = traceGroups(builder.turns, on, options).groups.map((g) => g.stamp);
    const side = sideGroups(builder.turns, 20).map((g) => g.stamp);
    const log = new Log();
    builder.add(log.add(0, { type: "native_action", turn: 1, id: 9, kind: "native_input", frame: 130, server_timestamp: 1, details: { buttons: [] } }));
    builder.add(log.add(1, { type: "navigation_context", turn: 1, text: "more", evidence: [1] }));
    expect(traceGroups(builder.turns, on, options).groups.map((g) => g.stamp)[1]).not.toBe(before[1]);
    expect(sideGroups(builder.turns, 20).map((g) => g.stamp)).toEqual(side);
    const eng = build(supervisedRun().events);
    const engBefore = traceGroups(eng.turns, on, options).groups.map((g) => g.stamp);
    eng.add(log.add(2, { type: "native_action", turn: 1, id: 10, kind: "native_input", frame: 131, server_timestamp: 1, details: { buttons: [] } }));
    expect(traceGroups(eng.turns, on, options).groups.map((g) => g.stamp)).toEqual(engBefore);
  });

  it("shows turn times from the run clock it is given", () => {
    const html = traceHtml(build(supervisedRun().events).turns, ALL, { elapsed: () => 3725, live: null, limit: 50, page: 50 });
    expect(html).toContain("1:02:05");
  });

  it("offers one page of older turns at a time", () => {
    expect(moreButton(0, 50)).toBe("");
    expect(moreButton(120, 50)).toContain("SHOW 50 OLDER TURNS");
    expect(moreButton(7, 50)).toContain("SHOW 7 OLDER TURNS");
  });
});

describe("sideTraceHtml", () => {
  it("shows earlier agent steps newest first, without memory or emulator rows", () => {
    const log = supervisedRun();
    log.add(4000, assistant({ turn: 2, thinking: "Turn two." }));
    const root = dom(sideTraceHtml(build(log.events).turns, 20));
    expect(root.textContent).not.toContain("Navigation memory");
    expect(root.textContent).not.toContain("Emulator input");
    expect([...root.querySelectorAll(".tg")].map((g) => g.textContent).filter(Boolean)).toEqual(["T2", "T1"]);
    expect(root.querySelector("[data-c=sup] .tl-title")?.textContent).toBe("Supervisor note");
  });

  it("leaves out the thought the Emerald box is already showing", () => {
    const log = supervisedRun();
    log.add(4000, assistant({ turn: 2, thinking: "Turn two." }));
    const turns = build(log.events).turns;
    expect(dom(sideTraceHtml(turns, 20, 2)).textContent).not.toContain("Turn two.");
    expect(dom(sideTraceHtml(turns, 20, 2)).querySelector(".tg")?.textContent).toBe("T1");
    expect(dom(sideTraceHtml(turns, 20)).textContent).toContain("Turn two.");
  });

  it("says when there is nothing yet", () => {
    expect(sideTraceHtml([], 20)).toContain("nodata");
    const log = new Log();
    log.add(0, START);
    log.add(1, state());
    expect(sideTraceHtml(build(log.events).turns, 20)).toContain("nodata");
  });
});

describe("people-id-cards-v1 in Activity History", () => {
  it("is an action step titled for the card, naming the tool, why it was shown, the person and the whole card", () => {
    const log = new Log();
    log.add(0, START);
    const text = "ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 2, at 10,3 on ROUTE103 (map 0/18)\n- Name: MAY. The game first showed this name on turn 107.";
    log.add(100, { type: "people_id_card", turn: 211, tool: "press", tool_call_id: "c1", key: "name:MAY", reason: "changed", text });
    const step = must(steps(build(log.events)).find((s) => s.kind === "people_id_card"));
    expect(step.category).toBe("act");
    expect(step.titleHtml).toContain("ID card shown");
    expect(eventText(must(log.events.at(-1)))).toBe(`ID card added to the press result (back in view, card changed) · name:MAY · ${text}`);
    log.add(200, { type: "people_id_card", turn: 212, tool: "observe", tool_call_id: "c2", key: "obj:0/18#10", reason: "first", text: "ID card: sprite BOY_1" });
    expect(eventText(must(log.events.at(-1)))).toBe("ID card added to the observe result (first sight) · obj:0/18#10 · ID card: sprite BOY_1");
  });
});

describe("low-hp-trainer-warning-v1 in Activity History", () => {
  it("is a SUPERVISOR step titled for the warning, naming the tool, HP, rival and tile, with the whole paragraph", () => {
    const log = new Log();
    log.add(0, START);
    const text = "SUPERVISOR: Your TORCHIC has 3/21 HP (below half), and your rival MAY is on this map at (10,3).";
    log.add(100, { type: "low_hp_trainer_warning", turn: 363, tool: "navigate_to", species: "TORCHIC", hp: 3, max_hp: 21, rival: "MAY", x: 10, y: 3, map_id: [0, 18], money: 3000, items: [], text });
    const step = must(steps(build(log.events)).find((s) => s.kind === "low_hp_trainer_warning"));
    expect(step.category).toBe("sup");
    expect(step.titleHtml).toContain("Low-HP trainer warning");
    expect(eventText(must(log.events.at(-1)))).toBe(`Low-HP trainer warning added to the navigate_to result · TORCHIC 3/21 HP · rival MAY at (10,3) · ${text}`);
  });
});

describe("low-hp-trainer-warning-v2 in Activity History", () => {
  it("is a SUPERVISOR step titled for the story battle warning, naming the tool, opponent, tile and hurt party, with the whole paragraph", () => {
    const log = new Log();
    log.add(0, START);
    const text = "SUPERVISOR: A story battle is on this map: the Gym Leader ROXANNE, at (5,2).";
    log.add(100, { type: "story_battle_warning", turn: 900, tool: "press", kind: "gym_leader", opponent: "ROXANNE", x: 5, y: 2, map_id: [11, 3], party: [{ species: "COMBUSKEN", hp: 30, max_hp: 41 }], money: 3000, items: [], text });
    const step = must(steps(build(log.events)).find((s) => s.kind === "story_battle_warning"));
    expect(step.category).toBe("sup");
    expect(step.titleHtml).toContain("Story battle warning");
    expect(eventText(must(log.events.at(-1)))).toBe(`Story battle warning added to the press result · ROXANNE at (5,2) · COMBUSKEN 30/41 · ${text}`);
  });
});
