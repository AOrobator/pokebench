import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {CARDS_HEADER,withPeopleIdCards,type IdCard} from "./people-id-cards.js";
import {pageLines} from "./dialogue-auto-advance.js";
import {PEOPLE_HEADER} from "./people-ledger.js";
import {playGameTools} from "./play-wiring.js";
import {PEOPLE_ID_CARDS_SECTION,UNTAKEN_EXITS_SECTION,playSystemPrompt} from "./play-config.js";
import {REMINDER,REMINDER_EVERY} from "./navigate-first.js";
import {ALL_ON,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import {IN_GAME} from "../test-support/events.js";

const RUN=gunzipSync(readFileSync(new URL("./fixtures/people-id-cards-4caa.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const snapshot=(e:RunEvent):GameStateSnapshot=>parseGameState(Object.fromEntries(Object.entries(e).filter(([k])=>!ENVELOPE.has(k))));
const T211=RUN.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===211);
if(T211?.state_seq===undefined)throw new Error("fixture lacks T211");
const T211_STATE=snapshot(RUN.find(e=>e.seq===T211.state_seq) ?? RUN[0] as RunEvent);
// The recorded T211 readout with the people-ledger block the run already had; the cards go right after it.
const LEDGER_BLOCK=["People and objects here (every object the game has loaded on this map; a sprite kind is a graphic, not a name):","- object 10, sprite BOY_1, at (21,8): not talked to this run","- object 2, MAY (sprite RIVAL_MAY_NORMAL), at (10,3): not talked to this run","Story characters here: MAY at 10,3. Not on this map: PROF. BIRCH, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN."].join("\n");

const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
type Details={state:GameStateSnapshot};
function observe(text:string,state:GameStateSnapshot):AgentTool {
 return {name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text}],details:{state}} satisfies AgentToolResult<Details>)};
}
function press(text:string,state:GameStateSnapshot):CheckedPressTool {
 const result=():Promise<AgentToolResult<Details>>=>Promise.resolve({content:[{type:"text",text:`pressed UP\n\n${text}`}],details:{state}});
 return {name:"press",label:"Press",description:"d",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
}
const textOf=(r:Pick<AgentToolResult<unknown>,"content">)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");
interface Recorded {readonly tool:string;readonly id:string;readonly card:IdCard}
function recorder(){
 const observers:((e:RunEvent)=>void)[]=[];const cards:Recorded[]=[];
 return {cards,feed:(events:readonly RunEvent[])=>{for(const e of events)for(const o of observers)o(e);},
  api:{subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:(tool:string,id:string,card:IdCard)=>{cards.push({tool,id,card});}}};
}
const before=(turn:number)=>RUN.filter(e=>e.turn<turn||(e.turn===turn&&e.type==="state"));

describe("people-id-cards-v1 delivery",()=>{
 it("OFF hands back the very same tools and subscribes to nothing",()=>{
  const rec=recorder();let subscribed=0;
  const tools=[observe(T211.text,T211_STATE)];
  const out=withPeopleIdCards(tools,OFF,{...rec.api,subscribe:()=>{subscribed++;}});
  expect(out).toEqual(tools);expect(out[0]).toBe(tools[0]);expect(subscribed).toBe(0);
 });
 it("T211 through the production factory: the card follows the people-ledger block, MAY's row carries her summary, one event is recorded",async()=>{
  const rec=recorder();
  const features={...OFF,"character-presence-v1":true,"people-ledger-v1":true,"people-id-cards-v1":true};
  // The run's own T211 readout already carries the ledger block, so the inner ledger stays off here
  // and the card wrapper is checked against the bytes the model received.
  const tools=playGameTools([observe(T211.text,T211_STATE)],{...features,"people-ledger-v1":false,"people-id-cards-v1":false},{read:()=>Promise.resolve(T211_STATE)},rec.api);
  expect(textOf(await tools[0]?.execute("x",{}) ?? {content:[]})).toBe(`|${T211.text}`);
  const on=playGameTools([observe(T211.text,T211_STATE)],{...features,"people-ledger-v1":false,"people-id-cards-v1":true},{read:()=>Promise.resolve(T211_STATE)},rec.api);
  rec.feed(before(211));
  const text=textOf(await on[0]?.execute(T211.id,{}) ?? {content:[]}).slice(1);
  const marked=LEDGER_BLOCK.replace("at (21,8): not talked to this run","at (21,8): not talked to this run; ID card: no name shown; has not spoken to you; battles: none").replace("at (10,3): not talked to this run","at (10,3): not talked to this run; ID card: name shown by the game on turn 107; last spoke to you on turn 107; battles: none");
  expect(text).toContain(`Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)\n${marked}\n${CARDS_HEADER}\nID card: MAY (sprite RIVAL_MAY_NORMAL), map object 2, at 10,3 on ROUTE103 (map 0/18)\n`);
  // Removing the card and the row summary gives back the recorded bytes exactly: nothing else moved, nothing clipped.
  // The wrapper's own history starts here (earlier results were fed as events, not shown through it), so both
  // people in view get a first card, in reading order; MAY's dialogue history still comes from the delivered events.
  expect(rec.cards.map(c=>[c.tool,c.id,c.card.key,c.card.reason])).toEqual([["observe",T211.id,"name:MAY","first"],["observe",T211.id,"obj:0/18#10","first"]]);
  expect(rec.cards[0]?.card.text).toContain("- Last spoke to you: turn 107, 13 pages, whole:");
  const block=`${CARDS_HEADER}\n${rec.cards.map(c=>c.card.text).join("\n")}\n`;
  expect(text).toContain(`${marked}\n${block}Party (player)`);
  expect(text.replace(block,"").replace(marked,LEDGER_BLOCK)).toBe(T211.text);
 });
 it("with the ledger on in the factory, the cards still follow the ledger block, after untaken exits, and the navigate-first reminder stays its own part",async()=>{
  const state=parseGameState({...IN_GAME,location:"ROOM",map_id:[1,2],position:{x:5,y:5},facing:"up",field_controls_locked:false,
   world_context:{objects:[{local_id:1,map_id:[1,2],graphics_id:7,sprite_kind:"BOY_1",x:5,y:3}],triggers:[],dialogue:null},
   interaction_targets:[{name:"BOY_1",kind:"object",x:5,y:3,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:1,destination:null},{name:"Warp to map 1/3",kind:"warp",x:1,y:1,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,3,0]}]});
  const readout="Screen: overworld\nLocation: ROOM\nPosition: X=5, Y=5, facing up\nParty (player): none";
  const rec=recorder();
  const features={...OFF,"dialogue-auto-advance-v1":true,"field-dialogue-phase-v1":true,"people-ledger-v1":true,"people-id-cards-v1":true,"untaken-exits-v1":true,"navigate-first-prompt-v1":true,"bounded-navigation-v1":true};
  const tools=playGameTools([observe(readout,state),press(readout,state)],features,{read:()=>Promise.resolve(state)},rec.api);
  const lines=textOf(await tools.find(t=>t.name==="observe")?.execute("o",{}) ?? {content:[]}).split("\n");
  const at=lines.indexOf(PEOPLE_HEADER);
  expect(lines[at-1]).toMatch(/^Exits here you have not taken: /);
  expect(lines[at+1]).toBe("- object 1, sprite BOY_1, at (5,3): not talked to this run; ID card: no name shown; has not spoken to you; battles: none");
  expect(lines.slice(at+2,at+4)).toEqual([CARDS_HEADER,"ID card: sprite BOY_1, map object 1, at 5,3 on ROOM (map 1/2)"]);
  expect(lines.at(-1)).toBe("Party (player): none");
  const p=tools.find(t=>t.name==="press");
  let last:AgentToolResult<unknown>|undefined;
  for(let i=0;i<REMINDER_EVERY;i++)last=await p?.execute(`p${String(i)}`,{buttons:["UP"]});
  const parts=(last?.content??[]).flatMap(c=>c.type==="text"?[c.text]:[]);
  expect(parts.at(-1)).toBe(REMINDER);
  expect(parts.filter(t=>t.includes(PEOPLE_HEADER))).toHaveLength(1);
  // The person stayed in view: no second card, no second event.
  expect(rec.cards.map(c=>c.card.reason)).toEqual(["first"]);
  // The checked press path is wrapped too.
  const checked=tools.find((t):t is CheckedPressTool=>t.name==="press"&&"executeChecked" in t);
  expect(textOf(await checked?.executeChecked("c",{buttons:["UP"]},()=>undefined) ?? {content:[]})).toContain("; ID card: no name shown");
 });
 it("leaves results without a readout or a state untouched",async()=>{
  const rec=recorder();
  const features={...OFF,"people-ledger-v1":true,"people-id-cards-v1":true};
  const noState:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:{}})};
  const noReadout:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"no readout"}],details:{state:T211_STATE}})};
  const badState:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:{state:{nonsense:true}}})};
  const other:AgentTool={name:"recall_dialogue",label:"r",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROOM"}],details:{state:T211_STATE}})};
  for(const tool of [noState,noReadout,badState]){const [w]=withPeopleIdCards([tool],features,rec.api);expect(textOf(await w?.execute("a",{}) ?? {content:[]})).toBe(textOf(await tool.execute("a",{})));}
  const [w]=withPeopleIdCards([other],features,rec.api);expect(w).toBe(other);
  expect(rec.cards).toEqual([]);
 });
});

