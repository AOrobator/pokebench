// vLLM (--tool-strict-level parameter) compiles every tool schema with xgrammar, which rejects the
// array form of "items" that TypeBox Type.Tuple emits. Run 2026-10-27T14-10-38_hyperqwen-tp2_7147
// died on turn 1 with "Invalid grammar specification: 'triggers'".
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync } from "node:fs";
import { recipeText } from "../../viewer/test-support/recipe-text.js";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { runAgentLoop } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_ON, SWITCHABLE_FEATURES, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { gameTools } from "./game-tools.js";
import { StateWatcher } from "./game-state.js";
import { contextTools, playGameTools } from "./play-wiring.js";
import { discoverLocal, LOCAL_PROVIDER, VLLM_PROVIDER } from "./local-endpoint.js";
import { gatewayLoopConfig, playLoopBase } from "./provider.js";
import type { GatewayModel } from "./gateway.js";
import { prefixItemsSchema, vllmToolPayload } from "./tool-schema-dialect.js";

const KEY = "test-key-not-real";

interface WireTool { readonly type: string; readonly function: { readonly name: string; readonly parameters: unknown } }
interface Wire { readonly raw: string[]; readonly bodies: { readonly tools?: readonly WireTool[]; readonly [key: string]: unknown }[] }

const servers: Server[] = [];
afterEach(async () => {
  const open = servers.splice(0);
  await Promise.all(open.map((current) => new Promise<void>((resolve) => current.close(() => { resolve(); }))));
  expect(open.every((current) => !current.listening)).toBe(true);
});

const FINAL = [
  `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }] })}\n\n`,
  `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  "data: [DONE]\n\n",
];

const VLLM_MODELS = { object: "list", data: [{ id: "qwen", object: "model", created: 1, owned_by: "vllm", root: "/m/qwen", parent: null, max_model_len: 65536, permission: [] }] };
const LLAMA_MODELS = { models: [{ model: "qwen", capabilities: ["completion", "multimodal"] }], data: [{ id: "qwen", meta: { n_ctx: 65536 } }] };

async function fakeServer(models: unknown): Promise<{ url: string; wire: Wire }> {
  const wire: Wire = { raw: [], bodies: [] };
  const srv = createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(models));
      return;
    }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (part: string) => (raw += part));
    req.on("end", () => {
      wire.raw.push(raw);
      wire.bodies.push(JSON.parse(raw) as Wire["bodies"][number]);
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const line of FINAL) res.write(line);
      res.end();
    });
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${String((srv.address() as AddressInfo).port)}/v1`, wire };
}

// The production tool list of a play run: game tools, the switch-dependent memory tools and the play wrappers.
function realTools(features: FeatureSet): AgentTool[] {
  const noop = new Proxy({}, { get: () => () => ({ seq: 1, turn: 1 }) });
  const context = contextTools(features, noop as Parameters<typeof contextTools>[1], (messages) => Promise.resolve(messages));
  const base = gameTools("http://127.0.0.1:1", { beforePress: () => undefined, afterPress: () => Promise.resolve() });
  return playGameTools(base, features, new StateWatcher("http://127.0.0.1:1"), noop as Parameters<typeof playGameTools>[3], () => Promise.resolve(), context.tools, context.training, context.instructionGoals);
}

type Fixed = { base: { features: Record<string, boolean> }; switches: string[] };
const asFeatures = (raw: Record<string, boolean>): FeatureSet => normalizeFeatures(Object.fromEntries(Object.entries(raw).filter(([id]) => (SWITCHABLE_FEATURES as readonly string[]).includes(id))) as Parameters<typeof normalizeFeatures>[0]);
function featureSets(): [string, FeatureSet][] {
  const sets: [string, FeatureSet][] = [["all on", FULL], ["default flags", flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })]];
  const dir = new URL("../../../experiments/fixed/", import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const def = JSON.parse(recipeText(new URL(name, dir))) as Fixed;
    for (const arm of ["control", "bundle"] as const) sets.push([`${name} ${arm}`, asFeatures({ ...def.base.features, ...Object.fromEntries(def.switches.map((id) => [id, arm === "bundle"])) })]);
  }
  return sets;
}

// Every place a schema puts an array under "items", or keeps "additionalItems".
function arrayItems(schema: unknown, path = "$"): string[] {
  if (Array.isArray(schema)) return schema.flatMap((value, i) => arrayItems(value, `${path}[${String(i)}]`));
  if (typeof schema !== "object" || schema === null) return [];
  const own = Array.isArray((schema as Record<string, unknown>)["items"]) || "additionalItems" in schema ? [path] : [];
  return [...own, ...Object.entries(schema).flatMap(([key, value]) => arrayItems(value, `${path}.${key}`))];
}

