import {humanPlan} from "../../agent/src/human.js";
import { describe, expect, it } from "vitest";
import { BASE_MS, Log, START, assistant, fullRun, m4Run, state } from "../test-support/events.js";
import { ASSUMED_TIMING, RunView, foldUntil, isRunEvent } from "./model.js";

function fold(log: Log): RunView {
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  return view;
}

describe("RunView", () => {
  it("folds a complete run into panel data", () => {
    const view = fold(fullRun());
    expect(view.start?.model.id).toBe("think-swarm");
    expect(view.startMs).toBe(BASE_MS);
    expect(view.end?.reason).toBe("budget");
    expect(view.turn).toBe(2);
    expect(view.isThinking).toBe(false);
    expect(view.lastThought).toEqual({ turn: 2, thinking: "Again.", reply: "", latencyMs: 4000 });
    expect(view.frame).toBe("frames/000009_0.png");
    expect(view.tokens).toEqual({ input: 1200, output: 400 });
    expect(view.latencies).toEqual([2000, 4000]);
    expect(view.lastTps).toBe(75);
    expect(view.context).toEqual({ messages: 3, images: 1, est_tokens: 5000 });
    expect(view.promptTokens).toBe(700);
    expect(view.disk).toEqual({ bytes: 50 * 1024 * 1024, cap_bytes: 500 * 1024 * 1024, percent: 10 });
    expect(view.retry).toEqual({ count: 1, attempt: 1, limit: 3 });
    expect(view.modelErrors).toBe(0);
    expect(view.toolErrors).toBe(0);
    expect(view.compactions).toBe(0);
    expect(view.milestones).toEqual([
      { name: "GAME_RUNNING", ms: BASE_MS + 10, seq: 1 },
      { name: "PLAYER_NAME_SET", ms: BASE_MS + 3100, seq: 7 },
    ]);
    expect(view.state?.location).toBe("LITTLEROOT TOWN");
    expect(view.presses).toEqual([
      { seq: 6, ms: BASE_MS + 3002, buttons: ["A", "UP"], hold: 10, release: 8, assumed: false },
    ]);
    expect(view.thinkingSpans).toEqual([
      { startMs: BASE_MS + 1000, endMs: BASE_MS + 3000 },
      { startMs: BASE_MS + 4000, endMs: BASE_MS + 8000 },
    ]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 3001, endMs: BASE_MS + 3200, name: "press", error: false }]);
    expect(view.errors).toEqual([{ ms: BASE_MS + 8001, kind: "retry", label: "retry 1/3: invalid tool arguments" }]);
    expect(view.bySeq(4)?.type).toBe("assistant");
    expect(view.bySeq(99)).toBeUndefined();
    expect(view.lastMs).toBe(BASE_MS + 9000);
  });

  it("assumes the vendor's normal preset for presses logged without timing", () => {
    const log = new Log();
    log.add(0, START);
    log.add(5, { type: "button_press", turn: 0, tool_call_id: "c", buttons: ["B"] });
    expect(fold(log).presses[0]).toMatchObject({ hold: ASSUMED_TIMING.hold_frames, release: ASSUMED_TIMING.release_frames, assumed: true });
  });

  it("is thinking between turn_start and the assistant reply", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    const view = fold(log);
    expect(view.isThinking).toBe(true);
    expect(view.turnStartMs).toBe(BASE_MS + 100);
    expect(view.lastThought).toBeNull();
    expect(view.thinkingSpans).toEqual([{ startMs: BASE_MS + 100, endMs: null }]);
  });

  it("counts presses that leave location and position unchanged as stuck", () => {
    const log = new Log();
    log.add(0, START);
    expect(fold(log).stuck).toBeNull();
    log.add(1, state());
    log.add(2, state());
    log.add(3, state());
    expect(fold(log).stuck).toEqual({ now: 2, max: 2 });
    log.add(4, state({ position: { x: 6, y: 8 } }));
    expect(fold(log).stuck).toEqual({ now: 0, max: 2 });
    log.add(5, state({ position: { x: 6, y: 8 }, location: "ROUTE 101" }));
    expect(fold(log).stuck).toEqual({ now: 0, max: 2 });
  });

  it("keeps the last measured prompt size when a failed request reports no usage", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, assistant({ usage: { input: 1200, output: 40, cache_read: 8000 } }));
    log.add(2, assistant({ stop_reason: "error", error: "HTTP 500", tool_calls: [], latency_ms: 0, usage: { input: 0, output: 0, cache_read: 0 } }));
    expect(fold(log).promptTokens).toBe(9200);
    expect(fold(new Log()).promptTokens).toBeNull();
  });

  it("tracks model errors, tool errors and compactions as errors-lane marks", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, assistant({ stop_reason: "error", error: "HTTP 500", tool_calls: [], latency_ms: 0 }));
    log.add(2, { type: "tool_call", turn: 1, id: "c9", name: "state", args: {} });
    log.add(3, { type: "tool_result", turn: 1, id: "c9", name: "state", is_error: true, duration_ms: 1, text: "malformed", frames: [] });
    log.add(4, { type: "compaction", turn: 1, from_tokens: 9000, to_tokens: 1000 });
    const view = fold(log);
    expect(view.modelErrors).toBe(1);
    expect(view.toolErrors).toBe(1);
    expect(view.compactions).toBe(1);
    expect(view.lastTps).toBeNull();
    expect(view.context).toBeNull();
    expect(view.errors.map((mark) => mark.kind)).toEqual(["model", "tool", "compaction"]);
    expect(view.errors.map((mark) => mark.label)).toEqual([
      "model error: HTTP 500",
      "state failed: malformed",
      "compacted 9,000 → 1,000",
    ]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 2, endMs: BASE_MS + 3, name: "state", error: true }]);
  });

  it("marks telemetry failures in the errors lane", () => {
    const log = new Log();
    log.add(0, START);
    log.add(7, { type: "telemetry_error", turn: 1, source: "state", message: "HTTP 503" });
    expect(fold(log).errors).toEqual([{ ms: BASE_MS + 7, kind: "telemetry", label: "state read failed: HTTP 503" }]);
  });

  it("labels a model error without a message", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, assistant({ stop_reason: "error", tool_calls: [] }));
    expect(fold(log).errors[0]?.label).toBe("model error: unknown");
  });

  it("closes open thinking and tool spans when the run ends mid-turn", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(200, { type: "tool_call", turn: 1, id: "c1", name: "press", args: {} });
    log.add(900, { type: "run_end", turn: 1, reason: "crash", furthest_milestone: null, turns: 1, wall_ms: 900, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const view = fold(log);
    expect(view.isThinking).toBe(false);
    expect(view.thinkingSpans).toEqual([{ startMs: BASE_MS + 100, endMs: BASE_MS + 900 }]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 200, endMs: BASE_MS + 900, name: "press", error: false }]);
  });

  it("ignores an event it has already applied", () => {
    const log = fullRun();
    const view = fold(log);
    const first = log.events[0];
    if (first === undefined) throw new Error("no events");
    view.apply(first);
    expect(view.events).toHaveLength(log.events.length);
  });

  it("folds only the events at or before a moment", () => {
    const events = fullRun().events;
    const view = foldUntil(events, BASE_MS + 3001);
    expect(view.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(foldUntil(events, BASE_MS - 1).events).toEqual([]);
  });

  it("replays the recorded M4 run", () => {
    const view = new RunView();
    for (const event of m4Run()) view.apply(event);
    expect(view.turn).toBe(4);
    expect(view.frame).toBe("frames/000015_0.png");
    expect(view.state).toBeNull();
    expect(view.stuck).toBeNull();
    expect(view.end?.reason).toBe("budget");
    expect(view.milestones.map((milestone) => milestone.name)).toEqual(["GAME_RUNNING"]);
    expect(view.presses).toHaveLength(1);
    expect(view.presses[0]?.assumed).toBe(true);
    expect(view.toolSpans.map((span) => span.name)).toEqual(["screenshot", "press", "state"]);
  });
});

