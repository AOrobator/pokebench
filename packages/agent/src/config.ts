export interface PokebenchConfig {
  readonly gatewayUrl: string;
  readonly model: string;
  readonly gameServerUrl: string;
  readonly visionModels: readonly string[];
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULTS: PokebenchConfig = {
  gatewayUrl: "http://inference.example/v1",
  model: "think-swarm",
  gameServerUrl: "http://127.0.0.1:8000",
  visionModels: ["think-swarm"],
};

function read(env: Env, key: string): string | undefined {
  const value = env[key];
  return value === undefined || value === "" ? undefined : value;
}

function httpUrl(env: Env, key: string, fallback: string): string {
  const raw = read(env, key) ?? fallback;
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

export function loadConfig(env: Env): PokebenchConfig {
  const model = read(env, "POKEBENCH_MODEL") ?? DEFAULTS.model;
  if (model.trim() === "") {
    throw new ConfigError("POKEBENCH_MODEL must not be blank");
  }
  return {
    gatewayUrl: httpUrl(env, "POKEBENCH_GATEWAY_URL", DEFAULTS.gatewayUrl),
    model,
    gameServerUrl: httpUrl(env, "POKEBENCH_GAME_SERVER_URL", DEFAULTS.gameServerUrl),
    visionModels: idList(env, "POKEBENCH_VISION_MODELS", DEFAULTS.visionModels),
  };
}
