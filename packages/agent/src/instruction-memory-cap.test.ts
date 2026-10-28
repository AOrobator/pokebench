import {describe,expect,it,vi} from "vitest";
import type {RunEvent} from "./events.js";
import {INSTRUCTION_MEMORY_CAP_CHARS,InstructionMemoryCap,codePoints,omittedLine,type CapEpisode,type CapRow} from "./instruction-memory-cap.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {STORY_CHECKPOINTS} from "./story-checkpoints.js";
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
 it("never keeps a proven-done episode, even when it is the story anchor",()=>{
  const line='Story line heard (MOM, turn 3): "ANNA put away the POTION in the ITEMS POCKET." Reached: none.';
  const e=ep(10,3,[page("ANNA put away the POTION\nin the ITEMS POCKET.",{speaker:null,source:null,id:far})]);
  expect(step(cap([state({seq:1,map:[0,3]}),result(2,line)]),e)).toMatchObject({step:"done",kept:false});
  const tutorial=ep(11,5,[page("Please select the POKéNAV.",{speaker:"SCIENTIST_1",map:"RUSTBORO CITY",id:[0,3]})]);
  const anchored=step(cap([state({seq:1,map:far}),result(2,'Story line heard (SCIENTIST_1, turn 5): "Please select the POKéNAV." Reached: none.'),milestone(3,"MATCH_CALL_TUTORIAL_COMPLETE",7)]),tutorial);
  expect(anchored).toMatchObject({step:"done",kept:false});expect(anchored?.fact).toContain("checkpoint pokenav-match-call");
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
 it("keeps a trainer's post-battle advice, retiring only lines heard before the trainer was beaten",()=>{
  const t:Trainer={local_id:3,x:5,y:4,trainer_id:71,defeated:true,sprite_kind:"YOUNGSTER"};
  const advice=ep(10,9,[page("Go on to the next room. At the left is the CONFUSION ROOM.",{speaker:"YOUNGSTER",map:"PETALBURG CITY GYM",id:[8,1],seq:5})]);
  expect(step(cap([state({seq:5,map:[8,1],trainers:[t]}),state({seq:6,map:far})]),advice)?.step).not.toBe("done");
 });
 it("breaks equal turns by event order, newest first",()=>{
  const c=cap([state({seq:1,map:far})]);
  const older=ep(10,5,[page(`a ${"x".repeat(80)}`,{id:far})]),newer=ep(20,5,[page(`b ${"x".repeat(80)}`,{id:far})]);
  const room=codePoints(render([newer],1));
  expect(decision(c,[older,newer],room).kept).toEqual([newer]);
 });
 it("keeps MOM's PROF. BIRCH pointer past RIVAL_MET, and the gym reward explanation past the badge",()=>{
  const mom=ep(40,20,[page("MOM: Did you introduce yourself to\nPROF. BIRCH?",{speaker:"MOM",source:"name_prefix",map:"HOUSE 1F",id:[1,0]})]);
  expect(step(cap([state({seq:1,map:far}),milestone(2,"RIVAL_MET",30)]),mom)?.step).not.toBe("done");
  const roxanne:Trainer={local_id:1,x:5,y:4,trainer_id:265,defeated:true,sprite_kind:"ROXANNE"};
  const reward=ep(41,578,[page("ANNA received the STONE BADGE\nfrom ROXANNE.",{speaker:null,source:null,map:"RUSTBORO CITY GYM",id:[11,3]}),page("With it, you can use CUT outside of battle.",{speaker:"ROXANNE",map:"RUSTBORO CITY GYM",id:[11,3],seq:5})]);
  const gym=[state({seq:5,map:[11,3],trainers:[roxanne]}),state({seq:6,map:far,badges:["STONE"]}),milestone(7,"STONE_BADGE",578)];
  expect(step(cap(gym),reward)?.step).not.toBe("done");
  const intro=ep(42,401,[page("Hello, I am ROXANNE, the RUSTBORO\nPOKéMON GYM LEADER.",{speaker:"ROXANNE",map:"RUSTBORO CITY GYM",id:[11,3],seq:5})]);
  expect(step(cap(gym),intro)?.fact).toBe("checkpoint roxanne-gym: STONE_BADGE (turn 578)");
 });
 it("keeps the Rusturf Tunnel scene, with BRINEY's pointer to his cottage, until both errands are delivered",()=>{
  const rusturf=ep(29713,621,[page("This is plain not right…",{speaker:"AQUA_MEMBER_M",map:"RUSTURF TUNNEL",id:[24,4]}),page("ANNA put away the DEVON GOODS\nin the KEY ITEMS POCKET.",{speaker:"AQUA_MEMBER_M",map:"RUSTURF TUNNEL",id:[24,4]}),page("You can usually find me in my cottage\nby the sea near PETALBURG WOODS.",{speaker:"EXPERT_M",map:"RUSTURF TUNNEL",id:[24,4]})]);
  const recovered=[state({seq:1,map:far}),milestone(2,"DEVON_GOODS_RECOVERED",621)];
  expect(step(cap(recovered),rusturf)?.step).not.toBe("done");
  expect(step(cap([...recovered,milestone(3,"STEVEN_LETTER_DELIVERED",1100),milestone(4,"DEVON_GOODS_DELIVERED",1300)]),rusturf)?.fact).toBe("checkpoint briney-voyages: STEVEN_LETTER_DELIVERED, DEVON_GOODS_DELIVERED (turn 1300)");
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
  expect(render(out.kept,out.omitted)).toBe(three);expect(render(out.kept,out.omitted)).toContain("\n2 other episodes are left out and remain in the run recording.\n");
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
  expect(codePoints(offText)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);expect(offText).not.toContain("other episodes are left out");
  expect(codePoints(onText)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
  const omitted=/\n(\d+) other episodes are left out and remain in the run recording\.\n/.exec(onText);
  expect(omitted).not.toBeNull();
  const kept=(JSON.parse(onText.slice(onText.indexOf("\n{")+1)) as {episodes:{turn:number}[]}).episodes;
  expect(kept.length+Number(omitted?.[1])).toBe(60);expect(kept.map(e=>e.turn)).toEqual(kept.map(e=>e.turn).sort((a,b)=>a-b));expect(kept.at(-1)?.turn).toBe(61);
  for(const e of kept)expect(onText).toContain(`MOM: episode ${String(e.turn-2)} ${"y".repeat(400)}`);
  expect(onText.split("\n")[0]).toBe((offText.split("\n")[0]??"").replace("Unknown, mixed, future and reusable dialogue stays.","Finished episodes, and less relevant ones over the size cap, are left out."));
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
  expect(lines[0]).toBe(offText.split("\n")[0]);expect(lines[1]).toMatch(/^\d+ other episodes are left out and remain in the run recording\.$/);
  expect([lines[0],...lines.slice(2,4)]).toEqual(offText.split("\n").slice(0,3).map(l=>l.replace("none retires a quote","finished episodes, and less relevant ones over the size cap, are left out")));
  expect(lines[2]).not.toContain("none retires a quote");
  const turns=[...onText.matchAll(/^ {4}turn: (\d+)$/gm)].map(m=>Number(m[1]));
  expect(turns.length+Number(/^(\d+) other/m.exec(onText)?.[1])).toBe(60);expect(turns.at(-1)).toBe(61);
  for(const t of turns)expect(onText).toContain(`MOM: episode ${String(t-2)} ${"y".repeat(400)}`);
  expect(onText).toContain("observed_progress:");
 });
});

describe("instruction-memory-cap-v1 registry",()=>{
 it("is a default-off guard registered after neutral-yes-no-readout-v1, needing nothing, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.indexOf("instruction-memory-cap-v1")).toBe(295);expect(SWITCHABLE_FEATURES.indexOf("neutral-yes-no-readout-v1")).toBe(294);expect(SWITCHABLE_FEATURES.indexOf("instruction-memory-dedup-v1")).toBe(292);
  expect(featureInfo("instruction-memory-cap-v1").description).toContain(`${String(STORY_CHECKPOINTS.length)} story checkpoints`);
  expect(featureInfo("instruction-memory-cap-v1")).toMatchObject({group:"guard",needs:null,switchable:true,title:"INSTRUCTION MEMORY CAP"});
  expect(featureInfo("instruction-memory-cap-v1").description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["instruction-memory-cap-v1"]).toBe(false);
  expect(playHarnessFeatures({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"instruction-memory-cap-v1":true} as FeatureSet,null)).toContain("instruction-memory-cap-v1");
  expect(dependencyProblems({...ALL_ON,"milestone-instruction-memory-v1":false})).not.toContain("instruction-memory-cap-v1 needs milestone-instruction-memory-v1");
 });
});

