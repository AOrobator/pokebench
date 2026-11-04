import {expect,it} from "vitest";
import {withNavigation} from "./navigation.js";
import {gameTools,ALL_TOOL_SWITCHES} from "./game-tools.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import type {StridePlan} from "./stride.js";
import {bikeToRegister,registrationNote,type BikeState} from "./bike.js";
import {parseGameState} from "./game-state.js";
const ID="bike-register-v1",MOUNT="bike-auto-mount-v1";
const MACH=259,ACRO=272,ITEMFINDER=261;
const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
const bike=(registered:number,owned=[MACH]):BikeState=>({owned,registered,riding:null,allow_cycling:true});
const field=(b:BikeState|undefined):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},facing:"right",running,...(b===undefined?{}:{bike:b}),navigation_grid:{elevation:3,tiles:Array.from({length:72},(_,i)=>({x:i%12,y:Math.floor(i/12),collision:0,behavior:0,elevation:3})),objects:[],warps:[]}});
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
function harness(features:Record<string,boolean>,start:GameStateSnapshot,reason="registered",lockOnPressRead=false,queueFails=false){
 let current=start;const posts:{url:string;body:Record<string,unknown>}[]=[];const pressed:string[][]=[];
 const fetchFn:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=current;
  if(init?.method==="POST"){
   if(url.endsWith("/cancel")){const plan=posts.at(-1)?.body;return Promise.resolve(new Response(JSON.stringify({...plan,frames:40,presses:["START","A"],reason:"cancelled",stopped:true})));}
   if(typeof init.body!=="string")throw new Error("Missing body");const p=JSON.parse(init.body) as Record<string,unknown>;posts.push({url,body:p});
   if(url.endsWith("/stride")){const plan=p as StridePlan;const end=plan.path.at(-1);if(end===undefined)throw new Error("Empty stride");current={...current,position:end};}
   else if(url.endsWith("/bike/register")){if(reason==="registered"&&current.bike!=null)current={...current,bike:{...current.bike,registered:p.item as number}};}
   else{const d=(p as {buttons:string[]}).buttons[0];const a=current.position;if(a===null)throw new Error("Missing position");current={...current,position:{x:a.x+(d==="RIGHT"?1:0),y:a.y}};}
   body={status:"success"};
  }else if(url.endsWith("/queue_status")){if(queueFails)return Promise.reject(new Error("aborted"));body={queue_empty:true};}
  else if(url.endsWith("/pokebench/state")&&lockOnPressRead)body={...current,field_controls_locked:true};
  else if(url.includes("/pokebench/stride/")){const plan=posts.at(-1)?.body;body={...plan,completed:(plan?.path as unknown[]).length,frames:20,reason:"completed",stopped:true};}
  else if(url.includes("/pokebench/bike/")){const plan=posts.at(-1)?.body;body={...plan,frames:300,presses:reason==="registered"?["START","A","RIGHT","DOWN","A","RIGHT","A","B","B"]:["START","B"],reason,stopped:true};}
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"field",screenshot_base64:png.toString("base64")};
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 const tools=gameTools("http://test",{beforePress:(_id,buttons)=>{pressed.push([...buttons]);},afterPress:()=>Promise.resolve()},fetchFn,{...ALL_TOOL_SWITCHES,automaticRunning:true},{now:()=>0,sleep:()=>Promise.resolve()});
 const all={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"full-map-navigation-v1":false,"automatic-running-v1":true,"safe-navigation-strides-v1":true,...features};
 const nav=withNavigation(tools,all,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");if(!nav)throw new Error("No navigation");
 return {nav,posts,pressed,set:(s:GameStateSnapshot)=>{current=s;},get:()=>current};
}
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.flatMap(p=>p.type==="text"&&p.text!==undefined?[p.text]:[]).join("\n");
it("registers both server switches default off after bike-navigation-v1, with their dependencies",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("bike-navigation-v1")+1);
 expect(SWITCHABLE_FEATURES.indexOf(MOUNT)).toBe(SWITCHABLE_FEATURES.indexOf(ID)+1);
 const flags=flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false});
 for(const id of [ID,MOUNT] as const){
  const {[id]:omitted,...old}=flags;expect(omitted).toBe(false);expect(normalizeFeatures(old)[id]).toBe(false);
  expect(featureInfo(id).description).toContain(" Off: ");
  expect(SERVER_FEATURES).toContain(id);
  expect(serverFeatureEnv({...ALL_ON,[id]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
  expect(playHarnessFeatures({...ALL_ON,[id]:false},null)).not.toContain(id);
 }
 expect(featureInfo(ID).needs).toBeNull();
 expect(featureInfo(MOUNT).needs).toBe(ID);
 expect(dependencyProblems({...ALL_ON,[ID]:false})).toContain(`${MOUNT} needs ${ID}`);
 expect(dependencyProblems({...ALL_ON,"bike-navigation-v1":false})).toContain(`${MOUNT} needs bike-navigation-v1`);
 const listed=playHarnessFeatures(ALL_ON,null),first=listed.indexOf("bike-navigation-v1");
 expect(listed.slice(first,first+3)).toEqual(["bike-navigation-v1",ID,MOUNT]);
});
it("the state carries the bike object and validates it",()=>{
 expect(parseGameState({...field(undefined),bike:{owned:[MACH],registered:0,riding:null,allow_cycling:true}}).bike).toEqual(bike(0));
 expect(()=>parseGameState({...field(undefined),bike:{owned:[MACH],registered:0,riding:"UNICYCLE",allow_cycling:true}})).toThrow();
});
it("chooses the owned bike only when nothing owned is on SELECT and the field is free",()=>{
 expect(bikeToRegister(field(bike(0)))).toBe(MACH);
 expect(bikeToRegister(field(bike(ITEMFINDER,[ACRO])))).toBe(ACRO);
 expect(bikeToRegister(field(bike(MACH)))).toBeNull();
 expect(bikeToRegister(field(bike(0,[])))).toBeNull();
 expect(bikeToRegister(field(undefined))).toBeNull();
 expect(bikeToRegister({...field(bike(0)),field_controls_locked:true})).toBeNull();
 expect(bikeToRegister({...field(bike(0)),screen:"menu"})).toBeNull();
 expect(registrationNote({id:"a",item:MACH,frames:3,presses:[],reason:"registered",stopped:true})).toBe("Bike: the MACH BIKE is registered to SELECT.");
 expect(registrationNote({id:"a",item:ACRO,frames:3,presses:[],reason:"stuck on bag_menu",stopped:true})).toBe("Bike: registering the ACRO BIKE to SELECT stopped: stuck on bag_menu.");
 expect(registrationNote({id:"a",item:7,frames:3,presses:[],reason:"x",stopped:true})).toBe("Bike: registering the bike to SELECT stopped: x.");
});
it("factory: ON registers once before walking, records each press, then walks; a second call does not register again",async()=>{
 const h=harness({[ID]:true},field(bike(0)));
 const first=await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.map(p=>p.url)).toEqual(["http://test/pokebench/bike/register","http://test/pokebench/stride"]);
 expect(h.posts[0]?.body).toMatchObject({item:MACH});
 expect(h.pressed.slice(0,9)).toEqual([["START"],["A"],["RIGHT"],["DOWN"],["A"],["RIGHT"],["A"],["B"],["B"]]);
 expect(text(first)).toContain("Bike: the MACH BIKE is registered to SELECT.");
 expect(text(first)).toContain("arrived at requested coordinate");
 h.set({...h.get(),position:{x:0,y:0}});
 await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.filter(p=>p.url.endsWith("/bike/register"))).toHaveLength(1);
});
it("a failed registration is not retried until the registration changes",async()=>{
 const h=harness({[ID]:true},field(bike(0)),"stuck on bag_menu");
 const first=await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(text(first)).toContain("Bike: registering the MACH BIKE to SELECT stopped: stuck on bag_menu.");
 expect(text(first)).toContain("arrived at requested coordinate");
 h.set({...h.get(),position:{x:0,y:0}});
 await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.filter(p=>p.url.endsWith("/bike/register"))).toHaveLength(1);
 h.set({...h.get(),position:{x:0,y:0},bike:bike(ITEMFINDER,[ITEMFINDER,MACH].filter(i=>i===MACH))});
 await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.filter(p=>p.url.endsWith("/bike/register"))).toHaveLength(2);
});
it("a state change before the press withdraws the registration without pressing",async()=>{
 const h=harness({[ID]:true},field(bike(0)),"registered",true);
 const r=await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.filter(p=>p.url.endsWith("/bike/register"))).toHaveLength(0);
 expect(text(r)).toContain("Bike: bike registration state changed before action; nothing pressed.");
});
it("an aborted registration still records the presses the game received",async()=>{
 const h=harness({[ID]:true},field(bike(0)),"registered",false,true);
 await expect(h.nav.execute("nav",{x:4,y:0,map_id:[0,9]})).rejects.toThrow("aborted");
 expect(h.pressed).toEqual([["START"],["A"]]);
});
it("OFF never registers, even with an unregistered bike in the state",async()=>{
 const h=harness({[ID]:false},field(bike(0)));
 const r=await h.nav.execute("nav",{x:4,y:0,map_id:[0,9]});
 expect(h.posts.map(p=>p.url)).toEqual(["http://test/pokebench/stride"]);
 expect(text(r)).not.toContain("Bike:");
});
