import {expect,it} from "vitest";
import {planNavigation,navigationTool} from "./navigation.js";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
const tile=(x:number,y:number,collision=0,behavior=0,elevation=3)=>({x,y,collision,behavior,elevation});
const grid:NonNullable<GameStateSnapshot["navigation_grid"]>={elevation:3,tiles:[tile(0,0),tile(1,0,1),tile(2,0),tile(0,1),tile(1,1),tile(2,1)],objects:[],warps:[]};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const field:GameStateSnapshot={screen:"overworld",started:true,name:"A",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:grid};
it("finds a shortest supported path around collision rather than walking through it",()=>{expect(planNavigation(field,{x:2,y:0})).toEqual(["DOWN","RIGHT","RIGHT","UP"]);});
it("rejects unknown geometry, locked fields, water, occupied tiles and intermediate warps",()=>{
 for(const extra of [{navigation_grid:null},{field_controls_locked:true},{in_battle:true},{screen:"field_transition"},{navigation_grid:{...grid,objects:[{x:2,y:0}]}}])expect(planNavigation({...field,...extra},{x:2,y:0})).toBeNull();
 expect(planNavigation({...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,0,0x10)],objects:[],warps:[]}},{x:1,y:0})).toBeNull();
 expect(planNavigation({...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0),tile(2,0)],objects:[],warps:[{x:1,y:0}]}},{x:2,y:0})).toBeNull();
});
it("retains elevation across zero-elevation connectors and approaches a door from below",()=>{
 const grid={elevation:3,tiles:[tile(0,0),tile(1,0,0,0,0),tile(2,0,0,0,4)],objects:[],warps:[]};
 expect(planNavigation({...field,navigation_grid:grid},{x:2,y:0})).toBeNull();
 const room={...field,position:{x:0,y:1},navigation_grid:{elevation:3,tiles:[tile(0,1),tile(0,0,1,0x69,0)],objects:[],warps:[{x:0,y:0}]}};
 expect(planNavigation(room,{x:0,y:0})).toEqual(["UP"]);
});
it("uses ordinary presses, handles turning, and stops after a map change",async()=>{
 let current={...field,facing:"up"};const buttons:string[][]=[];let presses=0;
 const tool=navigationTool({read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);presses++;current=presses===1?{...current,facing:"down"}:presses===2?{...current,position:{x:0,y:1}}:{...current,map_id:[1,0]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const outcome=await tool.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);
 expect(buttons).toEqual([["DOWN"],["DOWN"],["RIGHT"]]);expect(outcome.content[0]?.type=== "text" ? outcome.content[0].text : null).toContain("map changed");
});


it("caps ordinary attempts and never advances after abort or a field lock",async()=>{
 let state={...field};let pressed=0;
 const ports={read:()=>Promise.resolve(state),press:()=>{pressed++;state={...state,position:{x:0,y:1}};return Promise.resolve(result(state));},observe:()=>Promise.resolve(result(state)),maxCommands:1};
 const tool=navigationTool(ports);await tool.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);expect(pressed).toBe(1);
 const abort=new AbortController();abort.abort();await expect(tool.execute("nav",{x:2,y:0,map_id:[0,9]},abort.signal)).rejects.toThrow();expect(pressed).toBe(1);
 state={...field,field_controls_locked:true};const outcome=await tool.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);expect(pressed).toBe(1);expect(outcome.content[0]?.type=== "text" ? outcome.content[0].text : null).toContain("unavailable");
 expect(()=>navigationTool({...ports,maxCommands:9})).toThrow(/bound/);
});
it("rejects duplicate geometry, unknown target and unsupported movement",()=>{
 expect(planNavigation({...field,navigation_grid:{...grid,tiles:[tile(0,0),tile(0,0)]}},{x:0,y:0})).toBeNull();
 expect(planNavigation(field,{x:9,y:9})).toBeNull();
 expect(planNavigation(field,{x:0,y:0})).toEqual([]);
});
it("stops on blocked or unexpected movement instead of continuing a planned route",async()=>{
 for(const after of [field,{...field,position:{x:2,y:1}},{...field,field_controls_locked:true}]){let pressed=0;const tool=navigationTool({read:()=>Promise.resolve(field),press:()=>{pressed++;return Promise.resolve(result(after));},observe:()=>Promise.resolve(result(after))});await tool.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);expect(pressed).toBeLessThanOrEqual(2);}
});


it("does not press after the pause gate aborts and rejects malformed step observations",async()=>{
 let presses=0;const abort=new AbortController();const ports={read:()=>Promise.resolve(field),press:()=>{presses++;return Promise.resolve({content:[{type:"text" as const,text:"bad"}],details:{}});},observe:()=>Promise.resolve(result(field))};
 const gated=navigationTool({...ports,gate:()=>{abort.abort();return Promise.resolve();}});
 await expect(gated.execute("nav",{x:2,y:0,map_id:[0,9]},abort.signal)).rejects.toThrow();expect(presses).toBe(0);
 await expect(navigationTool(ports).execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal)).rejects.toThrow(/verified state/);expect(presses).toBe(1);
});


