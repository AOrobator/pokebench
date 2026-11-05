import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { expect, it } from "vitest";
import type { GatewayModel } from "./gateway.js";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, featuresOf, playHarnessFeatures, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { playSampling } from "./presence-penalty.js";
import { gatewayLoopConfig, playLoopBase } from "./provider.js";
import { sentEffort, withReasoningEffort } from "./reasoning-effort.js";
import { VLLM_PROVIDER } from "./local-endpoint.js";

const ID = "reasoning-effort-request-v1";
const on: FeatureSet = { ...ALL_ON, [ID]: true, "presence-penalty-v1": false };
const off: FeatureSet = { ...on, [ID]: false };
const model = (provider = "local-llamacpp"): GatewayModel => ({ id: "m", provider, maxTokens: 10 }) as GatewayModel;
const body = (): object => ({ model: "m", chat_template_kwargs: { enable_thinking: true, preserve_thinking: true } });
const sent = (features: FeatureSet, thinking: "medium" | "low" | "off", provider?: string): unknown => {
  const hook = playLoopBase(model(provider), thinking, "k", 10, features).onPayload;
  return hook === undefined ? body() : hook(body(), model(provider));
};

it("registers a default-on agent-side switch at the end of the recorded list", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "guidance", needs: null, switchable: true });
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(featuresOf(playHarnessFeatures(off, null))[ID]).toBe(false);
  expect(featuresOf(playHarnessFeatures(on, null))[ID]).toBe(true);
  expect(SERVER_FEATURES).not.toContain(ID);
  const without = Object.fromEntries(Object.entries(ALL_ON).filter(([id]) => id !== ID)) as Parameters<typeof normalizeFeatures>[0];
  expect(normalizeFeatures(without)[ID]).toBe(true);
  expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
});

it("OFF leaves the request exactly as it was", async () => {
  expect(await sent(off, "medium")).toEqual(body());
  expect(playLoopBase(model(), "medium", "k", 10, off).onPayload).toBeUndefined();
  expect(gatewayLoopConfig(model(), "medium", "k").onPayload).toBeUndefined();
});

it("ON sends the run's level inside chat_template_kwargs through the production loop", async () => {
  const kwargs = { enable_thinking: true, preserve_thinking: true };
  expect(await sent(on, "medium")).toEqual({ model: "m", chat_template_kwargs: { ...kwargs, reasoning_effort: "medium" } });
  expect(await sent(on, "low", VLLM_PROVIDER)).toEqual({ model: "m", chat_template_kwargs: { ...kwargs, reasoning_effort: "low" } });
});

it("never sends an effort with thinking off, or to a body with no template arguments", async () => {
  expect(await sent(on, "off")).toEqual(body());
  expect(sentEffort(on, "off")).toBeNull();
  expect(withReasoningEffort({ model: "m" }, "low")).toEqual({ model: "m" });
  expect(withReasoningEffort(null, "low")).toBeNull();
});

it("run_start records what the requests carry, on or off", () => {
  expect(playSampling(off, "medium", 8)).toEqual({ thinking_level: "medium", max_tokens: 8, reasoning_effort_sent: null });
  expect(playSampling(on, "medium", 8)).toEqual({ thinking_level: "medium", max_tokens: 8, reasoning_effort_sent: "medium" });
  expect(playSampling(on, "off", 8)).toEqual({ thinking_level: "off", max_tokens: 8, reasoning_effort_sent: null });
});