describe("isRunEvent", () => {
  it("accepts an enveloped event and rejects anything else", () => {
    const [first] = fullRun().events;
    expect(isRunEvent(first)).toBe(true);
    expect(isRunEvent({ ...first, type: "telemetry" })).toBe(false);
    expect(isRunEvent({ ...first, type: "assistant_delta", thinking: "Look", text: "" })).toBe(true);
    expect(isRunEvent({ ...first, seq: "1" })).toBe(false);
    expect(isRunEvent(null)).toBe(false);
    expect(isRunEvent([])).toBe(false);
  });
});

it("keeps legacy vendor state in the log without treating it as accurate RAM state", () => {
  const log = new Log(); log.add(0, START);
  const legacy = log.add(1, { type: "state", turn: 1, mode: "overworld", location: "PETALBURG CITY", position: { x: 0, y: 0 }, facing: null, in_battle: false, party: [], money: 3000, badges: [], play_time_s: 0 });
  const v = fold(log);
  expect(v.events.at(-1)).toEqual(legacy);
  expect(v.state).toBeNull();
  expect(v.legacyState).toBe(true);
});

it("does not count scripted control locks or pre-game null coordinates as navigation stalls", () => {
  const log = new Log(); log.add(0, START);
  log.add(1, state({ started: false, position: null }));
  log.add(2, state({ started: false, position: null }));
  log.add(3, state({ field_controls_locked: true }));
  log.add(4, state({ field_controls_locked: true }));
  expect(fold(log).stuck).toEqual({ now: 0, max: 0 });
});

