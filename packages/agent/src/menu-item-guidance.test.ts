import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";
import {menuItemGuidance,withMenuItemGuidance} from "./menu-item-guidance.js";
import {withLowHpTrainerWarning} from "./low-hp-trainer-warning.js";
import {withHealFirst} from "./heal-first.js";

const rows=JSON.parse(readFileSync(new URL("../test-support/potion-menu-2e93.json",import.meta.url),"utf8")) as {seq:number;text:string;active_ui:GameStateSnapshot["active_ui"]}[];
const raw=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/story-battle-heal-gate-97a0.json.gz",import.meta.url))).toString()) as {results:{state:unknown}[]};
const BASE=parseGameState(raw.results[0]?.state);
const OFF=Object.fromEntries(Object.keys(ALL_ON).map(id=>[id,false])) as FeatureSet;
const state=(seq:number):GameStateSnapshot=>({...BASE,active_ui:rows.find(r=>r.seq===seq)?.active_ui});
const result=(s:GameStateSnapshot,text="readout"):AgentToolResult<unknown>=>({content:[{type:"text",text}],details:{state:s}});
const text=(r:AgentToolResult<unknown>):string=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
const tool=(s:GameStateSnapshot):AgentTool=>({name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(s))});
const recorder={subscribe:()=>undefined,dialogueAutoAdvance:()=>undefined,lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healFirstLine:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
it("describes the recorded vertical party actions and ITEM's held-item meaning",()=>{
 expect(menuItemGuidance(state(18459))).toContain("UP/DOWN selects; A chooses SUMMARY; B cancels");
 expect(menuItemGuidance(state(18459))).toContain("ITEM manages held items");
 expect(menuItemGuidance(state(18459))).toContain("1. SUMMARY (selected)\n2. ITEM\n3. CANCEL");
});
it("does not suggest input through the recorded start-menu fade",()=>{
 expect(menuItemGuidance(state(18538))).toBe("Menu input is not ready; observe again before selecting.");
});
it("does not invent controls for unknown or diagnostic owners",()=>{
 expect(menuItemGuidance({...BASE,active_ui:null})).toBeNull();
 expect(menuItemGuidance({...BASE,active_ui:{phase:"unknown",ready:true,selected:null,controls:"unknown"}})).toBeNull();
 expect(menuItemGuidance({...state(18459),active_ui:{...state(18459).active_ui!,diagnostic:"owner unknown"}})).toBeNull();
});
it("leaves OFF tools and result bytes intact, and the play factory delivers ON guidance",async()=>{
 const base=tool(state(18459));expect(withMenuItemGuidance([base],false)[0]).toBe(base);
 const off=playGameTools([base],OFF,{read:()=>Promise.resolve(state(18459))},recorder)[0]!;
 const on=playGameTools([base],{...OFF,"menu-item-guidance-v1":true},{read:()=>Promise.resolve(state(18459))},recorder)[0]!;
 expect(await off.execute("c",{})).toEqual(result(state(18459)));
 expect(text(await on.execute("c",{}))).toContain("A chooses SUMMARY");
 expect(playSystemPrompt({...OFF,"menu-item-guidance-v1":true},null)).toContain("Inspect the highlighted option before A");
});
it("replaces both delivered full-HP directives while OFF retains them",async()=>{
 const s={...BASE,started:true,screen:"overworld",in_battle:false,field_controls_locked:false,party_owner:"player",map_id:[24,11],story:{...BASE.story,petalburg_woods_aqua_grunt_defeated:false}} as GameStateSnapshot;
 const base=tool(s);
 const old={...OFF,"low-hp-trainer-warning-v1":true,"low-hp-trainer-warning-v2":true};
 const on={...old,"factual-healing-guidance-v1":true};
 expect(text(await withLowHpTrainerWarning([base],old,recorder)[0]!.execute("c",{}))).toContain("Heal to full before this battle");
 const r=await withLowHpTrainerWarning([base],on,recorder)[0]!.execute("c",{});
 expect(text(r)).not.toContain("Heal to full");expect(text(r)).toContain("HP alone does not establish whether you will win");
 const first=await withHealFirst([base],true,recorder,{},true)[0]!.execute("c",{});
 expect(text(first)).not.toContain("so heal before");
});
