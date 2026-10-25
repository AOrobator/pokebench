import {expect,it} from "vitest";
import {FEATURES,SWITCHABLE_FEATURES,SERVER_FEATURES,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {toolSwitches,playSystemPrompt,playTools} from "./play-config.js";
import {pressResult} from "./press-result.js";
import {LoopCoordinator} from "./loop/coordinator.js";
import type {LoopNotice} from "./loop/types.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

const IDS=["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"] as const;
const off=()=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"mauville-puzzle-readout-v1":false});
function bag(pocket="TMS HMS",index=0,item=-2){return {...IN_GAME,screen:"bag_menu",active_ui:{phase:"bag_menu",selected:item===-2?"CLOSE BAG":"TM39",ready:true,diagnostic:null,value:null,controls:"Directions select; A accepts; B cancels",details:{pocket,bag_location:0,owner_task:0,selected_index:index,list_item_id:item}}};}
it("registers independent omitted-OFF switches without tool/prompt changes",()=>{
 for(const id of IDS){const old=off();const {[id]:value,...omitted}=old;expect(value).toBe(false);expect(normalizeFeatures(omitted)[id]).toBe(false);
 const on={...old,[id]:true};expect(playHarnessFeatures(on,null)).toEqual([...playHarnessFeatures(old,null),id]);expect(playTools(on)).toEqual(playTools(old));expect(playSystemPrompt(on,null)).toBe(playSystemPrompt(old,null));expect(FEATURES.find(f=>f.id===id)?.description).toContain(" Off: ");}
 expect(SWITCHABLE_FEATURES.filter(id=>IDS.some(expected=>expected===id))).toEqual(IDS);expect(SERVER_FEATURES).toContain(IDS[0]);expect(serverFeatureEnv(off()).POKEBENCH_FEATURES_OFF.split(",")).toContain(IDS[0]);
});
it("production tool switches report a changed empty pocket, preserving exact OFF text",()=>{
 const before=bag("BERRIES"),after=bag("TMS HMS");
 const legacy="interface unchanged (no net phase, selection, value, or readiness change; intermediate effects unknown)";
 expect(pressResult(before,after,["LEFT"],toolSwitches(off()))).toBe(legacy);
 expect(pressResult(before,after,["LEFT"],toolSwitches({...off(),"bag-press-feedback-v1":true}))).toContain("interface changed");
});
it("cursor and item changes count, raw task/timer churn does not",()=>{
 const switches=toolSwitches({...off(),"bag-press-feedback-v1":true});
 expect(pressResult(bag(),bag("TMS HMS",1),["DOWN"],switches)).toContain("interface changed");
 expect(pressResult(bag(),bag("TMS HMS",0,339),["UP"],switches)).toContain("interface changed");
 const after={...bag(),active_ui:{...bag().active_ui,details:{...bag().active_ui.details,task_data:[100,1,2]}}};
 expect(pressResult(bag(),after,["UP"],switches)).toContain("interface unchanged");
});
it("warns after three equivalent bag attempts, while OFF never qualifies",()=>{
 for(const enabled of [false,true]){const notices:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notices.push(n),{bagLoops:enabled});
 for(let i=0;i<3;i++)detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:bag(),state:bag(),seq:i+1});
 expect(notices.some(n=>n.kind==="ineffective"&&n.phase==="warning")).toBe(enabled);}
});
it("real pocket or cursor movement resets ineffective attempts and recovers a warning",()=>{
 const notices:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notices.push(n),{bagLoops:true});
 const press=(before:GameStateSnapshot,state:GameStateSnapshot)=>{detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:before,state});};
 press(bag(),bag());press(bag(),bag());press(bag(),bag("BERRIES"));press(bag("BERRIES"),bag("BERRIES"));expect(notices).toEqual([]);
 press(bag("BERRIES"),bag("BERRIES"));press(bag("BERRIES"),bag("BERRIES"));expect(notices.at(-1)?.phase).toBe("warning");
 detector.context();press(bag("BERRIES"),bag("BERRIES",1));expect(notices.at(-1)?.phase).toBe("recovered");
});
it("does not infer ineffective loops from transitions, diagnostics or incomplete bag ownership",()=>{
 for(const mutation of ["ready","diagnostic","owner_task","selected_index","pocket","list_item_id"]){const original=bag();const state:GameStateSnapshot={...original,active_ui:{...original.active_ui,...(mutation==="ready"?{ready:false}:mutation==="diagnostic"?{diagnostic:"unknown"}:{details:Object.fromEntries(Object.entries(original.active_ui.details).filter(([key])=>key!==mutation))})}};
 const notices:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notices.push(n),{bagLoops:true});for(let i=0;i<8;i++)detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:state,state});expect(notices,mutation).toEqual([]);}
});

