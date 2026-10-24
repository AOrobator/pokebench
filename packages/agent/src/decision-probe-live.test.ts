import { ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Context, Model } from "@mariozechner/pi-ai";
import type { RunHost, RunPlan } from "./run.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";
import type { FrameStore } from "./frames.js";
import { flagFeatures } from "./play-preset.js";
import { assistant, toolCall } from "../test-support/pi.js";

// Decision-point probes rebuild the context a recorded turn was decided from. This drives the real
// live.ts play path with a fixture model that records every context it is sent, then checks the
// probe's rebuild of each turn against what the model actually received.
const owner = vi.hoisted(() => ({
  root: "",
  launched: false,
  exited: false,
  inferences: 0,
  // cut-off-reply-feedback-v1: the scripted reply with no tool call stops at max_tokens instead of ending normally.
  cutOff: false,
  contexts: [] as Context[],
  child: null as ChildProcess | null,
  resolve: null as ((value: RunEndReason) => void) | null,
  reject: null as ((error: unknown) => void) | null,
}));
const MODEL: Model<"openai-completions"> = {
  id: "fixture-vlm", name: "fixture-vlm", api: "openai-completions", provider: "local-gateway", baseUrl: "http://fixture.invalid/v1",
  reasoning: true, input: ["text", "image"], contextWindow: 1000, maxTokens: 100, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const FRAME = Buffer.alloc(33);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(FRAME);
FRAME.writeUInt32BE(13, 8);
FRAME.write("IHDR", 12, "ascii");
FRAME.writeUInt32BE(240, 16);
FRAME.writeUInt32BE(160, 20);
vi.mock("node:child_process", async (load) => {
  const actual = await load<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: () => {
      const child = new actual.ChildProcess();
      Object.defineProperty(child, "pid", { value: 987655 });
      Object.defineProperty(child, "exitCode", { get: () => (owner.exited ? 0 : null) });
      owner.child = child;
      owner.launched = true;
      return child;
    },
    execFileSync: (_command: string, args: readonly string[], options: { cwd?: string }) =>
      args[0] === "status" ? "" : options.cwd?.includes("continual-harness") ? "bbab97ad73e460b7cd7c08527d10ced30cc03fbe" : "1".repeat(40),
  };
});
vi.mock("./config.js", () => ({
  loadConfig: () => ({ model: "fixture-vlm", gameServerUrl: "http://127.0.0.1:8123", gatewayUrl: "http://fixture.invalid/v1", visionModels: [], endpointFile: null }),
}));
vi.mock("./gateway.js", async (load) => ({ ...(await load<typeof import("./gateway.js")>()), discoverModels: () => Promise.resolve([]), selectModel: () => MODEL }));
// The scripted turns: observe, two presses, a text-only reply (nudged), then the same press until the budget.
const SCRIPT = [
  () => assistant({ thinking: "Look first.", toolCalls: [toolCall("c1", "observe", {})], stopReason: "toolUse" }),
  () => assistant({ thinking: "Talk to her.", text: "Pressing A.", toolCalls: [toolCall("c2", "press", { buttons: ["A"] })], stopReason: "toolUse" }),
  () => assistant({ thinking: "Again.", toolCalls: [toolCall("c3", "press", { buttons: ["A", "A"] }), toolCall("c4", "observe", {})], stopReason: "toolUse" }),
  () => assistant({ text: "I am thinking about it.", stopReason: owner.cutOff ? "length" : "stop" }),
];
vi.mock("./harness.js", async (load) => {
  const actual = await load<typeof import("./harness.js")>();
  const { createAssistantMessageEventStream } = await import("@mariozechner/pi-ai");
  return {
    ...actual,
    piLoop: (options: Parameters<typeof actual.piLoop>[0]) =>
      actual.piLoop({
        ...options,
        streamFn: (_model, context) => {
          owner.contexts.push(JSON.parse(JSON.stringify({ systemPrompt: context.systemPrompt, messages: context.messages, tools: (context.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) })) as Context);
          const message = (SCRIPT[owner.inferences] ?? (() => assistant({ thinking: "Same.", toolCalls: [toolCall(`c${String(owner.inferences + 10)}`, "press", { buttons: ["A"] })], stopReason: "toolUse" })))();
          owner.inferences++;
          const stream = createAssistantMessageEventStream();
          stream.push({ type: "done", reason: message.stopReason === "toolUse" ? "toolUse" : message.stopReason === "length" ? "length" : "stop", message });
          return stream;
        },
      }),
  };
});
vi.mock("./run.js", async (load) => {
  const actual = await load<typeof import("./run.js")>();
  const { FrameStore } = await import("./frames.js");
  return {
    ...actual,
    withRun: async (plan: RunPlan, host: RunHost, _frames: FrameStore, body: (recorder: RunRecorder, url: string) => Promise<RunEndReason>) => {
      try {
        const reason = await actual.withRun({ ...plan, runsRoot: owner.root }, host, new FrameStore(owner.root), body);
        owner.resolve?.(reason);
        return reason;
      } catch (error) {
        owner.reject?.(error);
        throw error;
      }
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (owner.root !== "") rmSync(owner.root, { recursive: true, force: true });
  owner.root = "";
});

// Recorded snapshots from finals run 6684 turn 600: waiting at the end of the Littleroot PC conversation,
// and, after A×8, the same conversation printing again from the top.
const PC = JSON.parse(readFileSync(new URL("../test-support/littleroot-pc-restart.json", import.meta.url), "utf8")) as { before: Record<string, unknown>; after: Record<string, unknown> };
// Recorded before route103_rival existed; today's reader always sends it.
PC.before = { ...PC.before, route103_rival: null, story_progress:null }; PC.after = { ...PC.after, route103_rival: null, story_progress:null };

// The same place once the box is closed: no message, field controls free.
const FREE = { ...PC.before, field_controls_locked: false, world_context: { ...(PC.before.world_context as Record<string, unknown>), dialogue: null, message: null } };

async function recordRun(features: Record<string, boolean>, maxTurns = 9, cutOff = false, failureLimit = 3): Promise<string> {
  vi.resetModules();
  owner.root = mkdtempSync(join(tmpdir(), "decision-probe-"));
  owner.launched = false;
  owner.exited = false;
  owner.inferences = 0;
  owner.contexts = [];
  owner.cutOff = cutOff;
  const romPath = join(owner.root, "fixture.gba");
  writeFileSync(romPath, "test-owned ROM identity fixture");
  vi.stubEnv("POKEBENCH_ROM", romPath);
  const preset = { version: 2, id: "probe", target: null, limits: { maxTurns, maxWallMs: 45 * 60_000, failureLimit }, sampling: { thinkingLevel: "medium", maxTokens: 100 }, features };
  const path = join(owner.root, "preset.json");
  writeFileSync(path, JSON.stringify(preset));
  vi.stubEnv("POKEBENCH_PLAY_PRESET", path);
  vi.stubEnv("POKEBENCH_RUN_ID", "decision-probe");
  vi.spyOn(process, "kill").mockImplementation(() => {
    if (owner.child === null) throw new Error("missing owned child");
    owner.exited = true;
    owner.child.emit("exit", 0, null);
    return true;
  });
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), "play"] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // live.ts reports any failed start (e.g. a rejected preset) only as "<command> FAILED: ..."; end the wait on it instead of hanging.
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { const line = args.map(String).join(" "); if (/^\S* FAILED: /.test(line)) owner.reject?.(new Error(line)); });
  // Each press closes the box and the same conversation prints again from the top (the 6684 shape).
  // Like the real server, the game keeps running between reads: each free-field snapshot is a later frame,
  // so auto-advance confirms free field instead of waiting out its settle timeout on every turn.
  let presses = 0, free = false, frame = 0;
  const raw = PC.before.raw_ram as { frame: number };
  const freeAt = () => {
    frame += 1;
    return { ...FREE, raw_ram: { ...raw, frame: raw.frame + frame } };
  };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = new URL(url).pathname;
    if (route === "/health") return Promise.resolve(Response.json({ status: owner.launched ? "healthy" : "unavailable" }));
    if (route === "/pokebench/battle/choices" || route === "/pokebench/actions") return Promise.resolve(Response.json({ frame: 0, last_id: 0, entries: [] }));
    if (route === "/pokebench/state") return Promise.resolve(Response.json(free ? freeAt() : PC.before));
    if (route === "/pokebench/observation") return Promise.resolve(Response.json({ state_text: `Screen: overworld\nDialog: printing (${String(presses)})`, state: free ? freeAt() : PC.after, screenshot_base64: FRAME.toString("base64") }));
    if (route === "/queue_status") return Promise.resolve(Response.json({ queue_empty: true }));
    if (route === "/action" && init?.method === "POST") {
      presses++;
      // B closes the box (auto-advance); A starts the conversation again.
      free = typeof init.body === "string" && (JSON.parse(init.body) as { buttons: string[] }).buttons.includes("B");
      return Promise.resolve(Response.json({ status: "success" }));
    }
    throw new Error(`Unexpected fixture route ${route}`);
  }));
  const done = new Promise<RunEndReason>((resolve, reject) => { owner.resolve = resolve; owner.reject = reject; });
  await import("./live.js");
  await done;
  return join(owner.root, "decision-probe");
}

