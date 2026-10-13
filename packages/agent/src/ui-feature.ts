export const ACTIVE_UI_FEATURE = "active-ui-ownership-v1";

export function activeUiFeatures(env: NodeJS.ProcessEnv = process.env): string[] {
  const flag = env["POKEBENCH_ACTIVE_UI"];
  if (flag !== undefined && flag !== "0" && flag !== "1") throw new Error("POKEBENCH_ACTIVE_UI must be 0 or 1");
  return flag === "0" ? [] : [ACTIVE_UI_FEATURE];
}
