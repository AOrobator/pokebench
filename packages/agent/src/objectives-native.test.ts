import { expect, it } from "vitest";
import { ObjectiveTracker } from "./objectives.js";
import { checkEvent, type RunEvent } from "./events.js";
import { readFileSync } from "node:fs";
import { parseGameState } from "./game-state.js";
import { IN_GAME } from "../test-support/events.js";
const envelope = { v: 1, run: "native_probe", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const story = parseGameState(JSON.parse(readFileSync(new URL("../test-support/existing-story.json", import.meta.url), "utf8"))).story;
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
