#!/usr/bin/env bash
# Install/restart the independent current-state projector; stop retains all derived data.
set -euo pipefail
root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
exec uv run --project "$root/env" python -m pokebench_env.current_runtime "${1:-install}" --root "$root"
