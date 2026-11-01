// dark-area-flash-reminder-v1 on run 2026-11-01T09-10-00_deepseek-v4.1-flash_control24h
// (test-support/dark-area-flash-deepseek.json.gz): it held the KNUCKLE BADGE and HM05, its party was SABLEYE and
// COMBUSKEN with no FLASH, and it climbed from GRANITE CAVE 1F (darkness level 0) down to B1F (darkness level 7) at
// result 53954, back to 1F at 54542 and down to B1F again at 55014.
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import type {CheckedPressTool} from "./game-tools.js";
import {RUN_START_META} from "../test-support/events.js";
import {DarkAreaFlashReminder,FLASH_LEARNERS,FLASH_MAPS,MOVE_FLASH,darkAreaFlash,darkAreaFlashText,withDarkAreaFlashReminder,type DarkAreaFlashFacts} from "./dark-area-flash.js";

const ID="dark-area-flash-reminder-v1";
interface Row {readonly seq:number;readonly tool:string;readonly text:string;readonly state:GameStateSnapshot}
const RUN=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/dark-area-flash-deepseek.json.gz",import.meta.url))).toString("utf8")) as {results:{seq:number;tool:string;text:string;state:unknown}[]};
const ROWS:Row[]=RUN.results.map(r=>({seq:r.seq,tool:r.tool,text:r.text,state:parseGameState(r.state)}));
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const at=(seq:number):GameStateSnapshot=>must(ROWS.find(r=>r.seq===seq)).state;
const B1F=at(53954),F1=at(54542);
const OFF:FeatureSet=featuresOf([]);
const ON:FeatureSet={...OFF,[ID]:true};

const BADGE="SUPERVISOR: GRANITE CAVE B1F is dark. You have the KNUCKLE BADGE (\"you'll be able to use the HM move FLASH outside of battle\")";
const TEACH=`${BADGE} and HM05 in the TMs & HMs pocket of your bag, but no Pokémon in your party knows FLASH. Using HM05 from the bag teaches FLASH; the game marks SABLEYE "ABLE!" and COMBUSKEN "NOT ABLE!" to learn it. A Pokémon that knows FLASH can use it from the party menu to light up the area.`;
const USE=`${BADGE}, and SABLEYE knows FLASH. In the party menu, choose SABLEYE and then FLASH to light up the area.`;

const withFlash=(s:GameStateSnapshot,species="SABLEYE"):GameStateSnapshot=>({...s,party:s.party.map(m=>m.species!==species?m:{...m,moves:[...(m.moves??[]).slice(0,3),{move_id:MOVE_FLASH,name:"FLASH",pp:20,max_pp:20,pp_bonus:0}]})});
const level=(s:GameStateSnapshot,flash:number):GameStateSnapshot=>{const o=must(s.map_observation);return {...s,map_observation:{...o,layout:{...must(o.layout),flash_level:flash}}};};
const withoutItem=(s:GameStateSnapshot,item:number):GameStateSnapshot=>{const r=must(s.resources);return {...s,resources:{...r,bag:must(r.bag).filter(i=>i.item_id!==item)}};};

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(rows:readonly {text:string;state:GameStateSnapshot|undefined}[]):AgentTool {
 let i=0;
 return {name:"navigate_to",label:"navigate_to",description:"navigate_to",parameters:Type.Object({}),execute:()=>{const r=rows[i++];return Promise.resolve({content:[{type:"text",text:r?.text??"ok"}],details:r?.state===undefined?{}:{state:r.state}});}};
}
function recorder():{calls:[string,DarkAreaFlashFacts,string][];darkAreaFlashReminder:(tool:string,facts:DarkAreaFlashFacts,text:string)=>void} {
 const calls:[string,DarkAreaFlashFacts,string][]=[];
 return {calls,darkAreaFlashReminder:(tool,facts,text)=>{calls.push([tool,facts,text]);}};
}
async function added(features:FeatureSet,rows:readonly {text:string;state:GameStateSnapshot|undefined}[]):Promise<string[]> {
 const [tool]=withDarkAreaFlashReminder([replay(rows)],features,recorder());
 const out:string[]=[];
 for(const r of rows){const text=textOf(await must(tool).execute("c",{}));out.push(text===r.text?"":text.slice(r.text.length+1));}
 return out;
}

