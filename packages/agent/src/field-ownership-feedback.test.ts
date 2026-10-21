// field-ownership-feedback-v1: run 2026-10-21T13-33-36_qwen36-gpu1_d548 called navigate_to_target on object 21 for
// 85 turns at an evolution decision (seq 20511, 20531: "target is not listed in the current verified state", no
// Screen or Interface line). The game keeps gMain.inBattle set through a post-battle evolution (TryEvolvePokemon runs
// before ReturnFromBattleToOverworld), so in_battle stays true while screen is evolution.
import {readFileSync} from "node:fs";
import type {AgentMessage,AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {SupervisorBriefing,interfaceOf} from "./loop-supervisor.js";
import {autoTalkContext} from "./auto-talk.js";

const ID="field-ownership-feedback-v1" as const;
const raw=JSON.parse(readFileSync(new URL("../test-support/evolution-owned-d548.json",import.meta.url),"utf8")) as {state:Record<string,unknown>};
const EVENT=checkEvent(raw.state);
const SNAPSHOT=Object.fromEntries(Object.entries(raw.state).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key)));
const EVOLUTION=parseGameState(SNAPSHOT);
const CONTROLS="Evolution is waiting for choose_evolution: evolve or cancel. Ordinary button input is blocked.";
// The readout observe returns for this state: the server's Screen and Interface lines, whole.
const READOUT=`Location: ROUTE116\nScreen: evolution\nDialog: none\nMenu: no selectable menu is open\nInterface: evolution_decision; input ready; ${CONTROLS}\nBattle details: TRAINER single · turn 3 · finishing (outcome won)`;
const fixed=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
const bundle=(on:boolean):FeatureSet=>({...normalizeFeatures({...fixed.base.features,...Object.fromEntries(fixed.switches.map(id=>[id,true]))} as Parameters<typeof normalizeFeatures>[0]),[ID]:on});

// The production factory with the navigation switches the semantic tool needs (as semantic-navigation.test.ts builds it).
const navigationFeatures=(on:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,[ID]:on});
function production(features:FeatureSet,state:GameStateSnapshot){
 const buttons:string[][]=[];let observed=0;
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>{observed++;return Promise.resolve({content:[{type:"image",data:"AAAA",mimeType:"image/png"},{type:"text",text:READOUT}],details:{state}});}};
 const pressRun=(args:{buttons:string[]}):Promise<AgentToolResult<{state:GameStateSnapshot}>>=>{buttons.push(args.buttons);return Promise.resolve({content:[{type:"text",text:"pressed"}],details:{state}});};
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id:string,args:{buttons:string[]})=>pressRun(args),executeChecked:(_id:string,args:{buttons:string[]})=>pressRun(args)} as unknown as CheckedPressTool;
 const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined,trainerSightCheck:()=>undefined,storyBattleHealGate:()=>undefined,harnessTrust:()=>undefined,healFirst:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
 const tools=playGameTools([observe,press],features,{read:()=>Promise.resolve(state),places:()=>Promise.resolve([]),trainerSight:()=>Promise.resolve({tiles:[]})} as never,recorder);
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("navigate_to_target missing");
 return {tool,buttons,observed:()=>observed};
}
const texts=(r:AgentToolResult<unknown>):string[]=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]);

