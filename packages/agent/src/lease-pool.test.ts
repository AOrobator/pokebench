import { describe, expect, it } from "vitest";
import { LEGACY_LEASE, leaseName, leasePool } from "./lease-pool.js";

describe("gameplay lease pools", () => {
  it("names a pool by the model endpoint's host and port", () => {
    expect(leasePool("http://127.0.0.1:8091")).toBe("127.0.0.1:8091");
    expect(leasePool("http://127.0.0.1:18434/v1")).toBe("127.0.0.1:18434");
    expect(leasePool("http://inference.example/v1")).toBe("inference.example:80");
    expect(leasePool("https://Example.Test/v1/")).toBe("example.test:443");
  });

  it("refuses an endpoint that is not an http URL", () => {
    expect(() => leasePool("127.0.0.1:8091")).toThrow("not an http(s) model endpoint: 127.0.0.1:8091");
    expect(() => leasePool("file:///tmp/x")).toThrow("not an http(s) model endpoint: file:///tmp/x");
  });

  it("gives each pool its own lease directory, never the old single lease", () => {
    expect(leaseName("127.0.0.1:8091")).toBe(".naming-gameplay.127.0.0.1-8091.lock");
    expect(leaseName("127.0.0.1:8098")).not.toBe(leaseName("127.0.0.1:8091"));
    expect(leaseName("inference.example:80")).toBe(".naming-gameplay.inference.example-80.lock");
    expect(LEGACY_LEASE).toBe(".naming-gameplay.lock");
    expect(leaseName("127.0.0.1:18434")).not.toBe(LEGACY_LEASE);
  });
});
