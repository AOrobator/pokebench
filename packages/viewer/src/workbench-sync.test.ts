import { describe, expect, it } from "vitest";
import { run } from "../test-support/workbench.js";
import type { WorkbenchData } from "./workbench-data.js";
import { createWorkbenchUpdates, createWorkbenchClient } from "./workbench-sync.js";
const data = (at = 1): WorkbenchData => ({ version: 1, at, milestones: [], problems: [], runs: [run(), run({ id: "second" })] });
describe("revisioned workbench refresh", () => {
  it("transfers only changed runs, retains order, removes deleted runs and resyncs a new server", async () => {
    let snapshot = data(); let server = createWorkbenchUpdates("epoch"); const requests: string[] = [], replies: unknown[] = [];
    const client = createWorkbenchClient(url => { requests.push(url); const reply = server(snapshot, new URL(url, "http://viewer").searchParams.get("since")); replies.push(reply); return Promise.resolve(reply); });
    expect(await client()).toEqual(snapshot);
    snapshot = data(2); snapshot.runs.reverse(); snapshot.runs[0] = run({ id: "second", turn: 99 });
    expect(await client()).toEqual(snapshot);
    expect(replies[1]).toMatchObject({ runs: [snapshot.runs[0]], removed: [], base: "epoch:1" });
    expect(requests[1]).toContain("since=epoch%3A1");
    snapshot = { ...data(3), runs: [run({ id: "second", turn: 99 })] };
    expect(await client()).toEqual(snapshot); expect(replies[2]).toMatchObject({ runs: [], removed: ["run_01"] });
    expect(await client()).toEqual(snapshot); expect(replies[3]).toMatchObject({ runs: [], removed: [] });
    server = createWorkbenchUpdates("restart"); expect(await client()).toEqual(snapshot); expect(replies[4]).toMatchObject({ base: null, runs: snapshot.runs });
  });
  it("bounds history and sends a full snapshot to a suspended or unknown client", () => {
    const server = createWorkbenchUpdates("e"); const first = server(data(), null);
    for (let at = 2; at < 14; at++) server({ ...data(at), runs: [run({ turn: at })] }, null);
    expect(server(data(15), first.revision).base).toBeNull();
    expect(server(data(16), "unknown").base).toBeNull();
  });
  it.each([
    { base: "wrong" }, { runs: [run(), run()] }, { removed: ["run_01"] }, { order: ["missing"] },
    { revision: 4 }, { order: ["run_01", "run_01"] }, { at: -1 }, { runs: [{ id: "broken" }] },
  ])("rejects malformed updates atomically then requests a full resync: %j", async bad => {
    const server = createWorkbenchUpdates("e"); let reply: unknown = server(data(), null); const urls: string[] = [];
    const client = createWorkbenchClient(url => { urls.push(url); return Promise.resolve(reply); });
    const verified = await client();
    reply = { ...server(data(2), "e:1"), ...bad }; await expect(client()).rejects.toThrow();
    expect(verified).toEqual(data());
    reply = server(data(3), null); expect(await client()).toEqual(data(3)); expect(urls[2]).not.toContain("since=");
  });
  it("retains the cursor on a network failure", async () => {
    const server = createWorkbenchUpdates("e"); let failed = false; const urls: string[] = [];
    const client = createWorkbenchClient(url => { urls.push(url); if (failed) return Promise.reject(new Error("offline")); return Promise.resolve(server(data(), new URL(url, "http://v").searchParams.get("since"))); });
    await client(); failed = true; await expect(client()).rejects.toThrow("offline"); failed = false; await client(); expect(urls[2]).toContain("since=");
  });
});