it("manual probes do not claim model thinking or context usage", () => {
  const log = new Log(); log.add(0, { ...START, harness_features: ["probe"] });
  log.add(1, { type: "turn_start", turn: 1, context: { messages: 0, images: 0, est_tokens: 0 } });
  expect(fold(log).isThinking).toBe(false);
  expect(fold(log).context).toBeNull();
});

it("recovers confirmed clock from recorded RAM, preserving first evidence and replay boundary", () => {
  const log = new Log();
  log.add(0, START);
  const trigger = (variable: number, current_value: number | null) => ({ x: 1, y: 1, elevation: 0, variable, required_value: 5, current_value, condition_met: false, script_pointer: 0x08000000 });
  log.add(1000, state({ world_context: { objects: [], triggers: [trigger(0x4092, 5)], dialogue: null } }));
  log.add(2000, state({ world_context: { objects: [], triggers: [trigger(0x4092, 6)], dialogue: null } }));
  log.add(3000, { type: "milestone", turn: 1, name: "CLOCK_SET", server_timestamp: 3 });
  log.add(4000, state({ world_context: { objects: [], triggers: [trigger(0x4092, 7)], dialogue: null } }));
  expect(foldUntil(log.events, BASE_MS + 1999).milestones).toEqual([]);
  expect(foldUntil(log.events, BASE_MS + 5000).milestones).toEqual([{ name: "CLOCK_SET", ms: BASE_MS + 2000, seq: 2, derived: true }]);
  const late = new Log();
  late.add(0, START);
  late.add(1000, state({ world_context: { objects: [], triggers: [trigger(0x4092, 7)], dialogue: null } }));
  expect(foldUntil(late.events, BASE_MS + 1000).milestones).toEqual([{ name: "CLOCK_SET", ms: BASE_MS + 1000, seq: 1, derived: true }]);
  for (const [variable, current_value, started] of [[0x4091, 6, true], [0x4092, null, true], [0x4092, 8, true], [0x4092, 6, false]] as const) {
    const view = new RunView();
    const wrong = new Log();
    wrong.add(0, START);
    wrong.add(1000, state({ started, world_context: { objects: [], triggers: [trigger(variable, current_value)], dialogue: null } }));
    wrong.events.forEach((e) => { view.apply(e); });
    expect(view.milestones).toEqual([]);
  }
});

