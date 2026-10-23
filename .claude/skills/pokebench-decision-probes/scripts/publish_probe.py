#!/usr/bin/env python3
"""Publish existing decision-probe files into PokeBench's read-only viewer registry."""
import argparse
import json
import os
from pathlib import Path
import re
import time

SAFE_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
VISIBLE_STATES = {'running', 'complete', 'stopped'}
SPLITS = {'development': 'development', 'heldout': 'heldout', 'new_evaluation': 'heldout'}


def read_json(path):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)  # Replace a display symlink itself, never its source.


def jailed(path, root):
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(root):
        raise ValueError(f'path leaves runs root: {path}')
    return resolved


def live_link(destination, source, root):
    if not source.exists():
        return
    source = jailed(source, root)
    if destination.is_symlink():
        if destination.resolve() != source:
            raise ValueError(f'refusing to replace another live link: {destination}')
        return
    if destination.exists():
        raise ValueError(f'refusing to overwrite an existing data file: {destination}')
    destination.symlink_to(os.path.relpath(source, destination.parent))


def first_sample_time(path):
    try:
        with path.open() as stream:
            line = stream.readline()
        value = json.loads(line)
        return value.get('at') if isinstance(value.get('at'), str) else None
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def publish(runs_root, source, probe_id, title):
    root = runs_root.resolve(strict=True)
    source = jailed(source, root)
    if not SAFE_ID.fullmatch(probe_id) or '..' in probe_id:
        raise ValueError('unsafe probe id')
    manifest = read_json(source / 'manifest.json')
    if not isinstance(manifest, dict) or not manifest.get('cases'):
        raise ValueError('source manifest must have cases')
    view = root / 'probe-ledgers' / probe_id
    view.mkdir(parents=True, exist_ok=True)
    jailed(view, root)
    if view == source or view.is_relative_to(source):
        raise ValueError('display projection must be separate from source data')
    cases = []
    for original in manifest['cases']:
        split = original.get('split')
        if split not in SPLITS:
            raise ValueError(f'unsupported display split: {split!r}')
        if not isinstance(original.get('turn'), int) or original['turn'] < 0:
            raise ValueError('case turn must be a nonnegative integer')
        if not isinstance(original.get('run'), str) or not SAFE_ID.fullmatch(original['run']):
            raise ValueError('unsafe source run id')
        cases.append({**original, 'split': SPLITS[split], 'sourceSplit': split})
    display = {**manifest, 'cases': cases, 'displayProjection': {
        'sourceDir': str(source.relative_to(root)),
        'splitPolicy': 'new_evaluation is displayed as heldout; reserved families are not sampled cases',
        'timingPolicy': 'started is actual first sample time; queuedAt preserves worker startup',
    }}
    atomic_json(view / 'manifest.json', display)
    discovered = [p.name for p in source.iterdir()
                  if p.is_dir() and not p.is_symlink() and SAFE_ID.fullmatch(p.name)
                  and (p / 'status.json').exists()]
    expected = manifest.get('gpuExecutors')
    lanes = sorted(set(expected if isinstance(expected, list) and expected else discovered))
    states = []
    for lane in lanes:
        if not isinstance(lane, str) or not SAFE_ID.fullmatch(lane):
            raise ValueError('unsafe lane id')
        lane_source = source / lane
        status_file = lane_source / 'status.json'
        raw = read_json(jailed(status_file, root)) if status_file.exists() else {}
        if not isinstance(raw, dict) or raw.get('fake') is True:
            continue
        destination = view / lane
        destination.mkdir(exist_ok=True)
        jailed(destination, root)
        actual = first_sample_time(jailed(lane_source / 'samples.jsonl', root)) if (lane_source / 'samples.jsonl').exists() else None
        native_state = raw.get('state', 'not_started')
        shown = native_state if native_state in VISIBLE_STATES else ('stopped' if native_state in {'incomplete', 'failed', 'aborted'} else 'unknown')
        status = {**raw, 'lane': lane, 'state': shown, 'sourceState': native_state,
                  'queuedAt': raw.get('started'), 'started': actual or raw.get('samplingStarted') or raw.get('started'),
                  'completed': raw.get('completed', 0),
                  'planned': raw.get('planned', manifest.get('plannedCallsPerExecutor', 0))}
        atomic_json(destination / 'status.json', status)
        for name in ['samples.jsonl', 'provenance.json']:
            live_link(destination / name, lane_source / name, root)
        states.append(status)
    if not states:
        raise ValueError('no real lanes discovered; create explicit lane status files before publishing')
    pointer = {'version': 1, 'dir': str(view.relative_to(root)), 'title': title}
    atomic_json(root / 'probes' / f'{probe_id}.json', pointer)
    return states


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runs-root', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--id', required=True)
    parser.add_argument('--title', required=True)
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--max-watch-seconds', type=int, default=14400)
    args = parser.parse_args()
    deadline = time.monotonic() + args.max_watch_seconds
    while True:
        states = publish(args.runs_root, args.source, args.id, args.title)
        print(json.dumps({'id': args.id, 'lanes': [{k: s.get(k) for k in ['lane', 'state', 'sourceState', 'completed', 'planned', 'started']} for s in states]}), flush=True)
        if not args.watch or all(s['state'] in {'complete', 'stopped'} for s in states):
            return
        if time.monotonic() >= deadline:
            raise SystemExit('Display publisher reached its time limit; source probes were not stopped.')
        time.sleep(3)


if __name__ == '__main__':
    main()
