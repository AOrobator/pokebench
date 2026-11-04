import {expect,it} from "vitest";
import {withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import type {StridePlan} from "./stride.js";
import {BIKE_MOUNT_SENTENCE,bikeTurn,machFrames,ridingSaves,toggleNote,type BikeState} from "./bike.js";
import {WATER} from "./tile-rules.js";
const ID="bike-auto-mount-v1";
const MACH=259,LONG_GRASS=0x03;
const running=(flags:number,metatile=0)=>({permitted:flags===1,controllable:true,reason:flags===1?"permitted":"not_on_foot",shoes:true,allow_running:true,avatar_flags:flags,metatile,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null});
const bike=(over:Partial<BikeState>={}):BikeState=>({owned:[MACH],registered:MACH,riding:null,allow_cycling:true,...over});
const field=(flags:number,b:BikeState=bike(),behavior:(x:number)=>number=()=>0):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},facing:"right",running:running(flags),bike:b,navigation_grid:{elevation:3,tiles:Array.from({length:120},(_,i)=>({x:i%24,y:Math.floor(i/24),collision:0,behavior:i<24?behavior(i):0,elevation:3})),objects:[],warps:[]}});
const R=(n:number):string[]=>Array.from({length:n},()=>"RIGHT");
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
function harness(features:Record<string,boolean>,start:GameStateSnapshot,reason?:string,lockOnPressRead=false){
 let current=start;const posts:{url:string;body:Record<string,unknown>}[]=[];
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Missing body");const p=JSON.parse(init.body) as Record<string,unknown>;posts.push({url,body:p});
   if(url.endsWith("/stride")){const plan=p as StridePlan;const end=plan.path.at(-1);if(end===undefined)throw new Error("Empty stride");current={...current,position:end};}
   else if(url.endsWith("/bike/toggle")){if(reason===undefined){const ride=p.ride===true;current={...current,running:running(ride?2:1),bike:{...bike(),riding:ride?"MACH BIKE":null}};}}
   else{const d=(p as {buttons:string[]}).buttons[0];const a=current.position;if(a===null)throw new Error("Missing position");current={...current,position:{x:a.x+(d==="RIGHT"?1:0),y:a.y}};}
   body={status:"success"};
  }else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/state")&&lockOnPressRead)body={...current,field_controls_locked:true};
  else if(url.includes("/pokebench/stride/")){const plan=posts.at(-1)?.body;body={...plan,completed:(plan?.path as unknown[]).length,frames:20,reason:"completed",stopped:true};}
  else if(url.includes("/pokebench/bike/")){const plan=posts.at(-1)?.body;const ride=plan?.ride===true;body={...plan,frames:22,presses:reason===undefined?["SELECT"]:["SELECT","B"],reason:reason??(ride?"riding":"on foot"),stopped:true};}
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools=gameTools("http://test",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:true},{now:()=>0,sleep:()=>Promise.resolve()});
 const all={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"automatic-running-v1":true,"safe-navigation-strides-v1":true,"bike-navigation-v1":true,"bike-register-v1":true,...features};
 const nav=withNavigation(tools,all,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 return {nav,posts,get:()=>current};
}
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.flatMap(p=>p.type==="text"&&p.text!==undefined?[p.text]:[]).join("\n");
const plain={behavior:0},grass={behavior:LONG_GRASS},water={behavior:0x10};
it("riding pays only when its frames, mount included, beat running: long straight runs on the MACH BIKE",()=>{
 expect([1,2,3,4,5,8,9,12,16].map(machFrames)).toEqual([16,32,40,56,72,64,68,80,96]);
 expect(ridingSaves(R(16),true)).toBe(true);
 expect(ridingSaves(R(12),true)).toBe(false);
 expect(ridingSaves([...R(8),"DOWN",...R(8)],true)).toBe(false);
 expect(ridingSaves(R(11),false)).toBe(true);
 expect(ridingSaves(R(10),false)).toBe(false);
 expect(ridingSaves([...R(16),...R(16)],true)).toBe(true);
});
it("gets on only on foot, with a registered bike, cycling allowed, a route riding pays on and an enterable next tile",()=>{
 expect(bikeTurn(field(1),R(16),plain,3,WATER)).toBe(true);
 expect(bikeTurn(field(1),R(12),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1,bike({owned:[272],registered:272})),R(12),plain,3,WATER)).toBe(true);
 expect(bikeTurn(field(1,bike({allow_cycling:false})),R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1,bike({registered:0})),R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1,bike({registered:261,owned:[MACH,261]})),R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1,bike({owned:[]})),R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1),R(16),grass,3,WATER)).toBeNull();
 expect(bikeTurn(field(1),R(16),water,3,WATER)).toBeNull();
 expect(bikeTurn(field(1),R(16),{behavior:0x78},2,WATER)).toBeNull();
 expect(bikeTurn(field(1),R(16),{behavior:0x78},3,WATER)).toBe(true);
 expect(bikeTurn({...field(1),running:running(1,0x0a)},R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn({...field(1),field_controls_locked:true},R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(1),R(16),undefined,3,WATER)).toBeNull();
 expect(bikeTurn({...field(1),bike:null},R(16),plain,3,WATER)).toBeNull();
});
it("prices only the stretch before a tile a bike cannot enter, plus getting off",()=>{
 const acro=field(1,bike({owned:[272],registered:272}));
 const tiles=(n:number,last:number)=>[...Array.from({length:n-1},()=>plain),{behavior:last}];
 expect(bikeTurn(acro,R(11),plain,3,WATER,tiles(11,0))).toBe(true);
 expect(bikeTurn(acro,R(11),plain,3,WATER,tiles(11,LONG_GRASS))).toBeNull();
 expect(bikeTurn(acro,R(11),plain,3,WATER,tiles(11,0x10))).toBeNull();
 expect(bikeTurn(acro,R(30),plain,3,WATER,tiles(30,LONG_GRASS))).toBe(true);
 expect(ridingSaves(R(24),false,true)).toBe(true);
 expect(ridingSaves(R(11),false,true)).toBe(false);
});
it("a route whose tiles do not match its steps one to one stays on foot",()=>{
 expect(bikeTurn(field(1),R(16),plain,3,WATER,Array.from({length:18},()=>plain))).toBeNull();
 expect(bikeTurn(field(1),R(16),plain,3,WATER,Array.from({length:16},()=>plain))).toBe(true);
});
it("factory: a straight route ending in long grass stays on foot when getting off would cost more",async()=>{
 const h=harness({[ID]:true},field(1,bike({owned:[272],registered:272}),x=>x===11?LONG_GRASS:0));
 await h.nav.execute("nav",{x:11,y:0,map_id:[0,9]});
 expect(h.posts.some(p=>p.url.endsWith("/bike/toggle"))).toBe(false);
});
it("gets off before water or a tile a bike cannot enter, and never on the water",()=>{
 expect(bikeTurn(field(2),R(16),grass,3,WATER)).toBe(false);
 expect(bikeTurn(field(4),R(1),water,3,WATER)).toBe(false);
 expect(bikeTurn(field(2),R(16),plain,3,WATER)).toBeNull();
 expect(bikeTurn(field(0x08),R(16),plain,3,WATER)).toBeNull();
});
it("notes",()=>{
 expect(toggleNote({id:"a",ride:true,frames:22,presses:["SELECT"],reason:"riding",stopped:true})).toBe("Bike: got on the bike with SELECT.");
 expect(toggleNote({id:"a",ride:false,frames:22,presses:["SELECT"],reason:"on foot",stopped:true})).toBe("Bike: got off the bike with SELECT.");
 expect(toggleNote({id:"a",ride:true,frames:100,presses:["SELECT","B"],reason:"refused",stopped:true})).toBe("Bike: SELECT to get on stopped: refused.");
 expect(toggleNote({id:"a",ride:false,frames:100,presses:[],reason:"frame budget",stopped:true})).toBe("Bike: SELECT to get off stopped: frame budget.");
});
it("factory: ON gets on before a long straight route, then rides it as one bike stride",async()=>{
 const h=harness({[ID]:true},field(1));
 const r=await h.nav.execute("nav",{x:16,y:0,map_id:[0,9]});
 expect(h.posts.map(p=>p.url)).toEqual(["http://test/pokebench/bike/toggle","http://test/pokebench/stride"]);
 expect(h.posts[0]?.body).toMatchObject({ride:true});
 expect(h.posts[1]?.body).toMatchObject({bike:true,automatic_running:false});
 expect(text(r)).toContain("Bike: got on the bike with SELECT.");
 // Local navigation plans at most 8 route steps a call; the rest of the ride is the next call's.
 expect(h.get().position).toEqual({x:8,y:0});
});
it("a route riding does not pay on stays on foot",async()=>{
 const h=harness({[ID]:true},field(1));
 await h.nav.execute("nav",{x:12,y:0,map_id:[0,9]});
 expect(h.posts.map(p=>p.url)).toEqual(["http://test/pokebench/stride"]);
});
it("factory: riding, it gets off before long grass and walks on",async()=>{
 const h=harness({[ID]:true},{...field(2,bike({riding:"MACH BIKE"}),x=>x===3?LONG_GRASS:0)});
 const r=await h.nav.execute("nav",{x:5,y:0,map_id:[0,9]});
 const urls=h.posts.map(p=>p.url);
 expect(urls.indexOf("http://test/pokebench/bike/toggle")).toBeGreaterThan(0);
 expect(h.posts.find(p=>p.url.endsWith("/bike/toggle"))?.body).toMatchObject({ride:false});
 expect(text(r)).toContain("Bike: got off the bike with SELECT.");
 expect(h.get().running?.avatar_flags).toBe(1);
});
it("a refused SELECT is reported once and the walk goes on as it was",async()=>{
 const h=harness({[ID]:true},field(1),"refused");
 const r=await h.nav.execute("nav",{x:16,y:0,map_id:[0,9]});
 expect(h.posts.filter(p=>p.url.endsWith("/bike/toggle"))).toHaveLength(1);
 expect(text(r)).toContain("Bike: SELECT to get on stopped: refused.");
 expect(h.get().position).toEqual({x:8,y:0});
 expect(h.posts.find(p=>p.url.endsWith("/stride"))?.body).not.toHaveProperty("bike");
});
it("OFF never presses SELECT and the description says nothing of getting on",async()=>{
 const off=harness({[ID]:false},field(1)),on=harness({[ID]:true},field(1));
 await off.nav.execute("nav",{x:16,y:0,map_id:[0,9]});
 expect(off.posts.some(p=>p.url.endsWith("/bike/toggle"))).toBe(false);
 expect(off.nav.description).not.toContain(BIKE_MOUNT_SENTENCE);
 expect(on.nav.description).toContain(BIKE_MOUNT_SENTENCE);
});
it("a state change before SELECT withdraws it without pressing",async()=>{
 const h=harness({[ID]:true},field(1),undefined,true);
 const r=await h.nav.execute("nav",{x:16,y:0,map_id:[0,9]});
 expect(h.posts.some(p=>p.url.endsWith("/bike/toggle"))).toBe(false);
 expect(text(r)).toContain("Bike: bike state changed before SELECT; nothing pressed.");
});
