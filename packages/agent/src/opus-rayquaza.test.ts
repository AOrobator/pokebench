import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures,presetStart} from "./play-preset.js";
import {finalGuide} from "./play-wiring.js";
import {OPUS_RAYQUAZA_SWITCHES} from "./opus-rayquaza.js";
import lane from "../../../experiments/presets/opus-rayquaza-lane.json" with {type:"json"};
import type {AgentMessage} from "@mariozechner/pi-agent-core";

const [BIKE,BALL,CATCH,MOVES]=OPUS_RAYQUAZA_SWITCHES;
const input:AgentMessage[]=[{role:"user",content:"Observe.",timestamp:1}];
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({
  v:1,run:"opus",seq:1,turn:1,t:"2026-11-07T12:00:00.000-05:00",...body,
});
const state=(body:Record<string,unknown>={}):RunEvent=>event({...IN_GAME,type:"state",field_controls_locked:false,...body});
const milestone=(name:string):RunEvent=>event({type:"milestone",name,server_timestamp:0,origin:"present_at_start"});
const bag=(...ids:number[])=>ids.map((item_id,slot)=>({item_id,slot,quantity:1,pocket:null}));
const resources=(...ids:number[])=>({bag:bag(...ids),pc_items:null,storage:null,berry_trees:null,
  planted_berries:null,diagnostics:[],script_pc:null,script_mode:null,script_status:null,selected_tree_id:null,berry_script_owner:null});
const ray=(...moves:string[])=>({species:"RAYQUAZA",level:70,hp:240,max_hp:240,
  moves:moves.map((name,i)=>({name,move_id:i+1,pp:5,pp_bonus:0}))});
function harness(...ids:string[]){
  const listeners:((e:RunEvent)=>void)[]=[],hints:string[]=[];
  const features=featuresOf(ids);
  const transform=finalGuide(features,{subscribe:listener=>{listeners.push(listener);},
    recordMilestoneHint:hint=>{hints.push(hint.milestone);}},messages=>Promise.resolve(messages));
  return {listeners,hints,feed:(...events:RunEvent[])=>{for(const e of events)for(const listen of listeners)listen(e);},
    output:()=>transform(input),note:async()=>(await transform(input)).at(-1)?.content};
}

