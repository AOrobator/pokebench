import { describe, expect, it, vi } from "vitest";
import { MilestoneError, MilestoneWatcher } from "./milestones.js";

function serving(...bodies: unknown[]): typeof fetch {
  const fn = vi.fn<typeof fetch>();
  for (const body of bodies) fn.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  return fn;
}

const entry = (name: string, completed: boolean, timestamp?: number) =>
  timestamp === undefined ? { id: 1, name, completed } : { id: 1, name, completed, timestamp };

describe("MilestoneWatcher", () => {
  it("reports each completion once, ordered by the server's timestamp", async () => {
    const fetchFn = serving(
      { milestones: [entry("PLAYER_NAME_SET", true, 20), entry("GAME_RUNNING", true, 10), entry("LITTLEROOT", false)] },
      { milestones: [entry("PLAYER_NAME_SET", true, 20), entry("GAME_RUNNING", true, 10), entry("LITTLEROOT", true, 30)] },
      { milestones: [entry("LITTLEROOT", true, 30)] },
    );
    const watcher = new MilestoneWatcher("http://127.0.0.1:8000", fetchFn);
    expect(await watcher.poll()).toEqual([
      { name: "GAME_RUNNING", serverTimestamp: 10 },
      { name: "PLAYER_NAME_SET", serverTimestamp: 20 },
    ]);
    expect(await watcher.poll()).toEqual([{ name: "LITTLEROOT", serverTimestamp: 30 }]);
    expect(await watcher.poll()).toEqual([]);
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8000/milestones", expect.anything());
  });

  it.each([
    ["no milestones list", {}],
    ["a nameless entry", { milestones: [{ completed: true, timestamp: 1 }] }],
    ["a completed entry without a timestamp", { milestones: [entry("GAME_RUNNING", true)] }],
  ])("rejects %s", async (_label, body) => {
    await expect(new MilestoneWatcher("http://x", serving(body)).poll()).rejects.toThrow(MilestoneError);
  });

  it("names the HTTP status on failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("down", { status: 503 }));
    await expect(new MilestoneWatcher("http://x", fetchFn).poll()).rejects.toThrow(/503/);
  });
});
