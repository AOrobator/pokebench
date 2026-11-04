import {recipeText} from "../../viewer/test-support/recipe-text.js";
import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {GameStateSnapshot} from "./game-state.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures} from "./features.js";
import {flagFeatures,normalizeFeatures,presetFeatures,parsePlayPreset} from "./play-preset.js";
import type {FeatureSet} from "./features.js";
import {LOOP_POLICY,LoopDetector,type CompletedCall,type LoopNotice} from "./loop-detection.js";
import type {RunEvent} from "./events.js";

const LINES = "The box is printed with a POKéMON logo.\nIt's a POKéMON brand moving and delivery service.";

const truck = (x = 2, dialogue: string | null = null): GameStateSnapshot => ({
  screen: "overworld", started: true, name: "KENNY", location: "INSIDE OF TRUCK", map_id: [0, 11],
  position: {x, y: 2}, facing: "down", field_controls_locked: false, in_battle: false, party: [], money: 0, badges: [], play_time_s: 40,
  world_context: {objects: [], triggers: [], dialogue, message: null},
});

const shown = (text = LINES, x = 2): CompletedCall => ({
  name: "press", args: {buttons: ["A"]}, isError: false, text: "dialogue opened; after auto-advance: the conversation closed",
  state: truck(x), beforeState: truck(x, text), dialogue: [text],
});

function detector(on: boolean, messageTruth = false) {
  const notices: LoopNotice[] = [];
  const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", true, () => "SUPERVISOR", false, false, false, messageTruth, false, false, false, on);
  return {d, notices};
}

