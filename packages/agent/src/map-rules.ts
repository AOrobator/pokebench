// readout-rules-in-prompt-v1: the system-prompt section that states the fixed map rules once.
// env/pokebench_env/map_rules.py owns the text and how switches choose it; this module only
// looks up the section generated for the run's off set (`just map-rules`), so the prompt says
// exactly what the server would otherwise have printed under the map.
import type { FeatureSet } from "./features.js";
import { MAP_RULE_INDEX, MAP_RULE_SWITCHES, MAP_RULE_TEXTS } from "./map-rules.generated.js";

export function mapRulesSection(features: FeatureSet, index: Readonly<Record<string, number>> = MAP_RULE_INDEX, texts: readonly string[] = MAP_RULE_TEXTS): string {
  const key = MAP_RULE_SWITCHES.filter((id) => !features[id]).join(",");
  const at = index[key];
  const text = at === undefined ? undefined : texts[at];
  if (text === undefined) throw new Error(`no map-rules section for off set "${key}"; run just map-rules`);
  return text;
}