// What the provider sees: roles and content, minus wall-clock timestamps and provider bookkeeping.
// The real file adapter (it reads each frame once), with a renderer that must never be reached here.
async function framePorts(dir: string, reads: string[] = []) {
  const { filePorts } = await import("./probe-decision-cli.js");
  return filePorts(dir, join(dir, "no-env"), "reasoning_content", () => { throw new Error("no server switch flipped"); }, (path) => { reads.push(path); return readFileSync(path); });
}

const sent = (c: Context) => ({ systemPrompt: c.systemPrompt, tools: (c.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), messages: c.messages.map((m) => (m.role === "toolResult" ? { role: m.role, toolCallId: m.toolCallId, toolName: m.toolName, content: m.content, isError: m.isError } : m.role === "assistant" ? { role: m.role, content: m.content, provider: m.provider, api: m.api } : { role: m.role, content: m.content })) });

it.each([
  ["the guard, supervisor, stall briefing, navigation memory and ledger", { ...flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false }), "loop-guard-supervisor-v1": true, "interaction-loop-detection-v1": true, "navigation-evidence-memory-v1": true, "instruction-ledger-v1": true, "transition-press-result-v1": true }],
  ["the plain play preset", flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false })],
  ["dialogue auto-advance, whose results are kept as recorded", { ...flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false }), "transition-press-result-v1": true, "field-dialogue-phase-v1": true, "dialogue-auto-advance-v1": true }],
  ["fresh retries, which keep text-only replies out of context", { ...flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }), "fresh-retry-v1": true }],
])("rebuilds every recorded turn exactly as the model received it, with %s", async (_label, features) => {
  const dir = await recordRun(features, 14);
  const probe = await import("./decision-probe.js");
  const run = probe.parseRun(readFileSync(join(dir, "events.jsonl"), "utf8"));
  const reads: string[] = [];
  const ports = await framePorts(dir, reads);
  const turns = run.events.flatMap((e) => (e.type === "turn_start" ? [e] : []));
  expect(turns.length).toBe(owner.contexts.length);
  expect(turns.length).toBeGreaterThan(5);
  for (const [i, start] of turns.entries()) {
    const recorded = owner.contexts[i];
    if (recorded === undefined) throw new Error("missing context");
    for (const derivation of ["recorded", "replayed"] as const) {
      const rebuilt = await probe.decisionContext(run, start.turn, probe.recordedFeatures(run), ports, derivation);
      expect({ turn: start.turn, derivation, ...sent({ systemPrompt: rebuilt.systemPrompt, messages: [...rebuilt.messages], tools: [...rebuilt.tools] }) }).toEqual({ turn: start.turn, derivation, ...sent(recorded) });
      expect(rebuilt.size).toEqual(start.context);
    }
  }
  // Rebuilding every turn re-reads the growing history, but each frame file is read from disk once.
  expect(reads.length).toBeGreaterThan(0);
  expect(new Set(reads).size).toBe(reads.length);
  if (features["loop-guard-supervisor-v1"]) expect(owner.contexts.at(-1)?.messages.some((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("SUPERVISOR"))).toBe(true);
  if (features["dialogue-auto-advance-v1"]) {
    expect(run.events.some((e) => e.type === "dialogue_auto_advance")).toBe(true);
    // An auto-advanced result is composed from many inner presses, so a switch that shapes its text, or a re-render, is refused rather than guessed.
    const last = turns.at(-1)?.turn ?? 0;
    const recorded = probe.recordedFeatures(run);
    await expect(probe.decisionContext(run, last, probe.withSwitches(recorded, [{ id: "transition-press-result-v1", on: false }]), ports)).rejects.toThrow(/was auto-advanced through dialogue; its text cannot be re-derived/);
    await expect(probe.decisionContext(run, last, probe.withSwitches(recorded, [{ id: "pushback-press-result-v1", on: !recorded["pushback-press-result-v1"] }]), ports)).rejects.toThrow(/was auto-advanced through dialogue; its text cannot be re-derived/);
    await expect(probe.decisionContext(run, last, recorded, ports, "replayed", true)).rejects.toThrow(/was auto-advanced through dialogue/);
    await expect(probe.decisionContext(run, last, probe.withSwitches(recorded, [{ id: "fresh-retry-v1", on: !recorded["fresh-retry-v1"] }]), ports)).resolves.toBeDefined();
  }
}, 60_000);

it.each([[true], [false]])("delivers the cut-off notice through live.ts with cut-off-reply-feedback-v1 %s, and probes rebuild it", async (on) => {
  const features = { ...flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }), "cut-off-reply-feedback-v1": on };
  const dir = await recordRun(features, 9, true);
  const { NUDGE } = await import("./harness.js");
  const { cutOffReplyNotice } = await import("./cut-off-reply.js");
  // The scripted fourth reply stopped at max_tokens (100 here) with no tool call; the fifth request carries the follow-up.
  const followUp = owner.contexts[4]?.messages.at(-1);
  const notice = "Your last reply reached the output limit (100 tokens) before it made a tool call, so nothing happened in the game. Make one tool call now.";
  expect(followUp).toMatchObject({ role: "user", content: on ? notice : NUDGE });
  expect(cutOffReplyNotice({ ...features }, 100)).toBe(on ? notice : undefined);
  const probe = await import("./decision-probe.js");
  const run = probe.parseRun(readFileSync(join(dir, "events.jsonl"), "utf8"));
  expect(run.events.some((e) => e.type === "assistant" && e.stop_reason === "length")).toBe(true);
  const ports = await framePorts(dir);
  const turns = run.events.flatMap((e) => (e.type === "turn_start" ? [e] : []));
  for (const [i, start] of turns.entries()) {
    const recorded = owner.contexts[i];
    if (recorded === undefined) throw new Error("missing context");
    for (const derivation of ["recorded", "replayed"] as const) {
      const rebuilt = await probe.decisionContext(run, start.turn, probe.recordedFeatures(run), ports, derivation);
      expect({ turn: start.turn, derivation, ...sent({ systemPrompt: rebuilt.systemPrompt, messages: [...rebuilt.messages], tools: [...rebuilt.tools] }) }).toEqual({ turn: start.turn, derivation, ...sent(recorded) });
    }
  }
  // Flipping the switch in a probe changes exactly that follow-up.
  const flipped = await probe.decisionContext(run, turns[4]?.turn ?? 0, probe.withSwitches(probe.recordedFeatures(run), [{ id: "cut-off-reply-feedback-v1", on: !on }]), ports);
  expect(flipped.messages.at(-1)).toMatchObject({ role: "user", content: on ? NUDGE : notice });
}, 60_000);

