import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent } from "@pokebench/agent/events";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
import { Log, START, state, fullRun } from "../test-support/events.js";
import { StateMilestones } from "../../agent/src/milestones.js";
import { runDetails } from "./workbench-view.js";
import { frontierPlot, frontierReferences } from "./frontier.js";
const fixtures: unknown = JSON.parse(readFileSync(new URL("../test-support/frontier-reference.json", import.meta.url), "utf8"));
function fixture(name: string): unknown[] {
  if (typeof fixtures !== "object" || fixtures === null || !(name in fixtures)) throw new Error("missing fixture");
  const value: unknown = Reflect.get(fixtures, name);
  if (typeof value !== "object" || value === null || !("events" in value) || !Array.isArray(value.events)) throw new Error("missing events");
  return value.events as unknown[];
}
describe("recorded reference ingestion", () => {
  it("carries native pause-adjusted human and actual dea1 splits through snapshot validation to graph selection", async () => {
    const root = mkdtempSync(join(tmpdir(), "frontier-native-"));
    const hashes = new Map<string, string>();
    for (const name of ["human", "agent"]) {
      const events = fixture(name).map(e => parseEvent(JSON.stringify(e))), first = events[0];
      if (first?.type !== "run_start") throw new Error("fixture start");
      const directory = join(root, ...(name === "human" ? ["human"] : []), first.run);
      mkdirSync(directory, { recursive: true });
      const bytes = events.map(e => JSON.stringify(e)).join("\n") + "\n";
      hashes.set(first.run, createHash("sha256").update(bytes).digest("hex"));
      writeFileSync(join(directory, "events.jsonl"), bytes);
    }
    const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), Date.parse("2026-10-14T13:00:00Z")));
    const refs = frontierReferences(data.runs);
    expect(refs.human?.splits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(317885);
    expect(refs.human?.measurement?.pausedMs).toBe(53869);
    expect(refs.human?.measurement?.rawSplits.find(s => s.name === "RIVAL_MET")).toMatchObject({ elapsedMs: 371754 });
    expect(refs.human?.measurement?.logSha256).toBe(hashes.get(refs.human?.id ?? ""));
    expect(refs.human?.splits.find(s => s.name === "STONE_BADGE")?.elapsedMs).toBe(6645610);
    expect(refs.best?.id).toBe("2026-10-14T00-25-06_think-fast_dea1");
    expect(refs.best?.splits.find(s => s.name === "RIVAL_MET")?.elapsedMs).toBe(1477567);
    expect(refs.best?.config?.preset).toBe("navigation-full-astar");
    expect(refs.best?.config?.source).toBe("256bf2347bd75d8db1645bda5e9f0149f640e1cc");
    expect(refs.best?.measurement?.features).toContain("story-milestones-v2");
    expect(refs.best?.measurement?.rawSplits.find(s => s.name === "RIVAL_MET")?.evidence.length).toBe(1);
    expect(() => parseWorkbench({ ...data, runs: data.runs.map(r => ({ ...r, measurement: { ...r.measurement, logSha256: "bad" } })) })).toThrow();
  });
});
it("accepts the common baseline's typed raw RAM references in new recordings without inventing historical archives", async () => {
  const root = mkdtempSync(join(tmpdir(), "frontier-raw-schema-")), id = "raw_schema_compatibility";
  const log = fullRun();
  const events = log.events.map(event => ({ ...event, run: id,
    ...(event.type === "run_start" ? { harness_features: [...event.harness_features, "full-raw-ram-v1"] } : {}),
    ...(event.type === "state" && "started" in event ? { raw_ram: { v: 1, sequence: 0, frame: 100, path: "raw-ram/00000000.json.gz", sha256: "a".repeat(64) } } : {}),
  }));
  mkdirSync(join(root, id)); const bytes = events.map(event => JSON.stringify(event)).join("\n") + "\n"; writeFileSync(join(root, id, "events.jsonl"), bytes);
  const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), Date.now()));
  expect(data.runs).toHaveLength(1); expect(data.runs[0]).toMatchObject({ id, status: "ended", problem: null });
  expect(data.runs[0]?.measurement?.features).toContain("full-raw-ram-v1");
  expect(data.runs[0]?.measurement?.logSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
});

