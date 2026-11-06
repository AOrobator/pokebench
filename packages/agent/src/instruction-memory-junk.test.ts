import {expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {observedInstructions} from "./observed-instructions.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {InstructionMemoryCap,codePoints,type CapEpisode,type CapRow} from "./instruction-memory-cap.js";
import {SWITCHABLE_FEATURES,featureInfo,featuresOf,dependencyProblems,playHarnessFeatures} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";

const ID="instruction-memory-junk-filter-v1";
const ev=(body:Record<string,unknown>)=>checkEvent({v:1,run:"junk-fixture",seq:1,turn:1,t:"2026-10-28T12:00:00.000-04:00",...body});
const state=(body:Record<string,unknown>={})=>ev({...IN_GAME,type:"state",name:"ANNA",location:"ROUTE104",map_id:[0,19],position:{x:5,y:5},facing:"up",badges:[],...body});
const result=(text:string)=>ev({type:"tool_result",seq:2,id:"read",name:"observe",state_seq:1,text,is_error:false,duration_ms:1,frames:[]});
const page=(text:string,options:{speaker?:string|null;source?:string|null;map?:string;id?:[number,number];seq?:number|null}={}):CapRow=>[options.speaker===undefined?"BOY_1":options.speaker,options.source===undefined?"faced_sprite":options.source,text,options.map??"ROUTE104",options.id??[0,19],options.seq??null];
const ep=(n:number,pages:CapRow[],turn=n):CapEpisode=>({result:n,turn,dialogue:[n-1],pages});
const render=(kept:readonly CapEpisode[],omitted:number)=>JSON.stringify({kept,omitted});
function setup(on=true,events:RunEvent[]=[state()]){const cap=new InstructionMemoryCap(on);for(const e of events)cap.observe(e);return cap;}
const selected=(eps:CapEpisode[],events?:RunEvent[],on=true,budget=16000)=>setup(on,events).select(eps,render,budget);
const nurse=()=>page("Would you like to rest your POKéMON?",{speaker:null,source:null});
const lead=()=>page("Please go to SLATEPORT CITY.");
const noLeadSign=()=>page("A sturdy wooden sign.",{speaker:null,source:"faced_target"});
const weak=["If you're going to throw a POKé BALL,\nweaken the wild POKéMON first.","It will be easier to catch if it's been\npoisoned, burned, or lulled to sleep."];
const storage=["Let's say you have six POKéMON.\nIf you catch another one…","It is automatically sent to a STORAGE\nBOX over a PC connection."];
const rock=["That HM contains ROCK SMASH.","If you come across large boulders\nthat block your path…","Well, use that HM move and smash\nthem right out of your way!","Yes, sir! Smash rocks aside, I say!\nWoohoo!"];

it("OFF is exact incumbent selection, including whole pages and decisions",()=>{
 const eps=[ep(10,[nurse()]),ep(20,weak.map(t=>page(t)))];const c=new InstructionMemoryCap();c.observe(state());
 expect(selected(eps,undefined,false)).toEqual(c.select(eps,render));expect(render(selected(eps,undefined,false).kept,0)).toBe(render(eps,0));
});
it("R1 drops complete service text but keeps an exchange with another lead",()=>{
 expect(selected([ep(10,[nurse()])]).decisions).toEqual([expect.objectContaining({step:"junk",rule:"R1",kept:false})]);
 expect(selected([ep(10,[nurse(),lead()])]).kept.map(e=>e.result)).toEqual([10]);
});
it("R1 uses pret map identity for Center 2F, preserving a mixed-map episode",()=>{
 const upstairs=page("The connection is ready.",{id:[2,3],map:"OLDALE TOWN POKEMON CENTER 2F"});
 expect(selected([ep(10,[upstairs])]).decisions[0]).toMatchObject({step:"junk",rule:"R1",kept:false});
 expect(selected([ep(10,[upstairs,lead()])]).kept.map(e=>e.result)).toEqual([10]);
});
it("R2 drops only whole berry-tree exchanges, allowing receipts but retaining mixed leads",()=>{
 const berry=page("You found 2 ORAN BERRIES!",{speaker:"BERRY_TREE"});
 const receipt=page("ANNA picked the 2 ORAN BERRIES.",{speaker:null,source:null});
 expect(selected([ep(10,[berry])]).decisions[0]).toMatchObject({step:"junk",rule:"R2",kept:false});
 // The existing cap may already retire a completed receipt exchange as done; the filter must not revive it.
 expect(selected([ep(11,[berry,receipt])]).kept).toEqual([]);
 expect(selected([ep(10,[berry,lead()])]).kept.map(e=>e.result)).toEqual([10]);
});
it("R3 drops lead-less signs but reuses named unvisited-place protection",()=>{
 expect(selected([ep(10,[noLeadSign()])]).decisions[0]).toMatchObject({step:"junk",rule:"R3",kept:false});
 const receipt=page("ANNA found one POTION!",{speaker:null,source:null});
 expect(selected([ep(10,[noLeadSign(),receipt])]).decisions[0]).toMatchObject({step:"junk",rule:"R3",kept:false});
 expect(selected([ep(10,[page("SLATEPORT CITY",{speaker:null,source:"faced_target"})])]).kept.map(e=>e.result)).toEqual([10]);
});
it("keeps the pret RustboroCity_Text_CuttersHouse sign even with no new named place",()=>{
 const sign=ep(10,[page("CUTTER'S HOUSE",{speaker:null,source:"faced_target",map:"RUSTBORO CITY",id:[0,3]})]);
 expect(selected([sign]).kept).toEqual([sign]);
});
it("R4 drops a whole exact speaker/text repeat, not a different speaker or partly repeated exchange",()=>{
 const old=ep(10,[page("Head north along the path.")]),newer=ep(20,[page("Head north along the path.")]);
 expect(selected([old,newer]).decisions[0]).toMatchObject({step:"junk",rule:"R4",kept:false});expect(selected([old,newer]).kept).toEqual([newer]);
 expect(selected([old,ep(20,[page("Head north along the path.",{speaker:"GIRL_1"})])]).kept).toHaveLength(2);
 const mixed=ep(10,[page("Head north along the path."),page("Head south at the fork.")]);expect(selected([mixed,newer]).kept).toEqual([mixed,newer]);
});
it("R4 restores the older fitting episode when its larger newer representative misses the cap",()=>{
 const old=ep(10,[page("Head north along the path.")]);
 const newer=ep(20,[...old.pages,page("Head east along the path. "+"x".repeat(500))]);
 const budget=codePoints(render([old],1));const out=selected([old,newer],undefined,true,budget);
 expect(out.kept).toEqual([old]);expect(codePoints(render(out.kept,out.omitted))).toBeLessThanOrEqual(budget);
});
it("R5 uses the faced trainer template on the page's own native map/state, beaten or not",()=>{
 for(const defeated of [false,true]){
  const native=state({seq:7,heal_before_trainers:{trainers:[{local_id:1,x:5,y:4,trainer_id:603,defeated,sprite_kind:"LASS",graphics_id:20,loaded:true}],move_power:[],last_heal:null,home:null,mom_heals:false}});
  const trainer=ep(10,[page("Head north after our battle.",{speaker:"LASS",seq:7})]);
  expect(selected([trainer],[native]).decisions[0]).toMatchObject({step:"junk",rule:"R5",kept:false});
  const elsewhere=ep(10,[page("Head north after our battle.",{speaker:"LASS",seq:7,id:[0,18]})]);expect(selected([elsewhere],[native]).kept).toEqual([elsewhere]);
  const named=ep(10,[page("LASS: Head north after our battle.",{speaker:"LASS",source:"name_prefix",seq:7})]);expect(selected([named],[native]).kept).toEqual([named]);
 }
});
it("R6 drops wholly generic unmatched chatter with no v4 signal, but retains a direction hint",()=>{
 expect(selected([ep(10,[page("I enjoy watching the clouds.")])]).decisions[0]).toMatchObject({step:"junk",rule:"R6",kept:false});
 const hint=ep(10,[page("Walk around the corner.")]);expect(selected([hint]).kept).toEqual([hint]);
 const named=ep(10,[page("ANNA: I enjoy watching the clouds.",{source:"name_prefix",speaker:"ANNA"})]);expect(selected([named]).kept).toEqual([named]);
 const rival=ep(10,[page("I enjoy watching the clouds.",{speaker:"RIVAL_BRENDAN_NORMAL"})]);expect(selected([rival]).kept).toEqual([rival]);
});
it("drops the operator-labelled weaken-first and storage-box tips whole",()=>{
 const a=ep(10,weak.map(t=>page(t))),b=ep(20,storage.map(t=>page(t,{speaker:"GENTLEMAN",map:"PETALBURG CITY",id:[0,0]})));
 const out=selected([a,b]);expect(out.kept).toEqual([]);expect(out.decisions.map(d=>d.step)).toEqual(["junk","junk"]);
});
it("keeps the Cycling Road camper even after MAUVILLE was visited",()=>{
 const e=ep(10,[page("Which should I choose?",{speaker:"CAMPER",id:[0,25],map:"ROUTE110"}),page("Make a beeline for MAUVILLE on\nCYCLING ROAD, or take the low road\nand look for POKéMON?",{speaker:"CAMPER",id:[0,25],map:"ROUTE110"})]);
 expect(selected([e],[state({location:"MAUVILLE CITY"}),state({seq:2,location:"ROUTE110",map_id:[0,25]})]).kept).toEqual([e]);
});
it("Rock Smash hint remains until the existing native flag 0x6B says HM06 was received",()=>{
 const e=ep(10,rock.map(t=>page(t,{speaker:"MAN_1",map:"MAUVILLE CITY HOUSE1",id:[10,2]})));
 for(const received of [false,true]){
  const flags=Buffer.alloc(0x12c);if(received)flags[0x6b>>3]=1<<(0x6b&7);
  const out=selected([e],[state({story_progress:{flags:flags.toString("hex"),rustboro_stage:null,devon_stage:null,letter:null}})]);
  expect(out.kept,`HM06 native flag received=${String(received)}`).toEqual(received?[]:[e]);
 }
 expect(selected([e]).kept).toEqual([e]);expect(selected([e],[]).kept).toEqual([e]);
});
it("never junks the current story anchor, even when every page is approved FLAVOR",()=>{
 const e=ep(10,weak.map(t=>page(t)),7);const quote=weak.join(" ").replaceAll("\n"," ");
 const readout=result(`Story line heard (BOY_1, turn 7): "${quote}" Reached: none.`);
 expect(selected([e],[state(),readout]).kept).toEqual([e]);expect(selected([e],[state(),readout]).decisions[0]).toMatchObject({step:"anchor",kept:true});
});
it("the existing cap refills space released by junk rather than retaining boilerplate",()=>{
 const useful=ep(10,[page("Please go to SLATEPORT CITY.",{id:[9,9]})]),junk=ep(20,[nurse()]);const budget=Math.max(codePoints(render([useful],1)),codePoints(render([junk],1)));
 expect(selected([useful,junk],undefined,false,budget).kept).toEqual([junk]);expect(selected([useful,junk],undefined,true,budget).kept).toEqual([useful]);
});
it("registers the switch once, default OFF, depending on the existing cap owner",()=>{
 expect(SWITCHABLE_FEATURES.filter(s=>s===ID)).toEqual([ID]);expect(featureInfo(ID)).toMatchObject({needs:"instruction-memory-cap-v1",group:"guard"});
 expect(normalizeFeatures(featuresOf([]))).toHaveProperty(ID,false);expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})).toHaveProperty(ID,false);
 const f={...featuresOf([]),"instruction-memory-cap-v1":true,[ID]:true};expect(playHarnessFeatures(f,null).filter(s=>s===ID)).toEqual([ID]);expect(dependencyProblems(f).some(p=>p.includes(ID))).toBe(false);
});

