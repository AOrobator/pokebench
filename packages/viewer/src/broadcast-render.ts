// `just broadcast-render`: steps the /broadcast page through a stretch of a run and encodes it. With a recording,
// the page renders transparent over the recorder's full-rate picture and sound. Recordings are in game time, about
// 1.34x longer than real time when a run plays at 80 fps, so sync marks retime them onto the run's wall clock.
import { basename, dirname, join } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";

export const GBA_FPS = 16777216 / 280896;
const SAMPLE_RATE = 48000;
const SEGMENT_FRAMES = 3600 * GBA_FPS;
const OUTPUT_FPS = 60;
const SAME_PACE = 0.01;
// The game box's inside on the 1920x1080 stage, past its 6 px border.
const GAME = { x: 46, y: 96, width: 1098, height: 728 };

type Stream = "video" | "audio";
export interface Mark { readonly position: number; readonly at: number }
export interface Part { readonly stream: Stream; readonly part: number; readonly position: number }
export interface Session { readonly marks: Mark[]; readonly parts: Part[]; stopped?: number }
export interface Span { readonly wallStart: number; readonly wallEnd: number; readonly session: number | null; readonly from: number; readonly to: number }
export interface Clip { readonly file: string | null; readonly start: number; readonly length: number; readonly wall: number }

const Entry = Type.Object({
  at: Type.Number(), event: Type.String(),
  stream: Type.Optional(Type.Union([Type.Literal("video"), Type.Literal("audio")])),
  part: Type.Optional(Type.Integer()), position: Type.Optional(Type.Number()), video_frames: Type.Optional(Type.Number()), frames: Type.Optional(Type.Number()),
});
const TAIL_SECONDS = 60;
const MARK_EVENTS = new Set(["sync", "frame_counter_reset", "frames_lost"]);

// Marks come once a minute of game time, so a session's last stretch has none: it runs on at the last pace, up to the
// frame count the recorder stopped at, or, if killed, up to the next session or a minute on.
function addTail(session: Session, nextStart: number): void {
  const [before, last] = session.marks.slice(-2);
  if (before === undefined || last === undefined) return;
  const pace = (last.position - before.position) / (last.at - before.at);
  if (!(pace > 0)) return;
  if (session.stopped !== undefined) {
    if (session.stopped > last.position) session.marks.push({ position: session.stopped, at: last.at + (session.stopped - last.position) / pace });
    return;
  }
  const at = Math.min(nextStart, last.at + TAIL_SECONDS);
  if (at > last.at) session.marks.push({ position: last.position + (at - last.at) * pace, at });
}

// Each `started` begins a session whose positions count from zero (recorder.py's segment_rows reads it the same way).
export function readJournal(text: string): Session[] {
  const sessions: Session[] = [];
  for (const line of text.split("\n")) {
    let entry: unknown;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!Value.Check(Entry, entry)) continue;
    if (entry.event === "started" || sessions.length === 0) sessions.push({ marks: [], parts: [] });
    const session = sessions.at(-1);
    if (session === undefined) continue;
    if (entry.event === "first_frame") session.marks.push({ position: 0, at: entry.at });
    else if (MARK_EVENTS.has(entry.event) && entry.video_frames !== undefined) session.marks.push({ position: entry.video_frames, at: entry.at });
    else if (entry.event === "stopped" && entry.frames !== undefined) session.stopped = entry.frames;
    else if (entry.event === "part_started" && entry.stream !== undefined && entry.part !== undefined && entry.position !== undefined) {
      session.parts.push({ stream: entry.stream, part: entry.part, position: entry.stream === "audio" ? entry.position / (SAMPLE_RATE / GBA_FPS) : entry.position });
    }
  }
  sessions.forEach((session, i) => { addTail(session, sessions[i + 1]?.marks[0]?.at ?? Infinity); });
  return sessions;
}

const gapSpan = (wallStart: number, wallEnd: number): Span => ({ wallStart, wallEnd, session: null, from: 0, to: 0 });

// Stretches between marks, with neighbors at the same pace joined so a steady hour stays one clip.
function pacedStretches(sessions: readonly Session[]): (Mark & { readonly end: Mark; readonly session: number })[] {
  const stretches: (Mark & { end: Mark; session: number })[] = [];
  sessions.forEach((session, index) => {
    session.marks.forEach((mark, i) => {
      const end = session.marks[i + 1];
      if (end === undefined || end.at <= mark.at || end.position <= mark.position) return;
      const last = stretches.at(-1);
      const pace = (end.position - mark.position) / (end.at - mark.at);
      if (last?.session === index && last.end === mark && Math.abs((last.end.position - last.position) / (last.end.at - last.at) / pace - 1) < SAME_PACE) last.end = end;
      else stretches.push({ ...mark, end, session: index });
    });
  });
  return stretches.sort((a, b) => a.at - b.at);
}

