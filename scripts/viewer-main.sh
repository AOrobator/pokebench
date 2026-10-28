#!/usr/bin/env bash
# Prepare an immutable persistent main build, then restart only the viewer.
set -euo pipefail
root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
exec uv run --project "$root/env" python -m pokebench_env.current_runtime viewer --root "$root"