it("a useful page keeps its whole otherwise-flavor episode",()=>{
 const e=ep(10,[page("There's a move that gets stronger\nwhen you keep using it in a row.",{speaker:"NPC",map:"VERDANTURF TOWN POKEMON CENTER 1F",id:[6,4]}),page("It's a BUG-type move, and it is\nwickedly cool.",{speaker:"NPC",map:"VERDANTURF TOWN POKEMON CENTER 1F",id:[6,4]}),page("It's called FURY CUTTER.\nWant me to teach it to a POKéMON?",{speaker:"NPC",map:"VERDANTURF TOWN POKEMON CENTER 1F",id:[6,4]})]);
 expect(selected([e]).kept).toEqual([e]);
});
it("the production observed-memory factory passes the default-OFF switch to the cap",async()=>{
 const sample=async(on:boolean)=>{
  const listeners:((e:RunEvent)=>void)[]=[],notes:string[]=[];
  const f={...featuresOf(["observed-instructions-v1","observed-field-dialogue-v1"]),"instruction-memory-cap-v1":true,[ID]:on};
  const transform=observedInstructions(f,{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:n=>{notes.push(n.text);}},m=>Promise.resolve(m));
  const advance=ev({type:"dialogue_auto_advance",seq:3,tool_call_id:"read",tool:"observe",requested:[],sent:[],dropped:[],auto_presses:0,pages:weak.map(text=>({text,speaker:"BOY_1",speaker_source:"faced_sprite",map:"ROUTE104",map_id:[0,19],position:null,state_seq:1})),stop:"menu",detail:"",duration_ms:1});
  for(const e of [state(),advance,result("Location: ROUTE104")])for(const fn of listeners)fn(e);
  const out=await transform([]as AgentMessage[]);expect(notes).toHaveLength(1);expect(out.at(-1)).toMatchObject({role:"user",content:notes[0]});return notes[0]??"";
 };
 expect(await sample(false)).toContain("weaken the wild");expect(await sample(true)).not.toContain("weaken the wild");
});

