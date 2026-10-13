import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { localModels } from "./models.js";

function endpointFile(baseUrl: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "endpoint-")), "endpoint.json");
  writeFileSync(path, JSON.stringify({ base_url: baseUrl, api_key: "secret-key" }));
  return path;
}

it("lists every router model with its status, vision and context, sending the key only to the router", async () => {
  const seen: [string, string | null][] = [];
  const fetchFn: typeof fetch = (input, init) => {
    seen.push([typeof input === "string" ? input : "", new Headers(init?.headers).get("authorization")]);
    return Promise.resolve(new Response(JSON.stringify({ data: [
      { id: "Qwen3.8-Flash", status: { value: "loaded", args: ["--mmproj", "p.gguf", "--ctx-size", "262144"] } },
      { id: "Qwen3.5-4B", status: { value: "unloaded", args: [] } },
    ] })));
  };
  const models = await localModels(endpointFile("http://127.0.0.1:18434/v1"), fetchFn);
  expect(models).toEqual([
    { id: "Qwen3.8-Flash", status: "loaded", vision: true, contextWindow: 262144 },
    { id: "Qwen3.5-4B", status: "unloaded", vision: false, contextWindow: null },
  ]);
  expect(seen).toEqual([["http://127.0.0.1:18434/v1/models", "Bearer secret-key"]]);
  expect(JSON.stringify(models)).not.toContain("secret-key");
});

it("refuses non-loopback endpoints, router errors and malformed payloads", async () => {
  await expect(localModels(endpointFile("http://inference.example/v1"), () => Promise.reject(new Error("unreached")))).rejects.toThrow(/127\.0\.0\.1/);
  await expect(localModels(endpointFile("http://127.0.0.1:1/v1"), () => Promise.resolve(new Response("x", { status: 503 })))).rejects.toThrow(/HTTP 503/);
  await expect(localModels(endpointFile("http://127.0.0.1:1/v1"), () => Promise.resolve(new Response('{"data":[{"id":""}]}')))).rejects.toThrow(/malformed/);
});
