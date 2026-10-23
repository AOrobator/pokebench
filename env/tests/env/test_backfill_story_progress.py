import json
from unittest.mock import patch

import pytest

from pokebench_env.backfill_story_progress import backfill, main
from pokebench_env.raw_ram import RawRamArchive
from tests.env.test_backfill_route103 import RUN, memory, write_run


def compatible(tmp_path):
    with patch(
        "tests.env.test_backfill_route103.RawRamArchive",
        lambda directory, _sha: RawRamArchive(
            directory, "f3ae088181bf583e55daf962a92bb46f4f1d07b7"
        ),
    ):
        run = write_run(tmp_path, [("ROUTE103", False, memory())])
    lines = [json.loads(line) for line in (run / "events.jsonl").read_text().splitlines()]
    lines[0]["rom_sha1"] = "f3ae088181bf583e55daf962a92bb46f4f1d07b7"
    for i, line in enumerate(lines):
        line["run"] = run.name
        line["seq"] = i
    (run / "events.jsonl").write_text("".join(json.dumps(line) + "\n" for line in lines))
    return run


def test_backfill_preserves_source_and_binds_validated_archives(tmp_path):
    run = compatible(tmp_path)
    before = (run / "events.jsonl").read_bytes()
    receipt = backfill(run)
    assert receipt["rows"] == 1
    assert receipt["log_bytes"] == len(before)
    assert (run / "events.jsonl").read_bytes() == before
    rows = [
        json.loads(line) for line in (run / "derived/story_progress.jsonl").read_text().splitlines()
    ]
    assert len(rows[0]["story_progress"]["flags"]) == 600
    assert rows[-1] == receipt
    assert backfill(run) == receipt


@pytest.mark.parametrize("problem", ["identity", "rom", "path", "hash", "native", "symlink"])
def test_rejects_invalid_evidence(tmp_path, problem):
    run = compatible(tmp_path)
    lines = [json.loads(line) for line in (run / "events.jsonl").read_text().splitlines()]
    if problem == "identity":
        lines[1]["run"] = "different-run"
    elif problem == "rom":
        lines[0]["rom_sha1"] = "0" * 40
    elif problem == "path":
        lines[1]["raw_ram"]["path"] = "../escaped.json.gz"
    elif problem == "hash":
        lines[1]["raw_ram"]["sha256"] = "0" * 64
    elif problem == "native":
        lines[0]["harness_features"] = ["all-gym-story-milestones-v1"]
    else:
        (run / "derived").symlink_to(tmp_path, target_is_directory=True)
    (run / "events.jsonl").write_text("".join(json.dumps(line) + "\n" for line in lines))
    with pytest.raises(ValueError):
        backfill(run)
    assert not (run / "derived/story_progress.jsonl").exists()


def test_bounded_partial_live_tail_and_cli(tmp_path, capsys):
    run = compatible(tmp_path)
    with (run / "events.jsonl").open("ab") as file:
        file.write(b'{"unfinished":')
    assert backfill(run)["rows"] == 1
    assert main([str(tmp_path), RUN]) == 0
    assert main([]) == 2
    assert main([str(tmp_path), "../escape"]) == 2
    assert main([str(tmp_path), "missing"]) == 1
    capsys.readouterr()
