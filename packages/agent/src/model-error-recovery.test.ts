import { describe, expect, it, vi } from "vitest";
import {
  CEILING_RATIO,
  InputCeiling,
  LaneReadiness,
  ceilingFor,
  modelsProbe,
  refusedPromptTokens,
} from "./model-error-recovery.js";

// The lane's own refusal, verbatim from runs/2026-11-01T09-25-00_deepseek-v4.1-flash-mlx_control24h.
const MLX_REFUSAL =
  "This prompt (42430 tokens) does not fit in GPU memory even after freeing the prefix cache: it requires ~2160MB GPU memory but only ~2046MB is available. It was refused before any work started. Reduce the prompt length, lower --ctx-size, or free memory on the machine.";

describe("refusedPromptTokens", () => {
  it("reads the lane's memory refusal", () => {
    expect(refusedPromptTokens(MLX_REFUSAL)).toBe(42430);
  });

  it("reads the llama.cpp overflow wording it already reports", () => {
    expect(refusedPromptTokens("request (12345 tokens) exceeds the available context size")).toBe(12345);
  });

  it("reads the vLLM overflow wording", () => {
    expect(
      refusedPromptTokens(
        "This model's maximum context length is 32768 tokens. However, you requested 40000 tokens. Please reduce the length of the prompt. prompt contains at least 39000 input tokens",
      ),
    ).toBe(39000);
  });

  it("returns null for a lane error that is not about size", () => {
    expect(refusedPromptTokens("connect ECONNREFUSED 127.0.0.1:8091")).toBeNull();
    expect(refusedPromptTokens("HTTP 502")).toBeNull();
    expect(refusedPromptTokens(undefined)).toBeNull();
  });
});

describe("ceiling", () => {
  it("leaves a quarter of the refused prompt for the reply", () => {
    expect(CEILING_RATIO).toBe(0.75);
    expect(ceilingFor(42430)).toBe(31822);
    expect(ceilingFor(4)).toBe(3);
    expect(ceilingFor(1)).toBe(1);
  });

  it("lowers but never raises the ceiling", () => {
    const ceiling = new InputCeiling();
    expect(ceiling.limit).toBeNull();
    expect(ceiling.lower(42430)).toBe(31822);
    expect(ceiling.lower(50000)).toBe(31822);
    expect(ceiling.lower(20000)).toBe(15000);
    expect(ceiling.limit).toBe(15000);
  });
});

describe("LaneReadiness", () => {
  it("polls the probe, not a fixed sleep, until the lane answers", async () => {
    const answers = [false, false, true];
    const sleeps: number[] = [];
    const events: string[] = [];
    const ready = new LaneReadiness({
      probe: () => Promise.resolve(answers.shift() ?? true),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      onWait: (phase, waitedMs) => events.push(`${phase}:${String(waitedMs)}`),
    });
    expect(await ready.wait()).toBe(1500);
    expect(sleeps).toEqual([500, 1000]);
    expect(events).toEqual(["start:0", "ready:1500"]);
  });

  it("returns at once and records nothing when the lane is up", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const onWait = vi.fn();
    const ready = new LaneReadiness({ probe: () => Promise.resolve(true), sleep, onWait });
    expect(await ready.wait()).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
    expect(onWait).not.toHaveBeenCalled();
  });

  it("grows the interval and stops at one minute", async () => {
    const sleeps: number[] = [];
    const ready = new LaneReadiness({
      probe: () => Promise.resolve(false),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      capMs: 60_000,
      attempts: 9,
    });
    await ready.wait();
    expect(sleeps).toEqual([500, 1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]);
  });

  it("stops waiting when the run is aborted", async () => {
    const controller = new AbortController();
    const ready = new LaneReadiness({
      probe: () => Promise.resolve(false),
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
    });
    await expect(ready.wait(controller.signal)).rejects.toThrow("aborted");
  });

  it("does not probe at all once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const probe = vi.fn(() => Promise.resolve(true));
    const ready = new LaneReadiness({ probe, sleep: () => Promise.resolve() });
    await expect(ready.wait(controller.signal)).rejects.toThrow("aborted");
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("modelsProbe", () => {
  it("asks the lane's own /models endpoint for a 200", async () => {
    const calls: string[] = [];
    const probe = modelsProbe("http://127.0.0.1:8091/v1/", (url) => {
      calls.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    expect(await probe()).toBe(true);
    expect(calls).toEqual(["http://127.0.0.1:8091/v1/models"]);
  });

  it("treats a refusal or a broken connection as not ready", async () => {
    const refused = modelsProbe("http://127.0.0.1:8091/v1", () => Promise.resolve(new Response(null, { status: 503 })));
    expect(await refused()).toBe(false);
    const broken = modelsProbe("http://127.0.0.1:8091/v1", () => Promise.reject(new Error("ECONNREFUSED")));
    expect(await broken()).toBe(false);
  });
});
