import type { BodyOf, RunEndReason } from "./events.js";
import type { FrameStore } from "./frames.js";
import type { MilestoneSource } from "./milestones.js";
import { RunRecorder } from "./recorder.js";
import { RunLog, easternTimestamp } from "./run-log.js";

type RunStart = BodyOf<"run_start">;

export interface RunPlan {
  readonly runsRoot: string;
  readonly runId: string;
  readonly port: number;
  readonly model: RunStart["model"];
  readonly sampling: RunStart["sampling"];
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly startState: RunStart["start_state"];
  readonly harnessFeatures: readonly string[];
  readonly budgets: RunStart["budgets"];
  readonly piVersion: string;
}

export interface ServerHandle {
  readonly serverDir: string;
  stop(): Promise<void>;
}

export interface RunHost {
  serverHealthy(url: string): Promise<boolean>;
  launchServer(runDir: string, runId: string, port: number): Promise<ServerHandle>;
  harness(): RunStart["harness"];
  vendorPin(): string;
  readonly milestones: MilestoneSource;
}

export function newRunId(now: Date, modelId: string, random: () => string): string {
  const stamp = easternTimestamp(now).slice(0, 19).replace(/:/g, "-");
  const model = modelId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stamp}_${model}_${random()}`;
}

export function harnessInfo(git: (args: string[]) => string): RunStart["harness"] {
  return {
    commit: git(["rev-parse", "HEAD"]).trim(),
    dirty: git(["status", "--porcelain"]).trim() !== "",
  };
}

export async function withRun(
  plan: RunPlan,
  host: RunHost,
  frames: FrameStore,
  body: (recorder: RunRecorder, gameServerUrl: string) => Promise<RunEndReason>,
): Promise<RunEndReason> {
  frames.assertCanStart();
  const url = `http://127.0.0.1:${String(plan.port)}`;
  if (await host.serverHealthy(url)) {
    throw new Error(`a game server is already running on ${url}; every run needs its own (INV-7)`);
  }
  const harness = host.harness();
  const vendorPin = host.vendorPin();
  const log = RunLog.create(plan.runsRoot, plan.runId);
  const server = await host.launchServer(log.runDir, plan.runId, plan.port);
  const recorder = new RunRecorder({ log, frames, milestones: host.milestones });
  let reason: RunEndReason = "crash";
  try {
    await recorder.start({
      model: plan.model,
      sampling: plan.sampling,
      system_prompt: plan.systemPrompt,
      tools: [...plan.tools],
      harness,
      vendor_pin: vendorPin,
      pi_version: plan.piVersion,
      start_state: plan.startState,
      harness_features: [...plan.harnessFeatures],
      budgets: plan.budgets,
      isolation: { server_dir: server.serverDir, run_data_id: plan.runId, load_checkpoint_mode: false, port: plan.port },
    });
    reason = await body(recorder, url);
    return reason;
  } finally {
    try {
      if (log.nextSeq > 0 && !log.ended) recorder.end(reason);
    } finally {
      await server.stop();
    }
  }
}
