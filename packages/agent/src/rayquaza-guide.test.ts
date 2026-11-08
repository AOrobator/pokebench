import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";
import type { RunEvent } from "./events.js";
import { MILESTONES } from "./milestones.js";
import { parseDash } from "./mach-dash.js";
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

  it("gives Route 110 the observed winning moves without a catch or level target", () => {
    const note = RAYQUAZA_GUIDE_STEPS.find((step) => step.after === "ROUTE_110")?.note ?? "";
    expect(note).toContain("If known, Mud Shot Slugma and Rock Tomb Grovyle and Wingull.");
    expect(note).toContain("Grovyle's Absorb hits Marshtomp x4.");
    expect(note).not.toMatch(/Taillow|catch|aim for level/i);
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

describe("the guide's route rows", () => {
  const row = (after: string): GuideStep => {
    const step = RAYQUAZA_GUIDE_STEPS.find((candidate) => candidate.after === after);
    if (step === undefined) throw new Error(`no row ${after}`);
    return step;
  };
  const BUTTON_ROUTE = /\b[UDLR]\d*[ ,][UDLR]\d*\b/;
  const CLIMBS = new Set(["SKY_PILLAR_OPENED", "SOOTOPOLIS_CRISIS_RESOLVED", "AT:SkyPillar_2F:10:2", "AT:SkyPillar_3F:3:2", "AT:SkyPillar_4F:11:2", "AT:SkyPillar_5F:3:2"]);

  it("gives every button route but the climbs one recovery line", () => {
    const routes = RAYQUAZA_GUIDE_STEPS.filter((step) => BUTTON_ROUTE.test(step.note) && !CLIMBS.has(step.after));
    expect(routes.map((step) => step.after)).toEqual(expect.arrayContaining(["MAP:DewfordTown_Gym", "KNUCKLE_BADGE", "FORTREE_GYM_ENTERED", "MOSSDEEP_GYM_ENTERED", "SOOTOPOLIS_GYM_ENTERED", "VICTORY_ROAD_WALLY_DEFEATED"]));
    expect(routes.filter((step) => !step.note.includes("If off this route, trust the map."))).toEqual([]);
    for (const after of CLIMBS) expect(row(after).note).not.toContain("trust the map");
  });

  it("names the Dock interaction that opens the Oceanic Museum", () => {
    expect(row("SLATEPORT_CITY").note).toContain("Talk to Dock at (5,5)");
  });

  it("retires the Fallarbor pickup after the Nugget is collected and sold", () => {
    const start = RAYQUAZA_GUIDE_STEPS.indexOf(row("FALLARBOR_TOWN"));
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(start));
    const bag = (quantity: number): RunEvent => ({
      type: "state", started: true, screen: "overworld", active_ui: null,
      in_battle: false, map_id: [0, 13], party: [],
      resources: { bag: quantity === 0 ? [] : [{ name: "NUGGET", quantity }] },
    }) as unknown as RunEvent;
    guide.observe(bag(0));
    expect(guide.current().note).toContain("hidden Nugget");
    guide.observe(bag(1));
    expect(guide.current().after).toBe("GOT:NUGGET");
    guide.observe(bag(0));
    expect(guide.current().after).toBe("GOT:NUGGET");
    expect(guide.current().note).not.toContain("hidden Nugget");
    guide.observe(milestone("ROUTE_114"));
    expect(guide.current().after).toBe("ROUTE_114");
  });

  it("walks a run without Teleport back to Mauville and heals there", () => {
    const { note } = row("HM_STRENGTH_RECEIVED");
    expect(note).toContain("walk east through the opened tunnel to Verdanturf, then Route 117");
    expect(note).toContain("Heal at the Center.");
    expect(note).toContain("Rock Smash (19,100)");
    expect(note).not.toContain("(18,101)");
    expect(note).toContain("Teach Strength over Growl, else Mud-Slap. Keep Mud Shot. If neither, skip.");
  });

  it("ends the climb at Rayquaza and names the talks that open Juan's Gym", () => {
    const top = RAYQUAZA_GUIDE_STEPS.find((step) => step.after === "AT:SkyPillar_Top:14:7");
    expect(top?.note).toContain("Maxie at (33,35)");
    expect(top?.note).toContain("Archie at (34,35)");
    expect(top?.note).toContain("Wallace at the Gym door for HM07");
    const index = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "AT:SkyPillar_Top:14:7");
    expect(RAYQUAZA_GUIDE_STEPS[index + 1]?.after).toBe("HM_WATERFALL_RECEIVED");
  });
});

