// story-battle-heal-first-v1 (the operator 2026-10-20 10:43 PM ET: "the heal first line needs to be in both control and the
// bundle"). Probe story-battle-heal-first-20261020 (97a0 turn 157, 16 per arm, recorded features with gym-heal-warning-v1
// off) inserted, right under the first line of result 4541 ("Read from game memory, always true:"), the PROBE line below:
// walking to MAY 13/16 → 4/16 (p 0.004), heading south 0 → 11 (p<0.001). The line it quotes is the boy's (YOUNGSTER
// sprite) at turn 147 on ROUTE101 (dialogue_auto_advance 4095, delivered in result 4098). Run b300 result 14882 enters
// RUSTBORO CITY GYM at TORCHIC 25/33 with ROXANNE not loaded; its latest heal line is MOM's at turn 315 (7837 → 7839).
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
const RAW_PROGRESS_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"gym-evidence-v1":false};
const ALL_ON={...RAW_PROGRESS_ALL_ON,"progress-aware-cycles-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {HealFirst,healExit,healFirstText,leadWith,storyBattle,storyPronoun,withHealFirst,type HealFirstFacts,type HealFirstRecorder,type HeardLine} from "./heal-first.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {GATE_STATUS} from "./story-battle-heal-gate.js";
import {parseTrainerSight} from "./trainer-sight.js";
import type {Place} from "./story-destinations.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";

const ID="story-battle-heal-first-v1";
const PROBE="TORCHIC has 5/22 HP. MAY's battle cannot be run from, so heal before talking to her. A boy on ROUTE101 told you: \"There's a POKéMON CENTER in OLDALE TOWN right close by.\" OLDALE TOWN is the SOUTH edge of this map.";
const B300_LINE="TORCHIC has 25/33 HP. ROXANNE's battle cannot be run from, so heal before talking to her. MOM in RED's HOUSE 1F told you: \"I think you should rest a bit.\"";
const NOTHING_HEARD="TORCHIC has 5/22 HP. MAY's battle cannot be run from, so heal before talking to her.";
const HEADER="Read from game memory, always true:";
// story-battle-heal-gate-v1's refusal paragraph at 97a0 turn 157, as its own tests pin it.
const TURN157_TEXT=[
 "Battle not started: talking to your rival MAY (object 2, at (10,3)) starts a trainer battle, and your party is not at full HP: TORCHIC 5/22.",
 "In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home.",
 "Places you know of that heal your party, nearest first:",
 "- the POKéMON CENTER in OLDALE TOWN (map 2/2), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (6,16) in OLDALE TOWN; its nurse says \"We restore your tired POKéMON to full health.\"",
 "- your house in LITTLEROOT TOWN (map 1/0), 4 map changes from here in the game's map table, where MOM says \"I think you should rest a bit.\" and heals your party.",
 "To talk anyway, call navigate_to_target again with the same map_id and target and confirm: true.",
].join("\n");

interface Row {seq:number;tool:string;text:string;state:unknown}
const must=<T,>(v:T|null|undefined):T=>{if(v==null)throw new Error("missing");return v;};
const R97=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/story-battle-heal-gate-97a0.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Row[]};
const HB=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Row[]};
const HEARD=JSON.parse(readFileSync(new URL("../test-support/heal-first-dialogue.json",import.meta.url),"utf8")) as {"97a0":unknown[];b300:unknown[]};
const RAW_PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as {places:Place[]}).places;
const PLACES={places:()=>Promise.resolve({places:RAW_PLACES})};
const TABLE=():Promise<readonly Place[]>=>Promise.resolve(RAW_PLACES);
const row=(rows:Row[],seq:number):{text:string;state:GameStateSnapshot}=>{const r=must(rows.find(x=>x.seq===seq));return {text:r.text,state:parseGameState(r.state)};};
const ROUTE103=row(R97.results,4541),MAY_STATE=ROUTE103.state;
const GYM=row(HB.results,14882);
const EVENTS97=HEARD["97a0"].map(e=>checkEvent(e)),EVENTSB300=HEARD.b300.map(e=>checkEvent(e));
const texts=(r:AgentToolResult<unknown>):string[]=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]);
const result=(state:GameStateSnapshot,text="readout"):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text}],details:{state}});
const heardFrom=(events:readonly RunEvent[]):HealFirst=>{const h=new HealFirst(TABLE);for(const e of events)h.observe(e);return h;};
const text=async(h:HealFirst,state:GameStateSnapshot,readout="readout",id="c"):Promise<string|null>=>{const f=await h.facts(state,readout,id);return f===null?null:healFirstText(f);};

