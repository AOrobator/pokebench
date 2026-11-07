#!/bin/zsh
# Launch one ordinary play run, detached, from the main checkout.
#
#   launch.sh --meta runs/<meta-dir> --model <model id> [--preset <file>]
#             [--endpoint <file>] [--commit <sha>] [--record [--backup <folder>]]
#             [--definition <fixed id> [--arm <control|bundle>]]
#
# --definition resolves that experiments/fixed definition's arm to runs/<meta>/preset.json at launch,
# so the run follows its recipe pointer (for example current) instead of a frozen preset.
# --record starts pokebench_env.recorder first, detached, so the run's picture and sound go to
# runs/<meta>/recording/ from the first frame. It only reads from the game server.
#
# Always works from the main checkout. A plain run always takes the default game port, 8000:
# frozenPlay keeps another run's port out of the child, so no other port can be asked for here. Refuses before starting anything when: the preset does not
# parse, the endpoint file is missing or not loopback, the port is already taken, or the commit is
# not in this repo. Writes runs/<meta>/launch.receipt.json and a log under runs/<meta>/logs/.
set -euo pipefail
cd "$HOME/dev/pokebench"

META=""; PORT="8000"
PRESET="$PWD/experiments/presets/current-control-24h-8k.json"
MODEL=""
ENDPOINT="$PWD/runs/orca-deepseek-control-24h/endpoint.json"
COMMIT=""
RECORD=0
DEFINITION=""
ARM=()
BACKUP=""
while (( $# )); do
  case "$1" in
    --meta) META="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --endpoint) ENDPOINT="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --record) RECORD=1; shift ;;
    --backup) BACKUP="$2"; shift 2 ;;
    --definition) DEFINITION="$2"; shift 2 ;;
    --arm) ARM=(--arm "$2"); shift 2 ;;
    *) echo "launch: unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -n "$META" ]] || { echo "launch: --meta is required" >&2; exit 2; }
[[ -n "$MODEL" ]] || { echo "launch: --model is required" >&2; exit 2; }
# The pin must exist here; the frozen checkout is a worktree of this repo, and prepareFixedTree
# compares the checkout's `rev-parse HEAD` against this exact string, so a short sha would fail.
COMMIT=$(git rev-parse --verify "${COMMIT:-HEAD}^{commit}" 2>/dev/null) || { echo "launch: ${COMMIT:-HEAD} is not a commit in this repo" >&2; exit 2; }
if [[ -n "$DEFINITION" ]]; then
  mkdir -p "$META"
  just build >/dev/null
  PRESET="$PWD/$META/preset.json"
  [[ "$META" == /* ]] && PRESET="$META/preset.json"
  node packages/viewer/dist/fixed-cli.js preset "$DEFINITION" "${ARM[@]}" >"$PRESET"
fi
[[ -f "$PRESET" ]] || { echo "launch: preset $PRESET does not exist" >&2; exit 2; }
[[ -f "$ENDPOINT" ]] || { echo "launch: endpoint file $ENDPOINT does not exist" >&2; exit 2; }
python3 - "$PRESET" "$ENDPOINT" <<'PY'
import json, sys, urllib.parse
preset, endpoint = (json.load(open(p)) for p in sys.argv[1:3])
assert isinstance(preset.get("features"), dict) and isinstance(preset.get("limits"), dict), "preset has no features/limits"
assert isinstance(preset.get("sampling"), dict), "preset has no sampling"
url = urllib.parse.urlparse(endpoint["base_url"])
assert url.scheme == "http" and url.hostname == "127.0.0.1", "endpoint base_url must be loopback http"
assert endpoint.get("api_key"), "endpoint carries no api_key"
PY
# A taken port means some run owns it: never start on top of one.
if lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "launch: port $PORT is taken" >&2; exit 2
fi

mkdir -p "$META/logs"
set -a; source .env; set +a
export POKEBENCH_MODEL="$MODEL"
export POKEBENCH_ENDPOINT_FILE="$ENDPOINT"
export POKEBENCH_PLAY_PRESET="$PRESET"
export POKEBENCH_CHECKPOINT_FRONTIER=1
unset POKEBENCH_GATEWAY_URL POKEBENCH_RUN_ID POKEBENCH_GAME_SERVER_URL

STAMP=$(date +%Y%m%dT%H%M%S)
LOG="$META/logs/play-$STAMP.log"
PIDFILE="$META/logs/play-$STAMP.pid"
RECORDER_PID=0
if (( RECORD )); then
  PYTHONPATH="$PWD/env" nohup env/.venv/bin/python -m pokebench_env.recorder --supervise --wait 3600 --port "$PORT" --out "$META/recording" >"$META/logs/recorder-$STAMP.log" 2>&1 < /dev/null &
  RECORDER_PID=$!
  disown
  if [[ -n "$BACKUP" ]]; then
    MODEL_GLOB="*_${MODEL//\//-}_*"
    nohup scripts/recording-backup.sh "$META/recording" "$PWD/runs" "$MODEL_GLOB" "$BACKUP" "$RECORDER_PID" >"$META/logs/backup-$STAMP.log" 2>&1 < /dev/null &
    disown
  fi
fi
nohup just run-agent --commit "$COMMIT" >"$LOG" 2>&1 < /dev/null &
echo "$!" | tee "$PIDFILE"
disown

python3 - "$META/launch.receipt.json" "$COMMIT" "$PRESET" "$MODEL" "$ENDPOINT" "$PORT" "$(cat "$PIDFILE")" "$LOG" "$RECORDER_PID" <<'PY'
import json, sys, datetime
receipt, commit, preset, model, endpoint, port, pid, log, recorder = sys.argv[1:10]
json.dump({"pin": commit, "preset": preset, "model": model, "endpoint": endpoint, "port": int(port),
           "launcher_pid": int(pid), "log": log, "recorder_pid": int(recorder),
           "started": datetime.datetime.now().astimezone().isoformat(timespec="seconds")},
          open(receipt, "w"), indent=1)
PY
echo "launch: pinned $COMMIT, port $PORT, launcher pid $(cat "$PIDFILE")"
echo "launch: log $LOG"
