#!/bin/sh
# Detached, LLM-free whole-map loop: round after round of `just fixed-run dry-run whole-map-pair-2h`
# (bundle + full-map-navigation-v1 vs control, 2 hour cap) on latest main, until the operator stops it.
# A round is the dry-run plan: two pairs back to back, each GPU lane playing each arm once.
#
# Stopping: a viewer STOP or ABORT on any run this loop launched stops the loop, not just that run.
# The loop writes STOP_FILE, signals the round's runner so no new trial starts (a trial already
# playing keeps going to its cap) and exits. Touching STOP_FILE by hand does the same. While
# STOP_FILE exists the loop refuses to start; delete it to run again. PAUSE_FILE holds the next round.
#
# Never collides: a round starts only when no other runner holds a gameplay lease on this
# definition's model pools and its game ports are free. Frames are never pruned; above
# FRAME_LIMIT percent of the cap the loop holds until the cap is raised.
#
# Run a copy, so a merge that rewrites this file cannot change the running loop:
#   cp scripts/whole-map-loop.sh runs/dryruns/whole-map-loop-run.sh
#   nohup runs/dryruns/whole-map-loop-run.sh >> runs/dryruns/whole-map-loop.log 2>&1 &
set -u

REPO=${REPO:-$HOME/dev/pokebench}
JUST=${JUST:-just}
EXP_ID=${EXP_ID:-whole-map-pair-2h}
PHASE=${PHASE:-cook}
WALL_MS=${WALL_MS:-7200000}
RUNS=${RUNS:-$REPO/runs}
LEDGER_DIR=$RUNS/experiments/$EXP_ID-dryrun-$PHASE
ARCHIVE=${ARCHIVE:-$RUNS/dryruns}
STOP_FILE=${STOP_FILE:-$ARCHIVE/whole-map-loop.STOP}
PAUSE_FILE=${PAUSE_FILE:-$ARCHIVE/whole-map-loop.PAUSE}
MAIN_WT=${MAIN_WT:-/private/tmp/pokebench-whole-map-loop-main}  # its own clone of main: fixed-run pins the primary checkout's HEAD
MAX_FAILS=${MAX_FAILS:-6}           # consecutive failed rounds before giving up
RETRY_SLEEP=${RETRY_SLEEP:-300}
POLL=${POLL:-10}
STOP_POLL=${STOP_POLL:-2}       # in-round stop check; a stopped trial is invalid, so its lane backs off 30 s before the next
MIN_ROUND_S=${MIN_ROUND_S:-600}     # a round shorter than this did not really run
FRAME_LIMIT=${FRAME_LIMIT:-75}      # runs may start at or below this frame-cap percent
VIEWER_CMD=${VIEWER_CMD:-just viewer-main}  # a viewer older than the pin cannot read the new runs

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') whole-map-loop: $*"; }

stopped() { [ -e "$STOP_FILE" ]; }
stop_loop() {
  [ -e "$STOP_FILE" ] && return 0
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1" > "$STOP_FILE"
  log "stopping the loop: $1"
}

launched_runs() {
  [ -f "$LEDGER_DIR/trials.jsonl" ] || return 0
  grep '"kind":"launch"' "$LEDGER_DIR/trials.jsonl" | sed -n 's/.*"run":"\([^"]*\)".*/\1/p'
}
launched_arms() {
  [ -f "$LEDGER_DIR/trials.jsonl" ] || return 0
  grep '"kind":"launch"' "$LEDGER_DIR/trials.jsonl" | sed -n 's/.*"lane":"\([^"]*\)".*"arm":"\([^"]*\)".*"run":"\([^"]*\)".*/\2 on lane \1 (\3)/p' | tr '\n' ';'
}
valid_count() {
  if [ -f "$LEDGER_DIR/trials.jsonl" ]; then grep '"kind":"outcome"' "$LEDGER_DIR/trials.jsonl" | grep -c '"valid":true' || true; else echo 0; fi
}