// A recorder that hands subscribers the fixture events and keeps every heal_first_line call.
function fakeRecorder(){
 const listeners:((e:RunEvent)=>void)[]=[];const lines:{tool:string;id:string;facts:HealFirstFacts;text:string}[]=[];
 const recorder:Required<HealFirstRecorder>={subscribe:l=>{listeners.push(l);},healFirstLine:(tool,id,facts,t)=>{lines.push({tool,id,facts,text:t});}};
 return {recorder,lines,emit:(events:readonly RunEvent[])=>{for(const e of events)for(const l of listeners)l(e);}};
}
const toolReturning=(name:string,r:()=>AgentToolResult<unknown>):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve(r())});
const withState=(patch:Partial<GameStateSnapshot>,base:GameStateSnapshot=MAY_STATE):GameStateSnapshot=>({...base,...patch});

describe("97a0 result 4541 (turn 156, TORCHIC 5/22, MAY at (10,3))",()=>{
 it("is the probed line, right under the trust header, recorded once",async()=>{
  const f=fakeRecorder();
  const [tool]=withHealFirst([toolReturning("navigate_to",()=>result(MAY_STATE,ROUTE103.text))],true,f.recorder,PLACES);
  f.emit(EVENTS97);
  const out=await must(tool).execute("t156",{});
  expect(texts(out)).toEqual([ROUTE103.text.replace(/^(Read from game memory, always true:)/m,`$1\n${PROBE}`)]);
  expect(texts(out)[0]?.split("\n").slice(0,2)).toEqual([HEADER,PROBE]);
  expect(f.lines.map(l=>[l.tool,l.id,l.text])).toEqual([["navigate_to","t156",PROBE]]);
  expect(must(f.lines[0]).facts).toEqual({kind:"rival",opponent:"MAY",pronoun:{object:"her",subject:"she"},map_id:[0,18],party:[{species:"TORCHIC",hp:5,max_hp:22}],
   heard:{turn:147,speaker:"the boy you talked to",person:true,place:"ROUTE101",map_id:[0,16],text:"There's a POKéMON CENTER in OLDALE TOWN right close by."},
   exit:{to:"OLDALE TOWN",map_id:[0,10],direction:"SOUTH",tiles:[]}});
 });
 it("without the trust header (the control arm has no harness-trust-v1) it is the result's first line",async()=>{
  const f=fakeRecorder();
  const bare=ROUTE103.text.slice(HEADER.length+1);
  const [tool]=withHealFirst([toolReturning("navigate_to",()=>result(MAY_STATE,bare))],true,f.recorder,PLACES);
  f.emit(EVENTS97);
  expect(texts(await must(tool).execute("t156",{}))).toEqual([`${PROBE}\n${bare}`]);
 });
 it("nothing heard: each hurt Pokémon's HP and the battle only, never an invented place",async()=>{
  expect(await text(new HealFirst(TABLE),MAY_STATE,ROUTE103.text)).toBe(NOTHING_HEARD);
 });
 it("a page whose result was an error was never delivered; this call's own pages are delivered with it",async()=>{
  const [advance,done]=EVENTS97 as [RunEvent,RunEvent];
  expect(await text(heardFrom([advance,{...done,is_error:true} as RunEvent]),MAY_STATE)).toBe(NOTHING_HEARD);
  expect(await text(heardFrom([advance]),MAY_STATE,"readout",(advance as Extract<RunEvent,{type:"dialogue_auto_advance"}>).tool_call_id)).toBe(PROBE);
  expect(await text(heardFrom([advance]),MAY_STATE,"readout","other")).toBe(NOTHING_HEARD);
 });
 it("a later delivered heal line replaces an earlier one; other pages and battle pages do not",async()=>{
  const [advance,done]=EVENTS97 as [Extract<RunEvent,{type:"dialogue_auto_advance"}>,Extract<RunEvent,{type:"tool_result"}>];
  const page=must(advance.pages[0]);
  const later=(id:string,pages:typeof advance.pages):RunEvent[]=>[{...advance,tool_call_id:id,turn:150,pages},{...done,id,turn:150}];
  const h=heardFrom([...EVENTS97,...later("x",[{...page,text:"Hi! Do you like POKéMON?"}]),...later("y",[{...page,text:"Go to a POKéMON CENTER.",battle_turn:1}]),{type:"tool_result",id:"never"} as RunEvent]);
  expect(await text(h,MAY_STATE)).toBe(PROBE);
  const nurse=later("z",[{...page,map:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],speaker:null,speaker_source:null,text:"Hello, and welcome to\nthe POKéMON CENTER."}]);
  expect(await text(heardFrom([...EVENTS97,...nurse]),MAY_STATE)).toBe("TORCHIC has 5/22 HP. MAY's battle cannot be run from, so heal before talking to her. In OLDALE TOWN POKEMON CENTER 1F, with no speaker shown, you were told: \"Hello, and welcome to the POKéMON CENTER.\" OLDALE TOWN is the SOUTH edge of this map.");
 });
 it("keeps at most 16 pending calls",async()=>{
  const [advance,done]=EVENTS97 as [Extract<RunEvent,{type:"dialogue_auto_advance"}>,Extract<RunEvent,{type:"tool_result"}>];
  const h=new HealFirst(TABLE);h.observe(advance);
  for(let i=0;i<16;i++)h.observe({...advance,tool_call_id:`f${String(i)}`,pages:[]});
  h.observe(done);
  expect(await text(h,MAY_STATE)).toBe(NOTHING_HEARD);
 });
});

