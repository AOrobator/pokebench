import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {withNavigation} from "./navigation.js";
import {flagFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
const state:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,16],position:{x:0,y:0},navigation_grid:{elevation:3,tiles:[{x:0,y:0,collision:0,behavior:0,elevation:3}],objects:[],warps:[]},topology:{width:1,height:1,connections:[{direction:"NORTH",offset:0,destination:[0,10],destination_name:"OLDALE TOWN",edges:[{x:0,y:0}]}]},exit_reach:{foot:{width:1,height:1,rows:["8"]},warps:[],connections:[{direction:"NORTH",offset:0,destination:[0,10],reach:"foot"}]}};
const topology=state.topology,reach=state.exit_reach,connection=state.topology?.connections[0];if(topology==null||reach===undefined||connection===undefined)throw new Error("missing fixture geometry");
async function run(enabled:boolean|undefined,s=state){
 const press={name:"press",executeChecked:()=>Promise.reject(new Error("no input expected"))} as unknown as CheckedPressTool;
 const observe={name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"observed"}],details:{state:s}})} as unknown as AgentTool;
 const f={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"navigate-already-here-v1":true,"connection-edge-tiles-v1":true,"exit-reachability-v1":true,"boundary-crossing-facts-v1":enabled??false};
 const tool=withNavigation([press,observe],f,{read:()=>Promise.resolve(s)}).find(t=>t.name==="navigate_to");if(tool===undefined)throw new Error("missing navigation");
 return tool.execute("model",{x:0,y:0,map_id:[0,16]});
}
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.map(c=>c.text??"").join("\n");
it("production already-here result states the current verified edge direction and delivered destination without input",async()=>{
 expect(text(await run(true))).toContain("press UP to walk off the map NORTH to OLDALE TOWN (map 0/10)");
});
it("OFF exactly preserves incumbent result",async()=>{expect(await run(false)).toEqual(await run(undefined));expect(text(await run(false))).not.toContain("press UP");});
it.each(["blocked","unknown reach","unknown edge","not edge","trigger","dialogue"])("withholds a crossing instruction with %s",async which=>{
 let s:GameStateSnapshot=state;
 if(which==="blocked")s={...state,exit_reach:{...reach,connections:[{direction:"NORTH",offset:0,destination:[0,10],reach:"none"}]}};
 if(which==="unknown reach"){const {exit_reach:_reach,...without}=state;expect(_reach).toBeDefined();s=without;}
 if(which==="unknown edge")s={...state,topology:{...topology,connections:[{direction:"NORTH",offset:0,destination:[0,10],destination_name:"OLDALE TOWN"}]}};
 if(which==="not edge")s={...state,topology:{...topology,connections:[{...connection,edges:[{x:1,y:0}]}]}};
 if(which==="trigger")s={...state,world_context:{objects:[],dialogue:null,triggers:[{x:0,y:0,elevation:3,variable:0x4000,required_value:1,current_value:1,condition_met:true,script_pointer:1}]}};
 if(which==="dialogue")s={...state,world_context:{objects:[],triggers:[],dialogue:"Wait!"}};
 expect(text(await run(true,s))).not.toContain("press UP");
});
