import { describe, expect, it, vi } from "vitest";
import { fixedLaunchSpec, servingReceipt } from "./fixed-cli.js";
import type { FixedStart } from "./fixed-design.js";
import { trialEnv } from "./fixed-runner.js";
import { definition, CLOCK_START } from "../test-support/fixed.js";
import { type FixedLane } from "./fixed-design.js";
import { MODEL_PATH } from "../test-support/fixed.js";


const llamaLane = (modelUrl: string): FixedLane => ({ id: "A", gpu: "GPU0", gamePort: 8071, modelUrl });

describe("production host pieces", () => {
  it("reads a llama-server's identity from /props, /v1/models and /health", async () => {
    const props = { model_path: MODEL_PATH, build_info: "b10236-1464c62d8", total_slots: 1, modalities: { vision: true }, default_generation_settings: { n_ctx: 65536 }, chat_template: "T" };
    const models = { models: [{ model: MODEL_PATH, capabilities: ["completion", "multimodal"] }], data: [{ id: MODEL_PATH, meta: { n_ctx: 65536 } }] };
    const fetchFn = vi.fn<typeof fetch>((url) => {
      const u = url as string;
      if (u.endsWith("/health")) return Promise.resolve(new Response(JSON.stringify({ status: "ok" })));
      return Promise.resolve(new Response(JSON.stringify(u.endsWith("/props") ? props : models)));
    });
    const receipt = await servingReceipt(llamaLane("http://127.0.0.1:8091"), fetchFn);
    expect(receipt).toMatchObject({ model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1, vision: true });
    expect(receipt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await servingReceipt(llamaLane("http://127.0.0.1:8098"), fetchFn)).fingerprint).toBe(receipt.fingerprint);
    await expect(servingReceipt(llamaLane("http://x"), vi.fn<typeof fetch>().mockResolvedValue(new Response("loading", { status: 503 })))).rejects.toThrow("http://x/health answered HTTP 503");
    await expect(servingReceipt(llamaLane("http://x"), vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")))).rejects.toThrow("http://x/props is not a llama-server /props payload");
  });

  it("launches each trial from the pinned experiment checkout, writing to the main runs root", () => {
    const commit = "f3f4b3b7".padEnd(40, "0");
    const spec = fixedLaunchSpec({ root: "/repo", runsRoot: "/repo/runs", node: "/bin/node", env: { PATH: "/bin", POKEBENCH_ROM: "/rom.gba", POKEBENCH_RUNS_ROOT: "/elsewhere", POKEBENCH_RUN_ID: "stale" } }, commit, { POKEBENCH_RUN_ID: "r1" });
    expect(spec.argv).toEqual([`/private/tmp/pokebench-fixed-${commit.slice(0, 12)}/packages/agent/dist/live.js`, "play"]);
    expect(spec.command).toBe("/bin/node");
    // Relative preset paths (the start save) resolve against the main checkout.
    expect(spec.cwd).toBe("/repo");
    expect(spec.env).toEqual({ PATH: "/bin", POKEBENCH_ROM: "/rom.gba", POKEBENCH_RUNS_ROOT: "/repo/runs", POKEBENCH_RUN_ID: "r1" });
  });

  it("saves frontier checkpoints on boot starts only, and only from the lane's own setting", () => {
    const env = (start: FixedStart) => trialEnv(
      definition({ phases: [{ id: "p", perArm: 1, maxWallMs: 900_000, primary: true, start }] }),
      { slot: 1, phase: "p", arm: "control" }, { gamePort: 8071 }, { endpoint: "/e", preset: "/p", run: "r" },
    );
    expect(env({ kind: "boot" })["POKEBENCH_CHECKPOINT_FRONTIER"]).toBe("1");
    expect(env(CLOCK_START)).not.toHaveProperty("POKEBENCH_CHECKPOINT_FRONTIER");
    expect(env(CLOCK_START)).toMatchObject({ POKEBENCH_RUN_ID: "r", POKEBENCH_PLAY_PRESET: "/p", POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8071" });
    const inherited = { POKEBENCH_CHECKPOINT_FRONTIER: "1" };
    expect(fixedLaunchSpec({ root: "/r", runsRoot: "/r/runs", node: "/n", env: inherited }, "c".repeat(40), {}).env).toEqual({ POKEBENCH_RUNS_ROOT: "/r/runs" });
  });
});
