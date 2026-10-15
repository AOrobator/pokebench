import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processGroup } from "../test-support/process-group.js";
import { spawnDetached } from "./detached.js";

const dir = (): string => mkdtempSync(join(tmpdir(), "pokebench-detached-"));

describe("detached launches", () => {
  it("starts the child as its own process-group leader, reports its pid, logs to files and resolves its exit code", async () => {
    const d = dir();
    const seen: { pid: number; group: string }[] = [];
    const code = await spawnDetached(process.execPath, ["-e", "console.log(process.env.MARK); console.error('e'); setTimeout(() => process.exit(3), 100)"], {
      cwd: d, env: { MARK: "m" }, stdout: join(d, "out.log"), stderr: join(d, "err.log"),
      started: (pid) => { seen.push({ pid, group: processGroup(pid) }); },
    });
    expect(code).toBe(3);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.pid).toBeGreaterThan(0);
    expect(seen[0]?.group).toBe(String(seen[0]?.pid));
    expect(seen[0]?.group).not.toBe(processGroup(process.pid));
    expect(readFileSync(join(d, "out.log"), "utf8")).toBe("m\n");
    expect(readFileSync(join(d, "err.log"), "utf8")).toBe("e\n");
  });

  it("resolves null for a signal, rejects a command that cannot start, and never overwrites logs", async () => {
    const d = dir();
    expect(await spawnDetached(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"], { env: {}, stdout: join(d, "a.log"), stderr: join(d, "b.log") })).toBeNull();
    await expect(spawnDetached(join(d, "no-such-node"), [], { env: {}, stdout: join(d, "c.log"), stderr: join(d, "d.log") })).rejects.toThrow();
    writeFileSync(join(d, "taken.log"), "keep");
    await expect(spawnDetached(process.execPath, ["-e", ""], { env: {}, stdout: join(d, "taken.log"), stderr: join(d, "e.log") })).rejects.toThrow();
    await expect(spawnDetached(process.execPath, ["-e", ""], { env: {}, stdout: join(d, "f.log"), stderr: join(d, "taken.log") })).rejects.toThrow();
    expect(readFileSync(join(d, "taken.log"), "utf8")).toBe("keep");
  });
});
