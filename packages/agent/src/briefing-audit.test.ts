import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {featuresOf,type FeatureSet} from "./features.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import type {RunEvent} from "./events.js";
import type {LoopKind} from "./loop-detection.js";

const ID="briefing-exits-v1";
// Recorded runs from the 2026-10-16 cook harness audit (runs/reports/2026-10-16-cook-harness-audit), trimmed by the
// test author: state events keep the fields the briefing reads; tool results keep only their Story, Location,
// Position and warp lines; native_action, assistant and turn_start events are dropped; events before the window
// start are dropped except run_start and milestones. Not parseEvent-valid runs.
function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}
type Guard=Extract<RunEvent,{type:"loop_guard"}>;
// The stall or loop each recorded supervisor note briefed, read back from its own headline.
function brief(b:SupervisorBriefing,g:Guard):string {
 const cycle=/You have walked between (.+) and (.+) (\d+) times(, out and back,| \(with other maps in between\),)/.exec(g.message);
 if(cycle!==null){const stall:Stall={kind:"map_cycle",from:cycle[1]??"",to:cycle[2]??"",roundTrips:Number(cycle[3]),consecutive:cycle[4]===", out and back,"};return b.stallText(stall,g.calls);}
 const drought=/no new story milestone for (\d+) minutes of play/.exec(g.message);
 if(drought!==null)return b.stallText({kind:"milestone_drought",minutes:Number(drought[1])},g.calls);
 return b.text(g.kind as LoopKind,g.calls);
}
// The briefing at a recorded supervisor note, replayed with briefing-exits-v1 set as given.
function replay(name:string,seq:number,on:boolean):{text:string;recorded:string}{
 const events=recorded(name);
 const start=events.find(e=>e.type==="run_start");if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features:FeatureSet={...featuresOf(start.harness_features),[ID]:on};
 const b=new SupervisorBriefing(features);
 for(const e of events){
  if(e.type==="loop_guard"){if(e.seq===seq&&e.phase==="supervisor")return {text:brief(b,e),recorded:e.message};continue;}
  b.observe(e);
 }
 throw new Error(`no supervisor note at ${String(seq)}`);
}
const line=(text:string,head:string):string=>text.split("\n").find(l=>l.startsWith(head))??"";
const UNTRIED="- Listed here that you have not tried yet";

describe("briefing-exits-v1 audit fixes on recorded runs",()=>{
 it("push-back: a trigger whose script turned the player back counts as tried (live 54a7 T277 seq 6785, Oldale (0,10))",()=>{
  // From (1,10) facing left the model pressed LEFT ~30 times; each time OldaleTown_EventScript_BlockedPath ran on (0,10)
  // and stepped the player back, so no recorded state ever stands on (0,10) (state 6033 -> 6037: same tile, now facing right, locked).
  const off=replay("briefing-live54a7.jsonl.gz",6785,false),on=replay("briefing-live54a7.jsonl.gz",6785,true);
  expect(line(off.text,UNTRIED)).toContain("coordinate_trigger at 0,10 (step)");
  expect(line(on.text,UNTRIED)).not.toContain("coordinate_trigger at 0,10");
 });

 it("dead triggers: one whose condition the readout shows does not match is labelled so and listed last (live 54a7 T143 seq 3091)",()=>{
  const on=line(replay("briefing-live54a7.jsonl.gz",3091,true).text,UNTRIED);
  expect(on).toContain("coordinate_trigger at 11,2 (step; its condition did not match when the readout last showed it, so stepping on it then did nothing)");
  expect(on.endsWith("coordinate_trigger at 11,2 (step; its condition did not match when the readout last showed it, so stepping on it then did nothing)")).toBe(true);
  expect(on.indexOf("Sign text")).toBeLessThan(on.indexOf("coordinate_trigger at 8,9"));
 });

 it("people are tracked by object id: a MANIAC talked to at (2,10) is not untried at (1,10) or (1,11) (sh02 T1086 seq 18599, T1091 seq 18701)",()=>{
  for(const seq of [18599,18701]){
   const off=replay("briefing-sh02-oldale.jsonl.gz",seq,false),on=replay("briefing-sh02-oldale.jsonl.gz",seq,true);
   expect(line(off.text,UNTRIED)).toMatch(/MANIAC at 1,1[01] \(A\)/);
   expect(line(on.text,UNTRIED)).not.toContain("MANIAC");
  }
 });

 it("menu and turning inputs are not 'no change' (show T527 seq 15203)",()=>{
  const off=replay("briefing-show.jsonl.gz",15203,false),on=replay("briefing-show.jsonl.gz",15203,true);
  const tried=(t:string)=>line(t,"- What you tried recently");
  expect(tried(off.text)).toContain("press START in ROUTE101 (map 0/16) → no change");
  expect(tried(on.text)).toContain("press START in ROUTE101 (map 0/16) → opened the start menu (highlighted POKEMON)");
  expect(tried(on.text)).toContain("press B in ROUTE101 (map 0/16) → closed the start menu");
  expect(tried(on.text)).toContain("press RIGHT in ROUTE101 (map 0/16) → turned up -> right");
 });

 it("the tried list survives a story change (687e t113 seq 1494: wall clock and TV used at t87/t92, before CLOCK_SET)",()=>{
  const off=line(replay("briefing-687e.jsonl.gz",1494,false).text,UNTRIED),on=line(replay("briefing-687e.jsonl.gz",1494,true).text,UNTRIED);
  expect(off).toContain("Wall clock at 5,1 (A)");expect(off).toContain("television at 4,1 (A)");
  expect(on).not.toContain("Wall clock");expect(on).not.toContain("television");
  expect(on).toContain("PC at 0,1 (A)");
 });

 it("keeps the readout's caveat that sprite kinds are not names (live 54a7 T143 seq 3091)",()=>{
  const off=replay("briefing-live54a7.jsonl.gz",3091,false),on=replay("briefing-live54a7.jsonl.gz",3091,true);
  expect(line(off.text,"- Characters")).toBe("- Characters the readout names here: FAT_MAN at 12,13; BOY_2 at 14,17");
  expect(on.text).toContain("- Characters the readout names here, by sprite kind (a sprite kind is a graphic, not a personal name): FAT_MAN at 12,13; BOY_2 at 14,17");
 });
});
