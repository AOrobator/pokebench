#!/usr/bin/env bash
# Serve the viewer on 127.0.0.1:8790 from a clean, detached worktree at main, so it
# always knows every merged switch. The main checkout may carry other work in progress;
# this never builds there.
set -euo pipefail

root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
tree="${POKEBENCH_VIEWER_WORKTREE:-/private/tmp/pokebench-viewer}"
port=8790

if [[ -d "$tree" ]]; then
    git -C "$tree" checkout --quiet --detach main
else
    git -C "$root" worktree prune
    git -C "$root" worktree add --quiet --detach "$tree" main
fi
git -C "$tree" submodule update --init --quiet
(cd "$tree" && pnpm install --frozen-lockfile --silent && pnpm -r --silent build)

for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN || true); do kill "$pid" 2>/dev/null || true; done
for _ in $(seq 20); do lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null || break; sleep 0.5; done
if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null; then echo "the old viewer still holds $port" >&2; exit 1; fi

nohup node --env-file="$root/.env" "$tree/packages/viewer/dist/cli.js" --port "$port" --runs "$root/runs" \
    >"$root/runs/viewer-$port.log" 2>&1 &
child=$!
for _ in $(seq 40); do
    if [[ "$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)" == "$child" ]] && curl -fs "http://127.0.0.1:$port/api/experiments" >/dev/null; then
        echo "viewer on 127.0.0.1:$port at $(git -C "$tree" rev-parse --short HEAD)"
        exit 0
    fi
    sleep 0.5
done
echo "viewer did not answer on $port; see $root/runs/viewer-$port.log" >&2
exit 1
