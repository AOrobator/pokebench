import {createHash} from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { RUN_START_META as START_META } from "../test-support/events.js";
import { assistant, toolCall, userImage, userText } from "../test-support/pi.js";
import { parseEvent, type RunEvent } from "./events.js";
import { FrameStore } from "./frames.js";
import type { GameStateSnapshot } from "./game-state.js";
import type { SeenMilestone } from "./milestones.js";
import { RecorderError, RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
import {gameTools} from "./game-tools.js";
import {withNavigation} from "./navigation.js";
import {toolSwitches} from "./play-config.js";
import {flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";


const STATE: GameStateSnapshot = {
  screen: "overworld",
  started: true,
  name: "MAY",
  location: "LITTLEROOT TOWN",
  map_id: [0, 9],
  position: { x: 5, y: 8 },
  facing: "down",
  in_battle: false,
  party: [],
  money: 0,
  badges: [],
  play_time_s: 12,
};

function harness(milestoneBatches: SeenMilestone[][] = [], capBytes = 1_000_000): {
  recorder: RunRecorder;
  log: RunLog;
  advance: (ms: number) => void;
} {
  const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
  const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_rrrr");
  const frames = new FrameStore(runsRoot, capBytes, () => undefined);
  let clock = 1000;
  const batches = [...milestoneBatches];
  const recorder = new RunRecorder({
    log,
    frames,
    milestones: { poll: () => Promise.resolve(batches.shift() ?? []) },
    gameState: { read: () => Promise.resolve(STATE) },
    now: () => clock,
  });
  return {
    recorder,
    log,
    advance: (ms) => {
      clock += ms;
    },
  };
}

function events(log: RunLog): RunEvent[] {
  return readFileSync(log.eventsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => parseEvent(line));
}

function update(): AgentEvent {
  const partial = assistant({ text: "" });
  return {
    type: "message_update",
    message: partial,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x", partial },
  };
}

function delta(kind: "thinking_delta" | "text_delta" | "toolcall_delta", text: string): AgentEvent {
  const partial = assistant({ text: "" });
  return { type: "message_update", message: partial, assistantMessageEvent: { type: kind, contentIndex: 0, delta: text, partial } };
}

describe("RunRecorder streaming", () => {
  it("writes thinking and text as batched deltas while the reply streams, then the full reply", async () => {
    const { recorder, log, advance } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    advance(100);
    await recorder.emit(delta("thinking_delta", "Look"));
    advance(100);
    await recorder.emit(delta("thinking_delta", " at"));
    advance(60);
    await recorder.emit(delta("thinking_delta", " it."));
    await recorder.emit(delta("toolcall_delta", '{"buttons"'));
    advance(10);
    await recorder.emit(delta("text_delta", "Go"));
    await recorder.emit({ type: "message_end", message: assistant({ thinking: "Look at it.", text: "Go" }) });
    const streamed = events(log).filter((e) => e.type === "assistant_delta" || e.type === "assistant");
    expect(streamed.map((e) => (e.type === "assistant_delta" ? [e.type, e.thinking, e.text] : [e.type]))).toEqual([
      ["assistant_delta", "Look at it.", ""],
      ["assistant_delta", "", "Go"],
      ["assistant"],
    ]);
  });

  it("drops an unflushed tail from a turn that never finished, without leaking it into the next turn", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit(delta("thinking_delta", "half a thou"));
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "message_end", message: assistant({ thinking: "fresh", text: "" }) });
    expect(events(log).filter((e) => e.type === "assistant_delta")).toEqual([]);
  });
});

