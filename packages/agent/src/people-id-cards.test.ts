import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {CARDS_HEADER,PeopleIdCards,isPerson,type IdCard} from "./people-id-cards.js";
import {PEOPLE_HEADER} from "./people-ledger.js";
import {dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,stateOnlyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";

// Recorded runs, cut to dialogue_auto_advance, tool_result, tool_call, turn_start and the states they cite
// (state fields the cards do not read are dropped; tool_result text kept only at T211 and T551 of 4caa).
const load=(name:string):RunEvent[]=>gunzipSync(readFileSync(new URL(`./fixtures/people-id-cards-${name}.jsonl.gz`,import.meta.url))).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
const RUN_4CAA=load("4caa"),RUN_F551=load("f551");
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const snapshot=(e:RunEvent):GameStateSnapshot=>parseGameState(Object.fromEntries(Object.entries(e).filter(([k])=>!ENVELOPE.has(k))));

interface Shown {readonly turn:number;readonly id:string;readonly card:IdCard}
interface Replay {readonly model:PeopleIdCards;readonly shown:Shown[];readonly rows:Map<number,ReadonlyMap<string,string>>}
// Replays a run the way the wrapper sees it: each result's cards are taken before its tool_result is recorded.
function replay(events:readonly RunEvent[],until=Infinity):Replay {
 const model=new PeopleIdCards();const states=new Map<number,RunEvent>();const shown:Shown[]=[];const rows=new Map<number,ReadonlyMap<string,string>>();
 for(const e of events){
  if(e.turn>until)break;
  if(e.type==="state")states.set(e.seq,e);
  if(e.type==="tool_result"&&e.state_seq!==undefined){
   const s=states.get(e.state_seq);
   if(s!==undefined&&"started" in s){const out=model.cards(snapshot(s),e.id);if(out!==null){for(const card of out.cards)shown.push({turn:e.turn,id:e.id,card});rows.set(e.turn,out.summaries);}}
  }
  model.observe(e);
 }
 return {model,shown,rows};
}
const FULL=replay(RUN_4CAA);
// The compact summaries of the last overworld result at or before a turn.
const rowAt=(r:Replay,turn:number,key:string):string|undefined=>[...r.rows].filter(([t])=>t<=turn).at(-1)?.[1].get(key);
const cardAt=(turn:number,key:string):string=>{const c=FULL.shown.find(s=>s.turn===turn&&s.card.key===key);if(c===undefined)throw new Error(`no card ${key} at ${String(turn)}`);return c.card.text;};

const MAY_T107=["Huh?\nWho… Who are you?","… … … … … … … …\n… … … … … … … …","Oh, you're RAED.\nSo your move was today.","Um… I'm MAY.\nGlad to meet you!","I…\nI have this dream of becoming friends","with POKéMON all over the world.","I… I heard about you, RAED, from\nmy dad, PROF. BIRCH.","I was hoping that you would be nice,\nRAED, and that we could be friends.","Oh, this is silly, isn't it?\nI… I've just met you, RAED.","Eheheh…","Oh, no! I forgot!","I was supposed to go help Dad catch\nsome wild POKéMON!","RAED, I'll catch you later!"];
const T211=[
 "ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 2, at 10,3 on ROUTE103 (map 0/18)",
 "- Name: MAY. The game first showed this name on turn 107.",
 "- Seen on: PROF. BIRCH'S HOUSE 1F (map 1/2) from turn 105; ROUTE103 (map 0/18) from turn 211.",
 "- Last spoke to you: turn 107, 13 pages, whole:",
 ...MAY_T107.map(t=>`  turn 107 · PROF. BIRCH'S HOUSE 1F (map 1/2) · at 2,4 · RIVAL_MAY_NORMAL (sprite kind, not a name): "${t}"`),
 "- Other pages that name them (each once, in order, whole):",
 "  turn 143 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: \"My kid, MAY, is also studying\nPOKéMON while helping me out.\"",
 "  turn 143 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: \"RAED, don't you think it might be\na good idea to go see MAY?\"",
 "  turn 144 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: \"PROF. BIRCH: Great!\nMAY should be happy, too.\"",
 "  turn 144 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: \"Get MAY to teach you what it\nmeans to be a TRAINER.\"",
 "- Battles with you: none recorded in this run.",
].join("\n");

describe("people-id-cards-v1 on run 2026-10-16T12-42-29_qwen36-gpu0_4caa",()=>{
 it("shows 38 cards in the run: first sight, and re-entry into view after the card changed",()=>{
  expect(FULL.shown.map(s=>`${String(s.turn)} ${s.card.key} ${s.card.reason}`)).toEqual([
   "56 name:MOM first","67 name:MOM changed","72 name:MOM changed","83 obj:0/9#2 first","85 obj:0/9#3 first","87 obj:1/4#1 first","99 obj:1/2#6 first","99 obj:1/2#4 first","104 obj:1/2#4 changed","105 name:MAY first",
   "112 obj:1/4#1 changed","123 obj:0/9#1 first","127 name:PROF. BIRCH first","138 obj:1/4#1 changed","147 obj:0/9#1 changed","149 name:MOM changed","157 name:MOM changed","163 obj:0/16#6 first","174 obj:0/16#1 first","182 obj:0/10#2 first",
   "183 obj:2/2#2 first","183 obj:2/2#3 first","183 obj:2/2#4 first","184 obj:2/2#1 first","189 obj:0/10#1 first","200 obj:0/18#10 first","211 name:MAY changed","281 obj:0/10#3 first","285 name:MAY changed","297 obj:2/2#1 changed",
   "323 obj:0/18#10 changed","398 obj:0/10#3 changed","402 obj:2/0#1 first","505 name:PROF. BIRCH changed","505 name:MAY changed","510 name:MOM changed","547 obj:0/17#5 first","551 obj:0/17#2 first",
  ]);
 });
 it("T211: MAY on Route 103 with her T107 words, Birch's lines that name her (his direction quoted verbatim) and no battles yet",()=>{
  expect(cardAt(211,"name:MAY")).toBe(T211);
 });
 it("MAY stays in view T262–T266 and re-enters at T239 and T246 unchanged: no card repeats",()=>{
  expect(FULL.shown.filter(s=>s.card.key==="name:MAY"&&s.turn>211&&s.turn<285)).toEqual([]);
  expect(rowAt(FULL,262,"name:MAY")).toBe("name shown by the game on turn 107; last spoke to you on turn 107; battles: none");
  // The compact summary carries her T267 words and the battle at once, while she is still in view.
  expect(rowAt(FULL,273,"name:MAY")).toBe("name shown by the game on turn 107; last spoke to you on turn 272; battle text on turns 267, 272");
 });
 it("T285: MAY in Oldale after the battle: her T272 words, the game's battle text, and her self-introduction moved to the other pages",()=>{
  const card=cardAt(285,"name:MAY");
  expect(card).toContain("- Seen on: PROF. BIRCH'S HOUSE 1F (map 1/2) from turn 105; ROUTE103 (map 0/18) from turn 211; OLDALE TOWN (map 0/10) from turn 285.");
  expect(card).toContain("- Last spoke to you: turn 272, 4 pages, whole:\n  turn 272 · ROUTE103 (map 0/18) · at 9,3 · MAY: \"MAY: I think I know why my dad has\nan eye out for you now.\"");
  expect(card).toContain("- Other pages that name them (each once, in order, whole):\n  turn 107 · PROF. BIRCH'S HOUSE 1F (map 1/2) · at 2,4 · RIVAL_MAY_NORMAL (sprite kind, not a name): \"Um… I'm MAY.\nGlad to meet you!\"");
  expect(card.endsWith([
   "- Battles with you (the game's own battle text, in order, whole):",
   "  turn 267 · ROUTE103 (map 0/18) · battle turn 1: \"PKMN TRAINER MAY\nwould like to battle!\"",
   "  turn 267 · ROUTE103 (map 0/18) · battle turn 1: \"PKMN TRAINER MAY sent\nout MUDKIP!\"",
   "  turn 272 · ROUTE103 (map 0/18) · battle turn 4: \"Player defeated\nPKMN TRAINER MAY!\"",
  ].join("\n"))).toBe(true);
 });
 it("T105: a story name the readout shows before the game says it keeps its provenance (the game says \"I'm MAY\" at T107)",()=>{
  expect(cardAt(105,"name:MAY")).toBe([
   "ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 7, at 2,8 on PROF. BIRCH'S HOUSE 1F (map 1/2)",
   "- Name: MAY, from the harness's story-character table (this graphic on a map where the game's story places MAY); the game has not shown this name in this run yet.",
   "- First seen: turn 105, here.",
   "- Has not spoken to you in this run.",
   "- Other pages that name them: none.",
   "- Battles with you: none recorded in this run.",
  ].join("\n"));
 });
 it("T56: MOM's first card does not repeat the conversation of the same call; it says she spoke during this call",()=>{
  expect(cardAt(56,"name:MOM")).toBe([
   "ID card: MOM (sprite MOM), map object 1, at 9,8 on RAED's HOUSE 1F (map 1/0)",
   "- Name: MOM, from the harness's story-character table (this graphic on a map where the game's story places MOM); the game has not shown this name in this run yet.",
   "- First seen: turn 56, here.",
   "- Has not spoken to you in this run.",
   "- Other pages that name them: none.",
   "- Battles with you: none recorded in this run.",
   "- Also spoke to you during this call (see this result's dialogue list).",
  ].join("\n"));
 });
 it("T510: MOM outdoors, seen on three maps, last words from T154",()=>{
  expect(cardAt(510,"name:MOM")).toBe([
   "ID card: MOM (sprite MOM), map object 4, at 5,9 on LITTLEROOT TOWN (map 0/9)",
   "- Name: MOM. The game first showed this name on turn 56.",
   "- Seen on: RAED's HOUSE 1F (map 1/0) from turn 56; RAED's HOUSE 2F (map 1/1) from turn 67; LITTLEROOT TOWN (map 0/9) from turn 510.",
   "- Last spoke to you: turn 154, 3 pages, whole:",
   "  turn 154 · RAED's HOUSE 1F (map 1/0) · at 2,5 · MOM: \"MOM: How are you doing, RAED?\nYou look a little tired.\"",
   "  turn 154 · RAED's HOUSE 1F (map 1/0) · at 2,5 · MOM: \"I think you should rest a bit.\"",
   "  turn 154 · RAED's HOUSE 1F (map 1/0) · at 2,5 · MOM: \"MOM: Take care, honey!\"",
   "- Other pages that name them: none.",
   "- Battles with you: none recorded in this run.",
  ].join("\n"));
 });
 it("T184 and T297: the nurse has no name; after the T185–T186 talk across the counter her words are quoted whole",()=>{
  expect(cardAt(184,"obj:2/2#1")).toBe([
   "ID card: sprite NURSE, map object 1, at 7,2 on OLDALE TOWN POKEMON CENTER 1F (map 2/2)",
   "- Name: none shown by the game (a sprite kind is a graphic, not a name).",
   "- First seen: turn 184, here.",
   "- Has not spoken to you in this run.",
   "- Battles with you: none recorded in this run.",
  ].join("\n"));
  const tag="(no speaker shown by the game; on screen: NURSE at 7,2; GENTLEMAN at 4,4; BOY_1 at 10,6; GIRL_3 at 3,7)";
  expect(cardAt(297,"obj:2/2#1")).toContain(["- Last spoke to you: turn 186, 4 pages, whole:",
   `  turn 186 · OLDALE TOWN POKEMON CENTER 1F (map 2/2) · at 7,4 · ${tag}: "Okay, I'll take your POKéMON\nfor a few seconds."`,
   `  turn 186 · OLDALE TOWN POKEMON CENTER 1F (map 2/2) · at 7,4 · ${tag}: "Thank you for waiting."`,
   `  turn 186 · OLDALE TOWN POKEMON CENTER 1F (map 2/2) · at 7,4 · ${tag}: "We've restored your POKéMON\nto full health."`,
   `  turn 186 · OLDALE TOWN POKEMON CENTER 1F (map 2/2) · at 7,4 · ${tag}: "We hope to see you again!"`].join("\n"));
  // The same words again at T307–T308 change nothing, so her later re-entries (T453) show no card.
  expect(FULL.shown.some(s=>s.card.key==="obj:2/2#1"&&s.turn>297)).toBe(false);
 });
 it("T551: the unbeaten YOUNGSTER on Route 102 shows no trainer facts",()=>{
  expect(cardAt(551,"obj:0/17#2")).toBe([
   "ID card: sprite YOUNGSTER, map object 2, at 33,14 on ROUTE102 (map 0/17)",
   "- Name: none shown by the game (a sprite kind is a graphic, not a name).",
   "- First seen: turn 551, here.",
   "- Has not spoken to you in this run.",
   "- Battles with you: none recorded in this run.",
  ].join("\n"));
 });
 it("writes no relation, role, trainer or direction words of its own: every such word is inside a quoted game page",()=>{
  const forbidden=/\b(rival|friend|neighbou?r|daughter|son|kid|dad|mom|mother|father|heal|shop|sell|trainer|sight|watches|beaten|go|visit|should|need|must|next)\b/i;
  for(const {card} of FULL.shown){
   const own=card.text.split("\n").filter(l=>l.startsWith("ID card: ")||l.startsWith("- ")).map(l=>l.replace(/sprite [A-Z0-9_]+/g,"sprite").replace(/^ID card: [A-Z. ]+ \(/,"ID card: (").replace(/^- Name: [A-Z. ]+[.,]/,"- Name:").replace(/places [A-Z. ]+\)/,"places)"));
   for(const line of own)expect(line).not.toMatch(forbidden);
  }
 });
});

describe("people-id-cards-v1 battles on run 2026-10-16T15-45-24_qwen36-gpu1_f551",()=>{
 const run=replay(RUN_F551);
 it("labels a trainer's battle text from the intro right after their field lines, and quotes only the game's battle text",()=>{
  expect(run.shown.find(s=>s.card.key==="obj:0/17#2")?.turn).toBe(525);
  expect(rowAt(run,534,"obj:0/17#2")).toBe("no name shown; last spoke to you on turn 529; battle text on turn 529");
  expect(rowAt(run,538,"obj:0/17#2")).toBe("no name shown; last spoke to you on turn 529; battle text on turns 529, 534");
  expect(rowAt(run,548,"obj:0/17#3")).toBe("no name shown; last spoke to you on turn 540; battle text on turns 540, 543, 545");
  // Calvin comes back into view later: his card now has the game's battle text and still no trainer facts.
  const later=snapshot(RUN_F551.find(e=>e.type==="state"&&"started" in e&&e.turn===525&&(e.world_context?.objects??[]).some(o=>o.local_id===2))??RUN_F551[0] as RunEvent);
  expect(run.model.cards({...later,position:{x:33,y:30}},"away")?.cards).toEqual([]);
  const card=run.model.cards(later,"back")?.cards.find(c=>c.key==="obj:0/17#2");
  expect(card?.reason).toBe("changed");
  expect(card?.text).toContain("- Battles with you (the game's own battle text, in order, whole):\n  turn 529 · ROUTE102 (map 0/17) · battle turn 1: \"YOUNGSTER CALVIN\nwould like to battle!\"\n  turn 529 · ROUTE102 (map 0/17) · battle turn 1: \"YOUNGSTER CALVIN sent\nout POOCHYENA!\"\n  turn 534 · ROUTE102 (map 0/17) · battle turn 3: \"Player defeated\nYOUNGSTER CALVIN!\"");
  expect(card?.text).toContain("- Last spoke to you: turn 529, 2 pages, whole:\n  turn 529 · ROUTE102 (map 0/17) · at 33,15 · YOUNGSTER (sprite kind, not a name): \"If you have POKéMON with you, then\nyou're an official POKéMON TRAINER!\"");
  expect(card?.text).toContain("- Name: none shown by the game (a sprite kind is a graphic, not a name).");
  // The level-up pages of that battle are no one's words.
  expect(card?.text).not.toContain("Level-up");
 });
});

// Synthetic states: objects as world_context lists them (live, visible, within 7 tiles) and the scripted
// ones as interaction_targets, in a room on map 1/2.
type Obj={local_id:number;x:number;y:number;sprite:string;graphics?:number};
const room=(objects:readonly Obj[],extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...IN_GAME,location:"ROOM",map_id:[1,2],position:{x:5,y:5},facing:"up",
 world_context:{objects:objects.map(o=>({local_id:o.local_id,map_id:[1,2],graphics_id:o.graphics??7,sprite_kind:o.sprite,x:o.x,y:o.y})),triggers:[],dialogue:null},
 interaction_targets:objects.map(o=>({name:o.sprite,kind:"object",x:o.x,y:o.y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:o.local_id,destination:null})),...extra});
