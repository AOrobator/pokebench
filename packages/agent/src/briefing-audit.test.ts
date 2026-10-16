import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {featuresOf,type FeatureSet} from "./features.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import type {RunEvent} from "./events.js";
import type {LoopKind} from "./loop-detection.js";
import {checkEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

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

 describe("only evidence that the script ran counts (review round 9)",()=>{
  // A synthetic room: a live step trigger at (3,2) above the start tile (3,3), a person to the right at (4,3).
  const trigger={kind:"coordinate_trigger",x:3,y:2,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null};
  const person={kind:"object",x:4,y:3,elevation:0,activation:"A",availability:"live",facing:null,local_id:7,destination:null,name:"MANIAC"};
  const base={...IN_GAME,started:true,screen:"overworld",location:"ROOM",map_id:[5,5],position:{x:3,y:3},facing:"up",field_controls_locked:false,interaction_targets:[trigger,person]};
  const live={objects:[],triggers:[{x:3,y:2,elevation:0,variable:16384,required_value:1,current_value:1,condition_met:true,script_pointer:136000000}],dialogue:null};
  const deadCtx={...live,triggers:[{x:3,y:2,elevation:0,variable:16384,required_value:1,current_value:0,condition_met:false,script_pointer:136000000}]};
  function run(steps:{buttons:string[];sent?:string[];states:Record<string,unknown>[];pages?:{at:[number,number];source:"faced_sprite"|null}[]}[],story:(i:number)=>string=()=>"a",world=live,from={x:3,y:3},features:FeatureSet=ON){
   const b=new SupervisorBriefing(features);let seq=0;
   const ev=(body:Record<string,unknown>)=>checkEvent({v:1,run:"r9",t:"2026-10-16T06:00:00.000-04:00",turn:seq,seq:++seq,...body});
   let where=from;
   const state=(extra:Record<string,unknown>)=>{const e=ev({type:"state",...base,position:where,world_context:world,...extra});if(e.type==="state"&&"started"in e&&e.position!==null)where=e.position;b.observe(e);return e.seq;};
   const first=state({});b.observe(ev({type:"tool_result",id:"c0",name:"observe",is_error:false,duration_ms:1,text:"Story: a",frames:[],state_seq:first}));
   steps.forEach((s,i)=>{
    b.observe(ev({type:"tool_call",id:`c${String(i+1)}`,name:"press",args:{buttons:s.buttons}}));
    const pre=state({});
    b.observe(ev({type:"button_press",tool_call_id:`c${String(i+1)}`,buttons:[s.buttons[0]],before_state_seq:pre}));
    let last=pre;
    const pageStates:number[]=[];
    for(const extra of s.states){last=state(extra);pageStates.push(last);}
    if(s.pages!==undefined)b.observe(ev({type:"dialogue_auto_advance",tool_call_id:`c${String(i+1)}`,tool:"press",requested:s.buttons,sent:s.sent??s.buttons,dropped:s.buttons.slice((s.sent??s.buttons).length),auto_presses:1,pages:s.pages.map((p,j)=>({state_seq:pageStates[j]??last,map:"ROOM",map_id:[5,5],position:{x:p.at[0],y:p.at[1]},speaker:p.source===null?null:"MANIAC",speaker_source:p.source,text:`page ${String(j)}`})),stop:"field_free",detail:"closed",duration_ms:1}));
    b.observe(ev({type:"tool_result",id:`c${String(i+1)}`,name:"press",is_error:false,duration_ms:1,text:`Story: ${story(i+1)}`,frames:[],state_seq:last}));
   });
   return line(b.text("cycle",9),UNTRIED);
  }
  const ON:FeatureSet={...featuresOf(["world-targets-v1","named-interactions-v1","live-player-position-v1","active-field-message-buffer-v1","bounded-navigation-v1"]),[ID]:true};
  it("a push-back with direction-only buttons, a script and the player back on the start tile counts",()=>{
   expect(run([{buttons:["UP"],states:[{field_controls_locked:true,facing:"down"}]}])).not.toContain("coordinate_trigger");
  });
  it("A then a dropped UP (the A opened a conversation) does not try the trigger above (Codex)",()=>{
   expect(run([{buttons:["A","UP"],sent:["A"],states:[{field_controls_locked:true}],pages:[{at:[3,3],source:null}]}])).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("UP then A with dialogue is not a push-back: the dialogue may be the A (Grok)",()=>{
   expect(run([{buttons:["UP","A"],states:[{field_controls_locked:true}],pages:[{at:[3,3],source:null}]}])).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("a dialogue page shown while standing on a trigger tile does not try it (Claude, Grok)",()=>{
   // The player arrived on (3,2) (a door mat, say) and stands there while a page shows.
   expect(run([{buttons:["B"],states:[{}],pages:[{at:[3,2],source:null}]}],undefined,live,{x:3,y:2})).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("a page from a sign or script while facing a person does not count as talking to them; A or a faced-sprite page does (Grok)",()=>{
   expect(run([{buttons:["DOWN"],states:[{facing:"right"}],pages:[{at:[3,3],source:null}]}])).toContain("MANIAC at 4,3 (A)");
   expect(run([{buttons:["DOWN"],states:[{facing:"right"}],pages:[{at:[3,3],source:"faced_sprite"}]}])).not.toContain("MANIAC");
  });
  it("a trigger crossed while unmet is listed, unlabelled, once a story step enables it (Codex round 10)",()=>{
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2}}]},{buttons:["DOWN"],states:[{position:{x:3,y:3},world_context:live}]}],i=>i>=2?"b":"a",deadCtx);
   expect(listed).toContain("coordinate_trigger at 3,2 (step)");
   expect(listed).not.toContain("did not match");
  });
  it("a one-shot script that flips its own condition by the arrival state was still tried (Claude round 10)",()=>{
   // Met before the step; the arrival state already shows it unmet (the script set its variable).
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2},world_context:deadCtx}]}]);
   expect(listed).not.toContain("coordinate_trigger at 3,2");
  });
  it("a trigger walked onto while its condition was shown unmet stays listed, labelled, also after a story step (Claude)",()=>{
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2}}]},{buttons:["DOWN"],states:[{position:{x:3,y:3}}]}],i=>i>=2?"b":"a",deadCtx);
   expect(listed).toContain("coordinate_trigger at 3,2 (step; its condition did not match when the readout last showed it, so stepping on it then did nothing)");
  });
 });

 it("keeps the readout's caveat that sprite kinds are not names (live 54a7 T143 seq 3091)",()=>{
  const off=replay("briefing-live54a7.jsonl.gz",3091,false),on=replay("briefing-live54a7.jsonl.gz",3091,true);
  expect(line(off.text,"- Characters")).toBe("- Characters the readout names here: FAT_MAN at 12,13; BOY_2 at 14,17");
  expect(on.text).toContain("- Characters the readout names here, by sprite kind (a sprite kind is a graphic, not a personal name): FAT_MAN at 12,13; BOY_2 at 14,17");
 });
});
