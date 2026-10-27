import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {ALL_ON,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {CONTROLS,GUIDE_TYPE,GYM_BADGE,TYPE_GAP_HEADER,TypeGapTeam,gymOf,multiplier,withTypeGapTeam} from "./type-gap-team.js";

// Run 2026-10-24T19-31-52_qwen36-gpu1_d41e, seq 0-12771, state events slimmed to the fields the fold reads, every
// dialogue_auto_advance (pages slimmed) and tool_result: the RUSTBORO GYM guide's pages (seq 11692, turn 309), the
// ROXANNE battle and its whiteout (seq 12768-12771, turn 334, the result the model read at turn 335).
// The game server adds type_gap only with the switch, which d41e ran without; typeGap() rebuilds it from d41e's own
// battle RAM (TORCHIC's types [10,10] and its moves' types and power at seq 12664) and the ROM chart
// (type-chart-f3ae0881.json: pret battle_main.c gTypeEffectiveness, which env/tests/env/test_type_gap.py checks
// against ROM 0x0831ACE8 row for row).
const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/type-gap-d41e.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
const CHART=JSON.parse(readFileSync(new URL("./fixtures/type-chart-f3ae0881.json",import.meta.url),"utf8")) as NonNullable<import("./game-state.js").GameStateSnapshot["type_gap"]>["type_chart"];
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Snapshot=GameStateSnapshot;
type TypeGap=NonNullable<Snapshot["type_gap"]>;
const states=EVENTS.filter((e):e is State=>e.type==="state"&&"started" in e);
const results=EVENTS.filter((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result");

// Species and move facts as d41e's battle RAM showed them.
const SPECIES=new Map<string,[number,number]>();
const MOVES=new Map<number,{move_type:number;power:number}>();
for(const s of states)for(const b of s.battle?.battlers??[]){
 if(b.position%2===0&&b.types.length===2)SPECIES.set(b.species,[b.types[0]??0,b.types[1]??0]);
 if(b.position%2===0)for(const m of b.moves)if(m.move_type!==null&&m.power!==null)MOVES.set(m.move_id,{move_type:m.move_type,power:m.power});
}
function typeGap(party:Snapshot["party"],extra:TypeGap["party"]=[]):TypeGap {
 return {party:[...party.map((mon,slot)=>({slot,species_types:mon.species===null?null:SPECIES.get(mon.species)??null,moves:(mon.moves??[]).flatMap(m=>{const f=MOVES.get(m.move_id);return f===undefined?[]:[{move_id:m.move_id,name:m.name??null,...f}];})})),...extra],type_chart:CHART,diagnostic:null};
}
const withGap=(s:State,extra:TypeGap["party"]=[]):Snapshot=>({...s,type_gap:typeGap(s.party,extra)});
const at=(seq:number):State=>{const s=states.find(x=>x.seq===seq);if(s===undefined)throw new Error(String(seq));return s;};

// What withAppendedBlock shows: each game-tool result's block, computed on its own state once the events recorded
// before the result have been observed.
function replay(upTo:number,team=new TypeGapTeam()):{team:TypeGapTeam;shown:Map<number,string>} {
 const shown=new Map<number,string>();
 for(const e of EVENTS){
  if(e.seq>upTo)break;
  if(e.type==="tool_result"&&e.state_seq!==undefined){
   const s=states.find(x=>x.seq===e.state_seq);
   const text=s===undefined?null:team.block(withGap(s));
   if(text!==null)shown.set(e.seq,text);
  }
  team.observe(e);
 }
 return {team,shown};
}

const GUIDE_RESULT=results.find(r=>r.turn===309)?.seq??-1;
const LOSS_RESULT=12771;
export const D41E_T335_BLOCK=[
 TYPE_GAP_HEADER,
 "- RUSTBORO CITY GYM (ROXANNE not defeated): ROCK — said on RUSTBORO CITY GYM: \"ROXANNE, the GYM LEADER, is a user of ROCK-type POKéMON.\" / \"The ROCK type is very durable, but it can't stand WATER-type and GRASS-type moves.\"; met in battle: JOSH's GEODUDE ROCK/GROUND, ROXANNE's GEODUDE ROCK/GROUND",
 "  Super effective against those, per the game's type chart: WATER, GRASS, ICE, FIGHTING, GROUND, STEEL (against ROCK: WATER ×2, GRASS ×2, FIGHTING ×2, GROUND ×2, STEEL ×2; against GEODUDE ROCK/GROUND: WATER ×4, GRASS ×4, ICE ×2, FIGHTING ×2, GROUND ×2, STEEL ×2)",
 "  No party POKéMON or damaging move has: WATER, GRASS, ICE, FIGHTING, GROUND, STEEL",
 "- Your party (1 of 6): TORCHIC FIRE · damaging moves SCRATCH NORMAL, EMBER FIRE",
 // d41e's own wild battles before the loss: ZIGZAGOON, POOCHYENA (three), WURMPLE; none has a gap type.
 "- Wild POKéMON met this run with those types: none",
 "- Balls in BAG: POKé BALL ×5, GREAT BALL ×1",
 `- ${CONTROLS}`,
].join("\n");

describe("type-gap-team-v1 on d41e",()=>{
 it("shows the post-loss block on the whiteout result the model read at turn 335",()=>{
  const {shown}=replay(LOSS_RESULT);
  expect(shown.get(LOSS_RESULT)).toBe(D41E_T335_BLOCK);
 });
 it("shows the block once when the guide first names the gym's type, then not again until the loss",()=>{
  const {shown}=replay(LOSS_RESULT);
  expect([...shown.keys()]).toEqual([GUIDE_RESULT,LOSS_RESULT]);
  expect(shown.get(GUIDE_RESULT)).toContain("RUSTBORO CITY GYM (GYM LEADER not defeated): ROCK — said on RUSTBORO CITY GYM:");
  expect(shown.get(GUIDE_RESULT)).not.toContain("met in battle");
 });
 it("never lists the gym's own type and never advises",()=>{
  const gapLine=D41E_T335_BLOCK.split("\n").find(l=>l.startsWith("  No party"));
  expect(gapLine).not.toMatch(/\bROCK\b/);
  expect(D41E_T335_BLOCK).not.toMatch(/\b(?:catch|should|weaken|try|go to)\b/i);
 });
 it("drops GRASS from the gap after a GRASS POKéMON joins the party",()=>{
  const {team}=replay(LOSS_RESULT-1);
  const loss=at(12769);
  const shroomish={slot:1,species_types:[12,12] as [number,number],moves:[{move_id:71,name:"ABSORB",move_type:12,power:20}]};
  const text=team.block(withGap(loss,[shroomish]))??"";
  expect(text).toContain("  No party POKéMON or damaging move has: WATER, ICE, FIGHTING, GROUND, STEEL");
  expect(text).toContain("- Your party (2 of 6): TORCHIC FIRE · damaging moves SCRATCH NORMAL, EMBER FIRE; unknown GRASS · damaging moves ABSORB GRASS");
 });
});

// A ready wild-battle decision on ROUTE104, built from d41e's last battle state (its party and bag).
function wildDecision(species:string,types:number[],battleType=0):Snapshot {
 const base=withGap(at(12769));
 return {...base,screen:"battle",in_battle:true,location:"ROUTE104",trainer_opponent:null,battle:{...(at(12664).battle as NonNullable<State["battle"]>),ready:true,battle_type:battleType,battlers:[
  ...(at(12664).battle?.battlers??[]).filter(b=>b.position===0),
  {...(at(12664).battle?.battlers??[]).find(b=>b.position===1),species,types,moves:[{slot:0,move_id:45,name:"GROWL",pp:40,max_pp:40,move_type:0,power:0,accuracy:100,effect:18,target:8},{slot:1,move_id:55,name:"WATER GUN",pp:25,max_pp:25,move_type:11,power:40,accuracy:100,effect:0,target:0}]},
 ]}} as Snapshot;
}

describe("type-gap-team-v1 wild battle menu",()=>{
 it("shows at a wild decision whose foe has a gap type, with the foe's types and moves",()=>{
  const {team}=replay(LOSS_RESULT);
  const text=team.block(wildDecision("WINGULL",[11,2]))??"";
  expect(text).toContain("- Wild WINGULL is WATER/FLYING (its types in this battle) · moves now: GROWL NORMAL, WATER GUN WATER");
  expect(text).not.toContain("Wild POKéMON met this run");
  expect(text.split("\n").at(-1)).toBe(`- ${CONTROLS}`);
 });
 it("stays silent for a foe without a gap type, in a trainer battle and once the party has the type",()=>{
  const {team}=replay(LOSS_RESULT);
  expect(team.block(wildDecision("ZIGZAGOON",[0,0]))).toBeNull();
  // GEODUDE has GROUND, a gap type, but also ROCK, the gym's own type: never set beside the gym's facts.
  expect(team.block(wildDecision("GEODUDE",[5,4]))).toBeNull();
  expect(team.block(wildDecision("WINGULL",[11,2],1<<3))).toBeNull();
  const grass=wildDecision("SHROOMISH",[12,12]);
  expect(team.block(grass)).not.toBeNull();
  const caught={...grass,type_gap:typeGap(grass.party,[{slot:1,species_types:[12,12],moves:[]}])};
  expect(team.block(caught)).toBeNull();
 });
 it("stays silent with no gym type known, before the guide",()=>{
  const {team,shown}=replay(11691);
  expect(shown.size).toBe(0);
  expect(team.block(wildDecision("WINGULL",[11,2]))).toBeNull();
 });
 it("stays silent without the server's type_gap or a started game",()=>{
  const {team}=replay(LOSS_RESULT);
  const decision=wildDecision("WINGULL",[11,2]);
  const noGap:Snapshot={...decision};delete noGap.type_gap;
  expect(team.block(noGap)).toBeNull();
  expect(team.block({...decision,started:false})).toBeNull();
 });
});

describe("type-gap-team-v1 gym evidence",()=>{
 const page=(text:string,map:string|null,extra:object={})=>({state_seq:null,map,map_id:null,position:null,speaker:null,speaker_source:null,text,...extra});
 const talk=(seq:number,pages:object[]):RunEvent=>({v:1,run:"r",seq,t:"",type:"dialogue_auto_advance",turn:seq,tool_call_id:`c${String(seq)}`,tool:"press",requested:[],sent:[],dropped:[],pages} as unknown as RunEvent);
 const field=(seq:number,location:string,badges:string[]=[]):Snapshot=>({...withGap(at(12769)),seq,location,badges} as unknown as Snapshot);

 it("takes a type from the gym sign's \"X-loving\" only, quotes every sign whole and ignores battle pages",()=>{
  const team=new TypeGapTeam();
  team.observe(talk(1,[page("RUSTBORO CITY POKéMON GYM\nLEADER: ROXANNE","RUSTBORO CITY"),page("“The ROCK-loving honors student!”","RUSTBORO CITY")]));
  team.observe(talk(2,[page("DEWFORD TOWN POKéMON GYM\nLEADER: BRAWLY\n“A big wave in fighting!”","DEWFORD TOWN")]));
  team.observe(talk(3,[page("ROXANNE is a user of ROCK-type POKéMON.","RUSTBORO CITY GYM",{battle_message_id:4})]));
  const text=team.block(field(10,"RUSTBORO CITY"))??"";
  expect(text).toContain("- RUSTBORO CITY GYM (GYM LEADER not defeated): ROCK — sign on RUSTBORO CITY: \"RUSTBORO CITY POKéMON GYM LEADER: ROXANNE / “The ROCK-loving honors student!”\"");
  expect(text).not.toContain("DEWFORD");
  expect(text).not.toContain("said on");
  expect(team.block(field(11,"RUSTBORO CITY"))).toBeNull();
 });
 it("covers a gym by its guide on any of its floors and drops it once the badge is held",()=>{
  const team=new TypeGapTeam();
  team.observe(talk(1,[page("LAVARIDGE's GYM LEADER FLANNERY\nuses FIRE-type POKéMON.","LAVARIDGE TOWN GYM 1F"),page("LAVARIDGE's GYM LEADER FLANNERY\nuses FIRE-type POKéMON.","LAVARIDGE TOWN GYM 1F")]));
  team.observe(talk(2,[page("Going against him with NORMAL-type\nPOKéMON is asking for trouble.","DEWFORD TOWN GYM")]));
  const text=team.block(field(10,"LAVARIDGE TOWN"))??"";
  expect(text).toContain("- LAVARIDGE TOWN GYM (GYM LEADER not defeated): FIRE — said on LAVARIDGE TOWN GYM 1F: \"LAVARIDGE's GYM LEADER FLANNERY uses FIRE-type POKéMON.\"");
  expect(text).toContain("Super effective against those, per the game's type chart: WATER, GROUND, ROCK (against FIRE: WATER ×2, GROUND ×2, ROCK ×2)");
  expect(text).not.toContain("DEWFORD");
  const again=new TypeGapTeam();
  again.observe(talk(1,[page("LAVARIDGE's GYM LEADER FLANNERY uses FIRE-type POKéMON.","LAVARIDGE TOWN GYM 1F")]));
  expect(again.block(field(10,"LAVARIDGE TOWN",["HEAT"]))).toBeNull();
 });
 it("reports an unreadable type_gap as a harness bug, once per trigger",()=>{
  const team=new TypeGapTeam();
  team.observe(talk(1,[page("FORTREE GYM LEADER WINONA is\na master of FLYING-type POKéMON.","FORTREE CITY GYM")]));
  const bad={...field(10,"FORTREE CITY GYM"),type_gap:{party:[],type_chart:[],diagnostic:"harness bug: type gap: type chart has no end row"}};
  expect(team.block(bad)).toBe(`${TYPE_GAP_HEADER}\n- HARNESS BUG (type gap): harness bug: type gap: type chart has no end row`);
  expect(team.block(bad)).toBeNull();
 });
 it("lists none when the party already has every strong type, and names eggs and unread slots",()=>{
  const team=new TypeGapTeam();
  team.observe(talk(1,[page("SOOTOPOLIS's GYM LEADER JUAN is\na master of WATER-type POKéMON.","SOOTOPOLIS CITY GYM 1F")]));
  const base=field(10,"SOOTOPOLIS CITY");
  const party=[...base.party,{...base.party[0],species:null,is_egg:true},{...base.party[0],species:null}] as Snapshot["party"];
  const gap={party:[{slot:0,species_types:[12,13] as [number,number],moves:[]},{slot:1,species_types:null,moves:[]},{slot:2,species_types:null,moves:[{move_id:999,name:null,move_type:11,power:40}]}],type_chart:CHART,diagnostic:null};
  const text=team.block({...base,party,type_gap:gap})??"";
  expect(text).toContain("  No party POKéMON or damaging move has: none");
  expect(text).toContain("- Your party (3 of 6): TORCHIC GRASS/ELECTRIC · damaging moves none; EGG types not read · damaging moves none; unknown types not read · damaging moves move 999 WATER");
  expect(text).toContain("- Wild POKéMON met this run with those types: none");
  expect(text).toContain("- Balls in BAG: POKé BALL ×5, GREAT BALL ×1");
  expect(team.block({...base,party,type_gap:gap,resources:null})).toBeNull();
 });
 it("counts each wild species' battles with its first and latest turn, not every turn",()=>{
  const team=new TypeGapTeam();
  const wild=(seq:number,turn:number,inBattle:boolean)=>({...wildDecision("SHROOMISH",[12,12]),seq,turn,type:"state",in_battle:inBattle,screen:inBattle?"battle":"overworld"} as unknown as RunEvent);
  for(const [seq,turn,b] of [[1,10,true],[2,11,true],[3,12,false],[4,40,true],[5,41,false]] as const)team.observe(wild(seq,turn,b));
  team.observe(talk(6,[page("ROXANNE, the GYM LEADER, is a user\nof ROCK-type POKéMON.","RUSTBORO CITY GYM")]));
  expect(team.block(field(10,"RUSTBORO CITY GYM"))).toContain("- Wild POKéMON met this run with those types: SHROOMISH GRASS on ROUTE104 (2 battles, turns 10 to 40)");
  const once=new TypeGapTeam();
  once.observe(wild(1,10,true));
  once.observe(talk(6,[page("ROXANNE, the GYM LEADER, is a user\nof ROCK-type POKéMON.","RUSTBORO CITY GYM")]));
  expect(once.block(field(10,"RUSTBORO CITY GYM"))).toContain("SHROOMISH GRASS on ROUTE104 (1 battle, turn 10)");
  // A GEODUDE (ROCK/GROUND) met before the ROCK guide is never listed, though GROUND is a gap type.
  const rock=new TypeGapTeam();
  rock.observe({...wildDecision("GEODUDE",[5,4]),seq:1,turn:10,type:"state"} as unknown as RunEvent);
  rock.observe(talk(6,[page("ROXANNE, the GYM LEADER, is a user\nof ROCK-type POKéMON.","RUSTBORO CITY GYM")]));
  const text=rock.block(field(10,"RUSTBORO CITY GYM"))??"";
  expect(text).toContain("- Wild POKéMON met this run with those types: none");
  expect(text).not.toContain("GEODUDE ROCK/GROUND on");
 });
 it("takes a gym's own type from the types all its battle POKéMON share when nothing was said",()=>{
  const team=new TypeGapTeam();
  team.observe(at(12664));
  const text=team.block(wildDecision("SANDSHREW",[4,4]))??"";
  expect(text).toBe("");
 });
 it("names an unnamed gym trainer and lists no balls when the pocket is empty",()=>{
  const team=new TypeGapTeam();
  const fight={...at(12664),seq:1,trainer_opponent:{trainer_id:1,trainer_class:5,name:null,defeated:false,battle_active:true}} as State;
  team.observe(fight);
  const text=team.block({...field(10,"RUSTBORO CITY GYM"),resources:{...at(12769).resources,bag:[]}} as Snapshot)??"";
  expect(text).toContain("met in battle: a trainer (name not read)'s GEODUDE ROCK/GROUND");
  expect(text).toContain("- Balls in BAG: none");
 });
 it("does not flag a win as a loss before the badge flag is set",()=>{
  const team=new TypeGapTeam();
  team.observe(at(12664));
  expect(team.block(field(10,"RUSTBORO CITY GYM"))).not.toBeNull();
  // The first field state after a win: ROXANNE's trainer flag is set, the STONE BADGE not yet.
  const won={...at(12769),location:"RUSTBORO CITY GYM",trainer_opponent:{trainer_id:265,trainer_class:32,name:"ROXANNE",defeated:true,battle_active:false}};
  team.observe(won);
  expect(team.block(withGap(won))).toBeNull();
 });
 it("drops a gym whose leader the run just beat when that battle was the first evidence, before the badge flag",()=>{
  const team=new TypeGapTeam();
  team.observe(at(12664));
  const won={...at(12769),location:"RUSTBORO CITY GYM",trainer_opponent:{trainer_id:265,trainer_class:32,name:"ROXANNE",defeated:true,battle_active:false}};
  team.observe(won);
  expect(team.block(withGap(won))).toBeNull();
 });
 it("does not flag a loss after the leader is beaten",()=>{
  const team=new TypeGapTeam();
  team.observe(at(12664));
  expect(team.block(field(10,"RUSTBORO CITY GYM"))).not.toBeNull();
  team.observe({...at(12769),badges:["STONE"]});
  expect(team.block(field(11,"RUSTBORO CITY GYM",["STONE"]))).toBeNull();
 });
});

describe("type-gap-team-v1 helpers",()=>{
 it("multiplies per defending type, ignores the Foresight row and counts a missing row as ×1",()=>{
  expect(multiplier(CHART,11,[5,4])).toBe(4);
  expect(multiplier(CHART,0,[7])).toBe(0);
  expect(multiplier(CHART,254,[254])).toBe(1);
  expect(multiplier(CHART,12,[12,12])).toBe(0.5);
 });
 it("matches only the ROM guides' sentence patterns",()=>{
  expect(GUIDE_TYPE.exec("The GYM LEADERS here use PSYCHIC-type POKéMON.")?.[1]).toBe("PSYCHIC");
  expect(GUIDE_TYPE.exec("If you challenge him with WATER-type POKéMON, he'll zap them! Bzzt!")).toBeNull();
  expect(gymOf("SOOTOPOLIS CITY GYM B1F")).toBe("SOOTOPOLIS CITY GYM");
  expect(gymOf("RUSTBORO CITY")).toBeNull();
  expect(gymOf(null)).toBeNull();
  expect(Object.keys(GYM_BADGE)).toHaveLength(8);
 });
});

describe("type-gap-team-v1 wiring",()=>{
 const stateBody=withGap(at(12769));
 const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"readout"}],details:{state:stateBody}})};
 const recorder=()=>{const subs:((e:RunEvent)=>void)[]=[];return {subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);},emit:(e:RunEvent)=>{for(const f of subs)f(e);}};};
 const run=async(features:FeatureSet):Promise<AgentToolResult<unknown>>=>{
  const r=recorder();
  const [tool]=withTypeGapTeam([observe],features,r);
  for(const e of EVENTS)if(e.seq<LOSS_RESULT)r.emit(e);
  if(tool===undefined)throw new Error("tool");
  return tool.execute("id",{},undefined,undefined);
 };
 it("OFF hands back the same tools and today's result bytes",async()=>{
  const off={...ALL_ON,"type-gap-team-v1":false};
  expect(withTypeGapTeam([observe],off,recorder())[0]).toBe(observe);
  expect(JSON.stringify(await run(off))).toBe(JSON.stringify(await observe.execute("id",{},undefined,undefined)));
 });
 it("ON appends the block after the readout",async()=>{
  const result=await run({...ALL_ON,"type-gap-team-v1":true});
  expect(result.content).toEqual([{type:"text",text:"readout"},{type:"text",text:D41E_T335_BLOCK}]);
 });
 it("parses the server's type_gap and rejects a malformed one",()=>{
  const body={...IN_GAME,type_gap:typeGap(at(12769).party)};
  expect(parseGameState(body).type_gap?.party[0]?.species_types).toEqual([10,10]);
  expect(()=>parseGameState({...body,type_gap:{party:[],type_chart:[[0,0,30]],diagnostic:null}})).toThrow();
  expect(()=>parseGameState({...body,type_gap:{party:[],type_chart:[[18,253,7]],diagnostic:null}})).toThrow();
  expect(()=>parseGameState({...body,type_gap:{party:[],type_chart:[[0,5,7]],diagnostic:null}})).toThrow();
  expect(parseGameState({...body,type_gap:{party:[],type_chart:[[254,254,0],[0,7,0]],diagnostic:null}}).type_gap?.type_chart).toHaveLength(2);
 });
});
