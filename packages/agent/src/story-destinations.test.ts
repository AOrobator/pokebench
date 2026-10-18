import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {PlacesBodySchema,STORY_HEADER,StoryDestinations,headsOf,placePhrases,withStoryDestinations,type PlacesBody} from "./story-destinations.js";
import {playGameTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {StateWatcher,parseGameState,type GameStateSnapshot} from "./game-state.js";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {Value} from "typebox/value";
import {experimentArms,parseExperiment} from "./experiments.js";

interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa"|"sh02",Recording>;
// The game's own map table, as GET /pokebench/places serves it, read from the Emerald ROM
// (env/pokebench_env/places.py) for a male player named RAED.
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
const SH02:RunEvent[]=RECORDED.sh02.events.map(e=>checkEvent(e));
type StateEvent=Extract<RunEvent,{type:"state";started:boolean}>;
type ToolResultEvent=Extract<RunEvent,{type:"tool_result"}>;
function snapshot(e:StateEvent):GameStateSnapshot {
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
}
const stateAt=(events:readonly RunEvent[],seq:number)=>{const e=events.find(x=>x.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error(`no state ${String(seq)}`);return snapshot(e);};
const resultAt=(events:readonly RunEvent[],turn:number)=>{const e=events.find((x):x is ToolResultEvent=>x.type==="tool_result"&&x.turn===turn);if(e===undefined)throw Error(`no result ${String(turn)}`);return e;};
function replay(story:StoryDestinations,events:readonly RunEvent[],until:number):void {for(const e of events){if(e.seq>until)break;story.observe(e);}}
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
const ON:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"story-destinations-v1":true};

const T272_BLOCK=[
 `${STORY_HEADER} (turn 272, MAY): "Well, it's time to head back to the LAB."`,
 "- \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).",
].join("\n");

// Operator decision 2026-10-17 12:59 PM EDT ("drop it"): the block lists no people; the line is shown only for what it resolves.
const NO_PEOPLE=/spoke the line|named in the line|in the line\)|on this map|readout does not say/;

