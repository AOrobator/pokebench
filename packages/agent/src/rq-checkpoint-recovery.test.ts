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

const rowsFrom = (after: string): readonly GuideStep[] => RAYQUAZA_GUIDE_STEPS.slice(RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === after));
const onFloor = (name: string): (x: number, y: number) => RunEvent => {
  const id = RAYQUAZA_GUIDE_STEPS.find((step) => step.after.startsWith(`AT:${name}:`))?.at?.id ?? [];
  return (x, y) => move(x, y, id);
};
const span = (from: string, to: string): number => RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === to) - RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === from);
const REACH = 8;

describe("the Lavaridge Gym vent rows", () => {
  const top = onFloor("LavaridgeTown_Gym_1F");
  const below = move(8, 9, [4, 2]);
  const gym = (): GuidePosition => new GuidePosition(rowsFrom("LAVARIDGE_GYM_ENTERED"), { checkpointRecovery: true });
  it("sit on 1F landings only, because recovery cannot cross a floor", () => {
    const rows = RAYQUAZA_GUIDE_STEPS.filter((step) => step.after.startsWith("AT:LavaridgeTown_Gym"));
    expect(rows.map((step) => step.after.split(":").slice(2).join(","))).toEqual(["5,14", "0,6", "7,2", "12,12"]);
    expect(new Set(rows.map((step) => step.at?.id.join("/"))).size).toBe(1);
    expect(rows.filter((step) => step.gate === true)).toEqual([]);
  });
  it("fire in order, and B1F landings move nothing", () => {
    const guide = gym();
    guide.observe(below);
    expect(guide.current().after).toBe("LAVARIDGE_GYM_ENTERED");
    for (const [x, y] of [[5, 14], [0, 6], [7, 2], [12, 12]] as const) {
      guide.observe(top(x, y));
      expect(guide.current().after).toBe(`AT:LavaridgeTown_Gym_1F:${String(x)}:${String(y)}`);
    }
  });
  it("recover when a run takes the (1,14) vent and never lands on (5,14)", () => {
    const guide = gym();
    guide.observe(top(1, 14));
    expect(guide.current().after).toBe("LAVARIDGE_GYM_ENTERED");
    guide.observe(top(0, 6));
    expect(guide.current().after).toBe("AT:LavaridgeTown_Gym_1F:0:6");
  });
  it("hold through a re-entry from the door, then the next landing fires", () => {
    const guide = gym();
    for (const [x, y] of [[5, 14], [0, 6]] as const) guide.observe(top(x, y));
    guide.observe(move(5, 5, ELSE));
    for (const [x, y] of [[13, 18], [5, 14], [0, 6]] as const) guide.observe(top(x, y));
    expect(guide.current().after).toBe("AT:LavaridgeTown_Gym_1F:0:6");
    guide.observe(top(7, 2));
    expect(guide.current().after).toBe("AT:LavaridgeTown_Gym_1F:7:2");
  });
  it("leave Flannery's defeat inside REACH from the entry row", () => {
    expect(span("LAVARIDGE_GYM_ENTERED", "FLANNERY_DEFEATED")).toBeLessThanOrEqual(REACH);
    const guide = gym();
    guide.observe(story("FLANNERY_DEFEATED"));
    expect(guide.current().after).toBe("FLANNERY_DEFEATED");
  });
});

describe("the Fortree Gym gate rows", () => {
  const tile = onFloor("FortreeCity_Gym");
  const row = (x: number, y: number): string => `AT:FortreeCity_Gym:${String(x)}:${String(y)}`;
  const LANDINGS = [[7, 18], [9, 10], [1, 8], [5, 2], [6, 4]] as const;
  const gym = (): GuidePosition => new GuidePosition(rowsFrom("FORTREE_GYM_ENTERED"), { checkpointRecovery: true });
  it("fire in order, each on the tile the last row's route ends on", () => {
    const guide = gym();
    for (const [x, y] of LANDINGS) {
      guide.observe(tile(x, y));
      expect(guide.current().after).toBe(row(x, y));
    }
  });
  it("gate only the Darius row, whose route holds the push at (1,6)", () => {
    expect(RAYQUAZA_GUIDE_STEPS.filter((step) => step.after.startsWith("AT:FortreeCity_Gym") && step.gate === true).map((step) => step.after)).toEqual([row(1, 8)]);
  });
  it("recover when a press walks past (7,18)", () => {
    const guide = gym();
    guide.observe(tile(9, 10));
    expect(guide.current().after).toBe(row(9, 10));
  });
  it("hold at (5,2) reached straight up from (5,8), with the (2,6) gate unturned", () => {
    const guide = gym();
    for (const [x, y] of [[7, 18], [9, 10], [5, 2]] as const) guide.observe(tile(x, y));
    expect(guide.current().after).toBe(row(9, 10));
    guide.observe(tile(1, 8));
    expect(guide.current().after).toBe(row(1, 8));
    guide.observe(tile(5, 2));
    expect(guide.current().after).toBe(row(5, 2));
  });
  it("hold through a loss, then the next landing fires", () => {
    const guide = gym();
    for (const [x, y] of [[7, 18], [9, 10], [1, 8]] as const) guide.observe(tile(x, y));
    guide.observe(move(5, 5, ELSE));
    for (const [x, y] of [[15, 24], [7, 18], [9, 10], [1, 8]] as const) guide.observe(tile(x, y));
    expect(guide.current().after).toBe(row(1, 8));
    guide.observe(tile(5, 2));
    expect(guide.current().after).toBe(row(5, 2));
  });
  it("leave the badge inside REACH even from the cleared Kecleon", () => {
    expect(span("FORTREE_GYM_OBSTRUCTION_CLEARED", "FEATHER_BADGE")).toBeLessThanOrEqual(REACH);
    const guide = gym();
    guide.observe(story("FEATHER_BADGE"));
    expect(guide.current().after).toBe("FEATHER_BADGE");
  });
});
