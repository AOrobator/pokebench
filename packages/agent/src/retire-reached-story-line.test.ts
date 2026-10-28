import {describe,expect,it} from "vitest";
import {A702_PLACES,a702Events,a702State} from "../test-support/a702-dewford.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import {HarnessTrust,type TrustOptions} from "./harness-trust.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="retire-reached-story-line-v1";
// The bundle arm's harness-trust options (play-wiring), as a702 ran them.
const A702:TrustOptions={supervisor:true,goalOnce:false,retireLab:true,stageBound:true,nativeTasks:true,omitEmptyGoal:true,scriptedGuidance:true,reachableGoal:true,semanticTargets:true,exitSections:true,activity:true,playerName:true,gymEvidence:true,deliveredPlaces:true};
const route116=a702State("690");
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
 it("with self-named-speaker-v1 too, Stone's turn-630 request is the Story goal at turn 704",()=>{
  expect(lines({...A702,retireReached:true,selfNamed:true},704).header).toContain('Story goal: "Well, on the way, could you stop off in DEWFORD TOWN?" (MR. STONE, turn 630) -> "DEWFORD TOWN" = DEWFORD TOWN (map 0/11).');
 });
});

describe("retire-reached-story-line-v1 registry",()=>{
 it("is registered after story-briefing-native-milestones-v1, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("story-briefing-native-milestones-v1")+1);
  expect(featureInfo(ID).description).toContain(" Off: a reached line stays in the header as \"Story line heard … Reached: …\".");
  const {[ID]:_,...omitted}={...ALL_ON};
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"unfinished-activity-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
