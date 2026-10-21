// move-learn-tool-v1: learn_move on the recorded move-learning prompts of run 2026-10-21T13-33-54_qwen36-gpu0_ea04
// (test-support/learn-move-ea04.json: COMBUSKEN learning DOUBLE KICK after evolving, seq 20456-21087, and TORCHIC
// learning PECK in battle, seq 20100-20364). A fake game moves between those states the way pret pokeemerald 731ad5bf
// does (src/evolution_scene.c MVSTATE_*, data/battle_scripts_1.s BattleScript_AskToLearnMove,
// src/pokemon_summary_screen.c Task_HandleReplaceMoveInput / ChangeSelectedMove). States the run never recorded (the
// battle summary list, the "did not learn" page after evolving, the battle "Poof!" page) are the recorded ones with
// the fields the game would change.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {readFileSync} from "node:fs";
import {Value} from "typebox/value";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {Button} from "./events.js";
import {ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {GameStateError,StateWatcher,parseGameState,type GameStateSnapshot} from "./game-state.js";
import {observeTool,pressTool,type BeforePressCheck} from "./game-tools.js";
import {LEARN_MOVE_DESCRIPTION,LEARN_MOVE_ID,LEARN_MOVE_SECTION,LearnMoveArgs,learnMoveTool,withLearnMove,type LearnMovePorts} from "./learn-move.js";
import {jitTools,playSystemPrompt,playTools,type PromptScene} from "./play-config.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";

type Raw=Record<string,unknown>;
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/learn-move-ea04.json",import.meta.url),"utf8")) as {base:Raw;states:Record<string,Raw>};
const rec=(name:string):GameStateSnapshot=>{
 const named=FIXTURE.states[name];
 if(named===undefined)throw new Error(name);
 const {seq:_seq,...vary}=named;
 return parseGameState(structuredClone({...FIXTURE.base,...vary}));
};
const ui=(s:GameStateSnapshot)=>{if(s.active_ui==null)throw new Error("active_ui");return s.active_ui;};
const details=(s:GameStateSnapshot)=>{const d=ui(s).details;if(d==null)throw new Error("details");return d;};
const battle=(s:GameStateSnapshot)=>{if(s.battle==null)throw new Error("battle");return s.battle;};
const setMoves=(s:GameStateSnapshot,names:readonly string[]):void=>{
 const mon=s.party[0];
 if(mon?.moves==null)throw new Error("party");
 mon.moves=names.map((name,i)=>({...(mon.moves??[])[i]??{move_id:1,pp:1,pp_bonus:0,max_pp:1},name,move_id:100+i}));
};
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();

const COMBUSKEN=["SCRATCH","GROWL","FOCUS ENERGY","EMBER"] as const;
const TORCHIC=["SCRATCH","GROWL","FOCUS ENERGY","EMBER"] as const;
type Node={kind:"page1"|"page2"|"done"|"did_not_learn"|"field"|"hm"}|{kind:"delete"|"stop";selected:"YES"|"NO"|null}|{kind:"forget";index:number};
interface Bugs {doubleStep?:boolean;noPartyChange?:boolean;afterYes?:"field";hmSlot?:number;pagesLoop?:boolean;listMismatch?:boolean}

class LearnSim {
 node:Node;
 readonly presses:Button[]=[];
 forgotten:number|null=null;
 constructor(readonly owner:"evolution"|"battle",start:Node,readonly bugs:Bugs={}){this.node=start;}
 get known():readonly string[]{return this.owner==="evolution"?COMBUSKEN:TORCHIC;}
 get newMove():string{return this.owner==="evolution"?"DOUBLE KICK":"PECK";}
 moves():string[]{const moves=[...this.known];if(this.forgotten!==null&&this.bugs.noPartyChange!==true)moves[this.forgotten]=this.newMove;return moves;}
 state():GameStateSnapshot {
  const evo=this.owner==="evolution",n=this.node;
  let s:GameStateSnapshot;
  if(n.kind==="field"){s=rec("evo_delete");s.screen="overworld";s.in_battle=false;s.active_ui=null;s.battle=null;}
  else if(n.kind==="page1")s=rec(evo?"evo_page1":"battle_page1");
  else if(n.kind==="page2")s=rec(evo?"evo_page2":"battle_page2");
  else if(n.kind==="delete"||n.kind==="stop"){
   s=rec(`${evo?"evo":"battle"}_${n.kind}`);
   if(evo)ui(s).selected=n.selected;else{const p=battle(s).prompt;if(p==null)throw new Error("prompt");p.selected=n.selected;}
  }else if(n.kind==="forget"||n.kind==="hm"){
   s=rec("evo_forget");
   const d=details(s),index=n.kind==="forget"?n.index:this.bugs.hmSlot??0;
   if(!evo){s.in_battle=true;d["new_move_name"]="PECK";d["new_move_id"]=64;}
   d["move_names"]=this.bugs.listMismatch===true?["SCRATCH","GROWL","EMBER","FOCUS ENERGY"]:[...this.known];
   d["selected_index"]=index;d["first_move_index"]=index;
   ui(s).selected=index<4?this.known[index]??null:this.newMove;
   if(n.kind==="hm"){ui(s).phase="summary_hm_rejection";d["message"]="HM moves cannot be forgotten.";}
  }else if(n.kind==="done"){
   if(evo)s=rec("evo_poof");
   else{s=rec("battle_page1");const m=battle(s).message;if(m==null)throw new Error("message");m.text="1, 2, and… … … Poof!\n";m.page="1, 2, and… … … Poof!";m.identity="poof";}
  }else{
   if(evo){
    s=rec("evo_poof");const u=ui(s);u.phase="evolution";u.ready=false;details(s)["move_learning_state"]=11;
    const m=battle(s).message;if(m==null)throw new Error("message");m.text="COMBUSKEN did not learn\nDOUBLE KICK.\n";m.page="COMBUSKEN did not learn DOUBLE KICK.";m.identity="did-not-learn";
   }else s=rec("battle_did_not_learn");
  }
  if(n.kind!=="field")setMoves(s,this.moves());
  return s;
 }
 reason():"box"|"page"|"forget"|"other" {
  const k=this.node.kind;
  return k==="delete"||k==="stop"?"box":k==="forget"||k==="hm"?"forget":k==="field"?"other":"page";
 }
 press(button:Button):void {
  this.presses.push(button);
  const n=this.node;
  if(n.kind==="page1"&&button==="A")this.node={kind:"page2"};
  else if(n.kind==="page2"&&button==="A")this.node=this.bugs.pagesLoop===true?{kind:"page1"}:{kind:"delete",selected:"YES"};
  else if(n.kind==="delete"||n.kind==="stop"){
   if(button==="UP")this.node={kind:n.kind,selected:"YES"};
   else if(button==="DOWN")this.node={kind:n.kind,selected:"NO"};
   else if(button==="B"||(button==="A"&&n.selected==="NO"))this.node=n.kind==="delete"?{kind:"stop",selected:"YES"}:{kind:"page1"};
   else if(button==="A")this.node=n.kind==="delete"?(this.bugs.afterYes==="field"?{kind:"field"}:{kind:"forget",index:0}):{kind:"did_not_learn"};
  }else if(n.kind==="forget"){
   if(button==="DOWN")this.node={kind:"forget",index:(n.index+(this.bugs.doubleStep===true?2:1))%5};
   else if(button==="UP")this.node={kind:"forget",index:(n.index+4)%5};
   else if(button==="B"||(button==="A"&&n.index===4))this.node={kind:"stop",selected:"YES"};
   else if(button==="A"&&n.index===this.bugs.hmSlot)this.node={kind:"hm"};
   else if(button==="A"){this.forgotten=n.index;this.node={kind:"done"};}
  }
 }
 ports(over:Partial<LearnMovePorts>={}):LearnMovePorts {
  return {
   wait:()=>Promise.resolve({reason:this.reason(),frames:0,state:this.state(),battle_learner:this.owner==="battle"&&this.node.kind!=="field"?{party_slot:0,new_move:"PECK"}:null}),
   press:(_id:string,params:{buttons:Button[]},_signal:AbortSignal|undefined,check:BeforePressCheck)=>{check(this.state());for(const b of params.buttons)this.press(b);return Promise.resolve({content:[],details:{state:this.state()}});},
   observe:()=>Promise.resolve({content:[{type:"text" as const,text:"READOUT"}],details:{state:this.state()}}),
   ...over,
  };
 }
}

const first=(r:AgentToolResult<unknown>):string=>{const part=r.content[0];if(part?.type!=="text")throw new Error("text");return part.text;};
const run=async(sim:LearnSim,forget:string,over:Partial<LearnMovePorts>={})=>{const r=await learnMoveTool(sim.ports(over)).execute("l",{forget});return {r,text:first(r)};};
const POOF='\nThe game printed: "1, 2, and… … … Poof!"\n';

describe("learn_move on the evolution scene",()=>{
 it.each([
  ["SCRATCH",["A","A"],"DOUBLE KICK, GROWL, FOCUS ENERGY, EMBER"],
  ["GROWL",["A","DOWN","A"],"SCRATCH, DOUBLE KICK, FOCUS ENERGY, EMBER"],
  ["FOCUS ENERGY",["A","DOWN","DOWN","A"],"SCRATCH, GROWL, DOUBLE KICK, EMBER"],
  ["EMBER",["A","UP","UP","A"],"SCRATCH, GROWL, FOCUS ENERGY, DOUBLE KICK"],
 ] as const)("forgets %s from the Delete box, checking the highlight after each step",async(move,buttons,after)=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const {r,text}=await run(sim,move);
  expect(sim.presses).toEqual(buttons);
  expect(text).toBe(`Learn move: COMBUSKEN forgot ${move} and learned DOUBLE KICK (checked in the party's moves); buttons pressed: ${buttons.join(", ")}; COMBUSKEN's moves: ${after}.${POOF}`);
  expect(r.content.slice(1)).toEqual([{type:"text",text:"READOUT"}]);
  expect(r.details).toMatchObject({learn_move:{forget:move,presses:buttons,refused:false,verified:true}});
 });
 it("answers NO at Stop learning, advances both pages, then YES and forgets the named move",async()=>{
  const sim=new LearnSim("evolution",{kind:"stop",selected:"YES"});
  const {text}=await run(sim,"growl");
  expect(sim.presses).toEqual(["B","A","A","A","DOWN","A"]);
  expect(text).toBe(`Learn move: COMBUSKEN forgot GROWL and learned DOUBLE KICK (checked in the party's moves); buttons pressed: B, A, A, A, DOWN, A; COMBUSKEN's moves: SCRATCH, DOUBLE KICK, FOCUS ENERGY, EMBER.\nThe game printed: "COMBUSKEN is trying to learn DOUBLE KICK." / "But, COMBUSKEN can't learn more than four moves." / "1, 2, and… … … Poof!"\n`);
 });
 it("starts from the trying-to-learn pages",async()=>{
  const sim=new LearnSim("evolution",{kind:"page1"});
  await run(sim,"SCRATCH");
  expect(sim.presses).toEqual(["A","A","A","A"]);
  const page2=new LearnSim("evolution",{kind:"page2"});
  await run(page2,"SCRATCH");
  expect(page2.presses).toEqual(["A","A","A"]);
 });
 it("moves YES up first when NO is highlighted, and starts from the forget list",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"NO"});
  await run(sim,"SCRATCH");
  expect(sim.presses).toEqual(["UP","A","A"]);
  const list=new LearnSim("evolution",{kind:"forget",index:4});
  await run(list,"SCRATCH");
  expect(list.presses).toEqual(["DOWN","A"]);
 });
 it("none: NO at Delete, YES at Stop learning, and checks the game's did-not-learn page and the moves",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const {r,text}=await run(sim,"none");
  expect(sim.presses).toEqual(["B","A"]);
  expect(text).toBe(`Learn move: COMBUSKEN did not learn DOUBLE KICK and kept its moves (checked in the party's moves); buttons pressed: B, A; COMBUSKEN's moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.\nThe game printed: "COMBUSKEN did not learn DOUBLE KICK."\n`);
  expect(r.details).toMatchObject({learn_move:{verified:true,refused:false}});
  const stop=new LearnSim("evolution",{kind:"stop",selected:"NO"});
  await run(stop,"NONE");
  expect(stop.presses).toEqual(["UP","A"]);
  const list=new LearnSim("evolution",{kind:"forget",index:2});
  await run(list,"none");
  expect(list.presses).toEqual(["B","A"]);
 });
 it("none without the page text: the scene's MVSTATE_CANCEL state and unchanged moves verify it",async()=>{
  const sim=new LearnSim("evolution",{kind:"stop",selected:"YES"});
  const base=sim.ports();
  const {text}=await run(sim,"none",{wait:async()=>{const w=await base.wait();if(sim.node.kind==="did_not_learn")w.state.battle=null;return w;}});
  expect(text).toBe("Learn move: COMBUSKEN did not learn DOUBLE KICK and kept its moves (checked in the party's moves); buttons pressed: A; COMBUSKEN's moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.\n");
 });
});

