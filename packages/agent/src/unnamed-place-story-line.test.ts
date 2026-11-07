import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {HarnessTrust,goalLine} from "./harness-trust.js";
import {parseGameState} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {featureInfo} from "./features.js";
import {StoryDestinations,type Place} from "./story-destinations.js";

const place=(display:string,map_id:[number,number]):Place=>({display,name:display,map_id,warps:[],connections:[]});
const PLACES:readonly Place[]=[place("MT. PYRE",[24,15]),place("ROUTE 121",[0,36]),place("EVER GRANDE CITY",[0,8])];
const ROUTE121=[0,36] as const;
let seq=0;
const ADVANCE={tool:"press",requested:[],sent:[],dropped:[],auto_presses:0,stop:"field_free",detail:"",duration_ms:1};
const PAGE={map:"ROUTE121",position:null};
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-11-05T12:00:00.000-05:00",seq:++seq,...body});
function heard(s:StoryDestinations,turn:number,text:string,speaker:string|null=null,source:string|null=null,map:readonly [number,number]=ROUTE121):void {
 const id=`c${String(turn)}`;
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn,tool_call_id:id,pages:[{...PAGE,text,speaker,speaker_source:source,map_id:[...map],state_seq:seq}]}));
 s.observe(event({type:"tool_result",turn,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
}
const story=(on:boolean)=>new StoryDestinations(false,true,false,false,false,false,false,false,on);
const goal=(s:StoryDestinations)=>s.goal([0,36],null,"none",PLACES);
const line=(s:StoryDestinations)=>goalLine(goal(s),PLACES,true);

it("off: a line from no named character does not become the Story goal",()=>{
 const s=story(false);
 heard(s,146,"Okay!\nWe're to move out to MT. PYRE!");
 expect(goal(s)).toBeNull();
});

it("on: the whole line becomes the Story goal, labelled as the game showed it",()=>{
 const s=story(true);
 heard(s,146,"Okay!\nWe're to move out to MT. PYRE!");
 expect(line(s)).toContain('Story goal: "Okay! We\'re to move out to MT. PYRE!" (no speaker shown, turn 146)');
});

it("on: a faced sprite's line carries its sprite kind, never a name",()=>{
 const s=story(true);
 heard(s,150,"The boss went to MT. PYRE.","AQUA_MEMBER_M","faced_sprite");
 expect(line(s)).toContain("(AQUA_MEMBER_M sprite, turn 150)");
});

it("on: with no speaker, the sprite kinds on screen are listed as what the game shows",()=>{
 const s=story(true),id="o";
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:146,tool_call_id:id,pages:[{...PAGE,text:"We're to move out to MT. PYRE!",speaker:null,speaker_source:null,map_id:[0,36],state_seq:1,on_screen:[{local_id:1,graphics_id:9,sprite_kind:"AQUA_MEMBER_M",x:1,y:1,character:null},{local_id:2,graphics_id:9,sprite_kind:"AQUA_MEMBER_M",x:2,y:1,character:null}]}]}));
 s.observe(event({type:"tool_result",turn:146,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 expect(line(s)).toContain("(no speaker shown; on screen: AQUA_MEMBER_M, turn 146)");
});

it("on: a newer line replaces an older one and an older never returns",()=>{
 const s=story(true);
 heard(s,140,"Head for EVER GRANDE CITY.");
 heard(s,146,"We're to move out to MT. PYRE!");
 expect(line(s)).toContain("turn 146");
});

it("on: signs, PokéNav registrations, lines with no known place and lines naming where they were heard are skipped",()=>{
 const s=story(true);
 heard(s,10,"ROUTE 121 ← MT. PYRE",null,"faced_target");
 heard(s,11,"Registered BEAUTY JESSICA\nin the POKéNAV.");
 heard(s,12,"Have you been to the SECRET LAIR?");
 heard(s,13,"This is ROUTE 121.");
 expect(goal(s)).toBeNull();
});

it("on: a trainer's challenge and a PokéNav call are not leads",()=>{
 const s=story(true),id="t";
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:7,tool_call_id:id,pages:[{...PAGE,text:"MT. PYRE… Will your POKéMON sleep?",speaker:"HEX_MANIAC",speaker_source:"faced_sprite",map_id:[0,36],state_seq:1},{...PAGE,text:"HEX MANIAC LEAH\nwould like to battle!",speaker:null,speaker_source:null,map_id:[0,36],state_seq:2}]}));
 s.observe(event({type:"tool_result",turn:7,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 heard(s,8,"… … … Beep! ROXANNE: Come to MT. PYRE.");
 expect(goal(s)).toBeNull();
});

it("on: a printed name prefix keeps the name as printed, without calling it a sprite",()=>{
 const s=story(true);
 heard(s,20,"REPORTER: Meet me in MT. PYRE.","REPORTER","name_prefix");
 expect(line(s)).toContain("(REPORTER, turn 20)");
});

it("on: a page from a PokéNav call is not a lead, however its speaker is shown",()=>{
 const s=story(true),id="n";
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:30,tool_call_id:id,pokenav_buttons:["A"],pages:[{...PAGE,text:"JESSICA: See you at MT. PYRE.",speaker:"JESSICA",speaker_source:"name_prefix",map_id:[0,36],state_seq:1}]}));
 s.observe(event({type:"tool_result",turn:30,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 expect(goal(s)).toBeNull();
});

it("on: a two-trainer challenge, split over pages, is not a lead",()=>{
 const s=story(true),id="d";
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:526,tool_call_id:id,pages:[{...PAGE,text:"MT. PYRE… Will your POKéMON sleep?",speaker:"HEX_MANIAC",speaker_source:"faced_sprite",map_id:[0,36],state_seq:1},{...PAGE,text:"HEX MANIAC KINDRA and\nCOLLECTOR ED",speaker:null,speaker_source:null,map_id:[0,36],state_seq:2},{...PAGE,text:"want to battle!",speaker:null,speaker_source:null,map_id:[0,36],state_seq:3}]}));
 s.observe(event({type:"tool_result",turn:526,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 expect(goal(s)).toBeNull();
});

it("on: battle text is no one's line",()=>{
 const s=story(true);
 const id="b";
 s.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:5,tool_call_id:id,pages:[{...PAGE,text:"We're off to MT. PYRE!",speaker:null,speaker_source:null,map_id:[0,36],state_seq:1,battle_turn:1}]}));
 s.observe(event({type:"tool_result",turn:5,id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 expect(goal(s)).toBeNull();
});

it("registers the switch off by default, needing story destinations' owner",()=>{
 expect(featureInfo("unnamed-place-story-line-v1").description).toContain(" Off: ");
});

// no-open-story-goal-v1: a reached or done goal says plainly that no story goal is open.
const reachedGoal=(s:StoryDestinations)=>{const g=s.goal([24,15],null,"none",PLACES),target=PLACES[0];if(g===null||target===undefined)throw new Error("no goal");return {...g,reached:[{target,turn:277,entered:true}]};};
const heardThenArrived=()=>{const s=new StoryDestinations(false,true,false,false,false,false,false,false,true);heard(s,272,"The RED ORB preserved at MT. PYRE…",null,null,[24,22]);return s;};
it("no open goal off: a reached line prints as it does today",()=>{
 const line=goalLine(reachedGoal(heardThenArrived()),PLACES,true);
 expect(line.startsWith("Story line heard (")).toBe(true);
});
it("no open goal on: a reached line says plainly that none is open and keeps its evidence line",()=>{
 const line=goalLine(reachedGoal(heardThenArrived()),PLACES,true,undefined,false,false,true);
 expect(line.split("\n")[0]).toBe("Story goal: none open (latest line reached).");
 expect(line.split("\n")[1]?.startsWith("Story line heard (")).toBe(true);
});
it("no open goal on: a done line says so plainly",()=>{
 const g={...reachedGoal(heardThenArrived()),done:true,doneReason:"Pokédex received"};
 expect(goalLine(g,PLACES,true,undefined,false,false,true)).toBe("Story goal: none open (latest line done).");
});
it("no open goal on: an open goal is unchanged",()=>{
 const s=story(true);heard(s,146,"We're to move out to MT. PYRE!");
 expect(goalLine(goal(s),PLACES,true,undefined,false,false,true)).toBe(goalLine(goal(s),PLACES,true));
});
it("registers no-open-story-goal-v1 with an Off clause",()=>{
 expect(featureInfo("no-open-story-goal-v1").description).toContain(" Off: ");
});

// The real header path, with the recipe's options.
function header(noOpenGoal:boolean,step:boolean,seen="body"):string {
 const t=new HarnessTrust({supervisor:false,activity:true,retireLab:true,stageBound:true,omitEmptyGoal:true,goalOnce:true,retireReached:true,unnamedPlaces:true,noOpenGoal});
 const body=(map:[number,number])=>({...IN_GAME,started:true,screen:"overworld",location:"X",map_id:map,position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[]});
 t.observe(event({type:"state",turn:272,...body([24,22])}));
 t.observe(event({...ADVANCE,type:"dialogue_auto_advance",turn:272,tool_call_id:"c",pages:[{...PAGE,text:"ARCHIE: The RED ORB preserved at MT. PYRE",speaker:"ARCHIE",speaker_source:"name_prefix",map_id:[24,22],state_seq:seq}]}));
 t.observe(event({type:"tool_result",turn:272,id:"c",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 t.observe(event({type:"state",turn:277,...body([24,15])}));
 if(step)t.observe(event({type:"milestone",turn:300,name:"MAGMA_EMBLEM_RECEIVED",server_timestamp:0,kind:"story",origin:"observed"}));
 return t.lines("body",parseGameState(body([24,15])),"z",PLACES,false,seen).header;
}
it("no open goal, through the header: a reached line prints the plain line above it",()=>{
 expect(header(false,false)).not.toContain("none open");
 expect(header(true,false)).toContain("Story goal: none open (latest line reached).\nStory line heard (ARCHIE");
});
it("no open goal, through the header: a done line prints the plain line alone, with no retired quote",()=>{
 expect(header(false,true)).not.toContain("Story goal");
 const on=header(true,true);
 expect(on).toContain("Story goal: none open (latest line done).");
 expect(on).not.toContain("RED ORB");
});
it("no open goal, through the header: a repeated story block does not drop the plain line",()=>{
 const block='Latest story line naming a place (turn 272, ARCHIE): "The RED ORB preserved at MT. PYRE"';
 expect(header(true,false,block)).toContain("Story goal: none open (latest line reached).");
});

