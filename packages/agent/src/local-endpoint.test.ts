import { describe, expect, it, vi } from "vitest";
import { GATEWAY_COMPAT } from "./gateway.js";
import { discoverLocal } from "./local-endpoint.js";

const KEY = "test-key-not-real";


function loaded(id: string, args: string[], status = "loaded"): Record<string, unknown> {
  return { id, object: "model", owned_by: "llamacpp", status: { value: status, args } };
}

const ARGS = ["/llama-server", "--ctx-size", "262144", "--mmproj", "/m/mmproj.gguf", "--parallel", "1"];

describe("discoverLocal", () => {
  const endpoint = { baseUrl: "http://127.0.0.1:18434/v1", apiKey: KEY };

  it("lists a vLLM server's model with context from max_model_len and vision only from the endpoint's declaration", async () => {
    const vllm = { object: "list", data: [{ id: "qwen3.8-27b", object: "model", created: 1, owned_by: "vllm", root: "/data/models/Qwen3.8-27B", parent: null, max_model_len: 262144, permission: [] }] };
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(vllm))));
    const declared = await discoverLocal({ baseUrl: "http://127.0.0.1:18020/v1", apiKey: KEY, vision: true }, fetchFn);
    expect(declared.map((m) => [m.id, m.contextWindow, m.maxTokens, m.input])).toEqual([["qwen3.8-27b", 262144, 262144, ["text", "image"]]]);
    expect(declared[0]).toMatchObject({ provider: "local-vllm", baseUrl: "http://127.0.0.1:18020/v1", compat: GATEWAY_COMPAT, reasoning: true });
    expect((await discoverLocal({ baseUrl: "http://127.0.0.1:18020/v1", apiKey: KEY }, fetchFn)).map((m) => m.input)).toEqual([["text"]]);
  });

  it("lists loaded models with context from --ctx-size and vision from --mmproj, sending the key", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            loaded("Qwen3.8-Flash-Next", ARGS),
            loaded("text-only", ["/llama-server", "--ctx-size", "8192"]),
            loaded("asleep", ARGS, "unloaded"),
          ],
        }),
      ),
    );
    const models = await discoverLocal(endpoint, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:18434/v1/models", {
      headers: { accept: "application/json", authorization: `Bearer ${KEY}` },
    });
    expect(models.map((m) => [m.id, m.contextWindow, m.maxTokens, m.input])).toEqual([
      ["Qwen3.8-Flash-Next", 262144, 262144, ["text", "image"]],
      ["text-only", 8192, 8192, ["text"]],
    ]);
    expect(models[0]).toMatchObject({ provider: "local-llamacpp", baseUrl: endpoint.baseUrl, compat: GATEWAY_COMPAT, reasoning: true });
  });

  it.each([
    ["an HTTP error", new Response("{}", { status: 401 }), /HTTP 401/],
    ["a malformed list", new Response(JSON.stringify({ models: [] })), /malformed/],
    ["a model without --ctx-size", new Response(JSON.stringify({ data: [loaded("m", ["/llama-server"])] })), /--ctx-size/],
  ])("rejects %s", async (_label, response, message) => {
    await expect(discoverLocal(endpoint, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow(message);
  });

  it("lists a single-model llama-server (no router) by its id, with context from meta.n_ctx and vision from its capabilities", async () => {
    const single = (capabilities: string[]) => ({
      models: [{ name: "/models/q.gguf", model: "/models/q.gguf", capabilities }],
      object: "list",
      data: [{ id: "/models/q.gguf", object: "model", owned_by: "llamacpp", meta: { n_ctx: 65536, n_ctx_train: 262144 } }],
    });
    const vision = await discoverLocal(endpoint, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(single(["completion", "multimodal"])))));
    expect(vision.map((m) => [m.id, m.contextWindow, m.maxTokens, m.input])).toEqual([["/models/q.gguf", 65536, 65536, ["text", "image"]]]);
    expect(vision[0]).toMatchObject({ provider: "local-llamacpp", baseUrl: endpoint.baseUrl, compat: GATEWAY_COMPAT });
    const text = await discoverLocal(endpoint, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(single(["completion"])))));
    expect(text[0]?.input).toEqual(["text"]);
  });

  it("reports an unreachable server", async () => {
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(discoverLocal(endpoint, refused)).rejects.toThrow(/GET http:\/\/127.0.0.1:18434\/v1\/models failed/);
  });

  it("reports only the error name and errno code, so no rendering of a quoted or backslashed key can leave", async () => {
    const key = 'alpha"beta\\gamma';
    const quoted = { baseUrl: "http://127.0.0.1:18020/v1", apiKey: key };
    const echoes = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`bad header ${JSON.stringify(`Bearer ${key}`)}`));
    const shown = String(await discoverLocal(quoted, echoes).catch((e: unknown) => e));
    expect(shown).toBe("LocalEndpointError: GET http://127.0.0.1:18020/v1/models failed: TypeError");
    for (const fragment of ["alpha", "beta", "gamma"]) expect(shown).not.toContain(fragment);
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) }));
    expect(String(await discoverLocal(quoted, refused).catch((e: unknown) => e))).toBe("LocalEndpointError: GET http://127.0.0.1:18020/v1/models failed: TypeError (ECONNREFUSED)");
  });
});