describe("b300 result 14882: entering RUSTBORO CITY GYM at TORCHIC 25/33",()=>{
 it("names ROXANNE though her object is not loaded, quotes MOM's heal line, and names no exit (none of the gym's leads there)",async()=>{
  expect((GYM.state.world_context?.objects??[]).map(o=>o.sprite_kind)).not.toContain("ROXANNE");
  const out=await text(heardFrom(EVENTSB300),GYM.state,GYM.text,"t492");
  expect(out).toBe(B300_LINE);
  const f=fakeRecorder();
  const [tool]=withHealFirst([toolReturning("navigate_to",()=>result(GYM.state,GYM.text))],true,f.recorder,PLACES);
  f.emit(EVENTSB300);
  expect(texts(await must(tool).execute("t492",{}))[0]?.split("\n").slice(0,3)).toEqual([HEADER,B300_LINE,GYM.text.split("\n")[1]]);
 });
});

describe("when it fires",()=>{
 const h=heardFrom(EVENTS97);
 it("only on the free field with a readable party below max HP",async()=>{
  const torchic=must(MAY_STATE.party[0]);
  for(const patch of [{field_controls_locked:true},{field_controls_locked:null},{in_battle:true},{screen:"battle"},{started:false},{party_owner:"opponent"},{map_id:null},
   {party:[{...torchic,hp:22}]},{party:[{...torchic,hp:null}]},{party:[{...torchic,species:null}]},{party:[]}] as Partial<GameStateSnapshot>[])
   expect(await h.facts(withState(patch),ROUTE103.text,"c")).toBeNull();
  expect(await text(h,withState({party:[{...torchic,hp:22},{...torchic,is_egg:true,hp:1,species:null}]}))).toBeNull();
  expect(await text(h,withState({party:[torchic,{...torchic,species:"WURMPLE",hp:0,max_hp:20}]}))).toBe(PROBE.replace("TORCHIC has 5/22 HP.","TORCHIC has 5/22 HP. WURMPLE has 0/20 HP."));
 });
 it("only while the story battle is unbeaten and on this map",async()=>{
  const story=must(MAY_STATE.story);
  expect(await text(h,withState({story:{...story,rival_battle_won:true}}),ROUTE103.text)).toBeNull();
  expect(await text(h,withState({story:{...story,rival_battle_won:null}}),ROUTE103.text)).toBeNull();
  expect(await text(h,withState({map_id:[0,16]}),ROUTE103.text)).toBeNull();
 });
 it("the rival is the loaded rival sprite, else the one the readout's Story characters line places here; neither: silent",async()=>{
  const objects=(MAY_STATE.world_context?.objects??[]).filter(o=>!o.sprite_kind?.startsWith("RIVAL_"));
  const unloaded=withState({world_context:{...must(MAY_STATE.world_context),objects}});
  expect(await text(h,unloaded,"Story characters here (from this map's own object list): MAY at 10,3 (out of view; where the map places this character, it may have moved). Not on this map: PROF. BIRCH.")).toBe(PROBE);
  expect(await text(h,unloaded,"Story characters here: BRENDAN at 10,3. Not on this map: MAY.")).toBe(PROBE.replace("MAY's","BRENDAN's").replace("talking to her","talking to him"));
  expect(await text(h,unloaded,"Story characters here: none. Not on this map: MAY.")).toBeNull();
  expect(await text(h,unloaded,"readout")).toBeNull();
  const brendan=withState({world_context:{...must(MAY_STATE.world_context),objects:(MAY_STATE.world_context?.objects??[]).map(o=>o.sprite_kind==="RIVAL_MAY_NORMAL"?{...o,sprite_kind:"RIVAL_BRENDAN_NORMAL"}:o)}});
  expect(await text(h,brendan)).toContain("BRENDAN's battle cannot be run from, so heal before talking to him.");
  const elsewhere=withState({world_context:{...must(MAY_STATE.world_context),objects:(MAY_STATE.world_context?.objects??[]).map(o=>({...o,map_id:[0,16] as [number,number]}))}});
  expect(await text(h,elsewhere)).toBeNull();
 });
 it("the Petalburg Woods grunt by map and flag; ROXANNE by map and flag",async()=>{
  const story=must(MAY_STATE.story);
  const woods=withState({map_id:[24,11],story:{...story,petalburg_woods_aqua_grunt_defeated:false}});
  expect(await text(new HealFirst(TABLE),woods)).toBe("TORCHIC has 5/22 HP. The TEAM AQUA grunt's battle cannot be run from, so heal before he stops you on the forest path.");
  expect(await text(new HealFirst(TABLE),withState({map_id:[24,11],story:{...story,petalburg_woods_aqua_grunt_defeated:true}}))).toBeNull();
  expect(await text(new HealFirst(TABLE),withState({map_id:[11,3],story:{...story,roxanne_defeated:false}}))).toBe("TORCHIC has 5/22 HP. ROXANNE's battle cannot be run from, so heal before talking to her.");
  expect(await text(new HealFirst(TABLE),withState({map_id:[11,3],story:{...story,roxanne_defeated:true}}))).toBeNull();
  expect(storyBattle(withState({map_id:[11,3],story:null}),"")).toBeNull();
 });
 it("pronouns come from the trainers' genders in the game's trainer table",()=>{
  expect(storyPronoun("MAY")).toEqual({object:"her",subject:"she"});
  expect(storyPronoun("ROXANNE")).toEqual({object:"her",subject:"she"});
  expect(storyPronoun("BRENDAN")).toEqual({object:"him",subject:"he"});
  expect(storyPronoun("TEAM AQUA grunt")).toEqual({object:"him",subject:"he"});
  expect(storyPronoun(null)).toBeNull();
  expect(storyPronoun("TOMMY")).toBeNull();
 });
});