it("keeps the four treatments append-only and OFF in legacy and flag-only presets",async()=>{
  const legacy=Object.fromEntries(Object.entries(featuresOf([])).filter(([id])=>!OPUS_RAYQUAZA_SWITCHES.some(value=>value===id)));
  const fallback=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
  expect(SWITCHABLE_FEATURES.slice(-4)).toEqual(OPUS_RAYQUAZA_SWITCHES);
  for(const id of OPUS_RAYQUAZA_SWITCHES){
    expect(featureInfo(id).description).toContain(" Off: ");
    expect(normalizeFeatures(legacy as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
    expect(fallback[id]).toBe(false);
  }
  const off=harness();
  expect(off.listeners).toEqual([]);
  expect(await off.output()).toBe(input);
});

it("parses the Opus lane as a boot preset with separate bike execution and four decision switches",()=>{
  const preset=parsePlayPreset(lane),features=presetFeatures(preset);
  expect(preset.id).toBe("opus-rayquaza-lane");
  expect(presetStart(preset,()=>{throw new Error("expected boot");})).toEqual({kind:"boot"});
  expect(playHarnessFeatures(features,null).slice(-4)).toEqual(OPUS_RAYQUAZA_SWITCHES);
  for(const id of ["bike-navigation-v1","bike-register-v1","bike-auto-mount-v1","rq-mach-dash-v1"] as const)expect(features[id]).toBe(true);
  for(const id of ["rq-milestone-guide-v1","rq-battle-explainer-v1","rq-slim-prompt-v1"] as const)expect(features[id]).toBe(false);
});

it("updates the Mauville prompt when the bike is acquired and retires it on SELECT registration",async()=>{
  const h=harness(BIKE);
  const bike={owned:[],registered:0,riding:null,allow_cycling:true};
  h.feed(state({map_id:[0,2],bike,field_controls_locked:true}));
  expect(await h.output()).toBe(input);
  h.feed(state({map_id:[0,2],bike}));
  expect(await h.note()).toContain("Get the MACH BIKE");
  await h.note();
  expect(h.hints).toEqual([BIKE]);
  h.feed(state({map_id:[10,1],bike:{...bike,owned:[259]}}));
  expect(await h.note()).toContain("Register the MACH BIKE");
  h.feed(state({map_id:[0,2],bike:{...bike,owned:[259],registered:259}}));
  expect(await h.output()).toBe(input);
});

it("limits the Master Ball prompt to B1F with known inventory and retires it after acquisition or escape",async()=>{
  const h=harness(BALL);
  h.feed(state({map_id:[24,24]}));
  expect(await h.output()).toBe(input);
  h.feed(state({map_id:[24,24],resources:resources()}));
  expect(await h.note()).toContain("From (3,15), take the warp panel at (3,20) first. Then take the panels at (42,5), (45,9), (42,13), and (42,17). Approach the Master Ball at (15,9) from below.");
  h.feed(state({map_id:[24,24],resources:resources(1)}));
  expect(await h.output()).toBe(input);
  h.feed(milestone("MASTER_BALL_OBTAINED"),state({map_id:[24,24],resources:resources()}));
  expect(await h.output()).toBe(input);
  const escaped=harness(BALL);
  escaped.feed(milestone("AQUA_HIDEOUT_ESCAPE_COMPLETE"),state({map_id:[24,24],resources:resources()}));
  expect(await escaped.output()).toBe(input);
});

it("starts capture guidance after the native crisis, then follows Rayquaza from storage to the party",async()=>{
  const h=harness(CATCH);
  h.feed(state({resources:resources(1)}));
  expect(await h.output()).toBe(input);
  h.feed(milestone("SOOTOPOLIS_CRISIS_RESOLVED"));
  expect(await h.note()).toContain("Return to SKY PILLAR");
  h.feed(state({map_id:[24,85],resources:resources(1)}));
  expect(await h.note()).toContain("Approach (14,7)");
  h.feed(milestone("RAYQUAZA_ENCOUNTER_RETIRED"),state({resources:resources()}));
  expect(await h.output()).toBe(input);
  h.feed(state({resources:{...resources(),storage:{current_box:0,occupied:[{box:0,slot:0,pokemon:ray()}]}}}));
  expect(await h.note()).toContain("Withdraw it into your party");
  h.feed(state({party:[ray()]}));
  expect(await h.output()).toBe(input);
});

it("gates move guidance on the Rain Badge, party, item availability and confirmed move names",async()=>{
  const h=harness(MOVES);
  const initial=ray("FLY","OUTRAGE","EXTREMESPEED","REST");
  h.feed(state({party:[initial],resources:resources(328,345)}));
  expect(await h.output()).toBe(input);
  h.feed(state({badges:["RAIN"],party:[initial],resources:resources(345)}));
  expect(await h.note()).toContain("WATERFALL over REST");
  expect(await h.note()).not.toContain("AERIAL ACE");
  h.feed(state({badges:["RAIN"],party:[initial],resources:resources(328,345)}));
  expect(await h.note()).toContain("AERIAL ACE over EXTREMESPEED");
  h.feed(state({badges:["RAIN"],party:[ray("FLY","OUTRAGE","AERIAL ACE","WATERFALL")],resources:resources(345)}));
  expect(await h.output()).toBe(input);
  h.feed(milestone("ELITE_FOUR_CHALLENGE_ENTERED"),state({badges:["RAIN"],party:[initial],resources:resources(328,345)}));
  expect(await h.output()).toBe(input);
});

it("delivers the Master Ball instruction only during the active summit encounter with the ball available",async()=>{
  const h=harness(CATCH);
  const battler={battler:1,position:1,party_slot:0,identity:"wild-rayquaza",species_id:406,species:"RAYQUAZA",
    level:70,hp:240,max_hp:240,status1:0,status2:0,status3:0,stat_stages:Array(8).fill(6),
    stats:Array(5).fill(140),types:[16,2],ability:76,held_item:0,absent:false,
    moves:Array.from({length:4},(_,slot)=>({slot,move_id:0,name:null,pp:0,max_pp:0,
      move_type:null,power:null,accuracy:null,effect:null}))};
  const battle={active:true,initialized:true,phase:"action",ready:true,main_func:null,script_pc:null,
    battle_type:0,turn:1,outcome_code:0,outcome:"ongoing",battlers:[battler],player_inputs:[],
    controller_exec_flags:0,signals:[],current_execution:null,diagnostic:null,raw_hex:null};
  const encounter={map_id:[24,85],screen:"battle",in_battle:true,resources:resources(1),battle};
  h.feed(milestone("SOOTOPOLIS_CRISIS_RESOLVED"));
  for(const wrong of [
    {map_id:[24,84]},
    {resources:resources()},
    {battle:{...battle,active:false}},
    {battle:{...battle,battlers:[{...battler,position:0}]}},
  ]){
    h.feed(state({...encounter,...wrong}));
    expect(await h.output()).toBe(input);
  }
  h.feed(state(encounter));
  expect(await h.note()).toBe("OPUS RAYQUAZA LANE: Use the MASTER BALL on RAYQUAZA now.");
  expect(h.hints).toEqual([CATCH]);
});

it("gives a Sky Pillar dash only at its starting tile with the tool and registered bike",async()=>{
  const bike={owned:[259],registered:259,riding:null,allow_cycling:true};
  const entry={map_id:[24,80],position:{x:10,y:2},resources:resources(1),bike};
  const crisis=milestone("SOOTOPOLIS_CRISIS_RESOLVED");
  const toolOff=harness(CATCH);
  toolOff.feed(crisis,state(entry));
  expect(await toolOff.note()).not.toContain("mach_dash");

  const h=harness(CATCH,"rq-mach-dash-v1");
  h.feed(crisis,state({...entry,bike:{...bike,registered:0}}));
  expect(await h.note()).not.toContain("mach_dash");
  h.feed(state({...entry,field_controls_locked:true}));
  expect(await h.output()).toBe(input);
  h.feed(state({...entry,position:{x:10,y:3}}));
  expect(await h.note()).not.toContain("mach_dash");
  h.feed(state(entry));
  expect(await h.note()).toContain("Press SELECT");
  expect(await h.note()).toContain("D1 R4 D11 L10 U4 R2 U8");
  h.feed(state({...entry,map_id:[24,82],position:{x:11,y:2},bike:{...bike,riding:"MACH BIKE"}}));
  expect(await h.note()).not.toContain("Press SELECT");
  expect(await h.note()).toContain("D14 L8 U8 R2");
  expect(await h.note()).toContain("deliberately drops");
  h.feed(state({...entry,map_id:[24,81],position:{x:7,y:4}}));
  expect(await h.note()).toContain("(7,1)");
});