it("re-derives press results under a flipped switch and reports how the next call changes", async () => {
  const dir = await recordRun(flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }));
  const probe = await import("./decision-probe.js");
  const cli = await import("./probe-decision-cli.js");
  const run = probe.parseRun(readFileSync(join(dir, "events.jsonl"), "utf8"));
  const ports = await framePorts(dir);
  const last = run.events.filter((e) => e.type === "turn_start").at(-1)?.turn ?? 0;
  const args = cli.parseArgs([dir, String(last), "--switch", "transition-press-result-v1=on", "--samples", "2"]);
  let n = 0;
  const report = await cli.probe(run, args, ports, (context) => {
    n++;
    const restarted = context.messages.some((m) => m.role === "toolResult" && m.content.some((p) => p.type === "text" && p.text.includes("restarted")));
    return Promise.resolve(assistant({ toolCalls: [toolCall(`s${String(n)}`, restarted ? "navigate_to" : "press", restarted ? { x: 1, y: 2 } : { buttons: ["A"] })], stopReason: "toolUse" }));
  });
  expect(report.fidelity).toBe(true);
  expect(report.diff?.systemPrompt).toBe(false);
  expect(report.diff?.messages.length).toBeGreaterThan(0);
  const flipped = report.arms[1]?.context.messages.flatMap((m) => (m.role === "toolResult" ? m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])) : [])) ?? [];
  expect(flipped.some((t) => t.includes("Press result: conversation restarted: this text was already shown"))).toBe(true);
  expect(report.arms.map((a) => a.decisions.map((d) => d.key))).toEqual([["press {\"buttons\":[\"A\"]}", "press {\"buttons\":[\"A\"]}"], ["navigate_to {\"x\":1,\"y\":2}", "navigate_to {\"x\":1,\"y\":2}"]]);
  const lines = cli.reportLines(report);
  expect(lines[0]).toBe(`run decision-probe turn ${String(last)}: recorded action press {"buttons":["A"]}`);
  expect(lines[1]).toMatch(/→ same size$/);
  expect(lines).toContain("transition-press-result-v1=on (2 samples):");
  expect(lines).toContain("  2× navigate_to {\"x\":1,\"y\":2}");
});

