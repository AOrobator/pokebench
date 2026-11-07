import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { rayquazaLaneFeatures } from "../test-support/rayquaza-lane.js";
import type { RunEvent } from "./events.js";
import { finalGuide } from "./play-wiring.js";
import { RAYQUAZA_GUIDE_STEPS } from "./rayquaza-guide-data.js";
import { OLD_RIVAL_LINE } from "./rayquaza-guide.js";

const ON = rayquazaLaneFeatures();
const NEW_LINE = "X Attack and X Speed against Slugma if you have them. Grovyle's Absorb took a Level 22 Marshtomp out in two hits.";
const AT_RIVAL = RAYQUAZA_GUIDE_STEPS.slice(0, RAYQUAZA_GUIDE_STEPS.findIndex(step => step.after === "ROUTE_110") + 1);
const milestone = (name: string) => ({ type: "milestone", name, origin: "present_at_start" }) as unknown as RunEvent;

async function guideAtRival(features: typeof ON): Promise<string> {
  let listener: (event: RunEvent) => void = () => undefined;
  const context = finalGuide(features, { subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: () => undefined }, (messages: AgentMessage[]) => Promise.resolve(messages));
  for (const step of AT_RIVAL.slice(1)) listener(milestone(step.after));
  return JSON.stringify((await context([])).at(-1));
}

describe("rq-old-rival-line-v1", () => {
  it("off, the guide keeps the current rival line", async () => {
    const out = await guideAtRival({ ...ON, "rq-old-rival-line-v1": false });
    expect(out).toContain(NEW_LINE);
    expect(out).not.toContain(OLD_RIVAL_LINE);
  });
  it("on, only the rival tactics change", async () => {
    const out = await guideAtRival({ ...ON, "rq-old-rival-line-v1": true });
    expect(out).toContain(OLD_RIVAL_LINE);
    expect(out).not.toContain("Against Slugma");
    expect(out).toContain("Decline Foresight.");
  });
  it("the current row still holds the text the switch replaces", () => {
    expect(AT_RIVAL.at(-1)?.note).toContain(NEW_LINE);
  });
});
