import { expect, it } from "vitest";
import { activeUiFeatures } from "./ui-feature.js";

it.each([[undefined, true], ["1", true], ["0", false]] as const)("active UI feature exposure for %s is %s", (flag, enabled) => {
  expect(activeUiFeatures(flag === undefined ? {} : {POKEBENCH_ACTIVE_UI:flag})).toEqual(enabled ? ["active-ui-ownership-v1"] : []);
});
it("rejects an invalid active UI flag", () => {
  expect(() => activeUiFeatures({POKEBENCH_ACTIVE_UI:"false"})).toThrow("POKEBENCH_ACTIVE_UI must be 0 or 1");
});
