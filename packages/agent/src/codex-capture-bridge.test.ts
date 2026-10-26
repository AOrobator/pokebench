import { afterEach, expect, it, vi } from "vitest";
import { appendFileSync, existsSync, fsyncSync, mkdtempSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stream, type Model } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { RUN_START_META } from "../test-support/events.js";
import { nativeHeader, nativeAnchor, nativeSummary, nativeLine } from "../test-support/codex-native.js";
import { userImage } from "../test-support/pi.js";
import { object, text } from "./codex-capture.js";
import { startCodexCaptureBridge, writeCodexControl } from "./codex-capture-bridge.js";
import { codexCaptureCommand } from "./codex-capture-cli.js";
import { FrameStore } from "./frames.js";
import { RunLog } from "./run-log.js";
import { RunRecorder } from "./recorder.js";
import { parseEvent } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";

const owned: string[] = [];
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeSync: vi.fn(actual.writeSync), fsyncSync: vi.fn(actual.fsyncSync) };
});
const open: Awaited<ReturnType<typeof startCodexCaptureBridge>>[] = [];
afterEach(async () => { for (const bridge of open.splice(0)) await bridge.close(); for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
const state: GameStateSnapshot = { screen: "overworld", started: true, name: "MAY", location: "TEST", map_id: [0, 9], position: { x: 1, y: 1 }, facing: "down", in_battle: false, party: [], money: 0, badges: [], play_time_s: 0 };
async function fixture(summary = "detailed", limits: { maxBodyBytes?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "codex-bridge-")); owned.push(dir);
  const source = join(dir, "native.jsonl"); writeFileSync(source, nativeHeader(summary));
  const log = RunLog.create(dir, "capture-test");
  const recorder = new RunRecorder({ log, frames: new FrameStore(dir, 100_000, () => undefined), milestones: { poll: () => Promise.resolve([]) }, gameState: { read: () => Promise.resolve(state) } });
  await recorder.start({ ...RUN_START_META, model: { ...RUN_START_META.model, id: "test-model" } }, false);
  const bridge = await startCodexCaptureBridge({ source, sessionId: "player-session", eventsPath: log.eventsPath, runId: log.runId, model: "test-model", contextWindow: 32768, maxTokens: 1024, pollMs: 60_000, ...limits }); open.push(bridge);
  const control = join(dir, "control.json"); writeCodexControl(control, bridge);
  const model: Model<"openai-completions"> = { id: "test-model", name: "test", api: "openai-completions", provider: "capture-test", baseUrl: `${bridge.url}/v1`, reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 1024 };
  const command = async (phase: string, key?: string, reply?: string) => JSON.parse(await codexCaptureCommand([`--capture-phase=${phase}`, `--control=${control}`, ...(key ? [`--capture-key=${key}`] : []), ...(reply ? [`--reply=${reply}`] : [])])) as unknown;
  const pending = async () => {
    let key = "";
    await vi.waitFor(async () => { const value = object(await command("pending")); key = text(value["key"]); }, { timeout: 1000, interval: 10 }); return key;
  };
  return { dir, source, log, recorder, bridge, model, command, pending };
}

it("runs two fake game decisions through the CLI, real pi parser and recorder, preserving source and exact game-turn links", async () => {
  const f = await fixture();
  const expected = ["Use Ember 🌿", ""];
  for (const [n, thinking] of expected.entries()) {
    await f.recorder.transformContext([userImage()]);
    const response = stream(f.model, { systemPrompt: "fake game", messages: [userImage()], tools: [{ name: "press", description: "fake button", parameters: Type.Object({ buttons: Type.Array(Type.String()) }) }] }, { apiKey: "fake", maxTokens: 64 });
    const key = await f.pending();
    appendFileSync(f.source, nativeAnchor(key, "begin", `begin-${String(n)}`));
    const begun = object(await f.command("begin", key));
    expect(object(begun["request"])["messages"]).toEqual(expect.arrayContaining([expect.objectContaining({ role: "user" })]));
    expect(JSON.stringify(begun["request"])).toContain('"type":"image_file"');
    appendFileSync(f.source, nativeLine({ type: "function_call_output", call_id: `begin-${String(n)}`, output: "fake observation" }));
    if (thinking) appendFileSync(f.source, nativeSummary(thinking, `summary-${String(n)}`));
    appendFileSync(f.source, nativeLine({ message: "retained compaction", replacement_history: [] }, "compacted") + nativeAnchor(key, "respond", `respond-${String(n)}`));
    const reply = join(f.dir, `reply-${String(n)}.json`); writeFileSync(reply, JSON.stringify({ name: "press", arguments: { buttons: ["A"] }, text: "Advance." }));
    expect(await f.command("respond", key, reply)).toMatchObject({ summary_status: n === 0 ? "summary_recorded" : "none_emitted" });
    for await (const event of response) {
      if (event.type === "thinking_delta" || event.type === "text_delta") await f.recorder.emit({ type: "message_update", message: event.partial, assistantMessageEvent: event });
    }
    const message = await response.result();
    expect(message.stopReason).toBe("toolUse");
    expect(message.content.filter(p => p.type === "thinking").map(p => p.thinking).join("")).toBe(expected[n]);
    await f.recorder.emit({ type: "message_end", message });
    await f.recorder.emit({ type: "tool_execution_start", toolCallId: `call_${key}`, toolName: "press", args: { buttons: ["A"] } });
    await f.recorder.emit({ type: "tool_execution_end", toolCallId: `call_${key}`, toolName: "press", result: { content: [{ type: "text", text: "fake result" }] }, isError: false });
    f.bridge.tick();
  }
  await f.bridge.close();
  const archived = join(f.log.runDir, "attached-harness/codex");
  expect(readFileSync(join(archived, "native.jsonl"))).toEqual(readFileSync(f.source));
  const index = readFileSync(join(archived, "index.jsonl"), "utf8").trim().split("\n").map(l => object(JSON.parse(l) as unknown));
  expect(index.filter(r => r["kind"] === "game_turn").map(r => [r["turn"], r["event_type"]])).toEqual([[1, "assistant"], [1, "tool_call"], [1, "tool_result"], [2, "assistant"], [2, "tool_call"], [2, "tool_result"]]);
  expect(index.filter(r => r["kind"] === "sealed").map(r => r["bridge"])).toEqual([expect.objectContaining({ run: f.log.runId, unresolved: [], status: "complete" })]);
  expect(index.filter(r => r["kind"] === "sealed").map(r => object(r["bridge"])["events_prefix"])).toEqual([expect.objectContaining({ complete: true })]);
  const requests = index.filter(r => r["kind"] === "request"); expect(requests).toHaveLength(2);
  expect(index.filter(r => r["kind"] === "response")).toHaveLength(2);
  const firstRequest = object(object(requests[0])["artifact"]);
  expect(readFileSync(text(firstRequest["path"]), "utf8")).toContain("data:image/png;base64,AAAA");
  const images = object(requests[0])["images"] as unknown[];
  expect(images).toHaveLength(1);
  expect(readFileSync(text(object(images[0])["path"]))).toEqual(Buffer.from("AAAA", "base64"));
  const events = readFileSync(f.log.eventsPath, "utf8").trim().split("\n").map(parseEvent);
  expect(events.filter(e => e.type === "assistant").map(e => e.thinking)).toEqual(expected);
});

it("rejects disabled native summaries and never forwards an action", async () => {
  const f = await fixture("none");
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin"));
  await expect(f.command("begin", key)).rejects.toThrow(/summary.*disabled/);
  const failed = await completion; expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("tool_calls");
});

it("fails closed on an actual archive write failure before any action is forwarded", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin"));
  vi.mocked(writeSync).mockImplementationOnce(() => { throw new Error("ENOSPC injected archive disk full"); });
  await expect(f.command("begin", key)).rejects.toThrow(/ENOSPC/);
  const response = await completion; expect(response.status).toBe(503); expect(await response.text()).not.toContain("tool_calls");
  const index = readFileSync(join(f.log.runDir, "attached-harness/codex/index.jsonl"), "utf8");
  expect(index).toContain("capture_failure"); expect(index).not.toContain('"kind":"response"');
});

