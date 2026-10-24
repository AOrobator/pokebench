import { describe, expect, it } from "vitest";
import {
  LoopDetector,
  LOOP_POLICY,
  semanticState,
  type CompletedCall,
} from "./loop-detection.js";
import type { GameStateSnapshot } from "./game-state.js";
import {parseEvent,type EventBody,type RunEvent} from "./events.js";

const field = (x = 0): GameStateSnapshot => ({
  screen: "overworld",
  started: true,
  name: "RED",
  location: "TOWN",
  map_id: [0, 0],
  position: { x, y: 0 },
  facing: "RIGHT",
  field_controls_locked: false,
  in_battle: false,
  party: [],
  money: 0,
  badges: [],
  play_time_s: 0,
});
const call = (
  name: string,
  state?: GameStateSnapshot,
  buttons?: string[],
): CompletedCall => ({
  name,
  args: buttons === undefined ? {} : { buttons },
  isError: false,
  text: "ok",
  state,
  beforeState: state,
});
const policy = {
  ...LOOP_POLICY,
  planning: 2,
  observation: 2,
  ineffective: 2,
  cycleRepeats: 2,
  rejection: 2,
  recovery: 2,
};
const fixture = () => {
  const events: { kind: string; phase: string }[] = [];
  const detector = new LoopDetector(
    (e) => events.push({ kind: e.kind, phase: e.phase }),
    policy,
  );
  return { detector, events };
};

