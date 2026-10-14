import * as fs from "node:fs";
import * as workbench from "./workbench-store.js";
import { WORKBENCH_POLL_MS } from "./workbench-data.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ALL_ON, playHarnessFeatures } from "@pokebench/agent/features";
import { fullRun } from "../test-support/events.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

vi.mock("./workbench-store.js", async original => ({ ...await original<typeof import("./workbench-store.js")>() }));

const viewers: Viewer[] = [], roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("shares cached validated splits across HTTP comparisons, milestones and feature history", async () => {
  const root = fs.mkdtempSync(join(tmpdir(), "viewer-cache-http-"));
  roots.push(root);
  for (const id of ["selected", "reference"]) {
    const dir = join(root, id);
    fs.mkdirSync(dir);
    const lines = fullRun().events.map((e) => JSON.stringify({ ...e, run: id, ...(e.type === "run_start" ? { harness_features: playHarnessFeatures(ALL_ON, null) } : {}) }));
    fs.writeFileSync(join(dir, "events.jsonl"), lines.join("\n") + "\n");
  }
  const viewer = await startViewer({ runsRoot: root, staticDir: root, appDir: root, port: 0 });
  viewers.push(viewer);
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(new URL(path, viewer.url));
    expect(response.status).toBe(200);
    return response.json() as Promise<unknown>;
  };
  const io = vi.spyOn(fs, "readSync");
  const comparisons = await get("api/runs/selected/comparisons");
  expect(comparisons).toMatchObject({ candidates: [{ run: "reference", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] }], best: { run: "reference" }, baseline: null });
  const coldReads = io.mock.calls.length;
  io.mockClear();
  expect(await get("api/runs/selected/comparisons")).toEqual(comparisons);
  expect(io.mock.calls.length).toBe(coldReads - 2);
  io.mockClear();
  expect(await get("api/runs/reference/milestones")).toEqual({ run: "reference", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] });
  expect(io).not.toHaveBeenCalled();
  // History warms the selected run as well; subsequent milestones must also hit this same cache.
  await get("api/features/history");
  io.mockClear();
  expect(await get("api/runs/selected/milestones")).toEqual({ run: "selected", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] });
  expect(io).not.toHaveBeenCalled();
  const freshViewer = await startViewer({ runsRoot: root, staticDir: root, appDir: root, port: 0 });
  viewers.push(freshViewer);
  io.mockClear();
  const fresh = await fetch(new URL("api/runs/selected/comparisons", freshViewer.url));
  expect(fresh.status).toBe(200);
  expect(await fresh.json()).toEqual(comparisons);
  expect(io.mock.calls.length).toBe(coldReads);
  const path = join(root, "reference", "events.jsonl");
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":42'));
  expect(await get("api/runs/selected/comparisons")).toEqual({ candidates: [], best: null, baseline: null });
  const malformed = await fetch(new URL("api/runs/reference/milestones", viewer.url));
  expect(malformed.status).toBe(422);
});

it("shares one snapshot across comparison tabs per polling interval and clears failed refreshes", async()=>{
 const root=fs.mkdtempSync(join(tmpdir(),"viewer-snapshot-tabs-"));roots.push(root);let now=0;
 const read=vi.spyOn(workbench,"workbenchSnapshot").mockImplementation((_root,_health,_queue,at)=>Promise.resolve({version:1,at,milestones:[],runs:[],queue:[],problems:[]}));
 const viewer=await startViewer({runsRoot:root,staticDir:root,appDir:root,port:0,now:()=>new Date(now)});viewers.push(viewer);
 const get=()=>fetch(new URL("api/workbench",viewer.url));
 const replies=await Promise.all([get(),get(),get()]);for(const reply of replies)expect(await reply.json()).toMatchObject({at:0});expect(read).toHaveBeenCalledTimes(1);
 now=WORKBENCH_POLL_MS-1;expect(await(await get()).json()).toMatchObject({at:0});expect(read).toHaveBeenCalledTimes(1);
 now=WORKBENCH_POLL_MS;expect(await(await get()).json()).toMatchObject({at:now});expect(read).toHaveBeenCalledTimes(2);
 now+=WORKBENCH_POLL_MS;read.mockRejectedValueOnce(Error("snapshot unavailable"));const failed=await get();expect(failed.status).toBe(500);expect(await failed.json()).toMatchObject({error:"snapshot unavailable"});
 expect(await(await get()).json()).toMatchObject({at:now});expect(read).toHaveBeenCalledTimes(4);
 const other=await startViewer({runsRoot:root,staticDir:root,appDir:root,port:0,now:()=>new Date(now)});viewers.push(other);expect((await fetch(new URL("api/workbench",other.url))).status).toBe(200);expect(read).toHaveBeenCalledTimes(5);
});

it("shares a genuinely pending snapshot even after the completed-result TTL has elapsed", async()=>{
 const root=fs.mkdtempSync(join(tmpdir(),"viewer-pending-tabs-"));roots.push(root);let now=0,arrivals=0;
 const seen=Promise.withResolvers<void>(),started=Promise.withResolvers<void>(),held=Promise.withResolvers<Awaited<ReturnType<typeof workbench.workbenchSnapshot>>>();
 const read=vi.spyOn(workbench,"workbenchSnapshot").mockImplementation(()=>{started.resolve();return held.promise;});
 const viewer=await startViewer({runsRoot:root,staticDir:root,appDir:root,port:0,now:()=>{arrivals++;if(arrivals===3)seen.resolve();return new Date(now);}});viewers.push(viewer);
 const first=fetch(new URL("api/workbench",viewer.url));await started.promise;
 now=WORKBENCH_POLL_MS*2;const others=[fetch(new URL("api/workbench",viewer.url)),fetch(new URL("api/workbench",viewer.url))];
 await seen.promise;const callsWhilePending=read.mock.calls.length;held.resolve({version:1,at:0,milestones:[],runs:[],queue:[],problems:[]});
 const replies=await Promise.all([first,...others]);expect(callsWhilePending).toBe(1);for(const reply of replies)expect(await reply.json()).toMatchObject({at:0});
});
