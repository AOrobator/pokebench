import {describe, expect, it} from "vitest";
import {FEATURES, featureInfo} from "./features.js";

// One live switch per concept. A flag id ending in -vN is a version of the stack named by its base (the id
// without the -vN), and a stack keeps exactly one version: the newest. Two ids sharing a base is the same
// concept switched twice, so two versions of one idea can both be ON and neither is measurable alone.
//
// OPEN_STACKS is that debt: the versioned stacks still carrying more than one version, with the exact ids
// features.ts defines today. It ratchets DOWN only. Collapsing a stack deletes the older ids from
// features.ts, play-preset.ts, next-run.ts, panels.ts, SERVER_FEATURES and the live recipe, and deletes that
// base here in the same commit. A version added to any stack fails this test: either collapse the stack or,
// if the new flag is a different concept, give it a base name that is not a version of an existing flag.
const OPEN_STACKS: Readonly<Record<string, readonly string[]>> = {
  "auto-talk": ["auto-talk-v1", "auto-talk-v2", "auto-talk-v3"],
  "caught-nickname-prompt": ["caught-nickname-prompt-v1", "caught-nickname-prompt-v2"],
  "exit-labels": ["exit-labels-v2", "exit-labels-v3"],
  "explorer-guidance": ["explorer-guidance-v1", "explorer-guidance-v2"],
  "harness-trust": ["harness-trust-v1", "harness-trust-v2"],
  "heal-before-trainers": ["heal-before-trainers-v1", "heal-before-trainers-v2"],
  "instruction-ledger": ["instruction-ledger-v1", "instruction-ledger-v2"],
  "just-in-time-prompt": ["just-in-time-prompt-v1", "just-in-time-prompt-v2"],
  "low-hp-trainer-warning": ["low-hp-trainer-warning-v1", "low-hp-trainer-warning-v2"],
  "navigation-refusal-reasons": ["navigation-refusal-reasons-v1", "navigation-refusal-reasons-v2", "navigation-refusal-reasons-v3"],
  "semantic-navigation": ["semantic-navigation-v1", "semantic-navigation-v2"],
  "stale-story-goal": ["stale-story-goal-v1", "stale-story-goal-v2"],
  "surf-gated-exits": ["surf-gated-exits-v1", "surf-gated-exits-v2"],
  "text-only-supervisor": ["text-only-supervisor-v1", "text-only-supervisor-v2"],
  "trainer-sight-check": ["trainer-sight-check-v1", "trainer-sight-check-v2"],
};

type Flag = {readonly id: string};
const base = (id: string): string => id.replace(/-v\d+$/, "");
const version = (id: string): number => Number(/-v(\d+)$/.exec(id)?.[1] ?? "0");
const same = (actual: readonly string[], recorded: readonly string[]): boolean => actual.length === recorded.length && recorded.every(id => actual.includes(id));

// Every stack in a registry, keyed by base, in registry order.
export function stacks(flags: readonly Flag[] = FEATURES): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const {id} of flags) {
    if (!/-v\d+$/.test(id)) continue;
    const key = base(id);
    found.set(key, [...(found.get(key) ?? []), id]);
  }
  return found;
}

// The bases this test rejects: every base whose versions are not exactly what OPEN_STACKS records.
export function duplicateStacks(flags: readonly Flag[] = FEATURES): string[] {
  return [...stacks(flags)]
    .filter(([name, ids]) => (name in OPEN_STACKS ? !same(ids, OPEN_STACKS[name] ?? []) : ids.length > 1))
    .map(([name]) => name);
}

describe("versioned feature stacks", () => {
  it("keeps at most one version per concept outside the recorded open stacks", () => {
    const duplicated = [...stacks()]
      .filter(([name, ids]) => !(name in OPEN_STACKS) && ids.length > 1)
      .map(([name, ids]) => `${name}: ${ids.join(", ")}`);
    expect(duplicated).toEqual([]);
  });

  it("records exactly the versions each open stack defines today", () => {
    const found = stacks();
    const drifted = Object.entries(OPEN_STACKS).flatMap(([name, ids]) => {
      const actual = found.get(name) ?? [];
      return same(actual, ids) ? [] : [`${name}: recorded ${ids.join(", ")} but features.ts has ${actual.length === 0 ? "none" : actual.join(", ")}`];
    });
    expect(drifted).toEqual([]);
  });

  it("lists each open stack oldest first, so the surviving version is the last one", () => {
    const unordered = Object.entries(OPEN_STACKS)
      .filter(([, ids]) => ids.some((id, index) => index > 0 && version(ids[index - 1] ?? "") >= version(id)))
      .map(([name]) => name);
    expect(unordered).toEqual([]);
  });

  it("gives every recorded stack id a registered flag", () => {
    const missing = Object.values(OPEN_STACKS).flat().filter(id => {
      try {
        featureInfo(id as never);
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });

  it("fails when a version is added to a stack", () => {
    const grown: Flag[] = [...FEATURES, {id: "auto-talk-v4"}, {id: "text-only-supervisor-v3"}, {id: "brand-new-thing-v1"}];
    expect(duplicateStacks(grown).sort()).toEqual(["auto-talk", "text-only-supervisor"]);
  });
});
