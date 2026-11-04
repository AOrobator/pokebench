import { type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { gatewayLoopConfig } from "./provider.js";
import {} from "./features.js";







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
