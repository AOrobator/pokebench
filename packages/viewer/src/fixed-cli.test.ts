import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {recipeText} from "../test-support/recipe-text.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fixedLaunchSpec, main, productionFixedHost, servingReceipt, type FixedCliDeps } from "./fixed-cli.js";
import { armFeatures, parseFixedDefinition, type FixedLane } from "./fixed-design.js";
import type { FixedRunOptions } from "./fixed-runner.js";
import { CONTROL_BASE_PATH, controlBaseText, draftDefinition, definition, MODEL_PATH, ROM_SHA1, START_SHA1, MENU_SHA1, MENU_START } from "../test-support/fixed.js";
import { Log, START } from "../test-support/events.js";


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
});
