# Accepted-name comparison

This preparation supports the operator's approved exploratory comparison: three discovered model lanes, four fresh-boot trials per arm per lane (24 total), native `PLAYER_NAME_CONFIRMED`, and a 600,000 ms gameplay budget. The passive arm records all five loop detectors; the enforced arm also delivers warnings and stops persistent loops. Both arms retain the same reviewed executable, contextual interface documentation, active UI, objective tracking, instrumentation, turn/retry limits and sampling. This is a composite loop-guard comparison, not attribution to an individual detector.

Completion loss tolerance is zero. A possible speed improvement requires at least the same number of accepted names and a median at least 10% faster among completers. Report completion counts, failures and ranges beside medians. Four trials per arm are exploratory; the supervisor makes no promotion decision. A naming result establishes the naming frontier only. Future feature hill climbing needs its own frozen cohort and downstream confirmation; never change a measured cohort or replace failures.

## Frozen preparation

The compiled entrypoint is `packages/agent/dist/serial-comparison-cli.js`:

```
node packages/agent/dist/serial-comparison-cli.js prepare /absolute/path/manifest.json
node packages/agent/dist/serial-comparison-cli.js execute /absolute/path/manifest.json
```

`prepare` strictly validates and freezes the manifest with exclusive creation at `runs/launch-receipts/<id>/manifest.json`. It starts no child, game server or model inference and does not claim qualification. `execute` requires identical frozen bytes, then rechecks qualification and artifact identities before each child. Preparing code is not permission to execute this cohort.

The version 1 manifest contains:

- `id`, canonical absolute `repoRoot`, clean `sourceCommit`, and `build` identifying normal `packages/agent/dist/live.js` bytes and the complete dist tree SHA-256.
- `presets.diagnostic` and `presets.enforced`, each an absolute JSON path and SHA-256. Strict presets must target accepted name, use 300 turns, 600,000 ms and failure limit 3, and enable the common interface/objective flags. Semantically compare all settings apart from preset ID and `loopGuard`; object key order is immaterial.
- Exactly three distinct discovered `lanes`: arbitrary lane ID, actual model ID, credential-free gateway URL, nullable private `endpointFile` artifact (path and SHA-256), common `configurationSha256`, and three hash-bound artifacts: `serving`, `environment`, `imageTool`. Private credentials are never argv or manifest fields.
- Fixed `criteria` of `completionLossTolerance: 0` and `medianSpeedGain: 0.1`, and the exact 24 `trials` returned by `counterbalancedTrials(id, laneIds)`. Each round alternates arms by lane, then reverses, and the next round reverses its starting arm. Each lane receives four trials per arm; no model SKU is hardcoded.

Each qualification artifact is strict JSON: `{version: 1, kind: "serving" | "environment" | "image-tool", qualified: true, model, gatewayUrl, sourceCommit, validUntil, configurationSha256, evidence}`. All three must match the manifest lane's exact model, gateway, source and configuration digest, and remain within their declared validity bound at every launch. `evidence` names the actual supporting qualification receipt; it cannot be empty. Its bytes and the receipt content are bound, but this supervisor does not independently measure running model residency, memory pressure or image/tool correctness. Operator qualification must obtain those actual receipts and ensure other gameplay is idle. Metadata alone cannot qualify them. No automatic load, unload or service restart is implemented.

## Serial execution and retained evidence

The filesystem host owns one exclusive `runs/.naming-gameplay.lock` across participating supervisors. It launches the normal play executable with argv `[live.js, "play"]`, an assigned unique `POKEBENCH_RUN_ID`, strict `POKEBENCH_PLAY_PRESET`, explicit discovered endpoint/model configuration and an isolated loopback game port. The canonical play path produces ordinary run events and frames under the main repo's `runs`, so the viewer sees trials as normal live runs. The lock does not intercept unrelated manual gameplay; that remains an explicit operator/resource admission gate. Existing unrelated serving processes are preserved.

Before spawn, a fsynced append-only launch row records manifest digest and run ID. After the owned child exits, an outcome row records exit code, actual terminal reason and events SHA-256. Model errors and other valid unsuccessful terminal runs remain in the cohort. Safe infrastructure codes (`spawn_error`, `event_missing`, `event_invalid`, `child_nonzero`, `timed_out`, `launcher_error`) retain the failure category without serializing raw exception messages that might contain credentials. An infrastructure failure stops the cohort; no hidden rerun replaces it. Per-trial stdout/stderr files are retained with owner-only permissions in the receipt directory.

The child event stream must be schema-valid, single-run and consecutive, with one start and one final end. Start metadata must match assigned run/model/source, fresh boot, isolation path and selected preset's target, effective flags, sampling, caps and failure limit. A milestone end additionally requires the exact observed native accepted-name marker and its latest positive RAM-state evidence. Local model claims and present-at-start markers do not qualify success.

The recorded run wall cap is 10 minutes, anchored at run_start. Initial capture consumes that same budget: a 15-second initial capture leaves 585,000 ms, and capture reaching the cap ends with budget before starting the model loop. An outer watchdog allows 180 seconds for initial game health and 60 seconds for teardown, for 840,000 ms total before signalling the owned child. It sends SIGINT, waits at most 30 seconds, then SIGTERM and, after another second if needed, SIGKILL to that same child. A watchdog-triggered exit is infrastructure failure even if a terminal event exists. It never broadly kills a detached game server or production model process. If cleanup is uncertain, inspect preserved process/run evidence before any later execution.

Resume accepts only the exact completed prefix of launch/outcome pairs for this manifest, with valid timestamps and qualified terminal digests. It rejects a dangling launch, wrong manifest, out-of-order identity, malformed row, infrastructure failure or existing next run directory. Reconciliation is explicit; never infer that an incomplete launch did not count or retry it silently.

## Verification boundaries

M2 tests use injected supervisor seams and real filesystem locks, artifact files and tiny test-owned Node children. They exercise actual child argv, emitted events, output files, watchdog signals, resume and immutable preparation. They do not start Pokémon, native game servers or model inference. Nine performed delete/restore checks cover source cleanliness, full build digest, one-factor presets, receipt configuration, exclusive locking, child flags, native positive evidence, watchdog classification and resume digest. Native target delivery and normal play production wiring are verified by M1; live three-lane resource/image/tool qualification remains a separate launch gate.
