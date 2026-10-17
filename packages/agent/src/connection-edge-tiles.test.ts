import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {navigationTool,withNavigation,type NavigationPorts} from "./navigation.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {ALL_ON,featureInfo,playHarnessFeatures,SERVER_FEATURES,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {parseEvent,type RunEvent} from "./events.js";
import {observeTool,pressTool} from "./game-tools.js";

// Showcase bundle run 2026-10-16T00-34-26_qwen36-gpu1_show, Littleroot after BIRCH_RESCUE_REQUESTED:
// the recorded state at seq 3606, the refusal at seq 3607 and the supervisor briefing at seq 3684,
// with the events from seq 3421 that the briefing is built from.
interface Fixture {readonly features:Record<string,boolean>;readonly state:Record<string,unknown>;readonly refusal:string;readonly supervisor:string;readonly events:readonly Record<string,unknown>[]}
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/connection-edges-show.json",import.meta.url),"utf8")) as Fixture;
const ID="connection-edge-tiles-v1";
// Switches registered after the run was recorded were not in it, so they start off here.
const RUN:FeatureSet={...Object.fromEntries(Object.keys(ALL_ON).map(k=>[k,false])) as FeatureSet,...FIXTURE.features,[ID]:false};
const EDGES=[{x:10,y:0},{x:11,y:0}];
// What the server sends with the switch on: the same topology plus the crossable edge tiles.
const withEdges=(state:Record<string,unknown>):Record<string,unknown>=>{
 const topology=state["topology"] as {connections:Record<string,unknown>[]}|null|undefined;
 return topology==null?state:{...state,topology:{...topology,connections:topology.connections.map(c=>c["direction"]==="NORTH"?{...c,edges:EDGES}:c)}};
};
const ON_REFUSAL="Navigation: (8,0) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (10,0), an edge tile of this map: stand on (10,0) and press UP to walk off the map NORTH to ROUTE101 (map 0/16); 0 ordinary button attempts.";
const EDGE_LINE="- Ways off this map across its edge (the game's map connections): NORTH -> ROUTE101 (map 0/16): stand on (10,0) or (11,0) and press UP";

const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
async function refusal(state:GameStateSnapshot,goal:{x:number;y:number},extra:Partial<NavigationPorts>):Promise<string> {
 const tool=navigationTool({read:()=>Promise.resolve(state),press:()=>{throw new Error("pressed");},observe:()=>Promise.resolve(result(state)),refusalReasons:true,...extra});
 const outcome=await tool.execute("nav",{...goal,map_id:[0,9]},new AbortController().signal);
 return outcome.content[0]?.type==="text"?outcome.content[0].text:"";
}

describe("connection-edge-tiles-v1 navigate_to refusals (showcase turn 178, seq 3607)",()=>{
 const recorded=parseGameState(FIXTURE.state);
 const on=():GameStateSnapshot=>parseGameState(withEdges(FIXTURE.state));
 it("OFF reproduces the recorded refusal byte for byte, with or without edges in the state",async()=>{
  expect(await refusal(recorded,{x:8,y:0},{})).toBe(FIXTURE.refusal);
  expect(await refusal(on(),{x:8,y:0},{})).toBe(FIXTURE.refusal);
  expect(await refusal(on(),{x:8,y:0},{connectionEdges:false})).toBe(FIXTURE.refusal);
 });
 it("ON names the map the nearest edge tile leads to and the button that crosses",async()=>{
  expect(await refusal(on(),{x:8,y:0},{connectionEdges:true})).toBe(ON_REFUSAL);
  expect(await refusal(on(),{x:9,y:0},{connectionEdges:true})).toBe(ON_REFUSAL.replace("(8,0)","(9,0)"));
 });
 it("ON changes nothing when the nearest tile is not an edge or the server sent no edges",async()=>{
  expect(await refusal(on(),{x:9,y:1},{connectionEdges:true})).toBe("Navigation: (9,1) is a wall or other solid tile, not a walkable tile; the nearest walkable tile navigate_to can reach is (9,2); 0 ordinary button attempts.");
  expect(await refusal(recorded,{x:8,y:0},{connectionEdges:true})).toBe(FIXTURE.refusal);
 });
 it("the production factory threads the switch",async()=>{
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  let posts=0;
  const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=on();if(url.endsWith("/action")){posts++;body={status:"success"};}else if(url.endsWith("/queue_status"))body={queue_empty:true};else if(url.endsWith("/pokebench/observation"))body={state:on(),state_text:"observed",screenshot_base64:png.toString("base64")};return Promise.resolve(new Response(JSON.stringify(body)));};
  const run=async(features:FeatureSet):Promise<string>=>{
   const base:AgentTool[]=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})];
   const tool=withNavigation(base,features,{read:()=>Promise.resolve(on())}).find(t=>t.name==="navigate_to");
   if(tool===undefined)throw new Error("Missing navigation");
   const outcome=await tool.execute("nav",{x:8,y:0,map_id:[0,9]});
   return (outcome.details as {navigation:{status:string}}).navigation.status;
  };
  const status=(text:string):string=>text.replace(/^Navigation: /,"").replace(/; 0 ordinary button attempts\.$/,"");
  expect(await run(RUN)).toBe(status(FIXTURE.refusal));
  expect(await run({...RUN,[ID]:true})).toBe(status(ON_REFUSAL));
  expect(posts).toBe(0);
 });
});

