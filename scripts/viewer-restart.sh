#!/usr/bin/env bash
# Restart the viewer on 127.0.0.1:<port> from a built cli.js without interrupting any run.
# Runs are detached from the viewer, and the new viewer adopts the trial in flight; this
# fails if any gameplay process that was alive before the restart is gone after it.
# usage: viewer-restart.sh <cli.js> <port> <runs dir> <env file> <log file>
set -euo pipefail

cli="$1" port="$2" runs="$3" envfile="$4" log="$5"
plays() { pgrep -f 'agent/dist/live\.js (play|human)' || true; }

before="$(plays)"
for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN || true); do kill -TERM "$pid" 2>/dev/null || true; done
for _ in $(seq 20); do lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null || break; sleep 0.5; done
if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null; then echo "the old viewer still holds $port" >&2; exit 1; fi

nohup node --env-file="$envfile" "$cli" --port "$port" --runs "$runs" >"$log" 2>&1 &
child=$!
up=""
for _ in $(seq 40); do
    if [[ "$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)" == "$child" ]] && curl -fs "http://127.0.0.1:$port/api/experiments" >/dev/null; then up=yes; break; fi
    sleep 0.5
done
if [[ -z "$up" ]]; then echo "viewer did not answer on $port; see $log" >&2; exit 1; fi

lost=""
for pid in $before; do kill -0 "$pid" 2>/dev/null || lost="$lost $pid"; done
if [[ -n "$lost" ]]; then echo "gameplay process(es)$lost did not survive the restart" >&2; exit 1; fi
echo "viewer on 127.0.0.1:$port; $(echo "$before" | grep -c . || true) live gameplay process(es) kept running"