describe("the Sky Pillar climbs", () => {
  const index = (after: string): number => RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === after);
  const row = (after: string): GuideStep => {
    const step = RAYQUAZA_GUIDE_STEPS.find((candidate) => candidate.after === after);
    if (step === undefined) throw new Error(`no row ${after}`);
    return step;
  };
  const at = (name: string, x: number, y: number): RunEvent => {
    const tile = RAYQUAZA_GUIDE_STEPS.find((step) => step.at !== undefined && step.after.startsWith(`AT:${name}:`))?.at;
    if (tile === undefined) throw new Error(`no row on ${name}`);
    return { type: "state", map_id: tile.id, position: { x, y } } as unknown as RunEvent;
  };
  const SECOND = ["AT:SkyPillar_2F:10:2", "AT:SkyPillar_3F:3:2", "AT:SkyPillar_4F:11:2", "AT:SkyPillar_3F:7:4", "AT:SkyPillar_5F:3:2", "AT:SkyPillar_Top:16:15", "AT:SkyPillar_Top:14:7"];
  // Each route ran through the real tool on a real game server (worklog, 2026-11-07).
  const ROUTES = {
    SOOTOPOLIS_CRISIS_RESOLVED: "U1 L9 U4 R2 U3 L1 U3 R3 D2 R5 U3",
    "AT:SkyPillar_2F:10:2": "D1 R4 D11 L10 U4 R2 U8",
    "AT:SkyPillar_3F:3:2": "D7 L2 D6 R1 D1 R10 U5 L1 U6",
    "AT:SkyPillar_4F:11:2": "D14 L8 U8 R2",
    "AT:SkyPillar_5F:3:2": "L5 D3 R1 D4 L1 D4 R5 D1 R7 U5 L1 U6 L2 U1",
  };

  it("gives each floor of the second climb its verified route, in a form mach_dash takes", () => {
    for (const [after, route] of Object.entries(ROUTES)) {
      const { note } = row(after);
      expect(note).toContain(`mach_dash ${route}`);
      expect(parseDash(route).ok).toBe(true);
    }
  });

  it("never tells the model to ride past the 4F pocket", () => {
    const rows = RAYQUAZA_GUIDE_STEPS.slice(index("SKY_PILLAR_OPENED"), index("HM_WATERFALL_RECEIVED"));
    expect(rows.filter((step) => /R4 U3/.test(step.note))).toEqual([]);
  });

  it("walks the first climb, with no bike and no dash", () => {
    const rows = RAYQUAZA_GUIDE_STEPS.slice(index("SKY_PILLAR_OPENED"), index("RAYQUAZA_AWAKENED"));
    expect(rows.map((step) => step.after)).toEqual(["SKY_PILLAR_OPENED", "AT:SkyPillar_4F:5:4", "AT:SkyPillar_3F:6:4"]);
    expect(rows[0]?.note).toContain("No bike needed");
    expect(rows.filter((step) => step.note.includes("mach_dash"))).toEqual([]);
    expect(rows[1]?.note).toContain("Press RIGHT once");
  });

  it("first climb: its rows fire on the drop, and its stairs tiles move nothing", () => {
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(index("SKY_PILLAR_OPENED")));
    for (const tile of [at("SkyPillar_2F", 10, 2), at("SkyPillar_3F", 3, 2), at("SkyPillar_4F", 11, 2)]) guide.observe(tile);
    expect(guide.current().after).toBe("SKY_PILLAR_OPENED");
    guide.observe(at("SkyPillar_4F", 5, 4));
    expect(guide.current().after).toBe("AT:SkyPillar_4F:5:4");
    guide.observe(at("SkyPillar_3F", 6, 4));
    expect(guide.current().after).toBe("AT:SkyPillar_3F:6:4");
    for (const tile of [at("SkyPillar_4F", 7, 2), at("SkyPillar_5F", 3, 2), at("SkyPillar_Top", 16, 15)]) guide.observe(tile);
    expect(guide.current().after).toBe("AT:SkyPillar_3F:6:4");
  });

  it("second climb: every floor's arrival tile moves the guide one row, though the first climb passed them", () => {
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(index("SOOTOPOLIS_CRISIS_RESOLVED")));
    const tiles: readonly (readonly [string, number, number])[] = [["SkyPillar_2F", 10, 2], ["SkyPillar_3F", 3, 2], ["SkyPillar_4F", 11, 2], ["SkyPillar_3F", 7, 4], ["SkyPillar_5F", 3, 2], ["SkyPillar_Top", 16, 15], ["SkyPillar_Top", 14, 7]];
    tiles.forEach(([name, x, y], n) => {
      if (x === 14) {
        guide.observe(at(name, 14, 8));
        expect(guide.current().after).toBe(SECOND[n - 1]);
      }
      guide.observe(at(name, x, y));
      expect(guide.current().after).toBe(SECOND[n]);
    });
    guide.observe(milestone("HM_WATERFALL_RECEIVED"));
    expect(guide.current().after).toBe("HM_WATERFALL_RECEIVED");
  });

  it("a fall holds the row, and the same row still stands after the walk back", () => {
    const guide = new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(index("SOOTOPOLIS_CRISIS_RESOLVED")));
    guide.observe(at("SkyPillar_2F", 10, 2));
    guide.observe(at("SkyPillar_4F", 11, 2));
    expect(guide.current().after).toBe("AT:SkyPillar_2F:10:2");
    guide.observe(at("SkyPillar_2F", 10, 2));
    expect(guide.current().after).toBe("AT:SkyPillar_2F:10:2");
    expect(guide.current().note).toContain("If you fall");
  });

  it("the next story step stays within reach of a climb with no checkpoint seen", () => {
    expect(index("HM_WATERFALL_RECEIVED") - index("SOOTOPOLIS_CRISIS_RESOLVED")).toBeLessThanOrEqual(8);
    expect(index("RAYQUAZA_AWAKENED") - index("SKY_PILLAR_OPENED")).toBeLessThanOrEqual(8);
  });
});

