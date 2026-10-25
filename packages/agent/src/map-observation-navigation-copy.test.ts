import {expect,it} from "vitest";
import {Type} from "typebox";
import {flagFeatures} from "./play-preset.js";
import {blockedBatchResult} from "./blocked-batch.js";
import {VisitedTerrain} from "./visited-terrain.js";
import {toolSwitches} from "./play-config.js";
import {withNavigation} from "./navigation.js";
import type {GameStateSnapshot} from "./game-state.js";

const state:GameStateSnapshot={
 screen:"overworld",started:true,name:"A",location:"ROUTE110 TRICK HOUSE PUZZLE8",
 map_id:[29,10],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,
 navigation_grid:{elevation:3,tiles:[{x:0,y:0,collision:0,elevation:3,behavior:0},{x:1,y:0,collision:0,elevation:3,behavior:0x48}],objects:[],warps:[]},
 map_observation:{version:1,map_id:[29,10],origin:[0,0],width:2,height:1,elements:[{kind:"slippery_floor",x:1,y:0}],unavailable:[]},
};

async function refused(on:boolean){
 let inputs=0;
 const observed=()=>({content:[{type:"text" as const,text:"observed"}],details:{state}});
 const observe={name:"observe",label:"Observe",description:"Read the current fixture",parameters:Type.Object({}),execute:()=>Promise.resolve(observed())};
 const input=()=>{inputs++;throw new Error("Unsupported terrain must not submit an input");};
 const press={...observe,name:"press",execute:input,executeChecked:input};
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"navigation-refusal-reasons-v1":true,"field-move-gates-v1":true,"walkable-floor-v1":true,"map-observability-v1":on};
 const navigate=withNavigation([observe,press],features,{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to");
 if(navigate===undefined)throw new Error("Missing production navigation tool");
 const result=await navigate.execute("copy",{x:1,y:0,map_id:[29,10]});
 expect(inputs).toBe(0);
 return result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
}

it("uses the same slippery-floor identity as the map while preserving legacy OFF refusal bytes",async()=>{
 const legacy="Navigation: (1,0) is a spin tile that forces movement; navigate_to does not cross it, not a walkable tile; the nearest walkable tile navigate_to can reach is (0,0); 0 ordinary button attempts.\nobserved";
 expect(await refused(false)).toBe(legacy);
 expect(await refused(true)).toBe(legacy.replace("spin tile","slippery floor"));
});

const facts={position:true,liveMap:true,mapObservability:true};
const stopped=(snapshot:GameStateSnapshot,on=true,elevation=false)=>blockedBatchResult(snapshot,snapshot,["RIGHT","RIGHT"],{...facts,mapObservability:on,elevation});

it("describes a shown rotating edge without asserting that it caused the stopped input",()=>{
 const gate:GameStateSnapshot={...state,map_observation:{...state.map_observation!,elements:[{kind:"rotating_gate",x:0,y:0,orientation:0,edge:[1,0,0,0]}]}};
 const legacy="no movement: RIGHT ×2 did not move you; you are still at (0,0) facing right. The readout shows nothing blocking the tile to the right, (1,0); what stopped you is not known.";
 expect(stopped(gate,false)).toBe(legacy);
 expect(stopped(gate)).toBe("no movement: RIGHT ×2 did not move you; you are still at (0,0) facing right. The current map shows a rotating gate arm across this edge; whether it stopped this input is unverified.");
 expect(stopped({...gate,map_observation:{...gate.map_observation!,map_id:[0,0]}})).toBe(legacy);
 expect(stopped({...gate,map_observation:{...gate.map_observation!,elements:[{kind:"rotating_gate",x:0,y:0,edge:[0,0,0,1]}]}})).toBe(legacy);
});

it("uses the displayed current-level token and retains exact legacy elevation copy OFF",()=>{
 const raised:GameStateSnapshot={...state,running:{avatar_flags:1},navigation_grid:{...state.navigation_grid!,tiles:state.navigation_grid!.tiles.map(tile=>({...tile,elevation:tile.x===1?4:3}))},map_observation:{...state.map_observation!,elements:[{kind:"other_level",x:1,y:0,state:"4"}]}};
 const legacy="blocked: RIGHT ×2 did not move you; you are still at (0,0) facing right. The tile to the right, (1,0), is at elevation 4 while you are at elevation 3 (L on the local map), and the game refuses a step onto a tile at another elevation, so RIGHT cannot move you from here.";
 expect(stopped(raised,false,true)).toBe(legacy);
 expect(stopped(raised)).toBe(legacy.replace("L on the local map","Lv:4 on the current map"));
 expect(stopped({...raised,map_observation:{...raised.map_observation!,map_id:[0,0]}})).not.toContain("Lv:");
});

it("labels combined visited terrain as coarse history without changing its navigation state",()=>{
 const old=new VisitedTerrain(),current=new VisitedTerrain(true);
 old.delivered(state);current.delivered(state);
 expect(current.navigationState(state)).toEqual(old.navigationState(state));
 expect(old.text(state)).not.toContain("Coarse historical");
 expect(current.text(state)).toBe(`${old.text(state)?.replace("Visited terrain on map","Coarse historical terrain memory on map").replace(". clear;",". collision-clear;")}\nCoarse historical terrain memory: tiles retain their last observed geometry and can be stale. This view omits switches, doors, rotating gate arms and other element states; . means collision-clear geometry, not ordinary floor. Use the current map observation for current element state.`);
});

it("wires observation copy to the map feature independently of old elevation overlays",()=>{
 const features=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(toolSwitches({...features,"map-observability-v1":true,"elevation-aware-map-v1":false})).toMatchObject({mapObservability:true,elevation:false});
 expect(toolSwitches({...features,"map-observability-v1":false})).toMatchObject({mapObservability:false});
});