describe("story-destinations-v1 on recorded runs",()=>{
 it("4caa T272: MAY's \"head back to the LAB\" becomes the lab door in LITTLEROOT TOWN at (7,16), right under the Story line",()=>{
  const story=new StoryDestinations();
  const result=resultAt(CAAA,272);
  replay(story,CAAA,result.seq-1);
  const state=stateAt(CAAA,result.state_seq ?? -1);
  expect(story.block(state,result.id,PLACES.places)).toBe(T272_BLOCK);
  expect(T272_BLOCK).not.toMatch(NO_PEOPLE);
  expect(STORY_HEADER).toBe("Latest story line naming a place");
  const text=story.annotate(result.text,state,result.id,PLACES.places);
  expect(text).toContain(`Story: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met; sent to save Birch; Birch rescue complete; Birch starter handoff complete; Route 103 rival battle won\n${T272_BLOCK}\nPlayer: RAED\n`);
  // Nothing else changes and nothing is clipped.
  expect(text.replace(`${T272_BLOCK}\n`,"")).toBe(result.text);
 });
 it("4caa T273: the next readout (where the model decided the lab was in Rustboro) still names the LAB's door",()=>{
  const story=new StoryDestinations();
  const result=resultAt(CAAA,273);
  replay(story,CAAA,result.seq-1);
  const state=stateAt(CAAA,result.state_seq ?? -1);
  expect(story.block(state,result.id,PLACES.places)).toBe(T272_BLOCK);
 });
 it("4caa T138: PROF. BIRCH's \"come by my POKéMON LAB later\" resolves to the lab, and the cutscene has already put the player in it",()=>{
  const story=new StoryDestinations();
  const result=resultAt(CAAA,138);
  replay(story,CAAA,result.seq-1);
  const state=stateAt(CAAA,result.state_seq ?? -1);
  expect(story.block(state,result.id,PLACES.places)).toBe([
   `${STORY_HEADER} (turn 138, PROF. BIRCH): "This is not the place to chat, so come by my POKéMON LAB later, okay?"`,
   "- \"POKéMON LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). You are in it now.",
  ].join("\n"));
 });
 it("sh02 T74: MOM's \"He lives right next door\" resolves He to PROF. BIRCH and the place to his house's door, not the lab",()=>{
  const story=new StoryDestinations();
  const result=resultAt(SH02,74);
  replay(story,SH02,result.seq-1);
  const state=stateAt(SH02,result.state_seq ?? -1);
  const block=[
   `${STORY_HEADER} (turn 74, MOM): "He lives right next door, so you should go over and introduce yourself."`,
   "- \"He lives\" (He = PROF. BIRCH, the one story character named before it in this conversation) = PROF. BIRCH'S HOUSE 1F (map 1/2). Way in: door in LITTLEROOT TOWN (map 0/9) at (14,8).",
  ].join("\n");
  expect(story.block(state,result.id,PLACES.places)).toBe(block);
  // The T75 navigate_to result (the model headed for "Professor Birch's Lab") shows it again.
  const next=resultAt(SH02,75);
  const later=new StoryDestinations();replay(later,SH02,next.seq-1);
  expect(later.block(stateAt(SH02,next.state_seq ?? -1),next.id,PLACES.places)).toBe(block);
 });
 it("4caa T107: a faced sprite whose graphics is MAY on this map speaks as MAY; a sprite kind with no recorded state is no story speaker",()=>{
  const story=new StoryDestinations();
  const daa=CAAA.find(e=>e.type==="dialogue_auto_advance"&&e.turn===107);
  if(daa?.type!=="dialogue_auto_advance")throw Error("no T107 talk");
  replay(story,CAAA,daa.seq);
  const first=daa.pages.find(p=>p.speaker==="RIVAL_MAY_NORMAL"&&p.state_seq!==null);
  if(first===undefined)throw Error("no sprite page");
  const lab={...first,text:"Well, it's time to head back to the LAB."};
  story.observe(talk("sprite",107,[lab]));story.observe(delivered("sprite",107));
  expect(story.latest("z",headsOf(PLACES.places),"RAED")).toMatchObject({speaker:"MAY",text:"Well, it's time to head back to the LAB."});
  const unknown=new StoryDestinations();
  unknown.observe(talk("sprite",107,[{...lab,state_seq:null}]));unknown.observe(delivered("sprite",107));
  expect(unknown.latest("z",headsOf(PLACES.places),"RAED")).toBeNull();
 });
});

// A synthetic overworld state for rule tests.
function field(map:[number,number],location:string):GameStateSnapshot {
 const result=resultAt(CAAA,272);
 return {...stateAt(CAAA,result.state_seq ?? -1),map_id:map,location};
}
const page=(text:string,speaker:string|null,source:"name_prefix"|"faced_sprite"|"faced_target"|null="name_prefix",state_seq:number|null=null)=>({state_seq,map:"X",map_id:[0,0] as [number,number],position:null,speaker,speaker_source:source,text});
let seq=100000;
function talk(id:string,turn:number,pages:readonly object[]):RunEvent {
 return checkEvent({v:1,run:"2026-10-16T12-42-29_qwen36-gpu0_4caa",seq:seq++,t:"2026-10-16T13:07:12.905-04:00",type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages,stop:"field_free",detail:"d",duration_ms:1});
}
function delivered(id:string,turn:number,is_error=false):RunEvent {
 return checkEvent({v:1,run:"2026-10-16T12-42-29_qwen36-gpu0_4caa",seq:seq++,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn,id,name:"press",is_error,duration_ms:1,text:"pressed A",frames:[]});
}

