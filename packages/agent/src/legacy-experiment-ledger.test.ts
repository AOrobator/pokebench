import { expect, it } from "vitest";
import { parseLedger, parseFinalsLedger } from "./legacy-experiment-ledger.js";

it("reads historical launches, outcomes and failures without permitting queue execution", () => {
  const base = { trial: 0, arm: "candidate", run: "old-run", at: "2026-10-14T00:00:00Z" };
  const entries = [{ ...base, type: "launch" }, { ...base, type: "outcome", reason: "budget" }, { ...base, type: "launcher_error", message: "gateway unavailable" }];
  expect(parseLedger(entries.map(e => JSON.stringify(e)).join("\n"))).toEqual({ entries, problems: [] });
  expect(parseLedger('\n{\n{}\n')).toEqual({ entries: [], problems: ["line 2: not JSON", "line 3: not a ledger entry"] });
});
it("reads historical finals and diagnoses malformed records", () => {
  const base = { trial: 0, arm: "finalist", run: "old-final", at: "2026-10-14T00:00:00Z" };
  const entries = [{ ...base, type: "launch", model: "recorded-model", commit: "a".repeat(40) }, { ...base, type: "outcome", reason: "budget" }, { ...base, type: "launcher_error", message: "failed" }];
  expect(parseFinalsLedger(entries.map(e => JSON.stringify(e)).join("\n"))).toEqual({ entries, problems: [] });
  expect(parseFinalsLedger('\n{\n{}\n')).toEqual({ entries: [], problems: ["line 2: not JSON", "line 3: not a finals entry"] });
});
