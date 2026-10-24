import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"instruction-goal-ledger-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {isCheckedPress,pressTool,type CheckedPressTool} from "./game-tools.js";
import {StoryDestinations,type PlacesBody} from "./story-destinations.js";
import {GymProgress,withGymProgress} from "./gym-readiness.js";

const ID="gym-evidence-v1";
const raw=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/gym-evidence-d548.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const events=raw.events.map(checkEvent);
const must=<T,>(v:T|undefined|null):T=>{if(v==null)throw Error("fixture");return v;};
const recorded=must(events.find((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e));
const state=parseGameState(Object.fromEntries(Object.entries(recorded).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k))));
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const line="Gym progress (game memory): RUSTBORO CITY GYM incomplete; ROXANNE not defeated.";
const resultText=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

function factory(on:boolean,options:{trust?:boolean;destinations?:boolean;cite?:boolean}={}){
 const subs:((e:RunEvent)=>void)[]=[];
 const citations:unknown[]=[];
 const calls:{name:string;id:string;params:unknown}[]=[];
 const recorder={subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);},recordState:()=>{throw Error("unused");},recordDialogueAutoAdvance:()=>{throw Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,unfinishedActivity:()=>undefined,destinationCitation:(facts:unknown,text:string|null)=>{citations.push({facts,text});}};
 let current:AgentToolResult<{state:GameStateSnapshot}>={content:[{type:"text",text:"Screen: overworld\nLocation: RUSTBORO CITY\nStory: Rustboro Gym Josh defeated; Rustboro Gym Tommy defeated; Rustboro Gym Marc defeated\nBadges: none"}],details:{state}};
 const base:AgentTool[]=["observe","press","navigate_to"].map(name=>({name,label:name,description:"fixture",parameters:Type.Object({}),execute:(id:string,params:unknown)=>{calls.push({name,id,params});return Promise.resolve(current);}}));
 const features={...OFF,[ID]:on,"harness-trust-v1":options.trust??false,"story-destinations-v1":options.destinations??false,"cited-destination-v1":options.cite??false,"input-cuts-v1":true,"reachable-story-guidance-v1":true};
 const tools=playGameTools(base,features,{read:()=>Promise.resolve(state),places:()=>Promise.resolve(places)},recorder);
 const feed=(es:readonly RunEvent[])=>{for(const e of es)for(const sub of subs)sub(e);};
 const call=(name:string,args:unknown={})=>must(tools.find(t=>t.name===name)).execute("test",args);
 return {tools,feed,call,citations,calls,set:(s:GameStateSnapshot,text:string)=>{current={content:[{type:"text",text}],details:{state:s}};}};
}

it("registers default OFF, records ON, and puts only the bundle arms ON",()=>{
 expect(featureInfo(ID)).toMatchObject({needs:null,switchable:true});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 const old=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([k])=>k!==ID));
 expect(presetFeatures(parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:old}))[ID]).toBe(false);
 expect(playHarnessFeatures({...OFF,[ID]:true},null)).toContain(ID);
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
  const d=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
  expect(d.base.features[ID]).toBe(false);expect(d.switches).toContain(ID);expect(d.onInBoth).not.toContain(ID);
 }
});

it("production factory gives current incomplete state after the heal trip; OFF returns identical tools/results",async()=>{
 const off=factory(false),on=factory(true);
 on.feed(events.filter(e=>e.seq<15558));
 const before=await off.call("observe"),after=await on.call("observe");
 expect(resultText(after)).toBe(`${line}\n${resultText(before)}`);
 expect(after.details).toEqual(before.details);
 expect(after.content.filter(p=>p.type!=="text")).toEqual(before.content.filter(p=>p.type!=="text"));
 expect(on.tools.map(t=>[t.name,t.parameters,t.description])).toEqual(off.tools.map(t=>[t.name,t.parameters,t.description]));
 expect(resultText(after)).not.toMatch(/go to|head|return|heal|talk to|next|Meteorite|Devon/i);
});