it("does not use historical clock recovery over modern story evidence", () => {
  const log = new Log();
  log.add(0, START);
  log.add(1000, state({story:null,world_context:{objects:[],dialogue:null,triggers:[{x:1,y:1,elevation:0,variable:0x4092,current_value:6,required_value:5,condition_met:false,script_pointer:0x08000000}]}}));
  const mark = log.add(1001,{type:"milestone",turn:1,name:"CLOCK_SET",server_timestamp:2,kind:"story",origin:"present_at_start",evidence:[1]});
  const v = foldUntil(log.events,BASE_MS+2000);
  expect(v.milestones).toEqual([{name:"CLOCK_SET",ms:BASE_MS+1001,seq:mark.seq,kind:"story",origin:"present_at_start",evidence:[1]}]);
});

it("recovers leave-home and rival house from a Clock set save without rewriting a later native receipt", () => {
  const clocked = { name_confirmed: true, intro_stage: 7 as const, rival_stage: 0 as const, birch_lab_stage: 0 as const, petalburg_gym_stage: 0 as const, woods_stage: 0 as const, clock_set: true, rival_battle_won: false, pokedex_received: false, running_shoes_received: false, starter_tutorial_complete: false, rustboro_gym_complete: false, stone_badge: false, rock_tomb_received: false };
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) } });
  const bedroom = log.add(1000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked, badges: [], party: [] }));
  const downstairs = log.add(2000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: clocked, badges: [], party: [] }));
  const town = log.add(3000, state({ location: "LITTLEROOT TOWN", story: clocked, badges: [], party: [] }));
  const rival = log.add(4000, state({ location: "LITTLEROOT TOWN MAYS HOUSE 1F", story: clocked, badges: [], party: [] }));
  const view = fold(log);
  expect(view.milestones.filter(m => m.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || m.name === "RIVAL_HOUSE_ENTERED")).toEqual([
    { name: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", ms: BASE_MS + 3000, seq: town.seq, derived: true, kind: "navigation", origin: "observed", evidence: [bedroom.seq, downstairs.seq, town.seq] },
    { name: "RIVAL_HOUSE_ENTERED", ms: BASE_MS + 4000, seq: rival.seq, derived: true, kind: "navigation", origin: "observed", evidence: [bedroom.seq, rival.seq] },
  ]);
  const recorded = new Log();
  recorded.events.push(...log.events);
  const mark = recorded.add(4100, { type: "milestone", turn: 1, name: "RIVAL_HOUSE_ENTERED", kind: "navigation", origin: "observed", server_timestamp: 1, evidence: [bedroom.seq, rival.seq] });
  const replaced = fold(recorded).milestones.find(m => m.name === "RIVAL_HOUSE_ENTERED");
  expect(replaced?.seq).toBe(mark.seq);
  expect(replaced?.derived).toBeUndefined();
  expect(view.milestones.find(m => m.name === "CLOCK_SET")).toMatchObject({ seq: bedroom.seq, derived: true, origin: "observed", evidence: [bedroom.seq] });
  expect(view.milestones.find(m => m.name === "PLAYER_BEDROOM")).toMatchObject({ seq: bedroom.seq, derived: true, evidence: [bedroom.seq] });
  const rivalRoom = new Log();
  rivalRoom.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "b".repeat(40) } });
  rivalRoom.add(1000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked, badges: [], party: [] }));
  rivalRoom.add(2000, state({ location: "LITTLEROOT TOWN MAYS HOUSE 2F", story: clocked, badges: [], party: [] }));
  expect(fold(rivalRoom).milestones.filter(m => m.name === "PLAYER_BEDROOM")).toHaveLength(1);
  const upstairs = new Log();
  upstairs.add(0, START);
  const beforeClock = { ...clocked, clock_set: false, intro_stage: 5 as const };
  upstairs.add(1000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", screen: "field_transition", story: beforeClock, badges: [], party: [] }));
  const room = upstairs.add(2000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: beforeClock, badges: [], party: [] }));
  expect(fold(upstairs).milestones.find(m => m.name === "PLAYER_BEDROOM")).toMatchObject({ seq: room.seq, derived: true });
  const receipt = new Log();
  receipt.add(0, START);
  receipt.add(1000, state({ location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: clocked, badges: [], party: [] }));
  const nativeClock = receipt.add(1500, { type: "milestone", turn: 1, name: "CLOCK_SET", kind: "story", origin: "observed", server_timestamp: 1, evidence: [1] });
  expect(fold(receipt).milestones.find(m => m.name === "CLOCK_SET")).toMatchObject({ seq: nativeClock.seq });
  expect(fold(receipt).milestones.find(m => m.name === "CLOCK_SET")?.derived).toBeUndefined();
});
it("the split ordering matches the production milestone owner", async () => {
  const {MILESTONE_ORDER: recorded} = await import("../../agent/src/milestones.js");
  const {MILESTONE_ORDER: displayed} = await import("./model.js");
  expect([...displayed]).toEqual(recorded);
});
it("the viewer's depth order and deeper-milestone choice match the agent's", async () => {
  const agent = await import("../../agent/src/milestones.js");
  const viewer = await import("./model.js");
  expect(viewer.DEPTH_ORDER).toEqual(agent.DEPTH_ORDER);
  for (const [current, candidate] of [[null, "FIRST_POKECENTER_HEAL"], ["ROUTE_103", "FIRST_EVOLUTION"], ["ROUTE_103", "RIVAL_MET"], [null, "UNKNOWN"], ["RIVAL_MET", "ROUTE_103"]] as const) expect(viewer.deeperMilestone(current, candidate)).toBe(agent.deeperMilestone(current, candidate));
});

