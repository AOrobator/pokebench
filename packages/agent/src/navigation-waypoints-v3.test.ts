import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {flagFeatures} from "./play-preset.js";
import {withNavigation,type CheckedNavigationTool} from "./navigation.js";

const bodies=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/waypoint-7945.json.gz",import.meta.url))).toString()) as Record<string,unknown>;
const A=parseGameState(bodies["22583"]),B=parseGameState(bodies["22641"]),RETURN=parseGameState(bodies["22689"]);
const goal={x:15,y:18,map_id:[24,11] as [number,number]};
const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
function harness(enabled:boolean,v2=true,reach=true){
 let state=A,presses=0;
 const result=()=>({content:[{type:"text" as const,text:"Recorded observation"}],details:{state}});
 const press={name:"press",label:"Press",description:"Offline",parameters:{},execute:async()=>{presses++;throw new Error("unexpected input");},executeChecked:async()=>{presses++;throw new Error("unexpected input");}} as unknown as CheckedNavigationTool;
 const observe={name:"observe",label:"Observe",description:"Offline",parameters:{},execute:async()=>result()} as unknown as AgentTool;
 const features={...flagFeatures(flags),"bounded-navigation-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"walkable-floor-v1":true,"elevation-transitions-v1":true,"navigation-truth-v1":true,"navigation-refusal-reasons-v1":true,"navigation-refusal-reasons-v2":v2,"exit-reachability-v1":reach,"navigation-refusal-reasons-v3":enabled};
 const tools=withNavigation([observe,press],features,{read:async()=>state});
 const tool=tools.find(t=>t.name==="navigate_to");if(tool===undefined)throw new Error("no navigation tool");
 return {set:(s:GameStateSnapshot)=>{state=s;},presses:()=>presses,call:async(target=goal)=>{const r=await tool.execute("offline",target);return r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");}};
}
const OLD_PERSON="Navigation: (15,18) is BOY_2 (person or object), which navigate_to cannot stand on; none of its free neighbouring tiles can be reached inside the 15x15 local map navigate_to plans over, but this map's walkable area reaches (15,19) next to it, so the way there leaves that local map; walk to (8,24) on its west edge first, then call navigate_to (15,18) again; 0 ordinary button attempts.\nRecorded observation";
const OLD_TILE="Navigation: no route to (15,18) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (15,18) first: (15,23) on the east edge, (9,31) on the south edge; walk to one, then call navigate_to (15,18) again; 0 ordinary button attempts.\nRecorded observation";

describe("navigation-refusal-reasons-v3 recorded control7945",()=>{
 it("OFF preserves both exact recorded refusal strings through the production factory",async()=>{
  const h=harness(false);expect(await h.call()).toBe(OLD_PERSON);h.set(B);expect(await h.call()).toBe(OLD_TILE);expect(h.presses()).toBe(0);
 });
 it("ON labels all person frontiers exploratory, keeps the equally near east alternative, and avoids the recorded return",async()=>{
  const h=harness(true);const first=await h.call();expect(first).toContain("Exploratory local-map edge tiles");expect(first).toContain("(8,24) on the west edge");expect(first).toContain("(22,24) on the east edge");expect(first).toContain("no route beyond these tiles is verified");expect(first).not.toContain("edge first, then call");
  h.set(B);await h.call({x:8,y:24,map_id:[24,11]});const second=await h.call();expect(second).toContain("(9,31) on the south edge");expect(second).not.toContain("(15,23) on the east edge");expect(second).toContain("previous refusal positions withheld");expect(h.presses()).toBe(0);
 });
 it("fixes person advice even when the existing tile-refusal-v2 switch is OFF",async()=>{
  const h=harness(true,false);expect(await h.call()).toContain("Exploratory local-map edge tiles");
 });
 it("keeps state per navigation tool instance and clears it on an observed map transition",async()=>{
  const h=harness(true);await h.call();h.set(B);expect(await h.call()).not.toContain("(15,23) on the east edge");
  const other=harness(true);other.set(B);expect(await other.call()).toContain("(15,23) on the east edge");
  h.set({...B,map_id:[0,19]});await h.call({x:8,y:24,map_id:[0,19]});h.set(B);expect(await h.call()).toContain("(15,23) on the east edge");
 });
 it("does not claim that exhausted exploration proves the destination unreachable",async()=>{
  const h=harness(true);await h.call();h.set(B);await h.call();h.set(RETURN);const text=await h.call();expect(text).toContain("Exploratory local-map edge tiles");expect(text).not.toContain("cannot be reached on foot");
 });
});
