#!/bin/zsh
# Run an already-built pinned harness against an independently owned model endpoint.
set -euo pipefail

prepare=0
if [[ ${1:-} == --prepare ]]; then
  prepare=1
  shift
fi
if (( ($prepare && $# != 2) || (!$prepare && $# != 3) )); then
  echo "usage: launch-pinned.sh [--prepare] <detached checkout> <full commit SHA> [<receipt directory>]" >&2
  exit 2
fi
runtime=${1:A}
pin=$2
if (( !prepare )); then
  receipt=${3:A}
fi
cd "$runtime"
if [[ "$(git rev-parse HEAD)" != "$pin" || -n "$(git status --porcelain)" ]] || git symbolic-ref -q HEAD >/dev/null; then
  echo "launch-pinned: expected a clean detached checkout at $pin" >&2
  exit 2
fi
agent="$runtime/packages/agent/dist/live.js"
stamp="${agent:h}/.fixed-tree"
python="$runtime/env/.venv/bin/python"
# Match the fixed-run source identity and build stamp.
sources=$(git ls-tree --full-tree "$pin" -- packages/agent env package.json pnpm-lock.yaml pnpm-workspace.yaml | shasum -a 256)
expected="$pin ${sources%% *}"
if [[ ! -f "$stamp" || "$(<"$stamp")" != "$expected" || ! -f "$agent" || ! -x "$python" ]]; then
  if (( !prepare )); then
    echo "launch-pinned: missing build for $pin; prepare the detached checkout first" >&2
    exit 2
  fi
  (cd env && "$python" -c 'import mgba.core')
  (cd packages/agent && node node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmitOnError)
  [[ -f "$agent" && -z "$(git status --porcelain)" && "$(git rev-parse HEAD)" == "$pin" ]]
  printf '%s\n' "$expected" >"$stamp"
fi
if (( prepare )); then
  exit 0
fi
: "${POKEBENCH_RUN_ID:?Set the reserved run ID}"
: "${POKEBENCH_RUNS_ROOT:?Set the absolute runs root}"
: "${POKEBENCH_GAME_SERVER_URL:?Set the reserved game URL}"
: "${POKEBENCH_PLAY_PRESET:?Set the authorized preset path}"
: "${POKEBENCH_ROM:?Set the ROM path}"
: "${POKEBENCH_MODEL:?Set the discovered model ID}"

if [[ -n ${POKEBENCH_CAMPAIGN_CONTINUATION:-} ]]; then
  echo "launch-pinned: absolute-deadline campaign continuations use their own launcher" >&2
  exit 2
fi
if [[ "$POKEBENCH_RUNS_ROOT" != /* || "$POKEBENCH_PLAY_PRESET" != /* || "$POKEBENCH_ROM" != /* ]]; then
  echo "launch-pinned: runs root, preset and ROM must be absolute paths" >&2
  exit 2
fi
if [[ ! "$POKEBENCH_RUN_ID" =~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' || -e "$POKEBENCH_RUNS_ROOT/$POKEBENCH_RUN_ID" ]]; then
  echo "launch-pinned: run ID must be valid and unused" >&2
  exit 2
fi
if [[ ! "$POKEBENCH_GAME_SERVER_URL" =~ '^http://127[.]0[.]0[.]1:([0-9]{1,5})$' ]]; then
  echo "launch-pinned: expected an explicit loopback game port" >&2
  exit 2
fi
port=$match[1]
if (( 10#$port < 1024 || 10#$port > 65535 )) || lsof -nP -t -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "launch-pinned: game port $port is invalid or taken" >&2
  exit 2
fi
if [[ ! -r "$POKEBENCH_PLAY_PRESET" || ! -r "$POKEBENCH_ROM" ]]; then
  echo "launch-pinned: missing preset or ROM" >&2
  exit 2
fi
mkdir "$receipt/play"
printf '%s\n' "$pin" >"$receipt/play/commit"
printf '%s\n' "$POKEBENCH_RUN_ID" >"$receipt/play/run-id"
export POKEBENCH_CHECKPOINT_FRONTIER=${POKEBENCH_CHECKPOINT_FRONTIER:-1}
# The recorded PID is the agent itself. The agent owns the extendable wall budget.
nohup node "$agent" play >"$receipt/play/agent.log" 2>&1 </dev/null &
pid=$!
disown
printf '%s\n' "$pid" >"$receipt/play/pid"
printf 'launch-pinned: %s, agent pid %s\n' "$POKEBENCH_RUN_ID" "$pid"
