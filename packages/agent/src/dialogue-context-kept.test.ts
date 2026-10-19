import { readFileSync } from "node:fs";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { ALL_ON, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, type FeatureSet } from "./features.js";
import { DOUBLE_WINDOW, OMITTED_FRAME, WINDOW, contextWindow, dialogueUnits, slideWindow, type Window } from "./harness.js";
import { SupervisorBriefing } from "./loop-supervisor.js";
import { contextTools } from "./play-wiring.js";
import { checkEvent } from "./events.js";
import { IN_GAME } from "../test-support/events.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

type ToolResultEvent = Extract<RunEvent, { type: "tool_result" }>;
type AssistantEvent = Extract<RunEvent, { type: "assistant" }>;
type AdvanceEvent = Extract<RunEvent, { type: "dialogue_auto_advance" }>;
type LoopGuardEvent = Extract<RunEvent, { type: "loop_guard" }>;
interface Fixture { readonly source: string; readonly events: readonly RunEvent[]; readonly control: { readonly source: string; readonly event: ToolResultEvent } }

// Real events of bundle run 2026-10-15T23-47-41_qwen36-gpu1_3f21 (seq 0–3310) and one control readout (2919 seq 1862).
const FIXTURE = JSON.parse(readFileSync(new URL("../test-support/dialogue-context-3f21.json", import.meta.url), "utf8")) as Fixture;
const EVENTS = FIXTURE.events;
const RUN_FEATURES: FeatureSet = featuresOf(EVENTS.flatMap((e) => (e.type === "run_start" ? e.harness_features : [])));
const OFF: FeatureSet = { ...RUN_FEATURES, "dialogue-context-kept-v1": false };
const ON: FeatureSet = { ...RUN_FEATURES, "dialogue-context-kept-v1": true };

const T98 = EVENTS.find((e): e is ToolResultEvent => e.type === "tool_result" && e.seq === 1776);
const MOM = EVENTS.find((e): e is AdvanceEvent => e.type === "dialogue_auto_advance" && e.seq === 1773);
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const frame = (i: number): ImageContent => ({ type: "image", data: `frame${String(i)}`, mimeType: "image/png" });

