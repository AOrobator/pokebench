import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {DIALOGUE_A_LINE_SECTION,DIALOGUE_BUTTON_B_SECTION,SEMANTIC_TALK_IS_CHEAP,SEMANTIC_TALK_IS_CHEAP_A_LINE,playSystemPrompt} from "./play-config.js";

const ID = "dialogue-a-line-v1" as const;
const HISTORICAL_SECTION = "Dialogue button: B is the button for a message. Press B to advance or close one. Do not press A to move a message along: A talks to whatever you face and starts its message again, so the same sign or person speaks once more. Once you can walk, leave instead of pressing A in front of it.";
const HISTORICAL_TALK = "Talking is cheap: when the readout gives the person a navigate_to_target target, call navigate_to_target with it; it walks there, faces them and presses A, and the harness reads the conversation until your next decision.";
// The three sections this switch rewrites, on, on the same flags the current arms run.
const arm = {"dialog-button-b-v1": true, "dialogue-auto-advance-v1": true, "explorer-guidance-v2": true, "semantic-navigation-v2": true} as unknown as FeatureSet;
const prompt = (features: FeatureSet): string => playSystemPrompt(features, null);

// dialogue-a-line-v1: the dialogue section used to end "Once you can walk, leave instead of pressing A in
// front of it" (commit 05060925c), added to stop A-spam at signs. It generalizes to people and contradicted
// the Talk to people section a few paragraphs earlier. In the 24h Qwen run, turn 354 bumped a blocking Team
// Aqua NPC with RIGHT instead of talking to it, then abandoned the story path for 11 hours.
describe("dialogue-a-line-v1", () => {
  it("OFF keeps the historical words, leave rule included, byte for byte", () => {
    expect(DIALOGUE_BUTTON_B_SECTION).toBe(HISTORICAL_SECTION);
    expect(SEMANTIC_TALK_IS_CHEAP).toBe(HISTORICAL_TALK);
    const off = prompt({...arm, [ID]: false});
    expect(off).toContain(HISTORICAL_SECTION);
    expect(off).toContain(HISTORICAL_TALK);
  });

  it("ON keeps the B facts and the A fact, drops the general leave rule", () => {
    const on = prompt({...arm, [ID]: true});
    expect(on).toContain(DIALOGUE_A_LINE_SECTION);
    expect(on).not.toContain(HISTORICAL_SECTION);
    expect(on).toContain("B is the button for a message");
    expect(on).toContain("Press B to advance or close one");
    expect(on).toContain("A talks to whatever you face and starts that sign's or person's message again");
    expect(on).not.toMatch(/leave (instead of|rather than) pressing A/i);
  });

  it("ON scopes the anti-A-spam rule to a message already read, and says A talks to a person", () => {
    const on = prompt({...arm, [ID]: true});
    expect(on).toContain("Do not press A to advance a message, or press it again on a message you have already read");
    expect(on).toContain("To talk to a person or read a sign, press A once on it");
  });

  it("ON contains no name from this deny-list", () => {
    // Three tokens is all this can prove; it is a leak check, not proof that no name exists.
    expect(DIALOGUE_A_LINE_SECTION).not.toMatch(/MOM|truck|Aqua|Roxanne/);
  });

  it("ON leaves navigate_to_target preferred and still gives A as the way to talk without a target", () => {
    expect(SEMANTIC_TALK_IS_CHEAP_A_LINE.startsWith(HISTORICAL_TALK)).toBe(true);
    expect(SEMANTIC_TALK_IS_CHEAP_A_LINE).toContain("When it gives none, face the person and press A.");
    const on = prompt({...arm, [ID]: true});
    expect(on).toContain(SEMANTIC_TALK_IS_CHEAP_A_LINE);
    // the paragraph does not end at the historical sentence: the no-target clause follows it.
    expect(on).not.toMatch(/until your next decision\.\n/);
  });
});
