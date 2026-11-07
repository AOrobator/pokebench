import { describe, expect, it, vi } from "vitest";
import { atempoChain, clipsFor, encoderArgs, GBA_FPS, parseRenderArgs, planVoices, readJournal, renderClip, spansFor, type RenderDeps } from "./broadcast-render.js";

const SEGMENT_FRAMES = 3600 * GBA_FPS;
const line = (at: number, event: string, rest: Record<string, unknown> = {}): string => JSON.stringify({ at, event, ...rest });
// A steady session: 60 video frames for each 0.75 s of wall time from t=100.
const JOURNAL = [
  line(90, "started"), line(100, "first_frame", { frame_count: 12 }),
  line(100, "part_started", { stream: "video", part: 1, position: 0 }),
  line(100, "part_started", { stream: "audio", part: 1, position: 0 }),
  line(145, "sync", { frame_count: 3611, video_frames: 3600 }),
  line(190, "sync", { frame_count: 7211, video_frames: 7200 }),
].join("\n");
const FILES = ["video-p01-0000.mkv", "audio-p01-0000.mka"];

describe("reading the recorder's journal", () => {
  it("collects each session's marks and parts, skipping what it cannot read", () => {
    const sessions = readJournal(`${JOURNAL}\nnot json\n${line(1, "sync", { video_frames: "x" })}\n${line(300, "started")}\n${line(301, "first_frame", { frame_count: 9000 })}`);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.marks.map(m => m.position).slice(0, 3)).toEqual([0, 3600, 7200]);
    expect(sessions[0]?.parts).toEqual([{ stream: "video", part: 1, position: 0 }, { stream: "audio", part: 1, position: 0 }]);
    expect(sessions[1]?.marks[0]).toEqual({ position: 0, at: 301 });
    expect(sessions[0]?.marks.at(-1)?.at).toBe(250);
  });

  it("carries a session past its last mark at its own pace: to the frames it stopped at, or until the next one began", () => {
    const stopped = readJournal([line(0, "first_frame", { frame_count: 1 }), line(45, "sync", { frame_count: 2, video_frames: 3600 }), line(60, "server_gone"), line(70, "stopped", { frames: 4400 })].join("\n"));
    expect(stopped[0]?.marks.at(-1)).toEqual({ position: 4400, at: 55 });
    const killed = readJournal([line(0, "started"), line(0, "first_frame", { frame_count: 1 }), line(45, "sync", { frame_count: 2, video_frames: 3600 }), line(65, "started"), line(66, "first_frame", { frame_count: 9 })].join("\n"));
    expect(killed[0]?.marks.at(-1)).toEqual({ position: 5280, at: 66 });
    const short = readJournal([line(0, "first_frame", { frame_count: 1 }), line(9, "stopped", { frames: 598 })].join("\n"));
    expect(short[0]?.marks.at(-1)?.position).toBe(598);
    expect(short[0]?.marks.at(-1)?.at).toBeCloseTo(598 / GBA_FPS);
    const ended = readJournal([line(0, "first_frame", { frame_count: 1 }), line(45, "sync", { frame_count: 2, video_frames: 3600 })].join("\n"));
    expect(ended[0]?.marks.at(-1)).toEqual({ position: 8400, at: 105 });
  });

  it("puts sound parts on the picture's frame scale", () => {
    const sessions = readJournal(`${line(1, "started")}\n${line(1, "part_started", { stream: "audio", part: 2, position: 48_000 })}`);
    expect(sessions[0]?.parts[0]?.position).toBeCloseTo(GBA_FPS);
  });
});