it("carries modern detector-produced route and Roxanne milestones through schema, snapshot and graph", async () => {
  const fixture: {events: unknown[]} = JSON.parse(readFileSync(new URL("../test-support/frontier-gap-reference.json",import.meta.url),"utf8")) as {events: unknown[]};
  const boss=fixture.events.map(e=>parseEvent(JSON.stringify(e))).find(e=>e.type==="state"&&"story" in e&&e.story?.rustboro_gym_complete===true);
  if(boss?.type!=="state"||!("started" in boss)||boss.story==null)throw Error("boss");
  const bossStory = boss.story;
  const log=new Log();log.add(0,{...START,harness_features:["native-progress-activity-v1","ram-state-v1","story-milestones-v2","rustboro-gym-trainer-milestones-v1"]});
  const detector=new StateMilestones({read:()=>{throw Error("no emulator requests");}},()=>1000);detector.initialize("boot");
  const targets=["ROUTE_101","ROUTE_103","ROUTE_102","ROUTE_104","RUSTBORO_GYM_TRAINER_JOSH_DEFEATED","RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED","RUSTBORO_GYM_TRAINER_MARC_DEFEATED","ROXANNE_DEFEATED"];
  const inputs=[state({location:"ROUTE101",map_id:[0,16]}),state({location:"ROUTE 103",map_id:[0,18]}),state({location:"ROUTE102",map_id:[0,17]}),state({location:"ROUTE 104",map_id:[0,19]}),...(["rustboro_josh_defeated","rustboro_tommy_defeated","rustboro_marc_defeated"] as const).map(field=>state({location:"RUSTBORO CITY GYM",story:{...bossStory,rustboro_gym_complete:false,stone_badge:false,[field]:true}})),state({location:"RUSTBORO CITY GYM",story:{...bossStory,roxanne_defeated:true}})];
  inputs.forEach((body,i)=>{const event=log.add((i+1)*1000,body);if(event.type!=="state"||!("started" in event))throw Error("state");for(const mark of detector.observe(event,event.seq))if(targets.includes(mark.name))log.add((i+1)*1000+1,{type:"milestone",turn:1,name:mark.name,server_timestamp:mark.serverTimestamp,...(mark.kind===undefined?{}:{kind:mark.kind}),...(mark.origin===undefined?{}:{origin:mark.origin}),...(mark.evidence===undefined?{}:{evidence:[...mark.evidence]})});});
  log.add(10000,{type:"run_end",turn:1,reason:"budget",turns:1,wall_ms:10000,furthest_milestone:"ROXANNE_DEFEATED",tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
  const root=mkdtempSync(join(tmpdir(),"frontier-modern-")),id=log.events[0]?.run??"";mkdirSync(join(root,id));writeFileSync(join(root,id,"events.jsonl"),log.events.map(e=>JSON.stringify(e)).join("\n")+"\n");
  const result=parseWorkbench(await workbenchSnapshot(root,()=>Promise.resolve(false), Date.now())),record=result.runs[0];if(record===undefined)throw Error("run");
  const graph=frontierPlot({human:null,best:null},[record],900);
  for(const name of targets){expect(record.splits.find(s=>s.name===name)).toBeDefined();expect(record.splits.find(s=>s.name===name)?.derived).toBeUndefined();expect(graph).toContain(`data-split="${name}"`);}
});

it("keeps recovered historical evidence and upper-bound labels through the wire contract and point details", async () => {
  const fixture: {events: unknown[]} = JSON.parse(readFileSync(new URL("../test-support/frontier-gap-reference.json",import.meta.url),"utf8")) as {events: unknown[]};
  const events=fixture.events.map(e=>parseEvent(JSON.stringify(e))),id=events[0]?.run??"";
  const root=mkdtempSync(join(tmpdir(),"frontier-historical-wire-"));mkdirSync(join(root,id));writeFileSync(join(root,id,"events.jsonl"),events.map(e=>JSON.stringify(e)).join("\n")+"\n");
  const data=parseWorkbench(await workbenchSnapshot(root,()=>Promise.resolve(false), Date.now())),human=data.runs[0];if(human===undefined)throw Error("human");
  const graph=frontierPlot({human,best:null},[],900);
  expect(graph).toContain('data-split="ROXANNE_DEFEATED"');expect(graph).toContain("first observation upper bound");
  expect(runDetails(human,"ROXANNE_DEFEATED")).toContain("exact defeat time was not recorded");
  expect(runDetails(human,"ROUTE_101")).toContain("≤ 6:31.340");
  expect(()=>parseWorkbench({...data,runs:[{...human,splits:human.splits.map(s=>({...s,derived:"exact"}))}]})).toThrow("Invalid workbench");
});
