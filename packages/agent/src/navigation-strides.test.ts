import {expect,it} from "vitest";
import {planStride} from "./navigation.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
const tiles=Array.from({length:12},(_,x)=>({x,y:0,collision:0,behavior:0,elevation:3}));
const grid={elevation:3,tiles,objects:[],warps:[]};
const state:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},navigation_grid:grid};
it("plans an explicit bounded straight corridor, ending before a bend or the requested goal",()=>{
 expect(planStride(state,["RIGHT","RIGHT","RIGHT","UP"],{mode:"local"})?.path).toEqual([{x:1,y:0},{x:2,y:0},{x:3,y:0}]);
 expect(planStride(state,Array.from({length:11},()=>"RIGHT"),{mode:"local"})?.path).toHaveLength(8);
 expect(planStride(state,["RIGHT"],{mode:"local"})?.path).toEqual([{x:1,y:0}]);
});
it("splits before grass, elevation changes, objects, warps, triggers and missing geometry",()=>{
 for(const behavior of [2,3,0x3b,0x60,0x69,0x30])expect(planStride({...state,navigation_grid:{...grid,tiles:tiles.map(t=>t.x===2?{...t,behavior}:t)}},["RIGHT","RIGHT","RIGHT"],{})?.path).toEqual([{x:1,y:0}]);
 for(const change of [{objects:[{x:2,y:0}],warps:[]},{objects:[],warps:[{x:2,y:0}]}])expect(planStride({...state,navigation_grid:{...grid,...change}},["RIGHT","RIGHT","RIGHT"],{})?.path).toEqual([{x:1,y:0}]);
 expect(planStride(state,["RIGHT","RIGHT"],{triggers:[{x:2,y:0,elevation:3,variable:1,required:0,current:0}]})?.path).toEqual([{x:1,y:0}]);
 expect(planStride({...state,navigation_grid:{...grid,tiles:tiles.map(t=>t.x===2?{...t,elevation:0}:t)}},["RIGHT","RIGHT"],{})?.path).toEqual([{x:1,y:0}]);
 expect(planStride({...state,navigation_grid:null},["RIGHT"],{})).toBeNull();
 expect(planStride(state,[],{})).toBeNull();
});
