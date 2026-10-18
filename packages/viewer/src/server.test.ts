import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Log, START, fullRun, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { QUEUE_FEATURES } from "../test-support/experiments.js";
import { BROWSER_MODULES, HOST, startViewer, type Viewer } from "./server.js";
import { parseWorkbench } from "./workbench-data.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const open: { close(): Promise<void> }[] = [];

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

interface Fixture {
  readonly runsRoot: string;
  readonly viewer: Viewer;
}

function writeRun(runsRoot: string, id: string, log: Log, port = 8011): string {
  const dir = join(runsRoot, id);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const lines = log.events.map((event) =>
    JSON.stringify(
      event.type === "run_start" ? { ...event, run: id, isolation: { ...event.isolation, port } } : { ...event, run: id },
    ),
  );
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
  return join(dir, "events.jsonl");
}

async function fixture(): Promise<Fixture> {
  const base = mkdtempSync(join(tmpdir(), "pokebench-viewer-srv-"));
  const runsRoot = join(base, "runs");
  const staticDir = join(base, "static");
  const appDir = join(base, "app");
  mkdirSync(runsRoot);
  mkdirSync(staticDir);
  mkdirSync(appDir);
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>PokeBench viewer</title>");
  writeFileSync(join(staticDir, "style.css"), "body{}");
  writeFileSync(join(appDir, "model.js"), "export const x = 1;");
  writeFileSync(join(appDir, "server.js"), "secret");
  const viewer = await startViewer({ runsRoot, staticDir, appDir, port: 0, pollMs: 10 });
  open.push(viewer);
  return { runsRoot, viewer };
}

interface Reply {
  readonly status: number;
  readonly type: string;
  readonly body: Buffer;
}

