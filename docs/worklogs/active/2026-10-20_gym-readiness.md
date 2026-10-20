# Gym readiness readout

## Operator decision

2026-10-20 6:52 PM ET, the operator: "lgtm" to the proposal in http://127.0.0.1:8791/reports/roxanne-levels/index.html (6 runs reached the Rustboro gym with a lone TORCHIC Lv12-15; ROXANNE won all 6 battles; JOSH fought in all six, TOMMY and MARC only in b300). Build `gym-readiness-readout-v1`: bundle-only, default off, seen-only.

## Design

Agent-side readout block (like people-ledger-v1), on a gym map's field only (location ends with " GYM"), after the Location/Position lines:
- `Gym: <location>` plus ` · GYM LEADER <name>` once a leader (TRAINER_CLASS_LEADER 0x20) was battled on this map
- `Your party:` species, level, HP
- `<leader>'s POKéMON seen in battle this run:` each party slot she sent out, highest level seen, or `none yet`
- `Said on this map:` field pages printed on this map that name a type ("X-type"), quoted once each
- `Trainers on this map:` from heal-before-trainers facts when present: name from a battle, else sprite kind, beaten / not battled
No ROM trainer parties, no advice, no level targets.

## M1

- [x] RED: a8f9 fixture (trimmed gym battle states and field pages, one full gym state after the guide talk): full block, before any leader battle, trainers list, off-gym/battle/unstarted null, slot levels, type page filter, annotate anchor, event mapping, wiring ON/OFF, registry
- [x] GREEN: `gym-readiness.ts` (GymReadiness, gymEvent, withGymReadiness) wired in `playGameTools` around the people ledger; registered last (observation, needs null, default off); registry churn in 47 agent tests, legacy-features and open-goal-prompt. Wiring deletion in play-wiring turns the production factory test red; restored.
- [x] Explainer `docs/explainers/gym-readiness-readout-v1.html` (pages-check clean), FEATURE_EXPLAINERS + server test; pending `experiments/gym-readiness-readout-v1.json` (activation RUSTBORO_CITY_GYM); readiness row; bundle switch in bundle-v-control and bundle-cook-1h
- [x] Gates: lint clean; agent 2975, viewer 1436, pytest 2998; coverage above 90 (agent 97/93/98/99, viewer 95/91/94/98)
- [ ] Review: Claude and Grok LGTM
- [ ] features.ts slot, land ff-only