it("native false, true and unavailable stay distinct; healing does not retire progress; no unseen leader or Gym is named",()=>{
 const g=new GymProgress();
 expect(g.block(state)).toBeNull();
 g.observe(must(events.find(e=>e.seq===14990)));
 expect(g.block(state)).toBe(line);
 expect(g.block({...state,story:{...must(state.story),rustboro_gym_complete:false,roxanne_defeated:true}})).toBe("Gym progress (game memory): RUSTBORO CITY GYM incomplete; ROXANNE defeated.");
 expect(g.block({...state,story:{...must(state.story),rustboro_gym_complete:false,roxanne_defeated:null}})).toBe("Gym progress (game memory): RUSTBORO CITY GYM incomplete; ROXANNE defeat state unknown.");
 expect(g.block({...state,story:{...must(state.story),rustboro_gym_complete:null,roxanne_defeated:false}})).toBe("Gym progress (game memory): RUSTBORO CITY GYM completion unknown; ROXANNE not defeated.");
 expect(g.block({...state,story:{...must(state.story),rustboro_gym_complete:true,roxanne_defeated:true}})).toBe("Gym progress (game memory): RUSTBORO CITY GYM complete; ROXANNE defeated.");
 expect(g.block({...state,story:{...must(state.story),rustboro_gym_complete:null,roxanne_defeated:null}})).toBe("Gym progress (game memory): RUSTBORO CITY GYM completion unknown; ROXANNE defeat state unknown.");
 expect(g.block({...state,story:null})).toBe("Gym progress (game memory): RUSTBORO CITY GYM completion unknown; ROXANNE defeat state unknown.");
 expect(g.block({...state,started:false})).toBeNull();
 const failed=new GymProgress();const e=must(events.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.seq===14990));failed.observe({...e,is_error:true});expect(failed.block(state)).toBeNull();
});

it("resolves the whole Gym-in-city phrase in both production destination owners without substituting the town",async()=>{
 for(const owner of ["trust","destinations"] as const){
  const on=factory(true,{[owner]:true}),off=factory(false,{[owner]:true});
  const dialogue=events.filter(e=>e.seq<=8381);on.feed(dialogue);off.feed(dialogue);
  const yes=resultText(await on.call("observe")),no=resultText(await off.call("observe"));
  expect(yes).toContain('"POKéMON GYM in RUSTBORO CITY" = RUSTBORO CITY GYM (map 11/3)');
  expect(yes).not.toContain('"RUSTBORO CITY" = RUSTBORO CITY (map 0/3)');
  expect(no).toContain('"POKéMON GYM": not resolved');
  expect(no).toContain('"RUSTBORO CITY" = RUSTBORO CITY (map 0/3)');
 }
});

it("compound resolution fails closed on missing/ambiguous Gym instead of falling back to the town",()=>{
 const s=new StoryDestinations(false,false,false,true);for(const e of events.filter(e=>e.seq<=8381))s.observe(e);
 const removed=places.places.filter(p=>!(p.map_id[0]===11&&p.map_id[1]===3));
 for(const ps of [removed,[...removed,{...must(places.places.find(p=>p.map_id[0]===11&&p.map_id[1]===3)),map_id:[99,99] as [number,number]},...places.places.filter(p=>p.map_id[0]===11&&p.map_id[1]===3)]]){
  const goal=must(s.goal([0,3],state.name,"later",ps));
  expect(goal.resolved.map(r=>r.target)).toEqual([null]);
  expect(goal.resolved[0]?.quote).toBe('"POKéMON GYM in RUSTBORO CITY"');
 }
});

it("delivers citation misses despite input-cuts, records the same delivered text, and leaves actions unchanged",async()=>{
 const on=factory(true,{cite:true}),off=factory(false,{cite:true});
 on.feed(events);off.feed(events);
 const args={x:17,y:20,map_id:[0,3],because:"I need to go to the Devon Corporation to get the Meteorite."};
 const yes=resultText(await on.call("navigate_to",args)),no=resultText(await off.call("navigate_to",args));
 expect(yes).toContain('Destination citation: the supplied because text was not found in the game observations shown this run.');
 expect(yes).not.toContain(args.because);
 expect(no).not.toContain("Destination citation:");
 expect(on.calls).toEqual(off.calls);
 expect(on.calls).toEqual([{name:"navigate_to",id:"test",params:{x:17,y:20,map_id:[0,3]}}]);
 expect(on.citations).toContainEqual({facts:{tool_call_id:"test",because:args.because,verdict:"not_found",found_turn:null,x:17,y:20,map_id:[0,3]},text:"Destination citation: the supplied because text was not found in the game observations shown this run."});
});