// The conversation the agent loop held before `turn`: task, then each reply and its tool results (frames first, as recorded).
function history(turn: number): AgentMessage[] {
  const results = new Map(EVENTS.flatMap((e) => (e.type === "tool_result" ? [[e.id, e] as const] : [])));
  const messages: AgentMessage[] = [{ role: "user", content: "Play.", timestamp: 0 }];
  for (const e of EVENTS) {
    if (e.type !== "assistant" || e.turn >= turn) continue;
    const reply: AssistantEvent = e;
    if (reply.tool_calls.length === 0) throw new Error(`turn ${String(reply.turn)} called no tool; this fixture has none before T107`);
    const assistant: AssistantMessage = { role: "assistant", content: [{ type: "thinking", thinking: reply.thinking }, ...reply.tool_calls.map((c) => ({ type: "toolCall" as const, id: c.id, name: c.name, arguments: c.args as Record<string, unknown> }))], api: "openai-completions", provider: "local-gateway", model: "qwen36", usage, stopReason: "toolUse", timestamp: 0 };
    messages.push(assistant);
    for (const c of reply.tool_calls) {
      const r = results.get(c.id);
      if (r === undefined) continue;
      const result: ToolResultMessage = { role: "toolResult", toolCallId: c.id, toolName: r.name, content: [...r.frames.map((_, i) => frame(i)), { type: "text", text: r.text }], isError: r.is_error, timestamp: 0 };
      messages.push(result);
    }
  }
  return messages;
}
const textOf = (m: AgentMessage | undefined): string => (m?.role === "toolResult" ? m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n") : "");
const resultFor = (messages: AgentMessage[], id: string): AgentMessage | undefined => messages.find((m) => m.role === "toolResult" && m.toolCallId === id);
const contextText = (messages: AgentMessage[]): string => messages.map(textOf).join("\n");

describe("dialogue-context-kept-v1: collapsed results keep their dialogue (3f21 T98 → T107)", () => {
  const before107 = history(107);
  const off = slideWindow(before107, contextWindow(OFF));
  const on = slideWindow(before107, contextWindow(ON));
  const id = T98?.id ?? "";
  const recorded = T98?.text ?? "";
  const start = recorded.indexOf("Dialogue shown during this call");
  const block = recorded.slice(start, recorded.indexOf("\n\n", start));
  const TODAY = `Navigation: a message is waiting for A or B; dismiss it with B, then call navigate_to again; 0 ordinary button attempts. · LITTLEROOT TOWN BRENDANS HOUSE 1F (X=4, Y=5, facing left) ${OMITTED_FRAME}`;

  it("rebuilds the recorded T107 context shape: 16 replies, 4 whole results with frames, the T98 result collapsed", () => {
    expect(off).toHaveLength(33);
    expect(off.filter((m) => m.role === "toolResult" && m.content.some((p) => p.type === "image"))).toHaveLength(4);
    expect(textOf(resultFor(off, id))).toBe(TODAY);
    expect(contextText(off)).not.toContain("next door");
  });

  it("ON: the T107 context carries MOM's eight T98 pages verbatim, with speakers, after today's summary line", () => {
    expect(block).toMatch(/^Dialogue shown during this call \(8 pages, in order, whole\):\n1\. turn 98 · /);
    expect(textOf(resultFor(on, id))).toBe(`${TODAY}\n${block}`);
    const text = contextText(on);
    for (const page of MOM?.pages ?? []) expect(text).toContain(`: "${page.text}"`);
    expect(MOM?.pages).toHaveLength(8);
    expect(text).toContain(`MOM (sprite kind, not a name): "He lives right next door, so you should\ngo over and introduce yourself."`);
  });

  it("ON changes nothing else: same messages, same frames, and every other collapsed result is byte-identical", () => {
    expect(on).toHaveLength(off.length);
    on.forEach((m, i) => {
      const o = off[i];
      if (m.role !== "toolResult" || o?.role !== "toolResult") { expect(m).toEqual(o); return; }
      const units = dialogueUnits(textOf(resultFor(before107, m.toolCallId)));
      expect(textOf(m)).toBe(units.length === 0 ? textOf(o) : `${textOf(o)}\n${units.join("\n")}`);
      expect(m.content.filter((p) => p.type === "image")).toEqual(o.content.filter((p) => p.type === "image"));
    });
  });

  it("keeps every turn of the run whole or with its dialogue: no collapsed result ever loses a dialogue page", () => {
    for (let turn = 2; turn <= 107; turn += 1) {
      const all = history(turn);
      for (const m of slideWindow(all, contextWindow(ON))) {
        if (m.role !== "toolResult") continue;
        const full = textOf(resultFor(all, m.toolCallId));
        for (const unit of dialogueUnits(full)) expect(textOf(m)).toContain(unit);
      }
    }
  });
});

describe("dialogueUnits: what a collapsed result keeps", () => {
  it("keeps the control arm's Dialog line whole (2919 seq 1862: MOM's next-door pages) and nothing else", () => {
    const text = FIXTURE.control.event.text;
    expect(dialogueUnits(text)).toEqual([`Dialog: "Oh, yes. One of DAD's friends lives in town. | PROF. BIRCH is his name. | He lives right next door, so you should go over and introduce yourself."`]);
    const result: ToolResultMessage = { role: "toolResult", toolCallId: "c", toolName: "press", content: [frame(0), { type: "text", text }], isError: false, timestamp: 0 };
    const filler = Array.from({ length: 6 }, (_, i): AgentMessage[] => [{ role: "assistant", content: [{ type: "toolCall", id: `f${String(i)}`, name: "press", arguments: {} }], api: "openai-completions", provider: "p", model: "m", usage, stopReason: "toolUse", timestamp: 0 }, { role: "toolResult", toolCallId: `f${String(i)}`, toolName: "press", content: [{ type: "text", text: "pressed A\nLocation: X" }], isError: false, timestamp: 0 }]).flat();
    const task: AgentMessage = { role: "user", content: "Play.", timestamp: 0 };
    const reply: AgentMessage = { role: "assistant", content: [{ type: "toolCall", id: "c", name: "press", arguments: {} }], api: "openai-completions", provider: "p", model: "m", usage, stopReason: "toolUse", timestamp: 0 };
    const kept = slideWindow([task, reply, result, ...filler], { ...WINDOW, keepDialogue: true });
    expect(textOf(kept[2])).toBe(`pressed A · LITTLEROOT TOWN BRENDANS HOUSE 1F (X=4, Y=5, facing left) ${OMITTED_FRAME}\nDialog: "Oh, yes. One of DAD's friends lives in town. | PROF. BIRCH is his name. | He lives right next door, so you should go over and introduce yourself."`);
    expect(textOf(slideWindow([task, reply, result, ...filler], WINDOW)[2])).toBe(`pressed A · LITTLEROOT TOWN BRENDANS HOUSE 1F (X=4, Y=5, facing left) ${OMITTED_FRAME}`);
  });

  it("keeps nothing from a readout with no open message or a withheld menu", () => {
    expect(dialogueUnits("pressed A\n\nScreen: overworld\nDialog: none\nLocation: X")).toEqual([]);
    expect(dialogueUnits("Screen: menu\nDialog: detailed menu text unprovided\nMenu: detailed controls unprovided")).toEqual([]);
    expect(dialogueUnits("Navigation: arrived; 3 ordinary button attempts.\nDialogue auto-advance: the harness pressed B 0 times to advance the dialogue; stopped: x.\nNo complete dialogue page was shown during this call.\n\nScreen: overworld")).toEqual([]);
  });

  it("keeps an auto-advance block and an open Dialog line together, in the order shown", () => {
    const text = `pressed A\nDialogue auto-advance: the harness pressed B 1 time to advance the dialogue; stopped: menu YES/NO is open.\nDialogue shown during this call (2 pages, in order, whole):\n1. turn 7 · ROOM (map 1/0) · at 1,2 · MOM: "MOM: Hi!\nAre you ready?"\n2. turn 7 · ROOM (map 1/0) · at 1,2 · MOM: "Shall we go?"\n\nScreen: overworld\nDialog: "Shall we go?"\nLocation: ROOM`;
    expect(dialogueUnits(text)).toEqual([`Dialogue shown during this call (2 pages, in order, whole):\n1. turn 7 · ROOM (map 1/0) · at 1,2 · MOM: "MOM: Hi!\nAre you ready?"\n2. turn 7 · ROOM (map 1/0) · at 1,2 · MOM: "Shall we go?"`, `Dialog: "Shall we go?"`]);
  });

  it("never shortens a page list it cannot bound: at the end of the text, or with fewer pages than its header says", () => {
    const tail = `Navigation: x\nDialogue shown during this call (1 page, in order, whole):\n1. turn 3 · ROOM · MOM: "Hi."`;
    expect(dialogueUnits(tail)).toEqual([tail.slice(tail.indexOf("Dialogue shown"))]);
    const short = `Dialogue shown during this call (3 pages, in order, whole):\n1. turn 3 · ROOM · MOM: "Hi."\n2. turn 3 · ROOM · MOM: "Bye."\n\nScreen: overworld`;
    expect(dialogueUnits(short)).toEqual([short]);
  });

  it("keeps a get_dialogue or recall_dialogue result whole when it collapses", () => {
    for (const name of ["get_dialogue", "recall_dialogue"]) {
      const text = `DIALOGUE RECORD: pages the harness advanced through this run, newest first, whole. Past text; the current screen overrides it. 1 of 1 page match.\n#1773 turn 98 · ROOM · MOM: "He lives right next door, so you should\ngo over and introduce yourself."`;
      const task: AgentMessage = { role: "user", content: "Play.", timestamp: 0 };
      const call = (i: string, tool: string): AgentMessage => ({ role: "assistant", content: [{ type: "toolCall", id: i, name: tool, arguments: {} }], api: "openai-completions", provider: "p", model: "m", usage, stopReason: "toolUse", timestamp: 0 });
      const result = (i: string, tool: string, body: string): AgentMessage => ({ role: "toolResult", toolCallId: i, toolName: tool, content: [{ type: "text", text: body }], isError: false, timestamp: 0 });
      const filler = Array.from({ length: 6 }, (_, i) => [call(`f${String(i)}`, "press"), result(`f${String(i)}`, "press", "pressed A\nLocation: X")]).flat();
      const messages = [task, call("r", name), result("r", name, text), ...filler];
      expect(textOf(slideWindow(messages, { ...WINDOW, keepDialogue: true })[2])).toBe(text);
      expect(textOf(slideWindow(messages, WINDOW)[2])).toBe(text.split("\n")[0]);
    }
  });
});

describe("dialogue-context-kept-v1 registry and production wiring", () => {
  it("is a default-off guidance switch recorded last that needs no other switch", () => {
    expect(featureInfo("dialogue-context-kept-v1")).toMatchObject({ group: "guidance", needs: null, switchable: true });
    expect(featureInfo("dialogue-context-kept-v1").description).toContain(" Off: ");
    expect(playHarnessFeatures(ALL_ON, null).at(-77)).toBe("dialogue-context-kept-v1");
    expect(playHarnessFeatures({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false }, null)).not.toContain("dialogue-context-kept-v1");
    expect(dependencyProblems({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true })).toEqual([]);
    const older = Object.fromEntries(Object.entries(ALL_ON).filter(([id]) => id !== "dialogue-context-kept-v1")) as Parameters<typeof normalizeFeatures>[0];
    expect("dialogue-context-kept-v1" in older).toBe(false);
    expect(normalizeFeatures(older)["dialogue-context-kept-v1"]).toBe(false);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false })["dialogue-context-kept-v1"]).toBe(false);
  });

  it("OFF keeps the incumbent windows by identity; ON adds keepDialogue to either", () => {
    expect(contextWindow({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false, "double-context-window-v1": false })).toBe(WINDOW);
    expect(contextWindow({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false, "double-context-window-v1": true })).toBe(DOUBLE_WINDOW);
    expect(contextWindow({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true, "double-context-window-v1": false })).toEqual<Window>({ ...WINDOW, keepDialogue: true });
    expect(contextWindow({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true, "double-context-window-v1": true })).toEqual<Window>({ ...DOUBLE_WINDOW, keepDialogue: true });
  });

  it("the play wiring hands the loop the switch's window", () => {
    const recorder = { subscribe: () => () => undefined, recordNavigationContext: () => undefined, recordLedgerContext: () => undefined, recordMilestoneHint: () => undefined, recordBeliefLedger: () => undefined };
    const wiring = (features: FeatureSet) => contextTools(features, recorder, (m) => Promise.resolve(m)).window;
    expect(wiring(ON).keepDialogue).toBe(true);
    expect(wiring(OFF)).toBe(contextWindow(OFF));
    expect(wiring(OFF).keepDialogue).toBeUndefined();
  });
});

