import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {ALL_ON,FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,stateOnlyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {UNTAKEN_EXITS_SECTION,playSystemPrompt} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {UNTAKEN_HEADER,UntakenExits,withUntakenExits} from "./untaken-exits.js";
import type {GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

const ID="untaken-exits-v1";
// Cook #2 (bundle arm), 2026-10-16T02-23-17_qwen36-gpu1_sh02, trimmed as described in briefing-exits.test.ts.
function recorded():RunEvent[]{
 const path=fileURLToPath(new URL("./fixtures/briefing-sh02.jsonl.gz",import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}
const EVENTS=recorded();
const start=EVENTS.find(e=>e.type==="run_start");
if(start?.type!=="run_start")throw new Error("fixture has no run_start");
const BUNDLE:FeatureSet={...featuresOf(start.harness_features),[ID]:true};
type State=Extract<RunEvent,{type:"state";started:boolean}>;
// The readout each recorded tool result showed, annotated as the tool wrapper would have annotated it then.
function annotated(features:FeatureSet):Map<number,{turn:number;text:string}> {
 const exits=new UntakenExits(features);const states=new Map<number,State>();const out=new Map<number,{turn:number;text:string}>();
 for(const e of EVENTS){
  exits.observe(e);
  if(e.type==="state"&&"started"in e)states.set(e.seq,e);
  if(e.type==="tool_result"&&e.state_seq!==undefined&&!e.is_error){
   const state=states.get(e.state_seq);
   if(state!==undefined)out.set(e.seq,{turn:e.turn,text:exits.annotate(e.text,state)});
  }
 }
 return out;
}
const exitLine=(text:string)=>text.split("\n").find(l=>l.startsWith(`${UNTAKEN_HEADER}:`));
const FORBIDDEN=/\b(rival|birch|professor|may|brendan|mom|daughter|upstairs|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge)\b/i;

describe("untaken-exits-v1 on cook #2 (sh02): May's house 1F at T113-T116",()=>{
 const shown=annotated(BUNDLE);
 it("right after the Position line on arrival (T113, seq 2314): the stairs are the one exit not taken",()=>{
  const text=shown.get(2314)?.text??"";
  expect(text).toContain("Position: X=2, Y=8, facing up\nExits here you have not taken: (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3)\n");
 });
 it("keeps saying so on every result in the house until the model leaves (T114, T115)",()=>{
  expect(exitLine(shown.get(2328)?.text??"")).toBe("Exits here you have not taken: (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3)");
  expect(exitLine(shown.get(2378)?.text??"")).toBe("Exits here you have not taken: (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3)");
 });
 it("outside (T116, seq 2396) every door has been used this run and only the north edge is left",()=>{
  expect(exitLine(shown.get(2396)?.text??"")).toBe("Exits here you have not taken: NORTH edge -> ROUTE101 (map 0/16)");
 });
 it("in the lab once both of its exit tiles are used it says none were left",()=>{
  expect(exitLine(shown.get(2782-13)?.text??"")).toBe("Exits here you have not taken: none (you have taken every exit on this map this run)");
 });
 it("changes nothing else in any recorded readout",()=>{
  for(const [seq,{text}] of shown){
   const original=EVENTS.find(e=>e.seq===seq);
   if(original?.type!=="tool_result")throw new Error("missing result");
   expect(text.split("\n").filter(l=>!l.startsWith(`${UNTAKEN_HEADER}:`)).join("\n")).toBe(original.text);
  }
 });
});

describe("untaken-exits-v1 lines",()=>{
 const warp=(x:number,y:number,destination:[number,number,number])=>({kind:"warp",x,y,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination,name:"w"});
 const state=(extra:Partial<GameStateSnapshot>):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",location:"HALL",map_id:[3,3],position:{x:1,y:1},facing:"up",interaction_targets:[warp(1,0,[4,4,0]),warp(2,0,[4,4,0]),warp(9,9,[127,127,0]),warp(5,5,[6,6,1])],topology:{width:10,height:10,connections:[{direction:"EAST",offset:0,destination:[7,7],destination_name:"EASTSIDE"}]},...extra});
 it("groups a door pair, names only what the readout named, and keeps every exit (nothing clipped)",()=>{
  const exits=new UntakenExits(ALL_ON);
  expect(exits.line(state({}),"Location: HALL\nWarps: (5,5) -> SIDE ROOM (map 6/6) [door]")).toBe("Exits here you have not taken: (1,0) or (2,0) -> map 4/4; (9,9) -> dynamic destination; (5,5) -> SIDE ROOM (map 6/6); EAST edge -> map 7/7");
  expect(exits.line(state({}),"- EAST -> EASTSIDE (map 7/7), offset 0")).toBe("Exits here you have not taken: (1,0) or (2,0) -> map 4/4; (9,9) -> dynamic destination; (5,5) -> SIDE ROOM (map 6/6); EAST edge -> EASTSIDE (map 7/7)");
 });
 it("lists map connections only where the readout shows them (world destinations)",()=>{
  const exits=new UntakenExits({...ALL_ON,"world-destinations-v1":false});
  expect(exits.line(state({}),"")).toBe("Exits here you have not taken: (1,0) or (2,0) -> map 4/4; (9,9) -> dynamic destination; (5,5) -> map 6/6");
  expect(exits.line(state({interaction_targets:[],topology:null}),"")).toBe("Exits here you have not taken: none (no exits are listed on this map)");
 });
 it("adds nothing outside a started overworld readout with interaction targets",()=>{
  const exits=new UntakenExits(ALL_ON);
  for(const s of [state({started:false}),state({screen:"battle"}),state({interaction_targets:null}),state({map_id:null})])expect(exits.line(s,"")).toBeNull();
  expect(exits.annotate("Location: HALL\nScreen: battle",state({screen:"battle"}))).toBe("Location: HALL\nScreen: battle");
  expect(exits.annotate("no location line",state({}))).toBe("no location line");
  expect(exits.annotate("Location: HALL\nMoney: 1",state({}))).toBe(`Location: HALL\n${exits.line(state({}),"Location: HALL")??""}\nMoney: 1`);
 });
});

describe("untaken-exits-v1 prompt",()=>{
 it("ON adds one sentence that names no character, place or story step; OFF leaves the prompt byte-identical",()=>{
  const off={...ALL_ON,[ID]:false,"objective-tracking-v1":false,"navigate-first-prompt-v1":false,"people-id-cards-v1":false,"harness-trust-v1":false,"cited-destination-v1":false};
  const on={...off,[ID]:true};
  expect(playSystemPrompt(on,null)).toBe(`${playSystemPrompt(off,null)}\n\n${UNTAKEN_EXITS_SECTION}`);
  expect(UNTAKEN_EXITS_SECTION).not.toMatch(FORBIDDEN);
  expect(UNTAKEN_EXITS_SECTION).toContain("exits");
  expect(UNTAKEN_EXITS_SECTION).toContain("mentioned");
  expect(playSystemPrompt({...on,"objective-tracking-v1":true},null)).toContain(`${UNTAKEN_EXITS_SECTION}\n\n`);
 });
});

describe("untaken-exits-v1 production wiring",()=>{
 const readout="Screen: overworld\nLocation: HALL\nPosition: X=1, Y=1, facing up\nMoney: 1";
 const snapshot:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",location:"HALL",map_id:[3,3],position:{x:1,y:1},facing:"up",interaction_targets:[{kind:"warp",x:1,y:0,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[4,4,0],name:"w"}],topology:null};
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:snapshot}})});
 const checked=():AgentTool=>({...tool("press"),executeChecked:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:snapshot}})} as AgentTool);
 const recorder=()=>{const observers:((e:RunEvent)=>void)[]=[];return {observers,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);}};};
 const text=async(tools:readonly AgentTool[],name:string)=>{const r=await tools.find(t=>t.name===name)?.execute("id",{});const part=r?.content[0];return part?.type==="text"?part.text:"";};
 const OFF:FeatureSet={...ALL_ON,[ID]:false,"people-ledger-v1":false,"story-destinations-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"heal-before-trainers-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialogue-auto-advance-v1":false,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false};

 it("OFF hands the model the very same tools and adds no subscriber",async()=>{
  const r=recorder();const base=[tool("observe"),checked()];
  const tools=playGameTools(base,OFF,{read:()=>Promise.resolve(snapshot)},r);
  expect(tools).toEqual(base);expect(r.observers).toHaveLength(0);
  expect(await text(tools,"observe")).toBe(readout);
  expect(withUntakenExits(base,OFF,r)).toEqual(base);
 });
 it("learns the map change from the result's own state when the recorder has not delivered it yet (live order)",()=>{
  const exits=new UntakenExits(ALL_ON);
  const hall:GameStateSnapshot={...snapshot,interaction_targets:[{kind:"warp",x:1,y:0,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[4,4,0],name:"w"}]};
  const room:GameStateSnapshot={...snapshot,location:"ROOM",map_id:[4,4],position:{x:3,y:3},interaction_targets:[{kind:"warp",x:3,y:3,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[3,3,0],name:"w"}]};
  const e=(seq:number,s:GameStateSnapshot)=>checkEvent({v:1,run:"u",t:"2026-10-16T03:00:00.000-04:00",turn:1,seq,type:"state",...s});
  exits.observe(e(1,{...hall,position:{x:1,y:1}}));
  // The press result's state reaches the wrapper before the recorder records it.
  expect(exits.annotate("Location: ROOM\nPosition: X=3, Y=3, facing up",room)).toBe("Location: ROOM\nPosition: X=3, Y=3, facing up\nExits here you have not taken: none (you have taken every exit on this map this run)");
  exits.observe(e(2,room));
  expect(exits.line(room,"")).toBe("Exits here you have not taken: none (you have taken every exit on this map this run)");
 });
 it("ON leaves other tools, results without a state and results without a Location line alone; annotates navigate_to",async()=>{
  const r=recorder();
  const other=tool("get_dialogue");
  const bare:AgentTool={...tool("observe"),execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{}})};
  const noLocation:AgentTool={...tool("press"),execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: overworld"}],details:{state:snapshot}})};
  const [o,b,p,n]=withUntakenExits([other,bare,noLocation,tool("navigate_to")],{...OFF,[ID]:true},r);
  expect(o).toBe(other);
  expect(await text([b as AgentTool],"observe")).toBe(readout);
  expect(await text([p as AgentTool],"press")).toBe("Screen: overworld");
  expect(await text([n as AgentTool],"navigate_to")).toContain("Exits here you have not taken: (1,0) -> map 4/4");
  expect(new UntakenExits(ALL_ON).line({...snapshot,topology:null},"")).toBe("Exits here you have not taken: (1,0) -> map 4/4");
 });
 it("ON annotates observe and press results through playGameTools and learns history from the recorder",async()=>{
  const r=recorder();
  const tools=playGameTools([tool("observe"),checked()],{...OFF,[ID]:true},{read:()=>Promise.resolve(snapshot)},r);
  expect(r.observers).toHaveLength(1);
  expect(await text(tools,"observe")).toBe("Screen: overworld\nLocation: HALL\nPosition: X=1, Y=1, facing up\nExits here you have not taken: (1,0) -> map 4/4\nMoney: 1");
  expect(await text(tools,"press")).toContain("Exits here you have not taken: (1,0) -> map 4/4");
  const press=tools.find(t=>t.name==="press");
  const result=await (press as unknown as {executeChecked:(...a:unknown[])=>Promise<{content:{type:string;text:string}[]}>}).executeChecked("id",{buttons:["UP"]},()=>true);
  expect(result.content[0]?.text).toContain("Exits here you have not taken:");
  const e=(seq:number,s:Partial<GameStateSnapshot>)=>checkEvent({v:1,run:"u",t:"2026-10-16T03:00:00.000-04:00",turn:1,seq,type:"state",...snapshot,...s});
  for(const o of r.observers){o(e(1,{map_id:[4,4],location:"ROOM",position:{x:3,y:3},interaction_targets:[]}));o(e(2,{position:{x:1,y:1}}));}
  expect(await text(tools,"observe")).toContain("Exits here you have not taken: none (you have taken every exit on this map this run)");
 });
});

describe("untaken-exits-v1 registry and presets",()=>{
 it("is a default-off observation switch that needs world targets, recorded after briefing-exits-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"world-targets-v1",switchable:true,title:"UNTAKEN EXITS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const ids=FEATURES.filter(f=>f.switchable).map(f=>f.id);
  expect(ids.indexOf(ID)).toBe(ids.indexOf("briefing-exits-v1")+1);
  const order=playHarnessFeatures(ALL_ON,null);
  expect(order.indexOf(ID)).toBe(order.indexOf("briefing-exits-v1")+1);
  expect(dependencyProblems({...ALL_ON,"world-targets-v1":false})).toContain(`${ID} needs world-targets-v1`);
  expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
 });
 it("defaults off in presets that omit it and in legacy flag presets",()=>{
  const {[ID]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
});