it("qualifies only delivered game readout names; model rationale echoes and native states do not introduce names",()=>{
 const event=must(events.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.seq===14990));
 const g=new GymProgress();g.observe(recorded);g.observe({...event,text:'Because: "ROXANNE is in RUSTBORO CITY GYM" is not in anything the game showed.'});
 expect(g.block(state)).toBeNull();
 g.observe({...event,text:'Story: Rustboro Gym Josh defeated\nStory characters here: none. Not on this map: PROF. BIRCH, ROXANNE, STEVEN.'});
 expect(g.block(state)).toBe('Gym progress (game memory): RUSTBORO CITY GYM incomplete.');
 g.observe({...event,text:'Sign text "RUSTBORO CITY POKéMON GYM | LEADER: ROXANNE | “The ROCK-loving honors student!”" at (23,19)'});
 expect(g.block(state)).toBe(line);
});

it("keeps checked presses and all game result paths, including missing text/state, on the original execution path",async()=>{
 const subs:((e:RunEvent)=>void)[]=[];const recorder={subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);}};
 let result:AgentToolResult<unknown>={content:[{type:"image",data:"abc",mimeType:"image/png"}],details:{state}};
 const calls:unknown[][]=[];
 const execute:AgentTool['execute']=(...args)=>{calls.push(args);return Promise.resolve(result);};
 const original=pressTool("http://127.0.0.1:1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()});
 if(!isCheckedPress(original))throw Error("checked fixture");
 const checked:CheckedPressTool={...original,execute,executeChecked:(...args)=>{calls.push(args);return Promise.resolve({content:result.content,details:{state}});}};
 const base=[checked,...['observe','navigate_to','navigate_to_target','explore_map','battle_action','recall_dialogue'].map(name=>({...checked,name}))];
 const unchanged=withGymProgress(base,OFF,recorder);
 expect(unchanged).toEqual(base);expect(subs).toEqual([]);
 for(const [i,tool] of unchanged.entries())expect(tool).toBe(base[i]);
 const tools=withGymProgress(base,{...OFF,[ID]:true,'semantic-navigation-v2':true},recorder);
 for(const e of events)for(const sub of subs)sub(e);
 const signal=new AbortController().signal,update=()=>undefined;
 const press=must(tools.find(t=>t.name==='press'));if(!isCheckedPress(press))throw Error('lost checked press');
 const check=()=>undefined;
 const out=await press.executeChecked('checked',{buttons:['A']},check,signal,update);
 expect(calls).toEqual([['checked',{buttons:['A']},check,signal,update,undefined]]);
 expect(resultText(out)).toBe(line);expect(out.content[1]).toEqual(result.content[0]);
 for(const name of ['press','observe','navigate_to','navigate_to_target','explore_map','battle_action'])expect(resultText(await must(tools.find(t=>t.name===name)).execute(name,{}))).toBe(line);
 expect(must(tools.find(t=>t.name==='recall_dialogue'))).toBe(base.at(-1));
 result={content:[{type:'text',text:'unchanged'}],details:{}};
 expect(await press.execute('no-state',{buttons:['A']})).toBe(result);
});

it("qualifies each delivered Gym and leader source independently",()=>{
 const event=must(events.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.seq===14990));
 const sources=[
  ['Location: RUSTBORO CITY GYM',false],
  ['Story: Rustboro Gym Josh defeated',false],
  ['Sign text "RUSTBORO CITY POKéMON GYM | LEADER: ROXANNE | “The ROCK-loving honors student!”" at (23,19)',true],
  ['Location: RUSTBORO CITY GYM\nStory characters here (from this map\'s own object list): ROXANNE at 5,2. Not on this map: MAY.',true],
  ['Location: RUSTBORO CITY GYM\n- map 11/3 object 1: sprite ROXANNE (graphics 125) at (5,2)',true],
 ] as const;
 for(const [text,named] of sources){
  const g=new GymProgress();g.observe({...event,text});
  expect(g.block(state),text).toBe(named?line:'Gym progress (game memory): RUSTBORO CITY GYM incomplete.');
 }
});
