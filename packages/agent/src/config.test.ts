import { describe, expect, it } from "vitest";
import { CONNECT_GUIDE, ConfigError, loadConfig, requireModel } from "./config.js";

const GATEWAY = { POKEBENCH_GATEWAY_URL: "http://127.0.0.1:8773/v1" };

describe("loadConfig", () => {
  it("has no built-in endpoint: nothing set names both variables and the guide", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/POKEBENCH_GATEWAY_URL.*POKEBENCH_ENDPOINT_FILE/);
    expect(() => loadConfig({})).toThrow(CONNECT_GUIDE);
    expect(() => loadConfig({ POKEBENCH_GATEWAY_URL: "", POKEBENCH_ENDPOINT_FILE: "" })).toThrow(CONNECT_GUIDE);
  });

  it("points the guide at the docs folder", () => {
    expect(CONNECT_GUIDE).toBe("docs/connect-a-model.md");
  });

  it("has no built-in model", () => {
    expect(loadConfig(GATEWAY).model).toBeNull();
    expect(loadConfig({ ...GATEWAY, POKEBENCH_MODEL: "" }).model).toBeNull();
  });

  it("requires a model only where one is played, naming the variable and the guide", () => {
    const unset = loadConfig(GATEWAY);
    expect(() => requireModel(unset)).toThrow(ConfigError);
    expect(() => requireModel(unset)).toThrow("POKEBENCH_MODEL");
    expect(() => requireModel(unset)).toThrow(CONNECT_GUIDE);
    expect(requireModel(loadConfig({ ...GATEWAY, POKEBENCH_MODEL: "lane-a" }))).toBe("lane-a");
  });

  it("reads a gateway endpoint", () => {
    expect(loadConfig(GATEWAY).endpoint).toEqual({ kind: "gateway", url: "http://127.0.0.1:8773/v1" });
  });

  it("reads a local endpoint file path without a gateway", () => {
    expect(loadConfig({ POKEBENCH_ENDPOINT_FILE: "/home/x/server.json" }).endpoint).toEqual({ kind: "file", path: "/home/x/server.json" });
  });

  it("prefers the endpoint file when both are set, and still validates the gateway URL", () => {
    expect(loadConfig({ ...GATEWAY, POKEBENCH_ENDPOINT_FILE: "/home/x/server.json" }).endpoint).toEqual({ kind: "file", path: "/home/x/server.json" });
    expect(() => loadConfig({ POKEBENCH_GATEWAY_URL: "not a url", POKEBENCH_ENDPOINT_FILE: "/home/x/server.json" })).toThrow("POKEBENCH_GATEWAY_URL");
  });

  it("reads overrides from the environment", () => {
    expect(
      loadConfig({
        POKEBENCH_GATEWAY_URL: "http://127.0.0.1:8773/v1",
        POKEBENCH_MODEL: "think-pokebench",
        POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:9000",
        POKEBENCH_VISION_MODELS: "think-pokebench",
      }),
    ).toEqual({
      endpoint: { kind: "gateway", url: "http://127.0.0.1:8773/v1" },
      model: "think-pokebench",
      gameServerUrl: "http://127.0.0.1:9000",
      visionModels: ["think-pokebench"],
    });
  });

  it("strips a trailing slash so paths join predictably", () => {
    expect(loadConfig({ POKEBENCH_GATEWAY_URL: "http://gateway.example/v1/" }).endpoint).toEqual({ kind: "gateway", url: "http://gateway.example/v1" });
  });

  it("accepts https and strips a trailing slash on the game server URL", () => {
    const config = loadConfig({
      POKEBENCH_GATEWAY_URL: "https://gateway.example/v1",
      POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8000/",
    });
    expect(config.endpoint).toEqual({ kind: "gateway", url: "https://gateway.example/v1" });
    expect(config.gameServerUrl).toBe("http://127.0.0.1:8000");
  });

  it.each([
    ["POKEBENCH_GATEWAY_URL", "not a url"],
    ["POKEBENCH_GATEWAY_URL", "file:///etc/passwd"],
    ["POKEBENCH_GAME_SERVER_URL", "ftp://127.0.0.1:8000"],
  ])("rejects %s=%s", (key, value) => {
    expect(() => loadConfig({ ...GATEWAY, [key]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ ...GATEWAY, [key]: value })).toThrow(key);
  });

  it("rejects a whitespace-only model id", () => {
    expect(() => loadConfig({ ...GATEWAY, POKEBENCH_MODEL: "   " })).toThrow(ConfigError);
  });

  it("splits and trims a comma-separated vision lane list", () => {
    expect(loadConfig({ ...GATEWAY, POKEBENCH_VISION_MODELS: " lane-a , lane-b " }).visionModels).toEqual([
      "lane-a",
      "lane-b",
    ]);
  });

  it.each(["lane-a,,lane-b", " , ", "lane-a,"])(
    "rejects a blank entry in POKEBENCH_VISION_MODELS=%j",
    (value) => {
      expect(() => loadConfig({ ...GATEWAY, POKEBENCH_VISION_MODELS: value })).toThrow(ConfigError);
      expect(() => loadConfig({ ...GATEWAY, POKEBENCH_VISION_MODELS: value })).toThrow("POKEBENCH_VISION_MODELS");
    },
  );
});