it("protects the control endpoint and rejects browser origins without creating a capture", async () => {
  const f = await fixture();
  expect((await fetch(`${f.bridge.url}/capture/pending`)).status).toBe(403);
  expect((await fetch(`${f.bridge.url}/models`, { headers: { origin: "https://example.com" } })).status).toBe(403);
  const models = object(await (await fetch(`${f.bridge.url}/models`)).json()); expect(models["data"]).toEqual([expect.objectContaining({ id: "test-model", context_window: 32768 })]);
  expect(existsSync(join(f.log.runDir, "attached-harness"))).toBe(false);
  expect((await fetch(`${f.bridge.url}/missing`)).status).toBe(404);
});

it("refuses a wrong run identity before writing into its directory", async () => {
  const f = await fixture();
  writeFileSync(f.log.eventsPath, readFileSync(f.log.eventsPath, "utf8").replaceAll('"capture-test"', '"other-run"'));
  const response = await fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) });
  expect(response.status).toBe(503); expect(await response.text()).toContain("run/sequence mismatch");
  expect(existsSync(join(f.log.runDir, "attached-harness"))).toBe(false);
});

it("does not accept fabricated thinking in the response command", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin")); await f.command("begin", key);
  const response = await fetch(`${f.bridge.url}/capture/respond`, { method: "POST", headers: { authorization: `Bearer ${f.bridge.token}`, "content-type": "application/json" }, body: JSON.stringify({ key, name: "press", arguments: {}, thinking: "invented" }) });
  expect(response.status).toBe(503); expect(await response.text()).toContain("reasoning is read only");
  expect((await completion).status).toBe(503);
});