describe("reopened-dialogue-loop-v1", () => {

  it("OFF: four closed showings of the same lines raise no cycle notice", () => {
    const {d, notices} = detector(false);
    for (let i = 0; i < 4; i++) d.complete(shown());
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: the fourth showing at the same tile warns, and the supervisor briefs", () => {
    const {d, notices} = detector(true);
    d.complete(shown());
    d.complete(shown());
    d.complete(shown());
    expect(notices).toEqual([]);
    d.complete(shown());
    expect(notices.map((n) => n.phase)).toEqual(["warning", "supervisor"]);
    expect(notices[0]).toMatchObject({kind: "cycle", mode: "enforced"});
    expect(notices[1]?.message).toBe("SUPERVISOR");
  });

  it("ON: one showing, a different line, and the same lines after leaving the tile do not count", () => {
    const once = detector(true);
    once.d.complete(shown());
    expect(once.notices).toEqual([]);
    const other = detector(true);
    other.d.complete(shown(LINES));
    other.d.complete(shown(LINES));
    other.d.complete(shown(LINES));
    other.d.complete(shown("It's a POKéMON brand moving and delivery service."));
    other.d.complete(shown("It's a POKéMON brand moving and delivery service."));
    other.d.complete(shown("It's a POKéMON brand moving and delivery service."));
    expect(other.notices.filter((n) => n.kind === "cycle")).toEqual([]);
    const left = detector(true);
    left.d.complete(shown());
    left.d.complete(shown());
    left.d.complete(shown());
    left.d.complete({name: "press", args: {buttons: ["RIGHT"]}, isError: false, text: "ok", state: truck(4), dialogue: []});
    left.d.complete(shown());
    left.d.complete(shown());
    left.d.complete(shown());
    expect(left.notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: a navigate_to, a B press, and an open different line do not continue the count", () => {
    const nav = detector(true);
    for (let i = 0; i < 4; i++) nav.d.complete({...shown(), name: "navigate_to", args: {map_id: [0, 11], x: 2, y: 2}});
    expect(nav.notices.filter((n) => n.kind === "cycle")).toEqual([]);
    const closing = detector(true);
    for (let i = 0; i < 4; i++) closing.d.complete({...shown(), args: {buttons: ["B"]}, requested: {buttons: ["B"]}});
    expect(closing.notices.filter((n) => n.kind === "cycle")).toEqual([]);
    const other = detector(true);
    other.d.complete(shown());
    other.d.complete(shown());
    other.d.complete(shown());
    other.d.complete({...shown("A different line."), state: truck(2, "A different line.")});
    other.d.complete(shown());
    expect(other.notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: the same lines still open do not clear a count already under way", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    d.complete(shown());
    d.complete(shown());
    d.complete(shown());
    d.complete({...shown(), state: truck(2, LINES)});
    expect(notices).toEqual([]);
    d.complete(shown());
    expect(notices.map((n) => n.phase)).toEqual(["warning", "supervisor"]);
  });

  it("ON: a locked menu, a ready interface, a battle, and a missing world context do not count", () => {
    const menu: GameStateSnapshot = {...truck(), field_controls_locked: true, active_ui: {phase: "pc_player_menu", selected: null, ready: true, controls: "Directions select; A chooses", diagnostic: null}};
    const yesno: GameStateSnapshot = {...truck(), field_controls_locked: true, active_ui: {phase: "field_yes_no", selected: "YES", ready: true, controls: "Directions select; A chooses; B cancels", diagnostic: null, details: {options: ["YES", "NO"], selected_index: 0}}};
    const ready: GameStateSnapshot = {...truck(), active_ui: {phase: "field_yes_no", selected: "YES", ready: true, controls: "Directions select; A chooses; B cancels", diagnostic: null, details: {options: ["YES", "NO"], selected_index: 0}}};
    const battle: GameStateSnapshot = {...truck(), in_battle: true};
    const missing: GameStateSnapshot = {...truck(), world_context: null};
    for (const state of [menu, yesno, ready, battle, missing]) {
      const {d, notices} = detector(true);
      for (let i = 0; i < 4; i++) d.complete({...shown(), state});
      expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
    }
  });

  it("ON: a different line still clears the count when that result is locked", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    d.complete(shown());
    d.complete(shown());
    d.complete(shown());
    const locked = {...truck(2, "A different line."), field_controls_locked: true};
    d.complete({...shown("A different line."), state: locked});
    d.complete(shown());
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: a ready message at another tile clears the count", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    d.complete(shown());
    d.complete(shown());
    d.complete(shown());
    const waiting: GameStateSnapshot = {...truck(4), world_context: {objects: [], triggers: [], dialogue: null, message: {phase: "dismiss_wait", cursor: 0, ready: true, identity: "d".repeat(64)}}};
    d.complete({...shown(), state: waiting});
    d.complete(shown());
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: a ready message with no dialogue text is not the free field", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    const waiting: GameStateSnapshot = {...truck(), world_context: {objects: [], triggers: [], dialogue: null, message: {phase: "dismiss_wait", cursor: 0, ready: true, identity: "d".repeat(64)}}};
    for (let i = 0; i < 4; i++) d.complete({...shown(), state: waiting});
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: a message identity with no readable lines does not count, through the recorded state path", () => {
    const notices: LoopNotice[] = [];
    const observers: ((e: RunEvent) => void)[] = [];
    const recorder = {subscribe: (o: (e: RunEvent) => void) => { observers.push(o); }, recordLoopGuard: (n: LoopNotice) => { notices.push(n); }};
    const governor = new Governor({limits: {maxTurns: 50, maxWallMs: 60_000, failureLimit: 3}, retry: () => undefined, abort: () => undefined, now: () => 0});
    attachLoopGuard(recorder, governor, undefined, "enforced", true, () => "SUPERVISOR", false, false, false, true, true, false, false, true);
    let seq = 0;
    const emit = (body: Record<string, unknown>) => {
      seq += 1;
      const event = {v: 1, run: "r", t: "2026-10-18T01:35:00.000-04:00", seq, turn: 52, ...body} as RunEvent;
      for (const o of observers) o(event);
    };
    const hashed = {...truck(), world_context: {objects: [], triggers: [], dialogue: null, message: {phase: "dismiss_wait" as const, cursor: 0, ready: true, identity: "deadbeef"}}};
    for (let i = 0; i < 4; i++) {
      const id = `h${String(i)}`;
      emit({type: "tool_call", id, name: "press", args: {buttons: ["A"]}});
      emit({type: "state", ...hashed});
      emit({type: "button_press", tool_call_id: id, buttons: ["A"], before_state_seq: seq});
      emit({type: "state", ...truck()});
      emit({type: "tool_result", id, name: "press", is_error: false, text: "closed", state_seq: seq});
    }
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: native story progress clears the count", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    const observers = (event: RunEvent) => { d.observe(event); };
    d.complete(shown());
    d.complete(shown());
    d.complete(shown());
    let seq = 0;
    const emit = (state: GameStateSnapshot) => {
      seq += 1;
      observers({v: 1, run: "r", t: "2026-10-18T01:35:00.000-04:00", seq, turn: 60, type: "state", ...state});
    };
    emit(truck());
    emit({...truck(), location: "LITTLEROOT TOWN", map_id: [0, 9]});
    d.complete(shown());
    expect(notices.filter((n) => n.kind === "cycle")).toEqual([]);
  });

  it("ON: a result that still shows the lines does not count as a closed reopening", () => {
    const notices: LoopNotice[] = [];
    const d = new LoopDetector((n) => notices.push(n), LOOP_POLICY, "enforced", false, () => "SUPERVISOR", false, false, false, false, false, false, false, true);
    const open: CompletedCall = {...shown(), state: truck(2, LINES), beforeState: truck()};
    for (let i = 0; i < 4; i++) d.complete(open);
    expect(notices).toEqual([]);
  });

  it("ON: navigation truth still says reopening the message is not story progress", () => {
    const {d, notices} = detector(true, true);
    for (let i = 0; i < 4; i++) d.complete(shown());
    expect(notices[0]?.message).toContain("Reopening the same message is not story progress.");
  });
});
