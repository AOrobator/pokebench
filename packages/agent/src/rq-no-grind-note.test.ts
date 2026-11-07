import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { rayquazaLaneFeatures } from "../test-support/rayquaza-lane.js";
import type { RunEvent } from "./events.js";
import { finalGuide } from "./play-wiring.js";
import { BATTLE_EXPLAINER, NO_GRIND_EXPLAINER } from "./rayquaza-guide.js";

const ON = rayquazaLaneFeatures();
const fight = { type: "state", started: true, screen: "battle", active_ui: null, in_battle: true, map_id: [0, 16], party: [], battle: { battle_type: 4, battlers: [] } } as unknown as RunEvent;

async function battleNote(features: typeof ON): Promise<string> {
  let listener: (event: RunEvent) => void = () => undefined;
  const context = finalGuide(features, { subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: () => undefined }, (messages: AgentMessage[]) => Promise.resolve(messages));
  listener(fight);
  return JSON.stringify(await context([]));
}

describe("rq-no-grind-note-v1", () => {
  it("off keeps the earlier battle note", async () => {
    const out = await battleNote({ ...ON, "rq-no-grind-note-v1": false });
    expect(JSON.parse(out)).toContainEqual(expect.objectContaining({ content: BATTLE_EXPLAINER }));
  });
  it("on tells the model never to grind or hunt", async () => {
    const out = await battleNote({ ...ON, "rq-no-grind-note-v1": true });
    expect(JSON.parse(out)).toContainEqual(expect.objectContaining({ content: NO_GRIND_EXPLAINER }));
    expect(out).not.toMatch(/gain levels|second type/);
  });
  it("only the after-a-loss sentence changes", () => {
    const parts = (note: string): string[] => note.split(". ");
    expect(parts(NO_GRIND_EXPLAINER).filter((s) => !parts(BATTLE_EXPLAINER).includes(s))).toEqual(["After a loss, change something before retrying: teach a TM, change your moves or buy Potions", "Never grind or hunt"]);
  });
  it("the lane turns it on", () => {
    expect(ON["rq-no-grind-note-v1"]).toBe(true);
  });
});
