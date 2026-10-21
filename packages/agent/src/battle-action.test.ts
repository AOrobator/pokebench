import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {gunzipSync} from "node:zlib";
import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {RUN_START_META} from "../test-support/events.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {parseEvent} from "./events.js";
import {withResultFacts} from "./result-facts.js";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {BATTLE_ACTION_ID,BattleActionArgs,actionButton,battleActionTool,describeBattle,moveButton,withBattleAction,type BattleActionPorts} from "./battle-action.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {BeforePressCheck} from "./game-tools.js";
import {observeTool,pressTool} from "./game-tools.js";
import type {Button} from "./events.js";
import {FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {dependencyProblems} from "./features.js";

// Recorded state events (scratch extractor over events.jsonl, unchanged bodies):
// e046 = runs/2026-10-17T13-15-36_qwen36-gpu1_e046, turns 593-594: TORCHIC (SCRATCH 0 PP, GROWL, FOCUS ENERGY, EMBER)
//   vs wild SHROOMISH; 16609 action menu on FIGHT, 16616 move menu on SCRATCH, 16622 on GROWL, 16634 action menu again.
// 0e05 = runs/2026-10-17T11-15-07_qwen36-gpu0_0e05, turns 770-772, trainer battle vs ZIGZAGOON: 18877 action menu on
//   POKEMON, 18934 on RUN, 18947 "No! There's no running from a TRAINER battle!" waiting for A or B.
interface Recorded {readonly run:string;readonly seq:number;readonly turn:number;readonly state:unknown}
const REC=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/battle-action-e046-0e05.json.gz",import.meta.url))).toString("utf8")) as Record<string,Recorded>;
const rec=(key:string):GameStateSnapshot=>{const r=REC[key];if(r===undefined)throw new Error(key);return parseGameState(structuredClone(r.state));};
const NAV=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/navigation-truth-states.json.gz",import.meta.url))).toString("utf8")) as Record<string,unknown>;
const FIELD=parseGameState(NAV["54a7:3009"]);

type Battle=NonNullable<GameStateSnapshot["battle"]>;
type Input=NonNullable<Battle["player_inputs"]>[number];
const ACTION_TEMPLATE=rec("e046:16609").battle?.player_inputs?.[0] as Input;
const MOVE_TEMPLATE=rec("e046:16616").battle?.player_inputs?.[0] as Input;
const BUSY_TEMPLATE=rec("0e05:18947").battle?.player_inputs?.[0] as Input;
const READER_LABELS=["FIGHT","BAG","POKEMON","RUN"] as const;
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();

type Screen="action"|"move"|"to_move"|"to_action"|"committed"|"bag"|"party"|"message"|"target";
// A battle input that follows pret HandleInputChooseAction / HandleInputChooseMove (src/battle_controller_player.c):
// the 2x2 cursors move only where the game lets them; A and B leave the menu through a busy transition that the
// game server's battle wait carries to the next input frame.
class BattleSim {
 screen:Screen;action:number;move:number;presses:Button[]=[];chosen:{action:string;slot:number|null}|null=null;
 message:string|null=null;instant=false;frozen=false;waits=0;
 private readonly base:GameStateSnapshot;
 constructor(start:GameStateSnapshot,opts:{move?:number}={}){
  this.base=structuredClone(start);
  const input=start.battle?.player_inputs?.[0];
  this.screen=input?.phase==="move"?"move":input?.phase==="action"?"action":"message";
  this.action=input?.action_cursor??0;this.move=input?.move_cursor??opts.move??0;
  this.message=start.battle?.message?.page??null;
 }
 get mon(){const b=this.base.battle?.battlers?.find(m=>m.battler===0);if(b===undefined)throw new Error("battler");return b;}
 get count(){return this.mon.moves.filter(m=>m.move_id!==0).length;}
 get trainer(){return ((this.base.battle?.battle_type??0)&8)!==0;}
 state():GameStateSnapshot {
  const s=structuredClone(this.base);const b=s.battle;if(b==null)throw new Error("battle");
  b.message=null;b.prompt=null;
  if(this.screen==="action"){b.phase="input";b.ready=true;b.text_phase="input";b.player_inputs=[{...ACTION_TEMPLATE,action_cursor:this.action,selected:READER_LABELS[this.action]??null}];}
  else if(this.screen==="move"){
   const m=this.mon.moves[this.move];if(m===undefined)throw new Error("slot");
   b.phase="input";b.ready=true;b.text_phase="input";b.player_inputs=[{...MOVE_TEMPLATE,move_cursor:this.move,selected:m.name,selected_move_id:m.move_id,displayed_pp:m.pp,displayed_max_pp:m.max_pp}];
  }else if(this.screen==="target"){b.phase="input";b.ready=true;b.text_phase="input";b.player_inputs=[{...MOVE_TEMPLATE,phase:"target",move_cursor:null,target_cursor:1,selected:"SHROOMISH",selected_move_id:null,displayed_pp:null,displayed_max_pp:null}];}
  else {
   b.phase="resolving";b.ready=false;b.player_inputs=[{...BUSY_TEMPLATE}];
   if(this.screen==="message"){b.text_phase="message_waiting";b.message={state:"waiting_for_input",render_state:"page_wait",text:this.message,cursor:1,identity:"m",diagnostic:null,page:this.message};}
   else if(this.screen==="bag"||this.screen==="party"){b.text_phase="screen";s.screen=this.screen==="bag"?"bag_menu":"party_menu";}
   else b.text_phase="busy";
  }
  return parseGameState(s);
 }
 private settle(next:Screen){this.screen=next;if(this.instant)this.transition();}
 transition(){if(this.screen==="to_move")this.screen="move";else if(this.screen==="to_action")this.screen="action";}
 press(button:Button){
  this.presses.push(button);
  if(this.frozen)return;
  if(this.screen==="action"){
   const c=this.action;
   if(button==="LEFT"&&c&1)this.action=c^1;else if(button==="RIGHT"&&!(c&1))this.action=c^1;
   else if(button==="UP"&&c&2)this.action=c^2;else if(button==="DOWN"&&!(c&2))this.action=c^2;
   else if(button==="A"){
    if(c===0){if(this.mon.moves.every(m=>m.pp===0||m.move_id===0)){this.chosen={action:"fight",slot:null};this.screen="committed";}else this.settle("to_move");}
    else if(c===1)this.screen="bag";else if(c===2)this.screen="party";
    else if(this.trainer){this.screen="message";this.message="No! There's no running from a TRAINER battle!";}
    else {this.chosen={action:"run",slot:null};this.screen="committed";}
   }
  }else if(this.screen==="move"){
   const c=this.move,n=this.count;
   if(button==="LEFT"&&c&1)this.move=c^1;else if(button==="RIGHT"&&!(c&1)&&(c^1)<n)this.move=c^1;
   else if(button==="UP"&&c&2)this.move=c^2;else if(button==="DOWN"&&!(c&2)&&(c^2)<n)this.move=c^2;
   else if(button==="A"){if((this.mon.moves[c]?.pp??0)===0){this.screen="message";this.message="There's no PP left for this move!";}else{this.chosen={action:"fight",slot:c};this.screen="committed";}}
   else if(button==="B")this.settle("to_action");
  }
 }
 ports(over:Partial<BattleActionPorts>={}):BattleActionPorts {
  const result=(text:string):AgentToolResult<{state:GameStateSnapshot}>=>{const state=this.state();return {content:[{type:"image",data:png,mimeType:"image/png"},{type:"text",text:`${text}\nScreen: ${state.screen}`}],details:{state}};};
  return {
   read:()=>Promise.resolve(this.state()),
   press:(_id:string,params:{buttons:Button[]},_signal:AbortSignal|undefined,check:BeforePressCheck)=>{check(this.state());for(const b of params.buttons)this.press(b);return Promise.resolve(result(`pressed ${params.buttons.join(", ")}`));},
   observe:()=>Promise.resolve(result("observed")),
   wait:()=>{this.waits++;const from=this.screen;this.transition();const state=this.state();return Promise.resolve({reason:from===this.screen?"bound" as const:"input" as const,frames:from===this.screen?600:6,state});},
   ...over,
  };
 }
}
const call=async(sim:BattleSim,args:{action:"fight"|"bag"|"pokemon"|"run";move?:string;target?:string},over:Partial<BattleActionPorts>={})=>{
 const result=await battleActionTool(sim.ports(over)).execute("b1",args);
 const text=result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
 return {result,text,status:text.split("\n")[0]??""};
};

describe("the simulated battle input matches the recorded game",()=>{
 it("renders e046's recorded move menu on SCRATCH and on GROWL from its action menu state",()=>{
  const sim=new BattleSim(rec("e046:16609"));sim.instant=true;
  sim.press("A");expect(sim.state().battle?.player_inputs).toEqual(rec("e046:16616").battle?.player_inputs);
  sim.press("RIGHT");expect(sim.state().battle?.player_inputs).toEqual(rec("e046:16622").battle?.player_inputs);
 });
 it("replays the recorded failures: e046's A, RIGHT, A, A chooses GROWL; 0e05's LEFT, LEFT, DOWN, DOWN, A from RUN opens the party",()=>{
  const e046=new BattleSim(rec("e046:16609"));e046.instant=true;
  for(const b of ["A","RIGHT","A","A"] as const)e046.press(b);
  expect(e046.chosen).toEqual({action:"fight",slot:1});
  expect(e046.mon.moves[1]?.name).toBe("GROWL");
  const e05=new BattleSim(rec("0e05:18934"));
  for(const b of ["LEFT","LEFT","DOWN","DOWN","A"] as const)e05.press(b);
  expect(e05.screen).toBe("party");
 });
});

describe("cursor steps follow the game's input handlers",()=>{
 it("action menu: column first, then row; null when already there",()=>{
  expect(actionButton(0,3)).toBe("RIGHT");expect(actionButton(1,3)).toBe("DOWN");expect(actionButton(3,0)).toBe("LEFT");
  expect(actionButton(2,0)).toBe("UP");expect(actionButton(2,2)).toBeNull();
 });
 it("move menu: never through a slot the game will not move to",()=>{
  expect(moveButton(0,3,4)).toBe("RIGHT");expect(moveButton(1,3,4)).toBe("DOWN");
  // Three moves: from TOP-RIGHT (1) to BOTTOM-LEFT (2) DOWN is refused by the game ((1^2)=3 >= 3), so LEFT first.
  expect(moveButton(1,2,3)).toBe("LEFT");
  expect(moveButton(0,1,1)).toBeNull();expect(moveButton(2,2,4)).toBeNull();expect(moveButton(0,2,2)).toBeNull();
  expect(moveButton(0,3,3)).toBeNull();
 });
});

describe("battle_action on the recorded battles",()=>{
 it("e046 T593: fight EMBER from the action menu reaches EMBER (bottom right) and chooses it",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const {status,result}=await call(sim,{action:"fight",move:"Ember"});
  expect(sim.chosen).toEqual({action:"fight",slot:3});
  expect(sim.presses).toEqual(["A","RIGHT","DOWN","A"]);
  expect(sim.waits).toBe(1);
  expect(status).toBe(`Battle action: chose FIGHT, then EMBER; buttons pressed: ${sim.presses.join(", ")}; the battle is running its own text or animation.`);
  expect(result.details).toMatchObject({battle_action:{action:"fight",move:"EMBER",presses:sim.presses,refused:false}});
 });
 it("0e05 T770: from POKéMON the cursor goes up to FIGHT, then to EMBER",async()=>{
  const sim=new BattleSim(rec("0e05:18877"));sim.instant=true;
  const {status}=await call(sim,{action:"fight",move:"EMBER"});
  expect(sim.chosen).toEqual({action:"fight",slot:3});
  expect(sim.presses[0]).toBe("UP");expect(sim.presses[1]).toBe("A");
  expect(sim.waits).toBe(0);
  expect(status).toContain("chose FIGHT, then EMBER");
 });
 it("0e05 T772: run from RUN in a trainer battle presses A once and reports the game's own message",async()=>{
  const sim=new BattleSim(rec("0e05:18934"));
  const {status}=await call(sim,{action:"run"});
  expect(sim.presses).toEqual(["A"]);
  expect(status).toBe(`Battle action: chose RUN; buttons pressed: A; a battle message is waiting for A or B: "No! There's no running from a TRAINER battle!"`);
 });
 it("bag and pokemon open their screens and stop there",async()=>{
  const bag=new BattleSim(rec("e046:16609"));
  expect((await call(bag,{action:"bag"})).status).toBe("Battle action: chose BAG; buttons pressed: RIGHT, A; the game is showing another screen (bag_menu); choosing an item there is up to you.");
  const party=new BattleSim(rec("e046:16609"));
  expect((await call(party,{action:"pokemon"})).status).toBe("Battle action: chose POKéMON; buttons pressed: DOWN, A; the game is showing another screen (party_menu); choosing a POKéMON there is up to you.");
 });
 it("starting in the move menu, bag goes back with B first",async()=>{
  const sim=new BattleSim(rec("e046:16616"));
  await call(sim,{action:"bag"});
  expect(sim.presses).toEqual(["B","RIGHT","A"]);expect(sim.screen).toBe("bag");
 });
 it("starting in the move menu, fight goes straight to the move",async()=>{
  const sim=new BattleSim(rec("e046:16622"));
  await call(sim,{action:"fight",move:"focus energy"});
  expect(sim.presses).toEqual(["LEFT","DOWN","A"]);
  expect(sim.chosen).toEqual({action:"fight",slot:2});
 });
});

