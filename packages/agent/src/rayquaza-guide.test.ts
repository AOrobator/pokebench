import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";
import type { RunEvent } from "./events.js";
import { MILESTONES } from "./milestones.js";
import { RAYQUAZA_GUIDE_STEPS } from "./rayquaza-guide-data.js";
import { GuidePosition, rayquazaGuideContext, type GuideStep } from "./rayquaza-guide.js";

const OFF = { ...LEGACY_ALL_ON, "rq-milestone-guide-v1": false };
const ON = { ...LEGACY_ALL_ON, "rq-milestone-guide-v1": true };
const steps: readonly GuideStep[] = [
  { after: "RUN_START", map: null, note: "Press right to leave the truck." },
  { after: "FIRST_TRUCK_EXIT", map: "LittlerootTown", note: "Follow Mom into the house." },
  { after: "CLOCK_SET", map: "-", note: "Go downstairs." },
];
const milestone = (name: string, origin = "observed"): RunEvent => ({ type: "milestone", name, origin, kind: "story" }) as unknown as RunEvent;
const user = (content: string): AgentMessage => ({ role: "user", content, timestamp: 1 });

describe("GuidePosition", () => {
  it("starts on the first step and advances on later milestones", () => {
    const guide = new GuidePosition(steps);
    expect(guide.current().note).toBe("Press right to leave the truck.");
    guide.observe(milestone("FIRST_TRUCK_EXIT"));
    expect(guide.current().after).toBe("FIRST_TRUCK_EXIT");
  });

  it("never moves backward when milestones arrive out of order", () => {
    const guide = new GuidePosition(steps);
    guide.observe(milestone("CLOCK_SET"));
    guide.observe(milestone("FIRST_TRUCK_EXIT"));
    expect(guide.current().after).toBe("CLOCK_SET");
  });

  it("uses milestones present at a checkpoint start and ignores other events", () => {
    const guide = new GuidePosition(steps);
    guide.observe(milestone("CLOCK_SET", "present_at_start"));
    guide.observe({ type: "turn_start" } as unknown as RunEvent);
    guide.observe(milestone("NOT_IN_THE_GUIDE"));
    expect(guide.current().after).toBe("CLOCK_SET");
  });
});

describe("GuidePosition map steps", () => {
  it("advances on first entry to a step's map", () => {
    const guide = new GuidePosition([...steps, { after: "MAP:AquaHideout_B1F", map: "AquaHideout_B1F", note: "Go on.", enter: [26, 1] }]);
    guide.observe({ type: "state", map_id: [26, 0] } as unknown as RunEvent);
    expect(guide.current().after).toBe("RUN_START");
    guide.observe({ type: "state", map_id: [26, 1] } as unknown as RunEvent);
    expect(guide.current().after).toBe("MAP:AquaHideout_B1F");
  });
});

describe("rayquazaGuideContext", () => {
  const recorder = () => {
    const recorded: { text: string; milestone: string }[] = [];
    let listener: (event: RunEvent) => void = () => undefined;
    return { recorded, emit: (event: RunEvent) => { listener(event); }, subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: (body: { text: string; milestone: string }) => { recorded.push(body); } };
  };
  const inner = (messages: AgentMessage[]): Promise<AgentMessage[]> => Promise.resolve(messages);

  it("does nothing when the switch is off", () => {
    expect(rayquazaGuideContext(OFF, recorder(), inner, steps)).toBe(inner);
  });

  it("makes the current note the final message of every request, recorded once per step", async () => {
    const r = recorder();
    const context = rayquazaGuideContext(ON, r, inner, steps);
    const first = await context([user("observation")]);
    const again = await context([user("observation")]);
    expect(first.at(-1)).toMatchObject({ role: "user", content: "GUIDE: Press right to leave the truck." });
    expect(again.at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
    expect(first).toHaveLength(2);
    expect(r.recorded).toEqual([{ text: "GUIDE: Press right to leave the truck.", milestone: "RUN_START" }]);
    r.emit(milestone("FIRST_TRUCK_EXIT"));
    expect((await context([user("observation")])).at(-1)).toMatchObject({ content: "GUIDE: Follow Mom into the house." });
    expect(r.recorded).toHaveLength(2);
  });
});

describe("the shipped guide", () => {
  it("names only real milestones, once each, in short notes", () => {
    const names = new Set(MILESTONES.map((m) => m.name));
    const after = RAYQUAZA_GUIDE_STEPS.map((step) => step.after);
    expect(after[0]).toBe("RUN_START");
    expect(after.slice(1).filter((name) => !name.startsWith("MAP:") && !names.has(name))).toEqual([]);
    expect(new Set(after).size).toBe(after.length);
    expect(RAYQUAZA_GUIDE_STEPS.filter((step) => step.note.length > 300)).toEqual([]);
  });
});