describe("deterministic loop detection", () => {
  it("recovers from a qualified native story transition even while UI is unavailable", () => {
    const { detector, events } = fixture();
    const before: GameStateSnapshot = {
      ...field(),
      screen: "unknown (transition)",
      field_controls_locked: null,
      story: {
        name_confirmed: true,
        intro_stage: 5,
        rival_stage: 0,
        birch_lab_stage: 0,
        petalburg_gym_stage: 0,
        woods_stage: 0,
        clock_set: false,
        rival_battle_won: false,
        pokedex_received: false,
        running_shoes_received: false,
        starter_tutorial_complete: false,
        rustboro_gym_complete: false,
        stone_badge: false,
        rock_tomb_received: false,
      },
    };
    const state = (
      seq: number,
      body: GameStateSnapshot,
      run = "native_loop",
    ): RunEvent => ({
      ...body,
      v: 1,
      run,
      seq,
      t: "2026-10-12T20:00:00-04:00",
      type: "state",
      turn: 1,
    });
    detector.observe(state(1, before));
    detector.complete(call("get_objectives"));
    detector.complete(call("get_objectives"));
    detector.context();
    const story = before.story;
    if (story == null)
      throw new Error("Native recovery fixture requires story evidence");
    const accepted = { ...before, story: { ...story, clock_set: true } };
    detector.observe(state(2, accepted, "foreign_run"));
    expect(events.filter((e) => e.phase === "recovered")).toHaveLength(0);
    detector.observe(state(3, accepted));
    expect(events.filter((e) => e.phase === "recovered")).toHaveLength(1);
    detector.complete(call("observe", accepted));
    detector.complete(call("observe", accepted));
    expect(detector.stopped).toBe(false);
    // The same true flag and new sequence IDs do not create another recovery.
    detector.complete(call("get_objectives"));
    detector.complete(call("get_objectives"));
    detector.context();
    detector.observe(state(4, accepted));
    expect(events.filter((e) => e.phase === "recovered")).toHaveLength(1);
  });

  it("does not turn missing story data into proof of recovery", () => {
    const { detector, events } = fixture();
    const state = (seq: number, clock: boolean | null): RunEvent => ({
      ...field(),
      v: 1,
      run: "native_loop",
      seq,
      t: "2026-10-12T20:00:00-04:00",
      type: "state",
      turn: 1,
      screen: "unknown (transition)",
      story: {
        name_confirmed: null,
        intro_stage: null,
        rival_stage: null,
        birch_lab_stage: null,
        petalburg_gym_stage: null,
        woods_stage: null,
        clock_set: clock,
        rival_battle_won: null,
        pokedex_received: null,
        running_shoes_received: null,
        starter_tutorial_complete: null,
        rustboro_gym_complete: null,
        stone_badge: null,
        rock_tomb_received: null,
      },
    });
    detector.observe(state(1, null));
    detector.complete(call("get_objectives"));
    detector.complete(call("get_objectives"));
    detector.context();
    detector.observe(state(2, true));
    expect(events.filter((e) => e.phase === "recovered")).toHaveLength(0);
  });

  it("pins production thresholds", () => {
    expect(LOOP_POLICY).toEqual({
      planning: 6,
      observation: 3,
      ineffective: 3,
      cycleRepeats: 3,
      rejection: 2,
      recovery: 6,
    });
  });
  it("warns planning churn despite changed arguments; unchanged observe does not clear it", () => {
    const { detector, events } = fixture();
    detector.complete(call("observe", field()));
    detector.complete(call("set_objective"));
    detector.complete({
      ...call("update_objective"),
      args: { next_decision: "different prose" },
    });
    expect(events).toEqual([{ kind: "planning", phase: "warning" }]);
    expect(detector.context()).toContain("does not execute buttons");
    detector.complete(call("observe", field()));
    detector.complete(call("get_objectives"));
    expect(detector.stopped).toBe(false);
    expect(events.at(-1)).toEqual({ kind: "planning", phase: "supervisor" });
  });
  it("allows warning to reach context before stopping a large same-turn batch", () => {
    const { detector, events } = fixture();
    for (let i = 0; i < 20; i++) detector.complete(call("set_objective"));
    expect(events).toHaveLength(1);
    expect(detector.stopped).toBe(false);
    detector.context();
    detector.complete(call("set_objective"));
    detector.complete(call("set_objective"));
    expect(detector.stopped).toBe(false);
  });
  it("actual press recovers planning, whereas objective wording never does", () => {
    const { detector, events } = fixture();
    detector.complete(call("set_objective"));
    detector.complete(call("get_objectives"));
    detector.context();
    detector.complete(call("press", undefined, ["A"]));
    for (let i = 0; i < 2; i++) detector.complete(call("update_objective"));
    expect(events.map((e) => e.phase)).toEqual([
      "warning",
      "recovered",
      "warning",
    ]);
    expect(detector.stopped).toBe(false);
  });
  it("detects observation stall excluding playtime", () => {
    const { detector, events } = fixture();
    detector.complete(call("observe", field()));
    detector.complete(call("observe", { ...field(), play_time_s: 8 }));
    detector.complete(call("observe", field()));
    expect(events.at(-1)).toEqual({ kind: "observation", phase: "warning" });
    detector.context();
    detector.complete(call("observe", field()));
    detector.complete(call("observe", field()));
    expect(detector.stopped).toBe(false);
  });
  it("does not treat missing or unobservable states as unchanged", () => {
    const { detector, events } = fixture();
    for (let i = 0; i < 10; i++)
      detector.complete(call("observe", { ...field(), screen: "unknown" }));
    for (let i = 0; i < 10; i++)
      detector.complete(call("press", { ...field(), in_battle: true }, ["A"]));
    expect(events).toEqual([]);
    expect(semanticState({ ...field(), field_controls_locked: true })).toBe(
      null,
    );
  });
  it("detects equivalent ineffective single actions, not batches with unknown intermediate effects", () => {
    const { detector, events } = fixture();
    detector.complete(call("observe", field()));
    detector.complete(call("press", field(), ["UP"]));
    detector.complete(call("press", field(), ["UP"]));
    expect(events.at(-1)).toEqual({ kind: "ineffective", phase: "warning" });
    detector.context();
    detector.complete(call("press", field(), ["UP"]));
    detector.complete(call("press", field(), ["UP"]));
    expect(detector.stopped).toBe(false);
    const other = fixture();
    other.detector.complete(call("observe", field()));
    for (let i = 0; i < 10; i++)
      other.detector.complete(call("press", field(), ["LEFT", "RIGHT"]));
    expect(other.events).toEqual([]);
  });
  it("allows new naming letters and cursor changes", () => {
    const { detector, events } = fixture();
    for (let i = 0; i < 12; i++)
      detector.complete(
        call(
          "press",
          {
            ...field(),
            screen: "naming",
            naming: {
              text: "A".repeat(i),
              page: "uppercase",
              column: 0,
              row: 0,
              key: "A",
              ready: true,
            },
          },
          ["A"],
        ),
      );
    expect(events).toEqual([]);
  });
  it("detects repeated two-step state/action cycles, not ordinary backtracking", () => {
    const { detector, events } = fixture();
    detector.complete(call("observe", field()));
    for (let i = 0; i < 4; i++)
      detector.complete({
        ...call("press", field((i + 1) % 2), [i % 2 === 0 ? "RIGHT" : "LEFT"]),
        beforeState: field(i % 2),
      });
    expect(events.at(-1)).toEqual({ kind: "cycle", phase: "warning" });
    detector.context();
    for (let i = 0; i < 4; i++)
      detector.complete({
        ...call("press", field((i + 1) % 2), [i % 2 === 0 ? "RIGHT" : "LEFT"]),
        beforeState: field(i % 2),
      });
    expect(detector.stopped).toBe(false);
    const other = fixture();
    other.detector.complete(call("observe", field()));
    let previous = 0;
    for (const x of [1, 2, 1, 0, 1, 2, 3, 4]) {
      other.detector.complete({
        ...call("press", field(x), [x % 2 ? "RIGHT" : "LEFT"]),
        beforeState: field(previous),
      });
      previous = x;
    }
    expect(other.events).toEqual([]);
  });
  it("detects repeated equivalent corrections across successful metadata, excluding infrastructure", () => {
    const { detector, events } = fixture();
    const bad = {
      ...call("update_objective"),
      isError: true,
      text: "Completion mismatch at state #123: expected true, observed false",
    };
    detector.complete(bad);
    detector.complete(call("get_objectives"));
    detector.complete({ ...bad, text: bad.text.replace("123", "456") });
    expect(events.at(-1)).toEqual({ kind: "rejection", phase: "warning" });
    detector.context();
    detector.complete(bad);
    detector.complete(bad);
    expect(detector.stopped).toBe(false);
    const other = fixture();
    for (let i = 0; i < 12; i++)
      other.detector.complete({
        ...bad,
        text: "GET http://server returned HTTP 503",
      });
    expect(other.events).toEqual([]);
  });
  it("emits one shared episode for overlapping detectors and resets on new information", () => {
    const { detector, events } = fixture();
    detector.complete(call("observe", field()));
    detector.complete(call("set_objective"));
    detector.complete(call("set_objective"));
    detector.context();
    detector.complete(call("observe", field()));
    detector.complete(call("observe", field(1)));
    expect(events.map((e) => e.phase)).toEqual(["warning", "recovered"]);
    expect(detector.stopped).toBe(false);
    expect(detector.context()).toBe(null);
  });
});

