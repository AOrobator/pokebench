import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {RunLog} from "./run-log.js";
import {RunRecorder} from "./recorder.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";
import {expect,it} from "vitest";
import {withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES,type PressModifiers} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import type {StridePlan,StrideReceipt} from "./stride.js";
const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
const initial:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},facing:"down",running,map_grid:{elevation:3,width:12,height:6,rows:Array.from({length:6},()=>"0300".repeat(12)),objects:[],warps:[]},navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:0,elevation:3})),objects:[],warps:[]}};
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
async function invoke(on:boolean,options:{badReceipt?:boolean;interrupted?:boolean;changed?:boolean}={}){
 let current=initial,reads=0;const posts:{url:string;body:unknown}[]=[],plans:StridePlan[]=[],modifiers:PressModifiers[]=[],receipts=new Map<string,StrideReceipt>();
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(url.endsWith("/pokebench/state")){reads++;if(options.changed&&reads>0)current={...current,running:{...running,controllable:false}};body=current;}
  else if(init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Missing body");const p:unknown=JSON.parse(init.body);posts.push({url,body:p});
   if(url.endsWith("/stride")){const plan=p as StridePlan&{automatic_running:boolean};plans.push(plan);const end=plan.path.at(-1);if(end===undefined)throw new Error("Empty stride");current={...current,position:end};receipts.set(plan.id,{...plan,completed:options.interrupted?0:plan.path.length,frames:32,reason:options.interrupted?"corridor changed or unsafe":"completed",stopped:true});}
   else{const buttons=(p as {buttons:string[]}).buttons;const d=buttons[0];const a=current.position;if(a===null)throw new Error("Missing position");current={...current,position:{x:a.x+(d==="RIGHT"?2:d==="LEFT"?-2:0),y:a.y+(d==="DOWN"?2:d==="UP"?-2:0)}};}
   body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.includes("/pokebench/stride/")){const receipt=receipts.get(url.split("/").at(-1)??"");body=options.badReceipt?{...receipt,path:[]} : receipt;}
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const root=mkdtempSync(join(tmpdir(),"nav-stride-"));
 const log=RunLog.create(root,"stride-caller"),recorder=new RunRecorder({log,frames:new FrameStore(root),gameState:{read:()=>Promise.resolve(current)},milestones:{poll:()=>Promise.resolve([])}});await recorder.start(RUN_START_META,false);
 const tools=gameTools("http://test",{beforePress:(_id,_buttons,_timing,_before,m)=>{recorder.buttonPress(_id,_buttons,_timing,_before,m);if(m)modifiers.push(m);},afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:true},{now:()=>0,sleep:()=>Promise.resolve()});
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":true,"automatic-running-v1":true,"safe-navigation-strides-v1":on};
 const nav=withNavigation(tools,features,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 try {
 await recorder.emit({type:"tool_execution_start",toolCallId:"nav",toolName:"navigate_to",args:{x:8,y:4,map_id:[0,9]}});
 const result=await nav.execute("nav",{x:8,y:4,map_id:[0,9]});
 await recorder.emit({type:"tool_execution_end",toolCallId:"nav",toolName:"navigate_to",result,isError:false});
 const recorded=readFileSync(log.eventsPath,"utf8");return {result,posts,plans,modifiers,current,recorded};
 } finally {rmSync(root,{recursive:true,force:true});}
}
it("factory OFF keeps incumbent running displacement rejection, ON finishes a long route in bounded corridors",async()=>{
 const off=await invoke(false);expect(off.posts).toHaveLength(1);expect(off.posts[0]?.url).toBe("http://test/pokebench/travel");expect(JSON.stringify(off.result)).toContain("unexpected movement");expect(off.modifiers[0]?.stride).toBeUndefined();
 const on=await invoke(true);expect(on.current.position).toEqual({x:8,y:4});expect(on.posts.every(p=>p.url.endsWith("/stride"))).toBe(true);expect(on.plans.map(p=>p.path.length)).toEqual([4,8]);expect(on.modifiers.map(m=>m.stride?.path)).toEqual(on.plans.map(plan=>plan.path));expect(JSON.stringify(on.result)).toContain("arrived at requested coordinate");
 const text=on.result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");expect(text.match(/Navigation stride receipt:/g)).toHaveLength(2);expect(text).toContain('"completed":8');expect(on.plans.every(p=>p.path.length<=8)).toBe(true);
 expect(on.recorded).toContain('"stride":{');expect(off.recorded).not.toContain('"stride":{');
 const recordedResults=on.recorded.trim().split("\n").map(line=>JSON.parse(line) as {type:string;text?:string});expect(recordedResults.find(r=>r.type==="tool_result")?.text).toContain('"completed":8');
});
it("production caller refuses changed native control before submitting a stride",async()=>{
 const result=await invoke(true,{changed:true});expect(result.posts).toHaveLength(0);expect(JSON.stringify(result.result)).toContain("before action");
});
it("does not continue after a terminal partial stride or accept a mismatched receipt",async()=>{
 const partial=await invoke(true,{interrupted:true});expect(partial.posts).toHaveLength(1);expect(JSON.stringify(partial.result)).toContain("corridor changed or unsafe");
 await expect(invoke(true,{badReceipt:true})).rejects.toThrow("matching terminal receipt");
});
