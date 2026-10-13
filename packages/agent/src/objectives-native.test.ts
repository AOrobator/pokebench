import { expect, it } from "vitest";
import { ObjectiveTracker } from "./objectives.js";
import { checkEvent, type RunEvent } from "./events.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { parseGameState } from "./game-state.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
import { FrameStore } from "./frames.js";
import { StateMilestones } from "./milestones.js";
import { objectiveHarness } from "./objective-tools.js";
import { parseEvent } from "./events.js";
import { IN_GAME, RUN_START_META } from "../test-support/events.js";
const envelope = { v: 1, run: "native_probe", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const story = (() => { const value = parseGameState(JSON.parse(readFileSync(new URL("../test-support/existing-story.json", import.meta.url), "utf8"))).story; if(value == null) throw new Error("fixture lacks story"); return value; })();
const state = (seq: number, clock: boolean): RunEvent => checkEvent({ ...envelope, seq, type: "state", ...IN_GAME, story: { ...story, clock_set: clock } });
const request = { title: "Set clock", supports_goal: "Progress", evidence: [1], completion: { kind: "milestone" as const, name: "CLOCK_SET" as const }, obstacle: "", next_decision: "Observe clock" };
const milestone = (seq: number, evidence: number[], origin = "observed", kind = "story"): RunEvent => checkEvent({ ...envelope, seq, type: "milestone", name: "CLOCK_SET", kind, origin, server_timestamp: 1, evidence });
it("automatically completes the canonical clock task from native evidence, never room arrival", () => {
 const records: unknown[] = []; const tracker = new ObjectiveTracker("Reach gym", e => { records.push(e); });
 tracker.observe(state(1, false)); tracker.set(request);
 expect(tracker.snapshot()).toMatchObject({ title: "Set the clock", status: "active" });
 tracker.observe(milestone(2, [1])); expect(tracker.snapshot()?.status).toBe("active");
 tracker.observe(state(3, true)); tracker.observe(milestone(4, [3]));
 expect(tracker.snapshot()).toMatchObject({ status: "completed", completion_evidence: [4, 3], verification: { origin: "observed", milestone_seq: 4, state_evidence: [3] } });
 expect(records).toHaveLength(2);
 tracker.observe(milestone(5, [3])); expect(records).toHaveLength(2);
});
it("does not trust legacy, unrecorded, cross-run or future evidence", () => {
 const tracker = new ObjectiveTracker("Reach gym", () => undefined); tracker.observe(state(1, true));tracker.set(request);
 for(const event of [milestone(2,[1],"observed","legacy"),milestone(3,[999]),{...milestone(4,[1]),run:"another_run"}]) tracker.observe(event);
 expect(tracker.snapshot()?.status).toBe("active");
});
it("retains and labels a present-at-start proof without claiming in-run progress", () => {
 const tracker = new ObjectiveTracker("Reach gym", () => undefined); tracker.observe(state(1, true));tracker.observe(milestone(2,[1],"present_at_start"));tracker.set(request);
 expect(tracker.snapshot()).toMatchObject({ status: "completed", verification: { origin: "present_at_start" } });
 expect(JSON.stringify(tracker.context([],1))).toContain("present_at_start");
});
it("does not allow local scalar claims to become native verified completion", () => {
 const tracker = new ObjectiveTracker("Reach gym", () => undefined);tracker.observe(state(1,true));tracker.set({...request,completion:{kind:"state",field:"started",value:true}});
 const update = { status: "completed" as const, evidence:[1],obstacle:"",next_decision:"Next",retry_reason:"" };
 expect(()=>tracker.update(update)).toThrow(/native milestone/);
 expect(tracker.update({...update,status:"reported_complete"})).toMatchObject({status:"reported_complete"});
});

it("keeps native verification immutable and refuses premature or reported claims", () => {
 const tracker = new ObjectiveTracker("Reach gym",()=>undefined);tracker.observe(state(1,false));tracker.set(request);
 const update = {status:"completed" as const,evidence:[1],obstacle:"",next_decision:"Next",retry_reason:""};
 expect(()=>tracker.update(update)).toThrow(/CLOCK_SET has not been recorded/);
 expect(()=>tracker.update({...update,status:"reported_complete"})).toThrow(/cannot be reported/);
 tracker.observe(state(2,true));tracker.observe(milestone(3,[2]));
 const verified=tracker.snapshot();expect(tracker.update({...update,status:"active"})).toEqual(verified);
 expect(tracker.set({...request,evidence:[3]})).toMatchObject({status:"completed",verification:{milestone_seq:3}});
});

it("validates truck transition evidence and separates gym entry, victory and badge", () => {
 const tracker = new ObjectiveTracker("Reach gym",()=>undefined);
 tracker.observe(checkEvent({...state(1,false),location:"INSIDE OF TRUCK"}));
 tracker.set({...request,completion:{kind:"milestone",name:"FIRST_TRUCK_EXIT"}});
 tracker.observe(checkEvent({...state(2,false),location:"LITTLEROOT TOWN"}));
 tracker.observe(checkEvent({...milestone(3,[2]),name:"FIRST_TRUCK_EXIT"}));expect(tracker.snapshot()?.status).toBe("active");
 tracker.observe(checkEvent({...milestone(4,[1,2]),name:"FIRST_TRUCK_EXIT"}));expect(tracker.snapshot()?.status).toBe("completed");
 tracker.observe(checkEvent({...state(5,false),location:"RUSTBORO CITY GYM"}));
 tracker.observe(checkEvent({...milestone(6,[5]),name:"RUSTBORO_CITY_GYM",kind:"navigation"}));
 tracker.set({...request,evidence:[5],completion:{kind:"milestone",name:"RUSTBORO_CITY_GYM"}});expect(tracker.snapshot()?.status).toBe("completed");
 tracker.set({...request,evidence:[5],completion:{kind:"milestone",name:"RUSTBORO_GYM_COMPLETE"}});expect(tracker.snapshot()?.status).toBe("active");
 tracker.set({...request,evidence:[5],completion:{kind:"milestone",name:"STONE_BADGE"}});expect(tracker.snapshot()?.status).toBe("active");
});

it("records and parses automatic native completion through the production harness owner", async () => {
 const root = mkdtempSync(join(tmpdir(),"native-objectives-"));const log = RunLog.create(root,"2026-10-12T20-00-00_probe_natv");
 const initial = parseGameState({...IN_GAME,story:{...story,clock_set:false}});
 const source={read:()=>Promise.resolve(initial)};
 const recorder=new RunRecorder({log,frames:new FrameStore(root,1000000,()=>undefined),milestones:new StateMilestones(source),gameState:source});
 const assembly=objectiveHarness("Reach the first gym",recorder,"http://127.0.0.1:1");
 await recorder.start({...RUN_START_META,harness_features:["story-state-v1","native-objective-completion-v1"]});
 const before=recorder.recordState(initial);
 const set=assembly.tools.find(t=>t.name==="set_objective");if(set===undefined)throw new Error("missing set tool");
 await set.execute("native",{...request,evidence:[before.seq]});
 recorder.recordState({...initial,story:{...story,clock_set:true}});
 recorder.end("operator_abort");
 const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
 const completed=events.filter(e=>e.type==="objective_update" && e.objective.status==="completed");
 expect(completed).toHaveLength(1);expect(completed[0]).toMatchObject({objective:{title:"Set the clock",completion:{kind:"milestone",name:"CLOCK_SET"},verification:{origin:"observed"}}});
 const native=events.find(e=>e.type==="milestone" && e.name==="CLOCK_SET");expect(native?.type==="milestone" ? native.evidence : []).toHaveLength(1);
 expect(completed[0]?.type==="objective_update" ? completed[0].objective.completion_evidence : []).toEqual([native?.seq,...(native?.type==="milestone" ? native.evidence ?? [] : [])]);
 expect(events.at(-1)).toMatchObject({type:"run_end",reason:"operator_abort"});
});
it("with native completion off, never completes from game evidence and lets the model report it", () => {
 const records: unknown[] = []; const tracker = new ObjectiveTracker("Reach gym", e => { records.push(e); }, { repeatGuard: true, nativeCompletion: false });
 tracker.observe(state(1, false)); tracker.set(request);
 tracker.observe(state(2, true)); tracker.observe(milestone(3, [2]));
 expect(tracker.snapshot()?.status).toBe("active");
 const update = { status: "reported_complete" as const, evidence: [2], obstacle: "", next_decision: "Leave", retry_reason: "" };
 expect(tracker.update(update)).toMatchObject({ status: "reported_complete", completion_evidence: [2] });
 expect(() => tracker.update({ ...update, status: "completed" })).toThrow(/Completion is not verified/);
 expect(JSON.stringify(tracker.context([], 1))).not.toContain("Native tasks complete automatically");
 expect(JSON.stringify(tracker.context([], 1))).not.toContain("recorded_native_milestones");
});
