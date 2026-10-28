import {describe,expect,it} from "vitest";
import {A702_PLACES,a702Arrival,a702CallMoved,a702Events,a702Milestone,a702State} from "../test-support/a702-dewford.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import {HarnessTrust,type TrustOptions} from "./harness-trust.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="retire-reached-story-line-v1";
// The bundle arm's harness-trust options (play-wiring), as a702 ran them.
const A702:TrustOptions={supervisor:true,goalOnce:false,retireLab:true,stageBound:true,nativeTasks:true,omitEmptyGoal:true,scriptedGuidance:true,reachableGoal:true,semanticTargets:true,exitSections:true,activity:true,playerName:true,gymEvidence:true,deliveredPlaces:true};
const route116=a702State("690");
const a702StateAtRustboro=()=>({...route116,map_id:[0,3] as [number,number],location:"RUSTBORO CITY"});
const lines=(options:TrustOptions,turn:number)=>{
 const trust=new HarnessTrust(options);
 for(const e of a702Events(turn))trust.observe(e);
 return trust.lines("Location: ROUTE116",route116,"later",A702_PLACES);
};
const DAD='Story line heard (DAD, turn 312): "Head for RUSTBORO CITY beyond this town." Reached: RUSTBORO CITY (map 0/3), first entered at turn 378.';

describe("retire-reached-story-line-v1 on a702's Dad line (RUSTBORO CITY entered at turn 378)",()=>{
 it("OFF: the reached line stays in every header, as a702 showed it at turn 704",()=>{
  expect(lines(A702,704).header).toContain(DAD);
 });
 it("ON with a702's stale-story-goal-v2: the line is omitted once a story step follows the arrival",()=>{
  const {header,away}=lines({...A702,retireReached:true},704);
  expect(header).not.toContain("Story");
  expect(header).not.toContain("RUSTBORO CITY beyond this town");
  expect(away).toBeNull();
 });
 it("ON without stale-story-goal-v2: the Story goal line says it is done, naming the arrival and the step",()=>{
  const {header}=lines({supervisor:false,activity:true,retireReached:true},704);
  expect(header).toContain('Story goal: none. DAD\'s line from turn 312 ("Head for RUSTBORO CITY beyond this town.") is done: RUSTBORO CITY (map 0/3), first entered at turn 378, then roxanne defeated at turn 578. It is not where to go.');
 });
 it("trainer wins and measurement-only steps after the arrival do not retire it",()=>{
  // Turns 379-454: three Rustboro Gym trainers, ROXANNE_FIRST_INTERACTION and Petalburg Woods trainers; no story step yet.
  expect(lines({...A702,retireReached:true},460).header).toContain(DAD);
 });
 it("a measurement-only milestone, including one in the extended catalog, does not retire it",()=>{
  const trust=new HarnessTrust({supervisor:false,activity:true,retireReached:true});
  for(const e of [...a702CallMoved(312,100,500),a702Arrival(102,500,[0,3],"RUSTBORO CITY"),a702Milestone("STEVEN_LETTER_RECEIVED",103,500),a702Milestone("ROXANNE_FIRST_INTERACTION",104,500)])trust.observe(e);
  const header=trust.lines("Location: RUSTBORO CITY",a702StateAtRustboro(),"later",A702_PLACES).header;
  expect(header).toContain('Story line heard (DAD, turn 500): "Head for RUSTBORO CITY beyond this town." Reached:');
  expect(header).not.toContain("is done");
 });
 it("needs an observed milestone, and an entry after the line: being in the place when the line was said is not one",()=>{
  const rustboro=a702StateAtRustboro();
  const header=(events:readonly import("./events.js").RunEvent[])=>{
   const trust=new HarnessTrust({supervisor:false,activity:true,retireReached:true});
   for(const e of events)trust.observe(e);
   return trust.lines("Location: RUSTBORO CITY",rustboro,"later",A702_PLACES).header;
  };
  const step=a702Milestone("ROXANNE_DEFEATED",106,500);
  if(step.type!=="milestone")throw Error("milestone");
  const {origin,...unsourced}=step;expect(origin).toBe("observed");
  // In RUSTBORO CITY before DAD's line, still there, then a story step: not retired.
  expect(header([a702Arrival(100,500,[0,3],"RUSTBORO CITY"),...a702CallMoved(312,102,500),step])).not.toContain("is done");
  // Line, entry, then a story step with no recorded origin: not retired.
  expect(header([...a702CallMoved(312,100,500),a702Arrival(102,500,[0,3],"RUSTBORO CITY"),unsourced])).not.toContain("is done");
  expect(header([...a702CallMoved(312,100,500),a702Arrival(102,500,[0,3],"RUSTBORO CITY"),step])).toContain("is done");
 });
 it("orders by recorded event, not turn: a story step after the arrival in the same turn retires it, one before it does not",()=>{
  const rustboro=a702StateAtRustboro();
  const run=(arrivalSeq:number,stepSeq:number)=>{
   const trust=new HarnessTrust({supervisor:false,activity:true,retireReached:true});
   const events=[...a702Events(377),a702Arrival(arrivalSeq,378,[0,3],"RUSTBORO CITY"),a702Milestone("ROXANNE_DEFEATED",stepSeq,378)].sort((a,b)=>a.seq-b.seq);
   for(const e of events)trust.observe(e);
   return trust.lines("Location: RUSTBORO CITY",rustboro,"later",A702_PLACES).header;
  };
  expect(run(15816,15817)).toContain("is done: RUSTBORO CITY (map 0/3), first entered at turn 378, then roxanne defeated at turn 378.");
  expect(run(15817,15816)).toContain(DAD);
 });
 it("a place entered before the line, earlier in the same turn, is not reached by it; one entered after the line is",()=>{
  const route104={...route116,map_id:[0,19] as [number,number],location:"ROUTE104"};
  const header=(events:readonly import("./events.js").RunEvent[],here=route104)=>{
   const trust=new HarnessTrust({supervisor:false,activity:true,retireReached:true});
   for(const e of events)trust.observe(e);
   return trust.lines("Location: x",here,"later",A702_PLACES).header;
  };
  const step=a702Milestone("ROXANNE_DEFEATED",106,500);
  // RUSTBORO CITY entered and left, then DAD's line, then a story step: not retired. (Its "Reached" wording comes from
  // unfinished-activity-v1, which matches arrivals by turn and is unchanged here.)
  const before=header([a702Arrival(100,500,[0,3],"RUSTBORO CITY"),a702Arrival(101,500,[0,19],"ROUTE104"),...a702CallMoved(312,102,500),step]);
  expect(before).toContain('(DAD, turn 500): "Head for RUSTBORO CITY beyond this town."');
  expect(before).not.toContain("is done");
  // DAD's line, then RUSTBORO CITY entered, then the step: retired.
  const after=header([...a702CallMoved(312,100,500),a702Arrival(102,500,[0,3],"RUSTBORO CITY"),step],{...route104,map_id:[0,3],location:"RUSTBORO CITY"});
  expect(after).toContain("is done: RUSTBORO CITY (map 0/3), first entered at turn 500, then roxanne defeated at turn 500.");
 });
 it("with self-named-speaker-v1 too, Stone's turn-630 request is the Story goal at turn 704",()=>{
  expect(lines({...A702,retireReached:true,selfNamed:true},704).header).toContain('Story goal: "Well, on the way, could you stop off in DEWFORD TOWN?" (MR. STONE, turn 630) -> "DEWFORD TOWN" = DEWFORD TOWN (map 0/11).');
 });
});

