import { open } from "node:fs/promises";
import { join } from "node:path";
import { parseEvent, type RunEvent } from "./events.js";
import { formatBytes } from "./format.js";

const THINKING_CHARS = 120;

function clip(text: string, limit = THINKING_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function clock(seconds: number): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

function body(event: RunEvent): [string, string] {
  switch (event.type) {
    case "run_start": {
      const start = event.start_state.kind === "boot" ? "boot" : event.start_state.path;
      const vision = event.model.vision ? " (vision)" : "";
      return [
        "RUN START",
        `${event.model.id}${vision} thinking=${event.sampling.thinking_level} tools=${event.tools.join(",")} start=${start}`,
      ];
    }
    case "turn_start":
      return [
        "TURN",
        `context ${String(event.context.messages)} msgs, ${String(event.context.images)} images, ~${String(event.context.est_tokens)} tokens`,
      ];
    case "assistant": {
      const ttft = event.ttft_ms === null ? "-" : `${String(event.ttft_ms)}ms`;
      const stop = event.stop_reason === "error" ? `error: ${event.error ?? "unknown"}` : event.stop_reason;
      const parts = [
        `${String(event.latency_ms)}ms (ttft ${ttft}) ${String(event.usage.input)}→${String(event.usage.output)} tok [${stop}]`,
      ];
      if (event.thinking !== "") parts.push(`think: ${clip(event.thinking)}`);
      if (event.text !== "") parts.push(`say: ${clip(event.text)}`);
      const calls = event.tool_calls.map((call) => `call ${call.name} ${clip(JSON.stringify(call.args), 60)}`);
      return ["MODEL", [parts.join(" "), ...calls].join(" | ")];
    }
    case "tool_call":
      return ["CALL", `${event.name} ${clip(JSON.stringify(event.args), 80)}`];
    case "button_press": {
      const timing =
        event.hold_frames === undefined
          ? ""
          : ` (hold ${String(event.hold_frames)}f, release ${String(event.release_frames ?? 0)}f)`;
      return ["PRESS", `${event.buttons.join(" ")}${timing}`];
    }
    case "tool_result": {
      const status = event.is_error ? "ERROR" : "ok";
      const frames = event.frames.length === 0 ? "" : ` [${String(event.frames.length)} frame${event.frames.length === 1 ? "" : "s"}]`;
      return ["RESULT", `${event.name} ${status} ${String(event.duration_ms)}ms: ${clip(event.text, 80)}${frames}`];
    }
    case "milestone":
      return ["MILESTONE", event.name];
    case "retry":
      return ["RETRY", `${String(event.attempt)}/${String(event.limit)} ${event.reason}`];
    case "disk_usage":
      return ["DISK", `frames at ${String(event.percent)}% of cap (${formatBytes(event.bytes)})`];
    case "frames_evicted":
      return ["EVICTED", `${String(event.files)} frames (${formatBytes(event.bytes)}) from ${event.from_run}`];
    case "state": {
      const at = event.position === null ? "" : ` (${String(event.position.x)},${String(event.position.y)})`;
      const party = event.party.length === 0 ? "none" : event.party.map((mon) => `${mon.species} L${String(mon.level)} ${String(mon.hp)}/${String(mon.max_hp)}`).join(" ");
      return [
        "STATE",
        `${event.location}${at} ${event.mode}, party ${party}, ₽${String(event.money)}, ${String(event.badges.length)} badges, play ${clock(event.play_time_s)}`,
      ];
    }
    case "telemetry_error":
      return ["TELEMETRY", `${event.source} read failed: ${event.message}`];
    case "compaction":
      return ["COMPACT", `context ${String(event.from_tokens)} → ${String(event.to_tokens)} tokens`];
    case "run_end":
      return [
        "RUN END",
        `${event.reason}, furthest ${event.furthest_milestone ?? "none"}, ${String(event.turns)} turns, ` +
          `${(event.wall_ms / 1000).toFixed(1)}s, ${String(event.tokens.input)}→${String(event.tokens.output)} tok, ` +
          `${String(event.frames.saved)} frames`,
      ];
  }
}

export function formatEvent(event: RunEvent): string {
  const [label, text] = body(event);
  return `${event.t.slice(11, 19)} ${`t${String(event.turn)}`.padStart(4)} ${label.padEnd(10)} ${text}`;
}

export interface FollowOptions {
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

export async function followEvents(
  path: string,
  onEvent: (event: RunEvent) => void,
  options: FollowOptions = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? 250;
  let offset = 0;
  let pending = "";
  const aborted = (): boolean => options.signal?.aborted === true;
  while (!aborted()) {
    const handle = await open(path, "r");
    try {
      const { size } = await handle.stat();
      if (size > offset) {
        const buffer = Buffer.alloc(size - offset);
        await handle.read(buffer, 0, buffer.length, offset);
        offset = size;
        pending += buffer.toString("utf8");
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim() !== "") onEvent(parseEvent(line));
          if (aborted()) return;
        }
      }
    } finally {
      await handle.close();
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function eventsPathFor(runsRoot: string, runId: string): string {
  return join(runsRoot, runId, "events.jsonl");
}

export async function tailRun(argv: readonly string[], runsRoot: string, print: (line: string) => void): Promise<number> {
  const [runId] = argv;
  if (runId === undefined || argv.length > 1) {
    print("usage: tail-run <run id>");
    return 2;
  }
  const controller = new AbortController();
  await followEvents(
    eventsPathFor(runsRoot, runId),
    (event) => {
      print(formatEvent(event));
      if (event.type === "run_end") controller.abort();
    },
    { signal: controller.signal },
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await tailRun(process.argv.slice(2), new URL("../../../runs/", import.meta.url).pathname, (line) => {
    console.log(line);
  });
}