describe("RunRecorder", () => {
  it("records harness-owned running without inventing a walking request", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.emit({type:"tool_execution_start",toolCallId:"run",toolName:"press",args:{buttons:["UP"],walking:true}});
    recorder.buttonPress("run", ["UP"], { hold_frames: 10, release_frames: 8 }, undefined, { automatic_running: true, requested_held_buttons: ["B"] });
    const call=events(log).find(event=>event.type==="tool_call");
    const press=events(log).find(event=>event.type==="button_press");
    expect(call,"raw stale input remains auditable on the tool call").toMatchObject({type:"tool_call",args:{buttons:["UP"],walking:true}});
    expect(press).toMatchObject({type:"button_press",automatic_running:true,requested_held_buttons:["B"]});
    expect(press,"running receipt must omit the ignored legacy walking modifier").not.toHaveProperty("walking");
  });

  it("records a full turn: context, assistant, tool call, press, milestone, frame result", async () => {
    const { recorder, log, advance } = harness([
      [{ name: "GAME_RUNNING", serverTimestamp: 10 }],
      [{ name: "PLAYER_NAME_SET", serverTimestamp: 20 }],
    ]);
    await recorder.start(START_META);
    await recorder.emit({ type: "message_end", message: userText("x".repeat(48)) });
    expect(await recorder.transformContext([userText("x".repeat(48)), userImage()])).toHaveLength(2);
    advance(120);
    await recorder.emit(update());
    advance(780);
    const reply = assistant({
      thinking: "Press A.",
      text: "Pressing.",
      toolCalls: [toolCall("call_1", "press", { buttons: ["A"] })],
      stopReason: "toolUse",
      input: 100,
      output: 20,
    });
    await recorder.emit({ type: "message_end", message: reply });
    await recorder.emit({ type: "tool_execution_start", toolCallId: "call_1", toolName: "press", args: { buttons: ["A"] } });
    recorder.buttonPress("call_1", ["A"], { hold_frames: 10, release_frames: 8 });
    await recorder.afterPress();
    advance(140);
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "call_1",
      toolName: "press",
      result: {
        content: [
          { type: "text", text: "pressed" },
          { type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" },
        ],
        details: undefined,
      },
      isError: false,
    });
    recorder.end("budget");

    const all = events(log);
    expect(all.filter((event) => event.type === "assistant_delta")).toMatchObject([{ turn: 1, thinking: "", text: "x" }]);
    const log_ = all.filter((event) => event.type !== "assistant_delta");
    expect(log_.map((event) => event.type)).toEqual([
      "run_start",
      "milestone",
      "disk_usage",
      "turn_start",
      "assistant",
      "tool_call",
      "button_press",
      "milestone",
      "state",
      "tool_result",
      "run_end",
    ]);
    expect(log_[1]).toMatchObject({ turn: 0, name: "GAME_RUNNING", server_timestamp: 10 });
    expect(log_[3]).toMatchObject({ turn: 1, context: { messages: 2, images: 1, est_tokens: 14 } });
    expect(log_[4]).toMatchObject({
      turn: 1,
      thinking: "Press A.",
      text: "Pressing.",
      tool_calls: [{ id: "call_1", name: "press", args: { buttons: ["A"] } }],
      usage: { input: 100, output: 20, cache_read: 3 },
      latency_ms: 900,
      ttft_ms: 120,
      stop_reason: "toolUse",
    });
    expect(log_[5]).toMatchObject({ turn: 1, id: "call_1", name: "press", args: { buttons: ["A"] } });
    expect(log_[6]).toMatchObject({ turn: 1, tool_call_id: "call_1", buttons: ["A"], hold_frames: 10, release_frames: 8 });
    expect(log_[7]).toMatchObject({ name: "PLAYER_NAME_SET", server_timestamp: 20 });
    expect(log_[8]).toMatchObject({ type: "state", turn: 1, ...STATE });
    expect(log_[9]).toMatchObject({
      id: "call_1",
      name: "press",
      is_error: false,
      duration_ms: 140,
      text: "pressed",
    });
    const result = log_[9];
    expect(result?.type === "tool_result" ? result.frames.map((frame) => frame.path) : []).toEqual([
      "frames/000010_0.png",
    ]);
    expect(readFileSync(join(log.runDir, "frames", "000010_0.png"), "utf8")).toBe("png-bytes");
    expect(log_[10]).toMatchObject({
      reason: "budget",
      furthest_milestone: "PLAYER_NAME_SET",
      turns: 1,
      wall_ms: 1040,
      tokens: { input: 100, output: 20 },
      frames: { saved: 1, bytes: 9 },
    });
  });

  it("records a model error and a failed tool", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({
      type: "message_end",
      message: assistant({ stopReason: "error", errorMessage: "HTTP 500" }),
    });
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "state", args: {} });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "c",
      toolName: "state",
      result: { content: [{ type: "text", text: "malformed /state payload" }], details: {} },
      isError: true,
    });
    recorder.end("model_error");
    const log_ = events(log);
    expect(log_.find((event) => event.type === "assistant")).toMatchObject({
      stop_reason: "error",
      error: "HTTP 500",
      ttft_ms: null,
      thinking: "",
      text: "",
      tool_calls: [],
    });
    expect(log_.find((event) => event.type === "tool_result")).toMatchObject({
      is_error: true,
      text: "malformed /state payload",
      frames: [],
    });
    expect(log_.at(-1)).toMatchObject({ reason: "model_error", furthest_milestone: null });
  });

  it("records bounded retries", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    recorder.retry("invalid tool arguments", 1, 3);
    expect(events(log).at(-1)).toMatchObject({ type: "retry", reason: "invalid tool arguments", attempt: 1, limit: 3 });
  });

  it("records a context compaction", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    recorder.compaction(30_000, 4_000);
    expect(events(log).at(-1)).toMatchObject({ type: "compaction", from_tokens: 30_000, to_tokens: 4_000 });
  });

  it("logs post-press telemetry failures as events instead of failing the press", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
    const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_tttt");
    let calls = 0;
    const recorder = new RunRecorder({
      log,
      frames: new FrameStore(runsRoot, 1_000_000, () => undefined),
      milestones: {
        poll: () => {
          calls += 1;
          return calls === 1 ? Promise.resolve([]) : Promise.reject(new Error("milestones down"));
        },
      },
      gameState: { read: () => Promise.reject(new Error("state down")) },
    });
    await recorder.start(START_META);
    await expect(recorder.afterPress()).resolves.toBeUndefined();
    expect(events(log).filter((event) => event.type === "telemetry_error")).toMatchObject([
      { source: "milestones", message: "milestones down" },
      { source: "state", message: "state down" },
    ]);
  });

  it("checks milestones before reading state after a press", async () => {
    const order: string[] = [];
    const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
    const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_ssss");
    const recorder = new RunRecorder({
      log,
      frames: new FrameStore(runsRoot, 1_000_000, () => undefined),
      milestones: {
        poll: () => {
          order.push("milestones");
          return Promise.resolve([]);
        },
      },
      gameState: {
        read: () => {
          order.push("state");
          return Promise.resolve(STATE);
        },
      },
    });
    await recorder.start(START_META);
    order.length = 0;
    await recorder.afterPress();
    expect(order).toEqual(["milestones", "state"]);
  });

  it("ignores events that carry nothing to record", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    for (const event of [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: userText("hi") },
      { type: "turn_end", message: assistant(), toolResults: [] },
      { type: "agent_end", messages: [] },
      { type: "tool_execution_update", toolCallId: "c", toolName: "x", args: {}, partialResult: {} },
    ] satisfies AgentEvent[]) {
      await recorder.emit(event);
    }
    expect(events(log).map((event) => event.type)).toEqual(["run_start", "disk_usage"]);
  });

  it("rejects a tool result for a call it never saw start", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await expect(
      recorder.emit({
        type: "tool_execution_end",
        toolCallId: "ghost",
        toolName: "x",
        result: { content: [], details: {} },
        isError: false,
      }),
    ).rejects.toThrow(RecorderError);
  });

  it("rejects non-object tool arguments", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await expect(
      recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "x", args: "A" }),
    ).rejects.toThrow(RecorderError);
  });
});

