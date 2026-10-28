import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {INSTRUCTION_MEMORY_CAP_CHARS,InstructionMemoryCap,codePoints,omittedLine,type CapEpisode,type CapRow} from "./instruction-memory-cap.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {observedInstructions} from "./observed-instructions.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,ALL_ON,type FeatureSet} from "./features.js";
import {flagFeatures} from "./play-preset.js";

type Trainer={local_id:number;x:number;y:number;trainer_id:number;defeated:boolean;sprite_kind:string};
interface StateOpts {seq:number;map?:[number,number];location?:string;position?:{x:number;y:number};facing?:string|null;badges?:string[];trainers?:Trainer[];connections?:[number,number][];keyItems?:string[];run?:string}
const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
const state=(o:StateOpts):RunEvent=>ev({run:o.run??"r",seq:o.seq,type:"state",started:true,name:"ANNA",location:o.location??"ROUTE104",map_id:o.map??[0,19],position:o.position??{x:5,y:5},facing:o.facing===undefined?"up":o.facing,badges:o.badges??[],
 topology:{width:40,height:80,connections:(o.connections??[]).map(d=>({direction:"NORTH",offset:0,destination:d,destination_name:"X"}))},
 heal_before_trainers:{trainers:(o.trainers??[]).map(t=>({graphics_id:1,loaded:true,...t})),move_power:[],last_heal:null,home:null,mom_heals:false},
 resources:{bag:(o.keyItems??[]).map((name,slot)=>({slot,item_id:259+slot,quantity:1,pocket:"key_items",name})),pc_items:null,storage:null}});
const result=(seq:number,text:string,name="observe",is_error=false,run="r"):RunEvent=>ev({run,seq,type:"tool_result",id:`c${String(seq)}`,name,is_error,text,state_seq:null});
const milestone=(seq:number,name:string,turn=1):RunEvent=>ev({seq,turn,type:"milestone",name,server_timestamp:0});
const page=(text:string,o:{speaker?:string|null;source?:string|null;map?:string;id?:[number,number]|null;seq?:number|null}={}):CapRow=>[o.speaker===undefined?"MAN":o.speaker,o.source===undefined?"faced_sprite":o.source,text,o.map??"ROUTE104",o.id===undefined?[0,19]:o.id,o.seq===undefined?null:o.seq];
const ep=(result:number,turn:number,pages:CapRow[]):CapEpisode=>({result,dialogue:[result-1],turn,pages});
const render=(kept:readonly CapEpisode[],omitted:number)=>`HEADER${omitted===0?"":`\n${omittedLine(omitted)}`}\n${JSON.stringify({episodes:kept})}`;
const far:[number,number]=[9,9];
const cap=(events:RunEvent[])=>{const c=new InstructionMemoryCap();for(const e of events)c.observe(e);return c;};
const decision=(c:InstructionMemoryCap,eps:CapEpisode[],budget=INSTRUCTION_MEMORY_CAP_CHARS)=>c.select(eps,render,budget);
const step=(c:InstructionMemoryCap,e:CapEpisode)=>decision(c,[e]).decisions[0];

