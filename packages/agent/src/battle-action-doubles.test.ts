import {describe,expect,it} from "vitest";
import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {battleActionTool,type BattleActionPorts} from "./battle-action.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {BeforePressCheck} from "./game-tools.js";
import type {Button} from "./events.js";

// No recorded run has reached a double battle (no state with battle_type bit 0 in runs/), so these states are
// synthetic: the recorded e046 seq 16609 single battle (TORCHIC vs SHROOMISH) widened to four battlers, with the
// recorded input rows as templates. Move target types follow pret src/data/battle_moves.h (SCRATCH, EMBER, TACKLE
// MOVE_TARGET_SELECTED 0; GROWL, STRING SHOT MOVE_TARGET_BOTH 8; FOCUS ENERGY MOVE_TARGET_USER 16).
interface Recorded {readonly state:unknown}
const REC=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/battle-action-e046-0e05.json.gz",import.meta.url))).toString("utf8")) as Record<string,Recorded>;
const rec=(key:string):GameStateSnapshot=>{const r=REC[key];if(r===undefined)throw new Error(key);return parseGameState(structuredClone(r.state));};
type Battle=NonNullable<GameStateSnapshot["battle"]>;
type Mon=NonNullable<Battle["battlers"]>[number];
type Input=NonNullable<Battle["player_inputs"]>[number];
const ACTION=rec("e046:16609").battle?.player_inputs?.[0] as Input;
const MOVE=rec("e046:16616").battle?.player_inputs?.[0] as Input;
const BUSY=rec("0e05:18947").battle?.player_inputs?.[0] as Input;
const LABELS=["FIGHT","BAG","POKEMON","RUN"] as const;
const TARGETS:Readonly<Record<string,number>>={SCRATCH:0,GROWL:8,"FOCUS ENERGY":16,EMBER:0,TACKLE:0,"STRING SHOT":8,ABSORB:0,"TAIL WHIP":8,CURSE:0};
const IDS:Readonly<Record<string,number>>={TACKLE:33,"STRING SHOT":81,CURSE:174};
// pret sTargetIdentities: PLAYER_LEFT, PLAYER_RIGHT, OPPONENT_RIGHT, OPPONENT_LEFT.
const ORDER=[0,2,3,1];

function doubleBase(over:{allyAbsent?:boolean;foeLeftAbsent?:boolean;foeRightSpecies?:string;noTargets?:boolean;torchicMoves?:readonly string[]}={}):GameStateSnapshot {
 const s=rec("e046:16609");const b=s.battle;if(b?.battlers==null)throw new Error("battle");
 const [torchic,shroomish]=b.battlers as [Mon,Mon];
 const withTargets=(m:Mon):Mon=>({...m,moves:m.moves.map(x=>x.name===null||over.noTargets===true?x:{...x,target:TARGETS[x.name]??0})});
 const mon=(from:Mon,battler:number,species:string,names:readonly string[],absent:boolean):Mon=>withTargets({...from,battler,position:battler,party_slot:battler===2?1:battler===3?1:from.party_slot,identity:`0000000${String(battler)}:00000000`,species,absent,moves:from.moves.map((m,slot)=>{const name=names[slot];return name===undefined?{...m,slot,move_id:0,name:null,pp:0,max_pp:0,move_type:null,power:null,accuracy:null,effect:null}:{...m,slot,move_id:IDS[name]??m.move_id,name,pp:Math.max(m.pp,5),max_pp:Math.max(m.max_pp,5)};})});
 const t=over.torchicMoves===undefined?withTargets(torchic):mon(torchic,0,"TORCHIC",over.torchicMoves,false);
 b.battlers=[t,mon(shroomish,1,"SHROOMISH",["ABSORB","TACKLE"],over.foeLeftAbsent===true),mon(torchic,2,"WURMPLE",["TACKLE","STRING SHOT"],over.allyAbsent===true),mon(shroomish,3,over.foeRightSpecies??"ZIGZAGOON",["TACKLE","GROWL","TAIL WHIP"],false)];
 b.battle_type=(b.battle_type??0)|1;
 return parseGameState(s);
}

