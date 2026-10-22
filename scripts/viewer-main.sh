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
# Start over launches a human run from this tree; its game server needs the main venv (mGBA binding).
ln -sfn "$root/env/.venv" "$tree/env/.venv"
(cd "$tree" && pnpm install --frozen-lockfile --silent && pnpm -r --silent build)

"$(dirname "$0")/viewer-restart.sh" "$tree/packages/viewer/dist/cli.js" "$port" "$root/runs" "$root/.env" "$root/runs/viewer-$port.log"
echo "viewer at $(git -C "$tree" rev-parse --short HEAD)"
