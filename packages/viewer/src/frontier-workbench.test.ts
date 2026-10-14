// @vitest-environment happy-dom
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { Workbench } from "./workbench.js";
import { run } from "../test-support/frontier-run.js";
import { HUMAN_REFERENCE } from "./frontier.js";
const html = readFileSync(join(process.cwd(), "static/workbench.html"), "utf8");
function ui(name: string): HTMLElement { const node = document.querySelector<HTMLElement>(`[data-wb="${name}"]`); if (node === null) throw new Error(name); return node; }
function change(name: string, value: string): void { (ui(name) as HTMLSelectElement).value = value; ui(name).dispatchEvent(new Event("change", { bubbles: true })); }
beforeEach(() => { document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "").replace(/<link[^>]+>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""); });
it("keeps both reference lines across empty model/cohort filters and exposes recorded raw/evidence/hash detail", async () => {
  const measurement = { controller: "agent" as const, features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 120000, evidence: [18] }] };
  const data = { version: 1, at: 1000, milestones: [{ id: "PLAYER_NAME_CONFIRMED", label: "Name" }], runs: [Object.assign(run({ id: "dea1" }), { measurement }), Object.assign(run({ id: HUMAN_REFERENCE, cohort: null, model: "Human · Operator" }), { measurement: { ...measurement, controller: "human", pausedMs: 53869, rawSplits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 173869, evidence: [18] }] } }), run({ id: "no-splits", model: "Other", cohort: "empty", splits: [] })], queue: [], problems: [] };
  data.runs.push(Object.assign(run({ id: "candidate", splits: run().splits.map(s => ({ ...s, elapsedMs: s.elapsedMs + 1000 })) }), { measurement: { ...measurement, rawSplits: measurement.rawSplits.map(s => ({ ...s, elapsedMs: s.elapsedMs + 1000 })) } }));
  const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(data), now: () => 1000, width: () => 340 });
  await wb.refresh();
  expect(ui("frontier-full").querySelector('[data-run="candidate"]')).not.toBeNull();
  expect((ui("overlay") as HTMLSelectElement).value).toBe("all");
  change("model", "Other"); change("cohort", "empty");
  expect(ui("frontier-full").querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(2);
  expect(ui("frontier-full").querySelectorAll('[data-run="dea1"]')).toHaveLength(2);
  expect(document.querySelector('[data-wb="frontier-early"]')).toBeNull();
  expect(ui("frontier-notes").textContent).toContain("exploration");
  expect(ui("frontier-notes").textContent).toContain("53.869");
  const mark = ui("frontier-full").querySelector(`[data-run="${HUMAN_REFERENCE}"][data-split="PLAYER_NAME_CONFIRMED"]`);
  mark?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(ui("detail").hidden).toBe(false); expect(ui("detail-body").textContent).toContain("2:53.869");
  expect(ui("detail-body").textContent).toContain("#18"); expect(ui("detail-body").textContent).toContain("a".repeat(64));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  change("cohort", "all"); change("model", "all"); change("overlay", "none");
  expect(ui("frontier-full").querySelector('[data-run="no-splits"]')).toBeNull();
  expect(ui("frontier-full").querySelector('[data-run="dea1"]')).not.toBeNull();
  wb.destroy();
});

it("keeps the healthy current run visible across filters and withdraws pulse on pause, end or failed polling", async () => {
  const measurement={controller:"agent" as const,features:["story-milestones-v2"],logSha256:"a".repeat(64),pausedMs:0,rawSplits:[]};
  const current=Object.assign(run({id:"current",model:"Active model",status:"live"}),{measurement});
  let value: unknown={version:1,at:1000,milestones:[],runs:[current],queue:[],problems:[]}, fail=false;
  const wb=new Workbench(document,{fetchSnapshot:()=>fail?Promise.reject(Error("offline")):Promise.resolve(value),now:()=>1000,width:()=>900});
  await wb.refresh();change("overlay","none");change("model","missing");
  expect(ui("frontier-full").querySelector('[data-live-run="current"]')).not.toBeNull();
  expect(ui("frontier-full").textContent).toContain("LIVE");
  expect(ui("frontier-full").querySelector('.wb-live-head')).not.toBeNull();
  value={version:1,at:2000,milestones:[],runs:[{...current,status:"paused"}],queue:[],problems:[]};await wb.refresh();
  expect(ui("frontier-full").querySelector('[data-live-run]')).toBeNull();expect(ui("frontier-full").textContent).toContain("PAUSED");
  value={version:1,at:3000,milestones:[],runs:[current],queue:[],problems:[]};await wb.refresh();fail=true;await wb.refresh();
  expect(ui("frontier-full").querySelector('[data-live-run]')).toBeNull();
  fail=false;value={version:1,at:4000,milestones:[],runs:[{...current,status:"ended"}],queue:[],problems:[]};await wb.refresh();expect(ui("frontier-full").querySelector('[data-current-run]')).toBeNull();wb.destroy();
});

it("zooms the story frontier by default and switches to the full human baseline across polling", async () => {
  const measurement = { controller: "agent" as const, features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] };
  const human = Object.assign(run({ id: HUMAN_REFERENCE, cohort: null, model: "Human", splits: ["NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "FIRST_TRUCK_EXIT", "STONE_BADGE"].map((name, i) => ({ name, elapsedMs: (i + 1) * 60000, segmentMs: 60000, seq: i, turn: 0, inputTokens: 0, outputTokens: 0 })) }), { measurement: { ...measurement, controller: "human" as const } });
  const agent = Object.assign(run({ id: "agent" }), { measurement });
  const data = (at: number): unknown => ({ version: 1, at, milestones: [], runs: [human, agent], queue: [], problems: [] });
  let at = 1000;
  const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(data(at)), now: () => 1000, width: () => 900 });
  await wb.refresh();
  const pressed = (view: string): string | null => document.querySelector(`[data-frontier-view="${view}"]`)?.getAttribute("aria-pressed") ?? null;
  const pick = (view: string): void => { document.querySelector<HTMLElement>(`[data-frontier-view="${view}"]`)?.click(); };
  expect(pressed("zoom")).toBe("true"); expect(pressed("full")).toBe("false");
  expect(ui("frontier-full").querySelector('[data-split="FIRST_TRUCK_EXIT"]')).not.toBeNull();
  expect(ui("frontier-full").querySelector('[data-split="STONE_BADGE"]')).toBeNull();
  pick("full");
  expect(pressed("full")).toBe("true"); expect(pressed("zoom")).toBe("false");
  expect(ui("frontier-full").querySelector('[data-split="STONE_BADGE"]')).not.toBeNull();
  at = 2000; await wb.refresh();
  expect(pressed("full")).toBe("true"); expect(ui("frontier-full").querySelector('[data-split="STONE_BADGE"]')).not.toBeNull();
  pick("zoom");
  expect(pressed("zoom")).toBe("true"); expect(ui("frontier-full").querySelector('[data-split="STONE_BADGE"]')).toBeNull();
  wb.destroy();
});
