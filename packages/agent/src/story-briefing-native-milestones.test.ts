import {describe,expect,it} from "vitest";
import {A702_FEATURES,a702Events} from "../test-support/a702-dewford.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="story-briefing-native-milestones-v1";
// a702's stall briefing at turn 704: walking between RUSTURF TUNNEL and ROUTE116.
const CYCLE:Stall={kind:"map_cycle",from:"RUSTURF TUNNEL (map 24/4)",to:"ROUTE116 (map 0/31)",roundTrips:2,consecutive:false};
const briefing=(on:boolean,turn=704,stall:Stall=CYCLE)=>{
 const b=new SupervisorBriefing({...A702_FEATURES,[ID]:on});
 for(const e of a702Events(turn))b.observe(e);
 return b.stallText(stall,702);
};
const line=(text:string,head:string)=>text.split("\n").find(l=>l.startsWith(head))??"";
const DIALOGUE="- Dialogue shown with your latest story step that came with dialogue";
const DONE="- Story steps the game confirms are done";

describe("story-briefing-native-milestones-v1 on a702's turn-704 stall briefing",()=>{
 // The recorded briefing quoted ROXANNE's turn-578 pages, which it read from field messages this extract does not carry;
 // here the latest base step with an auto-advanced call is Wally's turn 312. Either way it predates Briney and Stone.
 it("OFF: the latest story step with dialogue predates Briney and Stone, and nothing past the base checklist is done",()=>{
  const text=briefing(false);
  expect(Number(/at turn (\d+)\), whole/.exec(line(text,DIALOGUE))?.[1])).toBeLessThan(621);
  expect(text).not.toContain("MR. BRINEY");
  expect(text).not.toContain("steven letter received");
 });
 it("ON: quotes the match call and Devon calls, then Briney's turn-621 pages, newest first and whole",()=>{
  const text=line(briefing(true),DIALOGUE);
  expect(text).toContain("(match call tutorial complete at turn 663), whole, in order:");
  expect(text).toContain("(devon president scene complete at turn 630), whole, in order:");
  expect(text).toContain('"Well, on the way, could you stop off in DEWFORD TOWN?"');
  expect(text).toContain('"I was hoping that you\'d deliver a LETTER to STEVEN in DEWFORD."');
  expect(text).toContain("(devon goods recovered at turn 621), whole, in order:");
  expect(text).toContain('"You can usually find me in my cottage by the sea near PETALBURG WOODS."');
  expect(text.indexOf("turn 663")).toBeLessThan(text.indexOf("turn 630"));
  expect(text.indexOf("turn 630")).toBeLessThan(text.indexOf("turn 621"));
  expect(text).not.toContain("wally tutorial complete");
 });
 it("ON: the done list adds the extended story steps the game recorded, in order",()=>{
  expect(line(briefing(true),DONE)).toContain("rusturf aqua grunt defeated; devon goods recovered; devon goods return reported; steven letter received; pokenav received; devon president scene complete; match call unlocked; match call tutorial complete");
 });
 it("keeps at most four story steps with dialogue; none of their pages is clipped",()=>{
  const text=line(briefing(true),DIALOGUE);
  expect(text.match(/, whole, in order:/g)?.length).toBeLessThanOrEqual(4);
  expect(text).toContain('"MR. STONE: Well, then, AAAAAA, go with caution and care!"');
 });
 it("before any extended step it is byte-identical to OFF",()=>{
  expect(briefing(true,600)).toBe(briefing(false,600));
 });
});

describe("story-briefing-native-milestones-v1 registry",()=>{
 it("is registered after self-named-speaker-v1, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(290);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).indexOf(ID)).toBe(314);
  expect(featureInfo(ID).description).toContain(" Off: the briefings use only the base milestones and the readout's checklist, byte for byte as before.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"loop-guard-supervisor-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
