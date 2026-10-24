import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,featureInfo,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import {playGameTools} from "./play-wiring.js";
import {withInterfaceGuidance} from "./interface-guidance.js";
const fixture=JSON.parse(readFileSync(new URL("../test-support/interface-guidance-0517.json",import.meta.url),"utf8")) as {state:unknown;dialogue:unknown};
const STATE=parseGameState(fixture.state);
const OFF=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
const ON:FeatureSet={...OFF,"interface-guidance-v1":true};
const event=(value:unknown):RunEvent=>{const r=checkEvent(value);if(!r.ok)throw new Error(JSON.stringify(r));return r.event;};
const dialogue=event(fixture.dialogue);
const emitted:((e:RunEvent)=>void)[]=[];
const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{emitted.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healFirstLine:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
const send=(e:RunEvent):void=>{for(const fn of emitted)fn(e);};
const result=(s:GameStateSnapshot):AgentToolResult<unknown>=>({content:[{type:"text",text:"observation"}],details:{state:s}});
const tool=(s:()=>GameStateSnapshot):AgentTool=>({name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(s()))});
const text=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
const execute=async(tools:AgentTool[]):Promise<string>=>{const t=tools[0];if(t===undefined)throw new Error("missing tool");return text(await t.execute("call",{}));};
function delivered():void {
 send(dialogue);
 send(event({v:1,run:"2026-10-24T08-12-35_qwen36-gpu1_0517",seq:39430,t:"2026-10-24T11:35:42.000-04:00",type:"tool_result",turn:1027,id:dialogue.type==="dialogue_auto_advance"?dialogue.tool_call_id:"invalid",name:"navigate_to_target",is_error:false,duration_ms:1,text:'Dialogue shown: "Test it out.\nPlease give our PRESIDENT a call."'}));
}
it("defaults OFF and declares independent observation delivery",()=>{
 expect(OFF["interface-guidance-v1"]).toBe(false);
 const {["interface-guidance-v1"]:_,...rest}=OFF;
 expect(normalizeFeatures(rest)["interface-guidance-v1"]).toBe(false);
 expect(featureInfo("interface-guidance-v1")).toMatchObject({needs:null,group:"observation"});
 expect(ALL_ON["interface-guidance-v1"]).toBe(true);
 expect(serverFeatureEnv(OFF).POKEBENCH_FEATURES_OFF).toContain("interface-guidance-v1");
});
it("production factory delivers exact previously delivered instruction with JIT and all other switches OFF",async()=>{
 emitted.length=0;
 const base=tool(()=>STATE);
 expect(withInterfaceGuidance([base],false,recorder)[0]).toBe(base);
 expect(await execute(playGameTools([base],OFF,{read:()=>Promise.resolve(STATE)},recorder))).toBe("observation");
 const tools=playGameTools([base],ON,{read:()=>Promise.resolve(STATE)},recorder);
 expect(await execute(tools)).toBe("observation");
 delivered();
 expect(await execute(tools)).toBe('observation\nCurrent interface instruction — speaker SCIENTIST_1 (faced_sprite), turn 1027, result event 39430:\n"Test it out.\\nPlease give our PRESIDENT a call."');
});
it("does not recall undelivered pages, errors, unrelated dialogue or infer the scientist's name",async()=>{
 emitted.length=0;
 const tools=withInterfaceGuidance([tool(()=>STATE)],true,recorder);
 send(dialogue);expect(await execute(tools)).toBe("observation");
 send(event({v:1,run:"r",seq:1,t:"2026-10-24T11:35:42.000-04:00",type:"tool_result",turn:1,id:dialogue.type==="dialogue_auto_advance"?dialogue.tool_call_id:"invalid",name:"press",is_error:true,duration_ms:1,text:"error"}));
 expect(await execute(tools)).toBe("observation");
});
it("suppresses during transition and expires on leaving the tutorial",async()=>{
 emitted.length=0;let state=STATE;
 const tools=withInterfaceGuidance([tool(()=>state)],true,recorder);delivered();
 const ui=STATE.active_ui;if(ui==null)throw new Error("missing ui");
 state={...STATE,active_ui:{...ui,ready:false}};expect(await execute(tools)).toBe("observation");
 state={...STATE,active_ui:{...ui,diagnostic:"unknown owner"}};expect(await execute(tools)).toBe("observation");
 state=STATE;expect(await execute(tools)).toContain("PRESIDENT");
 state={...STATE,screen:"overworld",active_ui:null};expect(await execute(tools)).toBe("observation");
 state=STATE;expect(await execute(tools)).toBe("observation");
});