describe("RunRecorder tool results", () => {
  it("rejects a tool result without a content list", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "x", args: {} });
    await expect(
      recorder.emit({ type: "tool_execution_end", toolCallId: "c", toolName: "x", result: "oops", isError: false }),
    ).rejects.toThrow(/content list/);
  });
});

const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString("base64");

describe("RunRecorder frame retention", () => {
  it("moves PNG base64 found in tool text into frames and leaves only a reference", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "s", toolName: "state", args: {} });
    const body = JSON.stringify({ visual: { screenshot_base64: PNG_B64 }, player: { location: "LITTLEROOT" } });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "s",
      toolName: "state",
      result: { content: [{ type: "text", text: body }], details: {} },
      isError: false,
    });
    const result = events(log).find((event) => event.type === "tool_result");
    expect(result?.type).toBe("tool_result");
    if (result?.type !== "tool_result") return;
    expect(result.text).not.toContain(PNG_B64.slice(0, 40));
    expect(result.text).toContain(`<frame ${result.frames[0]?.path ?? "missing"}>`);
    expect(result.text).toContain("LITTLEROOT");
    expect(result.frames).toHaveLength(1);
    expect(readFileSync(join(log.runDir, result.frames[0]?.path ?? "")).equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
  });

  it("names frames after their tool_result's seq even when disk reports fire", async () => {
    const { recorder, log } = harness([], 1000);
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "screenshot", args: {} });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "c",
      toolName: "screenshot",
      result: { content: [{ type: "image", data: Buffer.alloc(110, 2).toString("base64"), mimeType: "image/png" }], details: {} },
      isError: false,
    });
    const all = events(log);
    const resultIndex = all.findIndex((event) => event.type === "tool_result");
    const result = all[resultIndex];
    if (result?.type !== "tool_result") throw new Error("no tool_result");
    expect(result.frames[0]?.path).toBe(`frames/${String(result.seq).padStart(6, "0")}_0.png`);
    expect(all[resultIndex + 1]).toMatchObject({ type: "disk_usage", percent: 10, turn: 1 });
  });
});


it("records objective deltas and sends the validated state to subscribers", async () => {
  const { recorder, log } = harness();
  const seen: RunEvent[] = [];
  recorder.subscribe((event) => { seen.push(event); });
  await recorder.start(START_META);
  const state = recorder.recordState(STATE);
  recorder.recordObjective({ type: "objective_attempt", turn: 99, attempt: { id: "p1", objective_id: "o1", buttons: ["A"], before_seq: state.seq, after_seq: state.seq, outcome: "unavailable", failure_count: 0, warning: null, retry_justification: null } });
  expect(seen.at(-1)).toMatchObject({ type: "objective_attempt", turn: 0 });
  expect(events(log).at(-2)).toMatchObject({ type: "state", position: STATE.position });
});

it("records a latched blackout receipt as one durable native activity", async () => {
  const { recorder, log } = harness();
  const state: GameStateSnapshot = {
    ...STATE,
    field_controls_locked: false,
    blackout_active: false,
    game_stats: { pokemon_captures: 0, evolved_pokemon: 0, used_pokecenter: 0, saved_game: 0 },
    party: [{ identity: "12345678:9abcdef0", species: "TORCHIC", level: 5, hp: 20, max_hp: 20 }],
  };
  await recorder.start({ ...START_META, harness_features: ["native-progress-activity-v1", "blackout-readout-v1"] }, false);
  const before = recorder.recordState(state);
  const delivered = recorder.recordState({ ...state, blackout_receipt: { frame: 81, money_before: 3000, notice: "Whited out." } });
  recorder.recordState({ ...state, blackout_receipt: { frame: 81, money_before: 3000, notice: "Whited out." } });
  expect(events(log).filter((event) => event.type === "activity" && event.kind === "blackout")).toEqual([
    expect.objectContaining({ count: 1, evidence: [before.seq, delivered.seq] }),
  ]);
});

