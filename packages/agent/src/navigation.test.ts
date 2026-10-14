import {readFileSync} from "node:fs";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {expect,it} from "vitest";
import {planNavigation,navigationTool,MAX_FULL_ROUTE_COMMANDS,NO_PROGRESS_PRESSES} from "./navigation.js";
import {parseGameState} from "./game-state.js";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
const sharedGrid=JSON.parse(readFileSync(new URL("./fixtures/full-map-grid.json",import.meta.url),"utf8")) as NonNullable<GameStateSnapshot["map_grid"]>;
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
 // A finished step re-reads only the tile it ends on (ShiftStillObjectEventCoords): leaving 15 takes the new height.
 const row=(...heights:number[])=>({...grid,tiles:heights.map((e,x)=>tile(x,0,0,0,e))});
 expect(planNavigation({...field,navigation_grid:row(3,0,15,4,3)},{x:4,y:0})).toBeNull();
 expect(planNavigation({...field,navigation_grid:row(3,0,15,4,3)},{x:3,y:0})).toEqual(["RIGHT","RIGHT","RIGHT"]);
 expect(planNavigation({...field,navigation_grid:row(15,0,4)},{x:2,y:0})).toEqual(["RIGHT","RIGHT"]);
 // Search identity is tile plus height: the junction is reachable only when entered from the 0 side.
 const junction={...field,position:{x:0,y:1},navigation_grid:{...grid,tiles:[tile(0,1),tile(1,1),tile(2,1,0,0,15),tile(3,1,0,0,4),tile(0,2,0,0,0),tile(1,2,0,0,4),tile(2,2,0,0,4)]}};
 expect(planNavigation(junction,{x:3,y:1})).toEqual(["DOWN","RIGHT","RIGHT","UP","RIGHT"]);
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

type Cell={collision?:number;behavior?:number;elevation?:number};
const mapGrid=(width:number,height:number,cell:(x:number,y:number)=>Cell,extra:{objects?:{x:number;y:number}[];warps?:{x:number;y:number}[]}={}):NonNullable<GameStateSnapshot["map_grid"]>=>({width,height,elevation:3,
 rows:Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>{const c=cell(x,y);return (((c.collision??0)<<12)|((c.elevation??3)<<8)|(c.behavior??0)).toString(16).padStart(4,"0");}).join("")),
 objects:extra.objects??[],warps:extra.warps??[]});
const fullField=(grid:NonNullable<GameStateSnapshot["map_grid"]>,position={x:0,y:0}):GameStateSnapshot=>({...field,position,map_grid:grid,topology:{width:grid.width,height:grid.height,connections:[]}});
// A serpentine 40x140 route: walls on every other row with one gap alternating sides.
const serpentine=mapGrid(40,140,(x,y)=>y%2===1&&x!==(y%4===1?39:0)?{collision:1}:{});

it("plans over the whole current map when asked, far beyond the local window",()=>{
 const path=planNavigation(fullField(serpentine),{x:0,y:138},{mode:"full"});
 expect(path).not.toBeNull();expect(path?.length).toBe(70*39+138);
 expect(planNavigation(fullField(serpentine),{x:0,y:138})).toEqual(["DOWN"]);
});

it("full-map planning keeps the local rules: collision, objects, water, layers, goal-only warps and doors from below",()=>{
 const open=mapGrid(5,5,()=>({}));
 expect(planNavigation(fullField(open),{x:4,y:0},{mode:"full"})).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT"]);
 expect(planNavigation(fullField(mapGrid(3,1,x=>x===1?{behavior:0x10}:{})),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(mapGrid(3,1,()=>({}),{warps:[{x:1,y:0}]})),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(mapGrid(3,1,()=>({}),{warps:[{x:1,y:0}]})),{x:1,y:0},{mode:"full"})).toEqual(["RIGHT"]);
 expect(planNavigation(fullField(mapGrid(3,1,()=>({}),{objects:[{x:1,y:0}]})),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(mapGrid(3,1,x=>x===2?{elevation:4}:{})),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(mapGrid(3,1,x=>x===1?{elevation:0}:x===2?{elevation:4}:{})),{x:2,y:0},{mode:"full"})).toEqual(["RIGHT","RIGHT"]);
 const door=mapGrid(1,2,(_x,y)=>y===0?{collision:1,behavior:0x69,elevation:0}:{},{warps:[{x:0,y:0}]});
 expect(planNavigation(fullField(door,{x:0,y:1}),{x:0,y:0},{mode:"full"})).toEqual(["UP"]);
 expect(planNavigation(fullField(open),{x:5,y:0},{mode:"full"})).toBeNull();
});

