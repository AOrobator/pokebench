import json
import struct
from pathlib import Path
from types import SimpleNamespace

import pytest

from pokebench_env.backfill_route103 import BackfillError, backfill, main
from pokebench_env.memory_reader import SnapshotMemoryReader
from pokebench_env.raw_ram import RawRamArchive

SAVE1 = 0x02025A18
RUN = "2026-10-16T02-23-17_test_sh02"


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def reader(self) -> SnapshotMemoryReader:
        cells = self.cells

        class View:
            def __getitem__(self, item: slice) -> bytes:
                return bytes(cells.get(i, 0) for i in range(item.start, item.stop))

        return SnapshotMemoryReader(
            lambda: SimpleNamespace(
                memory=SimpleNamespace(u8=View()),
                cpu=SimpleNamespace(gprs=list(range(16)), cpsr=SimpleNamespace(packed=0x1F)),
            )
        )


def memory(
    opponent: int = 0, trainer: bool = False, defeated: bool = False, oldale: int = 0
) -> Memory:
    m = Memory()
    m.put(0x03005D8C, struct.pack("<I", SAVE1))
    m.put(0x02038BCA, struct.pack("<H", opponent))
    m.put(0x02022FEC, struct.pack("<I", 1 << 3 if trainer else 0))
    if defeated:
        flag = 0x500 + 535
        m.put(SAVE1 + 0x1270 + (flag >> 3), bytes([1 << (flag & 7)]))
    m.put(SAVE1 + 0x139C + 2 * (0x40C7 - 0x4000), struct.pack("<H", oldale))
    return m


def write_run(
    root: Path, rows: list[tuple[str, bool, Memory | None]], features: list[str] | None = None
) -> Path:
    run = root / RUN
    archive = RawRamArchive(run / "raw-ram", "a" * 40)
    events: list[dict[str, object]] = [
        {
            "v": 1,
            "run": RUN,
            "seq": 0,
            "turn": 0,
            "t": "x",
            "type": "run_start",
            "harness_features": features or ["full-raw-ram-v1"],
        }
    ]
    for i, (location, in_battle, mem) in enumerate(rows, start=1):
        state: dict[str, object] = {
            "v": 1,
            "run": RUN,
            "seq": i,
            "turn": 1,
            "t": "x",
            "type": "state",
            "started": True,
            "location": location,
            "in_battle": in_battle,
        }
        if mem is not None:
            receipt = archive.capture(mem.reader(), 100 + i)
            state["raw_ram"] = {
                "v": 1,
                "sequence": receipt["sequence"],
                "frame": receipt["frame"],
                "path": "raw-ram/" + str(receipt["path"]),
                "sha256": receipt["sha256"],
            }
        events.append(state)
    events.append(
        {"v": 1, "run": RUN, "seq": len(rows) + 1, "turn": 1, "t": "x", "type": "run_end"}
    )
    (run / "events.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
    return run


def test_decodes_the_rival_fields_from_route_103_and_oldale_raw_ram_only(tmp_path: Path) -> None:
    run = write_run(
        tmp_path,
        [
            ("LITTLEROOT TOWN", False, memory()),
            ("ROUTE103", False, memory()),
            ("ROUTE103", True, memory(opponent=535, trainer=True)),
            ("ROUTE103", False, memory(opponent=535, trainer=True, defeated=True)),
            ("OLDALE TOWN", False, memory(opponent=535, defeated=True, oldale=1)),
            ("OLDALE TOWN", False, memory(opponent=535, defeated=True, oldale=2)),
            ("ROUTE103", False, None),
        ],
    )
    before = (run / "events.jsonl").read_bytes()
    rows = backfill(run)
    assert (run / "events.jsonl").read_bytes() == before
    assert [(r["seq"], r["route103_rival"]) for r in rows] == [
        (2, {"battle_active": False, "defeated": False, "oldale_stage": 0}),
        (3, {"battle_active": True, "defeated": False, "oldale_stage": 0}),
        (4, {"battle_active": False, "defeated": True, "oldale_stage": 0}),
        (5, {"battle_active": False, "defeated": True, "oldale_stage": 1}),
        (6, {"battle_active": False, "defeated": True, "oldale_stage": 2}),
    ]
    assert all(r["raw_ram"].startswith("raw-ram/") and len(r["sha256"]) == 64 for r in rows)
    written = (run / "derived" / "route103_rival.jsonl").read_text().splitlines()
    assert json.loads(written[0]) == {"v": 1, "run": RUN, "source": "raw-ram-route103-v1"}
    assert [json.loads(line) for line in written[1:]] == rows


def test_refuses_runs_that_record_the_field_natively_and_tampered_archives(tmp_path: Path) -> None:
    native = write_run(tmp_path, [("ROUTE103", False, memory())], ["route103-rival-splits-v1"])
    with pytest.raises(BackfillError, match="records route103_rival natively"):
        backfill(native)
    assert not (native / "derived").exists()
    run = write_run(tmp_path / "t", [("ROUTE103", False, memory())])
    archive = next((run / "raw-ram").glob("*.json.gz"))
    data = archive.read_bytes()
    archive.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
    with pytest.raises(ValueError, match="integrity"):
        backfill(run)
    assert not (run / "derived" / "route103_rival.jsonl").exists()


def test_cli_backfills_each_named_run_and_reports_failures(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_run(tmp_path, [("ROUTE103", True, memory(opponent=535, trainer=True))])
    assert main([str(tmp_path), RUN]) == 0
    assert f"{RUN}: 1 states" in capsys.readouterr().out
    assert main([str(tmp_path), "../escape"]) == 2
    assert main([str(tmp_path), "missing-run"]) == 1
    assert main([]) == 2


def test_skips_states_whose_save_block_pointer_is_not_set_and_rejects_bad_logs(
    tmp_path: Path,
) -> None:
    unset = memory()
    unset.put(0x03005D8C, struct.pack("<I", 0))
    run = write_run(tmp_path, [("ROUTE103", False, unset), ("ROUTE103", False, memory())])
    assert [r["seq"] for r in backfill(run)] == [2]
    bad = tmp_path / "bad"
    bad.mkdir()
    (bad / "events.jsonl").write_text(json.dumps({"type": "state"}) + "\n")
    with pytest.raises(BackfillError, match="no run_start"):
        backfill(bad)
    events = (run / "events.jsonl").read_text().replace("raw-ram/", "../raw-ram/", 1)
    (run / "events.jsonl").write_text(events)
    with pytest.raises(BackfillError, match="unexpected raw RAM path"):
        backfill(run)
