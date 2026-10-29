import {readFileSync} from "node:fs";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {featuresOf,featureInfo,playHarnessFeatures,SERVER_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import type {PlacesBody} from "./story-destinations.js";
import {townCenterFacts,townCenterText} from "./town-center-checkpoint.js";

const ID="town-center-checkpoint-v1";
const fixtures=JSON.parse(readFileSync(new URL("../test-support/town-center-states.json",import.meta.url),"utf8")) as Record<string,{sourceRun:string;sourceStateSeq:number;state:GameStateSnapshot;resultText:string}>;
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const fixture=(id="healthy-a")=>{const f=fixtures[id];if(f===undefined)throw Error(id);return {...f,state:parseGameState(f.state)};};
const f=fixture(),NOTE="Enter OLDALE TOWN’s Pokémon Center now, using the listed entrance warp at (6,16) on map [0, 10]. Entry sets your blackout return point here even when your party is healthy. Heal with the nurse if needed, then resume your current objective.";
const flags=(on:boolean)=>({...featuresOf(["ram-state-v1","heal-before-trainers-v1"]),[ID]:on});
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:f.sourceRun,seq:100,turn:10,t:"2026-10-28T00:00:00.000Z",...body});
function setup(on=true){
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on),{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:n=>{notes.push(n);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>{}},m=>Promise.resolve(m),undefined,{places:()=>Promise.resolve(places)});
 const feed=(...events:RunEvent[])=>{for(const e of events)for(const listener of listeners)listener(e);};
 const input=(id="result",text=f.resultText):AgentMessage[]=>[{role:"toolResult",toolCallId:id,toolName:"observe",content:[{type:"text",text}],isError:false,timestamp:0}];
 const arrive=(s=f.state,text=f.resultText,id="result",seq=100)=>{feed(event({...s,type:"state",seq}),event({type:"tool_result",seq:seq+1,id,name:"observe",text,state_seq:seq,is_error:false,frames:[],duration_ms:0}));return input(id,text);};
 const reply=(stop="toolUse",calls=true)=>feed(event({type:"assistant",seq:102,thinking:"",text:"",tool_calls:calls?[{id:"next",name:"observe",args:{}}]:[],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:stop}));
 return {wiring,notes,feed,input,arrive,reply};
}
it("registers a default-OFF agent-side switch with explicit OFF copy",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"heal-before-trainers-v1",switchable:true});expect(featureInfo(ID).description).toContain(" Off: ");expect(SERVER_FEATURES).not.toContain(ID);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);expect(normalizeFeatures({})[ID]).toBe(false);expect(playHarnessFeatures(flags(true),null)).toContain(ID);
});
it("reproduces exact probed wording from each real native checkpoint context",()=>{
 for(const name of ["healthy-a","healthy-b","rustboro-missing"]){const r=fixture(name);const facts=townCenterFacts(r.state,places.places,r.resultText);expect(facts).not.toBeNull();if(facts===null)throw Error("facts");expect(townCenterText(facts)).toBe(name==="rustboro-missing"?NOTE.replaceAll("OLDALE TOWN","RUSTBORO CITY").replace("(6,16)","(16,38)").replace("[0, 10]","[0, 3]"):NOTE);}
 const r=fixture("rustboro-established");expect(townCenterFacts(r.state,places.places,r.resultText)).toBeNull();
});
it("OFF returns the exact context object with no note, event or tool changes",async()=>{const s=setup(false),input=s.arrive();expect(await s.wiring.transformContext(input)).toBe(input);expect(s.notes).toEqual([]);expect(s.wiring.tools).toEqual([]);});
it("production context factory appends one plain-string final user message with native/result evidence",async()=>{const s=setup(),input=s.arrive(),out=await s.wiring.transformContext(input);expect(out.slice(0,-1)).toEqual(input);expect(out.at(-1)).toMatchObject({role:"user",content:NOTE});expect(typeof out.at(-1)?.content).toBe("string");expect(s.notes).toEqual([{text:NOTE,evidence:[100,101]}]);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);expect(s.notes).toHaveLength(1);});
it("defers through locked arrival; a successful action consumes the visit, but leaving and returning rearms",async()=>{
 const s=setup();let input=s.arrive({...f.state,field_controls_locked:true});expect(await s.wiring.transformContext(input)).toBe(input);
 input=s.arrive();expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);s.reply();input=s.arrive(f.state,f.resultText,"after",110);expect(await s.wiring.transformContext(input)).toBe(input);
 s.arrive({...f.state,map_id:[0,16],location:"ROUTE 101"},"Screen: overworld","route",120);input=s.arrive(f.state,f.resultText,"return",130);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);expect(s.notes).toHaveLength(2);
});
it("failed or text-only replies keep the transient note; native checkpoint update suppresses it",async()=>{const s=setup(),input=s.arrive();await s.wiring.transformContext(input);s.reply("error");expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);s.reply("stop",false);expect((await s.wiring.transformContext(input)).at(-1)?.content).toBe(NOTE);const current=s.arrive({...f.state,heal_before_trainers:{...f.state.heal_before_trainers!,last_heal:[0,10]}});expect(await s.wiring.transformContext(current)).toBe(current);expect(s.notes).toHaveLength(1);});
it("requires coherent native facts, free field, player party and a visible reachable local Center",()=>{
 const variants:GameStateSnapshot[]=[{...f.state,started:false},{...f.state,in_battle:true},{...f.state,screen:"battle"},{...f.state,field_controls_locked:null},{...f.state,party_owner:"tutorial"},{...f.state,map_id:null},{...f.state,blackout_active:true},{...f.state,heal_before_trainers:undefined},{...f.state,heal_before_trainers:{...f.state.heal_before_trainers!,last_heal:null}},{...f.state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A",diagnostic:null}}];
 for(const state of variants)expect(townCenterFacts(state,places.places,f.resultText)).toBeNull();
 for(const text of ["",f.resultText.replace("Menu: none open","Menu: start_menu"),f.resultText.replace("Field-message text: none (no message box is open).","Field-message text: hello"),f.resultText.replaceAll('"kind":"warp","x":6,"y":16','"kind":"warp","x":99,"y":99')])expect(townCenterFacts(f.state,places.places,text)).toBeNull();
 expect(townCenterFacts(f.state,[],f.resultText)).toBeNull();
});
it("does not deliver a stale, failed, unseen or mismatched result",async()=>{
 for(const mode of ["wrong-state","error","absent","changed-text"]){const s=setup(),input=s.arrive();if(mode==="wrong-state"||mode==="error")s.feed(event({type:"tool_result",seq:102,id:"result",name:"observe",text:f.resultText,state_seq:mode==="wrong-state"?99:100,is_error:mode==="error",frames:[],duration_ms:0}));const actual=mode==="absent"?[]:mode==="changed-text"?s.input("result","unrelated result"):input;expect(await s.wiring.transformContext(actual)).toBe(actual);expect(s.notes).toEqual([]);}
});