it("full-map planning rejects missing or malformed whole-map geometry",()=>{
 const open=mapGrid(3,2,()=>({}));
 expect(planNavigation({...fullField(open),map_grid:null},{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField({...open,rows:[open.rows[0]??""]}),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField({...open,rows:[open.rows[0]??"","0000"]}),{x:2,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(open,{x:7,y:0}),{x:2,y:0},{mode:"full"})).toBeNull();
});

// The array open list this replaced: re-sorted every pop, stable on ties.
function referencePlan(state:GameStateSnapshot,goal:{x:number;y:number}):string[]|null {
 const grid=state.navigation_grid;if(grid==null||state.position===null)return null;
 const k=(p:{x:number;y:number})=>`${String(p.x)},${String(p.y)}`,d=(a:{x:number;y:number},b:{x:number;y:number})=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
 const tiles=new Map(grid.tiles.map(t=>[k(t),t])),occupied=new Set(grid.objects.map(k)),warps=new Set(grid.warps.map(k));
 if(occupied.has(k(goal)))return null;
 type N={p:{x:number;y:number};e:number;cost:number;path:string[]};
 let best:N={p:state.position,e:grid.elevation,cost:0,path:[]};
 const pending:N[]=[{p:state.position,e:grid.elevation,cost:0,path:[]}],costs=new Map<string,number>();
 while(pending.length){
  pending.sort((a,b)=>(a.cost+d(a.p,goal))-(b.cost+d(b.p,goal)));const n=pending.shift();if(n===undefined)break;
  const id=`${k(n.p)}:${String(n.e)}`;if((costs.get(id)??Infinity)<=n.cost)continue;costs.set(id,n.cost);
  if(d(n.p,goal)<d(best.p,goal)||(d(n.p,goal)===d(best.p,goal)&&n.cost<best.cost))best=n;
  if(d(n.p,goal)===0)return n.path;
  for(const [dir,dx,dy] of [["UP",0,-1],["DOWN",0,1],["LEFT",-1,0],["RIGHT",1,0]] as const){
   const next={x:n.p.x+dx,y:n.p.y+dy},t=tiles.get(k(next));if(t===undefined||occupied.has(k(next))||t.collision!==0||t.behavior!==0)continue;
   if(warps.has(k(next))&&d(next,goal)!==0)continue;
   if(n.e!==0&&t.elevation!==0&&t.elevation!==15&&t.elevation!==n.e)continue;
   pending.push({p:next,e:t.elevation===15?n.e:t.elevation,cost:n.cost+1,path:[...n.path,dir]});
  }
 }
 return !tiles.has(k(goal))&&best.path.length>0?best.path:null;
}

it("the heap open list returns exactly the paths the sorted array did",()=>{
 let seed=7;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 let compared=0,frontier=0;
 for(let trial=0;trial<400;trial++){
  const tiles=[];for(let y=0;y<15;y++)for(let x=0;x<15;x++)tiles.push(tile(x,y,x+y>0&&random()<0.25?1:0,0,random()<0.1?0:3));
  const pick=()=>({x:Math.floor(random()*15),y:Math.floor(random()*15)});
  const objects=Array.from({length:3},pick).filter(p=>p.x+p.y>0),warps=Array.from({length:3},pick).filter(p=>p.x+p.y>0);
  const distant=trial%2===1;
  const goal=distant?{x:15+Math.floor(random()*10),y:Math.floor(random()*25)}:pick();
  const state={...field,navigation_grid:{elevation:3,tiles,objects,warps},...(distant?{topology:{width:25,height:25,connections:[]}}:{})};
  if(!distant&&tiles.find(t=>t.x===goal.x&&t.y===goal.y)?.collision!==0)continue;
  const expected=referencePlan(state,goal);
  expect(planNavigation(state,goal)).toEqual(expected);compared++;if(distant&&expected!==null)frontier++;
 }
 expect(compared).toBeGreaterThan(250);expect(frontier).toBeGreaterThan(50);
});

it("plans an 80x80 map with random walls quickly",()=>{
 let seed=11;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 const grid=mapGrid(80,80,(x,y)=>x+y>0&&x+y<158&&random()<0.22?{collision:1}:{});
 const started=performance.now();for(let i=0;i<20;i++)planNavigation(fullField(grid),{x:79,y:79},{mode:"full"});
 expect((performance.now()-started)/20).toBeLessThan(250);
});

it("full-route navigation walks past eight presses to arrival and keeps per-press stops",async()=>{
 const corridor=mapGrid(30,1,()=>({}));let current=fullField(corridor);let presses=0;
 const tool=navigationTool({fullMap:true,read:()=>Promise.resolve(current),press:()=>{presses++;current={...current,position:{x:(current.position?.x??0)+1,y:0}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 expect(tool.description).toContain("whole current map");
 const outcome=await tool.execute("nav",{x:29,y:0,map_id:[0,9]});
 expect(presses).toBe(29);expect(outcome.details).toMatchObject({navigation:{status:"arrived at requested coordinate",commands:29}});
 current=fullField(corridor);presses=0;
 const blocked=navigationTool({fullMap:true,read:()=>Promise.resolve(current),press:()=>{presses++;if(presses<12)current={...current,position:{x:(current.position?.x??0)+1,y:0}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const stopped=await blocked.execute("nav",{x:29,y:0,map_id:[0,9]});
 expect(presses).toBe(12);expect(stopped.details).toMatchObject({navigation:{status:"blocked; inspect obstacle and choose another approach"}});
});

it("full-route navigation has its own safety bound and needs whole-map geometry",async()=>{
 expect(MAX_FULL_ROUTE_COMMANDS).toBe(512);
 expect(()=>navigationTool({fullMap:true,read:()=>Promise.resolve(field),press:()=>Promise.resolve(result(field)),observe:()=>Promise.resolve(result(field)),maxCommands:513})).toThrow(/bound/);
 let presses=0;const tool=navigationTool({fullMap:true,read:()=>Promise.resolve(field),press:()=>{presses++;return Promise.resolve(result(field));},observe:()=>Promise.resolve(result(field))});
 const outcome=await tool.execute("nav",{x:2,y:0,map_id:[0,9]});expect(presses).toBe(0);
 expect(outcome.details).toMatchObject({navigation:{status:"field input or navigation geometry unavailable"}});
});

it("full-route navigation stops when the route stops getting shorter",async()=>{
 const corridor=mapGrid(11,1,()=>({}));const start=fullField(corridor);let presses=0;
 const tool=navigationTool({fullMap:true,read:()=>Promise.resolve(start),press:()=>{presses++;return Promise.resolve(result({...start,position:{x:1,y:0}}));},observe:()=>Promise.resolve(result(start))});
 const outcome=await tool.execute("nav",{x:10,y:0,map_id:[0,9]});
 expect(presses).toBe(NO_PROGRESS_PRESSES);expect(NO_PROGRESS_PRESSES).toBe(16);
 expect(outcome.details).toMatchObject({navigation:{status:"route not converging; inspect obstacles and choose another approach",commands:16}});
});

it("decodes the whole-map grid the game server actually produces",()=>{
 const grid=parseGameState({...fullField(mapGrid(1,1,()=>({}))),map_grid:sharedGrid,topology:null,position:{x:1,y:1}}).map_grid;
 expect(grid).toEqual(sharedGrid);
 const state={...fullField(sharedGrid,{x:1,y:1}),topology:null};
 expect(planNavigation(state,{x:4,y:4},{mode:"full"})?.length).toBe(6);
 expect(planNavigation(state,{x:1,y:0},{mode:"full"})).toBeNull();
 expect(planNavigation(state,{x:0,y:0},{mode:"full"})).toBeNull();
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
 expect(planNavigation(onMap("route110_under_deck",{x:16,y:69},4,plain),{x:16,y:67})).toEqual(["UP","UP"]);
 expect(planNavigation(onMap("route110_under_deck",{x:16,y:69},4,plain),{x:19,y:70})).toBeNull();
});
it("whole-map planning follows the same elevation rule on real layouts",()=>{
 const asFull=(state:GameStateSnapshot):GameStateSnapshot=>{
  const grid=state.navigation_grid,topology=state.topology;if(grid==null||topology==null)throw new Error("fixture");
  const cells=new Map(grid.tiles.map(t=>[`${String(t.x)},${String(t.y)}`,t]));
  return {...state,map_grid:{...mapGrid(topology.width,topology.height,(x,y)=>cells.get(`${String(x)},${String(y)}`)??{collision:1}),elevation:grid.elevation},navigation_grid:null};
 };
 const plain=new Map([[0x70,0],[0x7f,0]]);
 expect(planNavigation(asFull(onMap("route104_pier",{x:13,y:51},4)),{x:17,y:51},{mode:"full"})).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT"]);
 expect(planNavigation(asFull(onMap("littleroot_multilevel",{x:11,y:10},3)),{x:11,y:12},{mode:"full"})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(asFull(onMap("route110_under_deck",{x:16,y:69},4,plain)),{x:19,y:70},{mode:"full"})).toBeNull();
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
 const fromBridge=ledgeField(0x3b,{tiles:[tile(1,0,0,0,15),tile(1,1,1,0x3b),tile(1,2,0,0,0),tile(1,3,0,0,4)]});
 expect(planNavigation(fromBridge,{x:1,y:3},{ledges:true})).toEqual(["DOWN","DOWN"]);
 // A jump updates height on the ledge tile, then at the landing; a 15 landing keeps the ledge-tile update.
 const onto15=(takeoff:number,ledge:number,after:number)=>ledgeField(0x3b,{tiles:[tile(1,0,0,0,takeoff),tile(1,1,1,0x3b,ledge),tile(1,2,0,0,15),tile(1,3,0,0,after)]});
 expect(planNavigation(onto15(3,3,3),{x:1,y:3},{ledges:true})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(onto15(3,3,4),{x:1,y:3},{ledges:true})).toBeNull();
 expect(planNavigation(onto15(3,0,4),{x:1,y:3},{ledges:true})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(onto15(15,0,4),{x:1,y:3},{ledges:true})).toBeNull();
 expect(planNavigation(onto15(3,15,4),{x:1,y:3},{ledges:true})).toBeNull();
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
const grassStrip=(grass:readonly number[],behavior=2)=>({...field,navigation_grid:{elevation:3,tiles:[0,1,2,3,4,5,6].flatMap(x=>[tile(x,0,0,grass.includes(x)?behavior:0),tile(x,1)]),objects:[],warps:[]}});
it("prices tall and long grass at 1.5 per step only when the grass cost option is on",()=>{
 const straight=["RIGHT","RIGHT","RIGHT","RIGHT","RIGHT","RIGHT"],detour=["DOWN",...straight,"UP"];
 for(const behavior of [2,3]){
  expect(planNavigation(grassStrip([1,2,3,4,5],behavior),{x:6,y:0})).toEqual(straight);
  expect(planNavigation(grassStrip([1,2,3,4,5],behavior),{x:6,y:0},{grassCost:true})).toEqual(detour);
  expect(planNavigation(grassStrip([2,3,4],behavior),{x:6,y:0},{grassCost:true})).toEqual(straight);
 }
 expect(planNavigation({...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,0,2)],objects:[],warps:[]}},{x:1,y:0},{grassCost:true})).toEqual(["RIGHT"]);
});
it("passes the grass cost port through to the planner",async()=>{
 const first=async(grassCost:boolean|undefined)=>{const buttons:string[][]=[];let current:GameStateSnapshot=grassStrip([1,2,3,4,5]);
  const tool=navigationTool({read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);current={...current,map_id:[1,0]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current)),...(grassCost===undefined?{}:{grassCost})});
  await tool.execute("nav",{x:6,y:0,map_id:[0,9]},new AbortController().signal);return buttons;};
 expect(await first(true)).toEqual([["DOWN"]]);
 expect(await first(false)).toEqual([["RIGHT"]]);
 expect(await first(undefined)).toEqual([["RIGHT"]]);
});
it("prices a ledge hop that lands in grass at one step plus the grass step",()=>{
 const twin=ledgeField(0x3b,{tiles:[tile(1,0),tile(2,0),tile(1,1,1,0x3b),tile(2,1,1,0x3b),tile(1,2,0,2),tile(2,2),tile(2,3)]});
 expect(planNavigation(twin,{x:2,y:3},{ledges:true})).toEqual(["DOWN","RIGHT","DOWN"]);
 expect(planNavigation(twin,{x:2,y:3},{ledges:true,grassCost:true})).toEqual(["RIGHT","DOWN","DOWN"]);
});

it("whole-map planning hops ledges only with ledge hops on and expects the two-tile landing",async()=>{
 const column=mapGrid(1,4,(_x,y)=>y===1?{collision:1,behavior:0x3b}:{});
 expect(planNavigation(fullField(column),{x:0,y:3},{mode:"full",ledges:true})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(fullField(column),{x:0,y:3},{mode:"full"})).toBeNull();
 expect(planNavigation(fullField(column,{x:0,y:3}),{x:0,y:0},{mode:"full",ledges:true})).toBeNull();
 let current=fullField(column);const buttons:string[][]=[];
 const tool=navigationTool({fullMap:true,ledges:true,read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);const y=current.position?.y??0;current={...current,position:{x:0,y:y===0?2:y+1}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 expect(tool.description).toContain("whole current map");expect(tool.description).toContain("hops a ledge only in its arrow direction");
 const outcome=await tool.execute("nav",{x:0,y:3,map_id:[0,9]});
 expect(buttons).toEqual([["DOWN"],["DOWN"]]);expect(outcome.details).toMatchObject({navigation:{status:"arrived at requested coordinate",commands:2}});
});

it("whole-map walking stops at once when a hop lands one or three tiles on",async()=>{
 const column=mapGrid(1,5,(_x,y)=>y===1?{collision:1,behavior:0x3b}:{});
 for(const landed of [1,3]){
  let current=fullField(column);let presses=0;
  const tool=navigationTool({fullMap:true,ledges:true,read:()=>Promise.resolve(current),press:()=>{presses++;current={...current,position:{x:0,y:landed}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
  const outcome=await tool.execute("nav",{x:0,y:4,map_id:[0,9]});
  expect(presses).toBe(1);expect(outcome.content[0]?.type==="text"?outcome.content[0].text:"").toContain("unexpected movement");
 }
});

// pokeemerald 731ad5b IsMetatileDirectionallyImpassable: a move is refused when the current
// tile walls its exit side or the next tile walls its entry side (MetatileBehavior_Is*Blocked).
const room=(chair:number,position={x:0,y:1}):GameStateSnapshot=>({...field,position,navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(x=>[0,1,2].map(y=>x===1&&y===1?tile(1,1,0,chair):tile(x,y))),objects:[],warps:[]}});
it("crosses an edge-wall tile only through its open sides when one-way tiles are on",()=>{
 expect(planNavigation(room(0xc0),{x:2,y:1},{oneWay:true})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(room(0xc0),{x:1,y:1},{oneWay:true})).toEqual(["RIGHT"]);
 expect(planNavigation(room(0xc0,{x:1,y:0}),{x:1,y:2},{oneWay:true})).toEqual(["LEFT","DOWN","DOWN","RIGHT"]);
 expect(planNavigation(room(0xc0,{x:1,y:0}),{x:1,y:1},{oneWay:true})).toEqual(["LEFT","DOWN","RIGHT"]);
 expect(planNavigation(room(0xc0,{x:1,y:1}),{x:1,y:2},{oneWay:true})).toEqual(["LEFT","DOWN","RIGHT"]);
 expect(planNavigation(room(0xc1,{x:1,y:0}),{x:1,y:2},{oneWay:true})).toEqual(["DOWN","DOWN"]);
 expect(planNavigation(room(0xc1),{x:2,y:1},{oneWay:true})).toEqual(["UP","RIGHT","RIGHT","DOWN"]);
 expect(planNavigation(room(0x30),{x:2,y:1},{oneWay:true})).toEqual(["RIGHT","UP","RIGHT","DOWN"]);
 expect(planNavigation(room(0x30,{x:2,y:1}),{x:1,y:1},{oneWay:true})).toEqual(["UP","LEFT","DOWN"]);
 expect(planNavigation(room(0x31,{x:2,y:1}),{x:1,y:1},{oneWay:true})).toEqual(["LEFT"]);
 expect(planNavigation(room(0x31),{x:1,y:1},{oneWay:true})).toEqual(["UP","RIGHT","DOWN"]);
 expect(planNavigation(room(0x37,{x:1,y:0}),{x:1,y:2},{oneWay:true})).toEqual(["DOWN","RIGHT","DOWN","LEFT"]);
 expect(planNavigation(room(0x37,{x:1,y:0}),{x:2,y:1},{oneWay:true})).toEqual(["DOWN","RIGHT"]);
});
it("keeps edge-wall tiles as walls with one-way tiles off",()=>{
 expect(planNavigation(room(0xc0),{x:2,y:1})).toEqual(["UP","RIGHT","RIGHT","DOWN"]);
 expect(planNavigation(room(0xc0),{x:1,y:1})).toBeNull();
 expect(planNavigation(room(0xc0),{x:1,y:1},{oneWay:false})).toBeNull();
});
it("says it respects walled sides only when one-way tiles are on",()=>{
 const ports={read:()=>Promise.resolve(field),press:()=>Promise.resolve(result(field)),observe:()=>Promise.resolve(result(field))};
 expect(navigationTool({...ports,oneWay:true}).description).toContain("never crosses a walled side of a + tile");
 expect(navigationTool(ports).description).not.toContain("walled side");
});
it("walks through the chair from the side with the real tool",async()=>{
 let current=room(0xc0);const buttons:string[][]=[];
 const tool=navigationTool({oneWay:true,read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);const p=current.position??{x:0,y:0};current={...current,position:{x:p.x+1,y:p.y}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const outcome=await tool.execute("nav",{x:2,y:1,map_id:[0,9]});
 expect(buttons).toEqual([["RIGHT"],["RIGHT"]]);expect(outcome.content[0]?.type==="text"?outcome.content[0].text:"").toContain("arrived");
});
it("hops a ledge out of an edge-wall tile because the game's ledge jump ignores walled sides",()=>{
 const state=ledgeField(0x3b,{tiles:[tile(1,0,0,0xc0),tile(1,1,1,0x3b),tile(1,2)]});
 expect(planNavigation(state,{x:1,y:2},{ledges:true,oneWay:true})).toEqual(["DOWN"]);
 expect(planNavigation({...state,navigation_grid:{elevation:3,tiles:[tile(1,0,0,0xc0),tile(1,1)],objects:[],warps:[]}},{x:1,y:1},{ledges:true,oneWay:true})).toBeNull();
});
it.each([[0x30,["RIGHT"]],[0x31,["LEFT"]],[0x32,["UP"]],[0x33,["DOWN"]],[0x34,["UP","RIGHT"]],[0x35,["UP","LEFT"]],[0x36,["DOWN","RIGHT"]],[0x37,["DOWN","LEFT"]],[0xbe,["LEFT","RIGHT"]],[0xc0,["UP","DOWN"]],[0xc1,["LEFT","RIGHT"]]] as const)("behavior %i walls exactly %j, entering and leaving",(behavior,sides)=>{
 const from={UP:{x:1,y:0},DOWN:{x:1,y:2},LEFT:{x:0,y:1},RIGHT:{x:2,y:1}} as const;
 for(const side of ["UP","DOWN","LEFT","RIGHT"] as const){
  const walledSide=(sides as readonly string[]).includes(side);
  const enter=planNavigation(room(behavior,from[side]),{x:1,y:1},{oneWay:true});
  const leave=planNavigation(room(behavior,{x:1,y:1}),from[side],{oneWay:true});
  expect(enter?.length,`enter through ${side}`).toBe(walledSide?3:1);
  expect(leave?.length,`leave through ${side}`).toBe(walledSide?3:1);
 }
});

it("whole-map planning respects edge walls only with one-way tiles on",()=>{
 const room=mapGrid(3,3,(x,y)=>x===1&&y===1?{behavior:0xc0}:{});
 expect(planNavigation(fullField(room,{x:1,y:0}),{x:1,y:2},{mode:"full",oneWay:true})?.length).toBe(4);
 expect(planNavigation(fullField(room,{x:0,y:1}),{x:2,y:1},{mode:"full",oneWay:true})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(fullField(room,{x:0,y:1}),{x:2,y:1},{mode:"full"})?.length).toBe(4);
 const tool=navigationTool({fullMap:true,oneWay:true,ledges:true,read:()=>Promise.resolve(field),press:()=>Promise.resolve(result(field)),observe:()=>Promise.resolve(result(field))});
 expect(tool.description).toContain("hops a ledge only in its arrow direction, never crosses a walled side of a + tile, and never crosses a warp");
 const local=navigationTool({oneWay:true,ledges:true,read:()=>Promise.resolve(field),press:()=>Promise.resolve(result(field)),observe:()=>Promise.resolve(result(field))});
 expect(local.description).toContain("hops a ledge only in its arrow direction, never crosses a walled side of a + tile, and stops");
});

it("elevation-transitions-v1 off restores the pre-transition rule on both geometries",()=>{
 const stairs={elevation:3,tiles:[tile(0,0),tile(1,0,0,0,0),tile(2,0,0,0,4)],objects:[],warps:[]};
 const local={...field,navigation_grid:stairs};
 expect(planNavigation(local,{x:2,y:0})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(local,{x:2,y:0},{elevation:"game"})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(local,{x:2,y:0},{elevation:"legacy"})).toBeNull();
 const deck={...field,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,0,0,15),tile(2,0)],objects:[],warps:[]}};
 expect(planNavigation(deck,{x:2,y:0})).toEqual(["RIGHT","RIGHT"]);
 expect(planNavigation(deck,{x:2,y:0},{elevation:"legacy"})).toBeNull();
 const whole=fullField(mapGrid(3,1,x=>x===1?{elevation:0}:x===2?{elevation:4}:{}));
 expect(planNavigation(whole,{x:2,y:0},{mode:"full",elevation:"legacy"})).toBeNull();
 expect(planNavigation(whole,{x:2,y:0},{mode:"full"})).toEqual(["RIGHT","RIGHT"]);
});
it("elevation-transitions-v1 off keeps the legacy ledge landing rule",()=>{
 const hop={...field,position:{x:1,y:0},navigation_grid:{elevation:3,tiles:[tile(1,0),tile(1,1,1,0x3b),tile(1,2,0,0,15),tile(1,3,0,0,4)],objects:[],warps:[]}};
 expect(planNavigation(hop,{x:1,y:2},{ledges:true,elevation:"legacy"})).toBeNull();
 expect(planNavigation(hop,{x:1,y:2},{ledges:true})).toEqual(["DOWN"]);
 const flat={...field,position:{x:1,y:0},navigation_grid:{elevation:3,tiles:[tile(1,0),tile(1,1,1,0x3b),tile(1,2,0,0,0),tile(1,3,0,0,4)],objects:[],warps:[]}};
 expect(planNavigation(flat,{x:1,y:3},{ledges:true,elevation:"legacy"})).toBeNull();
 expect(planNavigation(flat,{x:1,y:3},{ledges:true})).toEqual(["DOWN","DOWN"]);
});
it("the tool plans with the legacy elevation rule only when the switch is off",async()=>{
 const stairs={...field,map_id:[0,9] as [number,number],navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0,0,0,0),tile(2,0,0,0,4)],objects:[],warps:[]}};
 const pressed:unknown[]=[];
 const ports={read:()=>Promise.resolve(stairs),press:(_id:string,params:unknown)=>{pressed.push(params);return Promise.resolve(result(stairs));},observe:()=>Promise.resolve(result(stairs))};
 const legacy=await navigationTool({...ports,elevation:"legacy"}).execute("nav",{x:2,y:0,map_id:[0,9]});
 expect(legacy.details).toMatchObject({navigation:{status:"no supported local path; choose a reachable local waypoint",commands:0}});
 expect(pressed).toEqual([]);
 await navigationTool(ports).execute("nav",{x:2,y:0,map_id:[0,9]});
 expect(pressed).toEqual([{buttons:["RIGHT"]}]);
});

it("never walks onto a counter and says where to stand to talk across one",async()=>{
 const counter={...field,position:{x:0,y:2},navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0),tile(2,0),tile(0,1,1,0x80),tile(1,1,1,0x80),tile(2,1,1,0x80),tile(0,2),tile(1,2),tile(2,2)],objects:[{x:1,y:0}],warps:[]}};
 expect(planNavigation(counter,{x:1,y:1})).toBeNull();
 expect(planNavigation(counter,{x:0,y:0})).toBeNull();
 const status=async(goal:{x:number;y:number},on=true):Promise<[string|null,number]>=>{
  let presses=0;const tool=navigationTool({counters:on,read:()=>Promise.resolve(counter),press:()=>{presses++;return Promise.resolve(result(counter));},observe:()=>Promise.resolve(result(counter))});
  const outcome=await tool.execute("nav",{...goal,map_id:[0,9]},new AbortController().signal);
  return [outcome.content[0]?.type==="text"?outcome.content[0].text:null,presses];
 };
 const generic="target is a counter or behind one; you cannot stand on a counter, but you can face it from a reachable adjacent tile and press A to talk to someone behind it";
 const across="target is behind a counter; walk to (1,2), face UP toward the counter at (1,1) and press A to talk across it";
 for(const goal of [{x:1,y:0},{x:1,y:1}]){const [text,presses]=await status(goal);expect(presses).toBe(0);expect(text).toContain(across);}
 const [empty]=await status({x:2,y:1});
 expect(empty).toContain(generic);
 const [nobody]=await status({x:0,y:0});
 const [off]=await status({x:1,y:0},false);
 expect(off).toContain("no supported local path");expect(off).not.toContain("counter");
 expect(nobody).toContain("no supported local path");
});

it("names a stand tile only when navigate_to could reach it",async()=>{
 const base={elevation:3,tiles:[tile(0,0),tile(1,0),tile(0,1,1,0x80),tile(1,1),tile(0,2),tile(1,2)],objects:[{x:0,y:0}],warps:[]};
 const hint=async(grid:typeof base):Promise<string|null>=>{
  const state={...field,position:{x:1,y:2},navigation_grid:grid};
  const outcome=await navigationTool({counters:true,read:()=>Promise.resolve(state),press:()=>Promise.reject(new Error("pressed")),observe:()=>Promise.resolve(result(state))}).execute("nav",{x:0,y:0,map_id:[0,9]},new AbortController().signal);
  return outcome.content[0]?.type==="text"?outcome.content[0].text:null;
 };
 expect(await hint(base)).toContain("walk to (0,2), face UP toward the counter at (0,1)");
 const generic="target is a counter or behind one; you cannot stand on a counter, but you can face it from a reachable adjacent tile";
 for(const blocked of [
  {...base,tiles:base.tiles.map(t=>t.x===0&&t.y===2?tile(0,2,1):t)},
  {...base,tiles:base.tiles.map(t=>t.x===0&&t.y===2?tile(0,2,0,0x10):t)},
  {...base,tiles:base.tiles.map(t=>t.x===0&&t.y===2?tile(0,2,0,0,4):t),elevation:3},
  {...base,objects:[...base.objects,{x:0,y:2}]},
  {...base,tiles:base.tiles.filter(t=>!(t.x===0&&t.y===2))},
 ]){const text=await hint(blocked);expect(text).toContain(generic);expect(text).not.toContain("walk to (");}
 const sideways={elevation:3,tiles:[tile(0,0),tile(1,0,1,0x80),tile(2,0),tile(2,1)],objects:[{x:0,y:0}],warps:[]};
 const state={...field,position:{x:2,y:1},navigation_grid:sideways};
 const outcome=await navigationTool({counters:true,read:()=>Promise.resolve(state),press:()=>Promise.reject(new Error("pressed")),observe:()=>Promise.resolve(result(state))}).execute("nav",{x:0,y:0,map_id:[0,9]},new AbortController().signal);
 expect(outcome.content[0]?.type==="text"?outcome.content[0].text:null).toContain("walk to (2,0), face LEFT toward the counter at (1,0)");
});

it("gives the counter hint on the whole map and stays quiet on malformed local geometry",async()=>{
 const center=mapGrid(5,8,(x,y)=>y===1&&x===2?{collision:1,behavior:0x80}:y<=1&&x!==2?{collision:1}:{},{objects:[{x:2,y:0}]});
 const state=fullField(center,{x:4,y:7});
 const hint=async(s:GameStateSnapshot,fullMap:boolean):Promise<string|null>=>{
  const outcome=await navigationTool({fullMap,counters:true,read:()=>Promise.resolve(s),press:()=>Promise.reject(new Error("pressed")),observe:()=>Promise.resolve(result(s))}).execute("nav",{x:2,y:0,map_id:[0,9]},new AbortController().signal);
  return outcome.content[0]?.type==="text"?outcome.content[0].text:null;
 };
 expect(await hint(state,true)).toContain("target is behind a counter; walk to (2,2), face UP toward the counter at (2,1) and press A to talk across it");
 const duplicated={...field,navigation_grid:{...grid,tiles:[...grid.tiles,tile(0,0)],objects:[{x:2,y:0}]}};
 const text=await hint(duplicated,false);expect(text).toContain("no supported local path");expect(text).not.toContain("counter");
});
