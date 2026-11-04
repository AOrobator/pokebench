import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { runAgentLoop } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { discoverModels, selectModel } from "./gateway.js";
import { gatewayLoopConfig, playLoopBase } from "./provider.js";
import {} from "./features.js";
import { PRESENCE_PENALTY } from "./presence-penalty.js";







let server: Server | undefined;

afterEach(async () => {
  const current = server;
  server = undefined;
  if (current) {
    await new Promise<void>((resolve) => {
      current.close(() => {
        resolve();
      });
    });
  }
});






describe("gatewayLoopConfig api key", () => {
  it("uses the gateway's placeholder key unless a key is given", async () => {
    const model = { provider: "p" } as unknown as Parameters<typeof gatewayLoopConfig>[0];
    expect(await gatewayLoopConfig(model, "off").getApiKey?.("p")).toBe("local-stack");
    expect(await gatewayLoopConfig(model, "off", "secret").getApiKey?.("p")).toBe("secret");
  });
});
