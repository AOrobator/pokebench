# refusal-ledger-bound-v1 (bounded navigation refusal history)

Operator decisions, relayed from the project thread:

- The operator 2026-10-28 picked bound 3 (refusal ledger) with bounds 1, 2, 4 and 6. Each is its own default-OFF switch on its own branch off main.
- The operator: "they all need to be on in the bundle". The activation commit puts it in current.json `switches` (bundle arm only); control stays OFF.
- Coordinator 11:51 AM NY: nothing given to the model may grow unbounded. Keep a running list of other lines that grow with run length, and report it at the end.
- Don't land or activate until the coordinator returns with the operator's OK. Full suites only on a relayed CPU grant.

## Why

refusal-ledger-v1 sends "Navigation refusal history" in the belief ledger message, with one entry per refused target on the current map. Each entry quotes the whole latest navigation result. Water and wall refusals carry their departure alternatives, so one entry runs about 3,000 chars. Qwen run 9e33 at T2417 had 10 entries and 24,803 chars.

An entry's "at turns …" list also grows with every repeat of the same refusal.

## Rule (whole entries; quoted results are never cut)

- Whole entries, newest first, are kept while the kept entry lines, joined with newlines, fit in 4,000 chars. The newest entry always stays. Kept entries are shown in their usual order (oldest first). A line under the header counts the rest: `N older refusal entries on this map are left out.`
- A repeated refusal lists its latest 10 turns. The full count stays in the line, and the rest are counted: `40 times navigation returned this reason, at turns 31, …, 40 (and 30 earlier turns).`
- The header, the evidence seqs and the recorded `entries` count are unchanged.

**OFF:** byte-identical. **ON with nothing over a bound:** also byte-identical.

## M1

- [x] RED: `packages/agent/src/refusal-ledger-bound.test.ts`, 5 tests. OFF passes; the 3 ON tests and the registry test fail.
- [x] GREEN: `refusal-ledger.ts` (REFUSAL_LEDGER_CHARS 4000, REFUSAL_TURNS_SHOWN 10); registry index 295 (after main's new neutral-yes-no-readout-v1; main moved to 0df1c0a1f after the bound-1 and bound-2 branches cut from eb4d388be), guidance, needs refusal-ledger-v1; preset, next-run. 5/5; with refusal-ledger, disproved-beliefs, features 91 passed; agent and viewer tsc clean; eslint clean.
- [x] Replay of recorded events through the built `RefusalLedger`. OFF matches every recorded refusal history: 9e33 1,284, a702 408, 88ea 830, all byte for byte. Largest recorded → same turn ON → largest ON in the run: 9e33 T2417 24,803 → 3,212 → 4,723; a702 T852 10,310 → 2,664 → 3,440; 88ea T843 15,065 → 3,231 → 3,509. 88ea was read only.
- [x] Explainer `docs/explainers/refusal-ledger-bound-v1.html` (theme, pages-check clean, headless screenshots), README, `FEATURE_EXPLAINERS`; panels/server link tests 2/2.
- [ ] Activation commit (bundle ON).
- [ ] Gates on a CPU grant; three-lane review.

## Lines that grow with run length (running list)

- Supervisor "Exits to maps you have not entered": bounded in supervisor-briefing-bound-v1 (M2).
- Refusal ledger entries and the per-entry turn list: this switch.
- Disproved beliefs ("Things the game has contradicted", the other half of the belief ledger): entries last until a story flag changes, and each push-back or misplaced-person entry's turn list grows with repeats. It never appeared in 9e33, a702, 88ea or 429f. Not bounded yet.