describe("the guide's facts", () => {
  const note = (after: string, nth = 0): string => RAYQUAZA_GUIDE_STEPS.filter((step) => step.after === after)[nth]?.note ?? "";
  it.each([
    ["PLAYER_NAME_CONFIRMED", "Finish Birch's speech."],
    ["ROXANNE_FIRST_INTERACTION", "If offered, decline Bide and teach Mud Shot over Growl."],
    ["ROCK_TOMB_RECEIVED", "West of the Gym door, cross x=23"],
    ["DEVON_CORPORATION", "You are on 3F."],
    ["OCEANIC_MUSEUM_ENTERED", "If Mud Shot is offered now, teach it over Growl."],
    ["DEVON_GOODS_DELIVERED", "or Growl if Tackle is gone"],
    ["ROUTE_110", "Full Heal (status only, not HP)"],
    ["DYNAMO_BADGE", "that one rock opens the way"],
    ["DYNAMO_BADGE", "(0,66-71)"],
    ["ROUTE_111_NORTH", "(0,66-71)"],
    ["ROUTE_111_NORTH", "after a whiteout or leaving the map the rocks are back, so smash (19,100) again"],
    ["FIERY_PATH", "After a whiteout or leaving the map, Route 111's rocks are back, so smash (19,100) again."],
    ["GOT:NUGGET", "TM47 Steel Wing"],
    ["GOT:NUGGET", "2 Escape Ropes, a Super Potion, 10 X Attacks"],
    ["ROUTE_114", "Use a Super Repel if you have one"],
    ["LAVARIDGE_TOWN", "Use Potions now if you are hurt"],
    ["AT:LavaridgeTown_Gym_1F:12:12", "Bag items before Flannery."],
    ["WEATHER_INSTITUTE_ENTERED", "If your party is full, Castform goes to the PC."],
    ["FEATHER_BADGE", "hideout door at (16,18)"],
    ["MASTER_BALL_OBTAINED", "You land at (3,20)."],
    ["AQUA_HIDEOUT_SUBMARINE_CHAMBER", "B2F panel (31,8), stairs (3,3), B1F stairs (12,1), B2F panel (8,8)"],
    ["MOSSDEEP_CITY", "Sell any Nugget first."],
    ["SPACE_CENTER_OCCUPATION_ENTERED", "At the party screen pick your Surf user first, then CONFIRM."],
    ["HM_DIVE_RECEIVED", "Dive at (38,27)"],
    ["SEAFLOOR_KYOGRE_RELEASE_CONFIRMED", "Dive at (45,66)"],
    ["SOOTOPOLIS_CITY", "Talk to Steven at (20,36)"],
    ["HM_WATERFALL_RECEIVED", "If it went to the PC, withdraw it first."],
    ["EVER_GRANDE_LANDING", "Pokémon Center at (27,48) to set your respawn"],
    ["VICTORY_ROAD_WALLY_DEFEATED", "go up to (5,16), then U2 R4 to the ladder at (9,14)"],
    ["VICTORY_ROAD_B1F", "the ladder at (30,25)"],
  ])("%s says: %s", (after, text) => {
    expect(note(after)).toContain(text);
  });

  it("sends the candy rows by the tile the story needs", () => {
    expect(note("GOT:RARE_CANDY", 0)).toContain("enter Dewford Gym");
    expect(note("GOT:RARE_CANDY", 0)).not.toContain("(18,101)");
    expect(note("GOT:RARE_CANDY", 2)).toContain("Stand at (25,7), face south, press A and answer YES");
    expect(note("GOT:RARE_CANDY", 2)).toContain("Fly needs the Feather Badge");
  });

  it("gives each later Fly row its own way without Fly, the held Sky Pillar rows aside", () => {
    const held = new Set(["WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE", "SOOTOPOLIS_CRISIS_RESOLVED"]);
    const from = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "FEATHER_BADGE");
    const rows = RAYQUAZA_GUIDE_STEPS.slice(from).filter((step) => /\bFly to\b/.test(step.note) && !held.has(step.after));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((step) => !step.note.includes("(no Fly:"))).toEqual([]);
  });
});

