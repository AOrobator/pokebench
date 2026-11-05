# Curriculum docs for the Rayquaza lane

Docs only: commit the game-knowledge curriculum, the just-in-time lesson and keepingiticy companions under `docs/curriculum/`. Requested by the operator 2026-11-05. Text relayed by the coordinator from the project files.

## Provenance

- `game-knowledge-curriculum.md`: relayed text matched sha256 prefix 6101f8e947ab29ff before the status note was added.
- `lesson-just-in-time-knowledge.md`: relayed text matched 4cb99e04199ebfdd, then four coordinator-approved fixes.
- `keepingiticy-video/master-ball.md`: matched 6ff0cd203ce571bd.
- `curriculum-additions.md`, `path-compare-summary.md`, `rng-explained.md`: relayed verbatim, no hash given.
- `findings.md`, `items.csv`, `splits.csv`: the Mac's `runs/keepingiticy-video/` copies, chosen over the project copies by the coordinator.
- `splits.csv` keeps its CRLF line endings; `.gitattributes` exempts CSVs from whitespace checks.

## Commits

- COMMIT: `docs(curriculum): add the game-knowledge curriculum and the just-in-time lesson` (142646361)

- COMMIT: `docs(curriculum): keep source CSV line endings out of whitespace checks` (8e508a6f0)

## Corrections

The lesson's grammar side finding was wrong and is rewritten: `tool-schema-dialect.ts` rewrites tuples for vLLM lanes; the rehearsal stub was not discovered as vLLM.

The operator 2026-11-05: lane runs stay on the frontier with a help marker, so the README no longer says they are off it. `custom-lane.ts` and the CLAUDE.md rule still exclude them; that change belongs to the lane plan.

## Gates

Prose-only: `git diff --check`, link check, independent review. No application gates.
