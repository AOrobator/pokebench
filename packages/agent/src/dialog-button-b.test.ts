import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {DIALOGUE_BUTTON_B_SECTION,playSystemPrompt} from "./play-config.js";

const ID = "dialog-button-b-v1" as const;

describe("dialog-button-b-v1", () => {

  it("OFF leaves the prompt byte for byte, and ON adds the section immediately before harness trust", () => {
    const off = playSystemPrompt({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: false, "harness-trust-v1": true}, null);
    const on = playSystemPrompt({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: true, "harness-trust-v1": true}, null);
    expect(off).not.toContain("Dialogue button:");
    expect(on.replace(`\n\n${DIALOGUE_BUTTON_B_SECTION}`, "")).toBe(off);
    expect(DIALOGUE_BUTTON_B_SECTION).toContain("B is the button for a message");
    expect(DIALOGUE_BUTTON_B_SECTION).not.toContain("MOM");
    expect(DIALOGUE_BUTTON_B_SECTION).not.toContain("truck");
    const sectionAt = on.indexOf(DIALOGUE_BUTTON_B_SECTION);
    expect(sectionAt).toBeGreaterThan(0);
    expect(on.indexOf("Trust order", sectionAt)).toBeGreaterThan(sectionAt);
  });
});
