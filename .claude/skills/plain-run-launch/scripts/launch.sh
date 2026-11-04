#!/bin/zsh
# Launch one ordinary play run, detached, from the main checkout.
#
#   launch.sh --meta runs/<meta-dir> [--port 8000] [--preset <file>]
#             [--model deepseek/deepseek-v4.1-flash] [--endpoint <file>] [--commit <sha>]
#
# Refuses before starting anything when: the repo is not the main checkout, the preset does not
# parse, the endpoint file is missing or not loopback, the port is already taken, or the commit is
# not in this repo. Writes runs/<meta>/launch.receipt.json and a log under runs/<meta>/logs/.
set -euo pipefail
cd "$HOME/dev/pokebench"

META=""; PORT="8000"
PRESET="$PWD/experiments/presets/current-control-24h-8k.json"
MODEL="deepseek/deepseek-v4.1-flash"
ENDPOINT="$PWD/runs/orca-deepseek-control-24h/endpoint.json"
COMMIT=""
while (( $# )); do
  case "$1" in
    --meta) META="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --endpoint) ENDPOINT="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    *) echo "launch: unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -n "$META" ]] || { echo "launch: --meta is required" >&2; exit 2; }
# The pin must exist here; the frozen checkout is a worktree of this repo, and prepareFixedTree
# compares the checkout's `rev-parse HEAD` against this exact string, so a short sha would fail.
COMMIT=$(git rev-parse --verify "${COMMIT:-HEAD}^{commit}" 2>/dev/null) || { echo "launch: ${COMMIT:-HEAD} is not a commit in this repo" >&2; exit 2; }
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
export POKEBENCH_GAME_SERVER_URL="http://127.0.0.1:$PORT"
export POKEBENCH_CHECKPOINT_FRONTIER=1
unset POKEBENCH_GATEWAY_URL POKEBENCH_RUN_ID

STAMP=$(date +%Y%m%dT%H%M%S)
LOG="$META/logs/play-$STAMP.log"
PIDFILE="$META/logs/play-$STAMP.pid"
nohup just run-agent --commit "$COMMIT" >"$LOG" 2>&1 < /dev/null &
echo "$!" | tee "$PIDFILE"
disown

python3 - "$META/launch.receipt.json" "$COMMIT" "$PRESET" "$MODEL" "$ENDPOINT" "$PORT" "$(cat "$PIDFILE")" "$LOG" <<'PY'
import json, sys, datetime
receipt, commit, preset, model, endpoint, port, pid, log = sys.argv[1:9]
json.dump({"pin": commit, "preset": preset, "model": model, "endpoint": endpoint, "port": int(port),
           "launcher_pid": int(pid), "log": log,
           "started": datetime.datetime.now().astimezone().isoformat(timespec="seconds")},
          open(receipt, "w"), indent=1)
PY
echo "launch: pinned $COMMIT, port $PORT, launcher pid $(cat "$PIDFILE")"
echo "launch: log $LOG"
