import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("removes experiment controls and navigation from both viewer surfaces", () => {
  for (const name of ["index", "workbench"]) {
    const html = readFileSync(new URL(`../static/${name}.html`, import.meta.url), "utf8");
    expect(html).not.toMatch(/experiment|data-wb="cohort"|data-page="queue"/i);
  }
});
it("never starts or polls the removed queue", () => {
  for (const name of ["cli", "app", "workbench", "server"]) {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8");
    expect(source).not.toMatch(/ExperimentAutoRun|QueuePanel|queueSnapshot|queueApi|\/api\/experiments/);
  }
});
