import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";
import type { RunEvent } from "./events.js";
import { MILESTONES } from "./milestones.js";
import { RAYQUAZA_GUIDE_STEPS } from "./rayquaza-guide-data.js";
import { ABRA_NOTE, BATTLE_EXPLAINER, FLYER_NOTE, GuidePosition, rayquazaGuideContext, type GuideStep } from "./rayquaza-guide.js";

const OFF = { ...LEGACY_ALL_ON, "rq-milestone-guide-v1": false };
const ON = { ...LEGACY_ALL_ON, "rq-milestone-guide-v1": true };
const steps: readonly GuideStep[] = [
  { after: "RUN_START", map: null, note: "Press right to leave the truck." },
  { after: "FIRST_TRUCK_EXIT", map: "LittlerootTown", note: "Follow Mom into the house." },
  { after: "CLOCK_SET", map: "-", note: "Go downstairs." },
];
const milestone = (name: string, origin = "observed"): RunEvent => ({ type: "milestone", name, origin, kind: "story" }) as unknown as RunEvent;
const user = (content: string): AgentMessage => ({ role: "user", content, timestamp: 1 });

describe("catches stay on the path", () => {
  const row = (after: string): string => RAYQUAZA_GUIDE_STEPS.find((step) => step.after === after)?.note ?? "";
  it("Route 116 names both catches and never a search", () => {
    const note = row("ROCK_TOMB_RECEIVED");
    expect(note).toContain("If you meet Taillow or Abra on your way, throw a Ball at once");
    expect(note).toContain("Never search for them; keep moving east.");
    expect(note.replace("Never search", "")).not.toMatch(/search|hunt|look for|seek|encounters|first grass/i);
  });
  it("uses the Repel after the grass, so it blocks no meeting", () => {
    expect(row("ROCK_TOMB_RECEIVED")).toContain("Repel at about x=35");
  });
  it("Route 110 leaves Wingull to the battle note and sets no level target", () => {
    const note = row("ROUTE_110");
    expect(note).not.toMatch(/Wingull|aim for level/);
    expect(note).toContain("X Attack and X Speed against Slugma if you have them. Grovyle's Absorb took a Level 22 Marshtomp out in two hits.");
  });
});

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

describe("GuidePosition early milestones", () => {
  const long: readonly GuideStep[] = Array.from({ length: 30 }, (_, i) => ({ after: i === 0 ? "RUN_START" : `STEP_${String(i)}`, map: null, note: String(i) }));

  it("does not jump far ahead on a milestone reached out of order", () => {
    const guide = new GuidePosition(long);
    guide.observe(milestone("STEP_25"));
    expect(guide.current().after).toBe("RUN_START");
  });

  it("remembers that milestone and uses it once the guide reaches it", () => {
    const guide = new GuidePosition(long);
    guide.observe(milestone("STEP_25"));
    guide.observe(milestone("STEP_20"));
    expect(guide.current().after).toBe("RUN_START");
    for (const n of [5, 10, 15, 19]) guide.observe(milestone(`STEP_${String(n)}`));
    expect(guide.current().after).toBe("STEP_20");
  });

  it("does not skip unfinished steps to reach a remembered early milestone", () => {
    const guide = new GuidePosition(long);
    for (const n of [20, 21]) guide.observe(milestone(`STEP_${String(n)}`));
    for (const n of [6, 12]) guide.observe(milestone(`STEP_${String(n)}`));
    expect(guide.current().after).toBe("STEP_12");
    guide.observe(milestone("STEP_13"));
    expect(guide.current().after).toBe("STEP_13");
    guide.observe(milestone("STEP_19"));
    expect(guide.current().after).toBe("STEP_21");
  });

  it("chains over gaps between milestones present at a checkpoint start", () => {
    const guide = new GuidePosition(long);
    for (const n of [5, 11, 17]) guide.observe(milestone(`STEP_${String(n)}`, "present_at_start"));
    expect(guide.current().after).toBe("STEP_17");
  });

  it("chains forward through milestones present at a checkpoint start", () => {
    const guide = new GuidePosition(long);
    for (let n = 29; n >= 1; n--) guide.observe(milestone(`STEP_${String(n)}`, "present_at_start"));
    expect(guide.current().after).toBe("STEP_29");
  });

  it("treats a checkpoint milestone left beyond reach like any remembered one", () => {
    const guide = new GuidePosition(long);
    for (const n of [5, 20]) guide.observe(milestone(`STEP_${String(n)}`, "present_at_start"));
    expect(guide.current().after).toBe("STEP_5");
    guide.observe(milestone("STEP_12"));
    expect(guide.current().after).toBe("STEP_12");
    guide.observe(milestone("STEP_19"));
    expect(guide.current().after).toBe("STEP_20");
  });

  it("still advances past a few steps that never fired", () => {
    const guide = new GuidePosition(long);
    guide.observe(milestone("STEP_6"));
    expect(guide.current().after).toBe("STEP_6");
  });
});