let seq=0;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-16T17:00:00.000-04:00",turn:1,seq:++seq,...body});
const stateEv=(s:GameStateSnapshot,turn:number)=>ev({type:"state",turn,...s});
const page=(state:RunEvent,text:string,speaker:string|null,source:"name_prefix"|"faced_sprite"|null,extra:Record<string,unknown>={})=>({state_seq:state.seq,map:"ROOM",map_id:[1,2],position:{x:5,y:5},speaker,speaker_source:source,text,...extra});
const talk=(turn:number,id:string,pages:unknown[],sent=["A"])=>ev({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:sent,sent,dropped:[],auto_presses:1,pages,stop:"field_free",detail:"closed",duration_ms:1});
const result=(id:string,turn:number,is_error=false)=>ev({type:"tool_result",turn,id,name:"press",is_error,duration_ms:1,text:"ok",frames:[]});
const MAN:Obj={local_id:1,x:5,y:4,sprite:"MAN_1"};

describe("people-id-cards-v1 rules",()=>{
 it("cards people only: no card for Pokémon, items or terrain; on screen is 7 columns and 5 rows",()=>{
  expect(isPerson("NURSE")).toBe(true);
  for(const sprite of ["ZIGZAGOON_1","VIGOROTH_CARRYING_BOX","ITEM_BALL","CUTTABLE_TREE","TRUCK","BIRCHS_BAG","MUDKIP_DOLL",null])expect(isPerson(sprite)).toBe(false);
  const model=new PeopleIdCards();
  const out=model.cards(room([MAN,{local_id:2,x:6,y:5,sprite:"ZIGZAGOON_1"},{local_id:3,x:12,y:10,sprite:"LASS"},{local_id:4,x:5,y:11,sprite:"LASS"},{local_id:5,x:12,y:5,sprite:"HIKER"}]),"a");
  expect(out?.cards.map(c=>c.key)).toEqual(["obj:1/2#1","obj:1/2#5","obj:1/2#3"]);
 });
 it("adds nothing outside a started overworld readout with a position and live objects",()=>{
  const model=new PeopleIdCards();
  expect(model.cards({...room([MAN]),in_battle:true},"a")).toBeNull();
  expect(model.cards({...room([MAN]),screen:"battle"},"a")).toBeNull();
  expect(model.cards({...room([MAN]),started:false},"a")).toBeNull();
  expect(model.cards({...room([MAN]),position:null},"a")).toBeNull();
  expect(model.annotate("Location: ROOM",{...room([MAN]),in_battle:true},"a")).toEqual({text:"Location: ROOM",cards:[]});
  expect(model.annotate("no location line",room([MAN]),"a")).toEqual({text:"no location line",cards:[]});
 });
 it("re-shows a card only on re-entry into view after a change; a change in view goes to the row summary",()=>{
  const model=new PeopleIdCards();
  const here=room([MAN]),gone=room([]);
  const s1=stateEv(here,1);model.observe(s1);
  expect(model.cards(here,"c1")?.cards.map(c=>c.reason)).toEqual(["first"]);
  model.observe(talk(1,"c1",[page(s1,"Nice day.","MAN_1","faced_sprite")]));model.observe(result("c1",1));
  // Still in view after the talk: no card, the summary has the words.
  const in1=model.cards(here,"c2");
  expect(in1?.cards).toEqual([]);
  expect(in1?.summaries.get("obj:1/2#1")).toBe("no name shown; last spoke to you on turn 1; battles: none");
  expect(model.cards(gone,"c3")?.cards).toEqual([]);
  const back=model.cards(here,"c4")?.cards;
  expect(back?.map(c=>c.reason)).toEqual(["changed"]);
  expect(back?.[0]?.text).toContain("- Last spoke to you: turn 1, 1 page, whole:\n  turn 1 · ROOM (map 1/2) · at 5,5 · MAN_1 (sprite kind, not a name): \"Nice day.\"");
  // The same words again on a later turn change nothing.
  const s2=stateEv(here,5);model.observe(s2);model.observe(talk(5,"c5",[page(s2,"Nice day.","MAN_1","faced_sprite")]));model.observe(result("c5",5));
  model.cards(gone,"c6");
  expect(model.cards(here,"c7")?.cards).toEqual([]);
  expect(model.cards(here,"c8")?.summaries.get("obj:1/2#1")).toBe("no name shown; last spoke to you on turn 5; battles: none");
 });
 it("quotes only delivered results: an errored result's pages and this call's own pages are never quoted",()=>{
  const model=new PeopleIdCards();
  const here=room([MAN]);const s1=stateEv(here,1);model.observe(s1);
  model.observe(talk(1,"bad",[page(s1,"Lost words.","MAN_1","faced_sprite")]));model.observe(result("bad",1,true));
  model.observe(talk(2,"now",[page(s1,"Hello there.","MAN_1","faced_sprite")]));
  const card=model.cards(here,"now")?.cards[0]?.text??"";
  expect(card).toContain("- Has not spoken to you in this run.");
  expect(card).toContain("- Also spoke to you during this call (see this result's dialogue list).");
  expect(card).not.toContain("Lost words.");
  expect(card).not.toContain("Hello there.");
 });
 it("attributes a speakerless page to the person the call's first page faced only after an A press, and never a page without a position",()=>{
  const model=new PeopleIdCards();
  const here=room([MAN]);const s1=stateEv(here,1);model.observe(s1);
  model.observe(talk(1,"walk",[page(s1,"A voice calls out.",null,null)],["UP"]));model.observe(result("walk",1));
  model.observe(talk(2,"lv",[page(s1,"Level-up stats box",null,null,{position:null})]));model.observe(result("lv",2));
  expect(model.cards(here,"x")?.cards[0]?.text).toContain("- Has not spoken to you in this run.");
  model.observe(talk(3,"a",[page(s1,"Welcome!",null,null)]));model.observe(result("a",3));
  expect(model.cards(here,"y")?.summaries.get("obj:1/2#1")).toBe("no name shown; last spoke to you on turn 3; battles: none");
  // A name label of someone who is not a story character belongs to no one.
  model.observe(talk(4,"tv",[page(s1,"INTERVIEWER: Hello.","INTERVIEWER","name_prefix")]));model.observe(result("tv",4));
  expect(model.cards(here,"z")?.summaries.get("obj:1/2#1")).toBe("no name shown; last spoke to you on turn 3; battles: none");
 });
 it("names a story character across maps by name, matches the name as a whole word, and attributes a scripted object without a script",()=>{
  const model=new PeopleIdCards();
  const lab=(objects:readonly Obj[],map:[number,number],location:string,pos={x:5,y:5})=>parseGameState({...room([]),location,map_id:map,position:pos,
   world_context:{objects:objects.map(o=>({local_id:o.local_id,map_id:map,graphics_id:o.graphics??7,sprite_kind:o.sprite,x:o.x,y:o.y})),triggers:[],dialogue:null},interaction_targets:[]});
  const may:Obj={local_id:7,x:5,y:4,sprite:"RIVAL_MAY_NORMAL",graphics:105};
  const house=lab([may],[1,2],"LITTLEROOT TOWN MAYS HOUSE 1F");
  const s1=stateEv(house,1);model.observe(s1);
  model.cards(house,"a");
  model.observe(talk(1,"t",[{...page(s1,"I'm MAY. MAYBE later.","RIVAL_MAY_NORMAL","faced_sprite"),map:"LITTLEROOT TOWN MAYS HOUSE 1F",map_id:[1,2]}]));model.observe(result("t",1));
  const s2=stateEv(house,2);model.observe(s2);
  model.observe(talk(2,"u",[page(s2,"PROF. BIRCH: MAYBE tomorrow.","PROF. BIRCH","name_prefix"),page(s2,"MAY is out.","PROF. BIRCH","name_prefix"),page(s2,"MAY is out.","PROF. BIRCH","name_prefix")]));model.observe(result("u",2));
  const route=lab([{...may,local_id:2,x:6,y:5}],[0,18],"ROUTE103");
  model.cards(lab([],[0,18],"ROUTE103"),"gone");
  const card=model.cards(route,"b")?.cards[0];
  expect(card?.key).toBe("name:MAY");
  expect(card?.text).toContain("- Name: MAY. The game first showed this name on turn 1.");
  expect(card?.text).toContain("- Seen on: LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2) from turn 1; ROUTE103 (map 0/18) from turn 2.");
  expect(card?.text).toContain("- Last spoke to you: turn 1, 1 page, whole:");
  expect(card?.text).toContain("- Other pages that name them (each once, in order, whole):\n  turn 2 · ROOM (map 1/2) · at 5,5 · PROF. BIRCH: \"MAY is out.\"\n- Battles");
  expect(card?.text).not.toContain("MAYBE tomorrow");
 });
 it("puts the cards after the people-ledger block and the summary on each carded row; without the block, after Position",()=>{
  const model=new PeopleIdCards();
  const here=room([MAN,{local_id:2,x:6,y:5,sprite:"ITEM_BALL"}]);
  const readout=["Screen: overworld","Location: ROOM","Position: X=5, Y=5, facing up",PEOPLE_HEADER,"- object 1, sprite MAN_1, at (5,4): not talked to this run","- object 2, sprite ITEM_BALL, at (6,5): not talked to this run","Story characters here: none. Not on this map: MOM.","Party (player): none"].join("\n");
  const out=model.annotate(readout,here,"a");
  expect(out.cards.length).toBe(1);
  expect(out.text).toBe(["Screen: overworld","Location: ROOM","Position: X=5, Y=5, facing up",PEOPLE_HEADER,
   "- object 1, sprite MAN_1, at (5,4): not talked to this run; ID card: no name shown; has not spoken to you; battles: none",
   "- object 2, sprite ITEM_BALL, at (6,5): not talked to this run","Story characters here: none. Not on this map: MOM.",
   CARDS_HEADER,out.cards[0]?.text,"Party (player): none"].join("\n"));
  // Second look in view: no card, the row summary stays.
  expect(model.annotate(readout,here,"b").text).toBe(out.text.replace(`${CARDS_HEADER}\n${out.cards[0]?.text??""}\n`,""));
  const bare=new PeopleIdCards().annotate("Location: ROOM\nPosition: X=5, Y=5, facing up\nParty (player): none",here,"c");
  expect(bare.text.split("\n").slice(0,3)).toEqual(["Location: ROOM","Position: X=5, Y=5, facing up",CARDS_HEADER]);
  expect(bare.text.endsWith("\nParty (player): none")).toBe(true);
  // A named row gets its story character's summary.
  const named=new PeopleIdCards();
  const s=parseGameState({...room([]),location:"ROUTE103",map_id:[0,18],world_context:{objects:[{local_id:2,map_id:[0,18],graphics_id:105,sprite_kind:"RIVAL_MAY_NORMAL",x:5,y:3}],triggers:[],dialogue:null}});
  const row=named.annotate(`Location: ROUTE103\n${PEOPLE_HEADER}\n- object 2, MAY (sprite RIVAL_MAY_NORMAL), at (5,3): not talked to this run\n- object 9, sprite BOY_1, at (30,3): not talked to this run`,s,"d").text;
  expect(row).toContain("- object 2, MAY (sprite RIVAL_MAY_NORMAL), at (5,3): not talked to this run; ID card: name MAY from the harness's story-character table, not yet shown by the game; has not spoken to you; battles: none");
  expect(row).toContain("- object 9, sprite BOY_1, at (30,3): not talked to this run\nID cards");
 });
 it("never clips a page",()=>{
  const model=new PeopleIdCards();
  const here=room([MAN]);const s1=stateEv(here,1);model.observe(s1);
  const long=`${"A very long line. ".repeat(40)}\nEnd.`;
  model.observe(talk(1,"t",[page(s1,long,"MAN_1","faced_sprite")]));model.observe(result("t",1));
  expect(model.cards(here,"x")?.cards[0]?.text).toContain(`"${long}"`);
 });
});

