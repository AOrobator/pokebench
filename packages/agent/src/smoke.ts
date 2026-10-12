// Live smoke: a real, recorded run. pi-agent-core on the local gateway
// drives screenshot / press / state tools against an isolated game server
// (INV-7) on the real ROM, and every step lands in runs/<id>/events.jsonl.
// Entrypoint: excluded from coverage per INV-6 and exercised by
// `just smoke-llm`. Run logic lives in run.ts, recorder.ts and game-tools.ts.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadConfig } from "./config.js";
import { checkSmoke, pressTool, screenshotTool, serverHealthy, stateTool } from "./game-tools.js";
import { discoverModels, selectModel } from "./gateway.js";
import { FrameStore } from "./frames.js";
import { StateWatcher } from "./game-state.js";
import { MilestoneWatcher } from "./milestones.js";
import { gatewayLoopConfig } from "./provider.js";
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
  "1. Call the screenshot tool.\n" +
  "2. In your next message, describe the frame you were shown in one short sentence and, " +
  'in that same message, call the press tool with buttons ["A"].\n' +
  "3. Call the state tool.\n" +
  "4. Reply DONE followed by the player location from the state result.\n" +
  "The task is not finished until step 4.";

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
    gameState: new StateWatcher(url),
  };
}

async function main(): Promise<void> {
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
  if (!model.input.includes("image")) throw new Error(`model ${config.model} is not a vision lane; the smoke needs one`);

  const runId = newRunId(new Date(), model.id, () => randomBytes(2).toString("hex"));
  const tools = ["screenshot", "press", "state"];
  console.log(`live smoke: run ${runId}, model ${model.id} via ${config.gatewayUrl}`);
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
              screenshotTool(gameServerUrl),
              pressTool(gameServerUrl, {
                beforePress: (id, buttons, timing) => {
                  recorder.buttonPress(id, buttons, timing);
                },
                afterPress: () => recorder.afterPress(),
              }),
              stateTool(gameServerUrl),
            ],
          },
          { ...gatewayLoopConfig(model, "medium"), transformContext: recorder.transformContext },
          recorder.emit,
          controller.signal,
        );
        const summary = checkSmoke(transcript);
        console.log(`tools: ${summary.toolCalls.join(", ")}`);
        for (const text of summary.texts) console.log(`model: ${text}`);
        return "budget";
      } finally {
        clearTimeout(timer);
      }
    },
  );
  console.log(`smoke-llm OK: run ${runId} ended (${reason}); events in runs/${runId}/events.jsonl`);
}

main().catch((error: unknown) => {
  console.error(`smoke-llm FAILED: ${String(error)}`);
  process.exitCode = 1;
});
