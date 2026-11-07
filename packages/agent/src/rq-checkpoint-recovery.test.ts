import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { rayquazaLaneFeatures } from "../test-support/rayquaza-lane.js";
import { RAYQUAZA_GUIDE_STEPS } from "./rayquaza-guide-data.js";
import { GuidePosition, rayquazaGuideContext, type GuideStep } from "./rayquaza-guide.js";

const GYM = [14, 0], ELSE = [1, 1];
const at = (x: number, y: number, id: readonly number[] = GYM): GuideStep => ({ after: `AT:${String(x)}:${String(y)}`, map: null, note: `leg ${String(x)}`, at: { id: id as [number, number], x, y } });
const steps: readonly GuideStep[] = [
  { after: "RUN_START", map: null, note: "start" },
  { after: "GYM", map: null, note: "enter" },
  at(1, 1), at(2, 2), at(3, 3), at(4, 4),
  { after: "BADGE", map: null, note: "badge" },
  at(9, 9, ELSE),
];
const move = (x: number, y: number, id: readonly number[] = GYM): RunEvent => ({ type: "state", started: true, screen: "overworld", active_ui: null, in_battle: false, party: [], map_id: id, position: { x, y } }) as unknown as RunEvent;
const story = (name: string): RunEvent => ({ type: "milestone", name, origin: "observed", kind: "story" }) as unknown as RunEvent;
const inGym = (recover: boolean): GuidePosition => { const g = new GuidePosition(steps, { checkpointRecovery: recover }); g.observe(story("GYM")); return g; };

describe("rq-checkpoint-recovery-v1", () => {
  it("off, a skipped checkpoint holds the guide", () => {
    const guide = inGym(false);
    guide.observe(move(2, 2));
    expect(guide.current().after).toBe("GYM");
  });
  it("on, a later checkpoint on the same map recovers a skipped one", () => {
    const guide = inGym(true);
    guide.observe(move(3, 3));
    expect(guide.current().after).toBe("AT:3:3");
  });
  it("walks in order as before", () => {
    const guide = inGym(true);
    for (const n of [1, 2, 3, 4]) { guide.observe(move(n, n)); expect(guide.current().after).toBe(`AT:${String(n)}:${String(n)}`); }
  });
  it("a repeat landing on an earlier checkpoint never moves the guide back", () => {
    const guide = inGym(true);
    guide.observe(move(3, 3));
    guide.observe(move(1, 1));
    expect(guide.current().after).toBe("AT:3:3");
  });
  it("re-entry after a whiteout holds, then the next landing fires", () => {
    const guide = inGym(true);
    guide.observe(move(2, 2));
    guide.observe(move(5, 5, ELSE));
    guide.observe(move(1, 1));
    expect(guide.current().after).toBe("AT:2:2");
    guide.observe(move(3, 3));
    expect(guide.current().after).toBe("AT:3:3");
  });
  it("never crosses a story step, or a checkpoint on another map", () => {
    const guide = inGym(true);
    guide.observe(move(4, 4));
    guide.observe(move(9, 9, ELSE));
    expect(guide.current().after).toBe("AT:4:4");
  });
  it("the production guide honours the switch", async () => {
    for (const on of [true, false]) {
      let listener: (event: RunEvent) => void = () => undefined;
      const hints: string[] = [];
      const context = rayquazaGuideContext({ ...rayquazaLaneFeatures(), "rq-checkpoint-recovery-v1": on }, { subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: (hint: { text: string }) => { hints.push(hint.text); } }, (messages) => Promise.resolve(messages), steps);
      listener(story("GYM"));
      listener(move(3, 3));
      await context([]);
      expect(hints).toContain(on ? "GUIDE: leg 3" : "GUIDE: enter");
    }
  });
  it("the lane turns it on", () => {
    expect(rayquazaLaneFeatures()["rq-checkpoint-recovery-v1"]).toBe(true);
  });
  it("stops at a gate row until the player has landed on it", () => {
    const gated = steps.map((step) => (step.after === "AT:2:2" ? { ...step, gate: true } : step));
    const guide = new GuidePosition(gated, { checkpointRecovery: true });
    guide.observe(story("GYM"));
    guide.observe(move(3, 3));
    expect(guide.current().after).toBe("GYM");
    guide.observe(move(2, 2));
    guide.observe(move(4, 4));
    expect(guide.current().after).toBe("AT:4:4");
  });
  it("the real Mossdeep rows cannot skip the Green switch leg", () => {
    const MOSSDEEP = [14, 3];
    const atRows = RAYQUAZA_GUIDE_STEPS.filter((step) => step.at !== undefined && step.after.startsWith("AT:MossdeepCity_Gym"));
    expect(atRows.filter((step) => step.gate === true).map((step) => step.after)).toEqual(["AT:MossdeepCity_Gym:23:20"]);
    const entered = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "MOSSDEEP_GYM_ENTERED");
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS, { checkpointRecovery: true });
    for (const step of RAYQUAZA_GUIDE_STEPS.slice(1, entered + 1)) guide.observe({ ...story(step.after), origin: "present_at_start" } as unknown as RunEvent);
    expect(guide.current().after).toBe("MOSSDEEP_GYM_ENTERED");
    const id = atRows[0]?.at?.id ?? MOSSDEEP;
    guide.observe(move(8, 12, id));
    expect(guide.current().after).toBe("MOSSDEEP_GYM_ENTERED");
    guide.observe(move(23, 20, id));
    expect(guide.current().after).toBe("AT:MossdeepCity_Gym:23:20");
  });
  it("does not jump from outside the checkpoint chain's reach", () => {
    const far: readonly GuideStep[] = [{ after: "RUN_START", map: null, note: "s" }, ...Array.from({ length: 10 }, (_, n) => at(n + 1, 1))];
    const guide = new GuidePosition(far, { checkpointRecovery: true });
    guide.observe(move(10, 1));
    expect(guide.current().after).toBe("RUN_START");
    guide.observe(move(8, 1));
    expect(guide.current().after).toBe("AT:8:1");
  });
});
