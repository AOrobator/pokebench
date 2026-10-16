// F12 (stall-briefing-v1): the showcase run 2026-10-16T00-34-26_qwen36-gpu1_show spent turns 253–406 in the
// TORCHIC nickname editor; its only notes (T302 seq 7244, T353 seq 9563) briefed the field. Replayed from its
// recorded events (test-support/showcase-nickname, states trimmed to what the briefings read).
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import {INTERFACE_DWELL_CALLS,StallBriefing} from "./stall-briefing.js";
import type {RunEvent} from "./events.js";

const events=gunzipSync(readFileSync(new URL("../test-support/showcase-nickname/events.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
const start=events[0];if(start?.type!=="run_start")throw new Error("run_start");
const recorded=(start as unknown as {evaluation:{features:Record<string,boolean>}}).evaluation.features;
const features=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,recorded[id]??false])) as FeatureSet;
const note=(seq:number):string=>{const e=events.find(x=>x.seq===seq);if(e?.type!=="loop_guard")throw new Error(String(seq));return e.message;};
const upTo=(seq:number):SupervisorBriefing=>{const b=new SupervisorBriefing(features);for(const e of events){if(e.seq>=seq)break;b.observe(e);}return b;};
const FIELD_LISTS=/^- (Listed here that you have not tried yet|Not tried yet on other maps|Exits to maps you have not entered)/m;

describe("F12 stall-briefing-v1 in an owned interface (showcase nickname editor)",()=>{
 it("T302: the briefing names the nickname editor, its text, highlighted key and the way out, and drops the field lists",()=>{
  expect(note(7244)).toContain("- Listed here that you have not tried yet: Warp to map 0/9 at 6,12");
  const text=upTo(7244).stallText({kind:"milestone_drought",minutes:5},302);
  expect(text).toContain("\n- Where you are: in the nickname naming editor (screen naming); your last field position was LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) at 6,5 facing up\n");
  expect(text).toContain(`\n- Open interface: nickname naming editor (phase naming_editor); text entered so far: "MP.4" (at most 10 characters); highlighted key: 4; controls the game shows: A selects key; B deletes; SELECT changes page; START moves to OK\n`);
  expect(text).toContain("\n- How to finish: press START to move the cursor to OK, then press A on OK; with no text entered the Pokémon keeps its current name\n");
  const repeated=/\n- What you tried recently, newest first: press B,RIGHT,RIGHT,RIGHT,RIGHT,A ×(\d+) in the nickname naming editor → latest: text "MP\.4", highlighted 4; /.exec(text);
  // The recorded batch B,RIGHT×4,A was sent 24 times from turn 273 to 302 (seq 5858–7205), each result a different text.
  expect(Number(repeated?.[1])).toBe(24);
  expect(text).not.toMatch(FIELD_LISTS);
  expect(text).not.toContain("Characters the readout names here");
  expect(text).toMatch(/say how you will finish or leave this interface first\. The run continues\.$/);
 });
 it("the both-arm loop supervisor is unchanged: recorded notes reproduce byte for byte and it still briefs the field in the editor",()=>{
  for(const [seq,kind,calls] of [[855,"ineffective",59],[3118,"cycle",158]] as const)expect(upTo(seq).text(kind,calls)).toBe(note(seq));
  const loop=upTo(7244).text("cycle",302);
  expect(loop).toContain("- Listed here that you have not tried yet: Warp to map 0/9 at 6,12");
  expect(loop).not.toMatch(/Open interface|How to finish|naming editor/);
 });
 it(`briefs an interface dwell after ${String(INTERFACE_DWELL_CALLS)} calls in the same editor, long before the 5-minute drought, and again every ${String(INTERFACE_DWELL_CALLS)} calls`,()=>{
  const stalls:{kind:string;stall:Stall;seq:number;turn:number}[]=[];let turn=0,seq=0;
  const stall=new StallBriefing(features,()=>0,{stall:(kind,text,evidence)=>{text(0);stalls.push({kind,stall:last,seq:evidence[1]??0,turn});return true;}},s=>{last=s;return "";});
  let last:Stall={kind:"milestone_drought",minutes:0};
  for(const e of events){if(e.seq>=9563)break;turn=e.turn;seq=e.seq;stall.observe(e);}
  expect(seq).toBeGreaterThan(9000);
  const dwell=stalls.filter(s=>s.kind==="interface_dwell");
  expect(dwell.map(s=>s.stall)).toEqual([1,2,3].map(n=>({kind:"interface_dwell",name:"nickname naming editor",calls:n*INTERFACE_DWELL_CALLS})));
  expect(dwell[0]?.turn).toBeLessThan(302);
  // Turn 253's A answered the YES/NO prompt and only opened the editor; the 30 calls made inside it are turns 254-283.
  expect(dwell[0]?.turn).toBe(283);
  expect(stalls.filter(s=>s.turn>=253).every(s=>s.kind==="interface_dwell")).toBe(true);
 });
 it("states the dwell in the headline",()=>{
  const text=upTo(7244).stallText({kind:"interface_dwell",name:"nickname naming editor",calls:INTERFACE_DWELL_CALLS},290);
  expect(text).toMatch(new RegExp(`^SUPERVISOR: You are stalling\\. You have made ${String(INTERFACE_DWELL_CALLS)} calls in the nickname naming editor without leaving it, with no new story milestone, and the game is not moving forward \\(stall briefing, 290 calls into the run\\)\\.`));
 });
});
