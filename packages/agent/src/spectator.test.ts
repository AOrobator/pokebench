import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync } from "node:fs";

interface Follower {
  toggle(): Promise<void>;
  muted: boolean;
}
interface Dependencies {
  unlock: () => Promise<void>;
  fetch: (url: string, options: { signal: AbortSignal; cache: "no-store" }) => Promise<Response>;
  play: (pcm: Int16Array, rate: number) => () => void;
  status: (text: string) => void;
}
async function create(deps: Dependencies): Promise<Follower> {
  expect(existsSync(new URL("spectator.ts", import.meta.url))).toBe(true);
  const name = "./spectator.js";
  const mod = await import(name) as { AudioFollower: new (deps: Dependencies) => Follower };
  return new mod.AudioFollower(deps);
}
function wav(frames = 4800, epoch = 0, next = frames, skipped = 0): Response {
  const data = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(data);
  for (let i = 44; i < data.byteLength; i += 4) {
    view.setInt16(i, 1234, true);
    view.setInt16(i + 2, -1234, true);
  }
  return new Response(data, { headers: {
    "X-Audio-Next": String(next), "X-Audio-Epoch": String(epoch),
    "X-Audio-Skipped": String(skipped),
  } });
}
function setup() {
  const stops: ReturnType<typeof vi.fn>[] = [];
  const play = vi.fn<Dependencies["play"]>(() => {
    const stop = vi.fn(); stops.push(stop); return stop;
  });
  const fetch = vi.fn<Dependencies["fetch"]>();
  fetch.mockResolvedValue(wav());
  const unlock = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn();
  return { deps: { play, fetch, unlock, status }, stops };
}
afterEach(() => { vi.useRealTimers(); });
describe("spectator audio", () => {
  it("starts muted, unlocks on click, polls exact PCM and stops locally", async () => {
    vi.useFakeTimers();
    const { deps, stops } = setup();
    const follower = await create(deps);
    expect(follower.muted).toBe(true);
    expect(deps.fetch).not.toHaveBeenCalled();
    await follower.toggle();
    expect(deps.unlock).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls[0]?.[0]).toBe("/audio.wav?since=-1&max_frames=12000");
    expect(deps.play.mock.calls[0]?.[0].slice(0, 2)).toEqual(new Int16Array([1234, -1234]));
    expect(deps.play.mock.calls[0]?.[1]).toBe(1);
    await follower.toggle();
    expect(stops[0]).toHaveBeenCalledOnce();
    expect(follower.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it("varispeed follows acceleration and replaces rather than queues sound", async () => {
    vi.useFakeTimers();
    const { deps, stops } = setup();
    const follower = await create(deps);
    await follower.toggle();
    deps.fetch.mockResolvedValueOnce(wav(9600, 0, 14400));
    await vi.advanceTimersByTimeAsync(100);
    expect(deps.play.mock.calls[1]?.[1]).toBe(2);
    expect(stops[0]).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls[1]?.[0]).toContain("since=4800");
    await follower.toggle();
  });
  it("flushes on epoch change and silent pause", async () => {
    vi.useFakeTimers();
    const { deps, stops } = setup();
    const follower = await create(deps);
    await follower.toggle();
    deps.fetch.mockResolvedValueOnce(wav(0, 1, 4800));
    await vi.advanceTimersByTimeAsync(100);
    expect(stops[0]).toHaveBeenCalledOnce();
    expect(deps.play).toHaveBeenCalledOnce();
    deps.fetch.mockResolvedValueOnce(wav(2400, 1, 7200, 10));
    await vi.advanceTimersByTimeAsync(100);
    expect(deps.play.mock.calls[1]?.[1]).toBe(0.5);
    await follower.toggle();
  });
  it.each([null, "", "   "])("rejects an absent or blank cursor %j before playback", async (header) => {
    vi.useFakeTimers();
    const { deps } = setup();
    const response = wav();
    if (header === null) response.headers.delete("X-Audio-Next");
    else response.headers.set("X-Audio-Next", header);
    deps.fetch.mockResolvedValueOnce(response);
    const follower = await create(deps);
    await follower.toggle();
    expect(follower.muted).toBe(true);
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.status).toHaveBeenLastCalledWith("Audio unavailable — click to retry");
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it("disconnects to muted and retries only on a fresh click", async () => {
    vi.useFakeTimers();
    const { deps } = setup();
    deps.fetch.mockRejectedValueOnce(new Error("disconnected"));
    const follower = await create(deps);
    await follower.toggle();
    expect(follower.muted).toBe(true);
    expect(deps.status).toHaveBeenLastCalledWith("Audio unavailable — click to retry");
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.fetch).toHaveBeenCalledOnce();
    await follower.toggle();
    expect(follower.muted).toBe(false);
    await follower.toggle();
  });
  it("ignores an in-flight response after mute", async () => {
    vi.useFakeTimers();
    const { deps } = setup();
    let resolve!: (response: Response) => void;
    deps.fetch.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r; }));
    const follower = await create(deps);
    const starting = follower.toggle();
    await Promise.resolve();
    await follower.toggle();
    resolve(wav());
    await starting;
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
});
