import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { ALL_TOOL_SWITCHES, PRESS_TIMING, SmokeError, checkSmoke, observeTool, permitsAutomaticRunning, pressTool, serverHealthy, waitForQueue } from "./game-tools.js";

const SERVER = "http://127.0.0.1:8000";

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

function serving(body: unknown, status = 200): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function observationBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { state_text: "Current Location: LITTLEROOT TOWN", screenshot_base64: png(240, 160), state: IN_GAME, ...overrides };
}

type Route = (init: RequestInit | undefined) => unknown;

function routes(table: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.slice(SERVER.length);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const entry = table[path];
    if (entry === undefined) return Promise.resolve(new Response("{}", { status: 404 }));
    const body: unknown = typeof entry === "function" ? (entry as Route)(init) : entry;
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

const noHooks = { beforePress: () => undefined, afterPress: () => Promise.resolve() };
const instant = { sleep: () => Promise.resolve(), now: () => 0 };

describe("serverHealthy", () => {
  it("is true only for a healthy status", async () => {
    expect(await serverHealthy(SERVER, serving({ status: "healthy" }))).toBe(true);
    expect(await serverHealthy(SERVER, serving({ status: "booting" }))).toBe(false);
    expect(await serverHealthy(SERVER, serving({}, 500))).toBe(false);
  });

  it("is false when nothing is listening", async () => {
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await serverHealthy(SERVER, refused)).toBe(false);
  });
});