describe("GuidePosition tile steps", () => {
  it("advances on standing on the step's tile", () => {
    const guide = new GuidePosition([...steps, { after: "AT:Route111:35:65", map: "Route111", note: "Press A.", at: { id: [0, 26], x: 35, y: 65 } }]);
    const at = (x: number, y: number): RunEvent => ({ type: "state", map_id: [0, 26], position: { x, y } }) as unknown as RunEvent;
    guide.observe(at(35, 65));
    expect(guide.current().after).toBe("RUN_START");
    guide.observe(milestone("CLOCK_SET"));
    guide.observe(at(35, 64));
    expect(guide.current().after).toBe("CLOCK_SET");
    guide.observe(at(35, 65));
    expect(guide.current().after).toBe("AT:Route111:35:65");
  });

  it("advances on gaining the step's item, not on holding one already", () => {
    const guide = new GuidePosition([...steps, { after: "GOT:RARE_CANDY", map: null, note: "Go on.", got: "RARE CANDY" }]);
    const bag = (quantity: number): RunEvent => ({ type: "state", started: true, screen: "overworld", active_ui: null, in_battle: false, map_id: [0, 0], party: [], resources: { bag: [{ name: "RARE CANDY", quantity }] } }) as unknown as RunEvent;
    guide.observe(milestone("CLOCK_SET"));
    guide.observe(bag(1));
    expect(guide.current().after).toBe("CLOCK_SET");
    guide.observe(bag(2));
    expect(guide.current().after).toBe("GOT:RARE_CANDY");
  });

  it("allows the same item trigger at later sequential steps", () => {
    const guide = new GuidePosition([
      { after: "RUN_START", map: null, note: "Start." },
      { after: "GOT:RARE_CANDY", map: null, note: "First candy.", got: "RARE CANDY" },
      { after: "GOT:RARE_CANDY", map: null, note: "Second candy.", got: "RARE CANDY" },
    ]);
    const bag = (quantity: number): RunEvent => ({ type: "state", started: true, screen: "overworld", active_ui: null, in_battle: false, map_id: [0, 0], party: [], resources: { bag: [{ name: "RARE CANDY", quantity }] } }) as unknown as RunEvent;
    guide.observe(bag(0));
    guide.observe(bag(1));
    expect(guide.current().note).toBe("First candy.");
    guide.observe(bag(1));
    guide.observe(bag(2));
    expect(guide.current().note).toBe("Second candy.");
  });
});

