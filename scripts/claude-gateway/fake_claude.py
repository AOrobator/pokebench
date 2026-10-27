#!/usr/bin/env python3
"""Stand-in for `claude -p` in the gateway tests.

It reads its script from $CLAUDE_CONFIG_DIR/plan.json (a list consumed one entry
per call) and records argv, stdin, cwd and the environment's names to
$CLAUDE_CONFIG_DIR/calls.jsonl. An entry is {"result": text} for a success,
{"error": text, "subtype"?: str, "status"?: int} for an error result,
{"crash": stderr} for a process that dies without a result, or
{"sleep": seconds} to hang.
"""

import json
import os
import sys
import time
import uuid
from pathlib import Path

home = Path(os.environ["CLAUDE_CONFIG_DIR"])
calls = home / "calls.jsonl"
done = sum(1 for _ in calls.open()) if calls.exists() else 0
plan = json.loads((home / "plan.json").read_text())
step = plan[min(done, len(plan) - 1)]
argv = sys.argv[1:]
with calls.open("a") as out:
    record = {
        "argv": argv,
        "stdin": sys.stdin.read(),
        "cwd": os.getcwd(),
        "env": sorted(os.environ),
    }
    out.write(json.dumps(record) + "\n")

if "sleep" in step:
    time.sleep(step["sleep"])
if "crash" in step:
    sys.stderr.write(step["crash"])
    sys.exit(1)
session = next(
    (argv[i + 1] for i, a in enumerate(argv) if a in ("--session-id", "--resume")),
    str(uuid.uuid4()),
)
print(json.dumps({"type": "system", "subtype": "init", "session_id": session}))
print("not json")
thinking = {"type": "thinking", "thinking": "consider the screen"}
print(json.dumps({"type": "assistant", "message": {"content": [thinking]}}))
result = {
    "type": "result",
    "subtype": step.get("subtype", "success"),
    "is_error": "error" in step,
    "api_error_status": step.get("status"),
    "result": step.get("error", step.get("result", "")),
    "session_id": session,
    "total_cost_usd": step.get("cost", 0.01),
    "usage": {
        "input_tokens": 100 + done,
        "cache_read_input_tokens": 50,
        "cache_creation_input_tokens": 10,
        "output_tokens": 20,
    },
    "modelUsage": {"claude-opus-5-5": {}},
}
print(json.dumps(result))