it("replays loop warnings, recovery and stuck termination without conflating retries",()=>{
  const log=new Log();log.add(0,START);
  for(const phase of ["warning","recovered","stop"] as const)log.add(100,{type:"loop_guard",turn:1,kind:"planning",phase,message:"No action <yet>",calls:6,evidence:[1,2]});
  const view=new RunView();for(const event of log.events)view.apply(event);
  expect(view.errors.map(e=>[e.kind,e.label])).toEqual(["warning","recovered","stop"].map((phase,index)=>["loop",`Planning stall ${phase} · #${String(index+1)} · turn 1 · 0:00:00 · 6 completed calls · preceding tool not recorded: No action <yet> · evidence #1, #2 · historical mode unrecorded`]));expect(view.retry).toBe(null);
});

it("shows the push-back and battle observation warnings in the timeline and at the replay cursor (pushback-loop-detection-v1, battle-observation-loop-v1)",async()=>{
 const {PUSHBACK_MESSAGE}=await import("../../agent/src/loop-detection.js");
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"tool_call",turn:146,id:"c146",name:"press",args:{buttons:["UP"]}});
 // The sh02 receipts: the warning at the third push-back, then the supervisor note at the same call.
 log.add(2000,{type:"loop_guard",turn:146,kind:"cycle",mode:"enforced",phase:"warning",message:PUSHBACK_MESSAGE,calls:11,evidence:[2973,3062]});
 log.add(2000,{type:"loop_guard",turn:146,kind:"cycle",mode:"enforced",phase:"supervisor",message:"SUPERVISOR: You are currently looping.",calls:11,evidence:[2973,3062]});
 log.add(3000,{type:"tool_call",turn:452,id:"c452",name:"observe",args:{}});
 log.add(4000,{type:"loop_guard",turn:452,kind:"observation",mode:"enforced",phase:"warning",message:"Repeated observations contain no new reliable game information.",calls:24,evidence:[10079]});
 const view=fold(log);
 expect(view.errors.map(e=>e.label)).toEqual([
  `Short cycle warning · #2 · turn 146 · 0:00:02 · 11 completed calls · preceding tool press: ${PUSHBACK_MESSAGE} · evidence #2973, #3062 · enforced`,
  "Short cycle supervisor message sent to the model · #3 · turn 146 · 0:00:02 · 11 completed calls · preceding tool press: SUPERVISOR: You are currently looping. · evidence #2973, #3062 · enforced",
  "Observation stall warning · #5 · turn 452 · 0:00:04 · 24 completed calls · preceding tool observe: Repeated observations contain no new reliable game information. · evidence #10079 · enforced",
 ]);
 expect(foldUntil(log.events,BASE_MS+1999).errors).toEqual([]);
 expect(foldUntil(log.events,BASE_MS+2000).errors.map(e=>e.kind)).toEqual(["loop","loop"]);
});

