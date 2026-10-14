import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatBytes } from "./format.js";
import { easternTimestamp, type RunLog } from "./run-log.js";

export const FRAME_CAP_BYTES = 500 * 1024 * 1024;
export const START_LIMIT = 0.75;
// Evicting down to slightly under the cap amortizes the directory scan over
// many saves instead of rescanning on every save once the cap is reached.
export const EVICT_TO = 0.95;

export class FrameCapError extends Error {
  override readonly name = "FrameCapError";
}

export interface FrameRef {
  readonly path: string;
  readonly sha1: string;
}

interface StoredFrame {
  readonly run: string;
  readonly path: string;
  readonly bytes: number;
}

type Percent = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

type Pending =
  | { readonly kind: "usage"; readonly bytes: number; readonly percent: Percent }
  | { readonly kind: "evicted"; readonly run: string; readonly files: number; readonly bytes: number };

export class FrameStore {
  private lastPercent: Percent = 0;
  private tracked: number | undefined;
  private pending: Pending[] = [];
  private protectActive = false;
  protectActiveRuns():void {this.protectActive=true;}
  private isActive(run:string):boolean {
    try {
      const lines=readFileSync(join(this.runsRoot,run,"events.jsonl"),"utf8").trim().split("\n");
      return !lines.some(line => {try{return (JSON.parse(line) as {type?:string}).type==="run_end";}catch{return false;}});
    } catch {return true;}
  }

  constructor(
    readonly runsRoot: string,
    readonly capBytes: number = FRAME_CAP_BYTES,
    private readonly notify: (line: string) => void = (line) => {
      console.error(line);
    },
  ) {}

  private frames(): StoredFrame[] {
    let runs: string[];
    try {
      runs = readdirSync(this.runsRoot);
    } catch {
      return [];
    }
    const found: StoredFrame[] = [];
    for (const run of runs.sort()) {
      const dir = join(this.runsRoot, run, "frames");
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names.filter((n) => n.endsWith(".png")).sort()) {
        const path = join(dir, name);
        const stat = statSync(path, { throwIfNoEntry: false });
        if (stat !== undefined) found.push({ run, path, bytes: stat.size });
      }
    }
    return found;
  }

  usage(): number {
    return this.frames().reduce((sum, frame) => sum + frame.bytes, 0);
  }

  private percent(bytes: number): Percent {
    return Math.min(100, Math.floor((bytes / this.capBytes) * 10) * 10) as Percent;
  }

  private report(log: RunLog, turn: number, bytes: number, percent: Percent): void {
    log.append({ type: "disk_usage", turn, bytes, cap_bytes: this.capBytes, percent });
    this.notify(`frames on disk: ${String(percent)}% of ${formatBytes(this.capBytes)} cap (${formatBytes(bytes)})`);
  }

  assertCanStart(): void {
    const bytes = this.usage();
    if (bytes > this.capBytes * START_LIMIT) {
      throw new FrameCapError(
        `frames use ${formatBytes(bytes)} of the ${formatBytes(this.capBytes)} cap, above the 75% start limit; ` +
          "free space with `just runs-prune <percent>`",
      );
    }
  }

  attach(log: RunLog): void {
    const bytes = this.usage();
    this.tracked = bytes;
    this.lastPercent = this.percent(bytes);
    this.report(log, 0, bytes, this.lastPercent);
  }

  /** Writes the frame. Disk reports are queued until `flush`, so the caller can log the frame's owner first. */
  save(log: RunLog, seq: number, index: number, pngBase64: string): FrameRef {
    const bytes = Buffer.from(pngBase64, "base64");
    const path = `frames/${String(seq).padStart(6, "0")}_${String(index)}.png`;
    if(this.protectActive) {
      const usage=this.usage();
      if(usage+bytes.length>this.capBytes) {
        const candidates=this.frames().filter(frame=>frame.run!==log.runId&&!this.isActive(frame.run));
        if(candidates.reduce((sum,frame)=>sum+frame.bytes,0)<usage+bytes.length-this.capBytes) throw new FrameCapError("Frame cap reached; active recordings are protected. Free completed run frames before recording again.");
        this.evict(usage+bytes.length-Math.floor(this.capBytes*EVICT_TO),log.runId,entry=>{this.pending.push({kind:"evicted",...entry});});
      }
      this.tracked=this.usage();
    }
    mkdirSync(join(log.runDir, "frames"), { recursive: true });
    writeFileSync(join(log.runDir, path), bytes);
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    let usage = (this.tracked ?? this.usage()) + bytes.length;
    if (usage > this.capBytes) {
      usage -= this.evict(usage - Math.floor(this.capBytes * EVICT_TO), log.runId, (entry) => {
        this.pending.push({ kind: "evicted", ...entry });
      });
    }
    this.tracked = usage;
    const percent = this.percent(usage);
    if (percent > this.lastPercent) this.pending.push({ kind: "usage", bytes: usage, percent });
    this.lastPercent = percent;
    return { path, sha1 };
  }

  flush(log: RunLog, turn: number): void {
    const pending = this.pending;
    this.pending = [];
    for (const item of pending) {
      if (item.kind === "usage") {
        this.report(log, turn, item.bytes, item.percent);
      } else {
        log.append({ type: "frames_evicted", turn, from_run: item.run, files: item.files, bytes: item.bytes });
      }
    }
  }

  private evict(
    needBytes: number,
    byRunId: string | null,
    record: (entry: { run: string; files: number; bytes: number }) => void = () => undefined,
  ): number {
    const byRun = new Map<string, { files: number; bytes: number }>();
    let freed = 0;
    for (const frame of this.frames()) {
      if (freed >= needBytes) break;
      if(this.protectActive && (frame.run===byRunId||this.isActive(frame.run))) continue;
      unlinkSync(frame.path);
      freed += frame.bytes;
      const entry = byRun.get(frame.run) ?? { files: 0, bytes: 0 };
      byRun.set(frame.run, { files: entry.files + 1, bytes: entry.bytes + frame.bytes });
    }
    for (const [run, entry] of byRun) {
      record({ run, ...entry });
      const ledger = { t: easternTimestamp(new Date()), run, ...entry, by_run: byRunId };
      appendFileSync(join(this.runsRoot, "frames-evictions.jsonl"), `${JSON.stringify(ledger)}\n`);
    }
    return freed;
  }

  prune(targetFraction: number): { files: number; bytes: number } {
    if (!(targetFraction >= 0 && targetFraction <= 1)) {
      throw new RangeError(`prune target must be within 0..1, got ${String(targetFraction)}`);
    }
    const before = this.frames();
    const usage = before.reduce((sum, frame) => sum + frame.bytes, 0);
    const target = this.capBytes * targetFraction;
    if (usage <= target) return { files: 0, bytes: 0 };
    const freed = this.evict(usage - target, null);
    this.tracked = undefined;
    return { files: before.length - this.frames().length, bytes: freed };
  }
}

