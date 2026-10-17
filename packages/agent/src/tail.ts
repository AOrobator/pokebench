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
    case "operator_control": return ["OPERATOR", `${event.action.replace("_", " ")} ${event.status}${event.paused_ms === undefined ? "" : ` after ${String(Math.round(event.paused_ms / 1000))}s paused`}${event.emulator_frozen === false ? " (emulator NOT frozen)" : ""}`];
    case "objective_update": return ["objective", `${event.objective.status}: ${event.objective.title}`];
    case "objective_attempt": return ["attempt", `${event.attempt.outcome}${event.attempt.warning === null ? "" : `: ${event.attempt.warning}`}`];
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
    case "navigation_context":return ["NAVIGATION MEMORY",`${String(event.evidence.length)} references · ${clip(event.text,80)}`];
    case "milestone_hint":return ["MILESTONE HINT",clip(event.text,100)];
    case "ledger_context":return ["INSTRUCTION LEDGER",`${String(event.evidence.length)} references · ${clip(event.text,80)}`];
    case "belief_ledger":return ["DISPROVED BELIEFS",`${String(event.entries)} entr${event.entries===1?"y":"ies"} · ${clip(event.text,80)}`];
    case "decision_input":return ["DECISION INPUT",`decision ${String(event.decision_turn)} · state #${String(event.state_seq)} · ${clip(event.text,80)}`];
    case "wait_input":return ["WAIT",`${String(event.duration_ms)} ms (host time)`];
    case "human_input": return ["HUMAN", `${event.buttons.join(" ") || "idle"} · frames ${String(event.start_frame)}–${String(event.end_frame)}`];
    case "human_sample": return ["SAMPLE", `frame ${String(event.frame)} · emulated ${String(Math.round(event.frame/59.7275*1000))}ms`];
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
    case "battle_choice":return ["BATTLE CHOICE",`battle ${String(event.battle)} turn ${String(event.battle_turn)} · ${"species" in event.actor ? event.actor.species : "Trainer"} chose ${event.move?.name??event.action} (${event.origin})`];
    case "native_action": return ["ACTION", `${event.kind.replaceAll("_"," ")} · frame ${String(event.frame)}`];
    case "activity": return ["ACTIVITY", `${event.kind.replace("_"," ")} ×${String(event.count)}`];
    case "milestone":
      return ["MILESTONE", event.name];
    case "loop_guard": return ["LOOP", `${event.kind} ${event.phase}: ${event.message}`];
    case "dialogue_auto_advance": return ["DIALOGUE", `auto-advanced ${String(event.auto_presses)} B${event.battle_auto_presses===undefined?"":` (${String(event.battle_auto_presses)} in battle)`} (${event.tool}) · ${String(event.pages.length)} pages · stop ${event.stop}${event.dropped.length===0?"":` · ${String(event.dropped.length)} inputs not sent`}`];
    case "people_id_card": return ["OBSERVE", `ID card · ${event.key} · ${event.reason} · ${event.tool} result`];
    case "heal_before_trainers_warning": return ["SUPERVISOR", `heal before trainers · ${event.trainers.map((t) => `${t.sprite_kind ?? "unknown"} (${String(t.x)},${String(t.y)})`).join(", ")} · ${event.weak.map((w) => (w.kind === "fainted" ? `${w.species} fainted` : w.kind === "lead_below_half" ? `${w.species} ${String(w.hp)}/${String(w.max_hp)} below half` : `${w.species} no PP (${w.moves.join(", ")})`)).join(", ")} · ${event.heal === null ? "no place named" : event.heal.kind === "pokemon_center" ? `POKéMON CENTER in ${event.heal.town}` : `home in ${event.heal.town}`}`];
    case "story_battle_warning": return ["SUPERVISOR", `story battle warning · ${event.opponent} · ${event.party.map((p) => `${p.species} ${String(p.hp)}/${String(p.max_hp)}`).join(", ")}`];
    case "low_hp_trainer_warning": return ["SUPERVISOR", `low-HP trainer warning · ${event.species} ${String(event.hp)}/${String(event.max_hp)} · ${event.rival} at (${String(event.x)},${String(event.y)})`];
    case "text_only_supervisor": return ["SUPERVISOR", `text-only note ${String(event.note)}/${String(event.limit)} after ${String(event.replies)} replies · ${clip(event.text,80)}`];
    case "retry":
      return ["RETRY", `${String(event.attempt)}/${String(event.limit)} ${event.reason}`];
    case "disk_usage":
      return ["DISK", `frames at ${String(event.percent)}% of cap (${formatBytes(event.bytes)})`];
    case "frames_evicted":
      return ["EVICTED", `${String(event.files)} frames (${formatBytes(event.bytes)}) from ${event.from_run}`];
    case "state": {
      if (!("started" in event)) return ["STATE", "historical vendor state (unverified)"];
      if (!event.started || event.position === null) return ["STATE", `${event.screen}, game not started`];
      const at = ` (${String(event.position.x)},${String(event.position.y)})`;
      const party = event.party.length === 0 ? "none" : event.party.map((mon) => `${mon.species ?? "UNKNOWN"} L${String(mon.level)} ${String(mon.hp)}/${String(mon.max_hp)}`).join(" ");
      return [
        "STATE",
        `${event.location ?? "?"}${at} ${event.screen}, party ${party}, ₽${String(event.money ?? 0)}, ${String(event.badges.length)} badges, play ${clock(event.play_time_s ?? 0)}`,
      ];
    }
    case "telemetry_error":
      return ["TELEMETRY", `${event.source} read failed: ${event.message}`];
    case "assistant_delta":
      return ["STREAM", [event.thinking === "" ? "" : `think: ${clip(event.thinking)}`, event.text === "" ? "" : `say: ${clip(event.text)}`].filter((part) => part !== "").join(" ")];
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
      if (event.type !== "assistant_delta") print(formatEvent(event));
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