describe("observeTool", () => {
  it("returns the 240x160 frame then the state text", async () => {
    const fetchFn = serving(observationBody());
    const result = await observeTool(SERVER, fetchFn).execute("call-1", {});
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/observation`, expect.anything());
    expect(result.content).toEqual([
      { type: "image", data: png(240, 160), mimeType: "image/png" },
      { type: "text", text: "Current Location: LITTLEROOT TOWN" },
    ]);
  });

  it("rejects an observation whose state is not the RAM reader's shape", async () => {
    const body = observationBody({ state: { ...IN_GAME, mode: "overworld" } });
    await expect(observeTool(SERVER, serving(body)).execute("c", {})).rejects.toThrow(/observation/);
  });

  it.each([
    ["a wrong-size frame", observationBody({ screenshot_base64: png(100, 100) })],
    ["a non-PNG frame", observationBody({ screenshot_base64: Buffer.from("GIF89a, padded to be long enough").toString("base64") })],
    ["a missing frame", observationBody({ screenshot_base64: undefined })],
    ["missing state text", observationBody({ state_text: undefined })],
  ])("rejects %s", async (_label, body) => {
    await expect(observeTool(SERVER, serving(body)).execute("call-1", {})).rejects.toThrow(/observation/);
  });

  it("names the path on an HTTP error", async () => {
    await expect(observeTool(SERVER, serving({}, 503)).execute("call-1", {})).rejects.toThrow(
      /\/pokebench\/observation.*503/,
    );
  });
});

function assistant(text: string, stopReason: "stop" | "error" | "aborted" = "stop"): AgentMessage {
  return {
    role: "assistant",
    content: text === "" ? [] : [{ type: "text", text }],
    api: "openai-completions",
    provider: "local-gateway",
    model: "think-swarm",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
}

function result(toolName: string, isError = false): AgentMessage {
  return { role: "toolResult", toolCallId: toolName, toolName, content: [], isError, timestamp: 0 };
}

describe("checkSmoke", () => {
  it("summarizes a transcript that described a frame and called both tools", () => {
    const transcript = [
      result("observe"),
      assistant(" A title screen. "),
      result("press"),
      assistant("DONE TITLE_SEQUENCE"),
    ];
    expect(checkSmoke(transcript)).toEqual({
      toolCalls: ["observe", "press"],
      texts: ["A title screen.", "DONE TITLE_SEQUENCE"],
    });
  });

  it.each([
    ["a failed tool", [result("observe"), result("press", true), assistant("a"), assistant("b")], /failed: press/],
    ["no observe", [result("press"), assistant("a"), assistant("b")], /observe/],
    ["no press", [result("observe"), assistant("a"), assistant("b")], /press/],
    [
      "a terminal model error",
      [result("observe"), assistant("a"), result("press"), assistant("b"), assistant("", "error")],
      /model turn ended: error/,
    ],
    [
      "an aborted model turn",
      [result("observe"), assistant("a"), result("press"), assistant("b"), assistant("", "aborted")],
      /model turn ended: aborted/,
    ],
    ["a single reply", [result("observe"), result("press"), assistant("a"), assistant("")], /frame description/],
  ])("fails on %s", (_label, transcript, message) => {
    expect(() => checkSmoke(transcript)).toThrow(SmokeError);
    expect(() => checkSmoke(transcript)).toThrow(message);
  });
});

describe("waitForQueue", () => {
  it("polls until the action queue drains", async () => {
    let polls = 0;
    const fetchFn = routes({ "/queue_status": () => ({ queue_empty: ++polls >= 3 }) });
    const sleeps: number[] = [];
    await waitForQueue(SERVER, fetchFn, {
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(polls).toBe(3);
    expect(sleeps).toEqual([100, 100]);
  });

  it("gives up after the timeout", async () => {
    let clock = 0;
    const fetchFn = routes({ "/queue_status": { queue_empty: false } });
    const wait = waitForQueue(SERVER, fetchFn, {
      sleep: () => {
        clock += 5_000;
        return Promise.resolve();
      },
      now: () => clock,
    });
    await expect(wait).rejects.toThrow(/queue did not drain/);
  });

  it("rejects a malformed queue status", async () => {
    await expect(waitForQueue(SERVER, routes({ "/queue_status": {} }), instant)).rejects.toThrow(/queue_status/);
  });
});

describe("pressTool", () => {
  it("records the press before POSTing it, waits for the queue, checks milestones, then observes", async () => {
    const order: string[] = [];
    const fetchFn = routes(
      {
        "/action": { status: "success" },
        "/queue_status": { queue_empty: true },
        "/pokebench/observation": observationBody(),
      },
      order,
    );
    const tool = pressTool(
      SERVER,
      {
        beforePress: (id, buttons, timing) => {
          order.push(`before ${id} ${buttons.join(",")} ${String(timing.hold_frames)}/${String(timing.release_frames)}`);
        },
        afterPress: () => {
          order.push("after");
          return Promise.resolve();
        },
      },
      fetchFn,
      instant,
    );
    const result = await tool.execute("call-9", { buttons: ["UP", "A"] });
    expect(order).toEqual([
      "GET /pokebench/state",
      "before call-9 UP,A 10/8",
      "POST /action",
      "GET /queue_status",
      "after",
      "GET /pokebench/observation",
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      `${SERVER}/action`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ buttons: ["UP", "A"], hold_frames: 10, release_frames: 8 }) }),
    );
    expect(result.content).toEqual([
      { type: "image", data: png(240, 160), mimeType: "image/png" },
      { type: "text", text: "pressed UP, A\nPress result: unavailable (no verified before snapshot)\n\nCurrent Location: LITTLEROOT TOWN" },
    ]);
    expect(PRESS_TIMING).toEqual({ hold_frames: 10, release_frames: 8 });
  });

  it("presses nothing when the run is already stopped", async () => {
    const calls: string[] = [];
    const tool = pressTool(SERVER, noHooks, routes({ "/action": { status: "success" } }, calls), instant);
    await expect(tool.execute("c", { buttons: ["A"] }, AbortSignal.abort())).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("stops waiting for the queue once the run is stopped", async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const fetchFn = routes({ "/queue_status": () => (controller.abort(), { queue_empty: false }) }, calls);
    await expect(waitForQueue(SERVER, fetchFn, instant, controller.signal)).rejects.toThrow();
    expect(calls).toEqual(["GET /queue_status"]);
  });

  it("fails when the server does not report success", async () => {
    const tool = pressTool(SERVER, noHooks, routes({ "/action": { status: "error", message: "queue full" } }), instant);
    await expect(tool.execute("c", { buttons: ["A"] })).rejects.toThrow(/queue full/);
  });

  it("names the HTTP status when the body is not an action reply", async () => {
    const tool = pressTool(SERVER, noHooks, routes({}), instant);
    await expect(tool.execute("c", { buttons: ["A"] })).rejects.toThrow(/HTTP 404/);
  });

  it("declares a closed button enum and a bounded list", () => {
    const tool = pressTool(SERVER, noHooks);
    expect(JSON.stringify(tool.parameters)).toContain('"maxItems":8');
    expect(JSON.stringify(tool.parameters)).toContain('"SELECT"');
  });
});

it("press feedback compares verified before state with the returned frame's state", async () => {
  const before = { ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 1, y: 2 }, facing: "up" };
  const after = { ...before, position: { x: 1, y: 1 } };
  const calls: string[] = [];
  const beforeHook = vi.fn<Parameters<typeof pressTool>[1]["beforePress"]>();
  const tool = pressTool(SERVER, {...noHooks,beforePress:beforeHook}, routes({
    "/pokebench/state": before,
    "/action": { status: "success" },
    "/queue_status": { queue_empty: true },
    "/pokebench/observation": observationBody({ state: after, state_text: "Position: X=1, Y=1" }),
  }, calls), instant);
  const result = await tool.execute("move", { buttons: ["UP"] });
  expect(beforeHook).toHaveBeenCalledExactlyOnceWith("move",["UP"],PRESS_TIMING,before);
  expect(calls).toEqual(["GET /pokebench/state", "POST /action", "GET /queue_status", "GET /pokebench/observation"]);
  expect(result.content[1]).toEqual({ type: "text", text: "pressed UP\nPress result: moved (1,2) -> (1,1)\n\nPosition: X=1, Y=1" });
});

it("validates target fields at the observation consumer while retaining older payloads", async () => {
  const target = { kind: "background", x: 5, y: 1, elevation: 0, activation: "A", availability: "conditional", facing: null, local_id: null, destination: null };
  const text = "background at (5,1); A; conditional";
  const body = observationBody({ state: { ...IN_GAME, interaction_targets: [target] }, state_text: text });
  const result = await observeTool(SERVER, serving(body)).execute("targets", {});
  expect(result.content[1]).toEqual({ type: "text", text });
  await expect(observeTool(SERVER, serving(observationBody({ state: { ...IN_GAME, interaction_targets: [{ ...target, x: "5" }] } }))).execute("invalid-target", {})).rejects.toThrow("malformed /pokebench/observation payload");
});

const schemaTarget = { kind: "background", x: 5, y: 1, elevation: 0, activation: "A", availability: "conditional", facing: null, local_id: null, destination: null };
it.each([
  ["name", 3], ["kind", false], ["x", "5"], ["y", "1"], ["elevation", "0"],
  ["activation", false], ["availability", false], ["facing", 3], ["local_id", "2"],
  ["destination", "map"], ["destination", [0, 9]], ["destination", [0, 9, 0, 1]],
  ["destination", ["0", 9, 0]], ["destination", [0, "9", 0]], ["destination", [0, 9, "0"]],
  ["x", 5.5], ["y", 1.5], ["elevation", 0.5], ["local_id", 2.5],
  ["destination", [0.5, 9, 0]], ["destination", [0, 9.5, 0]], ["destination", [0, 9, 0.5]],
  ["extra_field", true],
])("rejects malformed target %s=%j at the observation caller", async (key, value) => {
  const body = observationBody({ state: { ...IN_GAME, interaction_targets: [{ ...schemaTarget, [key]: value }] } });
  await expect(observeTool(SERVER, serving(body)).execute("bad-target", {})).rejects.toThrow("malformed /pokebench/observation payload");
});
it("accepts each nullable target union's non-null member at the caller", async () => {
  const targets = [schemaTarget, { ...schemaTarget, facing: "up" }, { ...schemaTarget, kind: "object", local_id: 2 }, { ...schemaTarget, kind: "warp", activation: "step", destination: [0, 9, 0] }];
  const result = await observeTool(SERVER, serving(observationBody({ state: { ...IN_GAME, interaction_targets: targets } }))).execute("valid-targets", {});
  expect(result.content[1]).toEqual({ type: "text", text: "Current Location: LITTLEROOT TOWN" });
});

it.each([null, []])("accepts the target inventory's empty/unavailable representations %j", async (interaction_targets) => {
  const result = await observeTool(SERVER, serving(observationBody({ state: { ...IN_GAME, interaction_targets } }))).execute("inventory-shape", {});
  expect(result.content[1]).toEqual({ type: "text", text: "Current Location: LITTLEROOT TOWN" });
});
it("rejects a non-array/non-null inventory at the consumer", async () => {
  await expect(observeTool(SERVER, serving(observationBody({ state: { ...IN_GAME, interaction_targets: "unknown" } }))).execute("inventory-shape", {})).rejects.toThrow("malformed /pokebench/observation payload");
});

it("omits the press-result line when that switch is off", async () => {
  const before = { ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 1, y: 2 }, facing: "up" };
  const tool = pressTool(SERVER, noHooks, routes({
    "/pokebench/state": before,
    "/action": { status: "success" },
    "/queue_status": { queue_empty: true },
    "/pokebench/observation": observationBody({ state: { ...before, position: { x: 1, y: 1 } }, state_text: "Position: X=1, Y=1" }),
  }), instant, { ...ALL_TOOL_SWITCHES, pressResult: false });
  const result = await tool.execute("move", { buttons: ["UP"] });
  expect(result.content[1]).toEqual({ type: "text", text: "pressed UP\n\nPosition: X=1, Y=1" });
});

it("leaves hidden position and lock facts out of press results, and drops the readout promise when RAM is off", async () => {
  const before = { ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 1, y: 2 }, facing: "up" };
  const press = (after: object, switches: typeof ALL_TOOL_SWITCHES) => pressTool(SERVER, noHooks, routes({
    "/pokebench/state": before, "/action": { status: "success" }, "/queue_status": { queue_empty: true },
    "/pokebench/observation": observationBody({ state: after, state_text: "" }),
  }), instant, switches).execute("p", { buttons: ["UP"] });
  const noPosition = { ...ALL_TOOL_SWITCHES, position: false };
  expect((await press({ ...before, position: { x: 1, y: 1 } }, noPosition)).content[1]).toEqual({ type: "text", text: "pressed UP\nPress result: moved\n\n" });
  expect((await press({ ...before, facing: "left" }, noPosition)).content[1]).toEqual({ type: "text", text: "pressed UP\nPress result: turned; no net movement\n\n" });
  expect((await press({ ...before, field_controls_locked: true }, { ...ALL_TOOL_SWITCHES, fieldLock: false })).content[1]).toEqual({ type: "text", text: "pressed UP\nPress result: no movement or turn observed (cause not reported)\n\n" });
  expect((await press({ ...before, field_controls_locked: true }, ALL_TOOL_SWITCHES)).content[1]).toEqual({ type: "text", text: "pressed UP\nPress result: locked (field controls locked in a snapshot; no net movement)\n\n" });
  const screenOnly = { ...ALL_TOOL_SWITCHES, readout: false };
  expect(observeTool(SERVER, undefined, screenOnly).description).toBe("See the current game screen.");
  expect(pressTool(SERVER, noHooks, undefined, undefined, screenOnly).description).toBe("Press Game Boy Advance buttons in order (up to 8), then see the resulting screen.");
  expect(observeTool(SERVER).description).toBe("See the current game screen and the game state read from memory (location, party, map).");
  expect(pressTool(SERVER, noHooks).description).toBe("Press Game Boy Advance buttons in order (up to 8), then see the resulting screen and game state.");
});

it("delivers verified named interaction text with typed names through the real observe tool",async()=>{
 const text="Wall clock at (5,1), elevation 0; A; conditional";
 const body=observationBody({state:{...IN_GAME,interaction_targets:[{...schemaTarget,name:"Wall clock"},{...schemaTarget,name:null}]},state_text:text});
 const result=await observeTool(SERVER,serving(body)).execute("named",{});
 expect(result.content[1]).toEqual({type:"text",text});
});

describe("automatic running eligibility", () => {
  const running = { permitted:true, controllable:true, reason:"permitted", shoes:true, allow_running:true, avatar_flags:1, metatile:0, elevation:3, map_type:3, callback1:0x08085E05, callback2:0x08085E5D, diagnostic:null, raw_hex:null };
  const field = {...IN_GAME,screen:"overworld",in_battle:false,field_controls_locked:false,active_ui:null,running};
  it("requires independent opt-in and ignores model walking requests when enabled",()=>{
    expect(permitsAutomaticRunning(field,["UP"],false,true)).toBe(true);
    expect(permitsAutomaticRunning(field,["UP"],true,true)).toBe(true);
    expect(permitsAutomaticRunning(field,["UP"],false,false)).toBe(false);
    expect(permitsAutomaticRunning(field,["UP"],false,undefined)).toBe(false);
  });
  it("only qualifies directions and explicit native control permission",()=>{
    for(const buttons of [["A"],["UP","A"],["UP","B"],["START"],[]] as const)expect(permitsAutomaticRunning(field,buttons,false,true)).toBe(false);
    for(const before of [undefined,{...field,running:null},{...field,running:{...running,permitted:null}},{...field,running:{...running,controllable:false}},{...field,screen:"field_transition"},{...field,in_battle:true},{...field,field_controls_locked:true},{...field,active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"A",diagnostic:null}}])expect(permitsAutomaticRunning(before,["UP"],false,true)).toBe(false);
  });
});

it("requests guarded simultaneous running even for a stale walking argument and records what the harness did",async()=>{
 const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
 const before={...IN_GAME,screen:"overworld",in_battle:false,field_controls_locked:false,active_ui:null,running};
 const bodies:unknown[]=[];const beforePress=vi.fn();
 const fetchFn=routes({"/pokebench/state":before,"/action":(init:RequestInit|undefined)=>{bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown);return {status:"success"};},"/pokebench/travel":(init:RequestInit|undefined)=>{bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown);return {status:"success"};},"/queue_status":{queue_empty:true},"/pokebench/observation":observationBody({state:before})});
 const tool=pressTool(SERVER,{beforePress,afterPress:()=>Promise.resolve()},fetchFn,instant,{...ALL_TOOL_SWITCHES,automaticRunning:true});
 expect(Object.hasOwn(tool.parameters.properties,"walking")).toBe(false);
 await tool.execute("run",{buttons:["UP"]});
 await tool.execute("walk",{buttons:["UP"],walking:true});
 await tool.execute("manual",{buttons:["UP","B"]});
 expect(bodies).toEqual([{buttons:["UP"],...PRESS_TIMING,automatic_running:true},{buttons:["UP"],...PRESS_TIMING,automatic_running:true},{buttons:["UP","B"],...PRESS_TIMING}]);
 expect(beforePress.mock.calls[0]?.[1]).toEqual(["UP"]);
 expect(beforePress.mock.calls[0]?.[4]).toEqual({automatic_running:true,requested_held_buttons:["B"]});
 expect(beforePress.mock.calls[1]?.[4]).toEqual({automatic_running:true,requested_held_buttons:["B"]});
 expect(Object.hasOwn(pressTool(SERVER,noHooks,fetchFn,instant,{...ALL_TOOL_SWITCHES,automaticRunning:false}).parameters.properties,"walking")).toBe(true);
});
it.each([true,false])("records and submits actual interaction inputs with safety %s",async(safeInterfaces)=>{
 const sent:unknown[]=[];let actual:readonly string[]=[];
 const fetchFn=routes({"/pokebench/state":IN_GAME,"/action":(init:RequestInit|undefined)=>{if(typeof init?.body!=="string")throw new Error("Expected JSON action body");sent.push(JSON.parse(init.body) as unknown);return {status:"success"};},"/queue_status":{queue_empty:true},"/pokebench/observation":observationBody()});
 const hooks={beforePress:(_id:string,buttons:readonly string[])=>{actual=buttons;},afterPress:()=>Promise.resolve()};
 const result=await pressTool(SERVER,hooks,fetchFn,instant,{...ALL_TOOL_SWITCHES,safeInterfaces}).execute("safe",{buttons:["A","A","A"]});
 expect(actual).toEqual(safeInterfaces?["A"]:["A","A","A"]);
 expect(sent).toEqual([{buttons:actual,...PRESS_TIMING}]);
 const text=result.content[1];if(text?.type!=="text")throw new Error("Missing input receipt");expect(text.text).toContain(safeInterfaces?"remaining inputs were not sent":"pressed A, A, A");
});
it("keeps free-field movement batches but bounds locked or unavailable movement",async()=>{
 for(const [state,expected] of [[{...IN_GAME,field_controls_locked:false},["RIGHT","RIGHT"]],[{...IN_GAME,field_controls_locked:true},["RIGHT"]],[{...IN_GAME,screen:"unknown",field_controls_locked:null},["RIGHT"]]] as const){
  let actual:readonly string[]=[];const fetchFn=routes({"/pokebench/state":state,"/action":{status:"success"},"/queue_status":{queue_empty:true},"/pokebench/observation":observationBody()});
  await pressTool(SERVER,{beforePress:(_id,buttons)=>{actual=buttons;},afterPress:()=>Promise.resolve()},fetchFn,instant,{...ALL_TOOL_SWITCHES,safeInterfaces:true}).execute("safe",{buttons:["RIGHT","RIGHT"]});
  expect(actual).toEqual(expected);
 }
});
