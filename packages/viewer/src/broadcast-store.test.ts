import { describe, expect, it } from "vitest";
import { commentaryWav, createBroadcastStore, gameAudioUrl, type BroadcastDisk } from "./broadcast-store.js";

const t = (s: number): string => new Date(1_800_000_000_000 + s * 1000).toISOString();
const ev = (s: number, type: string, rest: Record<string, unknown>): string => `${JSON.stringify({ v: 1, run: "r", seq: 1, t: t(s), type, turn: 1, ...rest })}\n`;
const START = ev(0, "run_start", { model: { id: "m/x" }, start_state: { kind: "boot" } });
const PRESS = (s: number): string => ev(s, "button_press", { buttons: ["A"] });

function disk(files: Record<string, string>): BroadcastDisk & { files: Record<string, string>; reads: number } {
  return {
    files, reads: 0,
    readBytes(path, offset, length) { this.reads += 1; return Buffer.from(files[path] ?? "").subarray(offset, offset + length); },
    readText: path => files[path] ?? null,
  };
}
const store = (d: BroadcastDisk, chunk = 1 << 20, keep = 4) => createBroadcastStore({ runsRoot: "/runs", disk: d, eventsPath: id => `/runs/${id}/events.jsonl`, pause: () => Promise.resolve(), chunkBytes: chunk, keepRuns: keep });

describe("the broadcast store", () => {
  it("returns only what came after the cursor, reading only new bytes", async () => {
    const d = disk({ "/runs/r/events.jsonl": START + PRESS(1) });
    const s = store(d);
    const first = await s.read("r", 0);
    expect(first).toMatchObject({ next: 1, ended: false, header: { run: "r" }, items: [{ k: "press", t: 1 }] });
    d.files["/runs/r/events.jsonl"] = START + PRESS(1) + PRESS(2);
    expect(await s.read("r", first.next)).toMatchObject({ next: 2, items: [{ k: "press", t: 2 }] });
    expect(await s.read("r", 2)).toMatchObject({ next: 2, items: [] });
  });

  it("holds a half-written line until its newline arrives, even across small chunks", async () => {
    const whole = START + PRESS(1);
    const d = disk({ "/runs/r/events.jsonl": whole.slice(0, -10) });
    const s = store(d, 7);
    expect((await s.read("r", 0)).items).toEqual([]);
    d.files["/runs/r/events.jsonl"] = whole;
    expect((await s.read("r", 0)).items).toHaveLength(1);
  });

  it("keeps multi-byte text whole across a chunk edge", async () => {
    const d = disk({ "/runs/r/events.jsonl": START + ev(1, "assistant_delta", { thinking: "Pokémon → ★", text: "" }) });
    expect((await store(d, 5).read("r", 0)).items).toEqual([{ k: "think", t: 1, turn: 1, d: "Pokémon → ★" }]);
  });

  it("answers two reads at once without reading a line twice", async () => {
    const s = store(disk({ "/runs/r/events.jsonl": START + PRESS(1) }), 16);
    const [a, b] = await Promise.all([s.read("r", 0), s.read("r", 0)]);
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(1);
  });

  it("refuses a run with no readable start", async () => {
    await expect(store(disk({ "/runs/r/events.jsonl": PRESS(1) })).read("r", 0)).rejects.toThrow(/no run_start/);
  });

  it("reads commentary lines on the first page and skips bad ones", async () => {
    const good = { turn: 3, t: 12.5, text: "Rock Tomb first.", wav: "t3.wav" };
    const d = disk({ "/runs/r/events.jsonl": START + PRESS(1), "/runs/broadcast/r/commentary.jsonl": `${JSON.stringify(good)}\nnot json\n${JSON.stringify({ turn: "x" })}\n` });
    const s = store(d);
    expect((await s.read("r", 0)).commentary).toEqual([good]);
    expect((await s.read("r", 1)).commentary).toEqual([]);
  });

  it("sends only the lines a poll has not seen", async () => {
    const line = (turn: number): string => JSON.stringify({ turn, t: turn, text: `say ${String(turn)}`, wav: `t${String(turn)}.wav`, said: turn + 1 });
    const path = "/runs/broadcast/r/commentary.jsonl";
    const d = disk({ "/runs/r/events.jsonl": START + PRESS(1), [path]: `${line(1)}\n${line(2)}\n` });
    const s = store(d);
    expect((await s.read("r", 0)).commentary.map(l => l.turn)).toEqual([1, 2]);
    expect((await s.read("r", 1)).commentary).toEqual([]);
    expect((await s.read("r", 1, 1)).commentary.map(l => l.said)).toEqual([3]);
    d.files[path] = `${line(1)}\n${line(2)}\n${line(3)}\n`;
    expect((await s.read("r", 1, 2)).commentary.map(l => l.turn)).toEqual([3]);
    expect((await s.read("r", 0, 3)).commentary).toEqual([]);
  });

  it("asks the game server for sound only with a valid cursor", () => {
    expect(gameAudioUrl(8000, "-1")).toBe("http://127.0.0.1:8000/audio.wav?since=-1&max_frames=12000");
    expect(gameAudioUrl(8000, "267904042")).toBe("http://127.0.0.1:8000/audio.wav?since=267904042&max_frames=12000");
    for (const since of ["", "-2", "1.5", "x", "1&max_frames=9", "99999999999999999999"]) expect(gameAudioUrl(8000, since)).toBeNull();
  });

  it("names a run's wav only for a plain commentary file", () => {
    expect(commentaryWav("/runs", "r", "t000085.wav")).toBe("/runs/broadcast/r/t000085.wav");
    for (const name of ["../x.wav", "t1.wav/..", "commentary.jsonl", "t00001.wav", ""]) expect(commentaryWav("/runs", "r", name)).toBeNull();
  });

  it("finds this model's rates, and none for an unknown model or a bad file", async () => {
    const log = { "/runs/r/events.jsonl": START };
    const rates = { input_per_million: 0.15, output_per_million: 0.6, cache_read_per_million: 0.003 };
    expect((await store(disk({ ...log, "/runs/broadcast/pricing.json": JSON.stringify({ "m/x": rates }) })).read("r", 0)).rates).toEqual({ input: 0.15, output: 0.6, cacheRead: 0.003 });
    expect((await store(disk({ ...log, "/runs/broadcast/pricing.json": JSON.stringify({ other: rates }) })).read("r", 0)).rates).toBeNull();
    expect((await store(disk({ ...log, "/runs/broadcast/pricing.json": "{" })).read("r", 0)).rates).toBeNull();
    expect((await store(disk(log)).read("r", 0)).rates).toBeNull();
  });

  it("forgets the oldest run past its limit and can read it again", async () => {
    const d = disk({ "/runs/a/events.jsonl": START, "/runs/b/events.jsonl": START + PRESS(1) });
    const s = store(d, 1 << 20, 1);
    await s.read("a", 0); await s.read("b", 0);
    const before = d.reads;
    expect(await s.read("a", 0)).toMatchObject({ next: 0 });
    expect(d.reads).toBeGreaterThan(before);
  });
});
