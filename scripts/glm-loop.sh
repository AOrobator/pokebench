#!/bin/sh
# One serial four-hour bundle/control pair per current-main pin; next pair refreshes main.
# The canonical bundle-v-control recipe is materialized by fixed-run, not copied between rounds.
set -eu
REPO=${REPO:-$HOME/dev/pokebench}
ARCHIVE=${ARCHIVE:-$REPO/runs/dryruns}
export REPO ARCHIVE
export LOOP_NAME=glm-four-hour-loop
export EXP_ID=glm53-flash-4h
export FEATURE_RECIPE=bundle-v-control
export EXPECTED_TRIALS=2
export WALL_MS=14400000
export MAIN_WT=${MAIN_WT:-/private/tmp/pokebench-glm-four-hour-main}
mkdir -p "$ARCHIVE"
snapshot=$ARCHIVE/glm-four-hour-driver-$$.sh
cp "$REPO/scripts/whole-map-loop.sh" "$snapshot"
exec /bin/sh "$snapshot"
