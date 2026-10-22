import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {withNavigation} from "./navigation.js";
import {flagFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {parseGameState} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {CheckedPressTool} from "./game-tools.js";
const detail="Arrives at (16,38). Terrain exits after arrival: exit (14,5) returns to ROUTE 104 (map 0/19) — north terrain section at (10,30) (different terrain section from you). Temporary objects and scripts may block these terrain paths.";
const state:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,19],position:{x:0,y:0},navigation_grid:{elevation:3,tiles:[{x:0,y:0,collision:0,behavior:0,elevation:3},{x:1,y:0,collision:1,behavior:0,elevation:3},{x:2,y:0,collision:0,behavior:0,elevation:3}],objects:[],warps:[{x:0,y:0}]},topology:{width:3,height:1,connections:[]},exit_reach:{foot:{width:3,height:1,rows:["8"]},connections:[],warps:[{x:0,y:0,reach:"foot"}]},exit_sections:{current:"south section",warps:[{x:0,y:0,label:"PETALBURG WOODS",detail}],connections:[]}};
async function run(enabled:boolean|undefined,s=state){
 const press={name:"press",executeChecked:()=>Promise.reject(new Error("no input expected"))} as unknown as CheckedPressTool;
 const observe={name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"observed"}],details:{state:s}})} as unknown as AgentTool;
 const f={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"exit-labels-v3":true,"reachable-section-alternatives-v1":enabled??false};
 const tool=withNavigation([press,observe],f,{read:()=>Promise.resolve(s)}).find(t=>t.name==="navigate_to");if(tool===undefined)throw new Error("missing navigation");
 return tool.execute("model",{x:2,y:0,map_id:[0,19]});
}
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.map(c=>c.text??"").join("\n");
it("production unreachable target returns currently reachable departure and delivered section facts without choosing a route",async()=>{
 const output=text(await run(true));expect(output).toContain("Reachable departure alternatives");expect(output).toContain(detail);expect(output).toContain("do not establish a route to (2,0)");
});
it("OFF preserves the incumbent result exactly",async()=>{expect(await run(false)).toEqual(await run(undefined));expect(text(await run(false))).not.toContain("PETALBURG WOODS");});
it.each(["unknown reach","blocked departure","unknown section","trigger"])("withholds alternatives for %s",async which=>{
 let s=state;
 if(which==="unknown reach"){const {exit_reach:_reach,...without}=state;expect(_reach).toBeDefined();s=without;}
 if(which==="blocked departure")s={...state,exit_reach:{foot:{width:3,height:1,rows:["8"]},connections:[],warps:[{x:0,y:0,reach:"none"}]}};
 if(which==="unknown section"){const {exit_sections:_sections,...without}=state;expect(_sections).toBeDefined();s=without;}
 if(which==="trigger")s={...state,world_context:{objects:[],dialogue:null,triggers:[{x:0,y:0,elevation:3,variable:0x4000,required_value:1,current_value:1,condition_met:true,script_pointer:1}]}};
 expect(text(await run(true,s))).not.toContain("Reachable departure alternatives");
});
it("can re-deliver recorded Route104/Woods section evidence without rewriting its caveats",async()=>{
 const {reachableSectionAlternatives}=await import("./reachable-section-alternatives.js");
 const raw:unknown=JSON.parse(readFileSync(new URL("./fixtures/exit-sections-b300.json",import.meta.url),"utf8"));if(typeof raw!=="object"||raw===null||!("18834" in raw))throw new Error("missing route fixture");
 const route=parseGameState(raw["18834"]);const output=reachableSectionAlternatives(route,{x:10,y:0});expect(output).toContain("different terrain section from you");expect(output).toContain("Temporary objects and scripts may block these terrain paths.");
});
