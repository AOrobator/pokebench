import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { object, text } from "./codex-capture.js";
import { startCodexCaptureBridge, writeCodexControl } from "./codex-capture-bridge.js";

export async function codexCaptureCommand(argv: readonly string[]): Promise<string> {
  const { values } = parseArgs({ args: [...argv], options: {
    "capture-phase": { type: "string" }, "capture-key": { type: "string" }, control: { type: "string" },
    source: { type: "string" }, session: { type: "string" }, events: { type: "string" }, run: { type: "string" },
    model: { type: "string" }, context: { type: "string" }, tokens: { type: "string" }, port: { type: "string" }, reply: { type: "string" },
  } });
  const required = (key: keyof typeof values): string => {
    const value = values[key]; if (!value) throw new Error(`missing --${key}`); return value;
  };
  const integer = (key: keyof typeof values, minimum: number, maximum: number): number => {
    const number = Number(required(key)); if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`invalid --${key}`); return number;
  };
  const phase = required("capture-phase"), controlPath = required("control");
  if (phase === "serve") {
    const bridge = await startCodexCaptureBridge({ source: required("source"), sessionId: required("session"), eventsPath: resolve(required("events")), runId: required("run"), model: required("model"), contextWindow: integer("context", 1, 10_000_000), maxTokens: integer("tokens", 1, 10_000_000), port: integer("port", 0, 65535) });
    try { writeCodexControl(controlPath, bridge); } catch (error) { await bridge.close(); throw error; }
    const stop = (): void => { void bridge.close().catch((error: unknown) => { console.error(String(error)); process.exitCode = 1; }); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    return JSON.stringify({ url: bridge.url, control: resolve(controlPath) });
  }
  if (!["pending", "begin", "respond"].includes(phase)) throw new Error("unknown capture phase");
  const control = object(JSON.parse(readFileSync(controlPath, "utf8")) as unknown);
  const url = new URL(text(control["url"]));
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("control URL must be an unadorned loopback HTTP origin");
  const payload = phase === "pending" ? null : { ...(phase === "respond" ? object(JSON.parse(readFileSync(required("reply"), "utf8")) as unknown) : {}), key: required("capture-key") };
  const response = await fetch(`${url.origin}/capture/${phase}`, { method: payload === null ? "GET" : "POST", headers: { authorization: `Bearer ${text(control["token"])}`, "content-type": "application/json" }, ...(payload === null ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(10_000), redirect: "error" });
  const result = await response.text(); if (!response.ok) throw new Error(`capture ${phase} HTTP${String(response.status)}: ${result}`); return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  codexCaptureCommand(process.argv.slice(2)).then(result => { console.log(result); }, (error: unknown) => { console.error(String(error)); process.exitCode = 1; });
}