it("labels passive thresholds without inventing run termination",()=>{
 const log=new Log();log.add(0,START);const event=log.add(100,{type:"loop_guard",turn:1,kind:"planning",mode:"diagnostic",phase:"would_stop",message:"threshold",calls:12,evidence:[1]});const view=fold(log);
 expect(view.loopLabel(event as Extract<typeof event,{type:"loop_guard"}>)).toContain("diagnostic: would stop");expect(view.end).toBe(null);expect(view.retry).toBe(null);
});

it("labels repeated trigger scripts distinctly in Activity History",()=>{
 const log=new Log();log.add(0,START);const event=log.add(100,{type:"loop_guard",turn:2,kind:"trigger_script",mode:"enforced",phase:"warning",message:"Repeated Gym script",calls:9,evidence:[20,40]});
 const view=fold(log);expect(view.loopLabel(event as Extract<typeof event,{type:"loop_guard"}>)).toMatch(/^Repeated trigger script warning/);
 expect(view.errors[0]?.label).toContain("evidence #20, #40");
});

it("folds human simultaneous intervals and saved samples for replay without inferred release time",()=>{
 const log=new Log();log.add(0,START);
 log.add(210,{type:"human_input",turn:0,id:1,start_frame:0,end_frame:6,buttons:["A","UP"],start_ms:BASE_MS+100,end_ms:BASE_MS+200,request_seq:1,session:"keyboard"});
 log.add(310,{type:"human_input",turn:0,id:2,start_frame:6,end_frame:12,buttons:[],start_ms:BASE_MS+200,end_ms:BASE_MS+300,request_seq:2,session:"idle"});
 log.add(315,{type:"human_sample",turn:0,frame:12,paused:false,screenshot:{path:"frames/000004_0.png",sha1:"a".repeat(40)}});
 const view=fold(log);expect(view.frame).toBe("frames/000004_0.png");expect(view.humanFrame).toBe(12);
 expect(view.presses).toEqual([{seq:1,ms:BASE_MS+100,endMs:BASE_MS+200,buttons:["A","UP"],hold:6,release:0,assumed:false,startFrame:0,endFrame:6}]);
 expect(view.thinkingSpans).toEqual([]);expect(view.toolSpans).toEqual([]);
 expect(foldUntil(log.events,BASE_MS+250).frame).toBe(null);expect(foldUntil(log.events,BASE_MS+315).frame).toBe(view.frame);
});
it('keeps a human hold immediately after resume outside the recorded pause interval',()=>{
 const log=new Log();log.add(0,START);
 log.add(2000,{type:'operator_control',turn:0,action:'pause',status:'applied',request:1,emulator_frozen:true});
 log.add(32000,{type:'operator_control',turn:0,action:'resume',status:'applied',request:2,paused_ms:30000});
 log.add(32020,{type:'human_input',turn:0,id:2,start_frame:1,end_frame:2,buttons:['A'],start_ms:BASE_MS+32000,end_ms:BASE_MS+32020,request_seq:1,session:'after-pause'});
 const view=fold(log);const hold=view.presses[0];expect(hold).toMatchObject({ms:BASE_MS+32000,endMs:BASE_MS+32020,hold:1});
 expect(view.control.pausedBefore(hold?.ms??0)).toBe(30000);
 expect(view.control.pausedBefore(hold?.endMs??0)).toBe(30000);
 expect((hold?.endMs??0)-(hold?.ms??0)).toBe(20);
});