it("preserves and records a one-shot blackout consumed inside production navigate_to", async () => {
  const {recorder,log}=harness();
  const notice="Whited out: your party had no usable Pokémon left, so the game took you back home.";
  const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
  const field:GameStateSnapshot={...STATE,location:"ROUTE 103",map_id:[0,18],position:{x:0,y:0},facing:"right",field_controls_locked:false,blackout_active:false,game_stats:{pokemon_captures:0,evolved_pokemon:0,used_pokecenter:0,saved_game:0},party:[{identity:"12345678:9abcdef0",species:"TORCHIC",level:5,hp:20,max_hp:20}],navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0)],objects:[],warps:[]}};
  const homeBase:GameStateSnapshot={...field,location:"HOME",map_id:[1,1],position:{x:2,y:2}};
  const home:GameStateSnapshot={...homeBase,blackout_receipt:{frame:81,money_before:3000,notice}};
  let current=field,pending=false;
  const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
  const fetchFn:typeof fetch=(input)=>{
    const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
    if(url.endsWith("/action")){current=homeBase;pending=true;return Promise.resolve(new Response(JSON.stringify({status:"success"})));}
    if(url.endsWith("/queue_status"))return Promise.resolve(new Response(JSON.stringify({queue_empty:true})));
    if(url.endsWith("/pokebench/state"))return Promise.resolve(new Response(JSON.stringify(current)));
    if(url.endsWith("/pokebench/observation")){
      const state=pending?home:{...home,blackout_receipt:undefined};pending=false;
      return Promise.resolve(new Response(JSON.stringify({state_text:state.blackout_receipt===undefined?"Current field.":`${notice}\nCurrent field.`,screenshot_base64:png,state})));
    }
    throw new Error(`unexpected ${url}`);
  };
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"blackout-readout-v1":true};
  const base=gameTools("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,toolSwitches(features),{now:()=>0,sleep:()=>Promise.resolve()});
  const nav=withNavigation(base,features,{read:()=>Promise.resolve(current)}).find(tool=>tool.name==="navigate_to");
  if(nav===undefined)throw new Error("missing navigate_to");
  await recorder.start({...START_META,harness_features:["native-progress-activity-v1","blackout-readout-v1"]},false);
  await recorder.emit({type:"tool_execution_start",toolCallId:"n1",toolName:"navigate_to",args:{x:1,y:0,map_id:[0,18]}});
  const result=await nav.execute("n1",{x:1,y:0,map_id:[0,18]});
  await recorder.emit({type:"tool_execution_end",toolCallId:"n1",toolName:"navigate_to",result,isError:false});
  const text=result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n");
  expect(text).toContain(notice);
  expect((result.details as {state:GameStateSnapshot}).state.blackout_receipt).toEqual(home.blackout_receipt);
  expect(events(log).filter(event=>event.type==="activity"&&event.kind==="blackout")).toHaveLength(1);
});

it("preserves and records every queued blackout consumed through the production dialogue wrapper", async () => {
  const {recorder,log}=harness();
  const notice="Whited out: your party had no usable Pokémon left, so your ₽0 remained ₽0.";
  const field:GameStateSnapshot={...STATE,location:"ROUTE 103",map_id:[0,18],position:{x:0,y:0},facing:"right",field_controls_locked:false,blackout_active:false,game_stats:{pokemon_captures:0,evolved_pokemon:0,used_pokecenter:0,saved_game:0},party:[{identity:"12345678:9abcdef0",species:"TORCHIC",level:5,hp:20,max_hp:20}]};
  const home:GameStateSnapshot={...field,location:"HOME",map_id:[1,1],position:{x:2,y:2}};
  const receipts=[{frame:82,money_before:0,notice},{frame:99,money_before:0,notice}];
  let current=field,actions=0,observations=0;
  const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
  const fetchFn:typeof fetch=(input)=>{
    const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
    if(url.endsWith("/action")){actions++;current=home;return Promise.resolve(new Response(JSON.stringify({status:"success"})));}
    if(url.endsWith("/queue_status"))return Promise.resolve(new Response(JSON.stringify({queue_empty:true})));
    if(url.endsWith("/pokebench/state"))return Promise.resolve(new Response(JSON.stringify(current)));
    if(url.endsWith("/pokebench/observation")){
      observations++;const receipt=observations===1?receipts[0]:observations===3?receipts[1]:undefined;
      const state=receipt===undefined?home:{...home,blackout_receipt:receipt};
      return Promise.resolve(new Response(JSON.stringify({state_text:receipt===undefined?"Current field.":`${notice}\nCurrent field.`,screenshot_base64:png,state})));
    }
    throw new Error(`unexpected ${url}`);
  };
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"dialogue-auto-advance-v1":true,"blackout-readout-v1":true};
  const base=gameTools("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,toolSwitches(features),{now:()=>0,sleep:()=>Promise.resolve()});
  const wrapped=playGameTools(base,features,{read:()=>Promise.resolve(current)},recorder);
  const press=wrapped.find(tool=>tool.name==="press");if(press===undefined)throw new Error("missing press");
  await recorder.start({...START_META,harness_features:["native-progress-activity-v1","blackout-readout-v1"]},false);
  await recorder.emit({type:"tool_execution_start",toolCallId:"p1",toolName:"press",args:{buttons:["RIGHT","A"]}});
  const result=await press.execute("p1",{buttons:["RIGHT","A"]});
  await recorder.emit({type:"tool_execution_end",toolCallId:"p1",toolName:"press",result,isError:false});
  const text=result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n");
  expect(actions).toBe(2);
  expect(text.split(notice)).toHaveLength(3);
  expect((result.details as {state:GameStateSnapshot}).state.blackout_receipts).toEqual(receipts);
  expect(events(log).filter(event=>event.type==="activity"&&event.kind==="blackout")).toHaveLength(2);
});