describe("the place the heard line points at",()=>{
 const line=(over:Partial<HeardLine>):HeardLine=>({turn:1,speaker:"MOM",person:true,place:"RED's HOUSE 1F",map_id:[1,0],text:"I think you should rest a bit.",...over});
 it("MOM's heal line heard at home: the house's warp from its town, else the town's edge",()=>{
  expect(healExit([0,9],line({}),RAW_PLACES)).toEqual({to:"RAED's HOUSE 1F",map_id:[1,0],direction:null,tiles:[{x:5,y:8}]});
  expect(healExit([0,16],line({}),RAW_PLACES)).toEqual({to:"LITTLEROOT TOWN",map_id:[0,9],direction:"SOUTH",tiles:[]});
  expect(healExit([1,0],line({}),RAW_PLACES)).toBeNull();
  expect(healExit([0,16],line({text:"Take care, honey!"}),RAW_PLACES)).toBeNull();
  expect(healExit([0,16],line({speaker:"DAD"}),RAW_PLACES)).toBeNull();
  expect(healExit([0,16],line({map_id:null}),RAW_PLACES)).toBeNull();
  expect(healExit([99,99],line({}),RAW_PLACES)).toBeNull();
 });
 it("a town the line names: its POKéMON CENTER's warp when this map has one, else the town; several warps listed",()=>{
  const said=line({speaker:"the boy you talked to",text:"There's a POKéMON CENTER in OLDALE TOWN right close by.",place:"ROUTE101",map_id:[0,16]});
  expect(healExit([0,10],said,RAW_PLACES)).toEqual({to:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],direction:null,tiles:[{x:6,y:16}]});
  expect(healExit([0,3],line({text:"Rest at a POKéMON CENTER.",speaker:"A"}),RAW_PLACES)).toBeNull();
  expect(healExit([0,10],line({text:"OLDALE TOWN has a POKéMON CENTER.",speaker:"A"}),RAW_PLACES)).toEqual({to:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],direction:null,tiles:[{x:6,y:16}]});
  expect(healExit([2,2],line({text:"OLDALE TOWN has a POKéMON CENTER.",speaker:"A"}),RAW_PLACES)).toBeNull();
  expect(healExit([11,3],line({text:"The POKéMON CENTER in RUSTBORO CITY.",speaker:"A"}),RAW_PLACES)).toEqual({to:"RUSTBORO CITY",map_id:[0,3],direction:null,tiles:[{x:5,y:19},{x:6,y:19}]});
  expect(healExit([0,18],line({text:"Take them to a POKéMON CENTER on ROUTE 101.",speaker:"A"}),RAW_PLACES)).toBeNull();
  expect(healExit([0,10],line({text:"A POKéMON CENTER is on ROUTE 101.",speaker:"A"}),RAW_PLACES)).toEqual({to:"ROUTE101",map_id:[0,16],direction:"SOUTH",tiles:[]});
 });
 it("a building whose town the table does not give stands alone",()=>{
  const lone:Place={map_id:[50,1],name:"LONE POKEMON CENTER 1F",display:"LONE POKEMON CENTER 1F",warps:[],connections:[]};
  const here:Place={map_id:[50,0],name:"FIELD",display:"FIELD",warps:[{x:1,y:2,to:[50,1]}],connections:[{direction:"DIVE",to:[50,1]}]};
  expect(healExit([50,0],line({speaker:"NURSE",map_id:[50,1],text:"Hello."}),[lone,here])).toEqual({to:"LONE POKEMON CENTER 1F",map_id:[50,1],direction:null,tiles:[{x:1,y:2}]});
 });
 it("says who said it and where: a person, a sprite described, a sign, no speaker",()=>{
  const facts=(heard:HeardLine,exit:HealFirstFacts["exit"]=null):HealFirstFacts=>({kind:"rival",opponent:"MAY",pronoun:{object:"her",subject:"she"},map_id:[0,18],party:[{species:"TORCHIC",hp:5,max_hp:22}],heard,exit});
  const tail=(heard:HeardLine,exit:HealFirstFacts["exit"]=null)=>healFirstText(facts(heard,exit)).slice(NOTHING_HEARD.length+1);
  expect(tail(line({}))).toBe("MOM in RED's HOUSE 1F told you: \"I think you should rest a bit.\"");
  expect(tail(line({speaker:"the old man you talked to",place:"ROUTE102"}))).toBe("An old man on ROUTE102 told you: \"I think you should rest a bit.\"");
  expect(tail(line({speaker:"the sign",person:false,place:"OLDALE TOWN",text:"POKéMON CENTER"}))).toBe("The sign in OLDALE TOWN read: \"POKéMON CENTER\"");
  expect(tail(line({speaker:"no speaker shown",person:false,place:null,text:"Welcome to the POKéMON CENTER."}))).toBe("With no speaker shown, you were told: \"Welcome to the POKéMON CENTER.\"");
  expect(tail(line({speaker:"MOM",place:null}))).toBe("MOM told you: \"I think you should rest a bit.\"");
  expect(tail(line({}),{to:"RUSTBORO CITY",map_id:[0,3],direction:null,tiles:[{x:5,y:19},{x:6,y:19}]})).toBe("MOM in RED's HOUSE 1F told you: \"I think you should rest a bit.\" RUSTBORO CITY is the warp at (5,19) or (6,19) of this map.");
 });
 it("an unreadable map table leaves the exit out",async()=>{
  const h=new HealFirst(()=>Promise.resolve(null));for(const e of EVENTS97)h.observe(e);
  expect(await text(h,MAY_STATE)).toBe(PROBE.slice(0,PROBE.indexOf(" OLDALE TOWN is the SOUTH")));
 });
});

