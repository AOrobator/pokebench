import { expect, it } from "vitest";
import { BROWSER_MODULES } from "./server.js";

it("serves the modules the frontier and the run panels import in the browser", () => {
  for (const name of ["custom-lane", "served-effort"]) expect(BROWSER_MODULES).toContain(name);
  expect(BROWSER_MODULES).not.toContain("run-config");
});