describe("learn_move in battle",()=>{
 it("forgets a move through the battle's Delete box and summary list",async()=>{
  const sim=new LearnSim("battle",{kind:"delete",selected:"YES"});
  const {text}=await run(sim,"EMBER");
  expect(sim.presses).toEqual(["A","UP","UP","A"]);
  expect(text).toBe(`Learn move: TORCHIC forgot EMBER and learned PECK (checked in the party's moves); buttons pressed: A, UP, UP, A; TORCHIC's moves: SCRATCH, GROWL, FOCUS ENERGY, PECK.${POOF}`);
 });
 it("answers from the battle's Stop learning box and pages, matched by the game's words",async()=>{
  const sim=new LearnSim("battle",{kind:"stop",selected:"YES"});
  const {text}=await run(sim,"SCRATCH");
  expect(sim.presses).toEqual(["B","A","A","A","A"]);
  expect(text).toContain('The game printed: "TORCHIC is trying to learn PECK." / "But, TORCHIC can\'t learn more than four moves." / "1, 2, and… … … Poof!"');
 });
 it("none in battle ends on the game's did-not-learn page",async()=>{
  const sim=new LearnSim("battle",{kind:"delete",selected:"YES"});
  const {text}=await run(sim,"none");
  expect(sim.presses).toEqual(["B","A"]);
  expect(text).toBe('Learn move: TORCHIC did not learn PECK and kept its moves (checked in the party\'s moves); buttons pressed: B, A; TORCHIC\'s moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.\nThe game printed: "TORCHIC did not learn PECK."\n');
 });
});