function get(viewer: Viewer, path: string, options: { host?: string; method?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: HOST, port: viewer.port, path, method: options.method ?? "GET", headers: { host: options.host ?? `${HOST}:${String(viewer.port)}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function fakeGameServer(body: unknown, status = 200): Promise<number> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  open.push({ close: () => new Promise<void>((resolve) => server.close(() => { resolve(); })) });
  return (server.address() as AddressInfo).port;
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  return port;
}

describe("browser modules", () => {
  it("import nothing at runtime but each other (the page has no bundler)", () => {
    for (const name of BROWSER_MODULES) {
      const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8");
      const runtimeImports = [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
      for (const specifier of runtimeImports) expect(BROWSER_MODULES.some(allowed => specifier === `./${allowed}.js`), `${name}.ts imports ${String(specifier)}`).toBe(true);
    }
  });
});

describe("viewer server", () => {
  it("binds 127.0.0.1 only", async () => {
    const { viewer } = await fixture();
    expect(HOST).toBe("127.0.0.1");
    expect(viewer.address).toBe("127.0.0.1");
    expect(viewer.url).toBe(`http://127.0.0.1:${String(viewer.port)}/`);
  });

  it("gives every page the local Poké Ball favicon", async () => {
    const staticDir = fileURLToPath(new URL("../static/", import.meta.url));
    for (const page of ["index.html", "workbench.html", "play.html"]) {
      expect(readFileSync(join(staticDir, page), "utf8"), page).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    }
    const base = mkdtempSync(join(tmpdir(), "pokebench-viewer-favicon-"));
    const viewer = await startViewer({ runsRoot: base, staticDir, appDir: base, port: 0, pollMs: 10 });
    open.push(viewer);
    for (const path of ["/favicon.svg", "/favicon.ico"]) {
      const icon = await get(viewer, path);
      expect(icon.status, path).toBe(200);
      expect(icon.type, path).toBe("image/svg+xml");
      const svg = icon.body.toString();
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toContain("<title>Poké Ball</title>");
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    }
  });

  it("serves the page, the stylesheet and only the browser modules", async () => {
    const { viewer } = await fixture();
    const page = await get(viewer, "/");
    expect(page.status).toBe(200);
    expect(page.type).toContain("text/html");
    expect((await get(viewer, "/style.css")).type).toContain("text/css");
    const module = await get(viewer, "/app/model.js");
    expect(module.type).toContain("text/javascript");
    expect(module.body.toString()).toBe("export const x = 1;");
    expect(BROWSER_MODULES).not.toContain("server");
    expect((await get(viewer, "/app/server.js")).status).toBe(404);
    expect((await get(viewer, "/app/..%2fserver.js")).status).toBe(404);
    expect((await get(viewer, "/app/timeline.js")).status).toBe(404);
    expect((await get(viewer, "/nope")).status).toBe(404);
  });

  it("refuses foreign Host headers and non-GET methods", async () => {
    const { viewer } = await fixture();
    expect((await get(viewer, "/", { host: "evil.example:80" })).status).toBe(403);
    expect((await get(viewer, "/", { host: `localhost:${String(viewer.port)}` })).status).toBe(200);
    expect((await get(viewer, "/", { method: "POST" })).status).toBe(405);
  });

  it("lists runs as JSON", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    const reply = await get(viewer, "/api/runs");
    expect(reply.type).toContain("application/json");
    expect(JSON.parse(reply.body.toString())).toMatchObject([{ id: "2026-10-11T22-00-00_a", ended: true }]);
  });

  it("labels a finals run with its finals place and leaves every other run's label alone", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    writeRun(runsRoot, "2026-10-11T22-00-00_f", fullRun());
    const dir = join(runsRoot, "experiments", "fm");
    mkdirSync(dir, { recursive: true });
    const incumbent = { version: 2, id: "fm-finals-incumbent", target: null, limits: { maxTurns: 10, maxWallMs: 1000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: QUEUE_FEATURES };
    writeFileSync(join(dir, "nomination.json"), JSON.stringify({ experiment: "fm", source: "queue", at: "t", incumbent, finals: { runsPerArm: 1, maxWallMs: 1000, target: null }, ranking: [], reusedIncumbent: [], finalists: [{ arm: "whole", switches: { "full-map-navigation-v1": true } }], reason: "r" }));
    writeFileSync(join(dir, "finals.jsonl"), `${JSON.stringify({ type: "launch", trial: 1, arm: "whole", run: "2026-10-11T22-00-00_f", at: "t", model: "m", commit: "c".repeat(40) })}\n`);
    const runs = JSON.parse((await get(viewer, "/api/runs")).body.toString()) as { id: string; experiment?: string }[];
    expect(runs.find((r) => r.id === "2026-10-11T22-00-00_f")?.experiment).toBe("fm finals · whole · run 2/2");
    expect(runs.find((r) => r.id === "2026-10-11T22-00-00_a")?.experiment).toBeUndefined();
  });

  it("streams a finished run's events, then caught_up and done", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "done", fullRun());
    const reply = await get(viewer, "/api/runs/done/events");
    expect(reply.type).toContain("text/event-stream");
    const text = reply.body.toString();
    expect(text.match(/^event: ev$/gm)).toHaveLength(fullRun().events.length);
    expect(text).toMatch(/event: caught_up\ndata: \{\}\n\n/);
    expect(text.trimEnd().endsWith("event: done\ndata: {}")).toBe(true);
  });

  it("streams rival values recovered from raw RAM onto the state events that lack them", async () => {
    const { runsRoot, viewer } = await fixture();
    const log = new Log();
    log.add(0, START);
    const scratch = mkdtempSync(join(tmpdir(), "ram-"));
    const fight = writeArchive(scratch, 1, rivalRam(true, false));
    const target = log.add(1000, state({ location: "ROUTE103", in_battle: true, raw_ram: fight }));
    log.add(2000, state({ location: "ROUTE103" }));
    log.add(3000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 3000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    writeRun(runsRoot, "recovered", log);
    mkdirSync(join(runsRoot, "recovered", "derived"), { recursive: true });
    cpSync(join(scratch, "raw-ram"), join(runsRoot, "recovered", "raw-ram"), { recursive: true });
    writeFileSync(join(runsRoot, "recovered", "derived", "route103_rival.jsonl"), [{ v: 1, run: "recovered", source: "raw-ram-route103-v1" }, { seq: target.seq, raw_ram: fight.path, sha256: fight.sha256, route103_rival: { battle_active: true, defeated: false, oldale_stage: 0 } }].map((r) => JSON.stringify(r)).join("\n") + "\n");
    const text = (await get(viewer, "/api/runs/recovered/events")).body.toString();
    const streamed = text.split("\n").filter((l) => l.startsWith("data: {\"")).map((l) => JSON.parse(l.slice(6)) as { seq?: number; route103_rival?: unknown });
    expect(streamed.find((e) => e.seq === target.seq)?.route103_rival).toEqual({ battle_active: true, defeated: false, oldale_stage: 0 });
    expect(streamed.filter((e) => e.route103_rival !== undefined)).toHaveLength(1);
  });

  it("tails a live run until run_end and reports invalid lines", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log();
    live.add(0, START);
    const path = writeRun(runsRoot, "live", live);
    const pending = get(viewer, "/api/runs/live/events");
    await new Promise((resolve) => setTimeout(resolve, 60));
    appendFileSync(path, "{broken\n");
    const end = fullRun().events.at(-1);
    appendFileSync(path, `${JSON.stringify({ ...end, run: "live", seq: 1 })}\n`);
    const text = (await pending).body.toString();
    expect(text.indexOf("event: caught_up")).toBeLessThan(text.indexOf("event: problem"));
    expect(text).toContain('"line":2');
    expect(text.match(/^event: ev$/gm)).toHaveLength(2);
    expect(text).toContain("event: done");
  });

  it("serves frames by safe name only", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "r", fullRun());
    writeFileSync(join(runsRoot, "r", "frames", "000009_0.png"), PNG);
    const frame = await get(viewer, "/api/runs/r/frames/000009_0.png");
    expect(frame.type).toBe("image/png");
    expect(frame.body.equals(PNG)).toBe(true);
    expect((await get(viewer, "/api/runs/r/frames/000010_0.png")).status).toBe(404);
    expect((await get(viewer, "/api/runs/r/frames/..%2fevents.jsonl")).status).toBe(404);
    expect((await get(viewer, "/api/runs/..%2f..%2fetc/events")).status).toBe(404);
  });

  it("serves baseline milestones", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "base", fullRun());
    const reply = await get(viewer, "/api/runs/base/milestones");
    expect(JSON.parse(reply.body.toString())).toEqual({
      run: "base",
      milestones: [
        { name: "GAME_RUNNING", offsetMs: 10 },
        { name: "PLAYER_NAME_SET", offsetMs: 3100 },
      ],
    });
    expect((await get(viewer, "/api/runs/missing/milestones")).status).toBe(404);
    appendFileSync(join(runsRoot, "base", "events.jsonl"), "{broken\n");
    const torn = await get(viewer, "/api/runs/base/milestones");
    expect(torn.status).toBe(422);
    expect(JSON.parse(torn.body.toString())).toMatchObject({ error: expect.stringContaining("line 15") as string });
  });

  it("proxies the live screen from the run's own game server while it runs", async () => {
    const { runsRoot, viewer } = await fixture();
    const port = await fakeGameServer({ screenshot_base64: PNG.toString("base64"), step_number: 3 });
    const live = new Log();
    live.add(0, START);
    writeRun(runsRoot, "live", live, port);
    const screen = await get(viewer, "/api/runs/live/screen");
    expect(screen.status).toBe(200);
    expect(screen.type).toBe("image/png");
    expect(screen.body.equals(PNG)).toBe(true);
  });

  it("refuses the live screen for an ended run and reports an unreachable or malformed server", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "done", fullRun());
    expect((await get(viewer, "/api/runs/done/screen")).status).toBe(409);
    const live = new Log();
    live.add(0, START);
    writeRun(runsRoot, "down", live, await closedPort());
    expect((await get(viewer, "/api/runs/down/screen")).status).toBe(502);
    const bad = await fakeGameServer({ screenshot_base64: Buffer.from("not a png").toString("base64"), step_number: 1 });
    writeRun(runsRoot, "bad", live, bad);
    expect((await get(viewer, "/api/runs/bad/screen")).status).toBe(502);
    const malformed = await fakeGameServer({ nope: true });
    writeRun(runsRoot, "malformed", live, malformed);
    expect((await get(viewer, "/api/runs/malformed/screen")).status).toBe(502);
    const failing = await fakeGameServer({}, 500);
    writeRun(runsRoot, "failing", live, failing);
    expect((await get(viewer, "/api/runs/failing/screen")).status).toBe(502);
    expect((await get(viewer, "/api/runs/missing/screen")).status).toBe(404);
  });
});