function replay(features:FeatureSet,edges:boolean):SupervisorBriefing {
 const b=new SupervisorBriefing(features);
 for(const raw of FIXTURE.events){
  const event=raw["type"]==="state"&&edges?withEdges(raw):raw;
  b.observe(parseEvent(JSON.stringify(event)));
 }
 return b;
}

describe("connection-edge-tiles-v1 supervisor bearings (showcase turn 187, seq 3684)",()=>{
 it("OFF reproduces the recorded briefing byte for byte, with or without edges in the state",()=>{
  expect(replay(RUN,false).text("ineffective",187)).toBe(FIXTURE.supervisor);
  expect(replay(RUN,true).text("ineffective",187)).toBe(FIXTURE.supervisor);
  expect(replay({...RUN,[ID]:true},false).text("ineffective",187)).toBe(FIXTURE.supervisor);
 });
 it("ON adds one line with the exit tiles, right after the untried list",()=>{
  const lines=FIXTURE.supervisor.split("\n");
  const at=lines.findIndex(l=>l.startsWith("- Listed here that you have not tried yet:"))+1;
  expect(at).toBeGreaterThan(0);
  const expected=[...lines.slice(0,at),EDGE_LINE,...lines.slice(at)].join("\n");
  expect(replay({...RUN,[ID]:true},true).text("ineffective",187)).toBe(expected);
 });
 it("the stall briefing shares the line; the text-only note does not change",()=>{
  const on=replay({...RUN,[ID]:true},true),off=replay(RUN,true);
  expect(on.stallText({kind:"milestone_drought",minutes:5},187).split("\n")).toContain(EDGE_LINE);
  expect(off.stallText({kind:"milestone_drought",minutes:5},187).split("\n")).not.toContain(EDGE_LINE);
  expect(on.textOnly(2,1,3)).toBe(off.textOnly(2,1,3));
 });
 it("a blocked edge says so; DIVE and directions without edge data are left out",()=>{
  const b=new SupervisorBriefing({...RUN,[ID]:true});
  const state=FIXTURE.events.filter(e=>e["type"]==="state").at(-1) as Record<string,unknown>;
  const topology={width:20,height:20,connections:[
   {direction:"NORTH",offset:0,destination:[0,16],destination_name:"ROUTE101",edges:[]},
   {direction:"WEST",offset:0,destination:[0,17],destination_name:"ROUTE102"},
   {direction:"DIVE",offset:0,destination:[0,18],destination_name:"UNDERWATER",edges:[{x:1,y:1}]},
   {direction:"EAST",offset:-2,destination:[0,19],destination_name:"ROUTE103",edges:[{x:19,y:3},{x:19,y:4},{x:19,y:5},{x:19,y:9}]},
  ]};
  for(const raw of FIXTURE.events){b.observe(parseEvent(JSON.stringify(raw===state?{...state,topology}:raw)));}
  expect(b.text("ineffective",187).split("\n")).toContain("- Ways off this map across its edge (the game's map connections): NORTH -> ROUTE101 (map 0/16): no tile on this edge can be walked across; EAST -> ROUTE103 (map 0/19): stand on any tile from (19,3) to (19,5) or (19,9) and press RIGHT");
 });
});

describe("connection-edge-tiles-v1 registry, presets and state schema",()=>{
 it("is a default-off server observation switch recorded last, with OFF copy",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-43)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
 it("presets that omit it run with it off",()=>{
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  const base={version:2,id:"edges",target:null,limits:{maxTurns:10,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}};
  const rest=Object.fromEntries(Object.entries(RUN).filter(([k])=>k!==ID));
  expect(presetFeatures(parsePlayPreset({...base,features:rest}))[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...base,features:{...rest,[ID]:true}}))[ID]).toBe(true);
 });
 it("state accepts edge tiles and rejects malformed ones",()=>{
  const state=withEdges(FIXTURE.state);
  expect(parseGameState(state).topology?.connections[0]?.edges).toEqual(EDGES);
  const bad=(edges:unknown)=>({...FIXTURE.state,topology:{width:20,height:20,connections:[{direction:"NORTH",offset:0,destination:[0,16],destination_name:"ROUTE101",edges}]}});
  expect(()=>parseGameState(bad([{x:-1,y:0}]))).toThrow();
  expect(()=>parseGameState(bad([{x:1,y:0,z:2}]))).toThrow();
  expect(()=>parseGameState(bad("10,0"))).toThrow();
  const event:RunEvent=parseEvent(JSON.stringify(withEdges(FIXTURE.events.find(e=>e["type"]==="state") as Record<string,unknown>)));
  expect(event.type).toBe("state");
 });
});