export function spansFor(sessions: readonly Session[], wallFrom: number, wallTo: number): Span[] {
  const spans: Span[] = [];
  let cursor = wallFrom;
  for (const stretch of pacedStretches(sessions)) {
    const start = Math.max(stretch.at, cursor), end = Math.min(stretch.end.at, wallTo);
    if (end <= start) continue;
    if (start > cursor) spans.push(gapSpan(cursor, start));
    const place = (at: number): number => stretch.position + (at - stretch.at) * (stretch.end.position - stretch.position) / (stretch.end.at - stretch.at);
    spans.push({ wallStart: start, wallEnd: end, session: stretch.session, from: place(start), to: place(end) });
    cursor = end;
  }
  if (cursor < wallTo) spans.push(gapSpan(cursor, wallTo));
  return spans;
}

const fileName = (stream: Stream, part: number, segment: number): string => `${stream}-p${String(part).padStart(2, "0")}-${String(segment).padStart(4, "0")}.${stream === "video" ? "mkv" : "mka"}`;

export function clipsFor(stream: Stream, span: Span, sessions: readonly Session[], files: readonly string[]): Clip[] {
  const whole = span.wallEnd - span.wallStart;
  const parts = span.session === null ? [] : (sessions[span.session]?.parts ?? []).filter(part => part.stream === stream);
  if (span.session === null) return [{ file: null, start: 0, length: 0, wall: whole }];
  // Every place in the span where the file changes: a new part, or an hour into one.
  const edges = new Set([span.from, span.to]);
  for (const [i, part] of parts.entries()) {
    const stop = Math.min(parts[i + 1]?.position ?? Infinity, span.to);
    for (let edge = part.position; edge < stop; edge += SEGMENT_FRAMES) if (edge > span.from) edges.add(edge);
  }
  const sorted = [...edges].sort((a, b) => a - b);
  return sorted.slice(0, -1).map((from, i) => {
    const to = sorted[i + 1] ?? from, wall = whole * (to - from) / (span.to - span.from);
    const part = parts.filter(candidate => candidate.position <= from + 1e-6).at(-1);
    if (part === undefined) return { file: null, start: 0, length: 0, wall };
    const segment = Math.floor((from - part.position + 1e-6) / SEGMENT_FRAMES), name = fileName(stream, part.part, segment);
    if (!files.includes(name)) return { file: null, start: 0, length: 0, wall };
    return { file: name, start: (from - part.position - segment * SEGMENT_FRAMES) / GBA_FPS, length: (to - from) / GBA_FPS, wall };
  });
}

export function atempoChain(rate: number): string {
  const steps: string[] = [];
  let left = rate;
  for (; left > 2; left /= 2) steps.push("atempo=2.0");
  for (; left < 0.5; left /= 0.5) steps.push("atempo=0.5");
  return [...steps, `atempo=${left.toFixed(6)}`].join(",");
}

export interface EncoderPlan {
  readonly out: string;
  readonly fps: number;
  readonly seconds: number;
  readonly game: { readonly backdrop: string; readonly video: readonly Clip[]; readonly audio: readonly Clip[] } | null;
}

const number = (value: number): string => String(Number(value.toFixed(3)));
const OUTPUT = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];

export function encoderArgs({ out, fps, seconds, game }: EncoderPlan): string[] {
  const start = ["-y", "-hide_banner", "-loglevel", "error", "-nostdin"];
  const page = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "pipe:0"];
  if (game === null) return [...start, ...page, ...OUTPUT, "-r", String(fps), out];
  const inputs: string[] = [];
  let next = 2;
  const open = (clip: Clip): number => {
    if (clip.file === null) return -1;
    inputs.push("-ss", clip.start.toFixed(3), "-t", clip.length.toFixed(3), "-i", clip.file);
    next += 1;
    return next - 1;
  };
  const pictures = game.video.map((clip, i) => {
    const index = open(clip);
    return index < 0
      ? `color=c=black:s=240x160:r=${String(OUTPUT_FPS)}:d=${number(clip.wall)}[v${String(i)}]`
      : `[${String(index)}:v]setpts=(PTS-STARTPTS)*${(clip.wall / clip.length).toFixed(6)},tpad=stop_mode=clone:stop_duration=${number(clip.wall)},trim=duration=${number(clip.wall)},setpts=PTS-STARTPTS[v${String(i)}]`;
  });
  const sounds = game.audio.map((clip, i) => {
    const index = open(clip);
    return index < 0
      ? `anullsrc=r=${String(SAMPLE_RATE)}:cl=stereo:d=${number(clip.wall)}[a${String(i)}]`
      : `[${String(index)}:a]${atempoChain(clip.length / clip.wall)},aresample=${String(SAMPLE_RATE)},apad=whole_dur=${number(clip.wall)},atrim=duration=${number(clip.wall)},asetpts=PTS-STARTPTS[a${String(i)}]`;
  });
  const join = (kind: string, count: number): string => Array.from({ length: count }, (_, i) => `[${kind}${String(i)}]`).join("");
  const filter = [
    ...pictures, ...sounds,
    `${join("v", game.video.length)}concat=n=${String(game.video.length)}:v=1:a=0,fps=${String(OUTPUT_FPS)},scale=${String(GAME.width)}:${String(GAME.height)}:flags=neighbor[game]`,
    `[0:v][game]overlay=${String(GAME.x)}:${String(GAME.y)}[under]`,
    "[under][1:v]overlay=0:0,format=yuv420p[v]",
    `${join("a", game.audio.length)}concat=n=${String(game.audio.length)}:v=0:a=1[a]`,
  ].join(";");
  return [...start, "-loop", "1", "-framerate", String(OUTPUT_FPS), "-i", game.backdrop, ...page, ...inputs, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", ...OUTPUT, "-r", String(OUTPUT_FPS), "-c:a", "aac", "-b:a", "192k", "-t", number(seconds), out];
}