it("marks an abandoned pending decision incomplete at shutdown", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) }).catch(() => null);
  const key = await f.pending(); await f.bridge.close(); await completion;
  const index = readFileSync(join(f.log.runDir, "attached-harness/codex/index.jsonl"), "utf8").trim().split("\n").map(l => object(JSON.parse(l) as unknown));
  expect(index.filter(r => r["kind"] === "sealed").map(r => r["bridge"])).toEqual([expect.objectContaining({ status: "incomplete", unresolved: [key] })]);
});

it("commits the response receipt durably before emitting the action SSE", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [{ type: "function", function: { name: "press" } }] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin")); await f.command("begin", key);
  appendFileSync(f.source, nativeLine({ type: "custom_tool_call_output", call_id: "begin", output: "observation" }) + nativeSummary("Press A") + nativeAnchor(key, "respond"));
  f.bridge.tick();
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(writeSync).mockImplementation((fd: number, data: unknown, ...rest: unknown[]) => {
    if (Buffer.isBuffer(data) && data.toString().includes('"kind":"response"')) throw new Error("ENOSPC response receipt");
    const result: unknown = Reflect.apply(actual.writeSync, undefined, [fd, data, ...rest]);
    if (typeof result !== "number") throw new Error("invalid write result"); return result;
  });
  try {
    const reply = join(f.dir, "receipt-failure.json"); writeFileSync(reply, JSON.stringify({ name: "press", arguments: { buttons: ["A"] } }));
    await expect(f.command("respond", key, reply)).rejects.toThrow(/ENOSPC response receipt/);
    const response = await completion; expect(response.status).toBe(503); expect(await response.text()).not.toContain("tool_calls");
  } finally { vi.mocked(writeSync).mockImplementation(actual.writeSync); }
});

it("does not forward an action when the response receipt fsync fails", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [{ type: "function", function: { name: "press" } }] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin")); await f.command("begin", key);
  appendFileSync(f.source, nativeLine({ type: "custom_tool_call_output", call_id: "begin", output: "observation" }) + nativeAnchor(key, "respond")); f.bridge.tick();
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  let responseFd: number | null = null;
  vi.mocked(writeSync).mockImplementation((fd: number, data: unknown, ...rest: unknown[]) => {
    if (Buffer.isBuffer(data) && data.toString().includes('"kind":"response"')) responseFd = fd;
    const result: unknown = Reflect.apply(actual.writeSync, undefined, [fd, data, ...rest]);
    if (typeof result !== "number") throw new Error("invalid write result"); return result;
  });
  vi.mocked(fsyncSync).mockImplementation(fd => {
    if (fd === responseFd) { responseFd = null; throw new Error("EIO response fsync"); } actual.fsyncSync(fd);
  });
  try {
    const reply = join(f.dir, "fsync-failure.json"); writeFileSync(reply, JSON.stringify({ name: "press", arguments: { buttons: ["A"] } }));
    await expect(f.command("respond", key, reply)).rejects.toThrow(/EIO response fsync/);
    const response = await completion; expect(response.status).toBe(503); expect(await response.text()).not.toContain("tool_calls");
  } finally { vi.mocked(writeSync).mockImplementation(actual.writeSync); vi.mocked(fsyncSync).mockImplementation(actual.fsyncSync); }
});