describe("battle-move-tool-v1 doubles scope (the operator 2026-10-17 4:18 PM): target in a single battle",()=>{
 it("a target passed in a single battle is ignored, and the result says so",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const {status}=await call(sim,{action:"fight",move:"EMBER",target:"SHROOMISH"});
  expect(sim.chosen).toEqual({action:"fight",slot:3});
  expect(status).toBe("Battle action: chose FIGHT, then EMBER; buttons pressed: A, RIGHT, DOWN, A; target ignored: this is not a double battle; the battle is running its own text or animation.");
 });
});

describe("refusals press nothing and say why",()=>{
 it("no PP: the game's own words",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const {status,result}=await call(sim,{action:"fight",move:"SCRATCH"});
  expect(sim.presses).toEqual([]);
  expect(status).toBe("Battle action: nothing pressed: There's no PP left for this move! (SCRATCH has 0/35 PP)");
  expect(result.details).toMatchObject({battle_action:{refused:true,presses:[]}});
 });
 it("a move the active POKéMON does not know, and a missing move",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  expect((await call(sim,{action:"fight",move:"TACKLE"})).status).toBe("Battle action: nothing pressed: TORCHIC does not know TACKLE; its moves: SCRATCH (PP 0/35), GROWL (PP 38/40), FOCUS ENERGY (PP 30/30), EMBER (PP 13/25).");
  expect((await call(sim,{action:"fight"})).status).toBe("Battle action: nothing pressed: name the move to use; TORCHIC's moves: SCRATCH (PP 0/35), GROWL (PP 38/40), FOCUS ENERGY (PP 30/30), EMBER (PP 13/25).");
  expect((await call(sim,{action:"bag",move:"EMBER"})).status).toBe("Battle action: nothing pressed: move goes only with action fight.");
  expect(sim.presses).toEqual([]);
 });
 it("input not ready: the waiting message is quoted",async()=>{
  const sim=new BattleSim(rec("0e05:18947"));
  expect((await call(sim,{action:"fight",move:"EMBER"})).status).toBe(`Battle action: nothing pressed: the battle is not waiting for a choice; a battle message is waiting for A or B: "No! There's no running from a TRAINER battle!"`);
  expect(sim.presses).toEqual([]);
 });
 it("outside a battle",async()=>{
  const ports:BattleActionPorts={read:()=>Promise.resolve(FIELD),press:()=>{throw new Error("pressed");},observe:()=>Promise.resolve({content:[{type:"text",text:"Screen: overworld"}],details:{state:FIELD}})};
  const result=await battleActionTool(ports).execute("b",{action:"run"});
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: nothing pressed: no battle is in progress."});
 });
 it("a target, YES/NO or Safari choice open, or an unreadable battle",async()=>{
  const sim=new BattleSim(rec("e046:16609"));sim.screen="target";
  expect((await call(sim,{action:"fight",move:"EMBER"})).status).toBe("Battle action: nothing pressed: the battle is not waiting for a choice from the FIGHT, BAG, POKéMON, RUN menu; the target choice is open; highlighted SHROOMISH.");
  const safari=rec("e046:16609");const b=safari.battle;if(b==null)throw new Error("battle");
  b.player_inputs=[{...ACTION_TEMPLATE,phase:"safari_action",selected:"SAFARI BALL"}];
  const ports:BattleActionPorts={read:()=>Promise.resolve(safari),press:()=>{throw new Error("pressed");},observe:()=>Promise.resolve({content:[],details:{state:safari}})};
  expect((await battleActionTool(ports).execute("b",{action:"run"})).content[0]).toEqual({type:"text",text:"Battle action: nothing pressed: the battle is not waiting for a choice from the FIGHT, BAG, POKéMON, RUN menu; the Safari action menu is open; highlighted SAFARI BALL."});
  const broken=rec("e046:16609");if(broken.battle==null)throw new Error("battle");broken.battle={...broken.battle,phase:"unavailable",battlers:null,player_inputs:null,diagnostic:"harness bug: x"};
  const ports2:BattleActionPorts={...ports,read:()=>Promise.resolve(broken)};
  expect((await battleActionTool(ports2).execute("b",{action:"run"})).content[0]).toEqual({type:"text",text:"Battle action: nothing pressed: the battle state could not be read (harness bug: x)."});
 });
});