describe("field-ownership-feedback-v1: navigate_to_target on an owned interface",()=>{
 it("refuses before resolving, names the screen, presses nothing and returns the whole observation readout",async()=>{
  const p=production(navigationFeatures(true),EVOLUTION);
  const out=await p.tool.execute("d548-557",{map_id:[0,31],target:{kind:"object",local_id:21}});
  expect(p.buttons).toEqual([]);expect(p.observed()).toBe(1);
  const all=texts(out).join("\n");
  expect(all).toContain("Semantic navigation: refused because the game is not on the field (screen: evolution); navigate_to_target walks only on the field; nothing was pressed. Selected map object 21.");
  expect(texts(out)).toContain(READOUT);
  expect(all).not.toContain("target is not listed in the current verified state");
  expect(out.content.some(p=>p.type==="image")).toBe(true);
  expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false,status:"refused because the game is not on the field (screen: evolution); navigate_to_target walks only on the field; nothing was pressed"}});
 });
 it("names a summary screen and an open field menu the same way, and a battle screen as a battle",async()=>{
  const summary={...EVOLUTION,screen:"summary",in_battle:false,active_ui:{phase:"summary_move_forget",selected:"SCRATCH",ready:true,controls:"UP/DOWN selects a move; A forgets it",diagnostic:null,value:null}};
  expect(texts(await production(navigationFeatures(true),summary).tool.execute("s",{map_id:[0,31],target:{kind:"object",local_id:21}})).join("\n")).toContain("refused because the game is not on the field (screen: summary); navigate_to_target walks only on the field; nothing was pressed");
  const yesNo={...EVOLUTION,screen:"overworld",in_battle:false,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"UP/DOWN selects",diagnostic:null,value:null}};
  expect(texts(await production(navigationFeatures(true),yesNo).tool.execute("s",{map_id:[0,31],target:{kind:"object",local_id:21}})).join("\n")).toContain("refused because a menu or other interface is open (field_yes_no); close it before calling navigate_to_target; nothing was pressed");
  const battle={...EVOLUTION,screen:"battle",active_ui:{phase:"battle_input",selected:"FIGHT",ready:true,controls:"FIGHT",diagnostic:null,value:null}};
  const p=production(navigationFeatures(true),battle);
  expect(texts(await p.tool.execute("s",{map_id:[0,31],target:{kind:"object",local_id:21}})).join("\n")).toContain("refused because a battle is in progress; navigate_to_target walks only on the field; nothing was pressed");
  expect(p.buttons).toEqual([]);
 });
 it("OFF keeps today's refusal with no observation",async()=>{
  const p=production(navigationFeatures(false),EVOLUTION);
  const out=await p.tool.execute("d548-557",{map_id:[0,31],target:{kind:"object",local_id:21}});
  expect(p.observed()).toBe(0);expect(p.buttons).toEqual([]);
  expect(texts(out)[0]).toBe("Semantic navigation: target is not listed in the current verified state. Selected map object 21.");
  expect(texts(out).join("\n")).not.toContain("Screen: evolution");
 });
});

describe("field-ownership-feedback-v1: stall briefing",()=>{
 const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"d548",t:"2026-10-21T15:20:48.000-04:00",turn:557,seq,...body});
 const field=ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE116",map_id:[0,31],position:{x:37,y:13},facing:"left",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null}},1);
 const result=(seq:number,stateSeq:number):RunEvent=>ev({type:"tool_result",id:`c${String(seq)}`,name:"navigate_to_target",is_error:false,duration_ms:1,text:"refused",frames:[],state_seq:stateSeq},seq);
 const brief=(on:boolean):string=>{
  const b=new SupervisorBriefing(bundle(on));
  b.observe(field);b.observe(result(2,1));
  b.observe({...EVENT,seq:3});b.observe(result(4,3));
  return b.stallText({kind:"milestone_drought",minutes:10},662);
 };
 it("names the evolution decision and its controls over in_battle",()=>{
  const text=brief(true);
  expect(text).toContain("- Where you are: in the evolution decision interface (screen evolution); your last field position was ROUTE116 (map 0/31) at 37,13");
  expect(text).toContain(`controls the game shows: ${CONTROLS}`);
  expect(text).not.toContain("in battle");
 });
 it("OFF briefs the evolution screen as a battle",()=>{
  const text=brief(false);
  expect(text).toContain("- Where you are: ROUTE116 (map 0/31) in battle at 37,13");
  expect(text).not.toContain("evolution decision interface");
 });
 it("interfaceOf takes a ready non-battle interface over the battle flag only when asked",()=>{
  const screen={started:true,screen:"evolution",in_battle:true,active_ui:EVOLUTION.active_ui??null,naming:null};
  expect(interfaceOf(screen)).toBeNull();
  expect(interfaceOf(screen,true)).toMatchObject({key:"ui:evolution_decision",name:"evolution decision interface",controls:CONTROLS});
  expect(interfaceOf({...screen,screen:"battle"},true)).toBeNull();
  expect(interfaceOf({...screen,active_ui:{...EVOLUTION.active_ui,ready:false} as never},true)).toBeNull();
 });
});

