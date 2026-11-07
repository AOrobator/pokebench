import { mountBroadcast, type FrameSocket, type Music, type Speaker } from "./broadcast-main.js";
import { MusicFollower, type MusicChunk } from "./broadcast-music.js";

const STALLED_MS = 30_000;

declare global {
  interface Window {
    broadcastReady: boolean;
    broadcastError: string | null;
    broadcastSetTime(t: number): Promise<void>;
  }
}

function frameSocket(path: string): FrameSocket {
  const target = new URL(path, window.location.href);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(target.href);
  socket.binaryType = "arraybuffer";
  return {
    on(name: "message" | "close", run: (data: unknown) => void) {
      if (name === "message") socket.addEventListener("message", event => { run(event.data); });
      else socket.addEventListener("close", () => { run(undefined); });
    },
    close: () => { socket.close(); },
  };
}

const DUCK = 0.3, FADE_S = 0.08, WAV_HEADER = 44, SAMPLE_RATE = 48000;

async function fetchChunk(base: string, since: number): Promise<MusicChunk> {
  const response = await fetch(`${base}/audio?since=${String(since)}`, { cache: "no-store" });
  const next = Number(response.headers.get("x-audio-next"));
  if (!response.ok || !Number.isSafeInteger(next)) throw new Error("no game audio");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < WAV_HEADER || (bytes.byteLength - WAV_HEADER) % 4 !== 0) throw new Error("bad game audio");
  return { pcm: new Int16Array(bytes.slice(WAV_HEADER)), next };
}

// Web Audio, because the click must unlock sound for lines that do not exist yet: a context resumed in the click stays
// open, where a media element would need a real source to play inside the gesture. Voice and music share it.
function sound(): { speak: Speaker; music: Music } {
  let context: AudioContext | null = null, source: AudioBufferSourceNode | null = null, ticket = 0;
  let gain: GainNode | null = null, follower: MusicFollower | null = null, level = 0.5, ducked = false;
  const silence = (): void => { ticket += 1; source?.stop(); source = null; };
  const setGain = (): void => { if (context !== null) gain?.gain.setTargetAtTime(level * (ducked ? DUCK : 1), context.currentTime, FADE_S); };
  const speakLine = async (output: AudioContext, url: string, signal: AbortSignal, mine: number): Promise<void> => {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) return;
    const audio = await output.decodeAudioData(await response.arrayBuffer());
    if (mine !== ticket) return;
    await new Promise<void>(resolve => {
      const node = output.createBufferSource();
      node.buffer = audio;
      node.connect(output.destination);
      node.onended = () => { resolve(); };
      source = node;
      node.start();
    });
  };
  const schedule = (output: AudioContext, into: GainNode, pcm: Int16Array, at: number, rate: number): void => {
    const buffer = output.createBuffer(2, pcm.length / 2, SAMPLE_RATE);
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i += 1) samples[i] = (pcm[i * 2 + channel] ?? 0) / 32768;
    }
    const node = output.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = rate;
    node.connect(into);
    node.start(at);
  };
  return {
    speak: {
      unlock: () => { context ??= new AudioContext(); void context.resume(); },
      async play(url) {
        if (context === null) return;
        const abort = new AbortController();
        let timer = setTimeout(() => undefined, 0);
        const stalled = new Promise<void>(resolve => { timer = setTimeout(resolve, STALLED_MS); });
        // One limit for the whole line, so a hung fetch or a suspended context cannot hold the queue or overlap the next.
        await Promise.race([speakLine(context, url, abort.signal, ticket).catch(() => undefined), stalled]);
        clearTimeout(timer);
        abort.abort();
        silence();
      },
      stop: silence,
    },
    music: {
      start(base) {
        if (context === null) return;
        const output = context, into = gain = output.createGain();
        into.gain.value = level;
        into.connect(output.destination);
        follower = new MusicFollower({
          fetchChunk: since => fetchChunk(base, since),
          schedule: (pcm, at, rate) => { schedule(output, into, pcm, at, rate); },
          clock: () => output.currentTime,
          after: (ms, run) => { setTimeout(run, ms); },
        });
        follower.start();
      },
      stop() { follower?.stop(); gain?.disconnect(); gain = null; },
      duck(on) { ducked = on; setGain(); },
      level(value) { level = value; setGain(); },
    },
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
  return response.json();
}

window.broadcastReady = false;
window.broadcastError = null;
mountBroadcast(document, {
  search: window.location.search,
  fetchJson,
  now: () => Date.now(),
  width: () => window.innerWidth,
  height: () => window.innerHeight,
  after: (ms, run) => { setTimeout(run, ms); },
  show: (image, src) => { image.src = src; return image.decode(); },
  laneWidth: lane => lane.offsetWidth,
  openFrames: frameSocket,
  ...sound(),
  badgeSprites: urls => Promise.all(urls.map(url => { const image = new Image(); image.src = url; return image.decode(); })).then(() => true, () => false),
  paintFrame: async (canvas, data) => {
    if (!(data instanceof ArrayBuffer)) throw new Error("live frame was not binary");
    const frame = await createImageBitmap(new Blob([data], { type: "image/png" }));
    // Setting a canvas's size clears it, so only a new size may touch it.
    if (canvas.width !== frame.width) canvas.width = frame.width;
    if (canvas.height !== frame.height) canvas.height = frame.height;
    canvas.getContext("2d")?.drawImage(frame, 0, 0);
    frame.close();
  },
}).then(page => {
  window.broadcastSetTime = t => page.setTime(t);
  window.broadcastReady = true;
}, (error: unknown) => {
  window.broadcastError = error instanceof Error ? error.message : String(error);
  const where = document.querySelector('[data-b="where"]');
  if (where !== null) where.textContent = window.broadcastError;
});