describe("the Dewford Gym row", () => {
  const start = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "GO_GOGGLES_RECEIVED");
  const rows = RAYQUAZA_GUIDE_STEPS.slice(start);
  const gym = rows.find((step) => step.after === "MAP:DewfordTown_Gym");
  if (gym?.enter === undefined) throw new Error("no Dewford Gym map row");
  const inGym = { type: "state", map_id: gym.enter, position: { x: 5, y: 27 } } as unknown as RunEvent;
  const ROUTE111 = rows[1]?.at;
  if (ROUTE111 === undefined) throw new Error("no candy tile row");
  const bag = (quantity: number): RunEvent => ({ type: "state", started: true, screen: "overworld", active_ui: null, in_battle: false, map_id: ROUTE111.id, position: { x: ROUTE111.x, y: ROUTE111.y }, party: [], resources: { bag: [{ name: "RARE CANDY", quantity }] } }) as unknown as RunEvent;

  it("keeps the boat row after an early Gym visit, then fires on entering", () => {
    const guide = new GuidePosition(rows);
    guide.observe(milestone("DEWFORD_GYM_ENTERED"));
    guide.observe(inGym);
    guide.observe(bag(0));
    guide.observe(bag(1));
    expect(guide.current().note).toContain("Briney");
    guide.observe(inGym);
    expect(guide.current()).toBe(gym);
  });

  it("is not stranded by a skipped candy: the badge moves the guide", () => {
    const guide = new GuidePosition(rows);
    guide.observe(inGym);
    expect(guide.current().after).toBe("GO_GOGGLES_RECEIVED");
    guide.observe(milestone("KNUCKLE_BADGE"));
    expect(guide.current().after).toBe("KNUCKLE_BADGE");
  });
});

