import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,dependencyProblems,SWITCHABLE_FEATURES} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";

const ID="native-instruction-tasks-v1";
const TASK="native_devon_goods_recovery";
const REQUEST="Help me! I was robbed by TEAM AQUA!\nI have to get the DEVON GOODS back!";
const label={source:"authored-script",scene:"rustboro-employee-request",beat:"employee-request",speaker:"DEVON EMPLOYEE",map_id:[0,3],actor_local_id:9,message_pointer:0x081e183e,return_pc:0x081e0b6d,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"};
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"native-task",seq:1,t:"2026-10-30T12:00:00.000-04:00",turn:1,...body});
function state(seq=1,flags:number[]=[],extra:Record<string,unknown>={}){
 const bytes=new Uint8Array(300);for(const flag of flags)bytes[flag>>3]=(bytes[flag>>3]??0)|(1<<(flag&7));
 return event({...IN_GAME,type:"state",seq,map_id:[0,3],location:"RUSTBORO CITY",story_progress:{flags:Buffer.from(bytes).toString("hex"),rustboro_stage:3,devon_stage:0,letter:false},world_context:{objects:[],triggers:[],dialogue:REQUEST,message:{phase:"page_wait",ready:true,cursor:REQUEST.length,scene_label:label}},...extra});
}
function dialogue(seq=2,text=REQUEST,patch:Record<string,unknown>={}){return event({type:"dialogue_auto_advance",seq,tool_call_id:`c${String(seq)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:0,stop:"field_free",detail:"",duration_ms:0,pages:[{state_seq:seq-1,map:"RUSTBORO CITY",map_id:[0,3],position:null,speaker:null,speaker_source:null,on_screen:[],text,scene_label:label,...patch}]});}
const result=(seq=3,extra:Record<string,unknown>={})=>event({type:"tool_result",seq,id:`c${String(seq-1)}`,name:"press",text:REQUEST,is_error:false,duration_ms:1,frames:[],state_seq:seq-2,...extra});
function setup(on=true){
 const listeners:((e:RunEvent)=>void)[]=[];
 const records:unknown[]=[];
 const features={...featuresOf(["ram-state-v1","field-dialogue-phase-v1","dialogue-auto-advance-v1","authored-scene-labels-v1","instruction-goal-ledger-v1","instruction-goal-advisory-v1"]),[ID]:on};
 const context=contextTools(features,{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:b=>{records.push(b);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 const feed=(...events:RunEvent[])=>{for(const e of events)for(const l of listeners)l(e);};
 const ledger=context.instructionGoals?.ledger;if(ledger===undefined)throw Error("missing ledger");
 return {features,context,ledger,records,feed};
}
it("factory creates exactly one harness-owned task from the delivered request and preserves it through reset/replay",async()=>{
 const s=setup(),events=[state(),dialogue(),result()];s.feed(...events);
 expect(JSON.parse(s.ledger.archive(undefined,TASK))).toMatchObject({owner:"harness",status:"open",native_phase:"pending",sources:[{episode:3,page:0}]});
 const before=s.ledger.text();expect(before).toContain(REQUEST.replaceAll("\n","\\n"));expect(before).not.toContain("No route or goal is assigned by the harness");
 expect(JSON.stringify(await s.context.transformContext([]))).toContain(TASK);
 const repeat=[state(4),dialogue(5),result(6)];s.feed(...repeat);
 const listing=JSON.parse(s.ledger.archive()) as {goal_count:number};expect(listing.goal_count).toBe(1);
 const travel=[state(7,[],{map_id:[0,31],world_context:{objects:[],triggers:[],dialogue:null}}),result(8,{id:"travel",state_seq:7})];s.feed(...travel);
 expect(JSON.stringify(await s.context.transformContext([]))).toContain(TASK);
 const restored=setup();restored.feed(...events,...repeat,...travel);expect(restored.ledger.text()).toBe(s.ledger.text());
 const off=setup(false);off.feed(...events);expect(()=>off.ledger.archive(undefined,TASK)).toThrow("Unknown goal");
});
it.each(["failed","greeting","unlabelled","wrong-map","battle","missing-state","unknown-native","already-recovered","mismatched-native"])("does not create a task on %s",kind=>{
 const s=setup();let st=state(),d=dialogue(),r=result();
 if(kind==="failed")r=result(3,{is_error:true});
 if(kind==="greeting")d=dialogue(2,"Oh, it's you!");
 if(kind==="unlabelled")d=dialogue(2,REQUEST,{scene_label:undefined});
 if(kind==="wrong-map")d=dialogue(2,REQUEST,{map_id:[0,4]});
 if(kind==="battle")d=dialogue(2,REQUEST,{battle_turn:1});
 if(kind==="missing-state")d=dialogue(2,REQUEST,{state_seq:null});
 if(kind==="unknown-native")st=state(1,[],{story_progress:null});
 if(kind==="already-recovered")st=state(1,[143]);
 if(kind==="mismatched-native")st=state(1,[],{world_context:{objects:[],triggers:[],dialogue:"Other page"}});
 s.feed(st,d,r);expect(()=>s.ledger.archive(undefined,TASK)).toThrow("Unknown goal");
});
it("canonical request cannot be erased, renamed, abandoned or model-completed; supporting plans remain editable",()=>{
 const s=setup();s.feed(state(),dialogue(),result());const original=JSON.parse(s.ledger.archive(undefined,TASK)) as Record<string,unknown>;
 for(const status of ["open","active","deferred","blocked","reported_complete","superseded","abandoned"]){
  expect(()=>s.ledger.apply({reviewed:[],updates:[{id:TASK,title:"Changed",sources:[{episode:3,page:0}],parent:null,status,reason:"Model says",completion:"I said so"}]})).toThrow(/harness|canonical/i);
  expect(JSON.parse(s.ledger.archive(undefined,TASK))).toEqual(original);
 }
 s.ledger.apply({reviewed:[],updates:[{id:"heal",title:"Heal first",sources:[{episode:3,page:0}],parent:TASK,status:"active",reason:"Need health",completion:"Party healed"}]});
 expect(s.ledger.archive(undefined,"heal")).toContain('"parent":"native_devon_goods_recovery"');
 expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"pending"');
});
it("requires successfully delivered native recovery then separately tracks reporting; defeat/arrival/unknown do not complete",()=>{
 const s=setup();s.feed(state(),dialogue(),result());
 s.feed(state(4,[1296]),result(5,{id:"defeated",state_seq:4}));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"pending"');
 s.feed(state(6,[143]));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"pending"');
 s.feed(result(7,{id:"failed",state_seq:6,is_error:true}));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"pending"');
 s.feed(result(8,{id:"recover",state_seq:6}));expect(JSON.parse(s.ledger.archive(undefined,TASK))).toMatchObject({status:"reported_complete",verification:"native_verified",native_phase:"recovered"});
 s.feed(state(9,[144]),result(10,{id:"inconsistent",state_seq:9}));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"recovered"');
 s.feed(state(11,[143,144]),result(12,{id:"reported",state_seq:11}));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"reported_back"');
 s.feed(state(13,[],{story_progress:null}),result(14,{id:"unknown",state_seq:13}));expect(s.ledger.archive(undefined,TASK)).toContain('"native_phase":"reported_back"');
});
it("registers appended default-OFF mode with ledger, advisory and authored evidence requirements and honest prompt",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(317);
 expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 const s=setup();expect(dependencyProblems(s.features)).toEqual([]);
 for(const dependency of ["instruction-goal-ledger-v1","instruction-goal-advisory-v1","authored-scene-labels-v1"] as const)expect(dependencyProblems({...s.features,[dependency]:false})).toContain(`${ID} needs ${dependency}`);
 expect(playSystemPrompt(s.features,null)).toContain("harness-owned");
 expect(playSystemPrompt(s.features,null)).not.toContain("The harness never assigns a goal");
});