it("uses a reachable known frontier for distant in-bounds targets without inventing unseen tiles",()=>{
 const bounded={...field,topology:{width:20,height:20,connections:[]}};
 expect(planNavigation(bounded,{x:9,y:0})).toEqual(["DOWN","RIGHT","RIGHT","UP"]);
 expect(planNavigation(bounded,{x:20,y:0})).toBeNull();
 expect(planNavigation({...field,active_ui:{phase:"unknown",selected:null,ready:false,controls:"unavailable",diagnostic:"unsupported"}},{x:2,y:0})).toBeNull();
});

it("checked navigation stops gracefully when the ordinary press sees changed state",async()=>{
 let commands=0;const changed={...field,map_id:[1,0] as [number,number]};
 const tool=navigationTool({read:()=>Promise.resolve(field),press:(_id,_params,_signal,check)=>{check?.(changed);commands++;return Promise.resolve(result(changed));},observe:()=>Promise.resolve(result(changed))});
 const outcome=await tool.execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);expect(commands).toBe(0);expect(outcome.content[0]?.type==="text"?outcome.content[0].text:null).toContain("no command submitted");
});


it("rejects an occupied current tile and cannot route through an intermediate NPC",()=>{
 expect(planNavigation({...field,navigation_grid:{...grid,objects:[{x:0,y:0}]}},{x:0,y:0})).toBeNull();
 const corridor={...field,navigation_grid:{...grid,tiles:[tile(0,0),tile(1,0),tile(2,0)],objects:[{x:1,y:0}]}};expect(planNavigation(corridor,{x:2,y:0})).toBeNull();
 const sideDoor={...field,navigation_grid:{...grid,tiles:[tile(0,0),tile(1,0,0,0x69,0)]}};expect(planNavigation(sideDoor,{x:1,y:0})).toBeNull();
 expect(planNavigation({...field,topology:{width:1,height:1,connections:[]}},{x:2,y:0})).toBeNull();
});

it("rejects an out-of-bounds goal even when a reachable frontier points toward it",()=>{
 const sparse={...field,topology:{width:2,height:2,connections:[]},navigation_grid:{...grid,tiles:[tile(0,0),tile(1,0)]}};
 expect(planNavigation(sparse,{x:2,y:0})).toBeNull();
});

it("returns the final coherent observation rather than an older press response",async()=>{
 const state:GameStateSnapshot={...field,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,navigation_grid:{elevation:3,tiles:[{x:0,y:0,collision:0,behavior:0,elevation:3},{x:1,y:0,collision:0,behavior:0,elevation:3}],objects:[],warps:[]}};
 const after={...state,position:{x:1,y:0},play_time_s:1};
 const result=await navigationTool({read:()=>Promise.resolve(state),press:()=>Promise.resolve({content:[{type:"text",text:"older press"}],details:{state:after}}),observe:()=>Promise.resolve({content:[{type:"text",text:"final coherent"}],details:{state:{...after,play_time_s:2}}})}).execute("nav",{x:1,y:0,map_id:[0,9]});
 expect(result.details).toMatchObject({state:{play_time_s:2}});expect(result.content).toContainEqual({type:"text",text:"final coherent"});
});

it("forwards deliberate walking to the ordinary press without creating a separate action",async()=>{
 const seen:unknown[]=[];
 const tool=navigationTool({read:()=>Promise.resolve(field),press:(_id,params)=>{seen.push(params);return Promise.resolve(result({...field,position:{x:0,y:1}}));},observe:()=>Promise.resolve(result({...field,position:{x:0,y:1}}))});
 await tool.execute("nav",{x:0,y:1,map_id:[0,9],walking:true});
 expect(seen).toEqual([{buttons:["DOWN"],walking:true}]);
});

// pokeemerald 731ad5b metatile_behaviors.h values. The readout draws all of these as '.'.
const corridor=(behavior:number)=>({...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,0,behavior),tile(2,0)],objects:[],warps:[]}});
it("walks the ordinary floor the game lets the player walk: sand, cave, mountain top, puddles and bridges",()=>{
 for(const behavior of [0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x16,0x17,0x1a,0x1b,0x21,0x24,0x25,0x28,0x2b,0x70,0x71,0x72,0x73,0x74,0x78,0x7a,0x7f,0xa0])
  expect(planNavigation(corridor(behavior),{x:2,y:0}),behavior.toString(16)).toEqual(["RIGHT","RIGHT"]);
});
it("crosses a Route 104 style beach of sand to the far side",()=>{
 const sand=(x:number,y:number)=>tile(x,y,0,0x21);
 const beach={...field,navigation_grid:{elevation:3,tiles:[tile(0,0),sand(1,0),sand(2,0),sand(1,1),tile(2,1,1)],objects:[],warps:[]}};
 expect(planNavigation(beach,{x:2,y:0})).toEqual(["RIGHT","RIGHT"]);
});
it("keeps refusing tiles the game refuses or moves the player off on foot",()=>{
 const refused=[0x10,0x11,0x12,0x13,0x14,0x15,0x19,0x22,0x2a,0x50,0x51,0x52,0x53,0x6c,0x6d,0x6f,
  0x20,0x26,0x27,0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0xd0,0xd2,0xbd,0xbe,
  0x0d,0x0e,0x0f,0x29,0x66,0xc4,
  0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0xc0,0xc1,
  0x38,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f,
  0xd1,0xd3,0xd4,0xd5,0xd6];
 for(const behavior of refused)expect(planNavigation(corridor(behavior),{x:2,y:0}),behavior.toString(16)).toBeNull();
});