describe("leading the result",()=>{
 it("a result with no text part gets one; only the first text part changes",()=>{
  const image={type:"image" as const,data:"x",mimeType:"image/png"};
  expect(leadWith({content:[image],details:{}},"L").content).toEqual([{type:"text",text:"L"},image]);
  expect(leadWith({content:[image,{type:"text",text:`${HEADER}\nA`},{type:"text",text:"B"}],details:{}},"L").content).toEqual([image,{type:"text",text:`${HEADER}\nL\nA`},{type:"text",text:"B"}]);
 });
});

// The model-facing tools as playGameTools builds them for 97a0's turn 157.
const WIRE:FeatureSet={...featuresOf(R97.harness_features),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"battle-move-tool-v1":false,"cited-destination-v1":false,"harness-trust-v1":false,"safe-navigation-strides-v1":false,"auto-talk-v1":false,"story-battle-heal-gate-v1":true};
function wired(features:FeatureSet,state:GameStateSnapshot=MAY_STATE){
 const f=fakeRecorder();
 const hooks=new Proxy({},{get:(_t,key)=>key==="subscribe"?f.recorder.subscribe:key==="healFirstLine"?f.recorder.healFirstLine:key==="then"?undefined:()=>{}}) as unknown as Parameters<typeof playGameTools>[3];
 const pressed:unknown[]=[];
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id:string,params:unknown)=>{pressed.push(params);return Promise.resolve(result(state,"pressed"));},executeChecked:(_id:string,params:unknown,check:(s:GameStateSnapshot)=>void)=>{check(state);pressed.push(params);return Promise.resolve(result(state,"pressed checked"));}} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(state))} as unknown as AgentTool;
 const tools=playGameTools([press,observe],features,{read:()=>Promise.resolve(state),places:PLACES.places,trainerSight:()=>Promise.resolve(parseTrainerSight({available:true,map_id:[0,18],trainers:[],sightings:[]}))},hooks);
 f.emit(EVENTS97);
 return {tool:(name:string)=>must(tools.find(t=>t.name===name)),lines:f.lines,pressed};
}