it("bounds unknown observation recovery without claiming equivalence", () => {
  const { detector, events } = fixture();
  detector.complete(call("set_objective"));
  detector.complete(call("set_objective"));
  detector.context();
  detector.complete(call("observe", { ...field(), screen: "unknown" }));
  detector.complete(call("observe", { ...field(), screen: "unknown" }));
  expect(detector.stopped).toBe(false);
  expect(events.at(-1)).toEqual({ kind: "planning", phase: "supervisor" });
});
it("compares actual pre/post press, including the initial press and asynchronous changes", () => {
  const { detector, events } = fixture();
  detector.complete({
    ...call("press", field(), ["UP"]),
    beforeState: field(),
  });
  detector.complete({
    ...call("press", field(), ["UP"]),
    beforeState: field(),
  });
  expect(events.at(-1)).toEqual({ kind: "ineffective", phase: "warning" });
  const other = fixture();
  other.detector.complete(call("observe", field()));
  for (let i = 0; i < 10; i++)
    other.detector.complete({
      ...call("press", field(), ["UP"]),
      beforeState: field(1),
    });
  expect(other.events).toEqual([]);
  const absent = fixture();
  for (let i = 0; i < 10; i++)
    absent.detector.complete({
      ...call("press", field(), ["UP"]),
      beforeState: undefined,
    });
  expect(absent.events).toEqual([]);
});
it.each([3, 4])(
  "detects length %i cycles with actual transition endpoints",
  (size) => {
    const { detector, events } = fixture();
    for (let i = 0; i < size * 2; i++)
      detector.complete({
        ...call("press", field((i + 1) % size), ["RIGHT"]),
        beforeState: field(i % size),
      });
    expect(events.at(-1)).toEqual({ kind: "cycle", phase: "warning" });
  },
);
it("retains ineffective attempts across objective churn and planning recovery", () => {
  const { detector, events } = fixture();
  detector.complete(call("set_objective"));
  detector.complete(call("set_objective"));
  detector.context();
  detector.complete(call("press", field(), ["UP"]));
  detector.complete(call("update_objective"));
  detector.complete(call("press", field(), ["UP"]));
  expect(events.at(-1)).toEqual({ kind: "ineffective", phase: "warning" });
});
it("allows readable dialogue changes and new battle state without treating unknown phases as unchanged", () => {
  const { detector, events } = fixture();
  for (let i = 0; i < 10; i++)
    detector.complete(
      call(
        "press",
        {
          ...field(),
          world_context: {
            objects: [],
            triggers: [],
            dialogue: `line ${String(i)}`,
          },
        },
        ["A"],
      ),
    );
  for (let i = 0; i < 10; i++)
    detector.complete(
      call("observe", {
        ...field(),
        in_battle: true,
        party: [{ species: "MON", level: 5, hp: i, max_hp: 10 }],
      }),
    );
  expect(events).toEqual([]);
});

