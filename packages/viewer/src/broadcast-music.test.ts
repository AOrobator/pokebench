import { describe, expect, it } from "vitest";
import { MusicFollower } from "./broadcast-music.js";

const RATE = 48000;
function fake() {
  let clock = 10;
  const asked: number[] = [], played: { at: number; rate: number; frames: number }[] = [], timers: (() => void)[] = [];
  let reply: (since: number) => Promise<{ pcm: Int16Array; next: number }> = since => Promise.resolve({ pcm: new Int16Array(4800 * 2), next: since + 4800 });
  const music = new MusicFollower({
    fetchChunk: since => { asked.push(since); return reply(since); },
    schedule: (pcm, at, rate) => { played.push({ at, rate, frames: pcm.length / 2 }); },
    clock: () => clock,
    after: (_ms, run) => { timers.push(run); },
  });
  const step = async (seconds: number): Promise<void> => { clock += seconds; timers.shift()?.(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { music, asked, played, timers, step, answer: (next: typeof reply) => { reply = next; } };
}

describe("the broadcast music", () => {
  it("starts from the newest sound and keeps its own cursor", async () => {
    const f = fake();
    f.answer(() => Promise.resolve({ pcm: new Int16Array(4800 * 2), next: 1000 }));
    f.music.start();
    await f.step(0);
    expect(f.asked[0]).toBe(-1);
    f.answer(since => Promise.resolve({ pcm: new Int16Array(4800 * 2), next: since + 4800 }));
    await f.step(0.1);
    expect(f.asked[1]).toBe(1000);
  });

  it("lays chunks end to end, with no gap or overlap between them", async () => {
    const f = fake();
    f.music.start();
    for (let i = 0; i < 4; i += 1) await f.step(0.1);
    for (let i = 1; i < f.played.length; i += 1) {
      const before = f.played[i - 1], now = f.played[i];
      if (before === undefined || now === undefined) throw new Error("no chunk");
      expect(now.at).toBeCloseTo(before.at + before.frames / RATE / before.rate, 6);
    }
    expect(f.played.length).toBeGreaterThan(2);
  });

  it("follows the game's speed, so a run at 4/3 plays at about 4/3", async () => {
    const f = fake();
    f.answer(since => Promise.resolve({ pcm: new Int16Array(6400 * 2), next: since + 6400 }));
    f.music.start();
    for (let i = 0; i < 60; i += 1) await f.step(0.1);
    expect(f.played.at(-1)?.rate).toBeCloseTo(4 / 3, 1);
  });

  it("drops a chunk rather than fall behind the picture", async () => {
    const f = fake();
    f.answer(since => Promise.resolve({ pcm: new Int16Array(24000 * 2), next: since + 24000 }));
    f.music.start();
    for (let i = 0; i < 8; i += 1) await f.step(0.01);
    expect(f.played.length).toBeLessThan(8);
    expect(f.asked.length).toBe(8);
  });

  it("starts again after a gap in the sound", async () => {
    const f = fake();
    f.music.start();
    await f.step(0.1);
    await f.step(5);
    expect(f.played.at(-1)?.at).toBeGreaterThan(14.9);
  });

  it("keeps trying after a failed read and stops when told", async () => {
    const f = fake();
    f.answer(() => Promise.reject(new Error("409")));
    f.music.start();
    await f.step(0.1);
    expect(f.timers).toHaveLength(1);
    f.music.stop();
    await f.step(0.1);
    expect(f.timers).toHaveLength(0);
    expect(f.played).toEqual([]);
  });

  it("an empty chunk plays nothing", async () => {
    const f = fake();
    f.answer(since => Promise.resolve({ pcm: new Int16Array(0), next: Math.max(since, 0) }));
    f.music.start();
    await f.step(0.1);
    expect(f.played).toEqual([]);
  });
});