it("recovers only confirmed historical route visits with first state evidence and replay bounds", () => {
  const log = new Log(); log.add(0, START); log.add(100, state());
  const first = log.add(1000, state({location:"ROUTE101",map_id:[0,16]}));
  log.add(2000, state({location:"ROUTE101",map_id:[0,16]}));
  expect(foldUntil(log.events,BASE_MS+999).milestones).toEqual([]);
  expect(foldUntil(log.events,BASE_MS+3000).milestones).toEqual([{name:"ROUTE_101",ms:BASE_MS+1000,seq:first.seq,derived:true,kind:"navigation",origin:"observed",evidence:[first.seq]}]);
  expect(log.events.filter(e=>e.type==="milestone")).toHaveLength(0);
  for (const overrides of [{location:"ROUTE104 MR BRINEYS HOUSE",map_id:[0,19] as [number,number]},{location:"ROUTE104",map_id:[0,18] as [number,number]},{location:"ROUTE104",map_id:[0,19] as [number,number],screen:"field_transition" as const},{location:"ROUTE104",map_id:[0,19] as [number,number],in_battle:true},{location:"ROUTE104",map_id:[0,19] as [number,number],started:false}]) {
    const wrong = new Log(); wrong.add(0,START); wrong.add(100,state(overrides)); expect(fold(wrong).milestones).toEqual([]);
  }
});
it("keeps resumed route visits separate and lets modern recording own route milestones", () => {
  const resumed = new Log(); resumed.add(0,{...START,start_state:{kind:"save_state",path:"resume",sha1:"0".repeat(40)}}); resumed.add(100,state({location:"ROUTE 102",map_id:[0,17]}));
  expect(fold(resumed).milestones[0]).toMatchObject({name:"ROUTE_102",origin:"present_at_start",evidence:[1]});
  const modern = new Log(); modern.add(0,{...START,harness_features:["native-progress-activity-v1"]}); modern.add(100,state({location:"ROUTE103",map_id:[0,18]})); expect(fold(modern).milestones).toEqual([]);
});
it('uses a native route receipt instead of a provisional recovery when present',()=>{
 const log=new Log();log.add(0,START);log.add(100,state());log.add(200,state({location:'ROUTE102',map_id:[0,17]}));
 const native=log.add(201,{type:'milestone',turn:1,name:'ROUTE_102',server_timestamp:1,kind:'navigation',origin:'observed',evidence:[2]});
 expect(fold(log).milestones).toEqual([{name:'ROUTE_102',seq:native.seq,ms:BASE_MS+201,kind:'navigation',origin:'observed',evidence:[2]}]);
});

it('recovers later historical visits only from exact supported field maps',()=>{
 for(const [name,location,map] of [['ROUTE_115','ROUTE115',[0,30]],['ROUTE_116','ROUTE 116',[0,31]],['RUSTURF_TUNNEL','RUSTURF TUNNEL',[24,4]]] as const){
  const log=new Log();log.add(0,START);log.add(100,state());const visit=log.add(200,state({location,map_id:[...map]}));
  expect(fold(log).milestones).toEqual([{name,ms:BASE_MS+200,seq:visit.seq,derived:true,kind:'navigation',origin:'observed',evidence:[visit.seq]}]);
  const modern=new Log();modern.add(0,{...START,harness_features:['remaining-native-milestones-v1']});modern.add(100,state({location,map_id:[...map]}));expect(fold(modern).milestones).toEqual([]);
  const wrong=new Log();wrong.add(0,START);wrong.add(100,state({location,map_id:[0,0]}));expect(fold(wrong).milestones).toEqual([]);
  const native=log.add(201,{type:'milestone',turn:1,name,kind:'navigation',origin:'observed',server_timestamp:1,evidence:[visit.seq]});
  expect(fold(log).milestones).toEqual([{name,ms:BASE_MS+201,seq:native.seq,kind:'navigation',origin:'observed',evidence:[visit.seq]}]);
 }
});

