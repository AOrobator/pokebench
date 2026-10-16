import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEvent, type RunEndReason, type RunEvent } from "./events.js";
import { deeperMilestone } from "./milestones.js";

export interface MilestoneReach {
  readonly name: string;
  readonly turn: number;
  readonly wallMs: number;
}

export interface RunSummary {
  readonly run: string;
  readonly probe?: boolean;
  readonly human?: boolean;
  readonly model: string;
  readonly reason: RunEndReason | "incomplete";
  readonly furthest: string | null;
  readonly turns: number;
  readonly wallMs: number;
  readonly tokens: { readonly input: number; readonly output: number };
  readonly presses: number;
  readonly retries: number;
  readonly toolErrors: number;
  readonly milestones: readonly MilestoneReach[];
}

export function readRun(runDir: string): RunEvent[] {
  const path = join(runDir, "events.jsonl");
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (line.trim() === "") return [];
      try {
        return [parseEvent(line)];
      } catch (error) {
        throw new Error(`${path}:${String(index + 1)}: ${String(error)}`, { cause: error });
      }
    });
}

export function summarize(events: readonly RunEvent[]): RunSummary {
  const start = events[0];
  if (start?.type !== "run_start") throw new Error("event log does not begin with run_start");
  const startedAt = Date.parse(start.t);
  const since = (event: RunEvent): number => Date.parse(event.t) - startedAt;
  const milestones: MilestoneReach[] = [];
  let presses = 0;
  let retries = 0;
  let toolErrors = 0;
  let tokens = { input: 0, output: 0 };
  for (const event of events) {
    if (event.type === "milestone" && event.origin !== "present_at_start") milestones.push({ name: event.name, turn: event.turn, wallMs: since(event) });
    else if (event.type === "button_press") presses += 1;
    else if (event.type === "retry") retries += 1;
    else if (event.type === "tool_result" && event.is_error) toolErrors += 1;
    else if (event.type === "assistant") {
      tokens = { input: tokens.input + event.usage.input, output: tokens.output + event.usage.output };
    }
  }
  const counts = { ...(start.controller?.kind === "human" ? { human: true } : {}), ...(start.harness_features.includes("probe") ? { probe: true } : {}), run: start.run, model: start.controller?.kind === "human" ? `Human · ${start.controller.name}` : start.model.id, presses, retries, toolErrors, milestones };
  const end = events.find((event) => event.type === "run_end");
  if (end !== undefined) {
    return {
      ...counts,
      reason: end.reason,
      furthest: end.furthest_milestone,
      turns: end.turns,
      wallMs: end.wall_ms,
      tokens: end.tokens,
    };
  }
  const last = events[events.length - 1] ?? start;
  return {
    ...counts,
    reason: "incomplete",
    furthest: milestones.reduce<string | null>((deepest, m) => deeperMilestone(deepest, m.name), null),
    turns: events.reduce((most, event) => Math.max(most, event.turn), 0),
    wallMs: since(last),
    tokens,
  };
}

function clock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${String(Math.floor(seconds / 60))}m${String(seconds % 60).padStart(2, "0")}s`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function table(rows: readonly string[][]): string[] {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  return rows.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd(),
  );
}

export function summaryLines(input: readonly RunSummary[]): string[] {
  const probes = input.filter((s) => s.probe === true).length;
  const humans = input.filter((s) => s.probe !== true && s.human === true);
  const summaries = input.filter((s) => s.probe !== true && s.human !== true);
  const header = ["run", "model", "reason", "furthest", "turns", "wall", "tokens in→out", "presses", "retries", "tool errors"];
  const rows = summaries.map((s) => [
    s.run,
    s.model,
    s.reason,
    s.furthest ?? "-",
    String(s.turns),
    clock(s.wallMs),
    `${String(s.tokens.input)}→${String(s.tokens.output)}`,
    String(s.presses),
    String(s.retries),
    String(s.toolErrors),
  ]);
  const incomplete = summaries.filter((s) => s.reason === "incomplete").length;
  const lines = [
    ...table([header, ...rows]),
    "",
    `${String(summaries.length)} runs: ${String(incomplete)} incomplete${incomplete > 0 ? " (no run_end: live, or lost — PB2)" : ""}`,
  ];
  if (probes > 0) lines.push(`${String(probes)} probe sessions excluded from benchmark results`);
  const names = [...new Set(summaries.flatMap((s) => s.milestones.map((m) => m.name)))];
  for (const name of names) {
    const reaches = summaries.flatMap((s) => s.milestones.filter((m) => m.name === name).slice(0, 1));
    lines.push(
      `${name.padEnd(18)}reached ${String(reaches.length)}/${String(summaries.length)}  ` +
        `median turn ${String(median(reaches.map((m) => m.turn)))}  median wall ${clock(median(reaches.map((m) => m.wallMs)))}`,
    );
  }
  if (humans.length > 0) {
    lines.push("", "Human sessions", ...table([["run", "controller", "reason", "furthest", "wall"], ...humans.map((s) => [s.run, s.model, s.reason, s.furthest ?? "-", clock(s.wallMs)])]), `${String(humans.length)} human sessions excluded from model benchmark results`);
  }
  return lines;
}