describe("never presses blindly",()=>{
 it("stops when the state changes between plan and press; nothing is sent",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  let first=true;
  const ports=sim.ports({press:(_id,params,_s,check)=>{if(first){first=false;sim.action=1;}check(sim.state());for(const b of params.buttons)sim.press(b);return Promise.resolve({content:[],details:{state:sim.state()}});}});
  const result=await battleActionTool(ports).execute("b",{action:"run"});
  expect(sim.presses).toEqual([]);
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: stopped; the battle input changed before the press, so no button was sent; inspect the new state."});
 });
 it("stops when the cursor does not move where the game moves it",async()=>{
  const sim=new BattleSim(rec("e046:16609"));sim.frozen=true;
  const {status}=await call(sim,{action:"run"});
  expect(sim.presses).toEqual(["RIGHT"]);
  expect(status).toBe("Battle action: stopped after pressing RIGHT; the highlight stayed on FIGHT; inspect the new state.");
 });
 it("stops when the move menu does not show the active POKéMON's move",async()=>{
  const sim=new BattleSim(rec("e046:16622"));
  const lying=sim.ports({read:()=>{const s=sim.state();const i=s.battle?.player_inputs?.[0];if(i!=null)i.selected_move_id=1;return Promise.resolve(s);}});
  const result=await battleActionTool(lying).execute("b",{action:"fight",move:"EMBER"});
  expect(sim.presses).toEqual([]);
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: stopped; the move menu does not show TORCHIC's moves in order; inspect the new state."});
 });
 it("with no battle wait, a menu still opening is reported, not pressed through",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const noWait=sim.ports();delete noWait.wait;
  const result=await battleActionTool(noWait).execute("b",{action:"fight",move:"EMBER"});
  const status=result.content[0]?.type==="text"?result.content[0].text:"";
  expect(sim.presses).toEqual(["A"]);
  expect(status).toBe("Battle action: stopped after pressing A; the battle is running its own text or animation; inspect the new state.");
 });
 it("a wait that ends without input stops after three",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const {status}=await call(sim,{action:"fight",move:"EMBER"},{wait:()=>{sim.waits++;return Promise.resolve({reason:"bound",frames:600,state:sim.state()});}});
  expect(sim.waits).toBe(3);expect(sim.presses).toEqual(["A"]);
  expect(status).toContain("stopped after pressing A");
 });
 it("every move at 0 PP: FIGHT is chosen and the game decides",async()=>{
  const start=rec("e046:16609");const mon=start.battle?.battlers?.[0];if(mon==null)throw new Error("mon");
  mon.moves=mon.moves.map(m=>({...m,pp:0}));
  const sim=new BattleSim(start);
  const {status}=await call(sim,{action:"fight"});
  expect(sim.presses).toEqual(["A"]);expect(sim.chosen).toEqual({action:"fight",slot:null});
  expect(status).toContain("Battle action: chose FIGHT (every move has 0 PP; the game picks what TORCHIC does)");
 });
 it("a rejected move leaves the game's message",async()=>{
  const start=rec("e046:16616");const sim=new BattleSim(start);
  // A move the game refuses after A (Disable and similar are not read): PP shown as nonzero, the game says why.
  const ports=sim.ports({press:(_i,params,_s,check)=>{check(sim.state());for(const b of params.buttons){sim.presses.push(b);if(b==="A"){sim.screen="message";sim.message="TORCHIC's EMBER is disabled!";}else sim.press(b);}return Promise.resolve({content:[],details:{state:sim.state()}});}});
  const result=await battleActionTool(ports).execute("b",{action:"fight",move:"GROWL"});
  expect(result.content[0]).toEqual({type:"text",text:`Battle action: chose FIGHT, then GROWL; buttons pressed: RIGHT, A; a battle message is waiting for A or B: "TORCHIC's EMBER is disabled!"`});
 });
});

