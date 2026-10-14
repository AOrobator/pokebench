import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { RunEvent } from "@pokebench/agent/events";
const FrameSchema = Type.Object({ seq: Type.Integer({ minimum: 0 }), path: Type.String({ pattern: "^frames/[0-9]{6,}_[0-9]+[.]png$" }), sha1: Type.String({ pattern: "^[a-f0-9]{40}$" }) }, { additionalProperties: false });
export type ScreenshotEvidence = Static<typeof FrameSchema>;
const Schema = Type.Object({ v: Type.Literal(1), run: Type.String(), logSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }), method: Type.Literal("reviewed-victory-screens"), milestones: Type.Array(Type.Object({ name: Type.Enum(["RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", "ROXANNE_DEFEATED"]), sampleSeq: Type.Integer({ minimum: 0 }), screenshots: Type.Array(FrameSchema, { minItems: 1, maxItems: 6 }) }, { additionalProperties: false }), { minItems: 1, maxItems: 4 }) }, { additionalProperties: false });
export type VisualPlan = Static<typeof Schema>;
export function readVisualPlan(eventsPath: string): VisualPlan | null {
  const path = join(dirname(eventsPath), "viewer-visual-milestones.v1.json");
  if (!existsSync(path)) return null;
  if (lstatSync(path).isSymbolicLink() || lstatSync(path).size > 16384) throw Error("Visual milestone receipt exceeds bounds or is symlinked");
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Value.Check(Schema, data) || new Set(data.milestones.map(m => m.name)).size !== data.milestones.length || data.milestones.some(m => !m.screenshots.some(s => s.seq === m.sampleSeq) || new Set(m.screenshots.map(s => s.seq)).size !== m.screenshots.length)) throw Error("Invalid visual milestone receipt");
  return data;
}
// Small image checks run even on cached summaries so modified proof is withdrawn.
export function visualEvidenceSignature(eventsPath: string): string {
  const plan = readVisualPlan(eventsPath); if (plan === null) return "";
  const root = realpathSync(dirname(eventsPath));
  for (const frame of plan.milestones.flatMap(m => m.screenshots)) {
    const path = join(root, frame.path);
    if (!realpathSync(path).startsWith(root + sep) || lstatSync(path).size > 2 * 1024 * 1024) throw Error("Visual screenshot escapes run or exceeds bounds");
    const data = readFileSync(path);
    if (createHash("sha1").update(data).digest("hex") !== frame.sha1) throw Error("Visual screenshot hash mismatch");
  }
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
export function verifiedVisuals(plan: VisualPlan | null, start: Extract<RunEvent, {type: "run_start"}>, hash: string, samples: ReadonlyMap<number, Extract<RunEvent, {type: "human_sample"}>>): { name: string; sample: Extract<RunEvent, {type: "human_sample"}>; screenshots: ScreenshotEvidence[] }[] {
  if (plan === null) return [];
  if (start.controller?.kind !== "human" || start.start_state.kind !== "boot" || plan.run !== start.run || plan.logSha256 !== hash) throw Error("Visual evidence is not bound to this human boot recording");
  return plan.milestones.map(mark => {
    for (const frame of mark.screenshots) {
      const event = samples.get(frame.seq);
      if (event === undefined || event.run !== start.run || event.screenshot.path !== frame.path || event.screenshot.sha1 !== frame.sha1 || frame.seq > mark.sampleSeq) throw Error("Visual evidence does not match recorded screenshot event");
    }
    const sample = samples.get(mark.sampleSeq); if (sample === undefined) throw Error("Visual victory sample missing");
    return { name: mark.name, sample, screenshots: mark.screenshots };
  });
}