async function wireTools(models: unknown, tools: AgentTool[], features: FeatureSet): Promise<{ wire: Wire; provider: string; hasHook: boolean }> {
  const { url, wire } = await fakeServer(models);
  const [model] = await discoverLocal({ baseUrl: url, apiKey: KEY, vision: true });
  if (model === undefined) throw new Error("no model");
  const config = playLoopBase(model, "medium", KEY, 4096, features);
  const prompt: AgentMessage = { role: "user", content: "Go.", timestamp: 0 };
  await runAgentLoop([prompt], { systemPrompt: "Play.", messages: [], tools }, config, () => undefined);
  return { wire, provider: model.provider, hasHook: "onPayload" in config };
}

// ALL_ON turns on story-battle-heal-gate-v1 alongside factual-healing-guidance-v1, which no run can wire.
const FULL: FeatureSet = { ...ALL_ON, "story-battle-heal-gate-v1": false };
const MAP_ID = Type.Tuple([Type.Integer({ minimum: 0, maximum: 255 }), Type.Integer({ minimum: 0, maximum: 255 })]);

describe("prefixItemsSchema", () => {
  it("rewrites a tuple as prefixItems with items false, drops additionalItems and keeps the length bounds", () => {
    expect(prefixItemsSchema(MAP_ID)).toEqual({ type: "array", prefixItems: [{ type: "integer", minimum: 0, maximum: 255 }, { type: "integer", minimum: 0, maximum: 255 }], items: false, minItems: 2 });
    expect(prefixItemsSchema(Type.Tuple([Type.Integer()], { maxItems: 1 }))).toEqual({ type: "array", prefixItems: [{ type: "integer" }], items: false, minItems: 1, maxItems: 1 });
  });

  it("recurses into properties, array items, anyOf/oneOf/allOf branches and nested tuples", () => {
    const schema = Type.Object({
      a: MAP_ID,
      b: Type.Array(Type.Tuple([Type.Integer(), Type.Integer()])),
      c: Type.Union([Type.Tuple([Type.String()]), Type.Null()]),
      d: Type.Optional(Type.Object({ e: Type.Tuple([Type.Tuple([Type.Integer()])]) })),
      f: { oneOf: [MAP_ID], allOf: [{ items: [{ type: "string" }], additionalItems: false }] },
    });
    const out = prefixItemsSchema(schema);
    expect(arrayItems(schema).length).toBeGreaterThan(0);
    expect(arrayItems(out)).toEqual([]);
    expect(out).toMatchObject({ properties: { b: { items: { prefixItems: [{ type: "integer" }, { type: "integer" }], items: false } }, d: { properties: { e: { prefixItems: [{ prefixItems: [{ type: "integer" }], items: false }], items: false } } } } });
    // A schema with no tuples comes back equal.
    const plain = Type.Object({ x: Type.Integer({ minimum: 0 }), xs: Type.Array(Type.String(), { maxItems: 3 }) });
    expect(prefixItemsSchema(plain)).toEqual(JSON.parse(JSON.stringify(plain)));
  });

  it("leaves data-valued keywords alone", () => {
    const schema = { type: "object", default: { items: [1, 2] }, const: { items: [3] }, enum: [{ items: [4] }], examples: [{ items: [5] }], properties: { p: { items: [{ type: "integer" }] } } };
    expect(prefixItemsSchema(schema)).toEqual({ ...schema, properties: { p: { prefixItems: [{ type: "integer" }], items: false } } });
  });

  it("returns a copy and leaves the shared schema untouched", () => {
    const schema = Type.Object({ map_id: MAP_ID });
    const before = JSON.stringify(schema);
    const out = prefixItemsSchema(schema) as { properties: { map_id: unknown } };
    expect(JSON.stringify(schema)).toBe(before);
    expect(out).not.toBe(schema);
    expect(out.properties.map_id).not.toBe(schema.properties.map_id);
  });
});

describe("vllmToolPayload", () => {
  it("rewrites only tools[].function.parameters and passes other payloads through", () => {
    const payload = { model: "m", messages: [{ role: "user", content: "hi", items: [1] }], tools: [{ type: "function", function: { name: "t", description: "d", parameters: Type.Object({ map_id: MAP_ID }), strict: false } }] };
    const out = vllmToolPayload(payload) as typeof payload;
    expect(out.messages).toBe(payload.messages);
    expect(out.tools[0]?.function).toMatchObject({ name: "t", description: "d", strict: false });
    expect(arrayItems(out.tools)).toEqual([]);
    expect(arrayItems(payload.tools).length).toBe(1);
    expect(vllmToolPayload({ model: "m" })).toEqual({ model: "m" });
    expect(vllmToolPayload("raw")).toBe("raw");
    expect(vllmToolPayload(null)).toBe(null);
    expect(vllmToolPayload({ tools: [null, { type: "function" }] })).toEqual({ tools: [null, { type: "function" }] });
  });
});

