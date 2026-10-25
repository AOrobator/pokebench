import {expect,it} from "vitest";
import {Value} from "typebox/value";
import {MapObservationSchema} from "./map-observation.generated.js";
import {parseGameState} from "./game-state.js";

it("carries the versioned current-map elements through the production state parser",()=>{
 const map={version:1,map_id:[12,1],origin:[0,0],width:2,height:1,elements:[{kind:"rotating_gate",x:0,y:0,state:"arm",group:"gate:0",edge:[0,0,1,0]}],unavailable:[]};
 expect(Value.Check(MapObservationSchema,map)).toBe(true);
 const state=parseGameState({screen:"overworld",started:true,name:"A",location:"FORTREE CITY GYM",map_id:[12,1],position:{x:0,y:0},facing:"up",in_battle:false,party:[],money:0,badges:[],play_time_s:0,map_observation:map});
 expect(state.map_observation).toEqual(map);
 expect(Value.Check(MapObservationSchema,{...map,version:2})).toBe(false);
 expect(Value.Check(MapObservationSchema,{...map,elements:[{...map.elements[0],direction:"diagonal"}]})).toBe(false);
});