type Phase="action"|"move"|"target"|"busy"|"done";
// pret HandleTurnActionSelectionState: the right battler is asked only after the left one confirmed.
// HandleInputChooseTarget: RIGHT/DOWN moves forward through sTargetIdentities to the next present battler,
// skipping the user unless the move is MOVE_TARGET_USER_OR_SELECTED.
class DoubleSim {
 asking=0;phase:Phase="action";action=0;move:Record<number,number>={0:0,2:0};target=1;presses:Button[]=[];chosen:{battler:number;slot:number;target:number|null}[]=[];frozen=false;
 constructor(private readonly base:GameStateSnapshot,private readonly opts:{instantTarget?:boolean}={}){}
 mon(i:number):Mon{const m=this.base.battle?.battlers?.find(x=>x.battler===i);if(m===undefined)throw new Error("mon");return m;}
 count(i:number){return this.mon(i).moves.filter(m=>m.move_id!==0).length;}
 state():GameStateSnapshot {
  const s=structuredClone(this.base);const b=s.battle;if(b==null)throw new Error("battle");
  const busy=(i:number):Input=>({...BUSY,battler:i});
  const other=this.asking===0?2:0;
  if(this.phase==="done"||this.phase==="busy"){b.phase="resolving";b.ready=false;b.text_phase="busy";b.player_inputs=[busy(0),busy(2)];return parseGameState(s);}
  b.phase="input";b.ready=true;b.text_phase="input";
  let row:Input;
  if(this.phase==="action")row={...ACTION,battler:this.asking,action_cursor:this.action,selected:LABELS[this.action]??null};
  else if(this.phase==="move"){const c=this.move[this.asking]??0;const m=this.mon(this.asking).moves[c];if(m===undefined)throw new Error("slot");row={...MOVE,battler:this.asking,move_cursor:c,selected:m.name,selected_move_id:m.move_id,displayed_pp:m.pp,displayed_max_pp:m.max_pp};}
  else row={...MOVE,battler:this.asking,phase:"target",move_cursor:null,target_cursor:this.target,selected:this.mon(this.target).species,selected_move_id:null,displayed_pp:null,displayed_max_pp:null};
  b.player_inputs=this.asking===0?[row,busy(other)]:[busy(other),row];
  return parseGameState(s);
 }
 private flags(){const c=this.move[this.asking]??0;return this.mon(this.asking).moves[c]?.target??0;}
 private present(i:number){return !this.mon(i).absent;}
 private commit(target:number|null){this.chosen.push({battler:this.asking,slot:this.move[this.asking]??0,target});if(this.asking===0){this.asking=2;this.phase="action";this.action=0;}else this.phase="done";}
 press(button:Button){
  this.presses.push(button);
  if(this.frozen)return;
  if(this.phase==="action"){
   const c=this.action;
   if(button==="LEFT"&&c&1)this.action=c^1;else if(button==="RIGHT"&&!(c&1))this.action=c^1;else if(button==="UP"&&c&2)this.action=c^2;else if(button==="DOWN"&&!(c&2))this.action=c^2;
   else if(button==="A"&&c===0)this.phase="move";
  }else if(this.phase==="move"){
   const c=this.move[this.asking]??0,n=this.count(this.asking);
   const set=(v:number)=>{this.move[this.asking]=v;};
   if(button==="LEFT"&&c&1)set(c^1);else if(button==="RIGHT"&&!(c&1)&&(c^1)<n)set(c^1);else if(button==="UP"&&c&2)set(c^2);else if(button==="DOWN"&&!(c&2)&&(c^2)<n)set(c^2);
   else if(button==="B")this.phase="action";
   else if(button==="A"){
    const f=this.flags();
    const others=[0,1,2,3].filter(i=>i!==this.asking&&this.present(i)).length;
    const selectable=(f&(4|8|1|32|64|16))===0;
    if(!selectable||(!(f&(16|2))&&others<=1))this.commit(null);
    else{this.phase="target";this.target=f&2?this.asking:!this.present(1)?3:1;}
   }
  }else if(this.phase==="target"){
   if(button==="RIGHT"||button==="DOWN"){
    let i=ORDER.indexOf(this.mon(this.target).position);
    for(;;){i=(i+1)%4;const pos=ORDER[i]??0;const cand=this.base.battle?.battlers?.find(m=>m.position===pos);if(cand===undefined)continue;
     const ok=(pos===0||pos===2)?(cand.battler!==this.asking||(this.flags()&2)!==0):true;if(ok&&this.present(cand.battler)){this.target=cand.battler;break;}}
   }else if(button==="A")this.commit(this.target);
   else if(button==="B")this.phase="move";
  }
 }
 ports():BattleActionPorts {
  const result=()=>{const state=this.state();return {content:[{type:"text" as const,text:`Screen: ${state.screen}`}],details:{state}};};
  return {
   read:()=>Promise.resolve(this.state()),
   press:(_id:string,params:{buttons:Button[]},_s:AbortSignal|undefined,check:BeforePressCheck)=>{check(this.state());for(const x of params.buttons)this.press(x);return Promise.resolve(result());},
   observe:()=>Promise.resolve(result()),
   wait:()=>Promise.resolve({reason:"bound" as const,frames:600,state:this.state()}),
  };
 }
}
const call=async(sim:DoubleSim,args:{action:"fight"|"bag"|"pokemon"|"run";move?:string;target?:string})=>{
 const r=await battleActionTool(sim.ports()).execute("d",args);
 const first=r.content[0];return first?.type==="text"?first.text:"";
};

