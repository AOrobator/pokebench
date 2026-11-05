import { describe, expect, it } from "vitest";
import { cardRow } from "./card-row.js";

const card = (runId: string) => ({ runId });

describe("cardRow", () => {
  it("keeps every live card beside an opened older run, opened run first", () => {
    expect(cardRow(card("old"), [card("live-a"), card("live-b")]).map(c => c.runId)).toEqual(["old", "live-a", "live-b"]);
  });
  it("shows only the live cards when no older run is open", () => {
    expect(cardRow(null, [card("live-a")]).map(c => c.runId)).toEqual(["live-a"]);
  });
  it("shows the opened run alone when nothing is live", () => {
    expect(cardRow(card("old"), []).map(c => c.runId)).toEqual(["old"]);
  });
  it("never shows one run twice", () => {
    expect(cardRow(card("same"), [card("same"), card("live-a")]).map(c => c.runId)).toEqual(["same", "live-a"]);
  });
});