it("replays 3b6e through production guard attachment and supplies warning before the next decision",async()=>{
 const {readFileSync}=await import("node:fs");const {gunzipSync}=await import("node:zlib");
 const {checkEvent}=await import("./events.js");const {attachLoopGuard,Governor}=await import("./harness.js");
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/bag-3b6e.json.gz",import.meta.url))).toString("utf8"));
 if(!Array.isArray(raw))throw new Error("expected event list");const events=raw.map(checkEvent);
 for(const enabled of [false,true]){
 const notices:LoopNotice[]=[];const subscribers:((e:ReturnType<typeof checkEvent>)=>void)[]=[];const delivered:string[]=[];
 const governor=new Governor({limits:{maxTurns:1000,maxWallMs:100000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:n=>notices.push(n)},governor,undefined,"enforced",false,undefined,false,false,false,false,false,false,false,false,false,false,false,false,{"bag-ineffective-loop-v1":enabled});
 for(const event of events){if(event.type==="turn_start"){const note=detector.context();if(note)delivered.push(note);}for(const fn of subscribers)fn(event);}
 expect(notices.some(n=>n.kind==="ineffective"&&n.phase==="warning")).toBe(enabled);
 if(enabled){expect(notices.find(n=>n.phase==="warning")?.evidence.at(-1)).toBeLessThan(54200);expect(delivered.join("\n")).toContain("Repeated equivalent single-button attempts");}else expect(delivered).toEqual([]);
 }
});

it("qualifies verified battle bags without qualifying ordinary battle screens, preserving OFF",()=>{
 const battleBag=(pocket="TMS HMS",index=0)=>{const state=bag(pocket,index);return {...state,in_battle:true,active_ui:{...state.active_ui,details:{...state.active_ui.details,bag_location:1}}};};
 for(const enabled of [false,true]){const notices:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notices.push(n),{bagLoops:enabled});
 const press=(before:GameStateSnapshot,state:GameStateSnapshot)=>{detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:before,state});};
 press(battleBag(),battleBag());press(battleBag(),battleBag());press(battleBag(),battleBag("BERRIES"));press(battleBag("BERRIES"),battleBag("BERRIES"));expect(notices).toEqual([]);
 press(battleBag("BERRIES"),battleBag("BERRIES"));press(battleBag("BERRIES"),battleBag("BERRIES"));expect(notices.some(n=>n.kind==="ineffective"&&n.phase==="warning")).toBe(enabled);
 if(enabled){detector.context();press(battleBag("BERRIES"),battleBag("BERRIES",1));expect(notices.at(-1)?.phase).toBe("recovered");}
 }
 const notices:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notices.push(n),{bagLoops:true});const battle={...IN_GAME,in_battle:true,screen:"battle",active_ui:null};for(let i=0;i<5;i++)detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:battle,state:battle});expect(notices).toEqual([]);
});

it("ignores raw task churn for warnings and recovery with the existing field and battle loop switches ON",async()=>{
 const {readFileSync}=await import("node:fs");const {checkEvent}=await import("./events.js");
 const recorded=checkEvent(JSON.parse(readFileSync(new URL("../test-support/move-goal-battle-state.json",import.meta.url),"utf8")));
 if(recorded.type!=="state"||!("battle" in recorded))throw Error("fixture must be a validated native state event with battle data");
 const battle=recorded.battle;
 if(battle==null||battle.diagnostic!==null)throw Error("fixture must carry a verified native battle payload");
 for(const inBattle of [false,true])for(const enabled of [false,true]){
 const notes:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notes.push(n),{bagLoops:enabled,ineffectiveLoops:true,battles:true,interactions:true});
 const snapshot=(taskData:number,pocket="TMS HMS"):GameStateSnapshot=>{
 const state=bag(pocket);return {...state,in_battle:inBattle,...(inBattle?{battle}:{}),active_ui:{...state.active_ui,details:{...state.active_ui.details,bag_location:inBattle?1:0,task_data:[taskData]}}};
 };
 const press=(before:GameStateSnapshot,state:GameStateSnapshot)=>{detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:before,state});};
 for(let i=0;i<3;i++)press(snapshot(i),snapshot(i));
 expect(notes.filter(n=>n.kind==="ineffective"&&n.phase==="warning"),`battle=${String(inBattle)} enabled=${String(enabled)}`).toHaveLength(enabled?1:0);
 if(!enabled)continue;
 detector.context();press(snapshot(3),snapshot(4));
 expect(notes.map(n=>n.phase)).toEqual(["warning"]);
 press(snapshot(5),snapshot(6,"BERRIES"));
 expect(notes.map(n=>n.phase)).toEqual(["warning","recovered"]);
 }
});

it.each([false,true])("does not fabricate recovery from raw task churn after an established bag warning; battle=%s",async(inBattle)=>{
 const {readFileSync}=await import("node:fs");const {checkEvent}=await import("./events.js");
 const recorded=checkEvent(JSON.parse(readFileSync(new URL("../test-support/move-goal-battle-state.json",import.meta.url),"utf8")));
 if(recorded.type!=="state"||!("battle" in recorded)||recorded.battle==null||recorded.battle.diagnostic!==null)throw Error("fixture must contain a validated native battle");
 const battle=recorded.battle,notes:LoopNotice[]=[];const detector=new LoopCoordinator(n=>notes.push(n),{bagLoops:true,ineffectiveLoops:true,battles:true,interactions:true});
 const snapshot=(taskData:number,pocket="TMS HMS"):GameStateSnapshot=>{const state=bag(pocket);return {...state,in_battle:inBattle,...(inBattle?{battle}:{}),active_ui:{...state.active_ui,details:{...state.active_ui.details,bag_location:inBattle?1:0,task_data:[taskData]}}};};
 const press=(before:GameStateSnapshot,state:GameStateSnapshot)=>{detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",beforeState:before,state});};
 for(let i=0;i<3;i++)press(snapshot(0),snapshot(0));
 expect(notes.map(n=>n.phase),`established warning battle=${String(inBattle)}`).toEqual(["warning"]);
 detector.context();press(snapshot(3),snapshot(4));
 expect(notes.map(n=>n.phase),`raw task churn battle=${String(inBattle)}`).toEqual(["warning"]);
 press(snapshot(5),snapshot(6,"BERRIES"));
 expect(notes.map(n=>n.phase),`visible pocket progress battle=${String(inBattle)}`).toEqual(["warning","recovered"]);
});
