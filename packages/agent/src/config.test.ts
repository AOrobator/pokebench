import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applies defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      gatewayUrl: "http://inference.example/v1",
      model: "think-swarm",
      gameServerUrl: "http://127.0.0.1:8000",
      visionModels: ["think-swarm"],
    });
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
      gatewayUrl: "http://127.0.0.1:8773/v1",
      model: "think-pokebench",
      gameServerUrl: "http://127.0.0.1:9000",
      visionModels: ["think-pokebench"],
    });
  });

  it("strips a trailing slash so paths join predictably", () => {
    expect(loadConfig({ POKEBENCH_GATEWAY_URL: "http://inference.example/v1/" }).gatewayUrl).toBe(
      "http://inference.example/v1",
    );
  });

  it("accepts https and strips a trailing slash on the game server URL", () => {
    const config = loadConfig({
      POKEBENCH_GATEWAY_URL: "https://gateway.example/v1",
      POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8000/",
    });
    expect(config.gatewayUrl).toBe("https://gateway.example/v1");
    expect(config.gameServerUrl).toBe("http://127.0.0.1:8000");
  });

  it("treats empty strings as unset", () => {
    expect(loadConfig({ POKEBENCH_MODEL: "" }).model).toBe("think-swarm");
  });

  it.each([
    ["POKEBENCH_GATEWAY_URL", "not a url"],
    ["POKEBENCH_GATEWAY_URL", "file:///etc/passwd"],
    ["POKEBENCH_GAME_SERVER_URL", "ftp://127.0.0.1:8000"],
  ])("rejects %s=%s", (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  });

  it("rejects a whitespace-only model id", () => {
    expect(() => loadConfig({ POKEBENCH_MODEL: "   " })).toThrow(ConfigError);
  });

  it("splits and trims a comma-separated vision lane list", () => {
    expect(loadConfig({ POKEBENCH_VISION_MODELS: " think-swarm , think-longctx " }).visionModels).toEqual([
      "think-swarm",
      "think-longctx",
    ]);
  });

  it.each(["think-swarm,,think-longctx", " , ", "think-swarm,"])(
    "rejects a blank entry in POKEBENCH_VISION_MODELS=%j",
    (value) => {
      expect(() => loadConfig({ POKEBENCH_VISION_MODELS: value })).toThrow(ConfigError);
      expect(() => loadConfig({ POKEBENCH_VISION_MODELS: value })).toThrow("POKEBENCH_VISION_MODELS");
    },
  );
});