describe("the Mossdeep Gym rows", () => {
  const KI_ROUTE = "U4 L3 U5 R U D U R6 U2 R D U L R D4 L R2 D7 L D L D L D L6 R L R6 U R U R U R U7 L2 R U4 L2 U2 D U D U2 L U3 R U D U D U2 L3 D2 R D U D U D U D R D2 R D U R3 U6 R U R U3 R2 U";
  const LEGS = ["U4 L3 U3", "U2 R U D U R6 U2 R", "D U", "L R", "D4 L R2 D7 L D L D L D L6", "R L R6 U R U R U R U7 L2 R U4", "L2", "U2 D U D U2 L U3 R U D U D U2 L3 D2 R D U D U D U D R D2 R D U R3 U6", "R U R U2", "U R2 U"];
  const expand = (route: string): string => route.split(" ").map((press) => press.charAt(0).repeat(Number(press.slice(1) || "1"))).join("");
  const start = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "MOSSDEEP_GYM_ENTERED");
  const badge = RAYQUAZA_GUIDE_STEPS.findIndex((step) => step.after === "MIND_BADGE");
  const rows = RAYQUAZA_GUIDE_STEPS.slice(start, badge);
  const gym = rows[1]?.at?.id;
  if (gym === undefined) throw new Error("the Gym has no tile rows");
  const at = (x: number, y: number): RunEvent => ({ type: "state", map_id: gym, position: { x, y } }) as unknown as RunEvent;
  const WARP_LANDINGS = [[1, 23], [23, 20], [15, 34], [8, 12], [11, 35], [21, 10]] as const;
  const fromGym = (): GuidePosition => new GuidePosition(RAYQUAZA_GUIDE_STEPS.slice(start));

  it("splits KI's route at the warps without losing a press", () => {
    expect(expand(LEGS.join(" "))).toBe(expand(KI_ROUTE));
    for (const leg of LEGS) expect(rows.some((row) => row.note.includes(leg))).toBe(true);
    expect(rows.map((row) => row.at === undefined ? null : [row.at.x, row.at.y])).toEqual([null, ...WARP_LANDINGS]);
  });

  it("keeps the badge within one milestone's reach of the Gym's first row", () => {
    expect(badge - start).toBeLessThanOrEqual(8);
  });

  it("fires each row in order on its warp landing", () => {
    const guide = fromGym();
    for (const [i, [x, y]] of WARP_LANDINGS.entries()) {
      guide.observe(at(x, y));
      expect(guide.current()).toBe(rows[i + 1]);
    }
    guide.observe(milestone("MIND_BADGE"));
    expect(guide.current().after).toBe("MIND_BADGE");
  });

  it("does not fire the (8,12) row on the first of the two (9,18) landings", () => {
    const guide = fromGym();
    for (const [x, y] of [[1, 23], [23, 20], [23, 21], [9, 18], [8, 18], [23, 20], [23, 24], [9, 18]] as const) guide.observe(at(x, y));
    expect(guide.current()).toBe(rows[2]);
  });

  it("stalls on a skipped landing and recovers at the badge", () => {
    const guide = fromGym();
    guide.observe(at(1, 23));
    for (const [x, y] of WARP_LANDINGS.slice(2)) guide.observe(at(x, y));
    expect(guide.current()).toBe(rows[1]);
    guide.observe(milestone("MIND_BADGE"));
    expect(guide.current().after).toBe("MIND_BADGE");
  });

  it("stays on the row after re-entry, which names the way back to it, and goes on from there", () => {
    const guide = fromGym();
    for (const [x, y] of WARP_LANDINGS.slice(0, 3)) guide.observe(at(x, y));
    const held = guide.current();
    guide.observe(at(6, 35));
    for (const [x, y] of WARP_LANDINGS.slice(0, 2)) guide.observe(at(x, y));
    expect(guide.current()).toBe(held);
    guide.observe(at(8, 12));
    expect(guide.current()).toBe(rows[4]);
  });

  it("gives every tile row the whole route from the door up to it", () => {
    let walked = "";
    for (const [i, row] of rows.entries()) {
      if (i > 0) expect(row.note).toContain(`from (6,35): ${walked}`);
      walked = [walked, ...[LEGS.slice(0, 1), LEGS.slice(1, 2), LEGS.slice(2, 5), LEGS.slice(5, 7), LEGS.slice(7, 8), LEGS.slice(8, 9)][i] ?? []].filter(Boolean).join(" ");
    }
    expect(rows.at(-1)?.note).toMatch(/after a loss/i);
  });

  it("cannot use one tile for two rows: only the first can ever fire", () => {
    const tile = { id: [14, 0] as const, x: 23, y: 20 };
    const guide = new GuidePosition([{ after: "RUN_START", map: null, note: "Start." }, { after: "AT:Gym:23:20", map: null, note: "First.", at: tile }, { after: "AT:Gym:23:20", map: null, note: "Second.", at: tile }]);
    const on = { type: "state", map_id: tile.id, position: { x: 23, y: 20 } } as unknown as RunEvent;
    guide.observe(on);
    guide.observe(on);
    expect(guide.current().note).toBe("First.");
  });

  it("uses no tile twice in the shipped guide", () => {
    const tiles = RAYQUAZA_GUIDE_STEPS.filter((step) => step.at !== undefined).map((step) => step.after);
    expect(new Set(tiles).size).toBe(tiles.length);
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