describe("vLLM tool schemas on the wire", () => {
  it("discovery marks a vLLM server's model with the vLLM provider and llama-server models with the llama provider", async () => {
    expect(VLLM_PROVIDER).not.toBe(LOCAL_PROVIDER);
    const vllm = await fakeServer(VLLM_MODELS);
    expect((await discoverLocal({ baseUrl: vllm.url, apiKey: KEY }))[0]?.provider).toBe(VLLM_PROVIDER);
  });

  it("navigate_to's map_id reaches vLLM as prefixItems", async () => {
    const tools = realTools(FULL);
    const navigate = tools.find((tool) => tool.name === "navigate_to");
    expect(navigate).toBeDefined();
    expect(arrayItems(navigate?.parameters)).toEqual(["$.properties.map_id"]);
    const { wire, provider } = await wireTools(VLLM_MODELS, tools, FULL);
    expect(provider).toBe(VLLM_PROVIDER);
    const sent = wire.bodies[0]?.tools?.find((tool) => tool.function.name === "navigate_to");
    expect((sent?.function.parameters as { properties: { map_id: unknown } }).properties.map_id).toEqual({ type: "array", prefixItems: [{ type: "integer", minimum: 0, maximum: 255 }, { type: "integer", minimum: 0, maximum: 255 }], items: false, minItems: 2 });
    // The shared tool schema is not mutated by the send.
    expect(arrayItems(navigate?.parameters)).toEqual(["$.properties.map_id"]);
  });

  it("a llama lane sends the tool schemas byte for byte as before", async () => {
    const tools = realTools(FULL);
    const { wire, provider, hasHook } = await wireTools(LLAMA_MODELS, tools, FULL);
    expect(provider).toBe(LOCAL_PROVIDER);
    expect(hasHook).toBe(FULL["presence-penalty-v1"]);
    const expected = JSON.stringify(tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters, strict: false } })));
    expect(wire.raw[0] ?? "").toContain(`"tools":${expected}`);
  });

  // The per-arm checks run the production payload hook in memory; the wire tests above prove pi sends what it returns.
  const offline = (provider: string): GatewayModel => ({ id: "m", name: "m", api: "openai-completions", provider, baseUrl: "http://127.0.0.1:1/v1", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 65536, maxTokens: 65536 });
  async function sent(provider: string, tools: AgentTool[], features: FeatureSet): Promise<{ body: Record<string, unknown>; hasHook: boolean; params: Record<string, unknown> }> {
    const params = { model: "m", messages: [], stream: true, tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters, strict: false } })) };
    const model = offline(provider);
    const config = playLoopBase(model, "medium", KEY, 4096, features);
    const body = ((await config.onPayload?.(params, model)) ?? params) as Record<string, unknown>;
    return { body, hasHook: config.onPayload !== undefined, params };
  }

  it.each(featureSets())("every real tool reaches vLLM without array-form items and llama is untouched: %s", async (_name, features) => {
    const tools = realTools(features);
    const vllm = await sent(VLLM_PROVIDER, tools, features);
    expect((vllm.body["tools"] as WireTool[]).map((tool) => tool.function.name)).toEqual(tools.map((tool) => tool.name));
    expect(arrayItems(vllm.body["tools"])).toEqual([]);
    const llama = await sent(LOCAL_PROVIDER, tools, features);
    expect(llama.hasHook).toBe(features["presence-penalty-v1"]);
    expect(JSON.stringify(llama.body["tools"])).toBe(JSON.stringify(llama.params.tools));
    const strip = (body: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(body).filter(([key]) => key !== "tools"));
    expect(strip(vllm.body)).toEqual(strip(llama.body));
  });

  it("a gateway lane's loop config is unchanged: no payload hook without sampling extras", () => {
    const model = { id: "m", name: "m", api: "openai-completions" as const, provider: "local stack", baseUrl: "http://x/v1", reasoning: true, input: ["text" as const], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 };
    expect(gatewayLoopConfig(model, "off")).not.toHaveProperty("onPayload");
    expect(gatewayLoopConfig({ ...model, provider: VLLM_PROVIDER }, "off")).toHaveProperty("onPayload");
  });

  it("vLLM keeps the sampling extras alongside the schema rewrite", async () => {
    const features = { ...FULL, "presence-penalty-v1": true };
    const { wire } = await wireTools(VLLM_MODELS, realTools(features), features);
    expect(wire.bodies[0]?.["presence_penalty"]).toBe(1.5);
    expect(arrayItems(wire.bodies[0]?.tools)).toEqual([]);
  });
});
