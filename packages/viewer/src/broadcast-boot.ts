import { mountBroadcast, type FrameSocket } from "./broadcast-main.js";

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
  show: async (image, src) => { image.src = src; await image.decode().catch(() => undefined); },
  laneWidth: lane => lane.offsetWidth,
  openFrames: frameSocket,
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