describe("story-battle-heal-gate-v1 on: the refusal leads with the same line",()=>{
 it("navigate_to_target MAY at turn 157: the line, then the gate's status and its unchanged paragraph",async()=>{
  const on=wired({...WIRE,[ID]:true});
  const out=await on.tool("navigate_to_target").execute("t157",{map_id:[0,18],target:{kind:"object",local_id:2}});
  expect(texts(out)[0]).toBe(`${PROBE}\nSemantic navigation: ${GATE_STATUS}. Selected map object 2.`);
  expect(texts(out)[1]?.split("\n")[0]).toBe(TURN157_TEXT.split("\n")[0]);
  expect(on.lines.map(l=>[l.tool,l.text])).toEqual([["navigate_to_target",PROBE]]);
  const off=wired({...WIRE,[ID]:false});
  const before=await off.tool("navigate_to_target").execute("t157",{map_id:[0,18],target:{kind:"object",local_id:2}});
  expect(texts(before)[0]).toBe(`Semantic navigation: ${GATE_STATUS}. Selected map object 2.`);
  expect(texts(out).slice(1)).toEqual(texts(before).slice(1));
  expect(off.lines).toEqual([]);
 });
 it("a checked press result leads with it too",async()=>{
  const on=wired({...WIRE,[ID]:true,"story-battle-heal-gate-v1":false});
  const press=on.tool("press") as AgentTool&{executeChecked:(...a:unknown[])=>Promise<AgentToolResult<unknown>>};
  const out=await press.executeChecked("p",{buttons:["B"]},()=>undefined);
  expect(texts(out)[0]).toBe(`${PROBE}\npressed checked`);
 });
});