describe("story-destinations-v1 rules",()=>{
 const oldale=field([0,10],"OLDALE TOWN");
 function after(pages:readonly object[]):string|null {
  const story=new StoryDestinations();story.observe(talk("c",5,pages));story.observe(delivered("c",5));
  return story.block(oldale,"later",PLACES.places);
 }
 it("a connected map is reached by the edge that leads to it, said as this map's edge when it is this one",()=>{
  expect(after([page("MAY: The POKéMON found on ROUTE 103 include…","MAY")])).toContain("- \"ROUTE 103\" = ROUTE103 (map 0/18). Way in: this map's NORTH edge; ROUTE110 (map 0/25) WEST edge; door in ALTERING CAVE (map 24/106) at (");
 });
 it("an ambiguous or unknown name is reported as not resolved, never guessed",()=>{
  const block=after([page("Go to the POKéMON CENTER, then to the GYM.","MOM")]) ?? "";
  expect(block).toMatch(/- "POKéMON CENTER": not resolved: \d+ maps in the game's map table match this name, and the line does not say which\./);
  expect(block).toMatch(/- "GYM": not resolved: \d+ maps in the game's map table match this name, and the line does not say which\./);
  expect(after([page("Learn ROCK TOMB at the SECRET TOMB.","MOM")])).toContain("- \"SECRET TOMB\": not resolved: no map in the game's map table has this name.");
 });
 it("He lives resolves only when exactly one story character was named before it",()=>{
  expect(after([page("WALLY and STEVEN came by.","MOM"),page("He lives right next door.","MOM")])).toContain("- \"He lives\": not resolved: \"He\" could be WALLY or STEVEN.");
  expect(after([page("He lives right next door.","MOM")])).toContain("- \"He lives\": not resolved: no story character is named before it in this conversation.");
  expect(after([page("ROXANNE lives far away.","MOM")])).toContain("- \"ROXANNE lives\": not resolved: no map in the game's map table is named ROXANNE'S HOUSE.");
  // A named owner needs no pronoun: WALLY's house is a map of its own in PETALBURG CITY.
  expect(after([page("WALLY lives far away.","MOM")])).toContain("- \"WALLY lives\" = PETALBURG CITY WALLYS HOUSE (map 8/0). Way in: door in PETALBURG CITY (map 0/0) at (7,5).");
 });
 it("lists no people: a line that only names story characters shows nothing, and a place line shows only its places",()=>{
  expect(after([page("Go see MAY. BRENDAN, WALLY, PROF. BIRCH and STEVEN too.","MOM")])).toBeNull();
  const block=after([page("Go see MAY at the LAB.","MOM")]);
  expect(block).toBe([
   `${STORY_HEADER} (turn 5, MOM): "Go see MAY at the LAB."`,
   "- \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).",
  ].join("\n"));
  expect(block).not.toMatch(NO_PEOPLE);
 });
 it("keeps the latest story line that names something; other speakers, signs and battle text never replace it",()=>{
  const story=new StoryDestinations();
  story.observe(talk("a",3,[page("Head back to the LAB.","MAY")]));story.observe(delivered("a",3));
  story.observe(talk("b",4,[page("If he's not at his LAB, he's likely in the grass.","WOMAN_4","faced_sprite"),page("PROF. BIRCH'S HOUSE","Sign text","faced_target"),{...page("Foe MUDKIP fainted at the GYM!",null,null),battle_turn:1,battle_message_id:1},page("Thanks, honey!","MOM"),page("Welcome to the POKéMON CENTER.",null,null)]));
  story.observe(delivered("b",4));
  expect(story.latest("z")?.text).toBe("Head back to the LAB.");
  // A newer story line that names nothing does not replace it either.
  story.observe(talk("c",6,[page("MOM: Bye, honey!","MOM")]));story.observe(delivered("c",6));
  expect(story.latest("z")?.text).toBe("Head back to the LAB.");
  // Naming only a person no longer makes a line the latest one.
  story.observe(talk("p",6,[page("Go see WALLY.","MOM")]));story.observe(delivered("p",6));
  expect(story.latest("z")?.text).toBe("Head back to the LAB.");
  // A talk whose result failed was never shown, so it does not count.
  story.observe(talk("d",7,[page("Go to OLDALE TOWN.","MOM")]));story.observe(delivered("d",7,true));
  expect(story.latest("z")?.text).toBe("Head back to the LAB.");
  // The call that shows a line counts it before its result is recorded.
  story.observe(talk("e",8,[page("Go to OLDALE TOWN.","MOM")]));
  expect(story.latest("e")?.text).toBe("Go to OLDALE TOWN.");
  expect(story.latest("other")?.text).toBe("Head back to the LAB.");
 });
 it("says plainly when the map table could not be read, and then picks no line at all rather than a looser one",()=>{
  const story=new StoryDestinations();
  story.observe(talk("a",3,[page("Head back to the LAB.","MAY")]));story.observe(delivered("a",3));
  // A newer line with a capitalised run that ends no map's name (round-1 Codex reproducer).
  story.observe(talk("b",4,[page("Thanks, POKéMON TRAINER!","MOM")]));story.observe(delivered("b",4));
  expect(story.block(oldale,"x",PLACES.places)).toContain(`${STORY_HEADER} (turn 3, MAY): "Head back to the LAB."`);
  expect(story.block(oldale,"x",new Error("HTTP 503"))).toBe(`${STORY_HEADER}: not known; the game's map table could not be read (HTTP 503).`);
  // Before any story line there is nothing to say either way.
  expect(new StoryDestinations().block(oldale,"x",new Error("HTTP 503"))).toBeNull();
 });
 it("shows nothing outside a started overworld readout or before any story line, and inserts after Location/Position when there is no Story line",()=>{
  const story=new StoryDestinations();
  expect(story.block(oldale,"x",PLACES.places)).toBeNull();
  story.observe(talk("a",3,[page("Head back to the LAB.","MAY")]));story.observe(delivered("a",3));
  for(const s of [{...oldale,screen:"battle"},{...oldale,in_battle:true},{...oldale,started:false},{...oldale,map_id:null}])expect(story.block(s,"x",PLACES.places)).toBeNull();
  const bare="Screen: overworld\nLocation: OLDALE TOWN\nPosition: X=5, Y=5, facing up\nParty: none";
  expect(story.annotate(bare,oldale,"x",PLACES.places)).toBe(`Screen: overworld\nLocation: OLDALE TOWN\nPosition: X=5, Y=5, facing up\n${story.block(oldale,"x",PLACES.places) ?? ""}\nParty: none`);
  expect(story.annotate("Screen: overworld\nParty: none",oldale,"x",PLACES.places)).toBe("Screen: overworld\nParty: none");
 });
 it("finds place phrases only where the last word ends some map's name",()=>{
  const heads=new Set(["LAB","TOWN","ROUTE103","GYM","CENTER"]);
  expect(placePhrases("MAY: Let's see… The POKéMON found on ROUTE 103 include…",heads)).toEqual(["ROUTE 103"]);
  expect(placePhrases("come\nby my POKéMON LAB later, okay?",heads)).toEqual(["POKéMON LAB"]);
  expect(placePhrases("Look! It's PETALBURG GYM! Maybe DAD will be on!",heads)).toEqual(["PETALBURG GYM"]);
  expect(placePhrases("Well, this is LITTLEROOT TOWN.",heads)).toEqual(["LITTLEROOT TOWN"]);
  expect(placePhrases("I heard about you, RAED, from my dad, PROF. BIRCH.",heads)).toEqual([]);
  expect(placePhrases("the LAB. The LAB!",heads)).toEqual(["LAB"]);
 });
});

type Details={state:GameStateSnapshot|undefined};
function fakeObserve(state:GameStateSnapshot,text:string):AgentTool {
 return {name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text}],details:{state}} satisfies AgentToolResult<Details>)};
}
function fakePress(state:GameStateSnapshot,text:string):CheckedPressTool {
 const result=():Promise<AgentToolResult<Details>>=>Promise.resolve({content:[{type:"text",text}],details:{state}});
 return {name:"press",label:"Press",description:"d",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");

describe("story-destinations-v1 switch",()=>{
 const result=resultAt(CAAA,272);
 const state=stateAt(CAAA,result.state_seq ?? -1);
 const lab=talk("t",272,[page("Well, it's time to head back to\nthe LAB.","MAY")]);
 it("the served map table matches its schema",()=>{expect(Value.Check(PlacesBodySchema,PLACES)).toBe(true);});
 it("OFF hands back the very same tools and subscribes to nothing",async()=>{
  const subs:unknown[]=[];const tools=[fakeObserve(state,result.text),fakePress(state,result.text)];
  const out=withStoryDestinations(tools,OFF,{subscribe:fn=>{subs.push(fn);}},{places:()=>Promise.resolve(PLACES)});
  expect(out).toHaveLength(2);out.forEach((t,i)=>{expect(t).toBe(tools[i]);});
  expect(subs).toHaveLength(0);
  expect(textOf(await out[0]?.execute("x",{}) ?? {content:[],details:undefined})).toBe(`|${result.text}`);
 });
 it("ON adds the block to observe and press results, keeps press checkable, reads the map table once per player and retries after a failure",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];let calls=0;let fail=true;
  const source={places:()=>{calls++;if(fail){fail=false;return Promise.reject(new Error("HTTP 503"));}return Promise.resolve(PLACES);}};
  const other:AgentTool={name:"get_dialogue",label:"g",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Story: x"}],details:undefined})};
  const out=withStoryDestinations([fakeObserve(state,result.text),fakePress(state,result.text),other],ON,{subscribe:fn=>{subs.push(fn);}},source);
  expect(subs).toHaveLength(1);
  // Before any story line: unchanged, and the map table is not read.
  expect(textOf(await out[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${result.text}`);
  expect(calls).toBe(0);
  subs[0]?.(lab);subs[0]?.(delivered("t",272));
  expect(textOf(await out[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain(`${STORY_HEADER}: not known; the game's map table could not be read (HTTP 503).`);
  expect(textOf(await out[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain(T272_BLOCK);
  const press=out[1];
  if(press===undefined||!isCheckedPress(press))throw Error("press lost executeChecked");
  expect(textOf(await press.execute("p",{buttons:["A"]}))).toContain(T272_BLOCK);
  expect(textOf(await press.executeChecked("p",{buttons:["A"]},()=>undefined))).toContain(T272_BLOCK);
  expect(calls).toBe(2);
  // A new player name reads the table again (the player's house is named after the player).
  const renamed=withStoryDestinations([fakeObserve({...state,name:"MAY2"},result.text)],ON,{subscribe:fn=>{subs.push(fn);}},source);
  subs[1]?.(lab);subs[1]?.(delivered("t",272));
  await renamed[0]?.execute("o",{});
  expect(calls).toBe(3);
  expect(out[2]).toBe(other);
  // No map-table reader at all: said plainly.
  const none=withStoryDestinations([fakeObserve(state,result.text)],ON,{subscribe:fn=>{subs.push(fn);}},{});
  subs[2]?.(lab);subs[2]?.(delivered("t",272));
  expect(textOf(await none[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("could not be read (this game server does not serve /pokebench/places)");
  // A result without state, or without a readout, passes through untouched.
  const bare:AgentTool={...other,name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"Story: x"}],details:undefined})};
  const noReadout:AgentTool={...other,name:"navigate_to",execute:()=>Promise.resolve({content:[{type:"text",text:"Navigation: refused"}],details:{state}})};
  const [b,n]=withStoryDestinations([bare,noReadout],ON,{subscribe:fn=>{subs.push(fn);}},source);
  subs[3]?.(lab);subs[3]?.(delivered("t",272));
  expect(textOf(await b?.execute("b",{}) ?? {content:[],details:undefined})).toBe("Story: x");
  expect(textOf(await n?.execute("n",{}) ?? {content:[],details:undefined})).toBe("Navigation: refused");
 });
 it("the production factory honors the switch",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const reader={read:()=>Promise.resolve(state),places:()=>Promise.resolve(PLACES)};
  const on=playGameTools([fakeObserve(state,result.text)],{...OFF,"story-destinations-v1":true},reader,recorder);
  for(const fn of subs){fn(lab);fn(delivered("t",272));}
  expect(textOf(await on[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain(T272_BLOCK);
  const off=playGameTools([fakeObserve(state,result.text)],OFF,reader,recorder);
  expect(textOf(await off[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${result.text}`);
 });
 it("is registered default-off, needs dialogue auto-advance and records its id last",()=>{
  expect(featureInfo("story-destinations-v1")).toMatchObject({group:"observation",needs:"dialogue-auto-advance-v1",switchable:true});
  expect(featureInfo("story-destinations-v1").description).toContain(" Off: ");
  expect(dependencyProblems({...OFF,"story-destinations-v1":true})).toContain("story-destinations-v1 needs dialogue-auto-advance-v1");
  expect(SWITCHABLE_FEATURES).toContain("story-destinations-v1");
  expect(playHarnessFeatures(ON,null)).toContain("story-destinations-v1");
  expect(playHarnessFeatures({...ON,"story-destinations-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"heal-before-trainers-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false},null)).not.toContain("story-destinations-v1");
  const features=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!=="story-destinations-v1"));
  const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features});
  expect(presetFeatures(preset)["story-destinations-v1"]).toBe(false);
 });
});

describe("the game server's map table reader",()=>{
 it("GETs /pokebench/places and refuses a failed response",async()=>{
  const seen:string[]=[];
  const ok=new StateWatcher("http://127.0.0.1:9",(input)=>{seen.push(input instanceof Request?input.url:String(input));return Promise.resolve(new Response(JSON.stringify(PLACES)));});
  expect(await ok.places()).toEqual(PLACES);
  expect(seen).toEqual(["http://127.0.0.1:9/pokebench/places"]);
  const down=new StateWatcher("http://127.0.0.1:9",()=>Promise.resolve(new Response("no",{status:503})));
  await expect(down.places(AbortSignal.timeout(1000))).rejects.toThrow("Map table returned HTTP 503");
 });
 it("a malformed map table is said plainly, not used",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const result=resultAt(CAAA,272);const state=stateAt(CAAA,result.state_seq ?? -1);
  const [o]=withStoryDestinations([fakeObserve(state,result.text)],ON,{subscribe:fn=>{subs.push(fn);}},{places:()=>Promise.resolve({places:[{map_id:[0,0]}]})});
  subs[0]?.(talk("m",272,[page("Head back to the LAB.","MAY")]));subs[0]?.(delivered("m",272));
  expect(textOf(await o?.execute("o",{}) ?? {content:[],details:undefined})).toContain(`${STORY_HEADER}: not known; the game's map table could not be read (malformed /pokebench/places).`);
 });
});

describe("the pending experiment",()=>{
 it("flips only story-destinations-v1, in arms that record story lines and name buildings by their signs (round-1 Grok blocker); character presence stays as the finals incumbent has it",()=>{
  const entry=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/story-destinations.json",import.meta.url),"utf8")));
  expect(entry.queuePosition).toBeUndefined();
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual(["story-destinations-v1"]);
  expect(candidate.features["story-destinations-v1"]).toBe(true);
  for(const arm of [incumbent,candidate]){for(const id of ["dialogue-auto-advance-v1","displayed-place-names-v1"] as const)expect(arm.features[id],id).toBe(true);expect(arm.features["character-presence-v1"]).toBe(false);}
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
 });
});