describe("people-id-cards-v1 rehearsal",()=>{
 it("the production wrapper over the whole recorded 4caa run records the same 38 cards, in order",async()=>{
  const rec=recorder();
  const states=new Map<number,GameStateSnapshot>();
  let current:GameStateSnapshot|undefined;
  const tool:AgentTool={name:"press",label:"p",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: X\nPosition: X=0, Y=0, facing up"}],details:{state:current}})};
  const [wrapped]=withPeopleIdCards([tool],{...OFF,"character-presence-v1":true,"people-ledger-v1":true,"people-id-cards-v1":true},rec.api);
  for(const e of RUN){
   if(e.type==="state"&&"started" in e)states.set(e.seq,snapshot(e));
   if(e.type==="tool_result"&&e.state_seq!==undefined&&states.has(e.state_seq)){current=states.get(e.state_seq);await wrapped?.execute(e.id,{});}
   rec.feed([e]);
  }
  expect(rec.cards).toHaveLength(38);
  expect(rec.cards.filter(c=>c.card.key==="name:MAY").map(c=>c.card.reason)).toEqual(["first","changed","changed","changed"]);
 });
});

describe("people-id-cards-v1 OFF over the whole recorded run",()=>{
 it("every 4caa result passes through the production factory unchanged with the switch off, and nothing is recorded",async()=>{
  const rec=recorder();
  const states=new Map<number,GameStateSnapshot>();
  let current:GameStateSnapshot|undefined;let text="";
  const tool:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text}],details:{state:current}})};
  const off=playGameTools([tool],{...OFF,"character-presence-v1":true},{read:()=>Promise.resolve(T211_STATE)},rec.api);
  expect(off[0]).toBe(tool);
  let results=0;
  for(const e of RUN){
   if(e.type==="state"&&"started" in e)states.set(e.seq,snapshot(e));
   if(e.type==="tool_result"&&e.state_seq!==undefined&&states.has(e.state_seq)){
    current=states.get(e.state_seq);text=`Location: ${current?.location??""}\nPosition: X=0, Y=0, facing up\n${e.text}`;
    expect(textOf(await off[0]?.execute(e.id,{}) ?? {content:[]})).toBe(text);results++;
   }
   rec.feed([e]);
  }
  expect(results).toBeGreaterThan(500);
  expect(rec.cards).toEqual([]);
 });
 it("pageLine keeps the dialogue list byte-identical to what the run recorded (4caa T107, 13 pages)",()=>{
  const advance=RUN.find((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance"&&e.turn===107);
  const recorded=RUN.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===107&&e.text!=="");
  expect(advance?.pages).toHaveLength(13);
  expect(recorded?.text).toContain(pageLines(advance?.pages??[],107).join("\n"));
 });
});

describe("people-id-cards-v1 prompt line",()=>{
 it("ON appends exactly the one line after untaken exits; OFF leaves the prompt byte-identical; it names no person, place or step",()=>{
  const off={...ALL_ON,"state-only-decisions-v1":false,"objective-tracking-v1":false,"navigate-first-prompt-v1":false,"people-id-cards-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false};
  const on={...off,"people-id-cards-v1":true};
  expect(playSystemPrompt(on,null)).toBe(`${playSystemPrompt(off,null)}\n\n${PEOPLE_ID_CARDS_SECTION}`);
  expect(playSystemPrompt(off,null).endsWith(UNTAKEN_EXITS_SECTION)).toBe(true);
  expect(PEOPLE_ID_CARDS_SECTION).not.toMatch(/\b(MAY|BRENDAN|BIRCH|MOM|NORMAN|rival|ROUTE|TOWN|talk to|go to|visit|battle them)\b/);
  expect(PEOPLE_ID_CARDS_SECTION).toContain("consider who this person is to you and where they fit in the story so far");
 });
});
