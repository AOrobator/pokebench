import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { RunView, foldUntil, isRunEvent, type StateEvent } from "./model.js";
import { partyNotice, party } from "./panels.js";

// Native recorded states, reduced to party/battle and required state fields.
// roxanne-autonomous-16gpuh-20261023_gpu0_explore-1, 2026-10-23.
const raw: unknown = JSON.parse(readFileSync(new URL("../test-support/party-health-recorded.json", import.meta.url), "utf8"));
if (!Array.isArray(raw) || !raw.every(isRunEvent)) throw new Error("invalid native fixture");
const samples = raw as StateEvent[];
const at = (i: number): StateEvent => { const s = samples[i]; if (s === undefined) throw new Error("sample missing"); return s; };
const fold = (...events: StateEvent[]): RunView => { const v = new RunView(); for (const e of events) v.apply(e); return v; };

it("updates 39 → 22 → 6 HP from the same native samples whose party was omitted", () => {
  const v = fold(at(0), at(1));
  expect(v.partyState).toBe(at(0)); // Raw source retains its original provenance.
  expect(v.partyMembers[0]?.hp).toBe(22);
  expect(party(v)).toContain("22/39");
  expect(partyNotice(v)).toContain("battle RAM");
  expect(partyNotice(v)).toContain("#18175");
  expect(partyNotice(v)).not.toContain("Party unavailable");
  v.apply(at(3)); v.apply(at(4));
  expect(v.partyMembers[0]?.hp).toBe(6);
  expect(at(0).party[0]?.hp).toBe(39);
});

it("does not read ahead in replay, retains recovered health through unreadable transitions, and resets on readable party", () => {
  expect(foldUntil(samples, Date.parse(at(0).t)).partyMembers[0]?.hp).toBe(39);
  const v = fold(at(0), at(1));
  v.apply({ ...at(2), battle: null });
  expect(v.partyMembers[0]?.hp).toBe(22);
  expect(partyNotice(v)).toContain("may have changed");
  v.apply(at(3));
  expect(v.partyMembers).toEqual(at(3).party);
  expect(v.partyHealth).toBeNull();
});

it.each(["identity", "enemy", "absent", "uninitialized", "owner", "invalid-hp", "zero-max", "duplicate"])("does not overlay %s battle data", (kind) => {
  const e = structuredClone(at(1)), b = e.battle;
  if (b?.battlers == null || b.battlers[0] === undefined) throw new Error("fixture battle missing");
  const m = b.battlers[0];
  if (kind === "identity") m.identity = "different";
  if (kind === "enemy") m.position = 1;
  if (kind === "absent") m.absent = true;
  if (kind === "uninitialized") b.initialized = false;
  if (kind === "owner") e.party_owner = "tutorial";
  if (kind === "invalid-hp") m.hp = m.max_hp + 1;
  if (kind === "zero-max") m.max_hp = 0;
  if (kind === "duplicate") b.battlers.push({ ...m, battler: 2, position: 2 });
  expect(fold(at(0), e).partyMembers).toEqual(at(0).party);
});

it("updates status and both player slots while leaving reserve health explicitly stale", () => {
  const a = structuredClone(at(0)), e = structuredClone(at(1));
  const original = a.party[0], b = e.battle, mon = b?.battlers?.[0];
  if (original === undefined || b?.battlers == null || mon === undefined) throw new Error("fixture missing");
  a.party.push({ ...original, identity: "reserve" }, { ...original, identity: "partner" });
  mon.status1 = 8;
  b.battlers.push({ ...mon, identity: "partner", party_slot: 2, battler: 2, position: 2, hp: 1 });
  const v = fold(a, e);
  expect(v.partyMembers.map(m => m.hp)).toEqual([22, 39, 1]);
  expect(v.partyMembers[0]?.status).toBe(8);
  expect(partyNotice(v)).toContain("Other party members");
  expect(v.partyMembers[0]?.moves).toEqual(original.moves);
});
