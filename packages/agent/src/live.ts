// Live entrypoint for real, recorded runs: pi-agent-core on the local stack
// gateway drives the observe / press tools against an isolated game server
// (INV-7) on the real ROM, and every step lands in runs/<id>/events.jsonl.
//   smoke: a short scripted protocol (`just smoke-llm`)
//   play:  the M5 baseline agent from a fresh boot (`just run-agent`)
// Excluded from coverage per INV-6; logic lives in run.ts, recorder.ts,
// game-tools.ts and harness.ts.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadConfig } from "./config.js";
import { checkSmoke, observeTool, pressTool, serverHealthy } from "./game-tools.js";
import { discoverModels, selectModel, type GatewayModel } from "./gateway.js";
import { FrameStore } from "./frames.js";
import { MilestoneWatcher } from "./milestones.js";
import { Governor, piLoop, play, type Limits } from "./harness.js";
import { gatewayLoopConfig } from "./provider.js";
import type { RunRecorder } from "./recorder.js";
import { harnessInfo, newRunId, withRun, type RunHost, type ServerHandle } from "./run.js";

const HEALTH_TIMEOUT_MS = 180_000;
const LOOP_TIMEOUT_MS = 420_000;
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RUNS_ROOT = join(REPO_ROOT, "runs");
const VENDOR_DIR = join(REPO_ROOT, "env", "vendor", "continual-harness");
const SYSTEM_PROMPT = "You play Pokémon Emerald and report what you observe precisely.";

const PROMPT =
  "Complete this protocol in order. Do not skip a step, and never send a message that only " +
  "describes progress without the tool call it asks for.\n" +
  "1. Call the observe tool.\n" +
  "2. In your next message, describe the frame you were shown in one short sentence and, " +
  'in that same message, call the press tool with buttons ["A"].\n' +
  "3. Reply DONE followed by the current location from the press result.\n" +
  "The task is not finished until step 3.";

function git(cwd: string): (args: string[]) => string {
  return (args) => execFileSync("git", args, { cwd, encoding: "utf8" });
}

function piVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
  };
  return pkg.dependencies["@mariozechner/pi-agent-core"] ?? "unknown";
}

async function waitForHealthy(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverHealthy(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`game server not healthy within ${String(HEALTH_TIMEOUT_MS)} ms`);
}

function realHost(port: number): RunHost {
  const url = `http://127.0.0.1:${String(port)}`;
  return {
    serverHealthy,
    launchServer: async (runDir, runId, serverPort): Promise<ServerHandle> => {
      // INV-2: argv list. INV-7: the launcher builds runs/<id>/server and
      // isolates the vendor server. Own process group so stop() reaches both
      // the launcher and its server child.
      const python = join(REPO_ROOT, "env", ".venv", "bin", "python");
      const child = spawn(
        python,
        ["-m", "pokebench_env.launcher", "--run-dir", runDir, "--run-id", runId, "--port", String(serverPort)],
        { cwd: join(REPO_ROOT, "env"), stdio: ["ignore", "ignore", "inherit"], detached: true },
      );
      const exited = new Promise<void>((resolve) => {
        child.once("exit", () => {
          resolve();
        });
      });
      const stop = async (): Promise<void> => {
        if (child.exitCode === null && child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
        await exited;
      };
      try {
        await waitForHealthy(url);
      } catch (error) {
        await stop();
        throw error;
      }
      return { serverDir: join(runDir, "server"), stop };
    },
    harness: () => harnessInfo(git(REPO_ROOT)),
    vendorPin: () => git(VENDOR_DIR)(["rev-parse", "HEAD"]).trim(),
    milestones: new MilestoneWatcher(url),
  };
}

interface Live {
  readonly model: GatewayModel;
  readonly port: number;
  readonly gatewayUrl: string;
}

async function live(): Promise<Live> {
  const config = loadConfig(process.env);
  const configured = new URL(config.gameServerUrl);
  if (configured.hostname !== "127.0.0.1") {
    throw new Error(`POKEBENCH_GAME_SERVER_URL must be http://127.0.0.1:<port>; each run launches its own server (INV-7)`);
  }
  const port = Number(configured.port || "8000");
  const model = selectModel(
    await discoverModels({ gatewayUrl: config.gatewayUrl, visionModels: config.visionModels }),
    config.model,
  );
  if (!model.input.includes("image")) throw new Error(`model ${config.model} is not a vision lane; runs need one`);
  return { model, port, gatewayUrl: config.gatewayUrl };
}

function pressHooks(recorder: RunRecorder): Parameters<typeof pressTool>[1] {
  return {
    beforePress: (id, buttons) => {
      recorder.buttonPress(id, buttons);
    },
    afterPress: () => recorder.checkMilestones(),
  };
}

async function smoke(): Promise<void> {
  const { model, port, gatewayUrl } = await live();
  const runId = newRunId(new Date(), model.id, () => randomBytes(2).toString("hex"));
  const tools = ["observe", "press"];
  console.log(`live smoke: run ${runId}, model ${model.id} via ${gatewayUrl}`);
  console.log(`watch: just tail-run ${runId}   (frame: http://127.0.0.1:${String(port)}/stream)`);

  const reason = await withRun(
    {
      runsRoot: RUNS_ROOT,
      runId,
      port,
      model: { id: model.id, context_window: model.contextWindow, max_tokens: model.maxTokens, vision: true },
      sampling: { thinking_level: "medium", max_tokens: model.maxTokens },
      systemPrompt: SYSTEM_PROMPT,
      tools,
      startState: { kind: "boot" },
      harnessFeatures: [],
      budgets: { max_wall_ms: LOOP_TIMEOUT_MS },
      piVersion: piVersion(),
    },
    realHost(port),
    new FrameStore(RUNS_ROOT),
    async (recorder, gameServerUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, LOOP_TIMEOUT_MS);
      try {
        const prompt: AgentMessage = { role: "user", content: PROMPT, timestamp: Date.now() };
        const transcript = await runAgentLoop(
          [prompt],
          {
            systemPrompt: SYSTEM_PROMPT,
            messages: [],
            tools: [
              observeTool(gameServerUrl),
              pressTool(gameServerUrl, pressHooks(recorder)),
            ],
          },
          { ...gatewayLoopConfig(model, "medium"), transformContext: recorder.transformContext },
          recorder.emit,
          controller.signal,
        );
        const summary = checkSmoke(transcript);
        console.log(`tools: ${summary.toolCalls.join(", ")}`);
        for (const text of summary.texts) console.log(`model: ${text}`);
        return "completed";
      } finally {
        clearTimeout(timer);
      }
    },
  );
  console.log(`smoke-llm OK: run ${runId} ended (${reason}); events in runs/${runId}/events.jsonl`);
}

