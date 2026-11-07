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

// One element for every line: the click that starts the first one unlocks it for the rest.
function speaker(): Speaker {
  const audio = new Audio();
  let settle = (): void => undefined;
  for (const name of ["ended", "error"]) audio.addEventListener(name, () => { settle(); });
  return {
    play: url => new Promise<void>(resolve => {
      const stalled = setTimeout(() => { settle(); }, STALLED_MS);
      settle = () => { clearTimeout(stalled); resolve(); };
      audio.src = url;
      audio.play().catch(() => { settle(); });
    }),
    stop: () => { audio.pause(); settle(); },
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