describe("instruction-memory-cap-v1 rule A′",()=>{
 it("is a hard cap: the anchor goes first, then nearby, named and recent episodes, newest first, and none is kept that does not fit",()=>{
  const c=cap([state({seq:1,map:[0,3]}),result(2,'Story line heard (DAD, turn 7): "Go to DEWFORD." Reached: none.')]);
  const anchor=ep(10,7,[page("DAD: Go to\nDEWFORD.",{speaker:"DAD",source:"name_prefix",id:far})]);
  expect(decision(c,[anchor],5)).toMatchObject({kept:[],omitted:1,decisions:[{step:"anchor",kept:false}]});
  expect(step(c,ep(11,8,[page("DAD: Go to\nDEWFORD.",{id:far})]))?.step).not.toBe("anchor");
  expect(step(c,ep(12,7,[page("DAD: Something else.",{id:far})]))?.step).not.toBe("anchor");
  const pad="z".repeat(80);
  const near=[ep(20,1,[page(`n1 ${pad}`,{id:[0,3]})]),ep(21,2,[page(`n2 ${pad}`,{id:[0,3]})]),ep(22,3,[page(`n3 ${pad}`,{id:[0,3]})])];
  const named=ep(23,9,[page(`SLATEPORT ${pad}`,{id:far})]),recent=ep(24,10,[page(`r ${pad}`,{id:far})]);
  const all=[...near,anchor,named,recent];
  const fits=(kept:CapEpisode[],omitted:number)=>codePoints(render(kept,omitted));
  const budget=fits([anchor,near[2],near[1]] as CapEpisode[],3);
  const out=decision(c,all,budget);
  expect(out.kept.map(e=>e.result)).toEqual([21,22,10]);expect(out.omitted).toBe(3);
  expect(codePoints(render(out.kept,out.omitted))).toBeLessThanOrEqual(budget);
  for(const b of [0,50,200,400,800,1200])expect(codePoints(render(decision(c,all,b).kept,decision(c,all,b).omitted))).toBeLessThanOrEqual(Math.max(b,fits([],6)));
 });
 it("measures each episode once, so the fill does not re-render the whole block per candidate",()=>{
  const c=cap([state({seq:1,map:far})]);
  let calls=0;
  const counting=(kept:readonly CapEpisode[],omitted:number)=>{calls++;return render(kept,omitted);};
  for(const n of [200,400]){
   calls=0;
   const eps=Array.from({length:n},(_,i)=>ep(100+i,i+1,[page(`line ${String(i)} ${"q".repeat(40)}`,{id:far})]));
   const out=c.select(eps,counting,4000);
   expect(codePoints(render(out.kept,out.omitted))).toBeLessThanOrEqual(4000);
   expect(calls).toBeLessThanOrEqual(n+10);
  }
 });
 it("does not count a stale anchor: a named gym leader whose badge flag is set, or a line the readout marks Done",()=>{
  const line='Story line heard (DAD, turn 7): "Across the sea in DEWFORD TOWN is a GYM LEADER named BRAWLY."';
  const anchor=ep(10,7,[page("Across the sea in DEWFORD TOWN is a GYM LEADER named BRAWLY.",{speaker:"DAD",id:far})]);
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,`${line} Reached: none.`)]),anchor)?.step).toBe("anchor");
  const stale=step(cap([state({seq:1,map:[0,3],badges:["KNUCKLE"]}),result(2,`${line} Reached: none.`)]),anchor);
  expect(stale?.step).toBe("named");expect(stale?.fact).toContain("stale anchor: its quote names BRAWLY; badge flag KNUCKLE is set");
  const quote="Across the sea in DEWFORD TOWN is a GYM LEADER named BRAWLY.";
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,`Story goal: none. DAD's line from turn 7 ("${quote}") is done: Pokédex received. It is not where to go.`)]),anchor)?.step).toBe("named");
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,`Story goal: "${quote}" (DAD, turn 7) -> "DEWFORD TOWN" = DEWFORD TOWN (map 0/11).`)]),anchor)?.step).toBe("anchor");
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,`Latest story line naming a place (turn 7, DAD): "${quote}"`)]),anchor)?.step).toBe("anchor");
  expect(step(cap([state({seq:1,map:[0,3],badges:["STONE"]}),result(2,'Story line heard (DAD, turn 7): "Beat ROXANNE and TATE." Reached: none.')]),ep(10,7,[page("Beat ROXANNE and TATE.",{id:far})]))?.step).toBe("anchor");
 });
 it("does not count a story line the readout marks Done in the lines under it",()=>{
  const anchor=ep(10,7,[page("Go to the LAB.",{speaker:"MAY",id:far})]);
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,'Latest story line naming a place (turn 7, MAY): "Go to the LAB."\n- "LAB" = PROF. BIRCH\'S POKéMON LAB (map 1/4).')]),anchor)?.step).toBe("anchor");
  const stale=step(cap([state({seq:1,map:[0,3]}),result(2,'Latest story line naming a place (turn 7, MAY): "Go to the LAB."\n- "LAB" = PROF. BIRCH\'S POKéMON LAB (map 1/4).\nDone: Pokédex received. This is not where to go.\n\nScreen: overworld')]),anchor);
  expect(stale?.step).not.toBe("anchor");expect(stale?.fact).toContain("stale anchor: the readout marks this story line Done");
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,'Latest story line naming a place (turn 7, MAY): "Go to the LAB."\n\nDone: something else')]),anchor)?.step).toBe("anchor");
 });
 it("drops an exact pret-audited template only once its required milestones are recorded",()=>{
  const rule=RETIREMENT_RULES.find(r=>r.requires.length===1&&!r.pages.some(p=>p.text.includes("{PLAYER}")));
  if(rule===undefined)throw new Error("fixture rule missing");
  const e=ep(10,3,rule.pages.map(p=>page(p.text,{speaker:p.speaker,source:p.speaker_source,id:p.map_id===null?null:[p.map_id[0]??0,p.map_id[1]??0]})));
  expect(step(cap([state({seq:1})]),e)?.step).not.toBe("done");
  const done=step(cap([state({seq:1}),milestone(2,rule.requires[0]??"")]),e);
  expect(done).toMatchObject({step:"done",kept:false});expect(done?.fact).toContain(`template ${rule.id}`);
  const named=RETIREMENT_RULES.find(r=>r.pages.some(p=>p.text.includes("{PLAYER}")));
  if(named===undefined)throw new Error("fixture rule missing");
  const withName=ep(11,3,named.pages.map(p=>page(p.text.replaceAll("{PLAYER}","ANNA"),{speaker:p.speaker,source:p.speaker_source,id:p.map_id===null?null:[p.map_id[0]??0,p.map_id[1]??0]})));
  expect(step(cap([state({seq:1}),...named.requires.map((n,i)=>milestone(2+i,n))]),withName)?.step).toBe("done");
  expect(step(cap([state({seq:1}),...named.requires.map((n,i)=>milestone(2+i,n))]),{...withName,pages:withName.pages.slice(1)})?.step).not.toBe("done");
 });
 it("drops an episode whose every page is a pret receipt string with at least one completion",()=>{
  const c=cap([state({seq:1})]);
  for(const text of ["ANNA put away the POTION\nin the ITEMS POCKET.","ANNA put away the BIKE\nin the BAG.","Obtained the TM39!","ANNA found one POTION!","ANNA received the STONE BADGE\nfrom ROXANNE.","Registered GYM LEADER ROXANNE\nin the POKéNAV.","ANNA picked the 2 ORAN BERRIES."])
   expect(step(c,ep(10,3,[page(text,{speaker:null,source:null,id:far})]))?.step).toBe("done");
  expect(step(c,ep(10,3,[page("You found 2 ORAN BERRIES!",{speaker:null,source:null,id:far}),page("Do you want to pick the\nORAN BERRIES?",{speaker:null,source:null,id:far}),page("ANNA picked the 2 ORAN BERRIES.",{speaker:null,source:null,id:far})]))?.step).toBe("done");
  expect(step(c,ep(10,3,[page("You found 2 ORAN BERRIES!",{speaker:null,source:null,id:far})]))?.step).not.toBe("done");
  expect(step(c,ep(10,3,[page("BOB put away the POTION\nin the ITEMS POCKET.",{speaker:null,source:null,id:far})]))?.step).not.toBe("done");
  expect(step(c,ep(10,3,[page("ANNA put away the POTION\nin the ITEMS POCKET.",{speaker:null,source:null,id:far}),page("Now go see the PROF.",{id:far})]))?.step).not.toBe("done");
 });
 it("drops trainer lines once the faced trainer's flag is set, matched on the page's own state",()=>{
  const t:Trainer={local_id:3,x:5,y:4,trainer_id:603,defeated:false,sprite_kind:"LASS"};
  const line=ep(10,3,[page("Let's battle!",{speaker:"LASS",map:"ROUTE102",id:[0,18],seq:5})]);
  const before=[state({seq:5,map:[0,18],trainers:[t]}),state({seq:6,map:[0,19]})];
  expect(step(cap(before),line)?.step).not.toBe("done");
  const after=step(cap([...before,state({seq:7,map:[0,18],trainers:[{...t,defeated:true}]}),state({seq:8,map:[0,19]})]),line);
  expect(after).toMatchObject({step:"done",kept:false});expect(after?.fact).toContain("trainer 603 defeated");
  const elsewhere=[state({seq:5,map:[0,18],trainers:[t],facing:"down"}),state({seq:7,map:[0,18],trainers:[{...t,defeated:true}]}),state({seq:8,map:[0,19]})];
  expect(step(cap(elsewhere),line)?.step).not.toBe("done");
  expect(step(cap([state({seq:5,map:[0,18],trainers:[t],facing:null}),state({seq:7,map:[0,18],trainers:[{...t,defeated:true}]}),state({seq:8,map:[0,19]})]),line)?.step).not.toBe("done");
  expect(step(cap([...before,state({seq:7,map:[0,18],trainers:[{...t,defeated:true}]})]),{...line,pages:[page("Let's battle!",{speaker:"LASS",source:"name_prefix",map:"ROUTE102",id:[0,18],seq:5})]})?.step).not.toBe("done");
  for(const facing of ["down","left","right"]){
   const pos={down:{x:5,y:3},left:{x:6,y:4},right:{x:4,y:4}}[facing as "down"|"left"|"right"];
   expect(step(cap([state({seq:5,map:[0,18],trainers:[t],position:pos,facing}),state({seq:7,map:[0,18],trainers:[{...t,defeated:true}]}),state({seq:8,map:[0,19]})]),line)?.step).toBe("done");
  }
 });
 it("closes a story scene by its checkpoint once the game flag is set, only for episodes heard by then and wholly in scope",()=>{
  const tutorial=ep(10,5,[page("I've been developing an added feature.",{speaker:"SCIENTIST_1",map:"RUSTBORO CITY",id:[0,3]}),page("Please select the POKéNAV.",{speaker:"SCIENTIST_1",map:"RUSTBORO CITY",id:[0,3]})]);
  const at=(events:RunEvent[],e:CapEpisode=tutorial)=>step(cap([state({seq:1,map:far}),...events]),e);
  expect(at([])?.step).not.toBe("done");
  const done=at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",7)]);
  expect(done).toMatchObject({step:"done",kept:false});expect(done?.fact).toBe("checkpoint pokenav-match-call: MATCH_CALL_TUTORIAL_COMPLETE (turn 7)");
  expect(at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",4)])?.step).not.toBe("done");
  expect(at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",5)])?.step).toBe("done");
  expect(at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",7)],{...tutorial,pages:[...tutorial.pages,page("Hi.",{speaker:"BOY_1",map:"RUSTBORO CITY",id:[0,3]})]})?.step).not.toBe("done");
  expect(at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",7)],{...tutorial,pages:[page("Hi.",{speaker:"SCIENTIST_1",map:"BIRCH LAB",id:[1,4]})]})?.step).not.toBe("done");
  expect(at([milestone(2,"MATCH_CALL_TUTORIAL_COMPLETE",7)],{...tutorial,pages:[page("Hi.",{speaker:"SCIENTIST_1",map:"RUSTBORO CITY",id:null})]})?.step).not.toBe("done");
  const errand=ep(11,6,[page("Oh! How did it go?",{speaker:"MAN_2",map:"RUSTBORO CITY",id:[0,3]}),page("Please deliver this LETTER.",{speaker:"MR. STONE",source:"name_prefix",map:"DEVON CORP 3F",id:[11,2]}),page("AAAA received the GREAT BALL.",{speaker:null,source:null,map:"DEVON CORP 3F",id:[11,2]})]);
  expect(at([milestone(2,"STEVEN_LETTER_DELIVERED",20)],errand)?.step).not.toBe("done");
  expect(at([milestone(2,"STEVEN_LETTER_DELIVERED",20),milestone(3,"DEVON_GOODS_DELIVERED",30),milestone(4,"STEVEN_LETTER_DELIVERED",40)],errand)?.fact).toBe("checkpoint devon-president-errands: STEVEN_LETTER_DELIVERED, DEVON_GOODS_DELIVERED (turn 30)");
 });
 it("keeps DAD's gym advice and MR. BRINEY's Slateport errand until the game proves those goals done",()=>{
  const dad=ep(30,312,[page("WALLY: I did it… It's my…\nMy POKéMON!",{speaker:"WALLY",source:"name_prefix",map:"PETALBURG CITY GYM",id:[8,1]}),page("DAD: Head for RUSTBORO CITY beyond this town.\nChallenge the GYM LEADER, ROXANNE.",{speaker:"DAD",source:"name_prefix",map:"PETALBURG CITY GYM",id:[8,1]})]);
  const flags=[milestone(2,"WALLY_TUTORIAL_COMPLETE",312),milestone(3,"STONE_BADGE",578),milestone(4,"KNUCKLE_BADGE",1027)];
  expect(step(cap([state({seq:1,map:far}),...flags]),dad)?.step).not.toBe("done");
  const briney=ep(31,958,[page("MR. BRINEY: Next, the package for CAPT. STERN in SLATEPORT!",{speaker:"MR. BRINEY",source:"name_prefix",map:"DEWFORD TOWN",id:[0,11]})]);
  const sailed=[milestone(2,"STEVEN_LETTER_DELIVERED",1100),milestone(3,"SLATEPORT_CITY",1200)];
  expect(step(cap([state({seq:1,map:far}),...sailed]),briney)?.step).not.toBe("done");
  expect(step(cap([state({seq:1,map:far}),...sailed,milestone(4,"DEVON_GOODS_DELIVERED",1300)]),briney)?.fact).toBe("checkpoint briney-voyages: STEVEN_LETTER_DELIVERED, DEVON_GOODS_DELIVERED (turn 1300)");
 });
 it("keeps episodes heard on the current map, a connected map or a map a listed warp leads to",()=>{
  const c=cap([state({seq:1,map:[0,19],connections:[[0,3]]}),result(2,"Location: ROUTE104\nExits you can walk to from where you stand: (5,18) -> ROUTE 104 (map 17/1)\nWarps: (3,3) -> PETALBURG WOODS (map 24/11)\nUnavailable from here: warp (1,1) → ROUTE 104 (map 17/0)\nScreen: overworld (map 5/5)")]);
  for(const id of [[0,19],[0,3],[17,1],[24,11],[17,0]] as [number,number][])expect(step(c,ep(10,3,[page("Hi.",{id})]))).toMatchObject({step:"nearby",kept:true});
  expect(step(c,ep(10,3,[page("Hi.",{id:[5,5]})]))?.step).toBe("recency");
  expect(step(c,ep(10,3,[page("Hi.",{id:null})]))?.step).toBe("recency");
 });
 it("ranks episodes naming an unvisited place, an unmet story person or a held key item",()=>{
  const c=cap([state({seq:1,location:"RUSTBORO CITY",map:[0,3]}),state({seq:2,location:"ROUTE104",map:[0,19]}),state({seq:3,location:"ROUTE104",map:far,keyItems:["LETTER"]})]);
  const named=(text:string)=>step(c,ep(10,3,[page(text,{id:[7,7]})]));
  expect(named("Off to the port of SLATEPORT, then.")?.fact).toBe("unvisited place SLATEPORT CITY");
  expect(named("The tunnel to VERDANTURF TOWN.")?.fact).toBe("unvisited place VERDANTURF TOWN");
  expect(named("Back to RUSTBORO now.")?.step).toBe("recency");
  expect(named("ROUTE 104 is nice.")?.step).toBe("recency");
  expect(named("ROUTE 10 is far.")?.fact).toBe("unvisited place ROUTE 10");
  expect(named("Deliver it to STEVEN!")?.fact).toBe("not-yet-met person STEVEN");
  expect(named("Did you deliver the LETTER?")?.fact).toBe("key item LETTER still in the bag");
  expect(named("It's a LETTERBOX.")?.step).toBe("recency");
  const met=c.select([ep(10,3,[page("Deliver it to STEVEN!",{id:[7,7]})]),ep(11,4,[page("STEVEN: Hello.",{speaker:"STEVEN",source:"name_prefix",id:[7,7]})])],render,INSTRUCTION_MEMORY_CAP_CHARS);
  expect(met.decisions[0]?.step).toBe("recency");
  const dad=c.select([ep(10,3,[page("NORMAN is your father.",{id:[7,7]})]),ep(11,4,[page("DAD: Hi.",{speaker:"DAD",source:"name_prefix",id:[7,7]})])],render,INSTRUCTION_MEMORY_CAP_CHARS);
  expect(dad.decisions[0]?.step).toBe("recency");
 });
 it("fills the budget with named targets then recency, newest first, and says how many were left out",()=>{
  const c=cap([state({seq:1,map:[0,19]})]);
  const pad="x".repeat(60);
  const eps=[ep(10,1,[page(`old ${pad}`,{id:far})]),ep(11,2,[page(`SLATEPORT ${pad}`,{id:far})]),ep(12,3,[page(`mid ${pad}`,{id:far})]),ep(13,4,[page(`new ${pad}`,{id:far})]),ep(14,5,[page(`here ${pad}`)])];
  const all=render(eps,0);
  expect(decision(c,eps,all.length).kept).toEqual(eps);expect(decision(c,eps,all.length).omitted).toBe(0);
  const three=render([eps[1],eps[3],eps[4]] as CapEpisode[],2);
  const out=decision(c,eps,three.length);
  expect(out.kept.map(e=>e.result)).toEqual([11,13,14]);expect(out.omitted).toBe(2);
  expect(render(out.kept,out.omitted)).toBe(three);expect(render(out.kept,out.omitted)).toContain("\n2 earlier episodes are left out and remain in the run recording.\n");
  expect(out.decisions.map(d=>[d.result,d.step,d.kept])).toEqual([[10,"recency",false],[11,"named",true],[12,"recency",false],[13,"recency",true],[14,"nearby",true]]);
 });
 it("is empty-safe and reads facts only from its own run's successful observation results",()=>{
  expect(new InstructionMemoryCap().select([],render,10)).toEqual({kept:[],omitted:0,decisions:[]});
  const blank=new InstructionMemoryCap();
  expect(blank.select([ep(10,3,[page("Hi STEVEN.",{id:[0,19]})])],render,1000).decisions[0]?.step).toBe("named");
  const c=cap([state({seq:1,map:[0,19]}),result(2,'Story line heard (DAD, turn 3): "Hi."'),state({seq:3,map:[5,5],run:"other"}),result(4,"Warps: (1,1) -> X (map 9/9)","get_dialogue"),result(5,"Warps: (1,1) -> X (map 9/9)","observe",true),result(6,"Warps: (1,1) -> X (map 9/9)","observe",false,"other")]);
  expect(step(c,ep(10,3,[page("Hi.",{id:far})]))?.step).toBe("anchor");
  expect(step(c,ep(10,4,[page("Hi.",{id:[0,19]})]))?.step).toBe("nearby");
  expect(step(c,ep(10,4,[page("Bye.",{id:far})]))?.step).toBe("recency");
 });
});

describe("instruction-memory-cap-v1 through observedInstructions",()=>{
 const stream=(n:number):RunEvent[]=>[state({seq:1,map:[0,19]}),...Array.from({length:n},(_,i)=>{const seq=10+i*2;return [
  ev({seq,turn:i+2,type:"dialogue_auto_advance",tool_call_id:`t${String(i)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:`MOM: episode ${String(i)} ${"y".repeat(400)}`}],stop:"field_control",detail:"",duration_ms:1}),
  ev({seq:seq+1,turn:i+2,type:"tool_result",id:`t${String(i)}`,name:"press",is_error:false,text:"Location: ROUTE104",state_seq:null})];}).flat()];
 const recorded=(n:number,on:boolean,trim=true)=>{
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":trim,"instruction-memory-cap-v1":on} as FeatureSet;
  const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
  const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
  for(const e of stream(n))for(const fn of subs)fn(e);
  return transform([]).then(messages=>({records,messages}));
 };
 it("changes nothing while the block fits, and caps it with whole episodes once it does not",async()=>{
  const [smallOff,smallOn]=await Promise.all([recorded(3,false),recorded(3,true)]);
  expect(smallOn.records).toEqual(smallOff.records);expect(smallOn.messages.map(m=>m.role==='user'?m.content:null)).toEqual(smallOff.messages.map(m=>m.role==='user'?m.content:null));
  const [off,on]=await Promise.all([recorded(60,false),recorded(60,true)]);
  const offText=off.records[0]??"",onText=on.records[0]??"";
  expect(codePoints(offText)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);expect(offText).not.toContain("earlier episodes are left out");
  expect(codePoints(onText)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
  const omitted=/\n(\d+) earlier episodes are left out and remain in the run recording\.\n/.exec(onText);
  expect(omitted).not.toBeNull();
  const kept=(JSON.parse(onText.slice(onText.indexOf("\n{")+1)) as {episodes:{turn:number}[]}).episodes;
  expect(kept.length+Number(omitted?.[1])).toBe(60);expect(kept.map(e=>e.turn)).toEqual(kept.map(e=>e.turn).sort((a,b)=>a-b));expect(kept.at(-1)?.turn).toBe(61);
  for(const e of kept)expect(onText).toContain(`MOM: episode ${String(e.turn-2)} ${"y".repeat(400)}`);
  expect(onText.split("\n")[0]).toBe(offText.split("\n")[0].replace("Unknown, mixed, future and reusable dialogue stays.","Over the size cap, finished and less relevant episodes are left out."));
  expect(onText.split("\n")[0]).not.toContain("reusable dialogue stays");
  expect(on.messages).toEqual([expect.objectContaining({role:"user",content:onText})]);
 });
 it("caps the unselected memory form too, keeping whole episodes, when milestone-instruction-memory-v1 is off",async()=>{
  const [smallOff,smallOn]=await Promise.all([recorded(3,false,false),recorded(3,true,false)]);
  expect(smallOn.records).toEqual(smallOff.records);
  const [off,on]=await Promise.all([recorded(60,false,false),recorded(60,true,false)]);
  const offText=off.records[0]??"",onText=on.records[0]??"";
  expect(codePoints(offText)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);expect(codePoints(onText)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
  const lines=onText.split("\n");
  expect(lines[0]).toBe(offText.split("\n")[0]);expect(lines[1]).toMatch(/^\d+ earlier episodes are left out and remain in the run recording\.$/);
  expect([lines[0],...lines.slice(2,4)]).toEqual(offText.split("\n").slice(0,3));
  const turns=[...onText.matchAll(/^ {4}turn: (\d+)$/gm)].map(m=>Number(m[1]));
  expect(turns.length+Number(/^(\d+) earlier/m.exec(onText)?.[1])).toBe(60);expect(turns.at(-1)).toBe(61);
  for(const t of turns)expect(onText).toContain(`MOM: episode ${String(t-2)} ${"y".repeat(400)}`);
  expect(onText).toContain("observed_progress:");
 });
});

describe("instruction-memory-cap-v1 registry",()=>{
 it("is a default-off guard registered after instruction-memory-dedup-v1, needing nothing, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.indexOf("instruction-memory-cap-v1")).toBe(SWITCHABLE_FEATURES.indexOf("instruction-memory-dedup-v1")+1);
  expect(featureInfo("instruction-memory-cap-v1")).toMatchObject({group:"guard",needs:null,switchable:true,title:"INSTRUCTION MEMORY CAP"});
  expect(featureInfo("instruction-memory-cap-v1").description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["instruction-memory-cap-v1"]).toBe(false);
  expect(playHarnessFeatures({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"instruction-memory-cap-v1":true} as FeatureSet,null)).toContain("instruction-memory-cap-v1");
  expect(dependencyProblems({...ALL_ON,"milestone-instruction-memory-v1":false})).not.toContain("instruction-memory-cap-v1 needs milestone-instruction-memory-v1");
 });
});