it("R6 preserves a partially labelled exchange and an identified story sprite",()=>{
 const mixed=ep(10,[page(weak[0]??""),page("Head north along the path.")]);expect(selected([mixed]).kept).toEqual([mixed]);
 const story=ep(10,[page("I enjoy watching the clouds.",{speaker:"NORMAN"})]);expect(selected([story]).kept).toEqual([story]);
});
it("R2 recognizes either a berry sprite or a pret berry template independently",()=>{
 const sprite=ep(10,[page("The fruit looks ripe.",{speaker:"BERRY_TREE"})]);expect(selected([sprite]).decisions[0]).toMatchObject({step:"junk",rule:"R2",kept:false});
 const template=ep(20,[page("It's soft, loamy soil.",{speaker:null,source:null})]);expect(selected([template]).decisions[0]).toMatchObject({step:"junk",rule:"R2",kept:false});
});

it("an ambiguous whole page uses the higher useful label rather than a FLAVOR match",()=>{
 // Hello! occurs in both Route104_PrettyPetalFlowerShop_Text_ThisIsPrettyPetalFlowerShop (FLAVOR)
 // and Route104_PrettyPetalFlowerShop_Text_YouCanHaveThis (USEFUL_OPTIONAL).
 const e=ep(10,[page("Hello!")]);expect(selected([e]).kept).toEqual([e]);
});