describe("learn_move refusals and stops",()=>{
 it("refuses with no move-learning prompt open, pressing nothing",async()=>{
  const sim=new LearnSim("evolution",{kind:"field"});
  const {r,text}=await run(sim,"SCRATCH");
  expect(sim.presses).toEqual([]);
  expect(text).toBe("Learn move: nothing pressed: no move-learning prompt is open; the game shows screen overworld.\n");
  expect(r.details).toMatchObject({learn_move:{refused:true,verified:null,presses:[]}});
  const learned=rec("evo_learned");
  const page=await learnMoveTool({...sim.ports(),wait:()=>Promise.resolve({reason:"page",frames:0,state:learned,battle_learner:null})}).execute("l",{forget:"SCRATCH"});
  expect(first(page)).toBe('Learn move: nothing pressed: no move-learning prompt is open; a page is waiting for A or B: "COMBUSKEN learned DOUBLE KICK!".\n');
  const done=new LearnSim("evolution",{kind:"done"});
  expect((await run(done,"SCRATCH")).text).toBe('Learn move: nothing pressed: no move-learning prompt is open; a page is waiting for A or B: "1, 2, and… … … Poof!".\n');
  expect(done.presses).toEqual([]);
  const busy=await run(new LearnSim("evolution",{kind:"delete",selected:"YES"}),"SCRATCH",{wait:()=>Promise.resolve({reason:"bound",frames:600,state:rec("evo_delete"),battle_learner:null})});
  expect(busy.text).toBe("Learn move: nothing pressed: no move-learning prompt is open; the game did not wait for input within the frame bound.\n");
  const paused=await run(new LearnSim("evolution",{kind:"delete",selected:"YES"}),"SCRATCH",{wait:()=>Promise.resolve({reason:"paused",frames:0,state:rec("evo_delete"),battle_learner:null})});
  expect(paused.text).toBe("Learn move: nothing pressed: no move-learning prompt is open; the run is paused.\n");
 });
 it("refuses an unknown move name or the new move, listing the four moves the game shows",async()=>{
  for(const name of ["tackle","DOUBLE KICK"]){
   const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
   const {text}=await run(sim,name);
   expect(sim.presses).toEqual([]);
   expect(text).toBe(`Learn move: nothing pressed: ${name.toUpperCase()} is not one of COMBUSKEN's moves. The game shows COMBUSKEN's moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER. Use one of these names, or "none".\n`);
  }
  expect(Value.Check(LearnMoveArgs,{forget:""})).toBe(false);
  await expect(learnMoveTool(new LearnSim("evolution",{kind:"field"}).ports()).execute("l",{forget:3} as unknown as {forget:string})).rejects.toThrow("Invalid learn_move arguments");
 });
 it("stops when the cursor does not land where one step should put it, pressing nothing more",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"},{doubleStep:true});
  const {r,text}=await run(sim,"GROWL");
  expect(sim.presses).toEqual(["A","DOWN"]);
  expect(text).toBe("Learn move: stopped after pressing A, DOWN; expected the highlight on GROWL after DOWN, but the summary screen's list of moves to forget is open with FOCUS ENERGY highlighted; inspect the new state.\n");
  expect(r.details).toMatchObject({learn_move:{verified:false,refused:false}});
  expect(sim.forgotten).toBeNull();
 });
 it("stops without sending a button when the screen changed before the press",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const base=sim.ports();
  const {text}=await run(sim,"SCRATCH",{press:(id,params,signal,check)=>{sim.node={kind:"field"};return base.press(id,params,signal,check);}});
  expect(sim.presses).toEqual([]);
  expect(text).toBe("Learn move: stopped; the screen changed before the press, so no button was sent; inspect the new state.\n");
 });
 it("stops and reports when the game shows something else after a press",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"},{afterYes:"field"});
  const {text}=await run(sim,"SCRATCH");
  expect(sim.presses).toEqual(["A"]);
  expect(text).toBe("Learn move: stopped after pressing A; expected the summary screen's list of moves to forget, but the game shows screen overworld; inspect the new state.\n");
  const stop=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const base=stop.ports();
  const after=await run(stop,"none",{wait:async()=>{const w=await base.wait();if(stop.presses.length>0){stop.node={kind:"page1"};return base.wait();}return w;}});
  expect(after.text).toBe('Learn move: stopped after pressing B; expected "Stop learning …?", but a page is waiting for A or B: "COMBUSKEN is trying to learn DOUBLE KICK."; inspect the new state.\nThe game printed: "COMBUSKEN is trying to learn DOUBLE KICK."\n');
 });
 it("stops on a frame-bound or paused wait mid-drive, an unreadable highlight, a mismatched list and the press limit",async()=>{
  for(const [reason,said] of [["bound","the game did not wait for input within the frame bound"],["paused","the run was paused"]] as const){
   const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
   const base=sim.ports();
   const {text}=await run(sim,"SCRATCH",{wait:async()=>{const w=await base.wait();return sim.presses.length>0?{...w,reason}:w;}});
   expect(text).toBe(`Learn move: stopped after pressing A; ${said}; inspect the new state.\n`);
  }
  const unread=new LearnSim("evolution",{kind:"delete",selected:null});
  expect((await run(unread,"SCRATCH")).text).toBe("Learn move: stopped; the YES/NO highlight could not be read; inspect the new state.\n");
  const mismatch=new LearnSim("evolution",{kind:"forget",index:0},{listMismatch:true});
  expect((await run(mismatch,"SCRATCH")).text).toBe("Learn move: stopped; the summary screen lists SCRATCH, GROWL, EMBER, FOCUS ENERGY, not COMBUSKEN's party moves SCRATCH, GROWL, FOCUS ENERGY, EMBER; inspect the new state.\n");
  const loop=new LearnSim("evolution",{kind:"page1"},{pagesLoop:true});
  expect((await run(loop,"SCRATCH")).text).toContain("stopped after pressing A, A, A, A, A, A, A, A, A, A, A, A, A, A, A, A; 16 presses is the most one learn_move makes; inspect the new state.");
  expect(loop.presses).toHaveLength(16);
 });
 it("verifies the result from the party's moves and reports the HM refusal the game shows",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"},{noPartyChange:true});
  const {r,text}=await run(sim,"SCRATCH");
  expect(text).toBe(`Learn move: buttons pressed: A, A; the party's moves do not show DOUBLE KICK in place of SCRATCH; COMBUSKEN's moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.${POOF}`);
  expect(r.details).toMatchObject({learn_move:{verified:false}});
  const hm=new LearnSim("evolution",{kind:"delete",selected:"YES"},{hmSlot:1});
  expect((await run(hm,"GROWL")).text).toBe('Learn move: buttons pressed: A, DOWN, A; the game shows "HM moves cannot be forgotten."; COMBUSKEN\'s moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.\n');
  const none=new LearnSim("evolution",{kind:"stop",selected:"YES"});
  const base=none.ports();
  const changed=await run(none,"none",{wait:async()=>{const w=await base.wait();if(none.node.kind==="did_not_learn")setMoves(w.state,["PECK","GROWL","FOCUS ENERGY","EMBER"]);return w;}});
  expect(changed.text).toBe('Learn move: buttons pressed: A; the party\'s moves changed; COMBUSKEN\'s moves: PECK, GROWL, FOCUS ENERGY, EMBER.\nThe game printed: "COMBUSKEN did not learn DOUBLE KICK."\n');
  const silent=new LearnSim("evolution",{kind:"stop",selected:"YES"});
  const quiet=silent.ports();
  const early=await run(silent,"none",{wait:async()=>{const w=await quiet.wait();if(silent.node.kind==="did_not_learn"){const d=w.state.active_ui?.details;if(d!=null)d["move_learning_state"]=10;w.state.battle=null;}return w;}});
  expect(early.text).toBe('Learn move: buttons pressed: A; the game has not said "COMBUSKEN did not learn DOUBLE KICK." yet; COMBUSKEN\'s moves: SCRATCH, GROWL, FOCUS ENERGY, EMBER.\n');
  const unreadable=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const plain=unreadable.ports();
  const lost=await run(unreadable,"SCRATCH",{wait:async()=>{const w=await plain.wait();if(unreadable.node.kind==="done"){const mon=w.state.party[0];if(mon!==undefined)mon.moves=null;}return w;}});
  expect(lost.text).toBe(`Learn move: buttons pressed: A, A; the party's moves do not show DOUBLE KICK in place of SCRATCH; COMBUSKEN's moves could not be read.${POOF}`);
 });
 it("refuses when the learner cannot be read and throws when the observation has no state",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const s=rec("evo_delete");delete details(s)["pokemon_party_index"];
  expect(first(await learnMoveTool({...sim.ports(),wait:()=>Promise.resolve({reason:"box",frames:0,state:s,battle_learner:null})}).execute("l",{forget:"SCRATCH"}))).toContain("nothing pressed: no move-learning prompt is open");
  const odd=rec("evo_delete");details(odd)["yes_next_state"]=7;
  expect(first(await learnMoveTool({...sim.ports(),wait:()=>Promise.resolve({reason:"box",frames:0,state:odd,battle_learner:null})}).execute("l",{forget:"SCRATCH"}))).toBe("Learn move: nothing pressed: no move-learning prompt is open; the game shows screen evolution (evolution_move_confirmation), in battle.\n");
  const list=rec("evo_forget");details(list)["selected_index"]=9;
  expect(first(await learnMoveTool({...sim.ports(),wait:()=>Promise.resolve({reason:"forget",frames:0,state:list,battle_learner:null})}).execute("l",{forget:"SCRATCH"}))).toContain("nothing pressed: no move-learning prompt is open; the game shows screen pokemon_summary (summary_move_forget)");
  await expect(learnMoveTool({...sim.ports(),observe:()=>Promise.resolve({content:[],details:{}})}).execute("l",{forget:"tackle"})).rejects.toThrow("learn_move observation lacks verified state");
 });
});

