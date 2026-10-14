import {readFileSync} from "node:fs";
import {Type} from "typebox";
import {Value} from "typebox/value";
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
it("resets elevation on zero-elevation connectors and approaches a door from below",()=>{
 const grid={elevation:3,tiles:[tile(0,0),tile(1,0,0,0,0),tile(2,0,0,0,4)],objects:[],warps:[]};
 expect(planNavigation({...field,navigation_grid:grid},{x:2,y:0})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation({...field,navigation_grid:{...grid,tiles:[tile(0,0),tile(1,0,0,0,4)]}},{x:1,y:0})).toBeNull();
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


// Real layouts from pokeemerald map.bin (see the fixture's source field).
const Maps=Type.Object({source:Type.String(),maps:Type.Record(Type.String(),Type.Object({layout:Type.String(),note:Type.String(),width:Type.Integer(),height:Type.Integer(),player:Type.Tuple([Type.Integer(),Type.Integer()]),tiles:Type.Array(Type.Tuple([Type.Integer(),Type.Integer(),Type.Integer(),Type.Integer(),Type.Integer()]))}))});
const maps=Value.Parse(Maps,JSON.parse(readFileSync(new URL("../test-support/elevation-maps.json",import.meta.url),"utf8")));
const onMap=(name:string,player:{x:number;y:number},elevation:number,behaviors:ReadonlyMap<number,number>=new Map()):GameStateSnapshot=>{
 const map=maps.maps[name];if(map===undefined)throw new Error(name);
 const tiles=map.tiles.map(([x,y,collision,behavior,e])=>tile(x,y,collision,behaviors.get(behavior)??behavior,e));
 return {...field,position:player,topology:{width:map.width,height:map.height,connections:[]},navigation_grid:{elevation,tiles,objects:[],warps:[]}};
};
it("climbs the Route 104 pier stairs in both directions through elevation 0",()=>{
 expect(planNavigation(onMap("route104_pier",{x:13,y:51},4),{x:17,y:51})).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT"]);
 expect(planNavigation(onMap("route104_pier",{x:17,y:52},3),{x:12,y:52})).toEqual(["LEFT","LEFT","LEFT","LEFT","LEFT"]);
});
it("walks onto and across Littleroot's multi-level tiles without adopting elevation 15",()=>{
 expect(planNavigation(onMap("littleroot_multilevel",{x:10,y:10},3),{x:11,y:10})).toEqual(["RIGHT"]);
 expect(planNavigation(onMap("littleroot_multilevel",{x:10,y:10},3),{x:12,y:10})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(onMap("littleroot_multilevel",{x:11,y:10},3),{x:11,y:12})).toEqual(["DOWN","DOWN"]);
});
it("keeps the walker's elevation under the Route 110 Cycling Road deck",()=>{
 const plain=new Map([[0x70,0],[0x7f,0]]);
 expect(planNavigation(onMap("route110_under_deck",{x:15,y:70},3,plain),{x:19,y:70})).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT"]);
 expect(planNavigation(onMap("route110_under_deck",{x:15,y:70},3,plain),{x:17,y:68})).toBeNull();
 expect(planNavigation(onMap("route110_under_deck",{x:15,y:70},0,plain),{x:17,y:68})).toHaveLength(4);
});
// pokeemerald 731ad5b: MB_JUMP_EAST/WEST/NORTH/SOUTH = 0x38..0x3B carry collision; moving
// into one in its direction jumps two tiles (GetLedgeJumpDirection, PlayerJumpLedge).
const ledgeField=(ledge:number,extra:Partial<Grid>={},position={x:1,y:0}):GameStateSnapshot=>({...field,position,navigation_grid:{elevation:3,tiles:[tile(1,0),tile(1,1,1,ledge),tile(1,2),tile(0,1),tile(2,1),tile(0,0),tile(0,2),tile(2,0),tile(2,2)],objects:[],warps:[],...extra}});
type Grid=NonNullable<GameStateSnapshot["navigation_grid"]>;
it("hops a ledge only in its arrow direction and only with ledge hops enabled",()=>{
 const south=ledgeField(0x3b,{tiles:[tile(1,0),tile(1,1,1,0x3b),tile(1,2)]});
 expect(planNavigation(south,{x:1,y:2},{ledges:true})).toEqual(["DOWN"]);
 expect(planNavigation(south,{x:1,y:2})).toBeNull();
 expect(planNavigation({...south,position:{x:1,y:2}},{x:1,y:0},{ledges:true})).toBeNull();
 expect(planNavigation(south,{x:1,y:1},{ledges:true})).toBeNull();
 const east=ledgeField(0x38,{tiles:[tile(0,1),tile(1,1,1,0x38),tile(2,1)]},{x:0,y:1});
 expect(planNavigation(east,{x:2,y:1},{ledges:true})).toEqual(["RIGHT"]);
 expect(planNavigation({...east,position:{x:2,y:1}},{x:0,y:1},{ledges:true})).toBeNull();
 const west=ledgeField(0x39,{tiles:[tile(0,1),tile(1,1,1,0x39),tile(2,1)]},{x:2,y:1});
 expect(planNavigation(west,{x:0,y:1},{ledges:true})).toEqual(["LEFT"]);
 const north=ledgeField(0x3a,{tiles:[tile(1,0),tile(1,1,1,0x3a),tile(1,2)]},{x:1,y:2});
 expect(planNavigation(north,{x:1,y:0},{ledges:true})).toEqual(["UP"]);
 expect(planNavigation({...north,position:{x:1,y:0}},{x:1,y:2},{ledges:true})).toBeNull();
});
it("prefers a hop over a longer walk and never lands on blocked, occupied, warp or unknown tiles",()=>{
 expect(planNavigation(ledgeField(0x3b),{x:1,y:2},{ledges:true})).toEqual(["DOWN"]);
 expect(planNavigation(ledgeField(0x3b),{x:1,y:2})).toEqual(["LEFT","DOWN","DOWN","RIGHT"]);
 const column=(landing:Partial<Grid>,tiles=[tile(1,0),tile(1,1,1,0x3b),tile(1,2),tile(1,3)])=>ledgeField(0x3b,{tiles,...landing});
 expect(planNavigation(column({}),{x:1,y:3},{ledges:true})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(column({objects:[{x:1,y:2}]}),{x:1,y:3},{ledges:true})).toBeNull();
 expect(planNavigation(column({warps:[{x:1,y:2}]}),{x:1,y:2},{ledges:true})).toBeNull();
 expect(planNavigation(column({objects:[{x:1,y:1}]}),{x:1,y:3},{ledges:true})).toBeNull();
 expect(planNavigation(column({},[tile(1,0),tile(1,1,1,0x3b),tile(1,2,1)]),{x:1,y:2},{ledges:true})).toBeNull();
 expect(planNavigation(column({},[tile(1,0),tile(1,1,1,0x3b),tile(1,2,0,0x10)]),{x:1,y:2},{ledges:true})).toBeNull();
 expect(planNavigation(column({},[tile(1,0),tile(1,1,1,0x3b),tile(1,2,0,0,4)]),{x:1,y:2},{ledges:true})).toBeNull();
 expect(planNavigation({...column({},[tile(1,0),tile(1,1,1,0x3b)]),topology:{width:5,height:5,connections:[]}},{x:1,y:4},{ledges:true})).toBeNull();
});
it("expects a two-tile landing after a hop press and stops on any other movement",async()=>{
 const south=ledgeField(0x3b,{tiles:[tile(1,0),tile(1,1,1,0x3b),tile(1,2),tile(1,3)]});
 const run=async(after:GameStateSnapshot,ledges:boolean)=>{let current=south;const buttons:string[][]=[];
  const tool=navigationTool({ledges,read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);current=after;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
  const outcome=await tool.execute("nav",{x:1,y:2,map_id:[0,9]});return {buttons,text:outcome.content[0]?.type==="text"?outcome.content[0].text:"",description:tool.description};};
 const hopped=await run({...south,position:{x:1,y:2}},true);
 expect(hopped.buttons).toEqual([["DOWN"]]);expect(hopped.text).toContain("arrived at requested coordinate");
 expect(hopped.description).toContain("hops a ledge only in its arrow direction");
 const short=await run({...south,position:{x:1,y:1}},true);expect(short.text).toContain("unexpected movement");
 const disabled=await run({...south,position:{x:1,y:2}},false);expect(disabled.buttons).toEqual([]);expect(disabled.text).toContain("no supported local path");
 expect(disabled.description).not.toContain("ledge");
});
