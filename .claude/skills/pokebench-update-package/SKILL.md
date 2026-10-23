---
name: pokebench-update-package
description: Build or refresh a PokeBench ZIP evidence packet for ChatGPT or another external reviewer, including actual agent traces, source pins, native RAM samples, analysis and open questions. Use for update-package requests, not ordinary run summaries or gameplay launches.
---

# PokeBench evidence update package

Produce a self-contained local ZIP that lets a reviewer investigate, not merely read our conclusions. Creating a packet does not authorize uploading it, restarting services, altering gameplay, changing a bundle or merging code.

## Establish the update

- Read the checkout's rules and relevant existing report. Find earlier packets in the report directory and the operator's Desktop; inspect their member inventory and review/transcript context rather than guessing their format. Reuse only ended-run analyses whose evidence is unchanged.
- Record the requested scope, New York snapshot time, source/build/serving identities, start kinds and context policy. Keep New Game, checkpoint clocks and accumulated model state distinct. Preserve original population denominators; a partially loaded viewer catalog is not a smaller population.
- For new causal or regression analysis, follow the repository's run-analysis and trace-forensics skills. Compare common event boundaries, show failures and fixed-horizon milestone success rates, and distinguish measured facts, verified harness bugs, hypotheses and untested fixes. Source landing, deployment and measured recovery are different claims.
- For every costly failure, map existing switches from exact source and run receipts: ON/OFF/unknown, intended mechanism, delivery/action/state evidence, uncovered boundary, existing repair versus proposed new switch, cheapest falsification test. An ON safeguard is not proof of coverage or effectiveness. Never infer OFF from absent historical metadata.

## Evidence and questions

Read [references/evidence-contract.md](references/evidence-contract.md) before selecting artifacts or building the archive. Use an explicit selection manifest, not an unrestricted repository or home-directory ZIP.

Prepare ten open questions grounded in the evidence unless the user requests a different number. Show the actual questions in chat and request approval before external sharing. Mark interim ZIPs DRAFT and record approval as false; do not silently treat a prior permission to create a ZIP as permission to send it.

Keep an existing packet recoverable and build a new version. Prefer adapting the previous build script to the new explicit evidence selection. Avoid rebuilding large archives repeatedly: finish narrative/review revisions first. Run packaging at low priority while gameplay is active.

## Verify and hand off

- Verify every payload's bytes against its manifest and source receipt. Recheck terminal trace stability, selected native RAM through the production loader with a matching external ROM, exact source pins, safe ZIP paths, and omission of credentials/ROM/BIOS. Do not claim exhaustive RAM or screenshots when selection/pruning makes them incomplete.
- For packets using the current `MANIFEST.json` format, run `python3 .claude/skills/pokebench-update-package/scripts/audit_zip.py /absolute/path/update.zip --min-traces N --min-native-ram M` using the selection's declared minimums (defaults require at least one of each). The inventory/hash audit does not establish stream completeness, native RAM semantics, source freshness, question approval, privacy review or scientific validity; check those separately against receipts.
- Reopen the ZIP and spot-check the latest analysis, questions, an actual event stream, actual compressed RAM and source—not just metadata counts. Report ZIP size, SHA256, trace/frame/RAM counts, coverage limits and outstanding approvals. Link the actual ZIP, not only its directory.
- If an HTML report changed, render/check/serve it and visually verify the affected section under the repository's page-proof rules. Skill validation and a successful ZIP wrapper do not certify the report's conclusions.
- Keep build/validation receipts beside the ZIP. State separately: created, hash-verified, questions approved, sent, and sent-to destination. Stop at the user's requested approval boundary.