describe("other stops",()=>{
 it("Codex round 1: two ready inputs (a double battle) are refused, and a second one appearing mid-call stops it; nothing reaches both",async()=>{
  const two=rec("e046:16609");const b=two.battle;if(b==null)throw new Error("battle");
  b.player_inputs=[{...ACTION_TEMPLATE},{...ACTION_TEMPLATE,battler:2}];
  const ports:BattleActionPorts={read:()=>Promise.resolve(two),press:()=>{throw new Error("pressed");},observe:()=>Promise.resolve({content:[],details:{state:two}})};
  expect((await battleActionTool(ports).execute("b",{action:"run"})).content[0]).toEqual({type:"text",text:"Battle action: nothing pressed: more than one battle input is waiting at once; battle_action chooses for one at a time, so use press."});
  const sim=new BattleSim(rec("e046:16609"));
  const doubled=()=>{const s=sim.state();const sb=s.battle;if(sb==null)throw new Error("battle");sb.player_inputs=[...(sb.player_inputs??[]),{...ACTION_TEMPLATE,battler:2}];return s;};
  let first=true;
  const p2=sim.ports({press:(_i,params,_s,check)=>{check(first?sim.state():doubled());for(const x of params.buttons)sim.press(x);const out=first?doubled():sim.state();first=false;return Promise.resolve({content:[],details:{state:out}});}});
  const result=await battleActionTool(p2).execute("b",{action:"run"});
  expect(sim.presses).toEqual(["RIGHT"]);
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: stopped after pressing RIGHT; more than one battle input is waiting at once; inspect the new state."});
 });
 it("an input this call does not drive appearing between menus stops it",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const {status}=await call(sim,{action:"fight",move:"EMBER"},{wait:()=>{sim.screen="target";return Promise.resolve({reason:"input",frames:3,state:sim.state()});}});
  expect(sim.presses).toEqual(["A"]);
  expect(status).toBe("Battle action: stopped after pressing A; the target choice is open; highlighted SHROOMISH; inspect the new state.");
 });
 it("a press that fails is not swallowed",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  await expect(call(sim,{action:"run"},{press:()=>Promise.reject(new Error("POST /action failed"))})).rejects.toThrow("POST /action failed");
 });
 it("the B out of the move menu is pressed once; a second move menu stops the call",async()=>{
  const sim=new BattleSim(rec("e046:16616"));
  const ports=sim.ports({press:(_i,params,_s,check)=>{check(sim.state());for(const b of params.buttons)sim.presses.push(b);return Promise.resolve({content:[],details:{state:sim.state()}});}});
  const result=await battleActionTool(ports).execute("b",{action:"run"});
  expect(sim.presses).toEqual(["B"]);
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: stopped after pressing B; the move menu is open; highlighted SCRATCH; inspect the new state."});
 });
 it("describes a prompt, an idle message window and a readout without a battle",()=>{
  const s=rec("0e05:18947");const b=s.battle;if(b==null)throw new Error("battle");
  expect(describeBattle({...s,battle:{...b,text_phase:"prompt"}})).toBe("a battle YES/NO question is open");
  expect(describeBattle({...s,battle:{...b,message:null}})).toBe("a battle message is waiting for A or B");
  expect(describeBattle({...s,in_battle:false})).toBe("the battle has ended");
  expect(describeBattle({...s,battle:null})).toBe("the battle state could not be read");
  const odd=rec("e046:16609");const ob=odd.battle;if(ob==null)throw new Error("battle");
  ob.player_inputs=[{...ACTION_TEMPLATE,phase:"other_owner",selected:null}];
  expect(describeBattle(odd)).toBe("battle input other_owner is open");
 });
 it("refuses when the active POKéMON is not among the battlers",async()=>{
  const s=rec("e046:16609");const b=s.battle;if(b==null)throw new Error("battle");b.battlers=b.battlers?.filter(m=>m.battler!==0)??null;
  const ports:BattleActionPorts={read:()=>Promise.resolve(s),press:()=>{throw new Error("pressed");},observe:()=>Promise.resolve({content:[],details:{state:s}})};
  expect((await battleActionTool(ports).execute("b",{action:"run"})).content[0]).toEqual({type:"text",text:"Battle action: nothing pressed: the active POKéMON could not be read."});
 });
});