describe("people-id-cards-v1 registration",()=>{
 const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
 it("is an observation switch that needs the people ledger, last in the registry and harness feature list, and off unless asked for",()=>{
  expect(SWITCHABLE_FEATURES.at(-140)).toBe("people-id-cards-v1");
  const info=featureInfo("people-id-cards-v1");
  expect(info).toMatchObject({group:"observation",title:"PEOPLE ID CARDS",needs:"people-ledger-v1",switchable:true});
  expect(info.description).toContain(" Off: no cards, no row summaries, no prompt section and no event");
  expect(dependencyProblems({...OFF,"people-id-cards-v1":true})).toContain("people-id-cards-v1 needs people-ledger-v1");
  expect(playHarnessFeatures(withoutFrontierTreatments({...OFF,"battle-refusal-loop-v1":false,"people-id-cards-v1":true}),null).at(-1)).toBe("people-id-cards-v1");
  expect(playHarnessFeatures(OFF,null)).not.toContain("people-id-cards-v1");
  expect(stateOnlyProblems({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires people-id-cards-v1 OFF");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["people-id-cards-v1"]).toBe(false);
  const preset=parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:{...OFF}});
  expect(presetFeatures(preset)["people-id-cards-v1"]).toBe(false);
 });
});

describe("people-id-cards-v1 without character presence",()=>{
 it("names no story character: MAY is her sprite kind on her own map object, and her NAME: pages belong to no one",()=>{
  const plain=new PeopleIdCards(false);
  const map=(objects:readonly Obj[])=>parseGameState({...room([]),location:"ROUTE103",map_id:[0,18],world_context:{objects:objects.map(o=>({local_id:o.local_id,map_id:[0,18],graphics_id:o.graphics??7,sprite_kind:o.sprite,x:o.x,y:o.y})),triggers:[],dialogue:null},interaction_targets:[]});
  const may:Obj={local_id:2,x:5,y:4,sprite:"RIVAL_MAY_NORMAL",graphics:105};
  const s1=stateEv(map([may]),1);plain.observe(s1);
  plain.observe(talk(1,"t",[page(s1,"MAY: Hi!","MAY","name_prefix")]));plain.observe(result("t",1));
  const card=plain.cards(map([may]),"a")?.cards[0];
  expect(card?.key).toBe("obj:0/18#2");
  expect(card?.text).toBe(["ID card: sprite RIVAL_MAY_NORMAL, map object 2, at 5,4 on ROUTE103 (map 0/18)","- Name: none shown by the game (a sprite kind is a graphic, not a name).","- First seen: turn 1, here.","- Has not spoken to you in this run.","- Battles with you: none recorded in this run."].join("\n"));
  expect(plain.annotate(`Location: ROUTE103\n${PEOPLE_HEADER}\n- object 2, MAY (sprite RIVAL_MAY_NORMAL), at (5,4): not talked to this run`,map([may]),"b").text).toContain("at (5,4): not talked to this run; ID card: no name shown; has not spoken to you; battles: none");
 });
});

describe("people-id-cards-v1 pending experiment",()=>{
 it("names every switch explicitly, needs nothing it lacks, and flips only people-id-cards-v1",async()=>{
  const {experimentArms,parseExperiment}=await import("./experiments.js");
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/people-id-cards.json",import.meta.url),"utf8")) as {incumbent:{features:Record<string,boolean>};queuePosition?:number};
  const historical=SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="rejected-movement-prefix-v1"&&id!=="away-note-buildings-v1"&&id!=="current-map-display-name-v1"&&id!=="window-escape-route-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1");
  expect(Object.keys(raw.incumbent.features).sort()).toEqual(historical.slice(0,historical.indexOf("people-id-cards-v1")+1).sort());
  expect(raw.queuePosition).toBeUndefined();
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features["people-ledger-v1"]).toBe(true);expect(incumbent.features["character-presence-v1"]).toBe(true);
  expect(SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="rejected-movement-prefix-v1"&&id!=="away-note-buildings-v1"&&id!=="current-map-display-name-v1"&&id!=="window-escape-route-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual(["people-id-cards-v1"]);
  expect(dependencyProblems(candidate.features)).toEqual([]);
  // The prompt line differs from the first decision, so the switch can act from NEW_GAME_CREATED.
  expect((raw as {activationMilestone?:string}).activationMilestone).toBe("NEW_GAME_CREATED");
 });
});
