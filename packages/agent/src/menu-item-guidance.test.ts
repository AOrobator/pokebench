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
import {healBeforeTrainersV2Text,withLowHpTrainerWarning} from "./low-hp-trainer-warning.js";
import {withHealFirst} from "./heal-first.js";

const must=<T,>(v:T|null|undefined):T=>{if(v==null)throw new Error("missing fixture value");return v;};
const first=(tools:readonly AgentTool[]):AgentTool=>must(tools[0]);
const rows=JSON.parse(readFileSync(new URL("../test-support/potion-menu-2e93.json",import.meta.url),"utf8")) as {seq:number;text:string;active_ui:GameStateSnapshot["active_ui"]}[];
const raw=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/story-battle-heal-gate-97a0.json.gz",import.meta.url))).toString()) as {results:{state:unknown}[]};
const BASE=parseGameState(raw.results[0]?.state);
const OFF=Object.fromEntries(Object.keys(ALL_ON).map(id=>[id,false])) as FeatureSet;
const state=(seq:number):GameStateSnapshot=>({...BASE,active_ui:rows.find(r=>r.seq===seq)?.active_ui??null});
const result=(s:GameStateSnapshot,text="readout"):AgentToolResult<unknown>=>({content:[{type:"text",text}],details:{state:s}});
const text=(r:AgentToolResult<unknown>):string=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
const tool=(s:GameStateSnapshot):AgentTool=>({name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(s))});
const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healFirstLine:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
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
 expect(menuItemGuidance({...BASE,active_ui:{phase:"unknown",ready:true,selected:null,controls:"unknown",diagnostic:null}})).toBeNull();
 expect(menuItemGuidance({...state(18459),active_ui:{...must(state(18459).active_ui),diagnostic:"owner unknown"}})).toBeNull();
});
it("leaves OFF tools and result bytes intact, and the play factory delivers ON guidance",async()=>{
 const base=tool(state(18459));expect(withMenuItemGuidance([base],false)[0]).toBe(base);
 const off=first(playGameTools([base],OFF,{read:()=>Promise.resolve(state(18459))},recorder));
 const on=first(playGameTools([base],{...OFF,"menu-item-guidance-v1":true},{read:()=>Promise.resolve(state(18459))},recorder));
 expect(await off.execute("c",{})).toEqual(result(state(18459)));
 expect(text(await on.execute("c",{}))).toContain("A chooses SUMMARY");
 expect(playSystemPrompt({...OFF,"menu-item-guidance-v1":true},null)).toContain("Inspect the highlighted option before A");
});
it("replaces both delivered full-HP directives while OFF retains them",async()=>{
 const s={...BASE,started:true,screen:"overworld",in_battle:false,field_controls_locked:false,party_owner:"player",map_id:[24,11],story:{...BASE.story,petalburg_woods_aqua_grunt_defeated:false}} as GameStateSnapshot;
 const base=tool(s);
 const old={...OFF,"low-hp-trainer-warning-v1":true,"low-hp-trainer-warning-v2":true};
 const on={...old,"factual-healing-guidance-v1":true};
 expect(text(await first(withLowHpTrainerWarning([base],old,recorder)).execute("c",{}))).toContain("Heal to full before this battle");
 const r=await first(withLowHpTrainerWarning([base],on,recorder)).execute("c",{});
 expect(text(r)).not.toContain("Heal to full");expect(text(r)).toContain("HP alone does not establish whether you will win");
 const leading=await first(withHealFirst([base],true,recorder,{},true)).execute("c",{});
 expect(text(leading)).not.toContain("so heal before");
});
it("distinguishes two-column bag actions from vertical menus and item targets",()=>{
 const ui={phase:"bag_context_menu",ready:true,selected:"USE",diagnostic:null,controls:"Directions select",details:{options:["USE","GIVE","TOSS","CANCEL"]}};
 const s={...BASE,active_ui:ui};
 expect(menuItemGuidance(s)).toContain("UP/DOWN changes row; LEFT/RIGHT changes column");
 expect(menuItemGuidance(s)).toContain("USE (selected) | GIVE\nTOSS | CANCEL");
 expect(menuItemGuidance({...BASE,active_ui:{...ui,details:{options:["USE","CANCEL"]}}})).toContain("UP/DOWN selects");
 expect(menuItemGuidance({...BASE,active_ui:{...ui,selected:"MISSING"}})).toBeNull();
 expect(menuItemGuidance({...BASE,active_ui:{...ui,details:{options:[1,2]}}})).toBeNull();
 expect(menuItemGuidance({...BASE,active_ui:{...ui,selected:null}})).toBeNull();
 expect(menuItemGuidance({...BASE,active_ui:{...ui,phase:"bag_menu",selected:"POTION"}})).toContain("LEFT/RIGHT changes pockets");
 expect(menuItemGuidance({...BASE,active_ui:{...ui,phase:"party_menu",selected:"PARTY SLOT 1",details:{party_action:3}}})).toContain("A uses the selected item on this Pokémon");
 expect(menuItemGuidance({...BASE,active_ui:{...ui,phase:"party_menu",details:{party_action:0}}})).toBeNull();
 expect(menuItemGuidance({...state(18459),active_ui:{...must(state(18459).active_ui),details:null}})).toBeNull();
});
it("contextual start-menu guidance explains BAG and does not change other scene prompts",()=>{
 const s={...state(18538),active_ui:{...must(state(18538).active_ui),ready:true}};
 expect(menuItemGuidance(s)).toContain("To use an item, choose BAG");
 const f={...OFF,"just-in-time-prompt-v1":true,"menu-item-guidance-v1":true};
 expect(playSystemPrompt(f,null,"battle")).toBe(playSystemPrompt({...f,"menu-item-guidance-v1":false},null,"battle"));
});
it("the factual treatment bypasses the full-HP gate even when its old switch remains ON",async()=>{
 let calls=0;
 const base:AgentTool={...tool(BASE),name:"press",execute:()=>{calls++;return Promise.resolve(result(BASE));}};
 // A disabled gate must not ask for its former required heal-arm recorder or map table.
 const tools=playGameTools([base],{...OFF,"story-battle-heal-gate-v1":true,"factual-healing-guidance-v1":true},{read:()=>Promise.resolve(BASE)},recorder);
 await first(tools).execute("c",{buttons:["A"]});expect(calls).toBe(1);
});
it("records factual heal-first wording through the production factory",async()=>{
 const s={...BASE,screen:"overworld",in_battle:false,field_controls_locked:false,party_owner:"player",map_id:[24,11],story:{...BASE.story,petalburg_woods_aqua_grunt_defeated:false}} as GameStateSnapshot;
 const delivered:string[]=[];
 const tools=playGameTools([tool(s)],{...OFF,"story-battle-heal-first-v1":true,"factual-healing-guidance-v1":true},{read:()=>Promise.resolve(s)},{...recorder,healFirstLine:(_tool,_id,_facts,line)=>{delivered.push(line);}});
 const r=await first(tools).execute("c",{});expect(delivered).toHaveLength(1);
 expect(text(r)).toBe(must(delivered[0])+"\nreadout");expect(text(r)).not.toContain("heal before");
});

it("removes the second story-warning full-HP directive without changing OFF bytes",()=>{
 const f={map_id:[11,3] as const,trainers:[],weak:[],hurt:[{species:"TORCHIC",hp:24,max_hp:31}],heal:null,mom_heals:false,money:3000};
 expect(healBeforeTrainersV2Text(f)).toContain("Heal to full before a story battle.");
 expect(healBeforeTrainersV2Text(f,true)).not.toContain("Heal to full");
 expect(healBeforeTrainersV2Text(f,true)).toContain("TORCHIC 24/31");
});
