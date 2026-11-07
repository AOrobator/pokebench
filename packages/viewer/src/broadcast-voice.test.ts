import { describe, expect, it, vi } from "vitest";
import { BroadcastVoice, liveCaption } from "./broadcast-voice.js";
import type { CommentaryLine } from "./broadcast-feed.js";

const line = (turn: number, t: number, said?: number): CommentaryLine => ({ turn, t, text: `line ${String(turn)}`, wav: `t${String(turn)}.wav`, ...(said === undefined ? {} : { said }) });

function voiced() {
  const played: number[] = [], finish: (() => void)[] = [];
  const voice = new BroadcastVoice(spoken => { played.push(spoken.turn); return new Promise<void>(resolve => { finish.push(resolve); }); });
  return { voice, played, finish, settle: async () => { finish.shift()?.(); await Promise.resolve(); await Promise.resolve(); } };
}

describe("the broadcast voice", () => {
  it("says nothing until sound is switched on", () => {
    const { voice, played } = voiced();
    voice.add([line(1, 10)]);
    voice.pump(11);
    expect(played).toEqual([]);
    voice.enable(11);
    expect(played).toEqual([1]);
  });

  it("plays one line at a time, in order, never overlapping", async () => {
    const v = voiced();
    v.voice.enable(10);
    v.voice.add([line(1, 10), line(2, 11)]);
    v.voice.pump(12);
    v.voice.pump(12);
    expect(v.played).toEqual([1]);
    await v.settle();
    v.voice.pump(13);
    expect(v.played).toEqual([1, 2]);
  });

  it("skips a line more than 30 s old, timed from when the thought finished", async () => {
    const v = voiced();
    v.voice.enable(100);
    v.voice.add([line(1, 10), line(2, 20, 80), line(3, 90)]);
    v.voice.pump(100);
    expect(v.played).toEqual([2]);
    await v.settle();
    v.voice.pump(125);
    expect(v.played).toEqual([2]);
  });

  it("drops old lines while sound is off, so switching on starts from now", () => {
    const { voice, played } = voiced();
    voice.add([line(1, 10)]);
    voice.pump(50);
    voice.add([line(2, 49)]);
    voice.enable(50);
    expect(played).toEqual([2]);
  });

  it("a line that fails to play does not stop the queue", async () => {
    const played: number[] = [];
    const voice = new BroadcastVoice(spoken => { played.push(spoken.turn); return Promise.reject(new Error("404")); });
    voice.enable(10);
    voice.add([line(1, 10), line(2, 10)]);
    voice.pump(10);
    await Promise.resolve(); await Promise.resolve();
    voice.pump(10);
    expect(played).toEqual([1, 2]);
  });

  it("stops for good and forgets what was waiting", async () => {
    const v = voiced();
    v.voice.enable(10);
    v.voice.add([line(1, 10), line(2, 10)]);
    v.voice.pump(10);
    v.voice.stop();
    expect(v.voice.enabled).toBe(false);
    await v.settle();
    v.voice.pump(10);
    expect(v.played).toEqual([1]);
    expect(v.voice.current).toBeNull();
  });
});

describe("the live caption", () => {
  it("shows what is being said", () => {
    expect(liveCaption([line(1, 1), line(2, 90)], line(1, 1), 91)).toBe("line 1");
  });
  it("otherwise shows the newest line while it is fresh", () => {
    expect(liveCaption([line(1, 1), line(2, 20, 30)], null, 44)).toBe("line 2");
    expect(liveCaption([line(1, 1), line(2, 20, 30)], null, 46)).toBeNull();
    expect(liveCaption([], null, 1)).toBeNull();
  });
});