describe("battle-move-tool-v1 registry and production wiring",()=>{
 it("the precondition refuses a state with two ready inputs; nothing is sent",async()=>{
  const sim=new BattleSim(rec("e046:16609"));
  const p=sim.ports({press:(_i,params,_s,check)=>{const s=sim.state();const sb=s.battle;if(sb==null)throw new Error("battle");sb.player_inputs=[...(sb.player_inputs??[]),{...ACTION_TEMPLATE,battler:2}];check(s);for(const x of params.buttons)sim.press(x);return Promise.resolve({content:[],details:{state:sim.state()}});}});
  const result=await battleActionTool(p).execute("b",{action:"run"});
  expect(sim.presses).toEqual([]);
  expect(result.content[0]).toEqual({type:"text",text:"Battle action: stopped; the battle input changed before the press, so no button was sent; inspect the new state."});
 });
 const BASE=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const ON:FeatureSet={...BASE,[BATTLE_ACTION_ID]:true};
 it("is a default-off guidance switch recorded last, needing no other switch",()=>{
  expect(featureInfo(BATTLE_ACTION_ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"BATTLE ACTION TOOL"});
  expect(featureInfo(BATTLE_ACTION_ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-97)).toBe(BATTLE_ACTION_ID);
  expect(FEATURES.filter(f=>f.switchable).at(-97)?.id).toBe(BATTLE_ACTION_ID);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[BATTLE_ACTION_ID]:true},null).at(-33)).toBe(BATTLE_ACTION_ID);
  expect(BASE[BATTLE_ACTION_ID]).toBe(false);
  const old=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!==BATTLE_ACTION_ID))});
  expect(presetFeatures(old)[BATTLE_ACTION_ID]).toBe(false);
  expect(normalizeFeatures({...ALL_ON})[BATTLE_ACTION_ID]).toBe(true);
 });
 it("OFF: tools and prompt are byte-identical; ON adds battle_action last in the recorded list",()=>{
  const OFF={...BASE,[BATTLE_ACTION_ID]:false};
  const noop={beforePress:()=>undefined,afterPress:()=>Promise.resolve()};
  const rec={recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyBattleWarning:()=>undefined};
  const tools=(f:FeatureSet)=>playGameTools([observeTool("http://x"),pressTool("http://x",noop)],f,{read:()=>Promise.reject(new Error("no"))},rec);
  const off=tools(OFF),on=tools(ON);
  expect(off.map(t=>t.name)).not.toContain("battle_action");
  expect(JSON.stringify(off.map(t=>[t.name,t.description,t.parameters]))).toBe(JSON.stringify(on.filter(t=>t.name!=="battle_action").map(t=>[t.name,t.description,t.parameters])));
  expect(playSystemPrompt(OFF,null)).toBe(playSystemPrompt(ON,null));
  expect(playTools(OFF)).not.toContain("battle_action");
  expect(playTools(ON).at(-1)).toBe("battle_action");
  expect(on.map(t=>t.name)).toContain("battle_action");
 });
 it("the production factory builds battle_action from the ordinary press and observe, over HTTP",async()=>{
  const sim=new BattleSim(rec("0e05:18877"));sim.instant=true;
  const paths:string[]=[];
  const fetchFn:typeof fetch=(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;const path=new URL(url).pathname;paths.push(path);let body:unknown;
   if(path==="/action"){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)sim.press(b);body={status:"success"};}
   else if(path==="/queue_status")body={queue_empty:true};
   else if(path==="/pokebench/state")body=sim.state();
   else if(path==="/pokebench/observation")body={state_text:"Screen: battle",screenshot_base64:png,state:sim.state()};
   else throw new Error(path);
   return Promise.resolve(new Response(JSON.stringify(body)));
  };
  const clock={now:()=>0,sleep:()=>Promise.resolve()};
  const base:AgentTool[]=[observeTool("http://x",fetchFn),pressTool("http://x",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,clock)];
  const tools=withBattleAction(base,ON,{read:()=>Promise.resolve(sim.state())});
  const tool=tools.find(t=>t.name==="battle_action");
  if(tool===undefined)throw new Error("battle_action missing");
  expect(Value.Check(BattleActionArgs,{action:"fight",move:"EMBER"})).toBe(true);
  expect(Value.Check(BattleActionArgs,{action:"switch"})).toBe(false);
  await tool.execute("b",{action:"fight",move:"EMBER"});
  expect(sim.chosen).toEqual({action:"fight",slot:3});
  expect(paths.filter(p=>p==="/action")).toHaveLength(sim.presses.length);
  expect(withBattleAction(base,{...ON,[BATTLE_ACTION_ID]:false},{read:()=>Promise.resolve(sim.state())})).toEqual(base);
  expect(()=>withBattleAction([observeTool("http://x",fetchFn)],ON,{read:()=>Promise.resolve(sim.state())})).toThrow("battle_action requires the ordinary game tools");
  // With the server's battle wait: A on FIGHT leaves the menu opening, the wait carries it to the move menu.
  const later=new BattleSim(rec("e046:16609"));let waited=0;
  const fetch2:typeof fetch=(input,init)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;const path=new URL(url).pathname;let body:unknown;
   if(path==="/action"){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)later.press(b);body={status:"success"};}
   else if(path==="/queue_status")body={queue_empty:true};
   else if(path==="/pokebench/state")body=later.state();
   else if(path==="/pokebench/observation")body={state_text:"Screen: battle",screenshot_base64:png,state:later.state()};
   else throw new Error(path);
   return Promise.resolve(new Response(JSON.stringify(body)));
  };
  const base2:AgentTool[]=[observeTool("http://x",fetch2),pressTool("http://x",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetch2,clock)];
  const gated:string[]=[];
  const withWait=withBattleAction(base2,ON,{read:()=>Promise.resolve(later.state()),battleWait:()=>{waited++;later.transition();return Promise.resolve({reason:"input",frames:5,state:later.state()});}},()=>{gated.push("gate");return Promise.resolve();}).find(t=>t.name==="battle_action");
  await withWait?.execute("b2",{action:"fight",move:"EMBER"});
  expect(later.chosen).toEqual({action:"fight",slot:3});expect(waited).toBe(1);expect(gated.length).toBe(later.presses.length+1);
 });
});

