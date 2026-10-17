import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {PlacesBody} from "./story-destinations.js";
import {TRUST_HEADER,WalkAway,awayText,charactersLine,exitsLine,mapSteps,trustSection,waysHere,withHarnessTrust,type StoryGoalAwayFacts} from "./harness-trust.js";
import {gunzipSync} from "node:zlib";

interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa"|"sh02",Recording>;
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

type Details={state:GameStateSnapshot|undefined};
// A game tool that returns whatever state and readout the test sets next.
function scripted(name:"observe"|"press"|"navigate_to"):{tool:AgentTool;next:(state:GameStateSnapshot,text:string)=>void} {
 let current:AgentToolResult<Details>={content:[{type:"text",text:""}],details:{state:undefined}};
 const result=():Promise<AgentToolResult<Details>>=>Promise.resolve(current);
 const base={name,label:name,description:"d",parameters:Type.Object({}),execute:result};
 const tool=name==="press"?({...base,executeChecked:result} as unknown as CheckedPressTool):base;
 return {tool,next:(state,text)=>{current={content:[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text}],details:{state}};}};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");

function harness(on=true,places:()=>Promise<unknown>=()=>Promise.resolve(PLACES)) {
 const subs:((e:RunEvent)=>void)[]=[];const notes:{tool:string;facts:StoryGoalAwayFacts;text:string}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},storyGoalAway:(tool:string,facts:StoryGoalAwayFacts,text:string)=>{notes.push({tool,facts,text});}};
 const observe=scripted("observe"),press=scripted("press"),nav=scripted("navigate_to");
 const other:AgentTool={name:"recall_dialogue",label:"r",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"x"}],details:undefined})};
 const tools=withHarnessTrust([observe.tool,press.tool,nav.tool,other],on,recorder,{places});
 const feed=(events:readonly RunEvent[],until:number)=>{for(const e of events){if(e.seq>until)break;for(const s of subs)s(e);}};
 return {subs,notes,tools,observe,press,nav,feed,other};
}

const LAB_GOAL="Story goal: \"Well, it's time to head back to the LAB.\" (MAY, turn 272) -> \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).";

describe("harness-trust-v1 prompt",()=>{
 it("is a short numbered trust order: the latest story line, then readout facts, never memory",()=>{
  expect(trustSection(false,false)).toBe([
   "Trust order: when sources disagree, believe them in this order.",
   "1. The latest thing a story character told you. Each result starts with it as the Story goal line, read from game memory, with the place it names.",
   "2. The other facts read from game memory in the result: where you are, who is on this map, the exits and the map.",
   "3. Never your memory of Pokémon games, guides or walkthroughs. When it disagrees with 1 or 2, it is wrong about this game.",
  ].join("\n"));
 });
 it("builds on Game evidence first instead of repeating it, and names the walk-away note",()=>{
  const text=trustSection(true,true);
  expect(text.startsWith("Trust order (this puts \"Game evidence first\" in order): when sources disagree, believe them in this order.\n1. ")).toBe(true);
  expect(text.endsWith("\nA SUPERVISOR note under the header says when your last two moves took you farther from the place the Story goal line names.")).toBe(true);
 });
});