describe("field-ownership-feedback-v1: auto-talk on an owned interface",()=>{
 type Talk=Omit<Extract<RunEvent,{type:"auto_talk"}>,"v"|"run"|"seq"|"t"|"turn"|"type">;
 function rig(on:boolean){
  let s:GameStateSnapshot=EVOLUTION;const calls:string[]=[];const talks:Talk[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
  const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:(_id,params)=>{calls.push(`${name} ${JSON.stringify(params)}`);return Promise.resolve({content:[{type:"text",text:"x"}],details:{}});}});
  const features:FeatureSet={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet,"duplicate-turn-collapse-v1":true,"auto-talk-v1":true,[ID]:on};
  const fixedPoint={turns:8,loop:"a",names:["navigate_to_target"] as readonly string[]};
  const transform=autoTalkContext(features,{read:()=>Promise.resolve(s)},[tool("navigate_to"),tool("press")],m=>Promise.resolve(m),{fixedPoint:()=>fixedPoint,noTool:()=>({replies:0,loop:"silent:0"})} as never,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push(b);}});
  const messages:AgentMessage[]=[userText("Play."),{role:"toolResult",toolCallId:"c1",toolName:"navigate_to",content:[{type:"text",text:"refused"}],isError:false,timestamp:0}];
  return {calls,talks,send:(m:AgentMessage[]=messages)=>transform([...m]),set:(next:GameStateSnapshot)=>{s=next;},emit:(e:RunEvent)=>{for(const fn of subscribers)fn(e);},messages};
 }
 const last=(out:readonly AgentMessage[]):string=>{const m=out.at(-1);return m!==undefined&&"role"in m&&m.role==="user"&&Array.isArray(m.content)?m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join(""):"";};
 const TEXT=`SUPERVISOR: Your last 8 turns made the same call and the game state stayed the same. The harness did not walk or press anything: the game is showing the evolution decision (screen evolution), not the field. Controls the readout lists for it: ${CONTROLS}`;
 it("sends one message naming the interface and its controls, once per interface episode, and never presses",async()=>{
  const r=rig(true);
  const out=await r.send();
  expect(last(out)).toBe(TEXT);
  expect(r.talks).toEqual([{trigger:"fixed_point",repeats:8,outcome:"not_free",target:null,walks:0,tried:0,text:TEXT}]);
  const newer:AgentMessage[]=[...r.messages,{role:"toolResult",toolCallId:"c2",toolName:"press",content:[{type:"text",text:"refused"}],isError:false,timestamp:1}];
  const again=await r.send(newer);
  expect(again).toEqual(newer);
  expect(r.talks.map(t=>t.text)).toEqual([TEXT,null]);
  expect(r.calls).toEqual([]);
  // The field comes back (the episode ends), then a new evolution opens: one new message.
  r.emit(checkEvent({v:1,run:"d548",seq:10,t:"2026-10-21T15:30:00.000-04:00",turn:600,type:"state",...IN_GAME,started:true,screen:"overworld",map_id:[0,31],position:{x:37,y:13},facing:"left",field_controls_locked:false,interaction_targets:[]}));
  const newest:AgentMessage[]=[...newer,{role:"toolResult",toolCallId:"c3",toolName:"press",content:[{type:"text",text:"x"}],isError:false,timestamp:2}];
  expect(last(await r.send(newest))).toBe(TEXT);
  expect(r.calls).toEqual([]);
 });
 it("says nothing for a battle on the field screen, and OFF stays silent",async()=>{
  const battle=rig(true);battle.set({...EVOLUTION,screen:"overworld",active_ui:null});
  expect(await battle.send()).toEqual(battle.messages);
  expect(battle.talks.map(t=>t.text)).toEqual([null]);
  const off=rig(false);
  expect(await off.send()).toEqual(off.messages);
  expect(off.talks).toEqual([{trigger:"fixed_point",repeats:8,outcome:"not_free",target:null,walks:0,tried:0,text:null}]);
 });
});

describe("field-ownership-feedback-v1 registration",()=>{
 it("is a default-off agent-only guard, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