describe("mapping wall time to the recording", () => {
  const sessions = readJournal(JOURNAL);

  it("interpolates between sync marks and merges a steady pace into one span", () => {
    expect(spansFor(sessions, 110, 180)).toEqual([expect.objectContaining({ wallStart: 110, wallEnd: 180, session: 0 })]);
    const [span] = spansFor(sessions, 110, 180);
    expect(span?.from).toBeCloseTo(800);
    expect(span?.to).toBeCloseTo(6400);
  });

  it("keeps a real change of pace as separate spans", () => {
    const uneven = readJournal([line(0, "first_frame", { frame_count: 1 }), line(10, "sync", { frame_count: 2, video_frames: 600 }), line(40, "sync", { frame_count: 3, video_frames: 1200 })].join("\n"));
    expect(spansFor(uneven, 5, 25).map(s => [s.wallStart, s.wallEnd])).toEqual([[5, 10], [10, 25]]);
  });

  it("keeps a small lasting change of pace: every mark stays on its own place", () => {
    const marks = [line(0, "first_frame", { frame_count: 1 })];
    let position = 0, at = 0;
    for (const pace of [...Array<number>(80).fill(80), ...Array<number>(80).fill(80.7)]) {
      position += 3600; at += 3600 / pace;
      marks.push(line(at, "sync", { frame_count: 1, video_frames: position }));
    }
    const journal = readJournal(marks.join("\n"));
    const step = 80 * 45;
    const place = (t: number): number => { const span = spansFor(journal, t, t + 1)[0]; return span?.from ?? NaN; };
    expect(place(step)).toBeCloseTo(288000, -1);
    expect(spansFor(journal, 0, step).length).toBe(1);
  });

  it("fills time the recording does not cover with gaps", () => {
    const spans = spansFor(sessions, 50, 200);
    expect(spans.map(s => s.session)).toEqual([null, 0]);
    expect(spans.map(s => [s.wallStart, s.wallEnd])).toEqual([[50, 100], [100, 200]]);
    expect(spansFor(sessions, 240, 260).map(s => s.session)).toEqual([0, null]);
    expect(spansFor([], 1, 2)).toEqual([{ wallStart: 1, wallEnd: 2, session: null, from: 0, to: 0 }]);
  });

  it("treats a stretch where the picture did not advance as a gap", () => {
    const stuck = readJournal([line(0, "first_frame", { frame_count: 1 }), line(10, "sync", { frame_count: 2, video_frames: 0 })].join("\n"));
    expect(spansFor(stuck, 0, 10)).toEqual([{ wallStart: 0, wallEnd: 10, session: null, from: 0, to: 0 }]);
  });
});

describe("finding the files", () => {
  const sessions = readJournal(JOURNAL);

  it("finds a clip's file, start and length, and how far it is retimed", () => {
    const [span] = spansFor(sessions, 100, 145);
    if (span === undefined) throw new Error("no span");
    const [clip] = clipsFor("video", span, sessions, FILES);
    expect(clip).toMatchObject({ file: "video-p01-0000.mkv", wall: 45 });
    expect(clip?.start).toBeCloseTo(0);
    expect(clip?.length).toBeCloseTo(3600 / GBA_FPS);
  });

  it("splits a clip at an hour's segment edge and at a new part", () => {
    const long = readJournal([line(0, "first_frame", { frame_count: 1 }), line(0, "part_started", { stream: "video", part: 1, position: 0 }), line(5400, "sync", { frame_count: 2, video_frames: SEGMENT_FRAMES * 2 }), line(5400, "part_started", { stream: "video", part: 2, position: SEGMENT_FRAMES * 2 }), line(6000, "sync", { frame_count: 3, video_frames: SEGMENT_FRAMES * 2 + 1000 })].join("\n"));
    const names = ["video-p01-0000.mkv", "video-p01-0001.mkv", "video-p02-0000.mkv"];
    const clips = spansFor(long, 2000, 5500).flatMap(span => clipsFor("video", span, long, names));
    expect(clips.map(c => c.file)).toEqual(["video-p01-0000.mkv", "video-p01-0001.mkv", "video-p02-0000.mkv"]);
    expect(clips[1]?.start).toBeCloseTo(0);
    expect(clips.reduce((sum, c) => sum + c.wall, 0)).toBeCloseTo(3500);
  });

  it("leaves a clip with no file empty, so the render shows black or silence", () => {
    const [span] = spansFor(sessions, 100, 145);
    if (span === undefined) throw new Error("no span");
    expect(clipsFor("audio", span, sessions, ["video-p01-0000.mkv"])).toEqual([expect.objectContaining({ file: null, wall: 45 })]);
    const gap = { wallStart: 1, wallEnd: 3, session: null, from: 0, to: 0 };
    expect(clipsFor("video", gap, sessions, FILES)).toEqual([{ file: null, start: 0, length: 0, wall: 2 }]);
  });
});