describe("GuidePosition map steps", () => {
  it("advances on first entry to a step's map", () => {
    const guide = new GuidePosition([...steps, { after: "MAP:AquaHideout_B1F", map: "AquaHideout_B1F", note: "Go on.", enter: [26, 1] }]);
    guide.observe({ type: "state", map_id: [26, 1] } as unknown as RunEvent);
    expect(guide.current().after).toBe("RUN_START");
    guide.observe(milestone("CLOCK_SET"));
    guide.observe({ type: "state", map_id: [26, 0] } as unknown as RunEvent);
    expect(guide.current().after).toBe("CLOCK_SET");
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
  it("meets Route 116's Pokémon before any Repel", () => {
    const note = RAYQUAZA_GUIDE_STEPS.find((step) => step.after === "ROCK_TOMB_RECEIVED")?.note ?? "";
    expect(note.indexOf("If you meet Taillow")).toBeGreaterThan(note.indexOf("No Repel yet"));
    expect(note.indexOf("Repel at about")).toBeGreaterThan(note.indexOf("If you meet Taillow"));
  });

  it("tells the rival fight to boost before Grovyle, without assuming the party", () => {
    const note = RAYQUAZA_GUIDE_STEPS.find((step) => step.after === "ROUTE_110")?.note ?? "";
    expect(note).toMatch(/X Attack and X Speed against Slugma/);
    expect(note).toMatch(/if you have them/);
    expect(note).toMatch(/Absorb took a Level 22 Marshtomp out in two hits/);
    expect(note).not.toMatch(/Taillow/);
  });

  it("names only real milestones, uses each milestone once, and keeps short notes", () => {
    const names = new Set(MILESTONES.map((m) => m.name));
    const after = RAYQUAZA_GUIDE_STEPS.map((step) => step.after);
    expect(after[0]).toBe("RUN_START");
    expect(after.slice(1).filter((name) => !name.startsWith("MAP:") && !name.startsWith("AT:") && !name.startsWith("GOT:") && !name.startsWith("OPTIONS_") && !names.has(name))).toEqual([]);
    const milestones = after.filter((name) => !name.startsWith("MAP:") && !name.startsWith("AT:") && !name.startsWith("GOT:"));
    expect(new Set(milestones).size).toBe(milestones.length);
    expect(RAYQUAZA_GUIDE_STEPS.filter((step) => step.note.length > 300)).toEqual([]);
  });
});

describe("rq-battle-explainer-v1", () => {
  const recorder = () => {
    let listener: (event: RunEvent) => void = () => undefined;
    return { emit: (event: RunEvent) => { listener(event); }, subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: () => undefined };
  };
  const inner = (messages: AgentMessage[]): Promise<AgentMessage[]> => Promise.resolve(messages);
  const both = { ...ON, "rq-battle-explainer-v1": true };
  const inBattle = (value: boolean): RunEvent => ({ type: "state", started: true, in_battle: value, screen: value ? "battle" : "overworld", active_ui: null, map_id: [0, 0], party: [] }) as unknown as RunEvent;

  it("appears just before the guide line only while a battle is active", async () => {
    const r = recorder();
    const context = rayquazaGuideContext(both, r, inner, steps);
    expect((await context([user("o")])).at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
    r.emit(inBattle(true));
    const fight = await context([user("o")]);
    expect(fight.at(-2)).toMatchObject({ role: "user", content: BATTLE_EXPLAINER });
    expect(fight.at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
    r.emit(inBattle(false));
    expect((await context([user("o")])).at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
  });

  it("stays out of post-battle evolution, where the game's battle flag is still set", async () => {
    const r = recorder();
    const context = rayquazaGuideContext(both, r, inner, steps);
    r.emit({ type: "state", started: true, in_battle: true, screen: "evolution", active_ui: null, map_id: [0, 0], party: [] } as unknown as RunEvent);
    expect((await context([user("o")])).at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
  });

  it("stays out when its own switch is off, and keeps within its size", async () => {
    const r = recorder();
    const context = rayquazaGuideContext({ ...ON, "rq-battle-explainer-v1": false }, r, inner, steps);
    r.emit(inBattle(true));
    expect((await context([user("o")])).at(-1)).toMatchObject({ content: "GUIDE: Press right to leave the truck." });
    expect(BATTLE_EXPLAINER.length).toBeLessThanOrEqual(400);
  });
});

describe("Abra notes", () => {
  const FORTREE = [0, 4];
  const ROUTE = [0, 16];
  const abraFoe = { battle_type: 4, battlers: [{ position: 0, species: "MUDKIP" }, { position: 1, species: "ABRA" }] };
  const state = (over: Record<string, unknown>): RunEvent => ({ type: "state", started: true, screen: "overworld", active_ui: null, in_battle: false, map_id: ROUTE, party: [{ species: "MUDKIP", hp: 20, moves: [] }], ...over }) as unknown as RunEvent;
  const fight = (over: Record<string, unknown> = {}): RunEvent => state({ in_battle: true, screen: "battle", battle: abraFoe, ...over });
  const teleporter = { species: "ABRA", hp: 20, moves: [{ move_id: 100 }] };
  const toFortree: readonly GuideStep[] = [{ after: "RUN_START", map: "FortreeCity", note: "Go.", to: { map: "FortreeCity", id: [0, 4] } }];
  const field = (over: Record<string, unknown> = {}): RunEvent => state({ party: [teleporter], heal_before_trainers: { last_heal: FORTREE }, ...over });
  const notes = (guide: GuidePosition): readonly string[] => guide.situationNotes().map((n) => n.text);

  it("tells the model to throw a ball at a wild Abra it has not caught", () => {
    const guide = new GuidePosition(steps);
    guide.observe(fight());
    expect(notes(guide)).toEqual([ABRA_NOTE]);
  });

  it("says nothing when an Abra is owned, the foe is a trainer's or the foe is not an Abra", () => {
    for (const event of [
      fight({ party: [{ species: "KADABRA", hp: 20, moves: [] }] }),
      fight({ battle: { ...abraFoe, battle_type: 8 } }),
      fight({ battle: { battle_type: 4, battlers: [{ position: 0, species: "ABRA" }, { position: 1, species: "ZIGZAGOON" }] } }),
      fight({ in_battle: false, screen: "overworld", battle: null }),
    ]) {
      const guide = new GuidePosition(steps);
      guide.observe(event);
      expect(notes(guide)).toEqual([]);
    }
  });

  it("offers Teleport when the step's town holds the last Pokemon Center", () => {
    const guide = new GuidePosition(toFortree);
    guide.observe(field());
    expect(notes(guide)).toEqual(["TELEPORT: Use Teleport from the party menu to return to your respawn point in Fortree City instead of walking."]);
  });

  it("keeps the last known heal location when a state omits it", () => {
    const guide = new GuidePosition(toFortree);
    guide.observe(field());
    guide.observe(field({ heal_before_trainers: undefined }));
    expect(notes(guide)).toHaveLength(1);
  });

  it("stays silent whenever Teleport would not save the trip", () => {
    for (const event of [
      field({ heal_before_trainers: { last_heal: [0, 5] } }),
      field({ map_id: FORTREE }),
      field({ map_id: [8, 1] }),
      field({ in_battle: true, screen: "battle" }),
      field({ party: [{ ...teleporter, hp: 0 }] }),
      field({ party: [{ species: "ABRA", hp: 20, moves: [{ move_id: 1 }] }] }),
      field({ heal_before_trainers: { last_heal: null } }),
    ]) {
      const guide = new GuidePosition(toFortree);
      guide.observe(event);
      expect(notes(guide)).toEqual([]);
    }
    const guide = new GuidePosition(steps);
    guide.observe(field());
    expect(notes(guide)).toEqual([]);
  });

  it("stops offering Teleport once the player has reached the town on this step", () => {
    const from = RAYQUAZA_GUIDE_STEPS.findIndex((s) => s.after === "HM_STRENGTH_RECEIVED");
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(from));
    const mauville = { heal_before_trainers: { last_heal: [0, 2] } };
    guide.observe(field({ ...mauville, map_id: [0, 26] }));
    expect(notes(guide)).toHaveLength(1);
    guide.observe(field({ ...mauville, map_id: [0, 2] }));
    guide.observe(field({ ...mauville, map_id: [0, 26] }));
    expect(notes(guide)).toEqual([]);
  });

  it("delivers a note just before the guide line and records it once while it applies", async () => {
    const recorded: { text: string; milestone: string }[] = [];
    let listener: (event: RunEvent) => void = () => undefined;
    const context = rayquazaGuideContext(ON, { subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: (body: { text: string; milestone: string }) => { recorded.push(body); } }, (m) => Promise.resolve(m), steps);
    listener(fight());
    const first = await context([user("observation")]);
    await context([user("observation")]);
    expect(first.at(-2)).toMatchObject({ role: "user", content: ABRA_NOTE });
    expect(first.at(-1)).toMatchObject({ role: "user", content: "GUIDE: Press right to leave the truck." });
    expect(recorded.filter((r) => r.text === ABRA_NOTE)).toHaveLength(1);
    listener(state({}));
    await context([user("observation")]);
    listener(fight());
    await context([user("observation")]);
    expect(recorded.filter((r) => r.text === ABRA_NOTE)).toHaveLength(2);
  });

  it("names Abra only on the row that says never to search", () => {
    const named = RAYQUAZA_GUIDE_STEPS.filter((s) => /\babra\b|teleport/i.test(s.note));
    expect(named.map((s) => s.after)).toEqual(["ROCK_TOMB_RECEIVED"]);
    expect(named[0]?.note).toContain("Never search for them");
  });
  it("tells the model to throw a Ball at a wild Taillow or Wingull with no Fly carrier", () => {
    const balls = (quantity: number): { bag: readonly { pocket: string; quantity: number; name: string }[] } => ({ bag: [{ pocket: "poke_balls", quantity, name: "POKé BALL" }] });
    const met = (species: string, party: readonly { species: string; hp: number }[], battleType = 4, resources = balls(5)): readonly string[] => {
      const guide = new GuidePosition(steps);
      guide.observe(fight({ party, resources, battle: { battle_type: battleType, battlers: [{ position: 0, species: "MARSHTOMP" }, { position: 1, species }] } }));
      return notes(guide);
    };
    const alone = [{ species: "MARSHTOMP", hp: 30 }];
    expect(met("TAILLOW", alone)).toEqual([FLYER_NOTE]);
    expect(met("WINGULL", alone)).toEqual([FLYER_NOTE]);
    expect(met("POOCHYENA", alone)).toEqual([]);
    expect(met("WINGULL", alone, 8)).toEqual([]);
    expect(met("WINGULL", alone, 4, balls(0))).toEqual([]);
    expect(met("WINGULL", alone, 4, { bag: [] })).toEqual([]);
    for (const species of ["TAILLOW", "SWELLOW", "WINGULL", "PELIPPER", "SWABLU", "ALTARIA"]) expect(met("WINGULL", [...alone, { species, hp: 0 }])).toEqual([]);
  });
});