describe("instruction-memory-cap-v1 with instruction-memory-dedup-v1",()=>{
 const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
 const stream=(n:number):RunEvent[]=>[state({seq:1,map:[0,19]}),...Array.from({length:n},(_,i)=>{const seq=10+i*2;return [
  ev({seq,turn:i+2,type:"dialogue_auto_advance",tool_call_id:`t${String(i)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:`MOM: ${i%2===0?"he went up the route":"just chatting"} ${String(i)} ${"y".repeat(400)}`}],stop:"field_control",detail:"",duration_ms:1}),
  ev({seq:seq+1,turn:i+2,type:"tool_result",id:`t${String(i)}`,name:"press",is_error:false,text:"Location: ROUTE104",state_seq:null})];}).flat()];
 const sent=async(n:number,dedup:boolean,on:boolean)=>{
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":true,"delivered-place-evidence-v1":true,"instruction-memory-dedup-v1":dedup,"instruction-memory-cap-v1":on} as FeatureSet;
  const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
  const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
  for(const e of stream(n))for(const fn of subs)fn(e);
  await transform([]);
  return records[0]??"";
 };
 it("caps the merged block after dedup, and leaves both forms untouched while they fit",async()=>{
  for(const dedup of [false,true]){const [off,on]=await Promise.all([sent(3,dedup,false),sent(3,dedup,true)]);expect(on).toBe(off);}
  const [off,on]=await Promise.all([sent(60,true,false),sent(60,true,true)]);
  expect(off).not.toContain("DELIVERED PERSON AND PLACE EVIDENCE");expect(codePoints(off)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);
  expect(codePoints(on)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);expect(on).not.toContain("DELIVERED PERSON AND PLACE EVIDENCE");
  const payload=JSON.parse(on.slice(on.indexOf("\n{")+1)) as {columns:string[];episodes:{pages:unknown[][]}[]};
  expect(payload.columns).toEqual(["speaker","speaker_source","text","map","map_id","state_event","source_map_name","source_map_display"]);
  expect(payload.episodes.every(e=>e.pages.every(p=>p.length===8))).toBe(true);
  expect(/^(\d+) other episodes are left out/m.exec(on)?.[1]).toBe(String(60-payload.episodes.length));
 });
 it("with dedup off, caps the instruction block and leaves the separate place evidence block as it was",async()=>{
  const [off,on]=await Promise.all([sent(60,false,false),sent(60,false,true)]);
  const split=(t:string)=>{const i=t.indexOf("\n\nDELIVERED PERSON AND PLACE EVIDENCE");return [t.slice(0,i),t.slice(i)] as const;};
  const [offMemory,offPlaces]=split(off),[onMemory,onPlaces]=split(on);
  expect(onPlaces).toBe(offPlaces);expect(codePoints(offMemory)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);expect(codePoints(onMemory)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
 });
});

describe("instruction-memory-cap-v1 keeps observed_locations bounded",()=>{
 const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
 const stream=(places:number,width=120):RunEvent[]=>[
  ev({seq:10,turn:2,type:"dialogue_auto_advance",tool_call_id:"t0",tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:"MOM: he went up the route."}],stop:"field_control",detail:"",duration_ms:1}),
  ev({seq:11,turn:2,type:"tool_result",id:"t0",name:"press",is_error:false,text:"Location: START",state_seq:null}),
  ...Array.from({length:places},(_,i)=>ev({seq:20+i,turn:3+i,type:"tool_result",id:`o${String(i)}`,name:"observe",is_error:false,text:`Location: PLACE ${String(i)} ${"w".repeat(width)}`,state_seq:null}))];
 const sent=async(n:number,o:{cap:boolean;trim:boolean;dedup:boolean},width=120)=>{
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":o.trim,"delivered-place-evidence-v1":o.dedup,"instruction-memory-dedup-v1":o.dedup,"instruction-memory-cap-v1":o.cap} as FeatureSet;
  const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
  const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
  for(const e of stream(n,width))for(const fn of subs)fn(e);
  await transform([]);
  return records[0]??"";
 };
 it("keeps the newest whole locations within 2,000 chars and counts the rest, in the older form and in dedup's block",async()=>{
  for(const o of [{trim:false,dedup:false},{trim:false,dedup:true}]){
   const [off,on]=await Promise.all([sent(200,{...o,cap:false}),sent(200,{...o,cap:true})]);
   expect(codePoints(off)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);
   expect(codePoints(on)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
   expect(on).toContain(`PLACE 199 ${"w".repeat(120)}`);expect(on).not.toContain(`PLACE 100 ${"w".repeat(120)}`);
   const left=Number((o.dedup?/"earlier_locations_left_out":(\d+)/:/\n {2}earlier_locations_left_out: (\d+)/).exec(on)?.[1]);
   expect(left).toBeGreaterThan(150);expect(on).toContain(`PLACE ${String(left-1)} ${"w".repeat(120)}`);expect(on).not.toContain(`PLACE ${String(left-2)} ${"w".repeat(120)}`);expect(on).not.toContain(`"location":"START"`);
   expect(on).toContain("MOM: he went up the route.");
   const [smallOff,smallOn]=await Promise.all([sent(5,{...o,cap:false}),sent(5,{...o,cap:true})]);
   expect(smallOn).toBe(smallOff);
  }
 });
 it("stays under the cap even when every location is very long",async()=>{
  for(const o of [{trim:false,dedup:false},{trim:false,dedup:true}]){
   const on=await sent(20,{...o,cap:true},1000);
   expect(codePoints(on)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);expect(on).toContain(`PLACE 19 ${"w".repeat(1000)}`);expect(on).not.toContain(`PLACE 18 ${"w".repeat(1000)}`);
  }
 });
 it("leaves out an oversized current whole and stays under the cap",async()=>{
  const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
  const events=[ev({seq:10,turn:2,type:"dialogue_auto_advance",tool_call_id:"t0",tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:"MOM: he went up the route."}],stop:"field_control",detail:"",duration_ms:1}),
   ev({seq:11,turn:2,type:"tool_result",id:"t0",name:"press",is_error:false,text:`Location: ${"Q".repeat(20000)}`,state_seq:null})];
  for(const o of [{trim:false,dedup:false},{trim:false,dedup:true},{trim:true,dedup:false}]){
   const out=async(cap:boolean)=>{
    const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":o.trim,"delivered-place-evidence-v1":o.dedup,"instruction-memory-dedup-v1":o.dedup,"instruction-memory-cap-v1":cap} as FeatureSet;
    const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
    const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
    for(const e of events)for(const fn of subs)fn(e);
    await transform([]);return records[0]??"";
   };
   const [off,on]=await Promise.all([out(false),out(true)]);
   expect(codePoints(off)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);
   expect(codePoints(on)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);expect(on).toContain("MOM: he went up the route.");expect(on).toMatch(/current_left_out(": ?|: )true/);
  }
 });
 it("keeps a long current whole when the block still fits, and counts each visit list once per request",async()=>{
  const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
  const feed=(episodes:number,visits:number,width=40):RunEvent[]=>[...Array.from({length:episodes},(_,i)=>[
   ev({seq:10+i*2,turn:i+2,type:"dialogue_auto_advance",tool_call_id:`t${String(i)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:`MOM: ${String(i)} ${"y".repeat(60)}`}],stop:"field_control",detail:"",duration_ms:1}),
   ev({seq:11+i*2,turn:i+2,type:"tool_result",id:`t${String(i)}`,name:"press",is_error:false,text:"Location: START",state_seq:null})]).flat(),
   ...Array.from({length:visits},(_,i)=>ev({seq:100000+i,turn:5000+i,type:"tool_result",id:`o${String(i)}`,name:"observe",is_error:false,text:`Location: P${String(i)} ${"w".repeat(width)}`,state_seq:null}))];
  const run=async(events:RunEvent[],trim:boolean)=>{
   const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":trim,"instruction-memory-cap-v1":true} as FeatureSet;
   const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
   const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
   for(const e of events)for(const fn of subs)fn(e);
   await transform([]);return records[0]??"";
  };
  const long=await run([...feed(1,0),ev({seq:900000,turn:9000,type:"tool_result",id:"z",name:"observe",is_error:false,text:`Location: ${"Q".repeat(4001)}`,state_seq:null})],false);
  expect(long).toContain("Q".repeat(4001));expect(long).not.toContain("current_left_out");
  for(const [episodes,visits] of [[200,200],[400,400]] as const){
   const events=feed(episodes,visits),spy=vi.spyOn(JSON,"stringify");
   try{
    const text=await run(events,false);
    const full=spy.mock.calls.filter(([v])=>Array.isArray(v)&&v.length===visits+1).length;
    expect(full).toBeLessThanOrEqual(1);expect(codePoints(text)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
   }finally{spy.mockRestore();}
  }
 });
});
