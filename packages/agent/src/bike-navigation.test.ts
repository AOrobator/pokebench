import {expect,it} from "vitest";
import {planStride,withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES} from "./game-tools.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {StrideReceiptSchema,type StridePlan} from "./stride.js";
import {Value} from "typebox/value";
const ID="bike-navigation-v1";
const MACH=0x02,ACRO=0x04;
const running=(flags:number)=>({permitted:flags===1,controllable:true,reason:flags===1?"permitted":"not_on_foot",shoes:true,allow_running:true,avatar_flags:flags,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null});
const initial=(flags:number):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},facing:"right",running:running(flags),navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:i===3?2:0,elevation:3})),objects:[],warps:[]}});
const plain=(flags:number):GameStateSnapshot=>({...initial(flags),navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:0,elevation:3})),objects:[],warps:[]}});
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
// press moves the fake player this many tiles per ordinary press (an Acro Bike's 10-frame press crosses two).
async function navigate(features:Record<string,boolean>,start:GameStateSnapshot,press=1,goal=4,tamper?:(receipt:Record<string,unknown>)=>Record<string,unknown>){
 let current=start;const posts:{url:string;body:Record<string,unknown>}[]=[];
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Missing body");const p=JSON.parse(init.body) as Record<string,unknown>;posts.push({url,body:p});
   if(url.endsWith("/stride")){const plan=p as StridePlan;const end=plan.path.at(-1);if(end===undefined)throw new Error("Empty stride");current={...current,position:end};}
   else{const d=(p as {buttons:string[]}).buttons[0];const a=current.position;if(a===null)throw new Error("Missing position");current={...current,position:{x:Math.min(goal,a.x+(d==="RIGHT"?press:0)),y:a.y}};}
   body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.includes("/pokebench/stride/")){const plan=posts.at(-1)?.body;const receipt={...plan,completed:(plan?.path as unknown[]).length,frames:20,reason:"completed",stopped:true};body=tamper===undefined?receipt:tamper(receipt);}
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:true},{now:()=>0,sleep:()=>Promise.resolve()});
 const all={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"automatic-running-v1":true,"safe-navigation-strides-v1":true,...features};
 const nav=withNavigation(tools,all,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 const result=await nav.execute("nav",{x:goal,y:0,map_id:[0,9]});
 return {posts,result,description:nav.description,current};
}
it("is registered after warp-areas-v1, default off, needing safe-navigation-strides-v1",()=>{
 const index=SWITCHABLE_FEATURES.indexOf(ID);
 expect(SWITCHABLE_FEATURES[index-1]).toBe("warp-areas-v1");
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"safe-navigation-strides-v1"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 const flags=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
 const {[ID]:omitted,...old}=flags;expect(omitted).toBe(false);expect(normalizeFeatures(old)[ID]).toBe(false);
 expect(dependencyProblems({...ALL_ON,"safe-navigation-strides-v1":false})).toContain(`${ID} needs safe-navigation-strides-v1`);
 expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
 expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
});
it("planStride marks a ridden corridor only when asked",()=>{
 const path=["RIGHT","RIGHT","RIGHT"] as const;
 expect(planStride(plain(MACH),[...path],{})).toEqual({map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0},{x:2,y:0},{x:3,y:0}],elevation:3});
 expect(planStride(plain(MACH),[...path],{},false,true)).toEqual({map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0},{x:2,y:0},{x:3,y:0}],elevation:3,bike:true});
});
it("a ridden corridor may run 16 tiles; on foot it stays at 8",()=>{
 const long=Array.from({length:20},()=>"RIGHT" as const);
 const wide:GameStateSnapshot={...plain(MACH),navigation_grid:{elevation:3,tiles:Array.from({length:24},(_,x)=>({x,y:0,collision:0,behavior:0,elevation:3})),objects:[],warps:[]}};
 expect(planStride(wide,long,{},false,true)?.path).toHaveLength(16);
 expect(planStride(wide,long,{})?.path).toHaveLength(8);
});
it("a receipt echoing the bike field validates; a false one does not",()=>{
 const receipt={id:"a",map_id:[0,9],origin:{x:0,y:0},path:[{x:1,y:0}],elevation:3,automatic_running:false,completed:1,frames:9,reason:"completed",stopped:true};
 expect(Value.Check(StrideReceiptSchema,{...receipt,bike:true})).toBe(true);
 expect(Value.Check(StrideReceiptSchema,{...receipt,bike:false})).toBe(false);
});
it("factory: ON rides one stride marked bike with automatic running off; OFF sends today's stride",async()=>{
 for(const flags of [MACH,ACRO]){
  const on=await navigate({[ID]:true},plain(flags));
  expect(on.posts).toHaveLength(1);
  expect(on.posts[0]?.url).toBe("http://test/pokebench/stride");
  expect(on.posts[0]?.body).toMatchObject({bike:true,automatic_running:false});
  expect(JSON.stringify(on.result)).toContain("arrived at requested coordinate");
  const off=await navigate({[ID]:false},plain(flags));
  expect(off.posts[0]?.url).toBe("http://test/pokebench/stride");
  expect(off.posts[0]?.body).not.toHaveProperty("bike");
 }
});
it("on foot, ON changes nothing",async()=>{
 const on=await navigate({[ID]:true},plain(1)),off=await navigate({[ID]:false},plain(1));
 const anonymous=(posts:typeof on.posts)=>posts.map(p=>({...p,body:{...p.body,id:"x"}}));
 expect(anonymous(on.posts)).toEqual(anonymous(off.posts));
});
it("a non-stride press that rides two tiles along the route is the planned move only with the switch on",async()=>{
 // The tall grass at (3,0) ends the stride, so (2,0)->(3,0) is an ordinary press, here crossing two tiles.
 const on=await navigate({[ID]:true},initial(ACRO),2,5);
 expect(JSON.stringify(on.result)).toContain("arrived at requested coordinate");
 const off=await navigate({[ID]:false},initial(ACRO),2,5);
 expect(JSON.stringify(off.result)).toContain("planned stride interrupted");
});
it("a receipt whose bike field differs from the request is refused",async()=>{
 await expect(navigate({[ID]:true},plain(MACH),1,4,r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=="bike")))).rejects.toThrow("matching terminal receipt");
});
it("the navigate_to description mentions riding only with the switch on",async()=>{
 const off=await navigate({[ID]:false},plain(1)),on=await navigate({[ID]:true},plain(1));
 expect(off.description).not.toContain("bike");
 expect(on.description).toContain("On a bike");
});
