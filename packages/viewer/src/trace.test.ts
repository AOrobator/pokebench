// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, assistant, fullRun, m4Run, must, state } from "../test-support/events.js";
import { eventText } from "./panels.js";
import { STAR_SVG, TRACE_CHIPS, TraceBuilder, chipCounts, sideTraceHtml, traceHtml, traceRow, type TraceCategory, type TraceStep } from "./trace.js";

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
  });
});

describe("chips", () => {
  it("count steps per category and start with emulator rows off", () => {
    const counts = chipCounts(build(supervisedRun().events).turns);
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
    expect(sup.querySelector(".tl-title")?.textContent).toBe("Supervisor note");
    expect(sup.querySelector(".tl-icon")?.textContent).toBe("SUP");
    expect(sup.querySelector(".tl-res")?.textContent).toBe("You are looping.");
    expect(sup.querySelector(".tl-body")?.textContent).toContain("Stop and get your bearings.");
    expect(sup.hasAttribute("open")).toBe(false);
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

  it("names tools without a press, waits, diagnostics and other run events", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, { type: "tool_call", turn: 1, id: "n", name: "navigate_to", args: { x: 11, y: 19, map_id: [0, 9] } });
    log.add(2, { type: "wait_input", turn: 1, tool_call_id: "n", duration_ms: 60 });
    log.add(3, { type: "tool_call", turn: 1, id: "o", name: "observe", args: {} });
    log.add(4, { type: "loop_guard", turn: 1, kind: "cycle", phase: "would_warn", mode: "diagnostic", calls: 3, message: "Maybe looping", evidence: [1] });
    log.add(5, { type: "loop_guard", turn: 1, kind: "cycle", phase: "recovered", calls: 4, message: "Recovered", evidence: [1] });
    log.add(6, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: false });
    const html = log.events.slice(1).length;
    const all = steps(build(log.events));
    expect(all).toHaveLength(html - 1);
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
    const root = dom(traceHtml(builder.turns, ALL, { startMs: BASE_MS, live: null, limit: 50 }));
    expect([...root.querySelectorAll(".turn-h")].map((h) => h.firstChild?.textContent?.trim())).toEqual(["TURN 2", "TURN 1"]);
    const noSup = dom(traceHtml(builder.turns, new Set<TraceCategory>(["think", "act"]), { startMs: BASE_MS, live: null, limit: 50 }));
    expect(noSup.textContent).not.toContain("Supervisor note");
    expect(noSup.querySelectorAll(".turn-h")).toHaveLength(1);
  });

  it("opens the live turn on its thinking, always expanded (INV-6)", () => {
    const root = dom(traceHtml(builder.turns, new Set<TraceCategory>(["act"]), { startMs: BASE_MS, live: { turn: 3 }, limit: 50 }));
    const first = must(root.firstElementChild);
    expect(first.textContent).toContain("TURN 3");
    const live = must(root.querySelector(".live-row"));
    expect(live.tagName).toBe("DIV");
    expect(live.querySelector("[data-live-text]")).not.toBeNull();
    const ongoing = dom(traceHtml(builder.turns, ALL, { startMs: BASE_MS, live: { turn: 2 }, limit: 50 }));
    expect(ongoing.querySelectorAll(".turn-h")[0]?.parentElement === ongoing).toBe(true);
    expect([...ongoing.children].slice(0, 3).map((el) => el.classList.contains("live-row") ? "live" : el.className)).toEqual(["turn-h", "tl", "live"]);
  });

  it("caps the turns it renders and offers the rest", () => {
    const root = dom(traceHtml(build(m4Run()).turns, ALL, { startMs: null, live: null, limit: 1 }));
    expect(root.querySelectorAll(".turn-h")).toHaveLength(1);
    expect(root.querySelector("[data-trace-more]")?.textContent).toMatch(/SHOW \d+ OLDER TURNS/);
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

  it("says when there is nothing yet", () => {
    expect(sideTraceHtml([], 20)).toContain("nodata");
    const log = new Log();
    log.add(0, START);
    log.add(1, state());
    expect(sideTraceHtml(build(log.events).turns, 20)).toContain("nodata");
  });
});