it("exercises CLI server lifetime and safe argument/control-file rejection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-cli-")); owned.push(dir);
  const control = join(dir, "control.json");
  const beforeTerm = new Set(process.listeners("SIGTERM")), beforeInt = new Set(process.listeners("SIGINT"));
  try {
    const result = object(JSON.parse(await codexCaptureCommand(["--capture-phase=serve", `--control=${control}`, `--source=${join(dir, "not-started.jsonl")}`, "--session=one", `--events=${join(dir, "not-created/events.jsonl")}`, "--run=future-run", "--model=test-model", "--context=1000", "--tokens=100", "--port=0"])) as unknown);
    expect((await fetch(`${text(result["url"])}/models`)).status).toBe(200);
    const added = process.listeners("SIGTERM").filter(listener => !beforeTerm.has(listener)); expect(added).toHaveLength(1);
    const stop = added[0]; if (!stop) throw new Error("missing owned shutdown listener"); stop("SIGTERM");
    await vi.waitFor(async () => { await expect(fetch(`${text(result["url"])}/models`)).rejects.toThrow(); }, { timeout: 1000, interval: 10 });
  } finally {
    for (const listener of process.listeners("SIGTERM")) if (!beforeTerm.has(listener)) process.removeListener("SIGTERM", listener);
    for (const listener of process.listeners("SIGINT")) if (!beforeInt.has(listener)) process.removeListener("SIGINT", listener);
  }
  await expect(codexCaptureCommand([])).rejects.toThrow(/capture-phase/);
  await expect(codexCaptureCommand(["--capture-phase=unknown", `--control=${control}`])).rejects.toThrow(/unknown capture phase/);
  writeFileSync(control, JSON.stringify({ url: "https://example.com", token: "test" }));
  await expect(codexCaptureCommand(["--capture-phase=pending", `--control=${control}`])).rejects.toThrow(/loopback/);
  expect(() => { writeCodexControl(control, { url: "http://127.0.0.1:1", token: "other" }); }).toThrow();
});

it("rejects an oversized body using a tiny injected bound without creating a run archive", async () => {
  const f = await fixture("detailed", { maxBodyBytes: 16 });
  const response = await fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }) });
  expect(response.status).toBe(503); expect(await response.text()).toContain("byte bound");
  expect(existsSync(join(f.log.runDir, "attached-harness"))).toBe(false);
});

it("takes the actual game turn from events and rejects a result belonging to another turn", async () => {
  const f = await fixture();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [{ type: "function", function: { name: "press" } }] }) });
  const key = await f.pending(); appendFileSync(f.source, nativeAnchor(key, "begin")); await f.command("begin", key);
  appendFileSync(f.source, nativeLine({ type: "custom_tool_call_output", call_id: "begin", output: "observation" }) + nativeAnchor(key, "respond"));
  const reply = join(f.dir, "wrong-turn.json"); writeFileSync(reply, JSON.stringify({ name: "press", arguments: { buttons: ["A"] } }));
  await f.command("respond", key, reply); expect((await completion).status).toBe(200);
  f.log.append({ type: "assistant", turn: 41, thinking: "", text: "", tool_calls: [{ id: `call_${key}`, name: "press", args: { buttons: ["A"] } }], usage: { input: 0, output: 0, cache_read: 0 }, latency_ms: 1, ttft_ms: null, stop_reason: "toolUse" });
  f.log.append({ type: "tool_call", turn: 41, id: `call_${key}`, name: "press", args: { buttons: ["A"] } });
  f.log.append({ type: "tool_result", turn: 42, id: `call_${key}`, name: "press", is_error: false, duration_ms: 1, text: "fake", frames: [] });
  expect(() => { f.bridge.tick(); }).toThrow(/tool result lacks a unique captured assistant/);
  const index = readFileSync(join(f.log.runDir, "attached-harness/codex/index.jsonl"), "utf8").trim().split("\n").map(l => object(JSON.parse(l) as unknown));
  expect(index.filter(r => r["kind"] === "game_turn").map(r => r["turn"])).toEqual([41, 41]);
  await expect(f.command("pending")).rejects.toThrow(/HTTP503/);
});


it("retains a disconnected request as unresolved in the final seal", async () => {
  const f = await fixture(); const controller = new AbortController();
  const completion = fetch(`${f.bridge.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "test-model", messages: [], tools: [] }), signal: controller.signal }).catch(() => null);
  const key = await f.pending(); controller.abort(); await completion;
  await vi.waitFor(async () => { expect(await f.command("pending")).toBeNull(); }, { timeout: 1000, interval: 10 });
  await f.bridge.close();
  const index = readFileSync(join(f.log.runDir, "attached-harness/codex/index.jsonl"), "utf8").trim().split("\n").map(l => object(JSON.parse(l) as unknown));
  expect(index.filter(r => r["kind"] === "sealed").map(r => r["bridge"])).toEqual([expect.objectContaining({ status: "incomplete", unresolved: [key] })]);
});