it("canonicalizes nested object ordering and ignores unknown partial reads", () => {
  const a = field();
  const b = { ...a, position: { y: 0, x: 0 } };
  expect(semanticState(a)).toBe(semanticState(b));
  expect(
    semanticState({
      ...field(),
      screen: "naming",
      naming: {
        text: "A",
        page: "uppercase",
        row: 0,
        column: 0,
        key: "A",
        ready: false,
      },
    }),
  ).toBe(null);
});

it.each([
  { started: false },
  { map_id: null },
  { position: null },
  { facing: null },
  { field_controls_locked: null },
  { field_controls_locked: true },
  { in_battle: true },
  { screen: "clock" },
] as const)(
  "withholds equivalence for incomplete field state %j",
  (overrides) => {
    expect(semanticState({ ...field(), ...overrides })).toBe(null);
  },
);
it("infrastructure errors neither trigger a loop nor spend an existing recovery budget", () => {
  const { detector, events } = fixture();
  detector.complete(call("set_objective"));
  detector.complete(call("set_objective"));
  detector.context();
  for (let i = 0; i < 10; i++)
    detector.complete({
      ...call("observe"),
      isError: true,
      text: "GET http://server returned HTTP 503",
    });
  expect(detector.stopped).toBe(false);
  expect(events).toEqual([{ kind: "planning", phase: "warning" }]);
});

const qualifiedUi = (
  phase = "name_confirmation",
  selected: string | null = "YES",
  value: string | null = null,
) => ({
  ...field(),
  screen: "unknown (owned UI)",
  field_controls_locked: null,
  active_ui: {
    phase,
    selected,
    ready: true,
    controls: "documentation",
    diagnostic: null,
    value,
  },
});
it("projects qualified UI selected state but excludes controls prose", () => {
  expect(semanticState(qualifiedUi())).not.toBe(null);
  expect(semanticState(qualifiedUi())).not.toBe(
    semanticState(qualifiedUi("name_confirmation", "NO")),
  );
  expect(semanticState(qualifiedUi())).toBe(
    semanticState({
      ...qualifiedUi(),
      active_ui: { ...qualifiedUi().active_ui, controls: "new wording" },
    }),
  );
  expect(semanticState(qualifiedUi("gender_selection", "BOY"))).not.toBe(
    semanticState(qualifiedUi("gender_selection", "GIRL")),
  );
  expect(
    semanticState(qualifiedUi("clock_adjustment", null, "10:00 AM")),
  ).not.toBe(semanticState(qualifiedUi("clock_adjustment", null, "10:01 AM")));
});
it.each([
  { ready: false },
  { ready: null },
  { diagnostic: "unknown owner" },
  { selected: null },
  { selected: "UNKNOWN" },
  { phase: "unqualified_menu" },
])("withholds incomplete or diagnostic UI projection %j", (overrides) => {
  const ui = qualifiedUi();
  expect(
    semanticState({ ...ui, active_ui: { ...ui.active_ui, ...overrides } }),
  ).toBe(null);
});
it("detects ineffective qualified confirmation actions but permits new selection", () => {
  const { detector, events } = fixture();
  detector.complete(call("press", qualifiedUi(), ["UP"]));
  detector.complete(call("press", qualifiedUi(), ["UP"]));
  expect(events.at(-1)).toEqual({ kind: "ineffective", phase: "warning" });
  detector.context();
  detector.complete({
    ...call("press", qualifiedUi("name_confirmation", "NO"), ["DOWN"]),
    beforeState: qualifiedUi(),
  });
  expect(events.at(-1)).toEqual({ kind: "ineffective", phase: "recovered" });
  expect(detector.stopped).toBe(false);
});

