import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {Button} from "./events.js";
import {featureInfo,playHarnessFeatures} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";

const ID="moving-npc-target-v1";
const request={map_id:[0,9],target:{kind:"object",local_id:2}};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const npc=(x:number,y=1):Target=>({kind:"object",x,y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,native_slot:2,destination:null,name:"PERSON"});
function place(state:GameStateSnapshot,targets:readonly Target[]):GameStateSnapshot {
 return {...state,interaction_targets:[...targets],interaction_object_slots:targets.map(t=>({slot:t.native_slot??2,local_id:t.local_id??2,x:t.x,y:t.y,elevation:t.elevation,map_id:[0,9],is_player:false})),navigation_grid:{elevation:3,tiles:Array.from({length:7},(_,x)=>[0,1,2].map(y=>({x,y,collision:0,behavior:0,elevation:3}))).flat(),objects:targets.map(t=>({x:t.x,y:t.y})),warps:[]}};
}
const field=()=>place({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:1},facing:"right",field_controls_locked:false},[npc(3)]);
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
function fixture(on=true,after?:(state:GameStateSnapshot,buttons:readonly Button[],count:number)=>GameStateSnapshot,before?:(state:GameStateSnapshot,button:Button|undefined)=>GameStateSnapshot){
 let current=field();const sent:Button[][]=[];
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current))};
 const checked={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id:string,args:{buttons:Button[]},signal?:AbortSignal)=>checked.executeChecked(id,args,()=>undefined,signal),executeChecked:(_id:string,args:{buttons:Button[]},check:(state:GameStateSnapshot)=>void,_signal?:AbortSignal)=>{
  current=before?.(current,args.buttons[0])??current;check(current);sent.push(args.buttons);
  const button=args.buttons[0];if(button==="A")current={...current,field_controls_locked:true,world_context:{...current.world_context,dialogue:"Hello"} as GameStateSnapshot["world_context"]};
  else if(button!==undefined){const facing=button.toLowerCase();if(current.facing!==facing)current={...current,facing};else {const dx=button==="RIGHT"?1:button==="LEFT"?-1:0,dy=button==="DOWN"?1:button==="UP"?-1:0;current={...current,position:{x:(current.position?.x??0)+dx,y:(current.position?.y??0)+dy}};}}
  current=after?.(current,args.buttons,sent.length)??current;return Promise.resolve(result(current));
 }} as unknown as CheckedPressTool;
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,[ID]:on};
 const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
 const tools=playGameTools([observe,checked],features,{read:()=>Promise.resolve(current)},recorder);
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing tool");
 return {sent,tool,state:()=>current,set:(state:GameStateSnapshot)=>{current=state;}};
}
it("defaults OFF and records only explicitly enabled moving target support",()=>{
 const flags=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(flags[ID]).toBe(false);expect(featureInfo(ID).description).toContain("Off:");expect(playHarnessFeatures({...flags,[ID]:true})).toContain(ID);
});
it("production path follows a moving NPC, faces its new tile and presses A once",async()=>{
 const f=fixture(true,(s,_b,n)=>n===1?place(s,[npc(4,2)]):s);
 const out=await f.tool.execute("follow",request);
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true,status:"activation handed control back: dialogue or a field message opened"}});
 expect(f.state().position).toEqual({x:4,y:1});expect(f.state().facing).toBe("down");
});
it("OFF preserves the first-movement abort and never talks",async()=>{
 const f=fixture(false,(s,_b,n)=>n===1?place(s,[npc(4,2)]):s);
 const out=await f.tool.execute("off",request);
 expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false,status:"semantic target moved during travel"}});
});
it("replans when the NPC moves during facing instead of pressing A at an empty tile",async()=>{
 let moved=false;const f=fixture(true,(s,b)=>{if(b[0]==="DOWN"&&!moved){moved=true;return place(s,[npc(5,2)]);}return s;});f.set({...field(),position:{x:3,y:0}});
 const out=await f.tool.execute("face",request);
 expect(moved).toBe(true);expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it("rechecks the recipient in the A precondition and follows a last-moment move",async()=>{
 let moved=false;const f=fixture(true,undefined,(s,b)=>{if(b==="A"&&!moved){moved=true;return place(s,[npc(5,2)]);}return s;});
 const out=await f.tool.execute("race",request);
 expect(moved).toBe(true);expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});
it.each(["gone","identity","battle","map","script","menu"] as const)("stops immediately for %s",async kind=>{
 const f=fixture(true,(s,_b,n)=>n!==1?s:kind==="gone"?place(s,[]):kind==="identity"?place(s,[{...npc(4),native_slot:3}]):kind==="battle"?{...s,in_battle:true,screen:"battle"}:kind==="map"?{...s,map_id:[1,2]}:kind==="script"?{...s,field_controls_locked:true}:{...s,screen:"menu"});
 const out=await f.tool.execute(kind,request);expect(f.sent).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});
it("does not talk to a different native recipient at the same tile",async()=>{
 const f=fixture(true,undefined,(s,b)=>b==="A"?{...s,interaction_object_slots:[{slot:1,local_id:9,x:3,y:1,elevation:3,map_id:[0,9],is_player:false},...(s.interaction_object_slots??[])]}:s);
 const out=await f.tool.execute("recipient",request);expect(f.sent.some(b=>b[0]==="A")).toBe(false);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});
it("bounds a continuously moving target even when no further input is submitted",async()=>{
 const f=fixture(true,undefined,s=>place(s,[npc(s.interaction_targets?.[0]?.x===3?4:3)]));
 const out=await f.tool.execute("budget",request);expect(f.sent.some(b=>b[0]==="A")).toBe(false);expect(out.details).toMatchObject({semantic_navigation:{status:"moving target attempt limit reached; inspect the current state",activation_attempted:false}});
});