describe("retire-reached-story-line-v1 production factory",()=>{
 it("the trust header from playGameTools honors the switch",async()=>{
  const {playGameTools}=await import("./play-wiring.js");
  const {Type}=await import("typebox");
  const run=async(on:boolean)=>{
   const listeners:((e:import("./events.js").RunEvent)=>void)[]=[];
   const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"harness-trust-v1":true,"unfinished-activity-v1":true,[ID]:on} as typeof ALL_ON;
   const observe={name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Location: ROUTE116"}],details:{state:route116}})};
   const recorder={subscribe:(fn:(e:import("./events.js").RunEvent)=>void)=>{listeners.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
   const tools=playGameTools([observe],features,{read:()=>Promise.resolve(route116),places:()=>Promise.resolve({places:A702_PLACES})},recorder);
   for(const e of a702Events(704))for(const fn of listeners)fn(e);
   return JSON.stringify((await tools.find(t=>t.name==="observe")?.execute("later",{}))?.content);
  };
  expect(await run(false)).toContain("Story line heard (DAD, turn 312)");
  expect(await run(true)).toContain("is done: RUSTBORO CITY (map 0/3), first entered at turn 378, then roxanne defeated at turn 578.");
 });
});

describe("retire-reached-story-line-v1 registry",()=>{
 it("is registered after story-briefing-native-milestones-v1, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(283);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).indexOf(ID)).toBe(307);
  expect(featureInfo(ID).description).toContain(" Off: a reached line stays in the header as \"Story line heard … Reached: …\".");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"unfinished-activity-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
