// JIT default, card link, exact tracked page and HTTP boundary integration.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { afterEach, expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";
import { HOST, startViewer, type Viewer } from "./server.js";

const ID = "just-in-time-prompt-v1";

it("starts OFF for the next run", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});

it("links the JIT card to its tracked per-request mechanism", () => {
  expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
  const log = new Log();
  log.add(0, { ...START, harness_features: [ID] });
  const doc = new Window().document;
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  doc.body.innerHTML = harnessConfig(view, FEATURES.filter((f) => f.id === ID));
  expect(doc.querySelector(`[data-feature="${ID}"] a`)?.getAttribute("href")).toBe(`/explainers/${ID}.html`);
  const html = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)), "utf8");
  expect(html).toContain(ID);
  expect(html).toContain("Before every live model request");
  expect(html).toContain("Unknown state keeps the full request");
});

const open: Viewer[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

function get(viewer: Viewer, path: string, options: { host?: string; method?: string } = {}): Promise<{ status: number; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: viewer.port, path, method: options.method ?? "GET", headers: { host: options.host ?? `${HOST}:${String(viewer.port)}` } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

it("the viewer serves the tracked explainer byte for byte through the explainer route", async () => {
  const tracked = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), "pokebench-explainers-"));
  const staticDir = join(root, "packages/viewer/static"), docs = join(root, "docs/explainers");
  mkdirSync(staticDir, { recursive: true });
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, `${ID}.html`), tracked);
  const viewer = await startViewer({ runsRoot: join(root, "runs"), staticDir, appDir: join(root, "app"), port: 0 });
  open.push(viewer);
  const reply = await get(viewer, `/explainers/${ID}.html`);
  expect(reply.status).toBe(200);
  expect(reply.type).toContain("text/html");
  expect(reply.body.equals(tracked)).toBe(true);
  expect((await get(viewer, `/explainers/${ID}.html`, { host: "elsewhere.invalid" })).status).toBe(403);
  expect((await get(viewer, `/explainers/${ID}.html`, { method: "PUT" })).status).toBe(405);
  expect((await get(viewer, "/explainers/just-in-time-prompt.html")).status).toBe(404);
});