describe("harness-trust-v1 header on recorded runs",()=>{
 it("4caa T272: MAY's \"head back to the LAB\" heads the result, resolved to the lab door, with the characters on this map; the rest is unchanged",async()=>{
  const h=harness();const result=resultAt(CAAA,272);
  h.feed(CAAA,result.seq-1);
  h.press.next(stateAt(CAAA,result.state_seq ?? -1),result.text);
  const text=textOf(await h.tools[1]?.execute(result.id,{buttons:["A"]}) ?? {content:[],details:undefined});
  expect(text).toBe(`|${TRUST_HEADER}\n${LAB_GOAL}\nStory characters on this map (from its own object list): none.\n\n${result.text}`);
 });
 it("4caa T273: the next result, where the model decided the lab was in Rustboro, still heads with the lab",async()=>{
  const h=harness();const result=resultAt(CAAA,273);
  h.feed(CAAA,result.seq-1);
  h.nav.next(stateAt(CAAA,result.state_seq ?? -1),result.text);
  expect(textOf(await h.tools[2]?.execute(result.id,{}) ?? {content:[],details:undefined})).toContain(`|${TRUST_HEADER}\n${LAB_GOAL}\n`);
 });
 it("sh02 T74: MOM's \"He lives right next door\" is PROF. BIRCH's house door, and MOM is on this map",async()=>{
  const h=harness();const result=resultAt(SH02,74);
  h.feed(SH02,result.seq-1);
  h.press.next(stateAt(SH02,result.state_seq ?? -1),result.text);
  const text=textOf(await h.tools[1]?.execute(result.id,{buttons:["A"]}) ?? {content:[],details:undefined});
  expect(text.startsWith([`|${TRUST_HEADER}`,
   "Story goal: \"He lives right next door, so you should go over and introduce yourself.\" (MOM, turn 74) -> \"He lives\" (He = PROF. BIRCH, the one story character named before it in this conversation) = PROF. BIRCH'S HOUSE 1F (map 1/2). Way in: door in LITTLEROOT TOWN (map 0/9) at (14,8).",
   "Story characters on this map (from its own object list): MOM at 2,6.",
   "",""].join("\n"))).toBe(true);
 });
 it("before any story line names a place, and when the map table cannot be read, it says so plainly",async()=>{
  const result=resultAt(CAAA,272);const state=stateAt(CAAA,result.state_seq ?? -1);
  const h=harness();h.observe.next(state,"Location: ROUTE103");
  expect(textOf(await h.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${TRUST_HEADER}\nStory goal: no story character has named a place yet in this run.\n\nLocation: ROUTE103`);
  let fail=true;
  const broken=harness(true,()=>{if(fail){fail=false;return Promise.reject(new Error("HTTP 503"));}return Promise.resolve(PLACES);});
  broken.feed(CAAA,result.seq);broken.observe.next(state,"Location: ROUTE103");
  expect(textOf(await broken.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("\nStory goal: not known; the game's map table could not be read (HTTP 503).\n");
  // The failed read is retried on the next result.
  expect(textOf(await broken.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain(`\n${LAB_GOAL}\n`);
  const empty=harness(true,()=>Promise.reject(new Error("HTTP 503")));empty.observe.next(state,"x");
  expect(textOf(await empty.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("\nStory goal: no story character has named a place yet in this run.\n");
  const none=withHarnessTrust([h.observe.tool],true,{subscribe:()=>undefined,storyGoalAway:()=>undefined},{});
  expect(textOf(await none[0]?.execute("o",{}) ?? {content:[],details:undefined})).toContain("\nStory goal: no story character has named a place yet in this run.\n");
 });
 it("leaves results without a started state, without text, and other tools untouched; press stays checkable",async()=>{
  const h=harness();const result=resultAt(CAAA,272);const state=stateAt(CAAA,result.state_seq ?? -1);
  expect(h.tools[3]).toBe(h.other);
  h.observe.next({...state,started:false},"Screen: title");
  expect(textOf(await h.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe("|Screen: title");
  const noState:AgentTool={...h.other,name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"x"}],details:undefined})};
  const imageOnly:AgentTool={...h.other,name:"observe",execute:()=>Promise.resolve({content:[{type:"image",data:"x",mimeType:"image/png"}],details:{state}})};
  const [a,b]=withHarnessTrust([noState,imageOnly],true,{subscribe:()=>undefined,storyGoalAway:()=>undefined},{places:()=>Promise.resolve(PLACES)});
  expect(textOf(await a?.execute("a",{}) ?? {content:[],details:undefined})).toBe("x");
  expect(textOf(await b?.execute("b",{}) ?? {content:[],details:undefined})).toBe("");
  const press=h.tools[1];
  if(press===undefined||!isCheckedPress(press))throw Error("press lost executeChecked");
  h.press.next(state,"Location: ROUTE103");
  expect(textOf(await press.executeChecked("p",{buttons:["A"]},()=>undefined))).toContain(TRUST_HEADER);
 });
 it("OFF hands back the very same tools and subscribes to nothing",()=>{
  const h=harness(false);
  expect(h.subs).toHaveLength(0);
  expect(h.tools[0]).toBe(h.observe.tool);expect(h.tools[1]).toBe(h.press.tool);expect(h.tools[2]).toBe(h.nav.tool);
 });
 it("the characters line copies only the readout's own on-this-map part",()=>{
  expect(charactersLine("Story characters here (from this map's own object list): PROF. BIRCH at 4,13, MAY (out of view). Not on this map: MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.")).toBe("Story characters on this map (from its own object list): PROF. BIRCH at 4,13, MAY (out of view).");
  expect(charactersLine("Location: ROUTE101")).toBeNull();
 });
});

describe("harness-trust-v1 walk-away supervisor",()=>{
 const result=resultAt(CAAA,272);
 const base=stateAt(CAAA,result.state_seq ?? -1);
 const route103=(x:number,y:number):GameStateSnapshot=>({...base,map_id:[0,18],location:"ROUTE103",position:{x,y}});
 const oldale=(x:number,y:number):GameStateSnapshot=>({...route103(x,y),map_id:[0,10],location:"OLDALE TOWN"});
 async function walk(states:readonly GameStateSnapshot[]){
  const h=harness();h.feed(CAAA,result.seq);
  const texts:string[]=[];
  for(const [i,s] of states.entries()){h.nav.next(s,"Location: x");texts.push(textOf(await h.tools[2]?.execute(`n${String(i)}`,{}) ?? {content:[],details:undefined}));}
  return {h,texts};
 }
 it("the map table counts the steps to the lab: Route 103, Oldale, Route 101, Littleroot",()=>{
  expect([[0,18],[0,10],[0,16],[0,9],[1,4]].map(id=>mapSteps(id as [number,number],[[1,4]],PLACES.places))).toEqual([4,3,2,1,0]);
  expect(mapSteps([99,99],[[1,4]],PLACES.places)).toBeNull();
 });
 it("two moves in a row farther from the way toward the goal add one SUPERVISOR note under the header and record it",async()=>{
  const {h,texts}=await walk([route103(9,13),route103(9,10),route103(9,7)]);
  const note="SUPERVISOR: Your last two moves took you farther from PROF. BIRCH'S POKéMON LAB (map 1/4), the place in MAY's line above (turn 272): on ROUTE103 (map 0/18) you went from (9,13) to (9,10), and this map's SOUTH edge (to OLDALE TOWN (map 0/10)) went from 8 to 11 tiles away, counting tiles across and down; then on ROUTE103 (map 0/18) you went from (9,10) to (9,7), and this map's SOUTH edge (to OLDALE TOWN (map 0/10)) went from 11 to 14 tiles away, counting tiles across and down. Unless a story character has told you something newer, the Story goal line is where to go.";
  expect(texts[0]).not.toContain("SUPERVISOR");expect(texts[1]).not.toContain("SUPERVISOR");
  expect(texts[2]).toBe(`|${TRUST_HEADER}\n${LAB_GOAL}\n${note}\n\nLocation: x`);
  expect(h.notes).toHaveLength(1);
  expect(h.notes[0]?.tool).toBe("navigate_to");expect(h.notes[0]?.text).toBe(note);
  expect(h.notes[0]?.facts).toMatchObject({speaker:"MAY",line_turn:272,quote:"Well, it's time to head back to the LAB.",targets:[{name:"PROF. BIRCH'S POKéMON LAB",map_id:[1,4]}]});
  expect(awayText(h.notes[0]?.facts as StoryGoalAwayFacts)).toBe(note);
 });
 it("a closer move between two farther ones, a standstill, or arriving resets nothing falsely: no note",async()=>{
  expect((await walk([route103(9,13),route103(9,10),route103(9,12),route103(9,9)])).h.notes).toHaveLength(0);
  // Standing still neither counts nor resets: the second farther move fires.
  expect((await walk([route103(9,13),route103(9,10),route103(9,10),route103(9,7)])).h.notes).toHaveLength(1);
  // It fires again only after two more farther moves.
  expect((await walk([route103(9,13),route103(9,12),route103(9,11),route103(9,10)])).h.notes).toHaveLength(1);
  expect((await walk([route103(9,13),route103(9,12),route103(9,11),route103(9,10),route103(9,9)])).h.notes).toHaveLength(2);
 });
 it("leaving a map through a connection that leads farther counts as a move away, with the map-table count",async()=>{
  const {h}=await walk([oldale(10,3),route103(10,19),route103(10,15)]);
  expect(h.notes).toHaveLength(1);
  expect(h.notes[0]?.text).toContain(": you went from OLDALE TOWN (map 0/10) to ROUTE103 (map 0/18), from 3 to 4 maps away from it by the game's map table (doors, stairs and map edges); then on ROUTE103 (map 0/18) you went from (10,19) to (10,15), and this map's SOUTH edge (to OLDALE TOWN (map 0/10)) went from 2 to 6 tiles away, counting tiles across and down.");
 });
 it("a whiteout, fly or scripted warp is not a move: no note, and the goal is still shown after it",async()=>{
  const home:GameStateSnapshot={...base,map_id:[1,1],location:"RAED's HOUSE 2F",position:{x:4,y:5}};
  const {h,texts}=await walk([route103(9,13),route103(9,10),{...route103(9,10),in_battle:true},home,{...home,position:{x:5,y:5}}]);
  expect(h.notes).toHaveLength(0);
  expect(texts[3]).toContain(`\n${LAB_GOAL}\n`);expect(texts[4]).toContain(`\n${LAB_GOAL}\n`);
 });
 it("no note inside the goal's own map, with no way to measure, or once a new story line replaces the goal",async()=>{
  const lab=(x:number,y:number):GameStateSnapshot=>({...base,map_id:[1,4],location:"PROF. BIRCH'S POKéMON LAB",position:{x,y}});
  expect((await walk([lab(6,5),lab(6,8),lab(6,11)])).h.notes).toHaveLength(0);
  // No map size known (the recorded state has the topology; without it): the SOUTH edge cannot be measured, so nothing is counted.
  const bare=(y:number):GameStateSnapshot=>({...route103(9,y),topology:null});
  expect((await walk([bare(13),bare(10),bare(7)])).h.notes).toHaveLength(0);
  // A map the table does not know.
  const unknown=(y:number):GameStateSnapshot=>({...route103(9,y),map_id:[99,99]});
  expect((await walk([unknown(13),unknown(10),unknown(7)])).h.notes).toHaveLength(0);
  const h=harness();h.feed(CAAA,result.seq);
  for(const [i,s] of [route103(9,13),route103(9,10)].entries()){h.nav.next(s,"x");await h.tools[2]?.execute(`m${String(i)}`,{});}
  for(const s of h.subs){
   s(checkEvent({v:1,run:RECORDED["4caa"].run,seq:900001,t:"2026-10-16T13:07:12.905-04:00",type:"dialogue_auto_advance",turn:300,tool_call_id:"g",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"X",map_id:[0,0],position:null,speaker:"MOM",speaker_source:"name_prefix",text:"Go to OLDALE TOWN."}],stop:"field_free",detail:"d",duration_ms:1}));
   s(checkEvent({v:1,run:RECORDED["4caa"].run,seq:900002,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn:300,id:"g",name:"press",is_error:false,duration_ms:1,text:"x",frames:[]}));
  }
  h.nav.next(route103(9,7),"x");
  const text=textOf(await h.tools[2]?.execute("m2",{}) ?? {content:[],details:undefined});
  expect(text).toContain("Story goal: \"Go to OLDALE TOWN.\" (MOM, turn 300) -> \"OLDALE TOWN\" = OLDALE TOWN (map 0/10). Way in: ");
  expect(text).toContain("; this map's SOUTH edge; ");
  expect(h.notes).toHaveLength(0);
 });
 it("off when the supervisor option is off: the header stays, no note",async()=>{
  const notes:unknown[]=[];const subs:((e:RunEvent)=>void)[]=[];
  const nav=scripted("navigate_to");
  const [tool]=withHarnessTrust([nav.tool],true,{subscribe:fn=>{subs.push(fn);},storyGoalAway:()=>{notes.push(1);}},{places:()=>Promise.resolve(PLACES)},{supervisor:false});
  for(const e of CAAA){if(e.seq>result.seq)break;for(const s of subs)s(e);}
  for(const [i,s] of [route103(9,13),route103(9,10),route103(9,7)].entries()){nav.next(s,"x");expect(textOf(await tool?.execute(`k${String(i)}`,{}) ?? {content:[],details:undefined})).toContain(LAB_GOAL);}
  expect(notes).toHaveLength(0);
 });
 it("measures each map edge from its own side, and nothing without a position or a way",()=>{
  const place=(id:[number,number])=>{const p=PLACES.places.find(q=>q.map_id[0]===id[0]&&q.map_id[1]===id[1]);if(p===undefined)throw Error("no place");return p;};
  const on=(id:[number,number],x:number,y:number):GameStateSnapshot=>({...base,map_id:id,position:{x,y},topology:{width:20,height:20,connections:[]}});
  expect(waysHere(on([0,9],5,7),[place([0,16])],PLACES.places)).toEqual([{label:"this map's NORTH edge (to ROUTE101 (map 0/16))",distance:7}]);
  expect(waysHere(on([0,10],5,7),[place([0,17])],PLACES.places)).toEqual([{label:"this map's WEST edge (to ROUTE102 (map 0/17))",distance:5}]);
  expect(waysHere(on([0,18],5,7),[place([0,25])],PLACES.places)).toEqual([{label:"this map's EAST edge (to ROUTE110 (map 0/25))",distance:14}]);
  expect(waysHere(on([0,9],5,7),[place([1,4])],PLACES.places)).toEqual([{label:"the door at (7,16) (to PROF. BIRCH'S POKéMON LAB (map 1/4))",distance:11}]);
  expect(waysHere({...on([0,9],5,7),position:null},[place([1,4])],PLACES.places)).toEqual([]);
  expect(waysHere(on([1,4],5,7),[place([1,4])],PLACES.places)).toEqual([]);
  expect(waysHere(on([99,99],5,7),[place([1,4])],PLACES.places)).toEqual([]);
  // A warp to a map the table does not list is named by its id.
  const odd=[...PLACES.places.filter(p=>!(p.map_id[0]===0&&p.map_id[1]===9)),{...place([0,9]),warps:[{x:1,y:1,to:[1,4] as [number,number]},{x:2,y:2,to:[77,77] as [number,number]}]}];
  expect(waysHere(on([0,9],5,7),[place([1,4]),{...place([1,4]),map_id:[77,77]}],odd).map(w=>w.label)).toEqual(["the door at (1,1) (to PROF. BIRCH'S POKéMON LAB (map 1/4))","the door at (2,2) (to a map (map 77/77))"]);
 });
 it("sideways moves, moves closer across a map edge, and unresolved or unmeasurable goals never add a note",async()=>{
  // Sideways: the same distance to the SOUTH edge.
  expect((await walk([route103(9,13),route103(10,13),route103(11,13)])).h.notes).toHaveLength(0);
  // Route 103 to Oldale is a step closer: it resets the count.
  expect((await walk([route103(9,13),route103(9,10),oldale(10,3),route103(10,21),route103(11,21)])).h.notes).toHaveLength(0);
  const walkAway=new WalkAway();
  const result272=resultAt(CAAA,272);
  const story=harness();story.feed(CAAA,result272.seq);
  // A goal with no resolved place, and a position or map the state does not give.
  const unresolved={line:{turn:1,speaker:"MOM",text:"Go to the SECRET TOMB.",lives:null},resolved:[{quote:"\"SECRET TOMB\"",text:": not resolved",target:null}]};
  expect(walkAway.observe(route103(9,13),unresolved,PLACES.places,true)).toBeNull();
  expect(walkAway.observe({...route103(9,13),position:null},null,PLACES.places,true)).toBeNull();
  // An adjacent map the table cannot count from.
  const lab=PLACES.places.find(p=>p.map_id[0]===1&&p.map_id[1]===4);if(lab===undefined)throw Error("no lab");
  const goal={line:{turn:1,speaker:"MAY",text:"the LAB",lives:null},resolved:[{quote:"\"LAB\"",text:" = lab",target:lab}]};
  const island=[...PLACES.places,{map_id:[50,50] as [number,number],name:"ISLAND",display:"ISLAND",warps:[],connections:[{direction:"SOUTH" as const,to:[0,18] as [number,number]}]}];
  const w2=new WalkAway();
  expect(w2.observe({...route103(9,13),map_id:[50,50],location:"ISLAND"},goal,island,true)).toBeNull();
  expect(w2.observe(route103(9,13),goal,island,true)).toBeNull();
  expect(w2.observe(route103(9,10),goal,island,true)).toBeNull();
 });
 it("says one map, not one maps, and needs a recorder for its events",()=>{
  const facts:StoryGoalAwayFacts={speaker:"MAY",line_turn:1,quote:"q",targets:[{name:"LAB",map_id:[1,4]}],steps:[{measure:"maps",from_map:[0,16],to_map:[0,10],from_name:"ROUTE101",to_name:"OLDALE TOWN",from:{x:1,y:1},to:{x:1,y:1},before:0,after:1,way:null},{measure:"maps",from_map:[0,10],to_map:[0,18],from_name:"OLDALE TOWN",to_name:"ROUTE103",from:{x:1,y:1},to:{x:1,y:1},before:1,after:2,way:null}]};
  expect(awayText(facts)).toContain("from 0 to 1 map away from it by the game's map table");
  expect(awayText(facts)).toContain("from 1 to 2 maps away from it by the game's map table");
  expect(()=>withHarnessTrust([],true,{subscribe:()=>undefined},{})).toThrow("harness-trust-v1 needs a recorder for story_goal_away events");
  expect(withHarnessTrust([],true,{subscribe:()=>undefined},{},{supervisor:false})).toEqual([]);
 });
 it("a malformed map table reads as unreadable",async()=>{
  const result=resultAt(CAAA,272);const state=stateAt(CAAA,result.state_seq ?? -1);
  for(const places of [()=>Promise.resolve({places:"nope"})]){
   const h=harness(true,places);h.feed(CAAA,result.seq);h.observe.next(state,"x");
   expect(textOf(await h.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toMatch(/\nStory goal: not known; the game's map table could not be read \((malformed \/pokebench\/places|HTTP 500)\)\.\n/);
  }
 });
});

describe("harness-trust-v1 exits line (exit-reachability-v1's foot labels)",()=>{
 const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/exit-reach-states.json.gz",import.meta.url))).toString("utf8")) as {states:Record<string,unknown>};
 const recorded=(key:string)=>parseGameState(FIXTURE.states[key]);
 it("0e05 Route 104 south half: only the exits the server reaches on foot, never the cut-off NORTH edge or the water SOUTH edge",()=>{
  expect(exitsLine(recorded("0e05:22579"),PLACES.places)).toBe("Exits you can walk to from where you stand: (17,50) -> ROUTE104 MR BRINEYS HOUSE (map 17/0); (10,38) or (11,38) -> PETALBURG WOODS (map 24/11); EAST edge -> PETALBURG CITY (map 0/0).");
 });
 it("4198 Route 103: the SOUTH edge only; Altering Cave and the EAST edge are across water",()=>{
  expect(exitsLine(recorded("4198:23325"),PLACES.places)).toBe("Exits you can walk to from where you stand: SOUTH edge -> OLDALE TOWN (map 0/10).");
 });
 it("says none when nothing is on foot reach, and says nothing without exit_reach, a well-formed mask or the map in the table",()=>{
  const s=recorded("4198:23325");
  const reach=s.exit_reach;if(reach===undefined)throw Error("no exit_reach");
  expect(exitsLine({...s,exit_reach:{...reach,connections:reach.connections.map(c=>({...c,reach:"none" as const}))}},PLACES.places)).toBe("Exits you can walk to from where you stand: none (no exit of this map can be reached on foot from your tile).");
  expect(exitsLine(parseGameState(Object.fromEntries(Object.entries(s).filter(([k])=>k!=="exit_reach"))),PLACES.places)).toBeNull();
  expect(exitsLine({...s,exit_reach:{...reach,foot:{...reach.foot,rows:[]}}},PLACES.places)).toBeNull();
  expect(exitsLine({...s,map_id:[99,99]},PLACES.places)).toBeNull();
  // A warp the table does not list, or one to a dynamic destination, is left out rather than guessed.
  expect(exitsLine({...s,exit_reach:{...reach,warps:[{x:1,y:1,reach:"foot"}]}},PLACES.places)).toBe("Exits you can walk to from where you stand: SOUTH edge -> OLDALE TOWN (map 0/10).");
 });
 it("joins the header after the characters line when the result's state carries exit_reach",async()=>{
  const h=harness();const s=recorded("4198:23325");
  h.observe.next(s,"Story characters here (from this map's own object list): MAY at 10,3. Not on this map: MOM.");
  expect(textOf(await h.tools[0]?.execute("o",{}) ?? {content:[],details:undefined})).toBe(`|${TRUST_HEADER}\nStory goal: no story character has named a place yet in this run.\nStory characters on this map (from its own object list): MAY at 10,3.\nExits you can walk to from where you stand: SOUTH edge -> OLDALE TOWN (map 0/10).\n\nStory characters here (from this map's own object list): MAY at 10,3. Not on this map: MOM.`);
 });
});

describe("harness-trust-v1 map table reads",()=>{
 it("reads the map table once per player name, since the player's house is named after the player",async()=>{
  const result=resultAt(CAAA,272);const state=stateAt(CAAA,result.state_seq ?? -1);
  let calls=0;
  const h=harness(true,()=>{calls++;return Promise.resolve(PLACES);});
  for(const name of ["RAED","RAED",null,"MAY2","RAED"]){h.observe.next({...state,name},"x");await h.tools[0]?.execute("o",{});}
  expect(calls).toBe(3);
 });
});

describe("harness-trust-v1 walk-away review round 1",()=>{
 const result=resultAt(CAAA,272);
 const base=stateAt(CAAA,result.state_seq ?? -1);
 const route103=(x:number,y:number):GameStateSnapshot=>({...base,map_id:[0,18],location:"ROUTE103",position:{x,y},field_controls_locked:false});
 async function walkWith(tool:0|1|2,states:readonly GameStateSnapshot[],places=PLACES){
  const h=harness(true,()=>Promise.resolve(places));h.feed(CAAA,result.seq);
  const scripts=[h.observe,h.press,h.nav];
  for(const [i,s] of states.entries()){scripts[tool]?.next(s,"x");await h.tools[tool]?.execute(`w${String(i)}`,{});}
  return h;
 }
 it("movement seen only by observe, or with field controls locked (a script moving the player), is not the player's move",async()=>{
  expect((await walkWith(0,[route103(9,13),route103(9,10),route103(9,7)])).notes).toHaveLength(0);
  const locked=(x:number,y:number)=>({...route103(x,y),field_controls_locked:true});
  expect((await walkWith(1,[route103(9,13),locked(9,10),locked(9,7)])).notes).toHaveLength(0);
  expect((await walkWith(2,[route103(9,13),route103(9,10),{...route103(9,7),field_controls_locked:null}])).notes).toHaveLength(0);
  // A press that moves the player with controls free counts, like navigate_to.
  expect((await walkWith(1,[route103(9,13),route103(9,10),route103(9,7)])).notes).toHaveLength(1);
 });
 it("with two ways toward the goal, each move is measured to the same way before and after",async()=>{
  const town=PLACES.places.find(p=>p.map_id[0]===0&&p.map_id[1]===9);if(town===undefined)throw Error("no town");
  const places={places:[...PLACES.places.filter(p=>p!==town),{...town,warps:[...town.warps,{x:1,y:1,to:[1,4] as [number,number]}]}]};
  const at=(x:number,y:number):GameStateSnapshot=>({...base,map_id:[0,9],location:"LITTLEROOT TOWN",position:{x,y},field_controls_locked:false});
  const h=await walkWith(2,[at(2,2),at(4,9),at(4,4)],places);
  expect(h.notes).toHaveLength(1);
  expect(h.notes[0]?.facts.steps.map(s=>[s.way,s.before,s.after])).toEqual([
   ["the door at (1,1) (to PROF. BIRCH'S POKéMON LAB (map 1/4))",2,11],
   ["the door at (7,16) (to PROF. BIRCH'S POKéMON LAB (map 1/4))",10,15],
  ]);
 });
});