it("serves validated comparisons for the selected start, excluding self", async () => {
  const { runsRoot, viewer } = await fixture();
  writeRun(runsRoot, "selected", fullRun());
  writeRun(runsRoot, "reference", fullRun());
  const reply = await get(viewer, "/api/runs/selected/comparisons");
  expect(reply.status).toBe(200);
  const result = JSON.parse(reply.body.toString()) as { candidates: {run:string}[]; best:{run:string}; baseline:unknown };
  expect(result.candidates.map((c) => c.run)).toEqual(["reference"]);
  expect(result.best.run).toBe("reference");
  expect(result.baseline).toBeNull(); // equal start timestamp, no previous run
});

it("serves read-only workbench data from actual recorded runs, without prompts or arbitrary paths", async () => {
  const { runsRoot, viewer } = await fixture(); writeRun(runsRoot, "recorded", fullRun());
  const reply = await get(viewer, "/api/workbench"); expect(reply.status).toBe(200);
  const data = parseWorkbench(JSON.parse(reply.body.toString()) as unknown);
  expect(data.runs[0]?.id).toBe("recorded"); expect(data.runs[0]?.config?.source).toBe(START.harness.commit); expect(reply.body.toString()).not.toContain('"system_prompt"');
  expect((await get(viewer, "/api/workbench/../secrets")).status).not.toBe(200);
});


