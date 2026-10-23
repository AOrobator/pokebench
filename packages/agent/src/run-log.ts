import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RUN_ID_PATTERN, SCHEMA_VERSION, checkEvent, eventProblem, type EventBody, type RunEvent } from "./events.js";

export class RunLogError extends Error {
  override readonly name = "RunLogError";
}

const RUN_ID = new RegExp(RUN_ID_PATTERN);

const EASTERN_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

export function easternTimestamp(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    EASTERN_PARTS.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const offset = part("timeZoneName").replace("GMT", "");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}.${millis}${offset}`;
}

export function validateRunId(runId: string): string {
  if (!RUN_ID.test(runId)) {
    throw new RunLogError(`run id must be one safe path component, got ${JSON.stringify(runId)}`);
  }
  return runId;
}

export class RunLog {
  private seq = 0;
  private started = false;
  private closed = false;

  private constructor(
    readonly runId: string,
    readonly runDir: string,
    private readonly now: () => Date,
    private readonly continuationSeq = 1,
  ) {}

  static create(runsRoot: string, runId: string, now: () => Date = () => new Date(), continuationSeq = 1): RunLog {
    if(!Number.isSafeInteger(continuationSeq)||continuationSeq<1)throw new RunLogError("invalid continuation sequence");
    const runDir = join(runsRoot, validateRunId(runId));
    mkdirSync(runsRoot, { recursive: true });
    try {
      mkdirSync(runDir);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new RunLogError(`${runDir} already exists; a run directory is used once`);
      }
      throw error;
    }
    return new RunLog(runId, runDir, now, continuationSeq);
  }

  get eventsPath(): string {
    return join(this.runDir, "events.jsonl");
  }

  get continuationStartSeq():number{return this.continuationSeq;}

  get nextSeq(): number {
    return this.seq;
  }

  get ended(): boolean {
    return this.closed;
  }

  append(body: EventBody): RunEvent {
    if (this.closed) throw new RunLogError(`run ${this.runId} has ended`);
    if (!this.started && body.type !== "run_start") throw new RunLogError("the first event must be run_start");
    if (this.started && body.type === "run_start") throw new RunLogError("run_start may appear only once");
    const candidate = { v: SCHEMA_VERSION, run: this.runId, seq: this.seq, t: easternTimestamp(this.now()), ...body };
    const problem = eventProblem(candidate);
    if (problem !== null) throw new RunLogError(problem);
    const event = checkEvent(candidate);
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`);
    this.seq = body.type === "run_start" ? this.continuationSeq : this.seq + 1;
    this.started = true;
    if (event.type === "run_end") this.closed = true;
    return event;
  }
}
