import {describe, expect, it} from "vitest";
import {SWITCHABLE_FEATURES} from "./features.js";
import {FROZEN_SWITCHES, LATER_SWITCHES} from "../test-support/legacy-features.js";

// The legacy fixture boundary used to be an index (indexOf + slice), so it encoded the registry's order and every
// position after a deletion. It is now a set of ids, and these tests hold that property: the split between frozen and
// later switches is membership, and nothing about it moves when the registry changes shape.
describe("the frozen switch boundary", () => {
  it("splits the registry cleanly with no gap and no overlap", () => {
    expect(LATER_SWITCHES.filter(id => FROZEN_SWITCHES.has(id))).toEqual([]);
    expect(SWITCHABLE_FEATURES.filter(id => !FROZEN_SWITCHES.has(id) && !LATER_SWITCHES.includes(id))).toEqual([]);
    expect(FROZEN_SWITCHES.size + LATER_SWITCHES.length).toBe(SWITCHABLE_FEATURES.length);
  });

  it("does not move when a frozen id in the middle of the registry is deleted", () => {
    // Deleting a non-anchor frozen id used to shift the index boundary by one, pulling the anchor through into
    // "later" and rebuilding the legacy fixtures from the wrong set. Membership cannot do that: the deleted id
    // simply stops being a member and nothing else crosses the line.
    const middle = "bag-healing-items-v1";
    expect(FROZEN_SWITCHES.has(middle)).toBe(true);
    expect(LATER_SWITCHES).not.toContain(middle);
    const withoutMiddle = SWITCHABLE_FEATURES.filter(id => id !== middle);
    expect(withoutMiddle.filter(id => !FROZEN_SWITCHES.has(id))).toEqual(LATER_SWITCHES);
  });

  it("keeps the anchor deletable, where the old code threw", () => {
    // The old boundary threw when indexOf(LAST_FROZEN_SWITCH) was -1, which made the anchor switch undeletable.
    const anchor = "map-observability-v1";
    expect(SWITCHABLE_FEATURES).toContain(anchor);
    expect(FROZEN_SWITCHES.has(anchor)).toBe(true);
    const withoutAnchor = SWITCHABLE_FEATURES.filter(id => id !== anchor);
    expect(withoutAnchor.filter(id => !FROZEN_SWITCHES.has(id))).toEqual(LATER_SWITCHES);
  });

  it("treats a newly registered switch as later without editing any fixture", () => {
    // The convenience the append-only contract existed for: registering a switch needs no fixture edit, because an
    // unknown id is absent from the set and therefore later.
    const withNew = [...SWITCHABLE_FEATURES, "some-future-switch-v1" as never];
    expect(FROZEN_SWITCHES.has("some-future-switch-v1" as never)).toBe(false);
    expect(withNew.filter(id => !FROZEN_SWITCHES.has(id))).toEqual([...LATER_SWITCHES, "some-future-switch-v1"]);
  });
});
