import {expect,it} from "vitest";
import {planStride,withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES} from "./game-tools.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {StrideReceiptSchema,type StridePlan} from "./stride.js";
import {Value} from "typebox/value";
const ID="grass-strides-v1";
const TALL_GRASS=2,LONG_GRASS=3;
const row=(behavior:(x:number)=>number)=>Array.from({length:12},(_,x)=>({x,y:0,collision:0,behavior:behavior(x),elevation:3}));
const grid=(behavior:(x:number)=>number)=>({elevation:3,tiles:row(behavior),objects:[],warps:[]});
const state=(behavior:(x:number)=>number):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},navigation_grid:grid(behavior)});
const grass=state(x=>x>=1&&x<=5?TALL_GRASS:0);
const RIGHT4=["RIGHT","RIGHT","RIGHT","RIGHT"] as const;
it("OFF refuses tall grass exactly as before; ON plans a corridor through it and marks the request",()=>{
 expect(planStride(grass,[...RIGHT4],{})).toBeNull();
 expect(planStride(grass,[...RIGHT4],{},false)).toBeNull();
 expect(planStride(grass,[...RIGHT4],{},true)).toEqual({map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0}],elevation:3,tall_grass:true});
 const plain=state(()=>0);
 expect(planStride(plain,[...RIGHT4],{})).toEqual({map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0}],elevation:3});
 expect(planStride({...grass,position:{x:2,y:0}},["RIGHT"],{},true)?.path).toEqual([{x:3,y:0}]);
 expect(planStride({...grass,position:{x:2,y:0}},["RIGHT"],{})).toBeNull();
});
it("ON still stops before long grass and every other special tile, objects, warps and triggers",()=>{
 for(const behavior of [LONG_GRASS,0x0a,0x28,0x3b,0x60,0x69])expect(planStride(state(x=>x===1?TALL_GRASS:x===2?behavior:0),["RIGHT","RIGHT","RIGHT"],{},true)?.path).toEqual([{x:1,y:0}]);
 expect(planStride(state(x=>x===1?LONG_GRASS:0),["RIGHT"],{},true)).toBeNull();
 for(const change of [{objects:[{x:2,y:0}],warps:[]},{objects:[],warps:[{x:2,y:0}]}])expect(planStride({...grass,navigation_grid:{...grid(x=>x>=1?TALL_GRASS:0),...change}},["RIGHT","RIGHT","RIGHT"],{},true)?.path).toEqual([{x:1,y:0}]);
 expect(planStride(grass,["RIGHT","RIGHT"],{triggers:[{x:2,y:0,elevation:3,variable:1,required:0,current:0}]},true)?.path).toEqual([{x:1,y:0}]);
 expect(planStride({...grass,navigation_grid:{...grid(()=>TALL_GRASS),tiles:row(()=>TALL_GRASS).map(t=>t.x===2?{...t,elevation:4}:t)}},["RIGHT","RIGHT"],{},true)?.path).toEqual([{x:1,y:0}]);
 expect(planStride({...grass,navigation_grid:{...grid(()=>TALL_GRASS),tiles:row(()=>TALL_GRASS).map(t=>t.x===2?{...t,collision:1}:t)}},["RIGHT","RIGHT"],{},true)?.path).toEqual([{x:1,y:0}]);
});
it("a receipt echoing the grass permission validates; one without it still does",()=>{
 const receipt={id:"a",map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0}],elevation:3,automatic_running:true,completed:1,frames:9,reason:"completed",stopped:true};
 expect(Value.Check(StrideReceiptSchema,receipt)).toBe(true);
 expect(Value.Check(StrideReceiptSchema,{...receipt,tall_grass:true})).toBe(true);
 expect(Value.Check(StrideReceiptSchema,{...receipt,tall_grass:false})).toBe(false);
});
const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:TALL_GRASS,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
const initial:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},facing:"down",running,navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:i<12&&i>=1?TALL_GRASS:0,elevation:3})),objects:[],warps:[]}};
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
async function navigate(features:Record<string,boolean>,tamper?:(receipt:Record<string,unknown>)=>Record<string,unknown>,start:GameStateSnapshot=initial){
 let current=start;const posts:{url:string;body:Record<string,unknown>}[]=[];
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Missing body");const p=JSON.parse(init.body) as Record<string,unknown>;posts.push({url,body:p});
   if(url.endsWith("/stride")){const plan=p as StridePlan;const end=plan.path.at(-1);if(end===undefined)throw new Error("Empty stride");current={...current,position:end};}
   else{const d=(p as {buttons:string[]}).buttons[0];const a=current.position;if(a===null)throw new Error("Missing position");current={...current,position:{x:a.x+(d==="RIGHT"?1:d==="LEFT"?-1:0),y:a.y}};}
   body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.includes("/pokebench/stride/")){const plan=posts.at(-1)?.body;const receipt={...plan,completed:(plan?.path as unknown[]).length,frames:20,reason:"completed",stopped:true};body=tamper===undefined?receipt:tamper(receipt);}
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:true},{now:()=>0,sleep:()=>Promise.resolve()});
 const all={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"automatic-running-v1":true,"safe-navigation-strides-v1":true,...features};
 const nav=withNavigation(tools,all,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 const result=await nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 return {posts,result,description:nav.description,current};
}
it("factory: OFF walks each grass step with automatic running refused; ON sends one grass stride carrying the permission",async()=>{
 const off=await navigate({[ID]:false});
 expect(off.posts.map(p=>p.url)).toEqual(Array.from({length:4},()=>"http://test/action"));
 expect(off.posts.every(p=>!("automatic_running" in p.body))).toBe(true);
 const on=await navigate({[ID]:true});
 expect(on.current.position).toEqual({x:4,y:0});
 expect(on.posts).toHaveLength(1);
 expect(on.posts[0]?.url).toBe("http://test/pokebench/stride");
 expect(on.posts[0]?.body).toMatchObject({path:[{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:4,y:0}],tall_grass:true,automatic_running:true});
 expect(JSON.stringify(on.result)).toContain("arrived at requested coordinate");
});
it("a receipt whose grass permission differs from the request is refused, in both directions",async()=>{
 await expect(navigate({[ID]:true},r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=="tall_grass")))).rejects.toThrow("matching terminal receipt");
 const plain:GameStateSnapshot={...initial,navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:0,elevation:3})),objects:[],warps:[]}};
 expect(plain.navigation_grid?.tiles.every(t=>t.behavior===0)).toBe(true);
 await expect(navigate({[ID]:false,"automatic-running-v1":true},r=>({...r,tall_grass:true}),plain)).rejects.toThrow("matching terminal receipt");
});
it("the navigate_to description names tall grass only with the switch on",async()=>{
 const off=await navigate({[ID]:false}),on=await navigate({[ID]:true});
 expect(off.description).toContain("Straight plain-floor corridors use explicit strides");
 expect(off.description).toContain("Strides stop before turns, grass, ledges");
 expect(on.description).toContain("Straight corridors of plain floor or tall grass use explicit strides");
 expect(on.description).toContain("Strides stop before turns, other grass, ledges");
 expect(on.description.replace("Straight corridors of plain floor or tall grass use explicit strides","Straight plain-floor corridors use explicit strides").replace("other grass","grass")).toBe(off.description);
});
it("is registered at index 277, default off, needs strides and automatic running",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(277);
 const harness=playHarnessFeatures({...ALL_ON,[ID]:true},null);
 expect(harness.indexOf(ID)).toBeGreaterThan(harness.indexOf("context-exact-count-v1"));
 expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"safe-navigation-strides-v1",switchable:true,title:"GRASS STRIDES"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 expect(normalizeFeatures({...ALL_ON,[ID]:undefined} as unknown as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
 expect(dependencyProblems({...ALL_ON,[ID]:true,"automatic-running-v1":false})).toContain("grass-strides-v1 needs automatic-running-v1");
 expect(dependencyProblems({...ALL_ON,[ID]:true,"safe-navigation-strides-v1":false})).toContain("grass-strides-v1 needs safe-navigation-strides-v1");
 expect(dependencyProblems({...ALL_ON,[ID]:false,"automatic-running-v1":false})).not.toContain("grass-strides-v1 needs automatic-running-v1");
});
