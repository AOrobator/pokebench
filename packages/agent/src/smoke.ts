// Live smoke for M3: a real pi-agent-core loop, against the real local stack
// gateway, calling a `screenshot` tool backed by the real game server on the
// real ROM. The model must describe the frame it was shown, then complete a
// second tool call. Entrypoint: excluded from coverage per INV-6 and
// exercised by `just smoke-llm`; tools and checks live in game-tools.ts.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadConfig, type PokebenchConfig } from "./config.js";
import { checkSmoke, screenshotTool, serverHealthy, stateTool } from "./game-tools.js";
import { discoverModels, selectModel } from "./gateway.js";
import { gatewayLoopConfig } from "./provider.js";

const HEALTH_TIMEOUT_MS = 180_000;
const LOOP_TIMEOUT_MS = 420_000;

// INV-2: argv list, never a shell string. The launcher prepares the ROM
// symlink and binds the server to 127.0.0.1.
function spawnGameServer(port: string): ChildProcess {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const python = join(repoRoot, "env", ".venv", "bin", "python");
  const child = spawn(python, ["-m", "pokebench_env.launcher"], {
    cwd: join(repoRoot, "env"),
    env: { ...process.env, POKEBENCH_GAME_PORT: port },
    stdio: ["ignore", "inherit", "inherit"],
    // Own process group: the launcher does not forward SIGTERM to its
    // `pokebench_env.serve` child, so stopping only the launcher orphaned it.
    detached: true,
  });
  child.on("error", (cause) => {
    console.error(`game server failed to start: ${String(cause)}`);
    process.exit(1);
  });
  return child;
}

async function waitForHealthyServer(gameServerUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverHealthy(gameServerUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`game server not healthy within ${String(HEALTH_TIMEOUT_MS)} ms`);
}

const PROMPT =
  "Complete this protocol in order. Do not skip a step, and never send a message that only " +
  "describes progress without the tool call it asks for.\n" +
  "1. Call the screenshot tool.\n" +
  "2. In your next message, describe the frame you were shown in one short sentence and, " +
  "in that same message, call the state tool.\n" +
  "3. Reply DONE followed by the player location from the state result.\n" +
  "The task is not finished until step 3.";

function report(transcript: readonly AgentMessage[]): void {
  console.log("\n--- transcript ---");
  for (const message of transcript) {
    if (message.role === "toolResult") {
      console.log(`tool: ${message.toolName}${message.isError ? " (error)" : ""}`);
    } else if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim() !== "") console.log(`model: ${block.text.trim()}`);
      }
    }
  }
  console.log("------------------");
}

async function main(): Promise<void> {
  const config: PokebenchConfig = loadConfig(process.env);
  const port = new URL(config.gameServerUrl).port !== "" ? new URL(config.gameServerUrl).port : "8000";

  if (await serverHealthy(config.gameServerUrl)) {
    throw new Error(
      `a game server is already healthy on ${config.gameServerUrl}; stop it first so the smoke ` +
        "runs against a server it owns",
    );
  }

  const models = await discoverModels({
    gatewayUrl: config.gatewayUrl,
    visionModels: config.visionModels,
  });
  const model = selectModel(models, config.model);
  if (!model.input.includes("image")) {
    throw new Error(`model ${config.model} is not a vision lane; the smoke needs one`);
  }
  console.log(`live smoke: model ${model.id} via ${config.gatewayUrl}, lane image=${String(model.input)}`);

  const server = spawnGameServer(port);
  const controller = new AbortController();
  const loopTimeout = setTimeout(() => {
    controller.abort();
  }, LOOP_TIMEOUT_MS);
  try {
    await waitForHealthyServer(config.gameServerUrl);
    console.log("game server healthy; running the agent loop");

    const prompt: AgentMessage = { role: "user", content: PROMPT, timestamp: Date.now() };
    const transcript = await runAgentLoop(
      [prompt],
      {
        systemPrompt: "You play Pokémon Emerald and report what you observe precisely.",
        messages: [],
        tools: [screenshotTool(config.gameServerUrl), stateTool(config.gameServerUrl)],
      },
      gatewayLoopConfig(model, "medium"),
      () => undefined,
      controller.signal,
    );
    report(transcript);
    checkSmoke(transcript);
    console.log(`smoke-llm OK: model ${model.id} described a real frame and completed two tool calls`);
  } finally {
    clearTimeout(loopTimeout);
    const exited = new Promise((resolve) => {
      server.once("exit", resolve);
    });
    if (server.pid !== undefined) process.kill(-server.pid, "SIGTERM");
    await exited;
  }
}

main().catch((error: unknown) => {
  console.error(`smoke-llm FAILED: ${String(error)}`);
  process.exitCode = 1;
});