describe("registry",()=>{
 it("is a default-off, agent-side guidance switch with no dependency, registered last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"DARK AREA FLASH REMINDER"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(319);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures(ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(OFF,null)).not.toContain(ID);
  expect(dependencyProblems(ON)).toEqual(dependencyProblems(OFF));
 });
 it("defaults OFF for presets that omit it and for legacy flags; the prompt and tool list never change",()=>{
  const without=Object.fromEntries(Object.entries(ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt(OFF,null));
  expect(playTools(ON)).toEqual(playTools(OFF));
 });
});

describe("game tables (pret/pokeemerald 731ad5b)",()=>{
 it("marks only the requires_flash maps dark: GRANITE CAVE B1F and B2F, not 1F",()=>{
  expect([...FLASH_MAPS]).toEqual(["24/8","24/9","24/39","24/40","24/41","24/44","24/45"]);
  expect(FLASH_MAPS.has("24/7")).toBe(false);
 });
 it("knows SABLEYE learns FLASH and COMBUSKEN does not, as tmhm_learnsets.h says",()=>{
  expect(FLASH_LEARNERS.size).toBe(155);
  expect(B1F.party.map(m=>[m.species,m.species_id])).toEqual([["SABLEYE",322],["COMBUSKEN",281]]);
  expect(FLASH_LEARNERS.has(322)).toBe(true);
  expect(FLASH_LEARNERS.has(281)).toBe(false);
 });
});

describe("conditions",()=>{
 it("(a) dark map, KNUCKLE BADGE, HM05 in the bag, no FLASH user: teach from the bag, with ABLE! and NOT ABLE!",()=>{
  expect(B1F.badges).toContain("KNUCKLE");
  expect(B1F.map_observation?.layout?.flash_level).toBe(7);
  const facts=must(darkAreaFlash(B1F));
  expect(facts).toEqual({map_id:[24,8],location:"GRANITE CAVE B1F",flash_level:7,kind:"teach",knows:[],able:["SABLEYE"],not_able:["COMBUSKEN"]});
  expect(darkAreaFlashText(facts)).toBe(TEACH);
 });
 it("(b) a party Pokémon knows FLASH: use it from the party menu, named as the party shows it",()=>{
  const facts=must(darkAreaFlash(withFlash(B1F)));
  expect(facts.kind).toBe("use");
  expect(darkAreaFlashText(facts)).toBe(USE);
  const nicknamed={...withFlash(B1F),party:withFlash(B1F).party.map(m=>m.species==="SABLEYE"?{...m,nickname:"GEMMY"}:m)};
  expect(darkAreaFlashText(must(darkAreaFlash(nicknamed)))).toContain("and GEMMY knows FLASH. In the party menu, choose GEMMY and then FLASH");
  const both=withFlash(withFlash(B1F),"COMBUSKEN");
  expect(darkAreaFlashText(must(darkAreaFlash(both)))).toContain("and SABLEYE and COMBUSKEN know FLASH. In the party menu, choose SABLEYE and then FLASH");
  expect(must(darkAreaFlash(withoutItem(withFlash(B1F),343))).kind).toBe("use");
 });
 it("(c) says nothing without the badge, with neither HM05 nor a FLASH user, on a lit or not-dark map",()=>{
  expect(darkAreaFlash({...B1F,badges:["STONE"]})).toBeNull();
  expect(darkAreaFlash({...withFlash(B1F),badges:["STONE"]})).toBeNull();
  expect(darkAreaFlash(withoutItem(B1F,343))).toBeNull();
  expect(darkAreaFlash(level(B1F,1))).toBeNull();
  expect(darkAreaFlash(level(B1F,0))).toBeNull();
  expect(darkAreaFlash(F1)).toBeNull();
  expect(darkAreaFlash({...F1,badges:B1F.badges})).toBeNull();
 });
 it("needs the free field, and fires when the darkness level is not reported for this map",()=>{
  expect(darkAreaFlash({...B1F,in_battle:true})).toBeNull();
  expect(darkAreaFlash({...B1F,screen:"battle"})).toBeNull();
  expect(darkAreaFlash({...B1F,started:false})).toBeNull();
  expect(darkAreaFlash({...B1F,party_owner:"tutorial"})).toBeNull();
  expect(darkAreaFlash({...B1F,map_id:null})).toBeNull();
  const unobserved={...B1F};
  delete unobserved.map_observation;
  expect(must(darkAreaFlash(unobserved)).flash_level).toBeNull();
  const elsewhere={...B1F,map_observation:{...must(B1F.map_observation),map_id:[24,7] as [number,number]}};
  expect(must(darkAreaFlash(elsewhere)).flash_level).toBeNull();
  const noLayout={...B1F,map_observation:{...must(B1F.map_observation)}};
  delete noLayout.map_observation.layout;
  expect(must(darkAreaFlash(noLayout)).flash_level).toBeNull();
 });
 it("leaves eggs and unnamed Pokémon out; with no bag read it says nothing",()=>{
  const egg={...B1F,party:B1F.party.map(m=>m.species==="SABLEYE"?{...m,is_egg:true}:m)};
  expect(must(darkAreaFlash(egg))).toMatchObject({able:[],not_able:["COMBUSKEN"]});
  expect(darkAreaFlashText(must(darkAreaFlash(egg)))).toContain(`; the game marks COMBUSKEN "NOT ABLE!" to learn it.`);
  const unnamed={...B1F,party:B1F.party.map(m=>({...m,nickname:null,species:null,species_id:null}))};
  expect(darkAreaFlashText(must(darkAreaFlash(unnamed)))).toContain("Using HM05 from the bag teaches FLASH. A Pokémon");
  expect(darkAreaFlash({...B1F,resources:null})).toBeNull();
  expect(darkAreaFlash({...B1F,resources:{...must(B1F.resources),bag:null}})).toBeNull();
  expect(darkAreaFlash({...B1F,resources:{...must(B1F.resources),bag:must(must(B1F.resources).bag).map(i=>i.item_id===343?{...i,quantity:0}:i)}})).toBeNull();
  expect(darkAreaFlashText({...must(darkAreaFlash(B1F)),location:null})).toMatch(/^SUPERVISOR: This area is dark\./);
 });
});