it("re-renders the window's readouts from raw RAM when asked, keeping each tool's prefix", async () => {
  const dir = await recordRun(flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }), 4);
  const probe = await import("./decision-probe.js");
  const run = probe.parseRun(readFileSync(join(dir, "events.jsonl"), "utf8"));
  const recorded = probe.recordedFeatures(run);
  const flipped = probe.withSwitches(recorded, [{ id: "named-warp-destinations-v1", on: true }]);
  expect(probe.serverSwitch("named-warp-destinations-v1")).toBe(true);
  expect(probe.serverSwitch("active-ui-ownership-v1")).toBe(true);
  expect(probe.serverSwitch("transition-press-result-v1")).toBe(false);
  const asked: { refs: number; on: boolean }[] = [];
  const ports = {
    thinkingSignature: "reasoning_content",
    frame: (p: string) => readFileSync(join(dir, p)).toString("base64"),
    rerender: (refs: readonly { path: string }[], features: typeof recorded) => {
      const on = features["named-warp-destinations-v1"];
      asked.push({ refs: refs.length, on });
      return Promise.resolve(refs.map(() => `Screen: overworld\nWarps: ${on ? "named" : "plain"}`));
    },
  };
  const turn = run.events.filter((e) => e.type === "turn_start").at(-1)?.turn ?? 0;
  const plain = await probe.decisionContext(run, turn, flipped, ports);
  expect(asked).toEqual([]);
  const rebuilt = await probe.decisionContext(run, turn, flipped, ports, "replayed", true);
  const results = run.events.flatMap((e) => (e.type === "tool_result" ? [e] : []));
  expect(asked).toEqual([{ refs: results.length, on: true }]);
  const texts = rebuilt.messages.flatMap((m) => (m.role === "toolResult" ? m.content.flatMap((p) => (p.type === "text" ? [p.text] : [])) : []));
  expect(texts.length).toBe(results.length);
  expect(texts.every((t) => t.endsWith("Screen: overworld\nWarps: named"))).toBe(true);
  expect(texts.filter((t) => /^pressed A(, A)*\nPress result: /.test(t)).length).toBe(results.filter((r) => r.name === "press").length);
  expect(probe.contextDiff(plain, rebuilt).messages.length).toBe(results.length);
  await expect(probe.decisionContext(run, 999, recorded, ports)).rejects.toThrow(/turn 999 has no turn_start/);
  await expect(probe.decisionContext(run, turn, { ...recorded, "objective-tracking-v1": true }, ports)).rejects.toThrow(/objective-tracking/);
  await expect(probe.decisionContext(run, turn, flipped, ports, "recorded")).rejects.toThrow(/only under the run's own switches/);
});

