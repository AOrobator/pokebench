import {describe,expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import STATES from "./fixtures/route-summary-states.json" with {type:"json"};
import {playSystemPrompt} from "./play-config.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {ALL_ON,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {playGameTools} from "./play-wiring.js";
import {guideRow} from "./rayquaza-guide.js";
import {plannedRoute} from "./semantic-navigation.js";
import {ROUTE_HEADER,ROUTE_LINE_CAP,ROUTE_SUMMARY_SENTENCE,SIGHT_CHECK_CAP,guideTiles,routeSummary,withRouteSummary} from "./route-summary.js";
import type {TrainerSightPorts,TrainerSightReply} from "./trainer-sight.js";

// Recorded states: 6056 T120 (Route 102), aeb8 T319 (Route 116), T416 (Route 104), T654 (Route 110), and a locked-field T416.
const [ROUTE102,ROUTE116,ROUTE104,ROUTE110,LOCKED]=(STATES as unknown[]).map(state=>parseGameState(state)) as [GameStateSnapshot,GameStateSnapshot,GameStateSnapshot,GameStateSnapshot,GameStateSnapshot];
const ON={...ALL_ON,"route-summary-v1":true};
const OFF={...ALL_ON,"route-summary-v1":false};

type Point={readonly x:number;readonly y:number};
// A server that says one trainer sees a set of tiles; reports the first one on the route, as check_route does.
function sees(tiles:readonly Point[],map:readonly [number,number]):{check:TrainerSightPorts["check"];calls:number} {
 const server={calls:0,check:(_map:readonly [number,number],route:readonly Point[]):Promise<TrainerSightReply>=>{
  server.calls+=1;
  const step=route.findIndex(p=>tiles.some(t=>t.x===p.x&&t.y===p.y));
  const hit=route[step];
  const trainer={local_id:3,graphics_id:1,sprite_kind:"BUG_CATCHER",trainer_id:1,double:false,x:25,y:15,facing:"LEFT" as const,sight:3,loaded:true};
  return Promise.resolve({available:true,map_id:[map[0],map[1]],trainers:[trainer],sightings:hit===undefined?[]:[{local_id:3,step:step+1,tile:[hit.x,hit.y],from:[25,15],facing:"LEFT"}]} as TrainerSightReply);
 }};
 return server;
}

describe("route summary on recorded states",()=>{
 it("6056 T120: shows the west exit the model traced by hand",async()=>{
  const text=await routeSummary(ROUTE102,ON,sees([],[0,17]).check,null);
  expect(text).toContain(ROUTE_HEADER);
  expect(text).toMatch(/- WEST edge \[navigate_to_target target \{"kind":"connection","direction":"WEST"\}\]: \d+ steps, out of every unbeaten trainer's sight\./);
  expect(text).toMatch(/- EAST edge \[navigate_to_target target \{"kind":"connection","direction":"EAST"\}\]: \d+ steps?/);
 });

 it("6056 T120: names who sees the route and the steps of one out of sight",async()=>{
  const plain=await routeSummary(ROUTE102,ON,sees([],[0,17]).check,null);
  const steps=Number(/WEST edge .*?: (\d+) steps/.exec(plain??"")?.[1]);
  const route=plannedRoute(ROUTE102,{route:"connection",direction:"WEST"},ON);
  const tile=route?.tiles[2];
  if(tile===undefined)throw new Error("no route");
  const text=await routeSummary(ROUTE102,ON,sees([tile],[0,17]).check,null);
  const line=text?.split("\n").find(l=>l.startsWith("- WEST"))??"";
  expect(line).toContain(`${String(steps)} steps, crosses the sight of object 3, sprite BUG_CATCHER at (25,15);`);
  expect(line).toMatch(/\d+ steps out of their sight\.$/);
 });

 it("says so when no route avoids the sight",async()=>{
  const edges=ROUTE102.topology?.connections.find(c=>c.direction==="EAST")?.edges??[];
  const text=await routeSummary(ROUTE102,ON,sees(edges,[0,17]).check,null);
  expect(text?.split("\n").find(l=>l.startsWith("- EAST"))).toContain("no route out of sight.");
 });

 it.each([["aeb8 T319",ROUTE116],["aeb8 T416",ROUTE104],["aeb8 T654",ROUTE110]] as const)("%s: stays inside its cap, whole lines only",async(_name,state)=>{
  const text=await routeSummary(state,ON,null,null);
  const lines=text?.split("\n")??[];
  expect(lines[0]).toBe(ROUTE_HEADER);
  const routes=lines.filter(l=>l.startsWith("- "));
  expect(routes.length).toBeLessThanOrEqual(ROUTE_LINE_CAP);
  for(const line of routes)expect(line).toMatch(/: (\d+ steps?|no route navigate_to_target can walk from here)[^]*\.$/);
  if(routes.length===ROUTE_LINE_CAP)expect(lines.at(-1)).toMatch(/^\d+ more left out\.$/);
 });

 it("puts exits before people, and warps before other interactions",async()=>{
  const lines=(await routeSummary(ROUTE110,ON,null,null))?.split("\n").filter(l=>l.startsWith("- "))??[];
  expect(lines[0]).toMatch(/^- (NORTH|SOUTH|WEST|EAST) edge/);
  const firstWarp=lines.findIndex(l=>l.startsWith("- warp")),firstObject=lines.findIndex(l=>l.startsWith("- object"));
  if(firstWarp!==-1&&firstObject!==-1)expect(firstWarp).toBeLessThan(firstObject);
 });

 it("never asks the server more than its cap, and says what it did not check",async()=>{
  const here=ROUTE110.position??{x:0,y:0};
  const everyTile=[...Array(100).keys()].flatMap(x=>[...Array(100).keys()].map(y=>({x,y}))).filter(p=>Math.abs(p.x-here.x)+Math.abs(p.y-here.y)>6);
  const map=ROUTE110.map_id;
  if(map===null)throw new Error("no map");
  const server=sees(everyTile,map);
  const text=await routeSummary(ROUTE110,ON,server.check,null);
  expect(server.calls).toBe(SIGHT_CHECK_CAP);
  expect(text).toContain("trainer sight not checked.");
 });

 it("a route that dead-ends on sight keeps looking, and says when the checks ran out",async()=>{
  const here=ROUTE102.position??{x:0,y:0};
  const line=[...Array(45).keys()].map(y=>({x:here.x-3,y}));
  const text=await routeSummary(ROUTE102,ON,sees(line,[0,17]).check,null);
  expect(text?.split("\n").find(l=>l.startsWith("- WEST"))).toMatch(/no route out of sight|a route out of sight was not checked/);
 });

 it("reports a check the server could not make",async()=>{
  const text=await routeSummary(ROUTE102,ON,()=>Promise.resolve({available:false,reason:"map grid unreadable"}),null);
  expect(text).toContain("trainer sight not checked.");
 });

 it("leaves sight out when the check is off",async()=>{
  const text=await routeSummary(ROUTE102,ON,null,null);
  expect(text).toMatch(/WEST edge .*: \d+ steps\.$/m);
  expect(text).not.toContain("sight");
 });

 it("says when a target has no walking route",async()=>{
  const walled=ROUTE102.map_grid==null?ROUTE102:{...ROUTE102,map_grid:{...ROUTE102.map_grid,objects:[...ROUTE102.map_grid.objects,{x:35,y:14},{x:34,y:15}]}};
  const text=await routeSummary(walled,ON,null,null);
  expect(text).toContain("no route navigate_to_target can walk from here.");
 });

 it("adds the guide's tiles on the guide's map, first",async()=>{
  const text=await routeSummary(ROUTE102,ON,null,{map:"Route102",note:"Beat Youngster Calvin at (33,14) and skip the others, then (20,10)."});
  const lines=text?.split("\n").filter(l=>l.startsWith("- "))??[];
  expect(lines[0]).toMatch(/^- guide tile \(33,14\): 1 step to \(\d+,\d+\) beside it\.$|^- guide tile \(33,14\): \d+ steps? to \(\d+,\d+\) beside it\.$/);
  expect(lines[1]).toMatch(/^- guide tile \(20,10\): \d+ steps\.$/);
 });

 it("ignores a guide row about another map",async()=>{
  const text=await routeSummary(ROUTE102,ON,null,{map:"GraniteCave_1F",note:"Take the ball at (17,7)."});
  expect(text).not.toContain("guide tile");
 });

 it("says nothing off the overworld or with no targets",async()=>{
  expect(await routeSummary(LOCKED,ON,null,null)).toBeNull();
  expect(await routeSummary({...ROUTE102,screen:"battle"},ON,null,null)).toBeNull();
  expect(await routeSummary({...ROUTE102,in_battle:true},ON,null,null)).toBeNull();
  expect(await routeSummary({...ROUTE102,position:null},ON,null,null)).toBeNull();
  expect(await routeSummary({...ROUTE102,topology:null,interaction_targets:[]},ON,null,null)).toBeNull();
 });

 it("keeps one guide tile per place, without repeats",()=>{
  expect(guideTiles("(1,2) then (1,2) then (30,4), x=23, y=20-24")).toEqual([{x:1,y:2},{x:30,y:4}]);
 });
});

describe("against the server's own flood",()=>{
 it.each([["6056 T120",ROUTE102],["aeb8 T319",ROUTE116],["aeb8 T416",ROUTE104],["aeb8 T654",ROUTE110]] as const)("%s: every map edge the flood reaches on foot has a route",(_name,state)=>{
  const reach=state.exit_reach;
  for(const c of reach?.connections??[]){
   if(c.reach!=="foot"||!["NORTH","SOUTH","EAST","WEST"].includes(c.direction))continue;
   expect(plannedRoute(state,{route:"connection",direction:c.direction as "NORTH"},ON),c.direction).not.toBeNull();
  }
 });
});

describe("the switch",()=>{
 const readout="Screen: overworld\nLocation: ROUTE 102 (map 0/17)\nPosition: X=34, Y=14\nMoney: 1";
 const tool=(name:string,state:GameStateSnapshot=ROUTE102):AgentTool=>({name,label:name,description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state}})});
 const ports={check:null,guide:()=>null};

 it("off returns the tools as they were, and the same readout bytes",async()=>{
  const tools=[tool("observe")];
  const wrapped=withRouteSummary(tools,OFF,ports);
  expect(wrapped[0]).toBe(tools[0]);
  const result=await wrapped[0]?.execute("1",{});
  expect(result?.content).toEqual([{type:"text",text:readout}]);
 });

 it("on puts the block under Position and keeps the rest of the readout",async()=>{
  const result=await withRouteSummary([tool("observe")],ON,ports)[0]?.execute("1",{});
  const part=result?.content[0];
  const text=part?.type==="text"?part.text:"";
  expect(text.startsWith("Screen: overworld\nLocation: ROUTE 102 (map 0/17)\nPosition: X=34, Y=14\nRoutes from where you stand")).toBe(true);
  expect(text.endsWith("\nMoney: 1")).toBe(true);
 });

 it("wraps navigate_to and press, and leaves other tools alone",()=>{
  const other=tool("battle_action");
  const wrapped=withRouteSummary([tool("press"),tool("navigate_to"),other],ON,ports);
  expect(wrapped[0]).not.toBe(undefined);
  expect(wrapped[2]).toBe(other);
 });

 it("leaves a result with no state or no Location alone",async()=>{
  const bare:AgentTool={...tool("observe"),execute:()=>Promise.resolve({content:[{type:"text",text:"nothing"}],details:{}})};
  expect((await withRouteSummary([bare],ON,ports)[0]?.execute("1",{}))?.content).toEqual([{type:"text",text:"nothing"}]);
  const noLocation:AgentTool={...tool("observe"),execute:()=>Promise.resolve({content:[{type:"text",text:"nothing"}],details:{state:ROUTE102}})};
  expect((await withRouteSummary([noLocation],ON,ports)[0]?.execute("1",{}))?.content).toEqual([{type:"text",text:"nothing"}]);
 });

 it("the production factory honors it, and asks the game server for sight",async()=>{
  const none=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
  let asked=0;
  const source={read:()=>Promise.resolve(ROUTE102),trainerSight:()=>{asked+=1;return Promise.resolve({available:false as const,reason:"unread"});}};
  const recorder={subscribe:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
  const run=async(features:FeatureSet):Promise<string>=>{
   const observe=playGameTools([tool("observe")],features,source,recorder).find(t=>t.name==="observe");
   const part=(await observe?.execute("1",{}))?.content[0];
   return part?.type==="text"?part.text:"";
  };
  expect(await run({...none,"full-map-navigation-v1":true})).toBe(readout);
  expect(asked).toBe(0);
  const on=await run({...none,"full-map-navigation-v1":true,"route-summary-v1":true});
  expect(on).toContain(ROUTE_HEADER);
  expect(on).not.toContain("trainer sight");
  const sighted=await run({...none,"full-map-navigation-v1":true,"route-summary-v1":true,"trainer-sight-check-v1":true});
  expect(sighted).toContain("trainer sight not checked.");
  expect(asked).toBeGreaterThan(0);
 });

 it("reads the guide row in force only when both switches are on",()=>{
  const subscribed:unknown[]=[];
  const recorder={subscribe:(observer:unknown)=>{subscribed.push(observer);}};
  expect(guideRow({...ALL_ON,"route-summary-v1":false},recorder)()).toBeNull();
  expect(guideRow({...ALL_ON,"rq-milestone-guide-v1":false},recorder)()).toBeNull();
  expect(subscribed).toHaveLength(0);
  // The guide's first row is about no one map.
  expect(guideRow(ALL_ON,recorder)()).toBeNull();
  expect(subscribed).toHaveLength(1);
 });

 it("the system prompt carries the sentence only when on",()=>{
  expect(playSystemPrompt(ON,null)).toContain(ROUTE_SUMMARY_SENTENCE);
  expect(playSystemPrompt(OFF,null)).not.toContain(ROUTE_SUMMARY_SENTENCE);
 });
});