it("preserves a blackout consumed by an automatic B through production tools and recording",async()=>{
  const {recorder,log}=harness();
  const notice="Whited out during automatic dialogue advance.";
  const receipt={frame:107,money_before:3000,notice};
  const field:GameStateSnapshot={...STATE,location:"ROUTE 103",map_id:[0,18],position:{x:0,y:0},facing:"right",field_controls_locked:false,blackout_active:false,game_stats:{pokemon_captures:0,evolved_pokemon:0,used_pokecenter:0,saved_game:0},party:[{identity:"12345678:9abcdef0",species:"TORCHIC",level:5,hp:1,max_hp:20}],world_context:{objects:[],triggers:[],dialogue:null,message:null}};
  const message:GameStateSnapshot={...field,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:"The poison took its toll.",message:{phase:"button_wait",cursor:25,ready:true,identity:"a".repeat(64)}}};
  const home:GameStateSnapshot={...field,location:"HOME",map_id:[1,1],position:{x:2,y:2}};
  let current=field,pending=false,automaticBs=0;
  const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
  const fetchFn:typeof fetch=(input,init)=>{
    const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
    if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("missing action body");const body=JSON.parse(init.body) as {buttons:string[]};if(body.buttons[0]==="A")current=message;else if(body.buttons[0]==="B"){automaticBs++;current=home;pending=true;}return Promise.resolve(new Response(JSON.stringify({status:"success"})));}
    if(url.endsWith("/queue_status"))return Promise.resolve(new Response(JSON.stringify({queue_empty:true})));
    if(url.endsWith("/pokebench/state"))return Promise.resolve(new Response(JSON.stringify(current)));
    if(url.endsWith("/pokebench/observation")){const state=pending?{...current,blackout_receipt:receipt}:current;pending=false;return Promise.resolve(new Response(JSON.stringify({state_text:"Current field.",screenshot_base64:png,state})));}
    throw new Error(`unexpected ${url}`);
  };
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"dialogue-auto-advance-v1":true,"field-dialogue-phase-v1":true,"blackout-readout-v1":true};
  const base=gameTools("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,toolSwitches(features),{now:()=>0,sleep:()=>Promise.resolve()});
  const wrapped=playGameTools(base,features,{read:()=>Promise.resolve(current)},recorder);
  const press=wrapped.find(tool=>tool.name==="press");if(press===undefined)throw new Error("missing press");
  await recorder.start({...START_META,harness_features:["native-progress-activity-v1","blackout-readout-v1"]},false);
  await recorder.emit({type:"tool_execution_start",toolCallId:"auto-b",toolName:"press",args:{buttons:["A"]}});
  const result=await press.execute("auto-b",{buttons:["A"]});
  await recorder.emit({type:"tool_execution_end",toolCallId:"auto-b",toolName:"press",result,isError:false});
  expect(automaticBs).toBe(1);
  expect(result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n")).toContain(notice);
  expect((result.details as {state:GameStateSnapshot}).state.blackout_receipt).toEqual(receipt);
  expect(events(log).filter(event=>event.type==="activity"&&event.kind==="blackout")).toHaveLength(1);
});

it("records milestones from the exact observation snapshot and its persisted evidence ID", async () => {
  const { StateMilestones } = await import("./milestones.js");
  const root = mkdtempSync(join(tmpdir(), "pokebench-story-rec-"));
  const log = RunLog.create(root, "story-observation",()=>new Date("2026-10-12T00:00:00.000Z"));
  let reads = 0;
  const initial = {...STATE, started:false, name:null, location:null};
  const detector = new StateMilestones({read:()=>{ throw new Error("detector must reuse recorded snapshot"); }},()=>2000);
  const recorder = new RunRecorder({log, frames:new FrameStore(root), milestones:detector, gameState:{read:()=>{ reads++;return Promise.resolve(initial); }}, now:()=>2000});
  await recorder.start(START_META);
  await recorder.emit({type:"tool_execution_start",toolCallId:"observation",toolName:"observe",args:{}});
  const snapshot = {...initial, story:{name_confirmed:true,intro_stage:null,rival_stage:null,birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:null,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null}};
  await recorder.emit({type:"tool_execution_end",toolCallId:"observation",toolName:"observe",isError:false,result:{content:[{type:"text",text:"Story: player name confirmed"}],details:{state:snapshot}}});
  recorder.end("completed");
  const logged = events(log);
  const state = logged.find((e) => e.type === "state" && "story" in e && e.story?.name_confirmed === true);
  expect(state).toMatchObject(snapshot);
  const marks = logged.filter((e) => e.type === "milestone" && e.name === "PLAYER_NAME_CONFIRMED");
  expect(marks).toEqual([{v:1,run:"story-observation",seq:(state?.seq ?? -10)+1,t:state?.t,type:"milestone",turn:0,name:"PLAYER_NAME_CONFIRMED",server_timestamp:2,kind:"story",origin:"observed",evidence:[state?.seq]}]);
  expect(reads).toBe(1);
  expect(logged.at(-1)).toMatchObject({furthest_milestone:"PLAYER_NAME_CONFIRMED"});
});

