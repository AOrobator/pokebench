import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type TObject} from "typebox";
import {Value} from "typebox/value";
import {checkEvent,type RunEvent} from "./events.js";
import {becauseDescription,citationText,withCitedDestination,type DestinationCitationFacts} from "./cited-destination.js";

interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
const T272=CAAA.find(e=>e.type==="tool_result"&&e.turn===272);

const Args=Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),map_id:Type.Tuple([Type.Integer(),Type.Integer()]),walking:Type.Optional(Type.Boolean())},{additionalProperties:false});
function fakes(content:AgentToolResult<unknown>["content"]=[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text:"Navigation: arrived at requested coordinate"}]) {
 const calls:unknown[]=[];
 const nav:AgentTool={name:"navigate_to",label:"Walk",description:"Walk to a coordinate.",parameters:Args,execute:(_id,params)=>{calls.push(params);return Promise.resolve({content,details:undefined});}};
 const observe:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"x"}],details:undefined})};
 return {calls,nav,observe};
}
function harness(on=true,options={fullMap:false,exitReach:false},content?:AgentToolResult<unknown>["content"]) {
 const subs:((e:RunEvent)=>void)[]=[];const checks:{facts:DestinationCitationFacts;text:string|null}[]=[];
 const f=fakes(content);
 const tools=withCitedDestination([f.observe,f.nav],on,{subscribe:fn=>{subs.push(fn);},destinationCitation:(facts,text)=>{checks.push({facts,text});}},options);
 const feed=(events:readonly RunEvent[])=>{for(const e of events)for(const s of subs)s(e);};
 return {...f,subs,checks,tools,feed};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");
const goal={x:7,y:16,map_id:[0,9]};
const shown=(turn:number,text:string,is_error=false):RunEvent=>checkEvent({v:1,run:RECORDED["4caa"].run,seq:800000+turn,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn,id:`r${String(turn)}`,name:"press",is_error,duration_ms:1,text,frames:[]});

describe("cited-destination-v1 schema",()=>{
 it("navigate_to gains a required because; the rest of its schema, and every other tool, stay the same",()=>{
  const h=harness();
  const nav=h.tools[1];if(nav===undefined)throw Error("no navigate_to");
  const params=nav.parameters as TObject;
  expect(params.required).toEqual(["x","y","map_id","because"]);
  expect(params.properties.x).toEqual(Args.properties.x);
  expect(params.properties.walking).toEqual(Args.properties.walking);
  expect(params.properties.because).toMatchObject({type:"string",minLength:1,description:becauseDescription({fullMap:false,exitReach:false})});
  expect(Value.Check(params,{...goal,because:"head back to the LAB"})).toBe(true);
  expect(Value.Check(params,goal)).toBe(false);
  expect(Value.Check(params,{...goal,because:""})).toBe(false);
  expect(nav.description).toBe("Walk to a coordinate. Give because: the line the game showed you, quoted, that makes this the place to go.");
  expect(h.tools[0]).toBe(h.observe);
 });
 it("the because text accounts for whole-map navigation and exit reachability",()=>{
  expect(becauseDescription({fullMap:false,exitReach:false})).toBe("Required. Quote, word for word, what the game showed you that makes this the place to go: a person's words, the Story goal line, or a readout line that shows the destination (a door, a person's position, an exit or a Map connections line). Copy it; do not paraphrase or add to it.");
  expect(becauseDescription({fullMap:true,exitReach:false})).toContain("or a readout line that shows the destination on this map (a door, a person's position, an exit or a Map connections line).");
  expect(becauseDescription({fullMap:true,exitReach:true}).endsWith(" An exit the readout says cannot be reached on foot from where you stand is not a reason to walk to it.")).toBe(true);
 });
 it("OFF hands back the very same tools and subscribes to nothing",()=>{
  const h=harness(false);
  expect(h.subs).toHaveLength(0);expect(h.tools[1]).toBe(h.nav);expect(h.tools[0]).toBe(h.observe);
 });
});

describe("cited-destination-v1 check",()=>{
 it("4caa T272: MAY's line, quoted across its line break and in other case, is found; the walk gets no because and the result is unchanged",async()=>{
  const h=harness();h.feed(CAAA);
  expect(T272).toBeDefined();
  const r=await h.tools[1]?.execute("n",{...goal,because:"“Well, it’s time to head back to the lab.”"});
  expect(textOf(r ?? {content:[],details:undefined})).toBe("|Navigation: arrived at requested coordinate");
  expect(h.calls).toEqual([goal]);
  expect(h.checks).toEqual([{facts:{tool_call_id:"n",because:"“Well, it’s time to head back to the lab.”",verdict:"found",found_turn:272,x:7,y:16,map_id:[0,9]},text:null}]);
 });
 it("a quote the game never showed starts the result with one line saying so, and the walk still runs",async()=>{
  const h=harness();h.feed(CAAA);
  const because="MAY said the LAB is in RUSTBORO CITY";
  const r=await h.tools[1]?.execute("n",{...goal,walking:true,because});
  const line=`Because: "${because}" is not in anything the game has shown you this run (results, readouts and dialogue). navigate_to walked anyway; nothing the game showed you supports this destination as you quoted it.`;
  expect(textOf(r ?? {content:[],details:undefined})).toBe(`|${line}\nNavigation: arrived at requested coordinate`);
  expect(h.calls).toEqual([{...goal,walking:true}]);
  expect(h.checks[0]?.facts.verdict).toBe("not_found");expect(h.checks[0]?.text).toBe(line);
  expect(citationText("not_found",because)).toBe(line);
 });
 it("a single word is not a quote: it is not checked, and the result says so",async()=>{
  const h=harness();h.feed(CAAA);
  const r=await h.tools[1]?.execute("n",{...goal,because:" \"LAB\" "});
  expect(textOf(r ?? {content:[],details:undefined})).toBe("|Because: \" \"LAB\" \" is too short to be a quote, so it was not checked; quote the whole line the game showed you. navigate_to walked anyway.\nNavigation: arrived at requested coordinate");
  expect(h.checks[0]?.facts).toMatchObject({verdict:"too_short",found_turn:null});
  expect(citationText("found","x")).toBeNull();
 });
 it("only results shown before the call count, an error result never does, and the newest result that has it is cited",async()=>{
  const h=harness();
  h.feed([shown(3,"Location: OLDALE TOWN"),shown(4,"MOM: Go see the LAB now",true),shown(5,"Location: OLDALE TOWN"),shown(6,"Way in: door at (7,16)")]);
  await h.tools[1]?.execute("a",{...goal,because:"Go see the LAB now"});
  await h.tools[1]?.execute("b",{...goal,because:"location: oldale   town"});
  expect(h.checks.map(c=>[c.facts.verdict,c.facts.found_turn])).toEqual([["not_found",null],["found",3]]);
  h.feed([shown(7,"MOM: Go see the LAB now")]);
  await h.tools[1]?.execute("c",{...goal,because:"Go see the LAB now"});
  expect(h.checks[2]?.facts).toMatchObject({verdict:"found",found_turn:7});
 });
 it("a result with no text part gets the line as its own part; arguments without because pass straight through",async()=>{
  const h=harness(true,{fullMap:false,exitReach:false},[{type:"image",data:"x",mimeType:"image/png"}]);
  const r=await h.tools[1]?.execute("n",{...goal,because:"nowhere at all"});
  expect(r?.content[0]).toEqual({type:"text",text:citationText("not_found","nowhere at all")});
  await h.tools[1]?.execute("m",goal);
  await h.tools[1]?.execute("k",{x:1});
  expect(h.calls).toEqual([goal,goal,{x:1}]);
  expect(h.checks).toHaveLength(1);
 });
});

describe("cited-destination-v1 review round 1",()=>{
 it("the harness's own Because line, echoing the model's words, never counts as something the game showed",async()=>{
  const h=harness();h.feed(CAAA);
  for(const because of ["the LAB is in RUSTBORO CITY","the LAB is in\nRUSTBORO CITY","the LAB is in\r\nRUSTBORO CITY"])for(const id of [`${because}1`,`${because}2`]){
   const r=await h.tools[1]?.execute(id,{...goal,because});
   const text=textOf(r ?? {content:[],details:undefined}).replace(/^\|/,"");
   expect(text.startsWith("Because: ")).toBe(true);
   h.feed([checkEvent({v:1,run:RECORDED["4caa"].run,seq:900000+h.checks.length,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn:300+h.checks.length,id,name:"navigate_to",is_error:false,duration_ms:1,text,frames:[]})]);
  }
  expect(h.checks.map(c=>c.facts.verdict)).toEqual(["not_found","not_found","not_found","not_found","not_found","not_found"]);
  // The same words shown by the game, across a line break, are still found.
  h.feed([checkEvent({v:1,run:RECORDED["4caa"].run,seq:910000,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn:400,id:"g",name:"press",is_error:false,duration_ms:1,text:"MAY: \"the LAB is in\nRUSTBORO CITY\"",frames:[]})]);
  await h.tools[1]?.execute("n9",{...goal,because:"the LAB is in\nRUSTBORO CITY"});
  expect(h.checks.at(-1)?.facts).toMatchObject({verdict:"found",found_turn:400});
 });
});
