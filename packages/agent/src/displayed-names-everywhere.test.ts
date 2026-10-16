import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {DialogueLog,roomKey,roomOf} from "./dialogue-log.js";
import {NavigationMemory} from "./navigation-memory.js";
import {pressResult} from "./press-result.js";

// displayed-place-names-v1, cook #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02): the readout named the house by its sign
// while the press result (seq 2314) and dialogue pages (seq 2378) kept the map constant. The JSON location stays
// the source name; location_display exists only when the switch names the current map.
const RAW="LITTLEROOT TOWN MAYS HOUSE 1F",SHOWN="PROF. BIRCH'S HOUSE 1F";
const town:GameStateSnapshot={...IN_GAME,screen:"overworld",field_controls_locked:false,location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:14,y:9},facing:"up"};
const house:GameStateSnapshot={...town,location:RAW,location_display:SHOWN,map_id:[1,2],position:{x:2,y:8},field_controls_locked:true};
const event=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"names-test",t:"2026-10-16T02:27:00.000-04:00",turn,seq,...body});

it("names the warp destination by its displayed name in the press result (seq 2314)",()=>{
 expect(pressResult(town,house,["UP"])).toBe(`warped during this press: LITTLEROOT TOWN [map 0/9] (14,9) -> ${SHOWN} [map 1/2] (2,8)`);
 const {location_display:_,...off}=house;
 expect(pressResult(town,off,["UP"])).toBe(`warped during this press: LITTLEROOT TOWN [map 0/9] (14,9) -> ${RAW} [map 1/2] (2,8)`);
});

it("shows the displayed room name while identity stays on the source name and map id",()=>{
 expect(roomOf(house,ALL_ON)).toBe(`${SHOWN} (map 1/2)`);
 expect(roomOf({location:RAW,map_id:[1,2]},ALL_ON)).toBe(`${RAW} (map 1/2)`);
 expect(roomKey(house)).toBe(`${RAW}|1/2`);
});

it("files auto-advance pages under the displayed room so recall_dialogue's room filter finds them (seq 2378)",()=>{
 const log=new DialogueLog(ALL_ON);
 const page={state_seq:2340,map:RAW,map_display:SHOWN,map_id:[1,2],position:{x:2,y:8},speaker:"WOMAN_4",speaker_source:"faced_sprite",text:"Our daughter is upstairs, I think."};
 log.observe(event({type:"dialogue_auto_advance",tool_call_id:"d",tool:"press",requested:["DOWN"],sent:["DOWN"],dropped:[],auto_presses:6,pages:[page],stop:"field_free",detail:"closed",duration_ms:5},2376));
 log.observe(event({type:"tool_result",id:"d",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]},2378));
 expect(log.entries().map(e=>[e.room,e.key])).toEqual([[`${SHOWN} (map 1/2)`,`${RAW}|1/2`]]);
});

it("remembers navigation rooms by the displayed name",()=>{
 const memory=new NavigationMemory(ALL_ON);
 const state=event({type:"state",...house,started:true,world_context:{objects:[],triggers:[],dialogue:"Our daughter is upstairs, I think."}},1);
 if(state.type!=="state"||!("started" in state))throw Error("fixture");
 memory.delivered(state);
 expect(memory.text()).toContain(SHOWN);expect(memory.text()).not.toContain("MAYS HOUSE");
});