const BASE=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
const ON:FeatureSet={...BASE,[LEARN_MOVE_ID]:true};
const SCENES:readonly PromptScene[]=["overworld","battle","naming","clock","menu"];
const named=(prompt:string,tool:string):boolean=>new RegExp(`(^|[^a-z_])${tool}([^a-z_]|$)`).test(prompt);

describe("move-learn-tool-v1 registry, prompt and production wiring",()=>{
 it("is a default-off agent-only guidance switch, recorded last",()=>{
  expect(featureInfo(LEARN_MOVE_ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"LEARN MOVE TOOL"});
  expect(featureInfo(LEARN_MOVE_ID).description).toContain(" Off: no learn_move tool and no prompt section.");
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(LEARN_MOVE_ID);
  expect(FEATURES.filter(f=>f.switchable).at(-1)?.id).toBe(LEARN_MOVE_ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(LEARN_MOVE_ID);
  expect(SERVER_FEATURES).not.toContain(LEARN_MOVE_ID);
  expect(BASE[LEARN_MOVE_ID]).toBe(false);
  expect(LEGACY_ALL_ON[LEARN_MOVE_ID]).toBe(false);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[LEARN_MOVE_ID]).toBe(false);
 });
 it("OFF: the tool list, tools and prompt are byte-identical; ON adds learn_move last and its section in every scene",()=>{
  const noop={beforePress:()=>undefined,afterPress:()=>Promise.resolve()};
  const recorder={recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyBattleWarning:()=>undefined};
  const tools=(f:FeatureSet)=>playGameTools([observeTool("http://x"),pressTool("http://x",noop)],f,{read:()=>Promise.reject(new Error("no"))},recorder);
  const off=tools(BASE),on=tools(ON);
  expect(off.map(t=>t.name)).not.toContain("learn_move");
  expect(JSON.stringify(off.map(t=>[t.name,t.description,t.parameters]))).toBe(JSON.stringify(on.filter(t=>t.name!=="learn_move").map(t=>[t.name,t.description,t.parameters])));
  expect(on.find(t=>t.name==="learn_move")?.description).toBe(LEARN_MOVE_DESCRIPTION);
  expect(playTools(BASE)).not.toContain("learn_move");
  expect(playTools(ON).at(-1)).toBe("learn_move");
  expect(playSystemPrompt(BASE,null)).not.toContain("learn_move");
  expect(playSystemPrompt(ON,null)).toBe(`${playSystemPrompt(BASE,null)}\n\n${LEARN_MOVE_SECTION}`);
  expect(LEARN_MOVE_SECTION).toBe('- learn_move: when the game asks "Delete a move to make room for …?" or "Stop learning …?", or shows the pages before them or the summary screen\'s list of moves to forget, call learn_move with forget set to one of the four moves the POKéMON knows (as the game names them) or "none". With a move, the harness answers YES, moves the summary highlight to that move checking it after each press, and presses A; with none, it answers NO to deleting a move and YES to stopping, and the POKéMON keeps its moves. It reports what the game printed and the party\'s moves afterwards. No choice is recommended. It refuses, and presses nothing, when no move-learning prompt is open or the move is not one the POKéMON knows. press still works on these prompts.');
  const jit={...ALL_ON,"just-in-time-prompt-v1":true,"tool-prompt-docs-v1":true};
  for(const scene of SCENES){
   const prompt=playSystemPrompt(jit,null,scene);
   expect(prompt).toContain(LEARN_MOVE_SECTION);
   expect(jitTools(playTools(jit).map(name=>({name})),scene).map(t=>t.name)).toContain("learn_move");
   expect(jitTools(playTools(jit).map(name=>({name})),scene).map(t=>t.name).filter(t=>!named(prompt,t))).toEqual([]);
  }
  expect(playSystemPrompt(jit,null)).toContain(LEARN_MOVE_SECTION);
 });
 it("the production factory builds learn_move from the ordinary press and observe and the server's wait, over HTTP",async()=>{
  const sim=new LearnSim("evolution",{kind:"delete",selected:"YES"});
  const paths:string[]=[];
  let malformed=false,failing=false;
  const fetchFn:typeof fetch=(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;const path=new URL(url).pathname;paths.push(path);let body:unknown;
   if(path==="/action"){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)sim.press(b);body={status:"success"};}
   else if(path==="/queue_status")body={queue_empty:true};
   else if(path==="/pokebench/state")body=sim.state();
   else if(path==="/pokebench/observation")body={state_text:"Screen: evolution",screenshot_base64:png,state:sim.state()};
   else if(path==="/pokebench/move-learn/wait"){
    if(failing)return Promise.resolve(new Response("no",{status:503}));
    body=malformed?{reason:"later"}:{reason:sim.reason(),frames:3,state:sim.state(),battle_learner:null};
   }
   else throw new Error(path);
   return Promise.resolve(new Response(JSON.stringify(body)));
  };
  const clock={now:()=>0,sleep:()=>Promise.resolve()};
  const base:AgentTool[]=[observeTool("http://x",fetchFn),pressTool("http://x",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,clock)];
  const watcher=new StateWatcher("http://x",fetchFn);
  const tools=withLearnMove(base,ON,watcher);
  const tool=tools.find(t=>t.name==="learn_move");
  if(tool===undefined)throw new Error("learn_move missing");
  const result=await tool.execute("l",{forget:"EMBER"});
  expect(sim.presses).toEqual(["A","UP","UP","A"]);
  expect(paths.filter(p=>p==="/action")).toHaveLength(4);
  expect(paths.filter(p=>p==="/pokebench/move-learn/wait")).toHaveLength(5);
  expect(first(result)).toContain("COMBUSKEN forgot EMBER and learned DOUBLE KICK (checked in the party's moves)");
  expect(withLearnMove(base,BASE,watcher)).toEqual(base);
  expect(()=>withLearnMove([observeTool("http://x",fetchFn)],ON,watcher)).toThrow("learn_move requires the ordinary game tools");
  const blind=withLearnMove(base,ON,{read:()=>Promise.resolve(sim.state())}).find(t=>t.name==="learn_move");
  await expect(blind?.execute("l",{forget:"EMBER"})).rejects.toThrow("learn_move needs a game server that serves /pokebench/move-learn/wait");
  malformed=true;
  await expect(watcher.moveLearnWait()).rejects.toThrow(new GameStateError("Malformed move-learning wait"));
  malformed=false;failing=true;
  await expect(watcher.moveLearnWait(new AbortController().signal)).rejects.toThrow("Move-learning wait returned HTTP 503");
  const gated:string[]=[];
  const gatedTool=withLearnMove(base,ON,{read:()=>Promise.resolve(sim.state()),moveLearnWait:()=>Promise.resolve({reason:"other",frames:0,state:sim.state(),battle_learner:null})},()=>{gated.push("gate");return Promise.resolve();}).find(t=>t.name==="learn_move");
  await gatedTool?.execute("l",{forget:"EMBER"});
  expect(gated).toEqual(["gate"]);
 });
});