it("builds the run's tool definitions with ports that never touch a game", async () => {
  const dir = await recordRun(flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }), 2);
  const probe = await import("./decision-probe.js");
  const run = probe.parseRun(readFileSync(join(dir, "events.jsonl"), "utf8"));
  const replay = new probe.Replay(run.start);
  const { tools } = probe.probeTools(probe.recordedFeatures(run), replay);
  expect(tools.map((t) => t.name)).toEqual(run.start.tools);
  const press = tools.find((t) => t.name === "press");
  await expect(press?.execute("x", { buttons: ["A"] })).rejects.toThrow(/probe tools never execute/);
  await expect(tools.find((t) => t.name === "observe")?.execute("y", {})).rejects.toThrow(/probe tools never execute/);
  expect(() => replay.recordState()).toThrow(/never execute/);
  expect(() => replay.recordDialogueAutoAdvance()).toThrow(/never execute/);
});

it.each([[false,false],[true,false],[true,true],[false,true]])("records and delivers cut-off recovery (feedback %s, breaker %s)",async(on,breaker)=>{
 const features={...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"cut-off-reply-feedback-v1":on,"text-only-supervisor-v1":true,"fixed-point-breaker-v1":breaker};
 const dir=await recordRun(features,6,true,1);
 const {parseRun,decisionContext,recordedFeatures}=await import("./decision-probe.js");
 const run=parseRun(readFileSync(join(dir,"events.jsonl"),"utf8"));
 const note=run.events.find(e=>e.type==="text_only_supervisor");
 expect(note).toMatchObject({type:"text_only_supervisor",turn:4});
 if(note?.type!=="text_only_supervisor")throw new Error("missing recorded supervisor");
 if(on)expect(note.text).toContain("Your last reply reached the output limit (100 tokens)");
 else expect(note.text).not.toContain("output limit");
 expect(owner.contexts[4]?.messages).toContainEqual(expect.objectContaining({role:"user",content:note.text}));
 const recovery=run.events.filter(e=>e.type==="loop_breaker"&&e.trigger==="no_tool_call"&&e.stage===2);
 expect(recovery).toHaveLength(breaker?1:0);
 for(const e of recovery)if(e.type==="loop_breaker"){if(on)expect(e.text).toContain("output limit (100 tokens)");else expect(e.text).not.toContain("output limit");}
 const ports=await framePorts(dir);
 for(const derivation of breaker?["replayed"] as const:["recorded","replayed"] as const){
  const rebuilt=await decisionContext(run,5,recordedFeatures(run),ports,derivation);
  expect(sent({systemPrompt:rebuilt.systemPrompt,messages:[...rebuilt.messages],tools:[...rebuilt.tools]})).toEqual(sent(owner.contexts[4] ?? {systemPrompt:"",messages:[],tools:[]}));
 }
},60000);