it("serves only allowlisted tracked feature explainers with existing host and method protections",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"navigation-evidence-memory-v1.html"),"<!doctype html><h1>Memory mechanism</h1>");writeFileSync(join(docs,"private.html"),"not public");writeFileSync(join(docs,"one-way-tiles-v1.html"),"<h1>One-way tiles</h1>");writeFileSync(join(docs,"counter-talk-v1.html"),"<h1>Counter talk</h1>");writeFileSync(join(docs,"walkable-floor-v1.html"),"<h1>Walkable floor</h1>");writeFileSync(join(docs,"grass-cost-switch.html"),"<h1>Grass cost</h1>");writeFileSync(join(docs,"elevation-transitions.html"),"<h1>Elevation</h1>");
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/navigation-evidence-memory-v1.html");expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.toString()).toContain("Memory mechanism");expect((await get(viewer,"/explainers/one-way-tiles-v1.html")).status).toBe(200);expect((await get(viewer,"/explainers/counter-talk-v1.html")).status).toBe(200);const floor=await get(viewer,"/explainers/walkable-floor-v1.html");expect(floor.status).toBe(200);expect(floor.body.toString()).toContain("Walkable floor");expect((await get(viewer,"/explainers/walkable-floor.html")).status).toBe(404);expect((await get(viewer,"/explainers/grass-cost-switch.html")).status).toBe(200);expect((await get(viewer,"/explainers/elevation-transitions.html")).status).toBe(200);
 expect((await get(viewer,"/explainers/private.html")).status).toBe(404);expect((await get(viewer,"/explainers/ledge-hops-v1.html")).status).toBe(404);expect((await get(viewer,"/explainers/navigation-evidence-memory-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);expect((await get(viewer,"/explainers/navigation-evidence-memory-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked talk to people explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"explorer-guidance-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/explorer-guidance-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked talk to people v2 explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v2.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"explorer-guidance-v2.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/explorer-guidance-v2.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked push-back, battle observation and ineffective loops explainers byte for byte, with their headings",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const files={"pushback-loop-detection-v1":"Push-back loop detection","pushback-press-result-v1":"Push-back press results","battle-observation-loop-v1":"Battle observation loop","ineffective-loops-v1":"Ineffective loops","battle-menu-loop-v1":"Battle menu loop","clock-view-loop-v1":"Clock view loop","loop-guard-screen-v1":"Loop guard screen"} as const;
 const tracked=new Map(Object.keys(files).map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,bytes] of tracked)writeFileSync(join(docs,`${id}.html`),bytes);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,heading] of Object.entries(files)){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status,id).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked.get(id)??Buffer.alloc(0)),id).toBe(true);expect(reply.body.toString()).toContain(`<h1>${heading}</h1>`);
 }
 expect((await get(viewer,"/explainers/pushback-loop-detection-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/battle-observation-loop-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Surf-gated exits explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/surf-gated-exits-v1.html",import.meta.url)));
 writeFileSync(join(docs,"surf-gated-exits-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/surf-gated-exits-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Surf-gated exits</h1>");
 expect((await get(viewer,"/explainers/surf-gated-exits-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/surf-gated-exits-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Exit reachability explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/exit-reachability-v1.html",import.meta.url)));
 writeFileSync(join(docs,"exit-reachability-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/exit-reachability-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Exit reachability</h1>");
 expect((await get(viewer,"/explainers/exit-reachability-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/exit-reachability-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Harness trust explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/harness-trust-v1.html",import.meta.url)));
 writeFileSync(join(docs,"harness-trust-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/harness-trust-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Harness trust</h1>");
 expect((await get(viewer,"/explainers/harness-trust-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/harness-trust-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Cited destination explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/cited-destination-v1.html",import.meta.url)));
 writeFileSync(join(docs,"cited-destination-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/cited-destination-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Cited destination</h1>");
 expect((await get(viewer,"/explainers/cited-destination-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/cited-destination-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked No exit here explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/no-exit-here-v1.html",import.meta.url)));
 writeFileSync(join(docs,"no-exit-here-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/no-exit-here-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>No exit here</h1>");
 expect((await get(viewer,"/explainers/no-exit-here-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/no-exit-here-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked cross-map goal explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/cross-map-goal-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"cross-map-goal-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/cross-map-goal-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,"/explainers/cross-map-goal-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/cross-map-goal-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked people ID cards explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/people-id-cards-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"people-id-cards-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/people-id-cards-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,"/explainers/people-id-cards-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/people-id-cards-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked story battle heal warning explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/low-hp-trainer-warning-v2.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"low-hp-trainer-warning-v2.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/low-hp-trainer-warning-v2.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the rival-push explainers through the existing allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 for(const id of ["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-triage-guidance-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","disproved-beliefs-v1","same-plan-breaker-v1","briefing-exits-v1","untaken-exits-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1","battle-loss-recap-v1","navigation-truth-v1","navigation-refusal-reasons-v2"])writeFileSync(join(docs,`${id}.html`),`<h1>${id}</h1>`);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const id of ["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-triage-guidance-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","disproved-beliefs-v1","same-plan-breaker-v1","briefing-exits-v1","untaken-exits-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1","battle-loss-recap-v1","navigation-truth-v1","navigation-refusal-reasons-v2"]){const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.toString()).toContain(id);}
});

it("serves only the allowlisted trainer card art from runs/sprites/trainer-card-v1",async()=>{
 const {runsRoot,viewer}=await fixture();const art=join(runsRoot,"sprites","trainer-card-v1");
 for(const dir of ["card","trainers","font","icons"])mkdirSync(join(art,dir),{recursive:true});
 const png=PNG;
 writeFileSync(join(art,"manifest.json"),'{"version":1}');writeFileSync(join(art,"card","wide-gold.png"),png);writeFileSync(join(art,"card","mini-ribbon-green.png"),png);writeFileSync(join(art,"trainers","may.png"),png);writeFileSync(join(art,"font","glyphs.png"),png);writeFileSync(join(art,"font","glyphs.json"),"{}");writeFileSync(join(art,"icons","280.png"),png);writeFileSync(join(art,"icons","secret.txt"),"no");writeFileSync(join(runsRoot,"sprites","other.png"),png);
 const manifest=await get(viewer,"/sprites/manifest.json");expect(manifest.status).toBe(200);expect(manifest.type).toContain("application/json");expect(manifest.body.toString()).toBe('{"version":1}');
 for(const path of ["/sprites/card/wide-gold.png","/sprites/card/mini-ribbon-green.png","/sprites/trainers/may.png","/sprites/font/glyphs.png","/sprites/icons/280.png"]){const reply=await get(viewer,path);expect(reply.status,path).toBe(200);expect(reply.type,path).toBe("image/png");}
 expect((await get(viewer,"/sprites/font/glyphs.json")).type).toContain("application/json");
 for(const path of ["/sprites/icons/secret.txt","/sprites/icons/1234.png","/sprites/card/wide-purple.png","/sprites/trainers/May.png","/sprites/../other.png","/sprites/%2e%2e/other.png","/sprites/icons/..%2f..%2fother.png","/sprites/icons/281.png","/sprites/manifest.json/x","/sprites"])expect((await get(viewer,path)).status,path).toBe(404);
 expect((await get(viewer,"/sprites/manifest.json",{host:"elsewhere.invalid"})).status).toBe(403);
 expect(BROWSER_MODULES).toEqual(expect.arrayContaining(["trainer-card","game-font"]));
});

it("serves the tracked story destinations explainer byte for byte through the allowlist",async()=>{
 const id="story-destinations-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Story destinations</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked heal before trainers explainer byte for byte through the allowlist",async()=>{
 const id="heal-before-trainers-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Heal before trainers</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked stale story goal explainer byte for byte through the allowlist",async()=>{
 const id="stale-story-goal-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Stale story goal</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked heal before trainers BAG items explainer byte for byte through the allowlist",async()=>{
 const id="bag-healing-items-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Heal before trainers: BAG items</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked battle action tool explainer byte for byte through the allowlist",async()=>{
 const id="battle-move-tool-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Battle action tool</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the 2026-10-17 readout-fix explainers byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const pages={"tutorial-party-owner-v1":"Tutorial party owner","mid-frame-readout-v1":"Mid-frame readout","unset-dynamic-warp-v1":"Unset dynamic warp","status-names-v1":"Status names","surf-gated-exits-v2":"Surf-gated exits v2"};
 const tracked=new Map(Object.keys(pages).map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,body] of tracked)writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,heading] of Object.entries(pages)){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status,id).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked.get(id)??Buffer.alloc(0)),id).toBe(true);expect(reply.body.toString()).toContain(`<h1>${heading}</h1>`);
 }
 expect((await get(viewer,"/explainers/status-names-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/surf-gated-exits-v2.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked conversation ledger explainer byte for byte through the allowlist",async()=>{
 const id="instruction-ledger-v2";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Conversation ledger</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});