it("fails a declared story reader startup when the server still has the old package", async () => {
  const {StateMilestones} = await import("./milestones.js");
  const root = mkdtempSync(join(tmpdir(),"pokebench-reader-contract-"));
  const log = RunLog.create(root,"reader-mismatch");
  const recorder = new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones({read:()=>Promise.resolve(STATE)}),gameState:{read:()=>Promise.resolve(STATE)}});
  await expect(recorder.start({...START_META,harness_features:["story-state-v1"]})).rejects.toThrow("game server returned no story state");
  recorder.end("crash");
  expect(events(log).map((e)=>e.type)).toEqual(["run_start","run_end"]);
});

// Captured from independent native core probe_46d6; no inputs during this replay.
it.each(["unknown", "naming"])("does not earn resumed progress from an unqualified %s screen", async (screen) => {
  const { StateMilestones } = await import("./milestones.js");
  const { parseGameState } = await import("./game-state.js");
  const { summarize } = await import("./summary.js");
  const positive = parseGameState(JSON.parse(readFileSync(new URL("../test-support/existing-story.json", import.meta.url), "utf8")));
  const unknown = screen === "naming"
    ? parseGameState(JSON.parse(readFileSync(new URL("../test-support/nickname-story.json",import.meta.url),"utf8")))
    : {...STATE, screen, started:false, name:null, location:null, story:null};
  const root = mkdtempSync(join(tmpdir(), "pokebench-resumed-origin-"));
  let clock = 1000;
  const log = RunLog.create(root,"resumed-origin",()=>new Date(clock));
  const recorder = new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones({read:()=>Promise.resolve(unknown)},()=>clock),gameState:{read:()=>Promise.resolve(unknown)},now:()=>clock});
  await recorder.start({...START_META,start_state:{kind:"save_state",path:"immutable-probe-fixture.state",sha1:"0".repeat(40)}});
  clock += 1000;
  const observed = recorder.recordState(positive);
  recorder.end("completed");
  const logged = events(log);
  const marks = logged.filter((e)=>e.type==="milestone").filter((e)=>e.name!=="GAME_RUNNING");
  expect(marks.map((e)=>e.name)).toEqual(["PLAYER_NAME_CONFIRMED","PLAYER_NAME_SET","INTRO_CUTSCENE_COMPLETE","MOM_CLOCK_INSTRUCTION","PLAYER_BEDROOM","CLOCK_SET","MOM_RIVAL_INSTRUCTION","RIVAL_BEDROOM_REACHED","RIVAL_MET","STARTER_CHOSEN","BIRCH_RESCUE_COMPLETE","BIRCH_STARTER_HANDOFF_COMPLETE"]);
  for (const mark of marks) expect(mark).toMatchObject({origin:"present_at_start",evidence:[observed.seq]});
  expect(summarize(logged)).toMatchObject({presses:0,furthest:"GAME_RUNNING",milestones:[{name:"GAME_RUNNING",turn:0,wallMs:0}]});
});


it("persists the new-game split once from the recorded Birch snapshot", async () => {
  const { StateMilestones } = await import("./milestones.js");
  const root = mkdtempSync(join(tmpdir(), "pokebench-new-game-rec-"));
  const log = RunLog.create(root, "new-game-observation", () => new Date("2026-10-12T00:00:00.000Z"));
  const initial: GameStateSnapshot = { ...STATE, screen: "main_menu", started: false, name: null, location: null };
  const detector = new StateMilestones({ read: () => { throw new Error("must reuse recorded snapshot"); } }, () => 2000);
  const recorder = new RunRecorder({ log, frames: new FrameStore(root), milestones: detector, gameState: { read: () => Promise.resolve(initial) }, now: () => 2000 });
  await recorder.start({ ...START_META, harness_features: ["new-game-created-v1"] });
  const snapshot: GameStateSnapshot = { ...initial, screen: "birch_speech" };
  await recorder.emit({ type: "tool_execution_start", toolCallId: "new-game", toolName: "press", args: { buttons: ["A"] } });
  await recorder.emit({ type: "tool_execution_end", toolCallId: "new-game", toolName: "press", result: { content: [{ type: "text", text: "Birch introduction" }], details: { state: snapshot } }, isError: false });
  recorder.recordState(snapshot);
  recorder.end("operator_abort");
  const logged = events(log);
  const birch = logged.filter(e => e.type === "state" && "screen" in e && e.screen === "birch_speech")[0];
  expect(birch?.type).toBe("state");
  const marks = logged.filter(e => e.type === "milestone" && e.name === "NEW_GAME_CREATED");
  expect(marks).toEqual([{ v: 1, run: "new-game-observation", seq: (birch?.seq ?? -10) + 1, t: birch?.t, type: "milestone", turn: 0, name: "NEW_GAME_CREATED", server_timestamp: 2, kind: "story", origin: "observed", evidence: [birch?.seq] }]);
  expect(logged.at(-1)).toMatchObject({ type: "run_end", furthest_milestone: "NEW_GAME_CREATED" });
});

it("elapsedMs uses the run-start monotonic anchor including initial capture",async()=>{
 const root=mkdtempSync(join(tmpdir(),"recorder-elapsed-"));const log=RunLog.create(root,"elapsed");let now=1000;
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>{now=16000;return Promise.resolve([]);}},gameState:{read:()=>Promise.resolve(STATE)},now:()=>now});
 await recorder.start(START_META);expect(recorder.elapsedMs()).toBe(15000);now=601000;expect(recorder.elapsedMs()).toBe(600000);
});

