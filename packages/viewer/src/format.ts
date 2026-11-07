// Shared by the browser and the server: no Node or DOM imports.

const pad = (n: number): string => String(n).padStart(2, "0");

export function hms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function broadcastUrl(run: string | null): string { return run === null ? "/broadcast" : `/broadcast?run=${encodeURIComponent(run)}`; }

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function signedDelta(seconds: number): string {
  const whole = Math.floor(Math.abs(seconds));
  const text = whole < 3600 ? `${String(Math.floor(whole / 60))}:${pad(whole % 60)}` : hms(whole);
  if (whole === 0) return `±${text}`;
  return `${seconds < 0 ? "−" : "+"}${text}`;
}

export function eventMs(event: { readonly t: string }): number {
  return Date.parse(event.t);
}
