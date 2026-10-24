# Maintained feature configuration

`current.json` is the sole maintained control/bundle feature owner. Add new feature defaults and arm activation here, not to protocol copies. `features` is the shared base; `switches` turns a flag OFF in control and ON in bundle; `onInBoth` and `offInBoth` record explicit common settings. Keep every both-arm promotion in the shared base too.

The shared baseline is the current two-hour Qwen control (including full-map navigation), retaining explicit both-arm promotions from both former donors, including original-speed-pacing-v1, named-warp-destinations-v1 and exit-labels-v2. The NPC switch is OFF by default/control and ON in bundle. Global harness defaults are separate.

`bundle-v-control`, `bundle-v-control-2h` and `glm53-flash-4h` retain their schedules, models, starts and budgets and reference `featureRecipe: current`. Source loading uses `readFixedDefinition(root,id)`; pure `parseFixedDefinition` still accepts complete frozen/historical definitions without reading current configuration. When parsing a reference explicitly, pass a recipe-text resolver. Approval hashes bind source and config bytes; generated presets/definitions are complete snapshots. Exploratory launches save the resolved definition and feature-config digest in their existing feature-recipe receipt.

Future launchers use the protocol reference automatically; the older `--feature-recipe` option still supports historical full-definition donors. Existing running controllers, environment, leases, run pins, artifacts and schedules are not changed by this migration. Updating tracked source affects only future launchers built from the landed pin.

Read-only historical analysis explicitly permits `readFixedDefinition(root,id,true)` to fall back to `experiments/archive/fixed/`; launch/plan/approve paths do not. The viewer's existing provenance index reads archived titles after current titles so recorded runs remain discoverable.
