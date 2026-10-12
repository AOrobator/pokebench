import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GATEWAY_COMPAT } from "./gateway.js";
import { LocalEndpointError, discoverLocal, readEndpoint } from "./local-endpoint.js";

const KEY = "test-key-not-real";

function endpointFile(body: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "pokebench-endpoint-")), "server.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

function loaded(id: string, args: string[], status = "loaded"): Record<string, unknown> {
  return { id, object: "model", owned_by: "llamacpp", status: { value: status, args } };
}

const ARGS = ["/llama-server", "--ctx-size", "262144", "--mmproj", "/m/mmproj.gguf", "--parallel", "1"];

describe("readEndpoint", () => {
  it("reads the base URL and key", () => {
    expect(readEndpoint(endpointFile({ base_url: "http://127.0.0.1:18434/v1", api_key: KEY, pid: 1 }))).toEqual({
      baseUrl: "http://127.0.0.1:18434/v1",
      apiKey: KEY,
    });
  });

  it.each([
    ["a non-loopback host", { base_url: "http://10.0.0.5:18434/v1", api_key: KEY }, /127\.0\.0\.1/],
    ["a missing key", { base_url: "http://127.0.0.1:18434/v1" }, /malformed/],
    ["a non-URL", { base_url: "nope", api_key: KEY }, /127\.0\.0\.1/],
  ])("rejects %s without echoing the key", (_label, body, message) => {
    const path = endpointFile(body);
    expect(() => readEndpoint(path)).toThrow(LocalEndpointError);
    expect(() => readEndpoint(path)).toThrow(message);
    try {
      readEndpoint(path);
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
  });

  it("names a missing or unreadable file", () => {
    expect(() => readEndpoint("/nonexistent/server.json")).toThrow(/cannot read \/nonexistent\/server.json/);
  });
});

describe("discoverLocal", () => {
  const endpoint = { baseUrl: "http://127.0.0.1:18434/v1", apiKey: KEY };

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

  it("reports an unreachable server", async () => {
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(discoverLocal(endpoint, refused)).rejects.toThrow(/GET http:\/\/127.0.0.1:18434\/v1\/models failed/);
  });
});
