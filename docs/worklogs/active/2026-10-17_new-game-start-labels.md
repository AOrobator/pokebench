# New-game start labels (skills doc fix)

Requested in the ChatGPT feedback triage thread (the operator, 2026-10-17). One milestone, docs only, no behavior change, so no switch.

## M1: relabel MAIN_MENU starts

- [x] run-analysis and pokebench-review skills and frontier.mjs say "new game: boot or MAIN_MENU save", never "fresh boot", for MAIN_MENU starts. COMMIT: `skills: MAIN_MENU starts are new-game starts, not fresh boots` (e425358c)
- [x] Run-analysis checklist: no milestone credited to a longer cap when it was reached before the old cap (same commit)
- [x] Review round 1 (diff f8590773…): Claude LGTM; Grok and GPT BLOCKING. Finding: docs said MAIN_MENU minutes are never compared with boot runs, but frontier.ts ranks both by elapsedMs. Also pokebench-review SKILL.md:71 still said "fresh boot", and the section 6 checklist claimed a separate MAIN_MENU list.
- [x] Round 1 fix: ranking follows frontier.ts; reports never call a run faster across boot and MAIN_MENU; line 71 and the checklist reworded. COMMIT: `skills: rank boot and MAIN_MENU together as frontier.ts does, never call one faster across kinds`
- [ ] Review round 2 on the fix delta, then fast-forward merge into main
- Gates: node --check frontier.mjs passes; no code, test or coverage surface changed.