it.each([null, "", "13:00 AM", "10:60 AM", "10:00 unknown"])(
  "withholds unqualified clock values %j",
  (value) => {
    expect(semanticState(qualifiedUi("clock_adjustment", null, value))).toBe(
      null,
    );
    expect(semanticState(qualifiedUi("clock_confirmation", "YES", value))).toBe(
      null,
    );
  },
);
it("compares qualified clock choice and ignores unrelated UI value prose", () => {
  expect(
    semanticState(qualifiedUi("clock_confirmation", "YES", "10:00 AM")),
  ).not.toBe(null);
  expect(
    semanticState(qualifiedUi("clock_confirmation", "YES", "10:00 AM")),
  ).not.toBe(
    semanticState(qualifiedUi("clock_confirmation", "NO", "10:00 AM")),
  );
  expect(
    semanticState(qualifiedUi("name_confirmation", "YES", "unrelated")),
  ).toBe(semanticState(qualifiedUi()));
});
it("does not let foreign run events or stale sequences alter detector ownership", () => {
  const { detector, events } = fixture();
  const log = (
    run: string,
    seq: number,
    type: "tool_call" | "tool_result",
  ): RunEvent =>
    type === "tool_call"
      ? {
          v: 1,
          run,
          seq,
          t: "2026-10-12T20:00:00-04:00",
          type,
          turn: 1,
          id: String(seq),
          name: "get_objectives",
          args: {},
        }
      : {
          v: 1,
          run,
          seq,
          t: "2026-10-12T20:00:00-04:00",
          type,
          turn: 1,
          id: String(seq - 1),
          name: "get_objectives",
          text: "ok",
          frames: [],
          duration_ms: 0,
          is_error: false,
        };
  detector.observe(log("owner", 0, "tool_call"));
  detector.observe(log("owner", 1, "tool_result"));
  for (let i = 2; i < 10; i++)
    detector.observe(
      log("foreign", i, i % 2 === 0 ? "tool_call" : "tool_result"),
    );
  detector.observe(log("owner", 1, "tool_result"));
  expect(events).toEqual([]);
  detector.observe(log("owner", 2, "tool_call"));
  detector.observe(log("owner", 3, "tool_result"));
  expect(events).toEqual([{ kind: "planning", phase: "warning" }]);
});

const storyState = (clock: boolean | null): GameStateSnapshot => ({
  ...field(),
  screen: "unknown (transition)",
  story: {
    name_confirmed: null,
    intro_stage: null,
    rival_stage: null,
    birch_lab_stage: null,
    petalburg_gym_stage: null,
    woods_stage: null,
    clock_set: clock,
    rival_battle_won: null,
    pokedex_received: null,
    running_shoes_received: null,
    starter_tutorial_complete: null,
    rustboro_gym_complete: null,
    stone_badge: null,
    rock_tomb_received: null,
  },
});
const nativeEvent = (seq: number, state: GameStateSnapshot): RunEvent => ({
  v: 1,
  run: "qualified_native",
  seq,
  t: "2026-10-12T20:00:00-04:00",
  type: "state",
  turn: 1,
  ...state,
});
it("does not count a repeated native achievement or stale flag as recovery", () => {
  const { detector, events } = fixture();
  detector.observe(nativeEvent(1, storyState(false)));
  detector.complete(call("get_objectives"));
  detector.complete(call("get_objectives"));
  detector.context();
  detector.observe(nativeEvent(2, storyState(true)));
  expect(events.filter((e) => e.phase === "recovered")).toHaveLength(1);
  detector.complete(call("get_objectives"));
  detector.complete(call("get_objectives"));
  detector.context();
  detector.observe(nativeEvent(1, storyState(false)));
  detector.observe(nativeEvent(3, storyState(false)));
  detector.observe(nativeEvent(4, storyState(true)));
  expect(events.filter((e) => e.phase === "recovered")).toHaveLength(1);
});
it("does not infer truck exit without an observed truck baseline", () => {
  const { detector, events } = fixture();
  detector.observe(
    nativeEvent(1, {
      ...storyState(null),
      started: false,
      screen: "intro",
      location: null,
    }),
  );
  detector.complete(call("get_objectives"));
  detector.complete(call("get_objectives"));
  detector.context();
  detector.observe(
    nativeEvent(2, {
      ...storyState(null),
      location: "LITTLEROOT TOWN BRENDANS HOUSE 1F",
    }),
  );
  expect(events.filter((e) => e.phase === "recovered")).toHaveLength(0);
  const valid = fixture();
  valid.detector.observe(
    nativeEvent(1, { ...storyState(null), location: "INSIDE OF TRUCK" }),
  );
  valid.detector.complete(call("get_objectives"));
  valid.detector.complete(call("get_objectives"));
  valid.detector.context();
  valid.detector.observe(
    nativeEvent(2, { ...storyState(null), location: "LITTLEROOT TOWN" }),
  );
  expect(valid.events.filter((e) => e.phase === "recovered")).toHaveLength(1);
});


