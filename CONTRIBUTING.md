# Contributing to PokeBench

PokeBench is a research tool, and most of what it needs is evidence: runs that others can check, and reproductions of runs already reported. Code changes are welcome too, under the gates below.

## Submit a run

A run is worth adding to the [results ledger](docs/results.md) when someone else can check it.

1. **Record it with the harness.** Start it with `just run-agent` (or `just fixed-run` for a two-arm cohort) from a clean checkout, so its `run_start` names a harness commit that is not dirty. Runs started any other way are not comparable.
2. **Say what you set.** Give the model id, the endpoint kind (local server or gateway), the preset or flags, the start (boot or which checkpoint), and every limit you gave it (turns, wall time, stop milestone). A run ends only on those limits, native game completion, a model error, a crash, or your own stop; say which ended yours.
3. **Package the evidence.** Share the run folder's `events.jsonl`, its checkpoints and its final RAM snapshot, with a `SHA256SUMS` over them. Never include the ROM, a save made from it, or your `.env`.
4. **Open an issue** with the above and a link to the folder. A clear is checked with `just verify-release <folder>`, which reads the headline (game clear, badges, party) from the final RAM with nothing but the checker's own ROM.

Help the model had counts. A weight-edited model, a custom experiment or a knowledge switch makes a run a *custom lane*: it is listed, marked as heavily assisted, and never pooled with ordinary runs.

## Reproduce a run

Check out the harness commit the ledger lists for the run, use its preset and start, point it at the same model, and record a new run. Report it the same way, saying which run you reproduced and where yours differed (hardware, model quantization, endpoint, budget). A reproduction that falls short is as useful as one that matches.

## Change the code

```bash
just setup     # once per clone: git hooks and both stacks
just doctor    # read-only preflight; prints the fix for each miss
just lint      # tsc --noEmit, eslint, ruff, mypy
just test      # every suite once, coverage-instrumented, under the no-I/O guards
```

What a change needs before review:

- **Tests first, and no I/O in them.** Write the failing test, then the code. Tests may not touch disk, processes, the network, sockets or workers; the guards fail any that do, and `just no-io-proof` proves the guards still bite. Build new code so disk, processes, network and clocks arrive as injected dependencies behind a thin entrypoint.
- **Coverage floors hold.** `just test` fails under each suite's floor. Raise coverage with tests; never lower a floor or widen an exclude.
- **Behavior changes go behind a feature switch** whose off state is the previous behavior, so the change can be A/B tested. A change to the model's tools updates the system prompt in the same commit.
- **Concrete types.** No `any`; JSON from the model endpoint and the game server is validated into typed values. Subprocesses take argument lists, never shell strings.
- **The vendored game server stays unmodified.** `env/vendor/continual-harness` is pinned; `just verify-vendor` checks it. Change its behavior with PokeBench code instead.
- **The ROM never enters git.** The pre-commit hook refuses ROMs, saves and save states.

Review: every change is reviewed against `docs/agent-principles.md` and by independent reviewers before it lands. Expect findings to be argued on evidence: real bugs get fixed, and out-of-scope asks get a reason. Keep each change small enough to review in one sitting.

`CLAUDE.md`, `AGENTS.md` and `.claude/` are the operator's working files for the coding agents that build PokeBench. They describe this repository's workflow in detail and are a good map of its rules, but you do not need an agent to contribute.