describe("switch OFF and wiring",()=>{
 it("off: the tools come back unchanged and nothing is recorded or subscribed",()=>{
  const f=fakeRecorder();const tool=toolReturning("observe",()=>result(MAY_STATE));
  const [same]=withHealFirst([tool],false,{subscribe:()=>{throw new Error("subscribed");}},PLACES);
  expect(same).toBe(tool);
  expect(f.lines).toEqual([]);
 });
 it("needs a recorder hook; a result without a state or with a malformed one is left alone",async()=>{
  expect(()=>withHealFirst([],true,{subscribe:()=>undefined},PLACES)).toThrow("heal_first_line");
  const f=fakeRecorder();
  const tools=withHealFirst([toolReturning("a",()=>({content:[{type:"text",text:"x"}],details:{}})),toolReturning("b",()=>({content:[{type:"text",text:"y"}],details:{state:{bad:true}}})),toolReturning("c",()=>({content:[{type:"text",text:"z"}],details:null}))],true,f.recorder,PLACES);
  for(const t of tools)expect(texts(await t.execute("i",{}))).toHaveLength(1);
  expect(f.lines).toEqual([]);
 });
 it("playGameTools off leaves every result byte for byte as before",async()=>{
  const off=wired({...WIRE,[ID]:false,"story-battle-heal-gate-v1":false});
  const before=texts(await off.tool("observe").execute("o",{}));
  expect(before[0]).toBe("readout");
  const on=wired({...WIRE,[ID]:true,"story-battle-heal-gate-v1":false});
  expect(texts(await on.tool("observe").execute("o",{}))).toEqual([`${PROBE}\nreadout`,...before.slice(1)]);
 });
});