describe("the encoder command", () => {
  it("chains atempo inside its limits", () => {
    expect(atempoChain(1.34)).toBe("atempo=1.340000");
    expect(atempoChain(3)).toBe("atempo=2.0,atempo=1.500000");
    expect(atempoChain(0.2)).toBe("atempo=0.5,atempo=0.5,atempo=0.800000");
  });

  it("encodes the run's own frames straight from the page", () => {
    const args = encoderArgs({ out: "/o.mp4", fps: 10, seconds: 5, game: null });
    expect(args.slice(args.indexOf("-f"), args.indexOf("-f") + 2)).toEqual(["-f", "image2pipe"]);
    expect(args).toContain("aac");
    expect(args.at(-1)).toBe("/o.mp4");
  });

  it("retimes the picture and sound, scales pixels hard, and lays the page on top", () => {
    const video = [{ file: "/r/a b.mkv", start: 10, length: 60, wall: 45 }, { file: null, start: 0, length: 0, wall: 5 }];
    const audio = [{ file: "/r/a.mka", start: 10, length: 60, wall: 45 }, { file: null, start: 0, length: 0, wall: 5 }];
    const args = encoderArgs({ out: "/o.mp4", fps: 10, seconds: 50, game: { backdrop: "/tmp/b.png", video, audio } });
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(args).toContain("/r/a b.mkv");
    expect(args).toContain("-ss");
    expect(filter).toContain("setpts=(PTS-STARTPTS)*0.750000,tpad=stop_mode=clone:stop_duration=45,trim=duration=45");
    expect(filter).toContain("color=c=black:s=240x160:r=60:d=45[b0]");
    expect(filter).toContain("[b0][c0]overlay=eof_action=pass:format=yuv444[v0]");
    expect(filter).toContain("atempo=1.333333");
    expect(filter).toContain("asetpts=N/SR/TB[a0]");
    expect(filter).toContain("color=c=black:s=240x160:r=60:d=5");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo:d=5");
    expect(filter).toContain("scale=1098:728:flags=neighbor");
    expect(filter).toContain("overlay=46:96");
    expect(args[args.lastIndexOf("-t") + 1]).toBe("50");
    expect(args).toContain("[a]");
  });
});

describe("the commentary track", () => {
  const voice = (turn: number, t: number, seconds?: number) => JSON.stringify({ turn, t, text: "x", wav: `t${String(turn)}.wav`, ...(seconds === undefined ? {} : { seconds }) });

  it("places voiced lines inside the stretch, relative to its start", () => {
    expect(planVoices([voice(1, 5, 2), voice(2, 15, 2), voice(3, 40, 2), voice(4, 16, undefined)].join("\n"), 10, 30, "/b")).toEqual([{ path: "/b/t2.wav", delayMs: 5000 }]);
  });

  it("never talks over itself: a line waits for the last, and is dropped if it would run late", () => {
    const plan = planVoices([voice(1, 10, 3), voice(2, 11, 3), voice(3, 11.5, 3), "bad"].join("\n"), 10, 60, "/b");
    expect(plan).toEqual([{ path: "/b/t1.wav", delayMs: 0 }, { path: "/b/t2.wav", delayMs: 3200 }]);
  });

  it("mixes voices over the game with the game turned down", () => {
    const video = [{ file: "/v.mkv", start: 0, length: 4, wall: 3 }], audio = [{ file: "/a.mka", start: 0, length: 4, wall: 3 }];
    const args = encoderArgs({ out: "/o.mp4", fps: 10, seconds: 3, game: { backdrop: "/b.png", video, audio }, voices: [{ path: "/w.wav", delayMs: 1200 }] });
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(args).toContain("/w.wav");
    expect(filter).toContain("adelay=1200:all=1");
    expect(filter).toContain("volume=0.35");
    expect(filter).toContain("amix=inputs=2:duration=first:normalize=0");
  });

  it("gives a render with no recording a voice track too", () => {
    const args = encoderArgs({ out: "/o.mp4", fps: 10, seconds: 3, game: null, voices: [{ path: "/w.wav", delayMs: 0 }] });
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(filter).toContain("anullsrc");
    expect(args).toContain("0:v");
  });
});

describe("the command line", () => {
  it("reads a run, a range, a file and its options", () => {
    expect(parseRenderArgs(["r", "10", "70.5", "/o.mp4"])).toEqual({ run: "r", from: 10, to: 70.5, out: "/o.mp4", gameVideo: null, fps: 10 });
    expect(parseRenderArgs(["--fps", "15", "r", "1", "2", "o.mp4", "--game-video", "/g"])).toMatchObject({ fps: 15, gameVideo: "/g" });
  });

  it.each([[[]], [["r", "x", "2", "o"]], [["r", "5", "2", "o"]], [["r", "-1", "2", "o"]], [["r", "1", "2", "o", "--fps", "0"]], [["r", "1", "2", "o", "--fps"]], [["r", "1", "2", "o", "--fps", "Infinity"]], [["r", "1", "2", "o", "--fps", "1e308"]], [["r", "1", "2", "o", "--nope", "1"]], [["r", "1", "2", "o", "x"]]])("refuses %j", argv => {
    expect(() => parseRenderArgs(argv)).toThrow(/usage/);
  });
});