# The operator stopped this run from the viewer: an abort request (it cannot be withdrawn), an applied
# stop or abort, or an operator run_end. A pending STOP the operator may still cancel does not count.
operator_stopped() {
  dir=$RUNS/$1
  [ -f "$dir/control.jsonl" ] && grep -q '"action":"abort"' "$dir/control.jsonl" && return 0
  [ -f "$dir/events.jsonl" ] || return 1
  grep '"type":"operator_control"' "$dir/events.jsonl" | grep '"status":"applied"' | grep -qE '"action":"(stop|abort)"' && return 0
  grep '"type":"run_end"' "$dir/events.jsonl" | grep -qE '"reason":"operator_(stop|abort)"'
}
stopped_run() {
  for run in $(launched_runs); do
    if operator_stopped "$run"; then echo "$run"; return 0; fi
  done
  return 1
}

definition() { echo "$REPO/experiments/fixed/$EXP_ID.json"; }
lease_pools() { jq -r '.lanes[].modelUrl' "$(definition)" | sed -e 's#^[a-z]*://##' -e 's#/.*##' | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9.][^a-z0-9.]*/-/g'; }
game_ports() { jq -r '.lanes[].gamePort' "$(definition)"; }
alive() { [ -n "$1" ] && [ "$1" != null ] && kill -0 "$1" 2>/dev/null; }

