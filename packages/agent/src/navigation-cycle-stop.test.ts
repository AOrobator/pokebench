import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {featuresOf} from "./features.js";
import {withNavigation,planNavigation} from "./navigation.js";

const ID="navigation-cycle-stop-v1";
interface Fixture {
 readonly goal:{x:number;y:number;map_id:[number,number]};
 readonly before:Record<string,number[]>;
 readonly presses:Record<string,string[][]>;
 readonly results:Record<string,{state_seq:number;text:string}>;
 readonly states:Record<string,unknown>;
}
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-cycle-0d5d.json.gz",import.meta.url))).toString()) as Fixture;
const snapshot=(seq:number):GameStateSnapshot=>parseGameState(fixture.states[String(seq)]);
const options={ledges:true,oneWay:true,floor:true,elevation:"game" as const};
const features=featuresOf(["bounded-navigation-v1","ledge-hops-v1","one-way-tiles-v1","walkable-floor-v1","elevation-transitions-v1","navigation-truth-v1","navigation-refusal-reasons-v1","navigation-refusal-reasons-v2","exit-reachability-v1"]);
const result=(state:GameStateSnapshot):AgentToolResult<unknown>=>({content:[{type:"text",text:"Recorded observation"}],details:{state}});
function recorded(turn:string,enabled:boolean){
 const before=fixture.before[turn],after=fixture.results[turn];if(before===undefined||after===undefined)throw new Error("missing recorded turn");
 let state=snapshot(before[0]??0),attempt=0;const buttons:string[][]=[];
 const press=(_id:string,args:{buttons:string[]},_signal?:AbortSignal,check?:(s:GameStateSnapshot|undefined)=>void)=>{
  check?.(state);expect(args.buttons).toEqual(fixture.presses[turn]?.[attempt]);buttons.push(args.buttons);
  attempt++;state=snapshot(before[attempt]??after.state_seq);return Promise.resolve(result(state));
 };
 const observe={name:"observe",label:"observe",description:"offline",parameters:{},execute:()=>Promise.resolve(result(state))} as unknown as AgentTool;
 const tool={name:"press",label:"press",description:"offline",parameters:{},execute:press,executeChecked:press} as unknown as CheckedPressTool;
 const nav=withNavigation([observe,tool],{...features,[ID]:enabled},{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("navigation missing");
 return {buttons,call:()=>nav.execute("recorded",fixture.goal)};
}
for(const turn of ["1031","1032"]){
 it(`OFF preserves 0d5d turn ${turn}'s eight native inputs and exact delivered status`,async()=>{
  const h=recorded(turn,false);const r=await h.call();expect(h.buttons).toEqual(fixture.presses[turn]);
  expect(r.content).toEqual([{type:"text",text:(fixture.results[turn]?.text??"")},{type:"text",text:"Recorded observation"}]);
  expect(r.details).toMatchObject({state:{position:{x:15,y:3}},navigation:{commands:8}});
 });
 it(`ON stops the internal cycle in 0d5d turn ${turn} before another repeated step`,async()=>{
  const h=recorded(turn,true);const r=await h.call();expect(h.buttons).toEqual([["RIGHT"],["LEFT"]]);
  expect(r.details).toMatchObject({state:{position:{x:15,y:3}},navigation:{commands:2}});
  const line=r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(line).toContain("route cycle");expect(line).toContain("stopped before repeating RIGHT");expect(line).not.toContain("call navigate_to again");expect(line).not.toContain("cannot be reached");
 });
}
it("the pinned native geometry reproduces the frontier reversal without invented walls",()=>{
 const seqs=fixture.before["1031"];if(seqs===undefined)throw new Error("missing states");
 expect(planNavigation(snapshot(seqs[0]??0),fixture.goal,options)?.[0]).toBe("RIGHT");
 expect(planNavigation(snapshot(seqs[1]??0),fixture.goal,options)?.[0]).toBe("LEFT");
});