describe("rendering a clip", () => {
  function fakes(over: Partial<RenderDeps> = {}) {
    const steps: number[] = [], written: string[] = [], urls: string[] = [], aborted: boolean[] = [];
    let encoder: string[] = [];
    const deps: RenderDeps = {
      started: () => Promise.resolve(Date.parse("2026-11-06T12:00:00.000Z") / 1000),
      readText: path => path.endsWith("recording.jsonl") ? JOURNAL : null,
      commentaryFolder: run => `/runs/broadcast/${run}`,
      listFiles: () => FILES,
      openPage: url => { urls.push(url); return Promise.resolve({ setTime: t => { steps.push(t); return Promise.resolve(); }, shot: () => Promise.resolve(Buffer.from(`f${String(steps.length)}`)), backdrop: () => Promise.resolve("/tmp/b.png"), close: () => Promise.resolve() }); },
      encode: args => { encoder = args; return { write: frame => { written.push(frame.toString()); return Promise.resolve(); }, finish: () => Promise.resolve(), abort: () => { aborted.push(true); } }; },
      log: () => undefined,
      ...over,
    };
    return { deps, steps, written, urls, aborted, encoder: () => encoder };
  }

  it("steps the page at the asked rate and hands every frame to the encoder", async () => {
    const f = fakes();
    await renderClip(f.deps, { run: "r", from: 10, to: 11, out: "/o.mp4", gameVideo: null, fps: 4 });
    expect(f.steps).toEqual([10, 10.25, 10.5, 10.75]);
    expect(f.written).toEqual(["f1", "f2", "f3", "f4"]);
    expect(f.urls).toEqual(["/broadcast?run=r&t=10"]);
  });

  it("gives a stretch shorter than a frame one frame", async () => {
    const f = fakes();
    await renderClip(f.deps, { run: "r", from: 1, to: 1.04, out: "/o.mp4", gameVideo: null, fps: 10 });
    expect(f.steps).toEqual([1]);
  });

  it("with a recording, renders transparent and maps run time onto the recorder's clock", async () => {
    const start = 90;
    const f = fakes({ started: () => Promise.resolve(start) });
    await renderClip(f.deps, { run: "r", from: 20, to: 30, out: "/o.mp4", gameVideo: "/rec", fps: 1 });
    expect(f.urls).toEqual(["/broadcast?run=r&t=20&transparent=1"]);
    const args = f.encoder();
    expect(args).toContain("/rec/video-p01-0000.mkv");
    expect(args).toContain("/rec/audio-p01-0000.mka");
    const seek = Number(args[args.indexOf("-ss") + 1]);
    expect(seek).toBeCloseTo(10 * 80 / GBA_FPS, 3);
  });

  it("takes a file inside a recording folder as that folder, and says what is missing", async () => {
    const log = vi.fn<(line: string) => void>();
    const f = fakes({ started: () => Promise.resolve(50), log });
    await renderClip(f.deps, { run: "r", from: 40, to: 60, out: "/o.mp4", gameVideo: "/rec/video-p01-0000.mkv", fps: 1 });
    expect(f.encoder()).toContain("/rec/video-p01-0000.mkv");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/no picture for 10\.0 s/));
  });

  it("picks up the run's commentary for the stretch", async () => {
    const f = fakes({ readText: path => path === "/runs/broadcast/r/commentary.jsonl" ? JSON.stringify({ turn: 1, t: 10.5, text: "x", wav: "a.wav", seconds: 0.25 }) : null });
    await renderClip(f.deps, { run: "r", from: 10, to: 11, out: "/o.mp4", gameVideo: null, fps: 1 });
    expect(f.encoder()).toContain("/runs/broadcast/r/a.wav");
  });

  it("refuses a folder with no journal", async () => {
    await expect(renderClip(fakes({ readText: () => null }).deps, { run: "r", from: 1, to: 2, out: "o", gameVideo: "/rec", fps: 1 })).rejects.toThrow(/recording\.jsonl/);
  });

  it("closes the page even when a step fails", async () => {
    const close = vi.fn(() => Promise.resolve());
    const f = fakes({ openPage: () => Promise.resolve({ setTime: () => Promise.reject(new Error("boom")), shot: () => Promise.resolve(Buffer.alloc(0)), backdrop: () => Promise.resolve(""), close }) });
    await expect(renderClip(f.deps, { run: "r", from: 1, to: 2, out: "o", gameVideo: null, fps: 1 })).rejects.toThrow("boom");
    expect(close).toHaveBeenCalled();
    expect(f.aborted).toEqual([true]);
  });
});
