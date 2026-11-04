import { describe, expect, it } from "vitest";
import { parseProbeCommand } from "./probe.js";





describe("probe", () => {
  it("validates manual commands and rejects an unrecordable press", () => {
    expect(parseProbeCommand('{"action":"observe"}')).toEqual({ action: "observe" });
    expect(parseProbeCommand('{"action":"end"}')).toEqual({ action: "end" });
    expect(() => parseProbeCommand('{"action":"press","buttons":["WAIT"]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('{"action":"press","buttons":[]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('bad JSON')).toThrow();
  });
});
