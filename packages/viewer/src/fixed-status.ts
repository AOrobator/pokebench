// The status file a fixed-run runner rewrites on every change, which the viewer shows as is.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export class FixedStatusError extends Error {
  override readonly name = "FixedStatusError";
}

const closed = { additionalProperties: false } as const;
const LaneStatusSchema = Type.Object({
  id: Type.String(), gpu: Type.String(), port: Type.Integer(), state: Type.Union([Type.Literal("starting"), Type.Literal("running"), Type.Literal("waiting"), Type.Literal("paused"), Type.Literal("done"), Type.Literal("stopped")]), reason: Type.String(),
  slot: Type.Union([Type.Integer(), Type.Null()]), arm: Type.Union([Type.String(), Type.Null()]), phase: Type.Union([Type.String(), Type.Null()]), run: Type.Union([Type.String(), Type.Null()]),
  since: Type.String(), retryAt: Type.Union([Type.String(), Type.Null()]), lastError: Type.Union([Type.String(), Type.Null()]), valid: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }),
}, closed);
export const FixedStatusSchema = Type.Object({
  kind: Type.Literal("fixed-run"), version: Type.Literal(1), experiment: Type.String({ minLength: 1 }), title: Type.String(), definitionSha256: Type.String(), pid: Type.Integer({ minimum: 1 }),
  updatedAt: Type.String(), state: Type.Union([Type.Literal("running"), Type.Literal("waiting"), Type.Literal("stopped"), Type.Literal("finished")]), total: Type.Integer({ minimum: 0 }), valid: Type.Integer({ minimum: 0 }), invalid: Type.Integer({ minimum: 0 }),
  invalidTrials: Type.Array(Type.Object({ slot: Type.Integer(), lane: Type.String(), arm: Type.String(), phase: Type.String(), run: Type.String(), reason: Type.String() }, closed)),
  reserve: Type.Object({ usedMs: Type.Number(), totalMs: Type.Number() }, closed),
  lanes: Type.Array(LaneStatusSchema),
  lastError: Type.Union([Type.String(), Type.Null()]),
}, closed);
export type FixedStatus = Static<typeof FixedStatusSchema>;
export type FixedLaneStatus = Static<typeof LaneStatusSchema>;
export type FixedStatusView = FixedStatus & { readonly runnerAlive: boolean };

export function parseFixedStatus(value: unknown): FixedStatus {
  if (!Value.Check(FixedStatusSchema, value)) {
    const [first] = Value.Errors(FixedStatusSchema, value);
    throw new FixedStatusError(`not a fixed-run status: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);
  }
  return value;
}

export const fixedStatusPath = (runsRoot: string, experiment: string): string => join(runsRoot, "experiments", experiment, "status.json");

export function writeFixedStatus(runsRoot: string, status: FixedStatus): void {
  const path = fixedStatusPath(runsRoot, status.experiment);
  mkdirSync(join(runsRoot, "experiments", status.experiment), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(status, null, 1)}\n`);
  renameSync(`${path}.tmp`, path);
}

export function readFixedStatuses(runsRoot: string, alive: (pid: number) => boolean): FixedStatusView[] {
  const root = join(runsRoot, "experiments");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().flatMap((name) => {
    const path = join(root, name, "status.json");
    if (!existsSync(path)) return [];
    try {
      const status = parseFixedStatus(JSON.parse(readFileSync(path, "utf8")));
      return [{ ...status, runnerAlive: alive(status.pid) }];
    } catch {
      return [];
    }
  });
}
