import {describe,expect,it,vi} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {ALL_TOOL_SWITCHES,pressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {toolSwitches} from "./play-config.js";



import type {GameStateSnapshot} from "./game-state.js";

const field:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",map_id:[0,16],location:"ROUTE101",position:{x:10,y:7},in_battle:false,active_ui:null,field_controls_locked:false,world_context:null,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null}};
const text=(result:{content:readonly {type:string;text?:string}[]})=>result.content.flatMap(c=>c.type==="text"?[c.text??""]:[]).join("\n");
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
const clock={now:()=>0,sleep:()=>Promise.resolve()};
function server(state:GameStateSnapshot){
 const posts:string[]=[];
 const fetchFn=vi.fn<typeof fetch>(async(input,init)=>{
  const url=String(input);if(init?.method==="POST")posts.push(url);
  const body=url.endsWith("/pokebench/state")?state:url.endsWith("/observation")?{state,state_text:"field",screenshot_base64:png.toString("base64")}:url.endsWith("/queue_status")?{queue_empty:true}:{status:"success"};
  return new Response(JSON.stringify(body));
 });return {fetchFn,posts};
}
describe("navigation tool-use guard at the native input boundary",()=>{
 it("rejects a model walking batch before native input, with state and requested/zero-submitted receipt",async()=>{
  const s=server(field),before=vi.fn();
  const tool=pressTool("http://game",{beforePress:before,afterPress:()=>Promise.resolve()},s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true});
  const result=await tool.execute("model",{buttons:["RIGHT","UP","UP"]});
  expect(s.posts).toEqual([]);expect(before).not.toHaveBeenCalled();
  expect(text(result)).toContain("Navigation tool-use guard");expect(text(result)).toContain('"submitted":[]');expect(text(result)).toContain('"requested":["RIGHT","UP","UP"]');
  expect(result.details.state).toMatchObject({map_id:[0,16],position:{x:10,y:7}});
 });
 it("wires the guard separately from the semantic feedback switch",()=>{
  const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(toolSwitches({...f,"navigation-tool-use-guard-v1":true})).toMatchObject({navigationToolUseGuard:true});
  expect(toolSwitches(f)).not.toHaveProperty("navigationToolUseGuard");
 });
 it("keeps internal checked navigation inputs available",async()=>{
  const s=server(field),tool=pressTool("http://game",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},s.fetchFn,clock,{...ALL_TOOL_SWITCHES,navigationToolUseGuard:true});
  await tool.executeChecked("navigation",{buttons:["UP","UP"]},()=>undefined);
  expect(s.posts).toHaveLength(1);
 });
});