it("shows a text-only supervisor note in the error lane", () => {
  const log = new Log();
  log.add(0, START);
  log.add(5000, { type: "text_only_supervisor", turn: 4, replies: 3, note: 2, limit: 3, text: "SUPERVISOR: Your last 3 replies called no tool." });
  expect(fold(log).errors).toEqual([{ ms: expect.any(Number) as number, kind: "loop", label: "Text-only supervisor 2/3 · turn 4: SUPERVISOR: Your last 3 replies called no tool." }]);
});

it("labels stall-briefing-v1 notes in the activity history by stall",()=>{
 const log=new Log();log.add(0,START);
 const cycle=log.add(100,{type:"loop_guard",turn:3,kind:"map_cycle",mode:"enforced",phase:"supervisor",message:"SUPERVISOR: You are stalling.",calls:9,evidence:[1,2]});
 const drought=log.add(200,{type:"loop_guard",turn:4,kind:"milestone_drought",mode:"enforced",phase:"supervisor",message:"SUPERVISOR: no new story milestone",calls:12,evidence:[2]});
 const view=fold(log);
 expect(view.loopLabel(cycle as Extract<typeof cycle,{type:"loop_guard"}>)).toMatch(/^Map back-and-forth supervisor message sent to the model/);
 expect(view.loopLabel(drought as Extract<typeof drought,{type:"loop_guard"}>)).toMatch(/^Milestone drought supervisor message sent to the model/);
 const dwell=log.add(300,{type:"loop_guard",turn:5,kind:"interface_dwell",mode:"enforced",phase:"supervisor",message:"SUPERVISOR: You are stalling. You have made 30 calls in the nickname naming editor",calls:30,evidence:[2,3]});
 expect(fold(log).loopLabel(dwell as Extract<typeof dwell,{type:"loop_guard"}>)).toMatch(/^Interface dwell supervisor message sent to the model/);
});

it("modern human headers suppress recovery of missing new measurement events",()=>{
 const plan=humanPlan("unused","human-test",8040,"f3ae088181bf583e55daf962a92bb46f4f1d07b7");
 if(plan.controller===undefined)throw Error("human plan must declare its controller");
 const log=new Log();log.add(0,{...START,controller:plan.controller,harness_features:[...plan.harnessFeatures]});
 const flags=Buffer.alloc(300);flags[0x8f>>3]=128;
 log.add(1,state({story_progress:{flags:flags.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false}}));
 const view=fold(log);
 expect(view.milestones.filter(m=>m.name==="DEVON_GOODS_RECOVERED")).toEqual([]);
 expect(view.start?.harness_features).toContain("all-gym-story-milestones-v1");
});

describe("party sample lifetime", () => {
  it("uses populated historical samples even without a play clock and never reads ahead in replay", () => {
    const log = new Log();
    log.add(0, START);
    const populated = log.add(1, state({ play_time_s: null }));
    log.add(2, state({ party: [], play_time_s: null, name: null, money: null }));
    log.add(3, state({ party: [] }));
    expect(foldUntil(log.events, BASE_MS).partyState).toBeNull();
    expect(foldUntil(log.events, BASE_MS + 2).partyState).toEqual(populated);
    expect(foldUntil(log.events, BASE_MS + 3).partyState?.party).toEqual([]);
    expect(new RunView().partyState).toBeNull();
  });
});

it("does not mistake an uninitialized field transition for a new game", () => {
  const log = new Log();
  const prior = log.add(1, state());
  log.add(2, state({ started: false, screen: "field_transition", party: [], play_time_s: null }));
  expect(fold(log).partyState).toEqual(prior);
});