it("records and qualifies post-clock home-exit evidence from observed snapshots",async()=>{
 const {StateMilestones,qualifiedNativeMilestone}=await import("./milestones.js");
 const root=mkdtempSync(join(tmpdir(),"recorder-post-clock-"));const log=RunLog.create(root,"post-clock");
 const story={name_confirmed:true,intro_stage:5,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
 const initial:GameStateSnapshot={...STATE,screen:"overworld",started:true,location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",story};
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:new StateMilestones({read:()=>Promise.resolve(initial)}),gameState:{read:()=>Promise.resolve(initial)}});
 await recorder.start({...START_META,harness_features:["post-clock-navigation-milestones-v1"]});
 recorder.recordState({...initial,location:"LITTLEROOT TOWN BRENDANS HOUSE 1F",story:{...story,intro_stage:7,clock_set:true}});
 recorder.recordState({...initial,location:"LITTLEROOT TOWN",story:{...story,intro_stage:7,clock_set:true}});
 recorder.end("budget");const logged=events(log);const mark=logged.find(e=>e.type==="milestone"&&e.name==="PLAYER_HOUSE_EXITED_AFTER_CLOCK");
 if(mark?.type!=="milestone")throw new Error("missing native milestone");
 expect(mark).toMatchObject({kind:"navigation",origin:"observed"});expect(mark.evidence).toHaveLength(3);
 expect(qualifiedNativeMilestone(mark,(mark.evidence??[]).map(seq=>logged.find(e=>e.seq===seq)))).toBe(true);
 expect(logged.at(-1)).toMatchObject({type:"run_end",reason:"budget"});
});

it("records exact decision input frame/text with its paired state and next decision index",async()=>{
 const {recorder,log}=harness();await recorder.start(START_META);
 const current={...STATE,position:{x:6,y:8}};const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
 recorder.recordDecisionSnapshot({state:current,content:[{type:"image",data:png,mimeType:"image/png"},{type:"text",text:"Clock at (5,1); current snapshot"}]});
 const rows=events(log);const input=rows.find(e=>e.type as string==="decision_input");
 expect(input).toMatchObject({type:"decision_input",turn:0,decision_turn:1,text:"Clock at (5,1); current snapshot"});
 if(!input||input.type!=="decision_input")throw Error("Missing linked decision input");
 expect(input.frames).toHaveLength(1);expect(input.frames[0]?.path).toMatch(/^frames\//);expect(input.frames[0]?.sha1).toMatch(/^[a-f0-9]{40}$/);
 expect(rows.find(e=>e.seq===input.state_seq)).toMatchObject({type:"state",position:current.position});
 const ref=input.frames[0];if(!ref)throw Error("Missing recorded input frame");const bytes=readFileSync(join(log.runDir,ref.path));expect(bytes).toEqual(Buffer.from(png,"base64"));expect(ref.sha1).toBe(createHash("sha1").update(bytes).digest("hex"));
 expect(rows.filter(e=>e.type==="tool_call")).toEqual([]);
});
it("records a wait as explicit host time rather than fake button input",async()=>{
 const {recorder,log}=harness();await recorder.start(START_META);recorder.recordWaitInput("wait-one",60);
 expect(events(log).at(-1)).toMatchObject({type:"wait_input",tool_call_id:"wait-one",duration_ms:60});expect(events(log).filter(e=>e.type==="button_press")).toEqual([]);
});

it("records exact navigation context before its decision turn without grading model hypotheses",async()=>{
 const h=harness();await h.recorder.start(START_META,false);h.recorder.recordNavigationContext({text:"MODEL HYPOTHESIS destination; observed #0",evidence:[0]});await h.recorder.transformContext([]);h.recorder.end("budget");
 const result=events(h.log);const input=result.find(e=>e.type==="navigation_context");expect(input).toMatchObject({type:"navigation_context",turn:1,text:"MODEL HYPOTHESIS destination; observed #0",evidence:[0]});expect(result.filter(e=>e.type==="milestone")).toHaveLength(0);expect(result.find(e=>e.type==="turn_start")?.turn).toBe(input?.turn);
});

it("navigation memory retains only the state actually returned after internal post-press telemetry",async()=>{
 const {navigationMemory}=await import("./navigation-memory.js"),{ALL_ON}=await import("./features.js");
 const root=mkdtempSync(join(tmpdir(),"pokebench-delivery-")),log=RunLog.create(root,"navigation-delivery");
 const a={...STATE,location:"Delivered before",world_context:null};
 const b={...STATE,location:"MEASUREMENT ONLY ROOM",world_context:{objects:[],triggers:[],dialogue:"MEASUREMENT ONLY QUOTE"}};
 const c={...STATE,location:"Delivered after",world_context:{objects:[],triggers:[],dialogue:"Delivered quote"}};
 let sampled:GameStateSnapshot=a;
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(sampled)}});
 const memory=navigationMemory(ALL_ON,recorder,recorder.transformContext);if(memory===null)throw Error("memory disabled");
 await recorder.start(START_META);
 await recorder.emit({type:"tool_execution_start",toolCallId:"observe",toolName:"observe",args:{}});
 await recorder.emit({type:"tool_execution_end",toolCallId:"observe",toolName:"observe",isError:false,result:{content:[{type:"text",text:"Delivered before"}],details:{state:a}}});
 await recorder.emit({type:"tool_execution_start",toolCallId:"press",toolName:"press",args:{buttons:["A"]}});
 recorder.buttonPress("press",["A"],{hold_frames:8,release_frames:8},a);sampled=b;await recorder.afterPress();
 await recorder.emit({type:"tool_execution_end",toolCallId:"press",toolName:"press",isError:false,result:{content:[{type:"text",text:"Delivered after: Delivered quote"}],details:{state:c}}});
 await memory.transformContext([]);const logged=events(log),context=logged.findLast(e=>e.type==="navigation_context");
 if(context?.type!=="navigation_context")throw Error("missing memory delivery");
 expect(context.text).toContain("Delivered after");expect(context.text).toContain("Delivered quote");expect(context.text).not.toContain("MEASUREMENT ONLY");
 const hidden=logged.filter(e=>e.type==="state"&&"location"in e&&e.location==="MEASUREMENT ONLY ROOM");expect(hidden).toHaveLength(1);for(const e of hidden)expect(context.evidence).not.toContain(e.seq);
 const delivered=logged.findLast(e=>e.type==="state"&&"location"in e&&e.location==="Delivered after");expect(delivered).toBeDefined();expect(context.evidence).toContain(delivered?.seq);
 expect(logged.findLast(e=>e.type==="tool_result")).toMatchObject({state_seq:delivered?.seq});
 const input=logged.find(e=>e.type==="button_press");if(input?.type!=="button_press")throw Error("missing input");expect(context.evidence).not.toContain(input.before_state_seq);expect(context.text).toContain("input location unverified");
 recorder.end("completed");
});