describe("dialogue-context-kept-v1: the supervisor cites the last story instruction (both arms)", () => {
  const replay = (features: FeatureSet, before: number): SupervisorBriefing => {
    const b = new SupervisorBriefing(features);
    for (const e of EVENTS) if (e.seq < before) b.observe(e);
    return b;
  };
  const recorded = (seq: number): string => EVENTS.find((e): e is LoopGuardEvent => e.type === "loop_guard" && e.seq === seq)?.message ?? "";
  const pages = (advance: AdvanceEvent | undefined, room: string) => (advance?.pages ?? []).map((p) => `turn ${String(advance?.turn ?? 0)}, ${room}: "${p.text.replace(/\s+/g, " ")}"`).join(" | ");
  const HOUSE = "LITTLEROOT TOWN BRENDANS HOUSE 1F (map 1/0)";
  // After CLOCK_SET (seq 1629, turn 95): Mom's five 2F pages (turn 95, seq 1669), then her eight 1F pages (turn 98) before MOM_RIVAL_INSTRUCTION (seq 1775).
  const ROOM = EVENTS.find((e): e is AdvanceEvent => e.type === "dialogue_auto_advance" && e.seq === 1669);
  const MOM_LINE = `- Dialogue you were shown leading up to the last story step the game confirmed (mom rival instruction at turn 98), oldest first: ${pages(ROOM, "LITTLEROOT TOWN BRENDANS HOUSE 2F (map 1/1)")} | ${pages(MOM, HOUSE)}`;

  it("OFF reproduces the recorded T65 loop supervisor (seq 1010) and T166 stall briefing (seq 3310) byte for byte", () => {
    expect(replay(OFF, 1010).text("ineffective", 65)).toBe(recorded(1010));
    // The bundle's stall briefing (F5, stall-briefing-v1) adds lines to the recorded T166 note; with this switch off every recorded line is still there, in order.
    const stall = replay(OFF, 3310).stallText({ kind: "milestone_drought", minutes: 5 }, 166).split("\n");
    let at = 0;
    for (const line of recorded(3310).split("\n")) { at = stall.indexOf(line, at); expect(at).toBeGreaterThanOrEqual(0); at += 1; }
  });

  it("ON adds MOM's T98 pages, whole and in order, before the three newest pages at T166", () => {
    const off = replay(OFF, 3310).stallText({ kind: "milestone_drought", minutes: 5 }, 166);
    const on = replay(ON, 3310).stallText({ kind: "milestone_drought", minutes: 5 }, 166);
    const newest = "- Recent dialogue you were shown, newest first: ";
    expect(on).toBe(off.replace(newest, `${MOM_LINE}\n${newest}`));
    expect(on).toContain("He lives right next door, so you should go over and introduce yourself.");
    const loop = replay(ON, 3310).text("cycle", 166);
    expect(loop).toContain(`${MOM_LINE}\n${newest}`);
    const textOnly = replay(ON, 3310).textOnly(3, 1, 3);
    expect(textOnly).toContain(`${MOM_LINE}\n${newest}`);
    expect(replay(OFF, 3310).textOnly(3, 1, 3)).not.toContain("leading up to the last story step");
  });

  it("ON at T65 cites the twelve T56 pages that came with Mom's clock instruction", () => {
    const clock = EVENTS.find((e): e is AdvanceEvent => e.type === "dialogue_auto_advance" && e.turn === 56);
    const on = replay(ON, 1010).text("ineffective", 65);
    expect(clock?.pages).toHaveLength(12);
    const line = on.split("\n").find((l) => l.startsWith("- Dialogue you were shown leading up to")) ?? "";
    expect(line.startsWith("- Dialogue you were shown leading up to the last story step the game confirmed (mom clock instruction at turn 56), oldest first: turn 56, LITTLEROOT TOWN (map 0/9): \"MOM: RED, we're here, honey!\"")).toBe(true);
    for (const page of clock?.pages ?? []) expect(line).toContain(`"${page.text.replace(/\s+/g, " ")}"`);
    expect(on.replace(`${line}\n`, "")).toBe(recorded(1010));
  });

  it("says so when no story step has dialogue yet, and is absent when dialogue text is off", () => {
    expect(new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true }).text("planning", 0)).toContain("- Dialogue you were shown leading up to the last story step the game confirmed: none recorded");
    expect(new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true, "active-field-message-buffer-v1": false }).text("planning", 0)).toContain("- Dialogue you were shown leading up to the last story step the game confirmed: not available (dialogue text is off)");
    expect(new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false }).text("planning", 0)).not.toContain("leading up to");
  });

  // The control arm has no auto-advance: pages come from the readout's message buffer, one press at a time.
  const ev = (body: Record<string, unknown>, seq: number, turn: number): RunEvent => checkEvent({ v: 1, run: "ctrl", t: "2026-10-16T00:00:00.000-04:00", turn, seq, ...body });
  const shown = (b: SupervisorBriefing, seq: number, turn: number, dialogue: string | null, location = "HOUSE 1F") => {
    b.observe(ev({ type: "state", ...IN_GAME, started: true, screen: "overworld", location, map_id: [1, 0], position: { x: 4, y: 5 }, facing: "left", world_context: { objects: [], triggers: [], dialogue } }, seq, turn));
    b.observe(ev({ type: "tool_result", id: `r${String(seq)}`, name: "press", is_error: false, duration_ms: 1, text: "ok", frames: [], state_seq: seq }, seq + 1, turn));
  };
  const story = (b: SupervisorBriefing, seq: number, turn: number, name: string, kind = "story", origin = "observed") => { b.observe(ev({ type: "milestone", name, server_timestamp: 1, kind, origin }, seq, turn)); };

  it("bounds the pages by event order, not turn: same-turn pages on either side of a milestone go to the right step", () => {
    const b = new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true });
    shown(b, 10, 5, "Before the first step.");
    story(b, 20, 5, "FIRST_STEP");
    shown(b, 30, 5, "After the first step, same turn.");
    story(b, 40, 5, "SECOND_STEP");
    shown(b, 50, 5, "After the second step, same turn.");
    const line = b.text("cycle", 9).split("\n").find((l) => l.startsWith("- Dialogue you were shown leading up to")) ?? "";
    expect(line).toBe(`- Dialogue you were shown leading up to the last story step the game confirmed (second step at turn 5), oldest first: turn 5, HOUSE 1F (map 1/0): "After the first step, same turn."`);
    const twin = new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true });
    shown(twin, 10, 7, "Told before both.");
    story(twin, 20, 7, "STEP_A");
    story(twin, 21, 7, "STEP_B");
    const walked = twin.text("cycle", 9).split("\n").find((l) => l.startsWith("- Dialogue you were shown leading up to")) ?? "";
    expect(walked).toBe(`- Dialogue you were shown leading up to the last story step the game confirmed (step a at turn 7), oldest first: turn 7, HOUSE 1F (map 1/0): "Told before both."`);
  });

  it("control arm: the readout pages between the previous story step and the latest one, walking back past a step with none", () => {
    const b = new SupervisorBriefing({ ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": true });
    story(b, 1, 1, "NEW_GAME_CREATED", "story", "present_at_start");
    shown(b, 10, 117, "Old clock text.");
    story(b, 20, 117, "CLOCK_SET");
    shown(b, 30, 129, "MOM: Oh! RED, RED! Quick! Come quickly!");
    shown(b, 40, 130, null);
    shown(b, 50, 134, "Oh, yes. One of DAD's friends lives in town. | PROF. BIRCH is his name. | He lives right next door, so you should go over and introduce yourself.");
    story(b, 60, 137, "MOM_RIVAL_INSTRUCTION");
    story(b, 61, 137, "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "navigation");
    story(b, 80, 141, "SOMETHING_SILENT");
    shown(b, 90, 142, "Filler from a neighbor.");
    const line = b.text("cycle", 150).split("\n").find((l) => l.startsWith("- Dialogue you were shown leading up to")) ?? "";
    expect(line).toBe(`- Dialogue you were shown leading up to the last story step the game confirmed (mom rival instruction at turn 137), oldest first: turn 129, HOUSE 1F (map 1/0): "MOM: Oh! RED, RED! Quick! Come quickly!" | turn 134, HOUSE 1F (map 1/0): "Oh, yes. One of DAD's friends lives in town. | PROF. BIRCH is his name. | He lives right next door, so you should go over and introduce yourself."`);
  });
});