describe("double battles: one call per battler, in the game's order",()=>{
 it("TORCHIC uses EMBER on ZIGZAGOON, then WURMPLE uses TACKLE on SHROOMISH; each call names the POKéMON it chose for",async()=>{
  const sim=new DoubleSim(doubleBase());
  const first=await call(sim,{action:"fight",move:"EMBER",target:"zigzagoon"});
  expect(sim.chosen).toEqual([{battler:0,slot:3,target:3}]);
  expect(sim.presses).toEqual(["A","RIGHT","DOWN","A","RIGHT","RIGHT","A"]);
  expect(first).toBe("Battle action: chose FIGHT, then EMBER for TORCHIC, at ZIGZAGOON (foe, screen left); buttons pressed: A, RIGHT, DOWN, A, RIGHT, RIGHT, A; the battle menu (FIGHT, BAG, POKéMON, RUN) is open for WURMPLE; highlighted FIGHT.");
  const second=await call(sim,{action:"fight",move:"TACKLE",target:"SHROOMISH"});
  expect(sim.chosen).toEqual([{battler:0,slot:3,target:3},{battler:2,slot:0,target:1}]);
  expect(second).toContain("chose FIGHT, then TACKLE for WURMPLE, at SHROOMISH (foe, screen right); buttons pressed: A, A, A;");
 });
 it("an ally can be targeted; screen-side words pick between two foes of the same species",async()=>{
  const ally=new DoubleSim(doubleBase());
  expect(await call(ally,{action:"fight",move:"EMBER",target:"ally"})).toContain("at WURMPLE (ally, screen right)");
  expect(ally.chosen).toEqual([{battler:0,slot:3,target:2}]);
  const twins=new DoubleSim(doubleBase({foeRightSpecies:"SHROOMISH"}));
  expect(await call(twins,{action:"fight",move:"EMBER",target:"SHROOMISH"})).toBe("Battle action: nothing pressed: more than one target matches SHROOMISH; name one of: SHROOMISH (foe, screen right), WURMPLE (ally, screen right), SHROOMISH (foe, screen left).");
  expect(twins.presses).toEqual([]);
  expect(await call(twins,{action:"fight",move:"EMBER",target:"foe left"})).toContain("at SHROOMISH (foe, screen left)");
  expect(twins.chosen).toEqual([{battler:0,slot:3,target:3}]);
 });
 it("a single-target move needs a target; a missing, unknown or absent one is refused with the choices",async()=>{
  const sim=new DoubleSim(doubleBase({foeLeftAbsent:true}));
  expect(await call(sim,{action:"fight",move:"EMBER"})).toBe("Battle action: nothing pressed: EMBER needs a target in this double battle; name one of: WURMPLE (ally, screen right), ZIGZAGOON (foe, screen left).");
  expect(await call(sim,{action:"fight",move:"EMBER",target:"PIKACHU"})).toBe("Battle action: nothing pressed: no target matches PIKACHU; name one of: WURMPLE (ally, screen right), ZIGZAGOON (foe, screen left).");
  expect(await call(sim,{action:"fight",move:"EMBER",target:"SHROOMISH"})).toBe("Battle action: nothing pressed: no target matches SHROOMISH; name one of: WURMPLE (ally, screen right), ZIGZAGOON (foe, screen left).");
  expect(sim.presses).toEqual([]);
 });
 it("spread and self moves ignore a target and say so; so does a battle with one other POKéMON left",async()=>{
  const spread=new DoubleSim(doubleBase());
  expect(await call(spread,{action:"fight",move:"GROWL",target:"ZIGZAGOON"})).toBe("Battle action: chose FIGHT, then GROWL for TORCHIC; buttons pressed: A, RIGHT, A; target ignored: GROWL hits both foes; the battle menu (FIGHT, BAG, POKéMON, RUN) is open for WURMPLE; highlighted FIGHT.");
  const self=new DoubleSim(doubleBase());
  expect(await call(self,{action:"fight",move:"FOCUS ENERGY",target:"ZIGZAGOON"})).toContain("target ignored: FOCUS ENERGY acts on the user;");
  const lone=new DoubleSim(doubleBase({allyAbsent:true,foeLeftAbsent:true}));
  expect(await call(lone,{action:"fight",move:"EMBER",target:"ZIGZAGOON"})).toContain("target ignored: only one other POKéMON is in the battle, so the game picks it;");
  expect(lone.chosen).toEqual([{battler:0,slot:3,target:null}]);
  const curse=new DoubleSim(doubleBase({torchicMoves:["CURSE"]}));
  expect(await call(curse,{action:"fight",move:"CURSE",target:"ZIGZAGOON"})).toContain("target ignored: CURSE acts on the user;");
 });
 it("a target with another action is refused; a single battle ignores a target and says so",async()=>{
  expect(await call(new DoubleSim(doubleBase()),{action:"bag",target:"ZIGZAGOON"})).toBe("Battle action: nothing pressed: target goes only with action fight.");
 });
 it("an unreadable move target type in a double battle is refused before any press",async()=>{
  const sim=new DoubleSim(doubleBase({noTargets:true}));
  expect(await call(sim,{action:"fight",move:"EMBER",target:"ZIGZAGOON"})).toBe("Battle action: nothing pressed: which POKéMON EMBER can hit could not be read (no move target type in the state).");
  expect(sim.presses).toEqual([]);
 });
 it("the target cursor is checked after every press; a highlight that does not move stops the call",async()=>{
  const sim=new DoubleSim(doubleBase());
  const ports=sim.ports();
  const inner=sim.ports();
  ports.press=async(id,params,signal,check)=>{if(sim.phase==="target")sim.frozen=true;return inner.press(id,params,signal,check);};
  const text=(await battleActionTool(ports).execute("d",{action:"fight",move:"EMBER",target:"ZIGZAGOON"})).content[0];
  expect(text).toEqual({type:"text",text:"Battle action: stopped after pressing A, RIGHT, DOWN, A, RIGHT; the highlight stayed on SHROOMISH; inspect the new state."});
  expect(sim.chosen).toEqual([]);
 });
});
