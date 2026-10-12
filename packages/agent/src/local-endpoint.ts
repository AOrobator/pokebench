import { readFileSync } from "node:fs";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { GATEWAY_COMPAT, type GatewayModel } from "./gateway.js";

// Operator exception (M5): a model served only by a local llama-server, e.g.
// Hermes's router, reached through the endpoint file that server writes. The
// key is read at run time and never logged or stored.
export const LOCAL_PROVIDER = "local-llamacpp";

export class LocalEndpointError extends Error {
  override readonly name = "LocalEndpointError";
}

export interface LocalEndpoint {
  readonly baseUrl: string;
  readonly apiKey: string;
}

const EndpointSchema = Type.Object({ base_url: Type.String(), api_key: Type.String({ minLength: 1 }) });

const RouterSchema = Type.Object({
  data: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1 }),
      status: Type.Object({ value: Type.String(), args: Type.Array(Type.String()) }),
    }),
  ),
});

function loopback(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function readEndpoint(path: string): LocalEndpoint {
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new LocalEndpointError(`cannot read ${path}`, { cause: error });
  }
  if (!Value.Check(EndpointSchema, body)) throw new LocalEndpointError(`malformed endpoint file ${path}`);
  if (!loopback(body.base_url)) throw new LocalEndpointError(`endpoint in ${path} must be http://127.0.0.1:<port>`);
  return { baseUrl: body.base_url.replace(/\/+$/, ""), apiKey: body.api_key };
}

function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export async function discoverLocal(endpoint: LocalEndpoint, fetchFn: typeof fetch = fetch): Promise<GatewayModel[]> {
  const url = `${endpoint.baseUrl}/models`;
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: "application/json", authorization: `Bearer ${endpoint.apiKey}` } });
  } catch (error) {
    // fetch quotes a header value it rejects, so the raw error (and its cause) never leaves here.
    throw new LocalEndpointError(`GET ${url} failed: ${String(error).split(endpoint.apiKey).join("[redacted]")}`);
  }
  if (!response.ok) throw new LocalEndpointError(`GET ${url} returned HTTP ${String(response.status)}`);
  const body: unknown = await response.json();
  if (!Value.Check(RouterSchema, body)) throw new LocalEndpointError(`malformed ${url} payload`);
  return body.data
    .filter((model) => model.status.value === "loaded")
    .map((model) => {
      const contextWindow = Number(argValue(model.status.args, "--ctx-size"));
      if (!Number.isInteger(contextWindow) || contextWindow < 1) {
        throw new LocalEndpointError(`model ${model.id} has no usable --ctx-size`);
      }
      return {
        id: model.id,
        name: model.id,
        api: "openai-completions",
        provider: LOCAL_PROVIDER,
        baseUrl: endpoint.baseUrl,
        reasoning: true,
        input: model.status.args.includes("--mmproj") ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        maxTokens: contextWindow,
        compat: GATEWAY_COMPAT,
      };
    });
}
