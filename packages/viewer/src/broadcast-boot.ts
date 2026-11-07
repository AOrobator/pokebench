import { mountBroadcast, type FrameSocket, type Speaker } from "./broadcast-main.js";

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

// Web Audio, because the click must unlock sound for lines that do not exist yet: a context resumed in the click stays
// open, where a media element would need a real source to play inside the gesture.
function speaker(): Speaker {
  let context: AudioContext | null = null, source: AudioBufferSourceNode | null = null;
  return {
    unlock: () => { context ??= new AudioContext(); void context.resume(); },
    async play(url) {
      if (context === null) return;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const output = context, sound = await output.decodeAudioData(await response.arrayBuffer());
      await new Promise<void>(resolve => {
        const stalled = setTimeout(resolve, STALLED_MS), node = output.createBufferSource();
        node.buffer = sound;
        node.connect(output.destination);
        node.onended = () => { clearTimeout(stalled); resolve(); };
        source = node;
        node.start();
      });
    },
    stop: () => { source?.stop(); source = null; },
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
  speak: speaker(),
  frameUrl: data => {
    if (!(data instanceof ArrayBuffer)) throw new Error("live frame was not binary");
    return URL.createObjectURL(new Blob([data], { type: "image/png" }));
  },
}).then(page => {
  window.broadcastSetTime = t => page.setTime(t);
  window.broadcastReady = true;
}, (error: unknown) => {
  window.broadcastError = error instanceof Error ? error.message : String(error);
  const where = document.querySelector('[data-b="where"]');
  if (where !== null) where.textContent = window.broadcastError;
});
