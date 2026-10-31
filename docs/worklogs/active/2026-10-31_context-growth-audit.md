# Context growth audit and shared bounds

Operator request 2026-10-31: enable supervisor-briefing-bound-v1 and compact-map-grid-v1 in both arms. Audit supervisor messages, instruction memory and growing model context report-only. No other behavioral changes or run launches authorized.

Scope: move only those two IDs from current recipe switches to onInBoth, set base bits true; frozen recipes and historical records unchanged. Audit output is ignored runs/reports content.

- [ ] RED effective arm tests
- [ ] GREEN recipe role and resolved-feature validation
- [ ] Required gates and independent review
- [ ] Landing board and post-main checks; no gameplay restart/launch
- [ ] Report read-only source inventory plus historical measured payloads and ranked proposals

RED: fixed-definition.test.ts 20 PASS / 1 FAIL because compact-map-grid-v1 is absent from onInBoth. The added test checks resolved flags and materialized preset features for both arms of all four maintained current recipes.

GREEN: only current.json switches/onInBoth/base bits changed. Fixed-definition + registry: 22 PASS. Full-gate CPU START requested through Claude relay; pending grant. Historical recipes remain frozen. No runtime restart or run launch.

Evidence update 2026-10-31:
- Source commits: RED935b4a46d / GREEN461eac25f. Frozen base982dbeb1275511bcbe2997eca363e03ddedea177, head461eac25f6988abde31ae91d4c643a4a44f7f04d, binary diffSHA25667cc8ac5825fa79344f578e5ecf36b92d9743169e159dc5cdb5da017b99caf40.
- Isolated offline dependency install corrected initially reused cross-worktree private-type declarations. Viewer tsc --noEmit and changed-file eslint PASS. Copied canonical unchanged agent dist for focused resolver test imports; this is not full-build evidence.
- Performed mutations: remove each requested onInBoth membership independently; flip each corresponding base features bit false independently. All4 AssertionError failures; restoration22PASS. Receipt canonical ignored runs/reviews/context-growth-audit/mutations.json and named logs.
- Claude independent review VERDICT: LGTM. Grok Cursor exit1 ActionRequiredError out of usage, not approval. GPT initial review blocked only on absent performed per-field mutation evidence; receipts supplied for re-review. No self-merge without all required lanes or operator waiver. Grok waiver requested through native question; not yet granted.
- CPU START requested through Claude relay; no grant received yet. Full build/test/lint/vendor and landing/post-main checks remain pending. No board slot held, no main edits, no runtime refresh, no gameplay launch.
- Report-only audit delivered at [private proxy URL] actual HTTPS bytes match local artifact, HTTP200. pages-theme/pages-check clean. Headless375/1280/1440 screenshots inspected: no horizontal overflow/clipping. Main report547words; data/source inventory linked. Four selected recordings carry SHA256, exact maxima seq/turn and actual flags. No causal efficacy claim; no new inference calls.
