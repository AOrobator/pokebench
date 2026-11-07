import {describe,expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {ALL_ON,type FeatureSet,featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES} from "./features.js";
import {ALL_TOOL_SWITCHES,gameTools,type ToolSwitches} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {DASH_TIMING,MACH_DASH_ID,MACH_DASH_SECTION,MAX_DASH_BEATS,SETTLE_STEPS,SETTLE_TIMING,TURN_TIMING,dashReport,parseDash,withMachDash} from "./mach-dash.js";
import {jitTools,playSystemPrompt,playTools,stableJitPrompts} from "./play-config.js";
import {normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";
import {rayquazaLaneFeatures} from "../test-support/rayquaza-lane.js";

const ALL_OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const running={permitted:false,controllable:true,reason:"not_on_foot",shoes:true,allow_running:true,avatar_flags:0x22,metatile:0,elevation:3,map_type:4,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
const FLOOR2:readonly [number,number]=[24,80],FLOOR1:readonly [number,number]=[24,79],FLOOR3:readonly [number,number]=[24,81];
const field=(over:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,location:"SKY PILLAR 2F",map_id:[...FLOOR2] as [number,number],position:{x:10,y:2},facing:"down",running,...over});
const onFoot={...running,avatar_flags:0x21,reason:"permitted"};
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
interface Post {readonly buttons:readonly string[];readonly hold_frames:number;readonly release_frames:number}
// In-memory game server: script[n] is the state after the n-th /action POST.
function harness(start:GameStateSnapshot,script:readonly GameStateSnapshot[]=[],switches:ToolSwitches=ALL_TOOL_SWITCHES){
 let current=start;const posts:Post[]=[],recorded:{buttons:readonly string[];hold:number|undefined;release:number|undefined}[]=[];let after=0;
 const fetchFn:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(!url.endsWith("/action"))throw new Error(`unexpected POST ${url}`);
   if(typeof init.body!=="string")throw new Error("missing body");
   posts.push(JSON.parse(init.body) as Post);current=script[posts.length-1]??current;body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const base=gameTools("http://test",{beforePress:(_id,buttons,timing)=>{recorded.push({buttons:[...buttons],hold:timing.hold_frames,release:timing.release_frames});},afterPress:()=>{after+=1;return Promise.resolve();}},fetchFn,switches,{now:()=>0,sleep:()=>Promise.resolve()});
 const tools=withMachDash(base,{...ALL_ON,[MACH_DASH_ID]:true},{read:()=>Promise.resolve(current)});
 const dash=tools.find(t=>t.name==="mach_dash");if(dash===undefined)throw new Error("no mach_dash");
 return {dash,posts,recorded,afterPresses:()=>after};
}
const text=(r:{content:readonly {type:string;text?:string}[]}):string=>r.content.flatMap(p=>p.type==="text"&&p.text!==undefined?[p.text]:[]).join("\n");
const run=(tool:AgentTool,route:string)=>tool.execute("call",{route});
const ROUTE="D1 R4 D11 L10 U4 R2 U8";
const landed=field({location:"SKY PILLAR 3F",map_id:[...FLOOR3] as [number,number],position:{x:3,y:2}});

describe("parseDash",()=>{
 it("expands the guide's compact form into one entry per beat, in order",()=>{
  const parsed=parseDash("D1 R2 U L3");
  expect(parsed).toEqual({ok:true,buttons:["DOWN","RIGHT","RIGHT","UP","LEFT","LEFT","LEFT"]});
 });
 it("counts the verified 2F route as 40 beats",()=>{
  const parsed=parseDash(ROUTE);
  expect(parsed.ok&&parsed.buttons.length).toBe(40);
 });
 it.each(["","   ","D0","X3","D1,R2","d1","D-1","R2 up","D1.5"])("refuses %j",route=>{expect(parseDash(route).ok).toBe(false);});
 it("refuses a route over the cap and takes one at the cap",()=>{
  expect(parseDash(`D${String(MAX_DASH_BEATS)}`).ok).toBe(true);
  expect(parseDash(`D${String(MAX_DASH_BEATS)} R1`).ok).toBe(false);
 });
});

describe("mach_dash refusals press nothing",()=>{
 it.each([
  ["on foot",field({running:onFoot}),"not riding the MACH BIKE"],
  ["on the ACRO BIKE",field({running:{...running,avatar_flags:0x24}}),"not riding the MACH BIKE"],
  ["in a battle",field({in_battle:true}),"not on the field"],
  ["in a menu",field({screen:"menu"}),"not on the field"],
  ["with field controls locked",field({field_controls_locked:true}),"not on the field"],
  ["with no running state",field({running:null}),"not on the field"],
 ])("%s",async(_label,state,words)=>{
  const h=harness(state);
  const result=await run(h.dash,ROUTE);
  expect(text(result)).toContain(words);
  expect(text(result)).toContain("Nothing was pressed");
  expect(h.posts).toEqual([]);
  expect(h.recorded).toEqual([]);
 });
 it("a bad route is refused with its form",async()=>{
  const h=harness(field());
  const result=await run(h.dash,"down 3");
  expect(text(result)).toContain("D1 R4 D11");
  expect(h.posts).toEqual([]);
 });
 it("an aborted run presses nothing",async()=>{
  const h=harness(field());
  const controller=new AbortController();controller.abort();
  await expect(h.dash.execute("call",{route:ROUTE},controller.signal)).rejects.toThrow();
  expect(h.posts).toEqual([]);
 });
});

describe("mach_dash sends the route",()=>{
 it("already facing the first direction: the whole list in one POST at 4 frames an entry with no gap",async()=>{
  const h=harness(field(),[landed,landed,landed]);
  await run(h.dash,ROUTE);
  const [list]=h.posts;
  expect(list?.buttons).toHaveLength(40);
  expect(list?.buttons.slice(0,6)).toEqual(["DOWN","RIGHT","RIGHT","RIGHT","RIGHT","DOWN"]);
  expect(list).toMatchObject(DASH_TIMING);
  expect(DASH_TIMING).toEqual({hold_frames:3,release_frames:0});
 });
 it("records the list as sent, beside the settle presses",async()=>{
  const h=harness(field(),[landed,landed,landed]);
  await run(h.dash,ROUTE);
  expect(h.recorded[0]).toEqual({buttons:h.posts[0]?.buttons,hold:3,release:0});
  expect(h.recorded.slice(1).every(r=>r.buttons.join()==="B")).toBe(true);
  expect(h.afterPresses()).toBe(h.posts.length);
 });
 it("facing the wrong way: turns first, reads the turn back, then sends the list",async()=>{
  const turned=field({facing:"right"});
  const h=harness(field({facing:"up"}),[turned,landed,landed,landed]);
  const result=await run(h.dash,"R4 D11");
  expect(h.posts[0]).toEqual({buttons:["RIGHT"],...TURN_TIMING});
  expect(h.posts[1]?.buttons).toHaveLength(15);
  expect(text(result)).toContain("Turned the bike RIGHT");
 });
 it("a turn that moved the bike stops before the list",async()=>{
  const moved=field({facing:"right",position:{x:11,y:2}});
  const h=harness(field({facing:"up"}),[moved]);
  const result=await run(h.dash,"R4 D11");
  expect(h.posts).toHaveLength(1);
  expect(text(result)).toContain("The route was not sent");
 });
 it("a turn that did not take stops before the list",async()=>{
  const h=harness(field({facing:"up"}),[field({facing:"up"})]);
  const result=await run(h.dash,"R4 D11");
  expect(h.posts).toHaveLength(1);
  expect(text(result)).toContain("The route was not sent");
 });
 it("is not cut by the press guards that limit direction batches",async()=>{
  const h=harness(field(),[landed,landed,landed],{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true,safeInterfaces:true,rejectedMovementStep:true});
  await run(h.dash,ROUTE);
  expect(h.posts[0]?.buttons).toHaveLength(40);
 });
});

describe("mach_dash settles in emulated frames",()=>{
 it("stops once the same free tile reads twice",async()=>{
  const h=harness(field(),[landed,landed,landed,landed,landed,landed]);
  await run(h.dash,ROUTE);
  expect(h.posts).toHaveLength(2);
  expect(h.posts.slice(1).every(p=>p.buttons.join()==="B"&&p.hold_frames===SETTLE_TIMING.hold_frames&&p.release_frames===SETTLE_TIMING.release_frames)).toBe(true);
 });
 it("waits out a fall: control held by the script, then the floor below",async()=>{
  const locked=field({field_controls_locked:true,running:{...running,controllable:false,reason:"forced_or_transitioning"}});
  const fell=field({location:"SKY PILLAR 1F",map_id:[...FLOOR1] as [number,number],position:{x:10,y:5},running:onFoot});
  const h=harness(field(),[locked,locked,locked,locked,fell,fell]);
  const result=await run(h.dash,ROUTE);
  expect(h.posts).toHaveLength(6);
  expect(text(result)).toContain("fell through the floor from SKY PILLAR 2F to SKY PILLAR 1F");
  expect(text(result)).toContain("(10,5)");
  expect(text(result)).toContain("off the bike");
 });
 it("stops pressing as soon as a battle starts",async()=>{
  const battle=field({in_battle:true,screen:"battle"});
  const h=harness(field(),[field({position:{x:10,y:9}}),battle]);
  const result=await run(h.dash,ROUTE);
  expect(h.posts).toHaveLength(2);
  expect(text(result)).toContain("A battle started");
 });
 it("a battle's opening transition, with no map or tile to read, is a battle and not a fall",async()=>{
  const transition=field({in_battle:false,screen:"battle_transition",map_id:null,position:null,location:null,running:null});
  const h=harness(field(),[field({position:{x:10,y:9}}),transition]);
  const result=await run(h.dash,ROUTE);
  expect(h.posts).toHaveLength(2);
  expect(text(result)).toContain("A battle started");
  expect(text(result)).not.toContain("fell");
 });
 it("says so when control never comes back inside the bound",async()=>{
  const locked=field({field_controls_locked:true});
  const h=harness(field(),Array.from({length:40},()=>locked));
  const result=await run(h.dash,ROUTE);
  expect(h.posts).toHaveLength(1+SETTLE_STEPS);
  expect(text(result)).toContain("has not returned control");
 });
});

describe("dashReport",()=>{
 const before=field();
 it("a door on the bike is not a fall",()=>{
  const report=dashReport(before,landed,40);
  expect(report).toContain("SKY PILLAR 3F at (3,2)");
  expect(report).toContain("still on the MACH BIKE");
  expect(report).not.toContain("fell");
 });
 it("stairs onto a map without cycling are not a fall, though they leave you on foot",()=>{
  const top=field({location:"SKY PILLAR TOP",map_id:[24,85],position:{x:16,y:15},running:onFoot,bike:{owned:[259],registered:259,riding:null,allow_cycling:false}});
  const report=dashReport(before,top,46);
  expect(report).toContain("SKY PILLAR TOP at (16,15), off the bike");
  expect(report).not.toContain("fell");
 });
 it("a stop on the same floor names the tile",()=>{
  expect(dashReport(before,field({position:{x:13,y:3}}),12)).toContain("SKY PILLAR 2F at (13,3)");
 });
 it("uses the displayed place name when the readout has one",()=>{
  expect(dashReport(before,{...landed,location_display:"SKY PILLAR 3F (shown)"},40)).toContain("SKY PILLAR 3F (shown)");
 });
 it("says what it sent",()=>{expect(dashReport(before,landed,40)).toContain("40 beats (160 frames)");});
});

describe("rq-mach-dash-v1 switch",()=>{
 const ON=rayquazaLaneFeatures(),OFF={...ON,[MACH_DASH_ID]:false};
 it("is registered after the checkpoint switch, default off, with its OFF state in its copy",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(MACH_DASH_ID)).toBe(SWITCHABLE_FEATURES.indexOf("rq-checkpoint-recovery-v1")+1);
  expect(featureInfo(MACH_DASH_ID).description).toContain(" Off: ");
  expect(featureInfo(MACH_DASH_ID).needs).toBeNull();
  expect(SERVER_FEATURES).not.toContain(MACH_DASH_ID);
  const {[MACH_DASH_ID]:omitted,...old}=normalizeFeatures({...ALL_ON,[MACH_DASH_ID]:false});
  expect(omitted).toBe(false);
  expect(normalizeFeatures(old)[MACH_DASH_ID]).toBe(false);
  expect(playHarnessFeatures(ON,null)).toContain(MACH_DASH_ID);
  expect(playHarnessFeatures(OFF,null)).not.toContain(MACH_DASH_ID);
 });
 it("is on in the Rayquaza lane",()=>{expect(ON[MACH_DASH_ID]).toBe(true);});
 it("OFF: no tool, and the prompts are the prompts without the section",()=>{
  expect(playTools(OFF)).not.toContain("mach_dash");
  expect(playTools(ON).filter(name=>name!=="mach_dash")).toEqual(playTools(OFF));
  const off=playSystemPrompt(OFF,null);
  expect(off).not.toContain("mach_dash");
  expect(playSystemPrompt(ON,null).replace(`\n\n${MACH_DASH_SECTION}`,"")).toBe(off);
  for(const scene of ["overworld","battle","menu","naming","clock"] as const){
   const on=stableJitPrompts(ON,null,scene),without=stableJitPrompts(OFF,null,scene);
   expect(on.core).toBe(without.core);
   expect(on.guidance.replace(`\n\n${MACH_DASH_SECTION}`,"").replace(MACH_DASH_SECTION,"")).toBe(without.guidance);
  }
 });
 it("ON: the overworld prompt names the tool; other scenes neither offer nor name it",()=>{
  expect(playTools(ON)).toContain("mach_dash");
  expect(playSystemPrompt(ON,null)).toContain(MACH_DASH_SECTION);
  expect(stableJitPrompts(ON,null,"overworld").guidance).toContain("- mach_dash:");
  const tools=playTools(ON).map(name=>({name}));
  expect(jitTools(tools,"overworld").map(t=>t.name)).toContain("mach_dash");
  for(const scene of ["battle","menu","naming","clock"] as const){
   expect(jitTools(tools,scene).map(t=>t.name)).not.toContain("mach_dash");
   expect(stableJitPrompts(ON,null,scene).guidance).not.toContain("mach_dash");
  }
 });
 it("factory: playGameTools offers the tool only with the switch on",()=>{
  const names=(on:boolean):string[]=>{
   const features={...ALL_OFF,[MACH_DASH_ID]:on};
   const rec={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined};
   const base=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()});
   return playGameTools(base,features,{read:()=>Promise.reject(new Error("unused"))},rec as never).map(t=>t.name);
  };
  expect(names(true)).toContain("mach_dash");
  expect(names(false)).not.toContain("mach_dash");
  expect(names(true).filter(name=>name!=="mach_dash")).toEqual(names(false));
 });
 it("withMachDash adds nothing when off",()=>{
  const base=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()});
  const tools=withMachDash(base,OFF,{read:()=>Promise.reject(new Error("unused"))});
  expect(tools.map(t=>t.name)).toEqual(base.map(t=>t.name));
 });
});
