import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {HarnessTrust} from "./harness-trust.js";
import {parseGameState} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {featureInfo} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import {trustOptions} from "./play-wiring.js";
import type {Place} from "./story-destinations.js";

const ID="story-line-done-on-event-v1";
const place=(display:string,map_id:[number,number]):Place=>({display,name:display,map_id,warps:[],connections:[]});
const PYRE:[number,number]=[24,15],SUMMIT:[number,number]=[24,22],ROUTE:[number,number]=[0,36],TOWN:[number,number]=[0,5];
const PLACES:readonly Place[]=[place("MT PYRE 1F",PYRE),place("MT PYRE SUMMIT",SUMMIT),place("ROUTE 122",ROUTE),place("LILYCOVE CITY",TOWN)];
const ADVANCE={tool:"press",requested:[],sent:[],dropped:[],auto_presses:0,stop:"field_free",detail:"",duration_ms:1};
let seq=0;
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-11-05T12:00:00.000-05:00",seq:++seq,...body});
const body=(map:[number,number])=>({...IN_GAME,started:true,screen:"overworld",location:"X",map_id:map,position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[]});
const QUOTE="We're to move out to MT. PYRE!";
function trust(on:boolean):HarnessTrust {
 const t=new HarnessTrust({supervisor:false,activity:true,retireLab:true,stageBound:true,omitEmptyGoal:true,goalOnce:false,retireReached:true,unnamedPlaces:true,doneOnEvent:on});
 t.observe(event({type:"state",turn:147,...body(ROUTE)}));
 t.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:147,tool_call_id:"c",pages:[{text:QUOTE,speaker:null,speaker_source:null,map:"ROUTE122",position:null,map_id:[...ROUTE],state_seq:seq}]}));
 t.observe(event({type:"tool_result",turn:147,id:"c",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 t.observe(event({type:"state",turn:181,...body(PYRE)}));
 return t;
}
const milestone=(name:string,kind:string,turn=182,origin="observed")=>event({type:"milestone",turn,name,server_timestamp:0,kind,origin});
const header=(t:HarnessTrust,map:[number,number]):string=>t.lines("body",parseGameState(body(map)),"z",PLACES,false,"body").header;

it("off: a place milestone on the arrival retires the line, as before",()=>{
 const t=trust(false);t.observe(milestone("MT_PYRE","navigation"));
 expect(header(t,PYRE)).not.toContain(QUOTE);
});
it("on: a place reached is not an event, so the line stays while the player climbs",()=>{
 const t=trust(true);t.observe(milestone("MT_PYRE","navigation"));
 expect(header(t,PYRE)).toContain(QUOTE);
 t.observe(event({type:"state",turn:253,...body(SUMMIT)}));t.observe(milestone("MT_PYRE_SUMMIT","navigation",253));
 expect(header(t,SUMMIT)).toContain(QUOTE);
});
it("on: a story event at the place retires the line",()=>{
 const t=trust(true);t.observe(event({type:"state",turn:253,...body(SUMMIT)}));t.observe(milestone("MAGMA_EMBLEM_RECEIVED","story",272));
 expect(header(t,SUMMIT)).not.toContain(QUOTE);
});
it("on: a story event elsewhere after the player left retires it, and it stays retired on return",()=>{
 const t=trust(true);t.observe(event({type:"state",turn:190,...body(TOWN)}));t.observe(milestone("DEVON_SCOPE_RECEIVED","story",191));
 expect(header(t,TOWN)).not.toContain(QUOTE);
 t.observe(event({type:"state",turn:200,...body(PYRE)}));
 expect(header(t,PYRE)).not.toContain(QUOTE);
});
it("on: a story step from before the arrival does not count",()=>{
 const t=new HarnessTrust({supervisor:false,activity:true,retireLab:true,stageBound:true,omitEmptyGoal:true,goalOnce:false,retireReached:true,unnamedPlaces:true,doneOnEvent:true});
 t.observe(event({type:"state",turn:147,...body(ROUTE)}));
 t.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:147,tool_call_id:"c",pages:[{text:QUOTE,speaker:null,speaker_source:null,map:"ROUTE122",position:null,map_id:[...ROUTE],state_seq:seq}]}));
 t.observe(event({type:"tool_result",turn:147,id:"c",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 t.observe(milestone("DEVON_SCOPE_RECEIVED","story",150));
 t.observe(event({type:"state",turn:181,...body(PYRE)}));
 expect(header(t,PYRE)).toContain(QUOTE);
});
it("on: a line heard at the place retires on the next story event there; off it never does",()=>{
 const said=(on:boolean):HarnessTrust=>{
  const t=new HarnessTrust({supervisor:false,activity:true,retireLab:true,stageBound:true,omitEmptyGoal:true,goalOnce:false,retireReached:true,unnamedPlaces:true,doneOnEvent:on});
  t.observe(event({type:"state",turn:181,...body(PYRE)}));
  t.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:182,tool_call_id:"c",pages:[{text:"MAY: Meet me at MT. PYRE, the RED ORB is here.",speaker:"MAY",speaker_source:"name_prefix",map:"MT PYRE 1F",position:null,map_id:[...PYRE],state_seq:seq}]}));
  t.observe(event({type:"tool_result",turn:182,id:"c",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
  t.observe(milestone("MAGMA_EMBLEM_RECEIVED","story",190));
  return t;
 };
 expect(header(said(false),PYRE)).toContain("RED ORB");
 expect(header(said(true),PYRE)).not.toContain("RED ORB");
});
it("the production options carry the switch",()=>{
 const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(trustOptions({...off,[ID]:true}).doneOnEvent).toBe(true);
 expect(trustOptions({...off,[ID]:false}).doneOnEvent).toBe(false);
});
it("registers with an Off clause",()=>{
 expect(featureInfo(ID).description).toContain(" Off: ");
});
