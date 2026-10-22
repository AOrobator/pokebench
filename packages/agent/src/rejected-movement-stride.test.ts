import {expect,it,vi} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {pressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {toolSwitches} from "./play-config.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {StridePlan} from "./stride.js";
const tiles=Array.from({length:9},(_,x)=>({x,y:0,collision:0,behavior:0,elevation:3}));
const field:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},navigation_grid:{elevation:3,tiles,objects:[],warps:[]},world_context:null,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null}};
const urlOf=(input:Parameters<typeof fetch>[0])=>typeof input==="string"?input:input instanceof URL?input.href:input.url;
const grid=field.navigation_grid;if(grid==null)throw new Error("missing grid");
const features=()=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"navigation-tool-use-guard-v1":true,"safe-navigation-strides-v1":true,"rejected-movement-step-v1":true,"rejected-movement-stride-v1":true});
function server(initial=field,completed?:number){
 let state=initial,plan:StridePlan|undefined;
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{
 const url=urlOf(input);let body:unknown={status:"success"};
 if(init?.method==="POST"&&url.endsWith("/pokebench/stride")){plan=JSON.parse(typeof init.body==="string"?init.body:"null") as StridePlan;state={...state,position:plan.path[(completed??plan.path.length)-1]??plan.origin};}
 if(url.endsWith("/pokebench/state"))body=state;
 else if(url.endsWith("/pokebench/observation"))body={state,state_text:"field",screenshot_base64:png.toString("base64")};
 else if(url.endsWith("/queue_status"))body={queue_empty:true};
 else if(url.includes("/pokebench/stride/")&&plan!==undefined)body={...plan,automatic_running:false,completed:completed??plan.path.length,frames:20,reason:completed===undefined?"completed":"battle",stopped:true};
 return Promise.resolve(new Response(JSON.stringify(body)));
 });
 const hooks={beforePress:vi.fn(),afterPress:()=>Promise.resolve()};
 return {fetchFn,hooks,posts:()=>fetchFn.mock.calls.filter(([,init])=>init?.method==="POST").map(([url,init])=>({url:urlOf(url),body:JSON.parse(typeof init?.body==="string"?init.body:"null") as unknown}))};
}
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.map(c=>c.text??"").join("\n");
it("production switch replaces the one-step fallback with one checked requested straight prefix",async()=>{
 const s=server();const result=await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches(features())).execute("model",{buttons:["RIGHT","RIGHT","RIGHT","UP","LEFT"]});
 expect(s.posts()).toMatchObject([{url:"http://game/pokebench/stride",body:{origin:{x:0,y:0},path:[{x:1,y:0},{x:2,y:0},{x:3,y:0}],automatic_running:false}}]);
 expect(text(result)).toContain('"submitted":["RIGHT","RIGHT","RIGHT"]');expect(text(result)).toContain('"dropped":["UP","LEFT"]');
 expect(result.details).toMatchObject({state:{position:{x:3,y:0}}});
});
it("OFF is byte-identical to the incumbent one-step fallback",async()=>{
 const run=async(enabled?:boolean)=>{const s=server();const f=features();const result=await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches({...f,"rejected-movement-stride-v1":enabled??false})).execute("m",{buttons:["RIGHT","RIGHT"]});return {result,posts:s.posts(),hooks:s.hooks.beforePress.mock.calls};};
 expect(await run(false)).toEqual(await run());
});
it.each(["grass","object","warp","trigger","elevation","missing"])("ends the prefix before %s and discards the remainder",async hazard=>{
 const state:GameStateSnapshot={...field,navigation_grid:{...grid,tiles:tiles.filter(t=>hazard!=="missing"||t.x!==2).map(t=>t.x===2?{...t,behavior:hazard==="grass"?2:t.behavior,elevation:hazard==="elevation"?4:t.elevation}:t),objects:hazard==="object"?[{x:2,y:0}]:[],warps:hazard==="warp"?[{x:2,y:0}]:[]},world_context:hazard==="trigger"?{objects:[],triggers:[{x:2,y:0,elevation:3,variable:1,required_value:0,current_value:0,condition_met:true,script_pointer:1}],dialogue:null}:null};
 const s=server(state);const result=await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches(features())).execute("m",{buttons:["RIGHT","RIGHT","RIGHT"]});
 expect(s.posts()).toMatchObject([{body:{path:[{x:1,y:0}]}}]);expect(text(result)).toContain('"dropped":["RIGHT","RIGHT"]');
});
it("unknown geometry sends no inputs even if the old single-step fallback is ON",async()=>{
 const s=server({...field,navigation_grid:null});const result=await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches(features())).execute("m",{buttons:["RIGHT","RIGHT"]});
 expect(s.posts()).toEqual([]);expect(text(result)).toContain('"submitted":[]');expect(text(result)).toContain('"dropped":["RIGHT","RIGHT"]');
});
it("returns the terminal interrupted receipt without submitting the rest again",async()=>{
 const s=server(field,1);const result=await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches(features())).execute("m",{buttons:["RIGHT","RIGHT","RIGHT"]});
 expect(s.posts()).toHaveLength(1);expect(text(result)).toContain('"completed":1');expect(text(result)).toContain('"reason":"battle"');
});
it("the new treatment is inert when the original guard is OFF",async()=>{
 const s=server();await pressTool("http://game",s.hooks,s.fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches({...features(),"navigation-tool-use-guard-v1":false})).execute("m",{buttons:["RIGHT","RIGHT"]});expect(s.posts()).toMatchObject([{url:"http://game/action",body:{buttons:["RIGHT","RIGHT"]}}]);
});

it("registers default OFF with an unqueued single-feature experiment",async()=>{
 const {readFileSync}=await import("node:fs");const {parseExperiment,experimentArms}=await import("./experiments.js");const {normalizeFeatures}=await import("./play-preset.js");const {ALL_ON,featureInfo,SWITCHABLE_FEATURES}=await import("./features.js");
 const {"rejected-movement-stride-v1":_enabled,...old}=ALL_ON;expect(_enabled).toBe(true);expect(normalizeFeatures(old)["rejected-movement-stride-v1"]).toBe(false);
 expect(featureInfo("rejected-movement-stride-v1").needs).toBe("safe-navigation-strides-v1");
 const entry=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/rejected-movement-stride-v1.json",import.meta.url),"utf8")) as unknown);expect(entry.queuePosition).toBeUndefined();
 const arms=experimentArms(entry);expect(SWITCHABLE_FEATURES.filter(id=>id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&arms.incumbent.features[id]!==arms.candidate.features[id])).toEqual(["rejected-movement-stride-v1"]);
});