describe("once per map visit",()=>{
 it("fires on the first qualifying result of a visit and again after leaving and coming back",()=>{
  const watch=new DarkAreaFlashReminder();
  expect(watch.observe(F1)).toBeNull();
  expect(watch.observe({...B1F,map_id:null})).toBeNull();
  expect(watch.observe({...B1F,in_battle:true})).toBeNull();
  expect(must(watch.observe(B1F)).kind).toBe("teach");
  expect(watch.observe(B1F)).toBeNull();
  expect(watch.observe(withFlash(B1F))).toBeNull();
  expect(watch.observe({...B1F,map_id:null})).toBeNull();
  expect(watch.observe(B1F)).toBeNull();
  expect(watch.observe(null)).toBeNull();
  expect(watch.observe(F1)).toBeNull();
  expect(must(watch.observe(withFlash(B1F))).kind).toBe("use");
 });
 it("a lit visit stays quiet and does not use up a later dark visit",()=>{
  const watch=new DarkAreaFlashReminder();
  expect(watch.observe(level(B1F,1))).toBeNull();
  expect(watch.observe(F1)).toBeNull();
  expect(must(watch.observe(B1F)).kind).toBe("teach");
 });
});

describe("DeepSeek replay",()=>{
 it("OFF: every result is returned unchanged",async()=>{
  const [tool]=withDarkAreaFlashReminder([replay(ROWS)],OFF,{});
  for(const r of ROWS){const result=await must(tool).execute("c",{});expect(result).toEqual({content:[{type:"text",text:r.text}],details:{state:r.state}});}
 });
 it("ON: B1F entry (53954) and re-entry (55014) gain the teach paragraph last; 1F results gain nothing",async()=>{
  expect(ROWS.map(r=>[r.seq,r.state.location])).toEqual([[53603,"GRANITE CAVE 1F"],[53695,"GRANITE CAVE 1F"],[53954,"GRANITE CAVE B1F"],[54542,"GRANITE CAVE 1F"],[55014,"GRANITE CAVE B1F"]]);
  expect(await added(ON,ROWS)).toEqual(["","",TEACH,"",TEACH]);
  const twice=[ROWS[2],ROWS[2]].map(must);
  expect(await added(ON,twice)).toEqual([TEACH,""]);
  expect(await added(ON,[{text:"no state",state:undefined},{text:"bad",state:{} as GameStateSnapshot}])).toEqual(["",""]);
 });
 it("ON with SABLEYE knowing FLASH: the use paragraph",async()=>{
  expect(await added(ON,ROWS.map(r=>({...r,state:withFlash(r.state)})))).toEqual(["","",USE,"",USE]);
 });
 it("records each paragraph with its tool and facts, and needs a recorder",async()=>{
  const rec=recorder();
  const [tool]=withDarkAreaFlashReminder([replay(ROWS)],ON,rec);
  for(let n=0;n<ROWS.length;n++)await must(tool).execute("c",{});
  expect(rec.calls.map(([t,f,text])=>[t,f.kind,f.map_id,text])).toEqual([["navigate_to","teach",[24,8],TEACH],["navigate_to","teach",[24,8],TEACH]]);
  expect(()=>withDarkAreaFlashReminder([replay(ROWS)],ON,{})).toThrow(`${ID} needs a recorder`);
 });
 it("annotates checked presses too",async()=>{
  const row=must(ROWS[2]);
  const result=():Promise<AgentToolResult<unknown>>=>Promise.resolve({content:[{type:"text",text:row.text}],details:{state:row.state}});
  const press={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
  const [wrapped]=withDarkAreaFlashReminder([press],ON,recorder());
  const checked=must(wrapped) as CheckedPressTool;
  expect(textOf(await checked.executeChecked("c",{buttons:["A"]},()=>true))).toBe(`${row.text}\n${TEACH}`);
 });
});

it("playGameTools adds the paragraph and records a valid dark_area_flash_reminder event with the switch on, nothing off",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-dark-flash-wire-"));
 try{
  for(const on of [true,false]){
   const log=RunLog.create(root,on?"on":"off");
   const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(B1F)}});
   await recorder.start(RUN_START_META);
   const tools=playGameTools([replay(ROWS)],on?ON:OFF,{read:()=>Promise.resolve(B1F)},recorder);
   const tool=must(tools.find(t=>t.name==="navigate_to"));
   const texts:string[]=[];
   for(let n=0;n<ROWS.length;n++)texts.push(textOf(await tool.execute(`c${String(n)}`,{})));
   recorder.end("budget");
   const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
   const reminders=events.flatMap(e=>e.type==="dark_area_flash_reminder"?[e]:[]);
   if(on){
    expect(texts.map(t=>t.endsWith(`\n${TEACH}`))).toEqual([false,false,true,false,true]);
    expect(reminders.map(e=>[e.tool,e.map_id,e.location,e.flash_level,e.kind,e.able,e.not_able,e.text])).toEqual([["navigate_to",[24,8],"GRANITE CAVE B1F",7,"teach",["SABLEYE"],["COMBUSKEN"],TEACH],["navigate_to",[24,8],"GRANITE CAVE B1F",7,"teach",["SABLEYE"],["COMBUSKEN"],TEACH]]);
    expect(formatEvent(must(reminders[0]))).toContain("dark area flash reminder · GRANITE CAVE B1F · HM05; ABLE: SABLEYE");
   }else{
    expect(texts.join("\n")).not.toContain("FLASH outside of battle");
    expect(reminders).toHaveLength(0);
   }
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("tail names a FLASH user, a missing ABLE! list, and a map with no name",()=>{
 const base={v:1 as const,run:"r",seq:1,t:"2026-11-01T00:00:00.000Z",type:"dark_area_flash_reminder" as const,turn:1,tool:"press",map_id:[24,9] as [number,number],flash_level:null,text:"x"};
 expect(formatEvent({...base,location:null,kind:"use",knows:["SABLEYE"],able:[],not_able:[]})).toContain("map 24/9 · knows FLASH: SABLEYE");
 expect(formatEvent({...base,location:"GRANITE CAVE B2F",kind:"teach",knows:[],able:[],not_able:["COMBUSKEN"]})).toContain("HM05; ABLE: none");
});
