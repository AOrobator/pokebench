import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {HarnessTrust} from "./harness-trust.js";
import {flagFeatures} from "./play-preset.js";
import {trustOptions} from "./play-wiring.js";
import type {Place} from "./story-destinations.js";

it("keeps a native warp visible but removes the route claim across an elevation boundary",()=>{
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),
  "semantic-navigation-v2":true,"elevation-transitions-v1":true,"walkable-floor-v1":true,
  "full-map-navigation-v1":false,"visited-terrain-navigation-v1":false};
 const places:Place[]=[
  {map_id:[24,44],name:"VictoryRoad_B1F",display:"VICTORY ROAD B1F",warps:[{x:2,y:0,to:[24,43]}],connections:[]},
  {map_id:[24,43],name:"VictoryRoad_1F",display:"VICTORY ROAD 1F",warps:[],connections:[]},
 ];
 const snapshot=(elevation:number):GameStateSnapshot=>({...IN_GAME,field_controls_locked:false,map_id:[24,44],position:{x:0,y:0},
  navigation_grid:{elevation:3,objects:[],warps:[{x:2,y:0}],tiles:[
   {x:0,y:0,elevation:3,collision:0,behavior:0},
   {x:1,y:0,elevation,collision:0,behavior:0},
   {x:2,y:0,elevation:3,collision:0,behavior:0},
  ]},
  interaction_targets:[{x:2,y:0,kind:"warp",elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[24,43,0]}],
  exit_reach:{foot:{width:3,height:1,rows:["e"]},warps:[{x:2,y:0,reach:"foot"}],connections:[]},
 });
 const header=(state:GameStateSnapshot,on:boolean)=>new HarnessTrust(trustOptions({...features,"verified-warp-reach-v1":on})).lines("",state,"read",places).header;
 expect(header(snapshot(4),false)).toContain("Exits you can walk to from where you stand: (2,0) [navigate_to_target");
 expect(header(snapshot(4),true)).toContain("Known warps without a verified route from this tile: (2,0)");
 expect(header(snapshot(4),true)).not.toContain("[navigate_to_target");
 expect(header(snapshot(3),true)).toContain("Exits you can walk to from where you stand: (2,0) [navigate_to_target");
});