describe("the pending experiment",()=>{
 it("flips only battle-move-tool-v1, is not queued and names the evidence runs",()=>{
  const entry=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/battle-move-tool.json",import.meta.url),"utf8")));
  expect(entry.queuePosition).toBeUndefined();
  expect(entry).toMatchObject({changedFeature:BATTLE_ACTION_ID,activationMilestone:"STARTER_CHOSEN",primaryMilestone:"RIVAL_BATTLE_WON"});
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual([BATTLE_ACTION_ID]);
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
  expect(entry.hypothesis).toContain("e046");
 });
});

describe("battle_action is recorded and recapped like the other game tools",()=>{
 it("carries a one-shot blackout receipt from an internal press to its outer result",async()=>{
  const sim=new BattleSim(rec("e046:16609"));sim.instant=true;
  const notice="Whited out: preserved through battle_action.";
  const receipt={frame:81,money_before:3000,notice};let delivered=false;
  const ports=sim.ports({
   press:(_id,params,_signal,check)=>{check(sim.state());for(const button of params.buttons)sim.press(button);const state=sim.state();const carried=delivered?state:{...state,blackout_receipt:receipt};delivered=true;return Promise.resolve({content:[{type:"text" as const,text:carried.blackout_receipt===undefined?"pressed":notice}],details:{state:carried}});},
   observe:()=>Promise.resolve({content:[{type:"text" as const,text:"final battle state"}],details:{state:sim.state()}}),
  });
  const result=await battleActionTool(ports).execute("b1",{action:"fight",move:"EMBER"});
  expect((result.details as {state:GameStateSnapshot}).state.blackout_receipt).toEqual(receipt);
  expect(result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n")).toContain(notice);
 });
 it("the recorder pairs a battle_action result with the state it returned; presses carry the call id",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-battle-action-")),log=RunLog.create(root,"battle-action");
  const sim=new BattleSim(rec("e046:16609"));sim.instant=true;
  const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(sim.state())}});
  await recorder.start(RUN_START_META);
  await recorder.emit({type:"tool_execution_start",toolCallId:"b1",toolName:"battle_action",args:{action:"fight",move:"EMBER"}});
  const ports=sim.ports({press:(id,params,_s,check)=>{const before=sim.state();check(before);recorder.buttonPress(id,params.buttons,{hold_frames:10,release_frames:8},before);for(const b of params.buttons)sim.press(b);return Promise.resolve({content:[],details:{state:sim.state()}});}});
  const result=await battleActionTool(ports).execute("b1",{action:"fight",move:"EMBER"});
  await recorder.emit({type:"tool_execution_end",toolCallId:"b1",toolName:"battle_action",isError:false,result});
  const logged=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>parseEvent(line));
  const out=logged.findLast(e=>e.type==="tool_result");
  if(out?.type!=="tool_result")throw new Error("no tool_result");
  expect(out.name).toBe("battle_action");expect(out.state_seq).toBeDefined();
  expect(logged.find(e=>e.seq===out.state_seq)).toMatchObject({type:"state",in_battle:true});
  expect(out.text.split("\n")[0]).toBe("Battle action: chose FIGHT, then EMBER; buttons pressed: A, RIGHT, DOWN, A; the battle is running its own text or animation.");
  const presses=logged.flatMap(e=>e.type==="button_press"?[[e.tool_call_id,e.buttons.join()]]:[]);
  expect(presses).toEqual([["b1","A"],["b1","RIGHT"],["b1","DOWN"],["b1","A"]]);
 });
 it("battle-loss recap and blocked-exit facts wrap battle_action",()=>{
  const tool:AgentTool={name:"battle_action",label:"b",description:"d",parameters:BattleActionArgs,execute:()=>Promise.resolve({content:[],details:{}})};
  const [wrapped]=withResultFacts([tool],{...ALL_ON,"battle-decision-ready-v1":false,"blocked-exit-fact-v1":true,"battle-loss-recap-v1":true},{subscribe:()=>undefined});
  expect(wrapped).not.toBe(tool);expect(wrapped?.name).toBe("battle_action");
 });
});