# Who keeps this definition's lanes busy: a live lease owner or child, or a game port in use.
lanes_busy() {
  pools=$(lease_pools 2>/dev/null); ports=$(game_ports 2>/dev/null)
  if [ -z "$pools" ] || [ -z "$ports" ]; then echo "cannot read the lanes of $(definition)"; return 0; fi
  # A live runner may release its leases between trials (backoff, a finished lane) yet still owe trials.
  for status in "$RUNS"/experiments/*/status.json; do
    [ -f "$status" ] || continue
    pid=$(jq -r '.pid // empty' "$status" 2>/dev/null)
    alive "$pid" && ps -o command= -p "$pid" | grep -q 'fixed-cli' || continue
    for port in $(jq -r '.lanes[].port' "$status" 2>/dev/null); do
      if echo "$ports" | grep -qx "$port"; then echo "runner $pid of $(jq -r '.experiment' "$status") still owns game port $port"; return 0; fi
    done
  done
  for pool in $pools; do
    owner=$RUNS/.naming-gameplay.$pool.lock/owner.json
    [ -f "$owner" ] || continue
    pid=$(jq -r '.pid // empty' "$owner" 2>/dev/null); child=$(jq -r '.child // empty' "$owner" 2>/dev/null)
    if alive "$pid" || alive "$child"; then echo "the $pool lease is held by $(jq -r '.owner' "$owner" 2>/dev/null)"; return 0; fi
  done
  for port in $ports; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "game port $port is in use"; return 0; fi
  done
  return 1
}

# Read in the loop's own clone, never building the operator's checkout; its runs/ is the shared store.
frame_percent() { ( cd "$MAIN_WT" && "$JUST" runs-disk ) 2>/dev/null | sed -n 's/.*cap (\([0-9]*\)%).*/\1/p' | tail -1; }

# Wait while $1 is true; give up the wait (status 1) as soon as the loop is stopped.
hold() {
  said=
  while why=$("$@"); do
    if run=$(stopped_run); then stop_loop "the operator stopped run $run in the viewer"; fi
    if stopped; then return 1; fi
    if [ "$said" != "$why" ]; then log "holding: $why"; said=$why; fi
    sleep "$POLL"
  done
  [ -z "$said" ] || log "no longer holding"
  ! stopped
}
paused() { [ -e "$PAUSE_FILE" ] && echo "$PAUSE_FILE exists"; }
frames_full() {
  pct=$(frame_percent)
  if [ -z "$pct" ]; then echo "cannot read frame usage from just runs-disk in $MAIN_WT"; return 0; fi
  [ "$pct" -gt "$FRAME_LIMIT" ] && echo "frames at ${pct}% of the cap, above the ${FRAME_LIMIT}% start limit (never pruned: raise the cap)"
}

runner_pid() {
  pid=$(jq -r '.pid // empty' "$LEDGER_DIR/status.json" 2>/dev/null)
  if alive "$pid" && ps -o command= -p "$pid" | grep -q 'fixed-cli'; then echo "$pid"; fi
}

cd "$REPO" || { log "cannot cd $REPO"; exit 1; }
mkdir -p "$ARCHIVE" "$(dirname "$STOP_FILE")" || { log "cannot create $ARCHIVE"; exit 1; }
if stopped; then log "$STOP_FILE exists ($(cat "$STOP_FILE")); delete it to run the loop"; exit 0; fi
[ -f "$(definition)" ] || { log "no definition $(definition) on this checkout"; exit 1; }
log "started (pid $$): $EXP_ID, phase $PHASE, ${WALL_MS} ms cap; stop with a viewer STOP/ABORT on any loop run or touch $STOP_FILE"

fails=0
round=0
viewer_pin=
while :; do
  if [ "$fails" -ge "$MAX_FAILS" ]; then log "$fails rounds in a row failed; giving up"; exit 1; fi
  hold paused || break
  hold lanes_busy || break
  round=$((round + 1))

  if [ -d "$LEDGER_DIR" ]; then
    dest="$ARCHIVE/$(basename "$LEDGER_DIR")-$(date +%Y%m%dT%H%M%S)"
    mv "$LEDGER_DIR" "$dest" || { log "cannot move $LEDGER_DIR aside; giving up"; exit 1; }
    log "moved the previous ledger to $dest"
  fi

  pin=$(git rev-parse main) || { log "round $round: cannot resolve main; giving up"; exit 1; }
  if [ "$pin" != "$viewer_pin" ]; then
    if $VIEWER_CMD >/dev/null 2>&1; then log "round $round: viewer restarted at main"; viewer_pin=$pin; else log "round $round: viewer restart failed (runs still launch)"; fi
  fi
  if [ ! -d "$MAIN_WT/.git" ]; then
    git clone --quiet --local "$REPO" "$MAIN_WT" || { log "round $round: cannot clone main; giving up"; exit 1; }
  fi
  git -C "$MAIN_WT" fetch --quiet "$REPO" "$pin" || { log "round $round: cannot fetch main $pin; giving up"; exit 1; }
  git -C "$MAIN_WT" checkout --quiet --detach "$pin" || { log "round $round: cannot check out main $pin; giving up"; exit 1; }
  ln -sfn "$REPO/.env" "$MAIN_WT/.env"
  ln -sfn "$RUNS" "$MAIN_WT/runs"
  ln -sfn "$REPO/env/.venv" "$MAIN_WT/env/.venv"
  if [ "$(cat "$MAIN_WT/.loop-pin" 2>/dev/null || true)" != "$pin" ]; then
    ( cd "$MAIN_WT" && pnpm install --frozen-lockfile >/dev/null ) || { log "round $round: pnpm install failed on main; giving up"; exit 1; }
    printf '%s\n' "$pin" > "$MAIN_WT/.loop-pin"
  fi

  hold frames_full || break
  if run=$(stopped_run); then stop_loop "the operator stopped run $run in the viewer"; fi
  if stopped || [ -e "$PAUSE_FILE" ] || lanes_busy >/dev/null; then round=$((round - 1)); continue; fi
  log "round $round: launching on main $(git rev-parse --short "$pin")"
  t0=$(date +%s)
  ( cd "$MAIN_WT" && exec "$JUST" fixed-run dry-run "$EXP_ID" --phase "$PHASE" --wall-ms "$WALL_MS" ) &
  job=$!
  signalled=
  while kill -0 "$job" 2>/dev/null; do
    if [ -z "$signalled" ]; then
      if run=$(stopped_run); then stop_loop "the operator stopped run $run in the viewer"; fi
      if stopped; then
        pid=$(runner_pid)
        if [ -n "$pid" ]; then kill -TERM "$pid" && log "round $round: asked runner $pid to start no new trials" && signalled=1; fi
      fi
    fi
    sleep "$STOP_POLL"
  done
  wait "$job"
  rc=$?
  took=$(( $(date +%s) - t0 ))
  n=$(valid_count)
  log "round $round: dry run finished, exit $rc, $n valid trial(s) in ${took}s: $(launched_arms)"
  if run=$(stopped_run); then stop_loop "the operator stopped run $run in the viewer"; fi
  if stopped; then break; fi

  if [ "$n" -ge 4 ] && [ "$took" -ge "$MIN_ROUND_S" ]; then
    fails=0
  else
    fails=$((fails + 1))
    log "round $round did not produce four valid trials (failure $fails of $MAX_FAILS); retrying in ${RETRY_SLEEP}s"
    i=0; while [ "$i" -lt "$RETRY_SLEEP" ] && ! stopped; do sleep 1; i=$((i + 1)); done
  fi
done
log "stopped after $round round(s): $(cat "$STOP_FILE" 2>/dev/null)"
