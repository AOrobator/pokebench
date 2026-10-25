import {expect,it} from "vitest";
import {Value} from "typebox/value";
import {MapObservationSchema} from "./map-observation.generated.js";
import {parseGameState} from "./game-state.js";
import {parseEvent} from "./events.js";

const oldState={screen:"overworld",started:true,name:"A",location:"FORTREE CITY GYM",map_id:[12,1],position:{x:0,y:0},facing:"up",in_battle:false,party:[],money:0,badges:[],play_time_s:0};
const observation={version:1,map_id:[12,1],origin:[0,0],width:2,height:1,elements:[{kind:"rotating_gate",x:0,y:0,state:"arm",group:"gate:0",edge:[0,0,1,0]}],unavailable:[]};

it("carries the versioned current-map elements through the production state parser",()=>{
 const map={version:1,map_id:[12,1],origin:[0,0],width:2,height:1,elements:[{kind:"rotating_gate",x:0,y:0,state:"arm",group:"gate:0",edge:[0,0,1,0]}],unavailable:[]};
 expect(Value.Check(MapObservationSchema,map)).toBe(true);
 const state=parseGameState({screen:"overworld",started:true,name:"A",location:"FORTREE CITY GYM",map_id:[12,1],position:{x:0,y:0},facing:"up",in_battle:false,party:[],money:0,badges:[],play_time_s:0,map_observation:map});
 expect(state.map_observation).toEqual(map);
 expect(Value.Check(MapObservationSchema,{...map,version:2})).toBe(false);
 expect(Value.Check(MapObservationSchema,{...map,elements:[{...map.elements[0],direction:"diagonal"}]})).toBe(false);
});

it("preserves old state and recording payloads without synthesizing missing map observations",()=>{
 const state=Object.freeze({...oldState});
 const parsed=parseGameState(state);
 expect(parsed).toBe(state);
 expect(parsed).not.toHaveProperty("map_observation");
 const old={v:1,run:"historical-map",seq:1,t:"2026-10-25T13:00:00.000-04:00",turn:1,type:"state",...oldState};
 expect(parseEvent(JSON.stringify(old))).toEqual(old);
 const current={...old,map_observation:observation};
 expect(parseEvent(JSON.stringify(current))).toEqual(current);
});

it("rejects unsupported map fields through the real state parser",()=>{
 for(const patch of [{kind:"invented_route"},{direction:"diagonal"},{orientation:4},{edge:[0,0,1]},{predicted_switch_effect:"open every door"}]){
  expect(()=>parseGameState({...oldState,map_observation:{...observation,elements:[{...observation.elements[0],...patch}]}})).toThrow("malformed /pokebench/state");
 }
 expect(()=>parseGameState({...oldState,map_observation:{...observation,version:2}})).toThrow("malformed /pokebench/state");
});
