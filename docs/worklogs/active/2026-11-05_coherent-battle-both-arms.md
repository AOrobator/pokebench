# Coherent battle observation in both arms

The operator 2026-11-05: turn `coherent-battle-observation-v1` on in all lanes as a correctness fix. Config only; live runs keep their recorded features.

## Why it was off

Default off by design when it landed (worklog `2026-10-21_coherent-battle-observation.md`): reviewed, native proof that OFF gives a partial readout and ON restores party and damage. No open bug or regression is recorded. No recipe ever enabled it.

## Change

- `experiments/feature-configs/current.json`: onInBoth and base features.
- `experiments/presets/current-control-24h-8k.json`: explicit key.
- Astra presets are copied per launch outside the repo, so the owner must add the key at the next launch.

## Gates

Pending.