export interface RenderArgs { readonly run: string; readonly from: number; readonly to: number; readonly out: string; readonly gameVideo: string | null; readonly fps: number }
const USAGE = "usage: just broadcast-render <run> <from_s> <to_s> <out.mp4> [--game-video <recording folder>] [--fps N]";

export function parseRenderArgs(argv: readonly string[]): RenderArgs {
  const plain: string[] = [];
  let gameVideo: string | null = null, fps = 10;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg !== "--fps" && arg !== "--game-video") { if (arg.startsWith("--")) throw new Error(USAGE); plain.push(arg); continue; }
    i += 1;
    const value = argv[i];
    if (value === undefined) throw new Error(USAGE);
    if (arg === "--fps") fps = Number(value); else gameVideo = value;
  }
  const [run, fromText, toText, out] = plain, from = Number(fromText), to = Number(toText);
  if (plain.length !== 4 || run === undefined || out === undefined || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || !(fps > 0)) throw new Error(USAGE);
  return { run, from, to, out, gameVideo, fps };
}

export interface RenderPage {
  setTime(t: number): Promise<void>;
  shot(): Promise<Buffer>;
  backdrop(): Promise<string>;
  close(): Promise<void>;
}
export interface Encoder { write(frame: Buffer): Promise<void>; finish(): Promise<void> }
export interface RenderDeps {
  started(run: string): Promise<number>;
  readText(path: string): string | null;
  listFiles(folder: string): readonly string[];
  openPage(path: string, transparent: boolean): Promise<RenderPage>;
  encode(args: string[]): Encoder;
  log(line: string): void;
}

const recordingFolder = (path: string): string => /\.mk[av]$/.test(basename(path)) ? dirname(path) : path;
const inFolder = (folder: string, clips: readonly Clip[]): Clip[] => clips.map(clip => clip.file === null ? clip : { ...clip, file: join(folder, clip.file) });
const missing = (clips: readonly Clip[]): number => clips.reduce((sum, clip) => sum + (clip.file === null ? clip.wall : 0), 0);

async function recordingPlan(deps: RenderDeps, args: RenderArgs, gameVideo: string): Promise<{ readonly video: Clip[]; readonly audio: Clip[] }> {
  const folder = recordingFolder(gameVideo), text = deps.readText(join(folder, "recording.jsonl"));
  if (text === null) throw new Error(`${folder} has no recording.jsonl`);
  const started = await deps.started(args.run), sessions = readJournal(text), files = deps.listFiles(folder);
  const spans = spansFor(sessions, started + args.from, started + args.to);
  const video = inFolder(folder, spans.flatMap(span => clipsFor("video", span, sessions, files)));
  const audio = inFolder(folder, spans.flatMap(span => clipsFor("audio", span, sessions, files)));
  if (missing(video) > 0) deps.log(`no picture for ${missing(video).toFixed(1)} s of this stretch: black there`);
  if (missing(audio) > 0) deps.log(`no sound for ${missing(audio).toFixed(1)} s of this stretch: silence there`);
  return { video, audio };
}

export async function renderClip(deps: RenderDeps, args: RenderArgs): Promise<void> {
  const seconds = args.to - args.from, transparent = args.gameVideo !== null;
  const plan = args.gameVideo === null ? null : await recordingPlan(deps, args, args.gameVideo);
  const path = `/broadcast?run=${encodeURIComponent(args.run)}&t=${String(args.from)}${transparent ? "&transparent=1" : ""}`;
  const page = await deps.openPage(path, transparent);
  try {
    const game = plan === null ? null : { ...plan, backdrop: await page.backdrop() };
    const encoder = deps.encode(encoderArgs({ out: args.out, fps: args.fps, seconds, game }));
    const frames = Math.round(seconds * args.fps);
    for (let i = 0; i < frames; i += 1) {
      await page.setTime(args.from + i / args.fps);
      await encoder.write(await page.shot());
      if (i % (args.fps * 30) === 0) deps.log(`${String(i)}/${String(frames)} frames`);
    }
    await encoder.finish();
  } finally { await page.close(); }
}