it("durably records exact JIT request identity and clears it for the following request",async()=>{
 const {recorder,log}=harness();await recorder.start(START_META);
 await recorder.transformContext([]);
 const receipt={mode:"jit" as const,scene:"clock" as const,state_seq:3,system_prompt:"clock controls",prompt_sha256:"a".repeat(64),tools:["press"],tools_sha256:"b".repeat(64)};
 recorder.recordRequestContext(receipt);
 await recorder.emit({type:"message_end",message:assistant({text:"ready"})});
 await recorder.transformContext([]);
 await recorder.emit({type:"message_end",message:assistant({text:"next"})});
 const rows=events(log).filter(e=>e.type==="assistant");
 expect(rows[0]).toMatchObject({request_context:receipt});
 expect(rows[1]).not.toHaveProperty("request_context");
});

it("measures TTFT from model dispatch to the first content delta, retaining cache writes",async()=>{
 const {recorder,log,advance}=harness();await recorder.start(START_META);
 await recorder.transformContext([]);advance(100);recorder.recordRequestContext(null);
 const partial=assistant({text:""});advance(10);
 await recorder.emit({type:"message_update",message:partial,assistantMessageEvent:{type:"text_start",contentIndex:0,partial}});
 advance(20);await recorder.emit(delta("thinking_delta","thinking"));advance(40);
 const message=assistant({input:30,output:12});message.usage.cacheWrite=7;
 await recorder.emit({type:"message_end",message});
 expect(events(log).find(e=>e.type==="assistant")).toMatchObject({ttft_ms:30,latency_ms:70,usage:{input:30,output:12,cache_read:3,cache_write:7}});
});

it("replays only the latest existing state when a late subscriber explicitly requests it",async()=>{
 const {recorder}=harness();await recorder.start(START_META);
 const empty:RunEvent[]=[];recorder.subscribe(e=>empty.push(e),false,true);expect(empty).toEqual([]);
 recorder.recordState(STATE);const latest=recorder.recordState({...STATE,screen:"clock"});
 const normal:RunEvent[]=[],seeded:RunEvent[]=[];
 recorder.subscribe(e=>normal.push(e));recorder.subscribe(e=>seeded.push(e),false,true);
 expect(normal).toEqual([]);expect(seeded).toEqual([latest]);
 const next=recorder.recordState({...STATE,screen:"naming"});
 expect(normal).toEqual([next]);expect(seeded).toEqual([latest,next]);
});

it("semantic-navigation-v2: navigate_to_target and explore_map results record their state and receipt; without v2 they do not", async () => {
  for (const v2 of [true, false]) for (const name of ["navigate_to_target", "explore_map"]) {
    const { recorder, log } = harness();
    await recorder.start({ ...START_META, harness_features: v2 ? ["semantic-navigation-v2"] : [] }, false);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "s1", toolName: name, args: {} });
    await recorder.emit({ type: "tool_execution_end", toolCallId: "s1", toolName: name, isError: false, result: {
      content: [{ type: "text", text: "Semantic navigation: activation completed; inspect the resulting state. Selected map object 2." }],
      details: { state: STATE, semantic_navigation: { status: "activation completed", selected: "map object 2", activation_attempted: true, target: { kind: "object", local_id: 2 } } },
    } });
    const result = events(log).findLast((e) => e.type === "tool_result");
    if (result?.type !== "tool_result") throw new Error("no result");
    if (v2) {
      expect(result.semantic_navigation).toEqual({ target: { kind: "object", local_id: 2 }, activation_attempted: true });
      expect(result.state_seq).toBeDefined();
    } else {
      expect(result.semantic_navigation).toBeUndefined();
      expect(result.state_seq).toBeUndefined();
    }
  }
});
