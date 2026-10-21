# Next cook approved feature membership

Operator request verified in coordinator chatredacted-id: approved fixes must be enabled in next cook, current runs untouched. Scope: existing gym-evidence-v1 and milestone-instruction-memory-v1 added to active bundle-v-control-2h only, explicit base/control OFF, bundle ON. No new runtime, switch, defaults, launcher, recipe arm reassignment, gameplay or current preset edits. Other owners cover first-trigger and three both-arm Claude fixes.

- [x] RED: real tracked definition -> dryRunDefinition -> soloDefinition -> armPreset; fails missing explicit base flag (undefined vs false), /tmp/next-cook-red.log. Initial unsynced compiled registry/bad test arg attempt is not counted; rebuilt current source and corrected existing solo API before valid RED.
- [x] GREEN minimal explicit basefalse plus bundle switch membership for both. Actual dry-run/solo armPreset test passes; each switch independently removed produced expected RED then restored. /tmp/next-cook-green.log and /tmp/next-cook-mutations.log. Generated preset proof /tmp/next-cook-generated-presets.jsonl shows bundletrue/controlfalse and recipe hashes.
- [ ] Build/test/coverage/lint/vendor gates
- [ ] Three cloud frozen reviews and board landing
- [ ] Actual next run source/recipe SHA and flags; report timing conflict if incomplete

No operator approval checkpoint beyond existing merge/review gates. Automatic loop continues under standing operator authorization; no PAUSE/STOP or controller signals.

## Gate and coordination evidence
- Initial full coverage: agent3434 pass; viewer1662pass/1fail unchanged experiment-cli tempgit fixture5000ms timeout. /tmp/next-cook-gates.log retained.
- One unchanged full rerun: agent3433pass/1fail unchanged serial-comparison childstdoutempty under100ms deadline. /tmp/next-cook-gates-rerun.log retained. Other full suites observed on host; neither failure is in changed code. No retries/timeouts/skip/suppression added. FullgateNOTGREEN; rerun fresh after sync at landingturn, not a claim of readiness. Independent lint/build/vendor PASS (/tmp/next-cook-lint.log, /tmp/next-cook-build-final.log, /tmp/next-cook-vendor.log).
- Joined normal board#6 with thread 00000000-0000-4000-8000-a1d44aed214c. Coordinator says only number1 can holdmain forreview. No review dispatched before turn.
- At17:57 verified direct human answer in coordinatorchatredacted-id: “Keep the schedule; use fixes in a later cook.” Supersedes next18:05 deadline requirement; no holds/PAUSE/STOP/processchanges. Activation means first later actual run receipt containing landed source and matching recipeflags, not merely merge.