describe("registry, fixed bundles and event",()=>{
 it("is a default-off guard with no dependency, recorded last; prompt and tool list unchanged",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"STORY BATTLE HEAL FIRST LINE"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(PROBE);
  expect(featureInfo(ID).description).toContain(B300_LINE);
  expect(SWITCHABLE_FEATURES.at(-29)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-27)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true})).toEqual(dependencyProblems({...ALL_ON,[ID]:false}));
  const without=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  expect(playSystemPrompt({...WIRE,[ID]:true},null)).toBe(playSystemPrompt({...WIRE,[ID]:false},null));
  expect(playTools({...WIRE,[ID]:true})).toEqual(playTools({...WIRE,[ID]:false}));
 });
 it("is on in both arms of bundle-v-control, bundle-cook-1h, whole-map-cook-1h, glm53-flash-1h and whole-map-pair-1h-v7; its pending experiment's incumbent is the control arm with it off",()=>{
  const read=(path:string):unknown=>JSON.parse(readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8"));
  for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","glm53-flash-1h","whole-map-pair-1h-v7"]){
   const fixed=read(`experiments/fixed/${name}.json`) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[];offInBoth:string[]};
   expect(fixed.base.features[ID]).toBe(true);expect(fixed.onInBoth).toContain(ID);expect(fixed.switches).not.toContain(ID);expect(fixed.offInBoth).not.toContain(ID);
  }
  const control=(read("experiments/fixed/bundle-v-control.json") as {base:{features:Record<string,boolean>}}).base.features;
  const entry=read(`experiments/${ID}.json`) as {changedFeature:string;incumbent:{features:Record<string,boolean>};queuePosition?:number};
  expect(entry.changedFeature).toBe(ID);expect(entry.queuePosition).toBeUndefined();
  const {"rejected-movement-step-v1":stepOff,"observed-field-dialogue-v1":fieldOff,"progress-aware-cycles-v1":progressOff,"caught-dex-input-v1":dexOff,"gym-door-label-v1":gymOff,"mart-stock-readout-v1":martOff,"shop-interface-v1":shopOff,"menu-refusal-recovery-v1":menuOff,"pending-field-dialogue-v1":pendingOff,"exp-next-level-v1":expNextOff,"pokedex-own-v1":pokedexOff,"exp-earned-ledger-v1":expEarnedOff,"leader-attempt-ledger-v1":leaderOff,"seen-trainers-ledger-v1":seenOff,"party-coverage-v1":coverageOff,"said-type-matches-v1":saidTypeOff,...historicalControl}=control;
  expect([stepOff,fieldOff]).toEqual([false,false]);expect(progressOff).toBe(false);expect(dexOff).toBe(false);expect(gymOff).toBe(false);expect(martOff).toBe(false);expect(shopOff).toBe(false);expect(pendingOff).toBe(false);expect(menuOff).toBe(false);expect([expNextOff,pokedexOff,expEarnedOff,leaderOff,seenOff,coverageOff,saidTypeOff]).toEqual([false,false,false,false,false,false,false]);
  expect({...entry.incumbent.features,"gym-evidence-v1":false}).toEqual({...historicalControl,[ID]:false});
 });
 it("records a valid heal_first_line event that the tail and Activity History read",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-heal-first-"));
  try{
   const log=RunLog.create(root,"r");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(MAY_STATE)}});
   await recorder.start(RUN_START_META);
   const facts=must(await heardFrom(EVENTS97).facts(MAY_STATE,ROUTE103.text,"t156"));
   recorder.healFirstLine("navigate_to","t156",facts,healFirstText(facts));
   recorder.healFirstLine("navigate_to","t157",{...facts,heard:{...must(facts.heard),map_id:null},exit:{to:"X",map_id:[1,0],direction:null,tiles:[{x:5,y:8}]}},"x");
   recorder.healFirstLine("observe","t158",{...facts,heard:null,exit:null},NOTHING_HEARD);
   recorder.end("budget");
   const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
   const lines=events.flatMap(e=>e.type==="heal_first_line"?[e]:[]);
   expect(lines.map(e=>e.text)).toEqual([PROBE,"x",NOTHING_HEARD]);
   expect(formatEvent(must(lines[0]))).toContain("heal first line · navigate_to · MAY · TORCHIC 5/22 · heard turn 147 · exit to OLDALE TOWN");
   expect(formatEvent(must(lines[2]))).toContain("heal first line · observe · MAY · TORCHIC 5/22 · nothing heard");
   expect(()=>checkEvent({...must(lines[0]),kind:"wild"})).toThrow();
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});