const PLAY_LIMITS: Limits = { maxTurns: 300, maxWallMs: 60 * 60_000, failureLimit: 3 };
const PLAY_MAX_TOKENS = 4096;
const PLAY_THINKING = "medium";

const PLAY_SYSTEM_PROMPT = `You are playing Pokémon Emerald on a Game Boy Advance emulator. Your goal is to make as much story progress as you can: start a new game, get your first Pokémon, and work toward defeating the first Gym Leader in Rustboro City.

You act only through two tools:
- observe: shows the current screen and a text readout of the game state read from memory (location, coordinates, party, and an ASCII map of the surroundings).
- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen and state.

Controls: A confirms, talks and interacts; B cancels and backs out; START opens the menu; each D-pad press moves one tile, and a press in a new direction may only turn you to face it.

In every reply, think briefly about what you see and what to do next, then call a tool. Replies without a tool call do nothing.`;

const PLAY_TASK = "The game has just booted. Begin playing.";

async function playAgent(): Promise<void> {
  const { model, port, gatewayUrl } = await live();
  const runId = newRunId(new Date(), model.id, () => randomBytes(2).toString("hex"));
  const maxTokens = Math.min(PLAY_MAX_TOKENS, model.maxTokens);
  console.log(`run-agent: run ${runId}, model ${model.id} via ${gatewayUrl}`);
  console.log(`watch: just tail-run ${runId}   (frame: http://127.0.0.1:${String(port)}/view)`);

  const reason = await withRun(
    {
      runsRoot: RUNS_ROOT,
      runId,
      port,
      model: { id: model.id, context_window: model.contextWindow, max_tokens: model.maxTokens, vision: true },
      sampling: { thinking_level: PLAY_THINKING, max_tokens: maxTokens },
      systemPrompt: PLAY_SYSTEM_PROMPT,
      tools: ["observe", "press"],
      startState: { kind: "boot" },
      harnessFeatures: [],
      budgets: { max_turns: PLAY_LIMITS.maxTurns, max_wall_ms: PLAY_LIMITS.maxWallMs },
      piVersion: piVersion(),
    },
    realHost(port),
    new FrameStore(RUNS_ROOT),
    async (recorder, gameServerUrl) => {
      const controller = new AbortController();
      const governor = new Governor({
        limits: PLAY_LIMITS,
        retry: (why, attempt, limit) => {
          recorder.retry(why, attempt, limit);
          console.log(`retry ${String(attempt)}/${String(limit)}: ${why}`);
        },
        abort: () => {
          controller.abort();
        },
        now: () => Date.now(),
      });
      const wall = setTimeout(() => {
        governor.abort("budget");
      }, PLAY_LIMITS.maxWallMs);
      const interrupt = (): void => {
        console.log("operator abort: finishing the run record");
        governor.abort("operator_abort");
      };
      process.once("SIGINT", interrupt);
      const loop = piLoop({
        systemPrompt: PLAY_SYSTEM_PROMPT,
        tools: [observeTool(gameServerUrl), pressTool(gameServerUrl, pressHooks(recorder))],
        base: { ...gatewayLoopConfig(model, PLAY_THINKING), maxTokens },
        governor,
        transformContext: recorder.transformContext,
        emit: recorder.emit,
        signal: controller.signal,
      });
      try {
        const task: AgentMessage = { role: "user", content: PLAY_TASK, timestamp: Date.now() };
        return await play(task, governor, loop);
      } finally {
        clearTimeout(wall);
        process.off("SIGINT", interrupt);
      }
    },
  );
  console.log(`run-agent: run ${runId} ended (${reason}); summary: just runs-summary ${runId}`);
}

const command = process.argv[2];
const entry = command === "smoke" ? smoke : command === "play" ? playAgent : null;
if (entry === null) {
  console.error("usage: live.js smoke | live.js play");
  process.exitCode = 2;
} else {
  entry().catch((error: unknown) => {
    console.error(`${command ?? ""} FAILED: ${String(error)}`);
    process.exitCode = 1;
  });
}
