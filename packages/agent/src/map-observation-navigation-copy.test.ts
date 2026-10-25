import {expect,it} from "vitest";
import {Type} from "typebox";
import {flagFeatures} from "./play-preset.js";
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
