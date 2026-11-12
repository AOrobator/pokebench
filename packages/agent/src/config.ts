// Where the player's model is served: an OpenAI-compatible gateway, or a local endpoint file
// ({base_url, api_key, vision}) that a model server writes. There is no built-in endpoint.
export type ModelEndpoint = { readonly kind: "gateway"; readonly url: string } | { readonly kind: "file"; readonly path: string } | { readonly kind: "codex"; readonly path: string };

export interface PokebenchConfig {
  readonly endpoint: ModelEndpoint;
  readonly model: string | null;
  readonly gameServerUrl: string;
  readonly visionModels: readonly string[];
}

export const CONNECT_GUIDE = "docs/connect-a-model.md";

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULTS = {
  gameServerUrl: "http://127.0.0.1:8000",
  visionModels: [] as readonly string[],
};

function read(env: Env, key: string): string | undefined {
  const value = env[key];
  return value === undefined || value === "" ? undefined : value;
}

function httpUrl(env: Env, key: string, fallback: string): string {
  return checkedUrl(key, read(env, key) ?? fallback);
}

function checkedUrl(key: string, raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`${key} is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(`${key} must be http(s), got ${parsed.protocol}`);
  }
  return raw.replace(/\/+$/, "");
}

function idList(env: Env, key: string, fallback: readonly string[]): readonly string[] {
  const raw = read(env, key);
  if (raw === undefined) return fallback;
  const ids = raw.split(",").map((id) => id.trim());
  if (ids.some((id) => id === "")) {
    throw new ConfigError(`${key} has a blank entry: ${raw}`);
  }
  return ids;
}

function endpoint(env: Env): ModelEndpoint {
  const codex = read(env, "POKEBENCH_CODEX_PROVIDER_FILE");
  if (codex !== undefined) return { kind: "codex", path: codex };
  const gateway = read(env, "POKEBENCH_GATEWAY_URL");
  const url = gateway === undefined ? undefined : checkedUrl("POKEBENCH_GATEWAY_URL", gateway);
  const file = read(env, "POKEBENCH_ENDPOINT_FILE");
  if (file !== undefined) return { kind: "file", path: file };
  if (url !== undefined) return { kind: "gateway", url };
  throw new ConfigError(`no model endpoint: set POKEBENCH_GATEWAY_URL (an OpenAI-compatible /v1 URL) or POKEBENCH_ENDPOINT_FILE (a local endpoint file); see ${CONNECT_GUIDE}`);
}

export function loadConfig(env: Env): PokebenchConfig {
  const model = read(env, "POKEBENCH_MODEL") ?? null;
  if (model !== null && model.trim() === "") {
    throw new ConfigError("POKEBENCH_MODEL must not be blank");
  }
  return {
    endpoint: endpoint(env),
    model,
    gameServerUrl: httpUrl(env, "POKEBENCH_GAME_SERVER_URL", DEFAULTS.gameServerUrl),
    visionModels: idList(env, "POKEBENCH_VISION_MODELS", DEFAULTS.visionModels),
  };
}

export function requireModel(config: Pick<PokebenchConfig, "model">): string {
  if (config.model === null) throw new ConfigError(`POKEBENCH_MODEL is not set: name the model to play, as the endpoint lists it; see ${CONNECT_GUIDE}`);
  return config.model;
}
