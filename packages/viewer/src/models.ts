// Model choices for the next run: only models served by the local
// llama-server router (Hermes, 127.0.0.1), read through its endpoint file.
// The router key stays on the server and is never sent to the browser.
import { Type } from "typebox";
import { Value } from "typebox/value";
import { readEndpoint } from "@pokebench/agent/local-endpoint";

export interface LocalModel {
  readonly id: string;
  readonly status: string;
  readonly vision: boolean;
  readonly contextWindow: number | null;
}

const RouterSchema = Type.Object({
  data: Type.Array(Type.Object({ id: Type.String({ minLength: 1 }), status: Type.Object({ value: Type.String(), args: Type.Array(Type.String()) }) })),
});

export async function localModels(endpointFile: string, fetchFn: typeof fetch = fetch): Promise<LocalModel[]> {
  const endpoint = readEndpoint(endpointFile);
  const url = `${endpoint.baseUrl}/models`;
  const response = await fetchFn(url, { headers: { accept: "application/json", authorization: `Bearer ${endpoint.apiKey}` }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
  const body: unknown = await response.json();
  if (!Value.Check(RouterSchema, body)) throw new Error(`malformed ${url} payload`);
  return body.data.map((model) => {
    const ctx = Number(model.status.args[model.status.args.indexOf("--ctx-size") + 1]);
    return { id: model.id, status: model.status.value, vision: model.status.args.includes("--mmproj"), contextWindow: model.status.args.includes("--ctx-size") && Number.isInteger(ctx) && ctx > 0 ? ctx : null };
  });
}