it("R1 binds PLAYER in service templates to the native player name",()=>{
 const right=ep(10,[page("ANNA booted up the PC.",{speaker:null,source:null})]);expect(selected([right]).decisions[0]).toMatchObject({step:"junk",rule:"R1",kept:false});
 const wrong=ep(10,[page("BOB booted up the PC.",{speaker:null,source:null})]);expect(selected([wrong]).kept).toEqual([wrong]);
});

// junk-filter-leader-lines-v1: a gym leader's lines stay until that badge is earned.
const leaderEvents=(badges:readonly string[])=>[state({seq:7,badges,heal_before_trainers:{trainers:[{local_id:1,x:5,y:4,trainer_id:266,defeated:false,sprite_kind:"WINONA",graphics_id:20,loaded:true}],move_power:[],last_heal:null,home:null,mom_heals:false}})];
const leaderSpeech=()=>ep(10,[page("I have become one with BIRD POKéMON.",{speaker:"WINONA",seq:7})]);
const leaderCap=(events:readonly RunEvent[],on:boolean)=>{const cap=new InstructionMemoryCap(true,false,on);for(const e of events)cap.observe(e);return cap.select([leaderSpeech()],render,16000);};
it("junk-filter-leader-lines-v1 off: R5 drops a leader's pre-battle line as it does today",()=>{
 expect(leaderCap(leaderEvents([]),false).decisions[0]).toMatchObject({step:"junk",rule:"R5",kept:false});
});
it("junk-filter-leader-lines-v1 on: the line stays until that badge is earned",()=>{
 expect(leaderCap(leaderEvents([]),true).kept).toHaveLength(1);
 expect(leaderCap(leaderEvents(["STONE"]),true).kept).toHaveLength(1);
});
it("junk-filter-leader-lines-v1 on: a leader's line with the badge earned goes as before",()=>{
 expect(leaderCap(leaderEvents(["FEATHER"]),true).decisions[0]).toMatchObject({step:"junk",rule:"R5",kept:false});
});
it("junk-filter-leader-lines-v1 on: an ordinary trainer's line is still R5",()=>{
 const native=state({seq:7,heal_before_trainers:{trainers:[{local_id:1,x:5,y:4,trainer_id:603,defeated:false,sprite_kind:"LASS",graphics_id:20,loaded:true}],move_power:[],last_heal:null,home:null,mom_heals:false}});
 const cap=new InstructionMemoryCap(true,false,true);cap.observe(native);
 expect(cap.select([ep(10,[page("Head north after our battle.",{speaker:"LASS",seq:7})])],render,16000).decisions[0]).toMatchObject({step:"junk",rule:"R5",kept:false});
});
it("the production factory passes junk-filter-leader-lines-v1 through",()=>{
 expect(featureInfo("junk-filter-leader-lines-v1").description).toContain(" Off: ");
});