it("counts repeated ineffective navigation targets and recovers on real movement",()=>{
 const {detector,events}=fixture();const nav=(before:GameStateSnapshot,after:GameStateSnapshot):CompletedCall=>({name:"navigate_to",args:{x:5,y:0,map_id:[0,0]},isError:false,text:"Navigation",beforeState:before,state:after});
 detector.complete(nav(field(),field()));detector.complete(nav(field(),field()));expect(events.at(-1)).toMatchObject({kind:"ineffective",phase:"warning"});
 detector.context();detector.complete(nav(field(),field(1)));expect(events.at(-1)).toMatchObject({kind:"ineffective",phase:"recovered"});
});


it("an arrived/no-action navigation call cannot clear an exposed planning stall",()=>{
 const {detector,events}=fixture();detector.complete(call("observe",field()));detector.complete(call("get_objectives"));detector.complete(call("get_objectives"));detector.context();
 detector.complete({name:"navigate_to",args:{x:0,y:0,map_id:[0,0]},isError:false,text:"arrived;0 attempts",state:field(),beforeState:field(),acted:false});
 expect(events).toEqual([{kind:"planning",phase:"warning"}]);
});

it("keeps passive ineffective-action diagnostics for state-mode act events",()=>{
 const notices: {kind:string;phase:string}[]=[];
 const detector=new LoopDetector(n=>{notices.push(n);},{...LOOP_POLICY,ineffective:2},"diagnostic");
 let seq=0;const emit=(body:EventBody):number=>{const n=seq++;detector.observe(parseEvent(JSON.stringify({v:1,run:"state-input-fixture",seq:n,t:"2026-10-13T20:04:00.000-04:00",...body})));return n;};
 for(let i=0;i<2;i++){
  const before=emit({type:"state",turn:i,...field()});const id=`act-${String(i)}`;
  emit({type:"tool_call",turn:i,id,name:"act",args:{kind:"press",buttons:["UP"]}});
  emit({type:"button_press",turn:i,tool_call_id:id,before_state_seq:before,buttons:["UP"],hold_frames:10,release_frames:8});
  emit({type:"state",turn:i,...field()});emit({type:"tool_result",turn:i,id,name:"act",text:"blocked",is_error:false,duration_ms:1,frames:[]});
 }
 expect(notices).toContainEqual(expect.objectContaining({kind:"ineffective",phase:"would_warn"}));expect(detector.context()).toBeNull();expect(detector.stopped).toBe(false);
});

it("records passive observation stalls for repeated state-mode host waits without fake presses",()=>{
 const notices:{kind:string;phase:string}[]=[];const detector=new LoopDetector(n=>{notices.push(n);},{...LOOP_POLICY,observation:2},"diagnostic");
 let seq=0;const rows:RunEvent[]=[];const emit=(body:EventBody):void=>{const event=parseEvent(JSON.stringify({v:1,run:"host-wait-fixture",seq:seq++,t:"2026-10-13T21:34:00.000-04:00",...body}));rows.push(event);detector.observe(event);};
 for(let i=0;i<3;i++){
  const id=`wait-${String(i)}`;emit({type:"state",turn:i,...field()});
  emit({type:"tool_call",turn:i,id,name:"act",args:{kind:"wait",duration_ms:60}});
  emit({type:"wait_input",turn:i,tool_call_id:id,duration_ms:60});emit({type:"state",turn:i,...field()});
  emit({type:"tool_result",turn:i,id,name:"act",is_error:false,duration_ms:60,text:"waited 60 ms (host time)",frames:[]});
 }
 expect(notices).toContainEqual(expect.objectContaining({kind:"observation",phase:"would_warn"}));expect(rows.filter(e=>e.type==="button_press")).toEqual([]);expect(rows.filter(e=>e.type==="wait_input")).toHaveLength(3);expect(detector.context()).toBeNull();expect(detector.stopped).toBe(false);
});
