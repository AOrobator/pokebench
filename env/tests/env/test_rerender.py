"""Re-rendering recorded readouts from raw RAM under a server switch set (M6 decision probes).

The golden fixture holds the RAM windows (never ROM bytes) one re-render of finals run dc0e turn 212
(INSIDE OF TRUCK) reads, and the readout recorded in that turn's tool_result.
"""

import io
import json
import os
from pathlib import Path

import pytest

from pokebench_env import rerender
from pokebench_env.blackout_readout import Whiteout
from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES
from pokebench_env.respawn import LinkCache, RespawnMemory
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "rerender-dc0e-t212.json").read_text())
ROM_START = 0x08000000
# Run dc0e predates displayed-place-names-v1, battle-triage-guidance-v1,
# adjacent-tiles-v1 and battle-message-waiting-v1, so its recorded harness features leave them off.
RECORDED_OFF = [
    "player-map-visibility-v1",
    "player-map-visibility-v2",
    "type-gap-team-v1",
    "map-observability-v1",
    "player-elevation-readout-v1",
    *FIXTURE["recorded_off"],
    "displayed-place-names-v1",
    "battle-triage-guidance-v1",
    "adjacent-tiles-v1",
    "readout-rules-in-prompt-v1",
    "battle-message-waiting-v1",
    "offscreen-objects-v1",
    "readout-truth-v1",
    "birch-speech-pages-v1",
    "blackout-readout-v1",
    "surf-gated-exits-v1",
    "exit-reachability-v1",
    "heal-before-trainers-v1",
    "tutorial-party-owner-v1",
    "mid-frame-readout-v1",
    "unset-dynamic-warp-v1",
    "status-names-v1",
    "surf-gated-exits-v2",
    "battle-effective-damage-v1",
]


def windows_reader(rom: bytes):
    cells: dict[int, int] = {}
    for window in FIXTURE["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def env_with(off: list[str]) -> dict[str, str]:
    # The recorded run predates warp-arrival-settle-v1, semantic-navigation-v2,
    # respawn-readout-v1, caught-nickname-prompt-v1, field-move-gates-v1, elevation-aware-map-v1
    # and screen-center-player-v1, so it ran with
    # those switches off.
    off = [
        *off,
        "move-learn-type-matchup-v1",
        "warp-arrival-settle-v1",
        "semantic-navigation-v2",
        "exit-labels-v2",
        "respawn-readout-v1",
        "caught-nickname-prompt-v1",
        "field-move-gates-v1",
        "elevation-aware-map-v1",
        "screen-center-player-v1",
    ]
    return {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}


def test_recorded_switches_reproduce_the_recorded_readout_byte_for_byte():
    read = windows_reader(operator_rom())
    readouts = rerender.rerender(
        Path("/run"),
        [rerender.RawRef("raw-ram/x.json.gz", "s")],
        lambda _p, _s: read,
        MapNames.load(rerender.PORYMAP_MAPS),
        env_with(RECORDED_OFF),
    )
    assert readouts == [FIXTURE["readout"]]


def test_named_warps_cannot_expose_an_internal_only_dynamic_destination():
    read = windows_reader(operator_rom())
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    on = [f for f in RECORDED_OFF if f != "named-warp-destinations-v1"]
    flipped = rerender.rerender(
        Path("/run"), [rerender.RawRef("a", "s")], lambda _p, _s: read, maps, env_with(on)
    )[0]
    assert "(4,3) -> dynamic destination" in flipped
    assert "LITTLEROOT TOWN (dynamic warp; map 0/9)" not in flipped
    changed = set(flipped.splitlines()) ^ set(FIXTURE["readout"].splitlines())
    assert changed and all(line.startswith("Warp destinations are ") for line in changed)


def test_read_state_and_render_pass_every_server_switch_through(monkeypatch):
    seen: dict[str, object] = {}

    def fake_read(read, maps, **kwargs):
        seen.update(kwargs)
        return "STATE"

    def fake_format(state, off, **kwargs):
        seen.update({f"fmt_{k}": v for k, v in kwargs.items()})
        return f"{state}:{','.join(sorted(off))}"

    monkeypatch.setattr(rerender, "read_game_state", fake_read)
    monkeypatch.setattr(rerender, "format_readout", fake_format)
    all_off = frozenset(SERVER_FEATURES)
    assert rerender.render(
        rerender.read_state(lambda a, n: b"", MapNames({}), active_ui=False, off=all_off), all_off
    ).startswith("STATE:")
    assert seen == {
        "active_ui_enabled": False,
        "message_phase_enabled": False,
        "full_map_enabled": False,
        "story_characters_enabled": False,
        "battle_details_enabled": False,
        "battle_damage_enabled": False,
        "dynamic_warp_enabled": False,
        "displayed_names_enabled": False,
        "connection_edges_enabled": False,
        "in_game_naming_enabled": False,
        "offscreen_objects_enabled": False,
        "blackout_transition_enabled": False,
        "transition_coherence_enabled": False,
        "readout_truth_enabled": False,
        "birch_pages_enabled": False,
        "birch_intro_pages_enabled": False,
        "surf_gate_enabled": False,
        "exit_reach_enabled": False,
        "heal_trainers_enabled": False,
        "heal_trainers_v2_enabled": False,
        "tutorial_owner_enabled": False,
        "mid_frame_enabled": False,
        "unset_warp_enabled": False,
        "semantic_navigation_enabled": False,
        "evolution_decision_enabled": False,
        "exit_labels_enabled": False,
        "exit_sections_enabled": False,
        "gym_door_label_enabled": False,
        "active_warp_exits_enabled": False,
        "map_observability_enabled": False,
        "map_observability_full": False,
        "caught_nickname_enabled": False,
        "caught_nickname_v2_enabled": False,
        "caught_dex_enabled": False,
        "party_item_confirmation_enabled": False,
        "party_menu_message_enabled": False,
        "interface_guidance_enabled": False,
        "bag_pocket_truth_enabled": False,
        "pokenav_short_list_enabled": False,
        "pokenav_call_advance_enabled": False,
        "field_moves_enabled": False,
        "move_learning_enabled": False,
        "move_learning_early_enabled": False,
        "battle_move_learn_input_enabled": False,
        "static_npc_templates_enabled": False,
        "mart_stock_enabled": False,
        "berry_readout_enabled": False,
        "overhead_cover_enabled": False,
        "object_elevations_enabled": False,
        "shop_interface_enabled": False,
        "exp_next_enabled": False,
        "pokedex_enabled": False,
        "type_gap_enabled": False,
        "move_matchup_enabled": False,
        "map_wide_triggers_enabled": False,
        "respawn_links": None,
        "fmt_named_interactions": False,
        "fmt_world_destinations": False,
        "fmt_bounded_navigation": False,
        "fmt_message_phase": False,
        "fmt_named_warps": False,
        "fmt_warp_animation": False,
        "fmt_rules_in_prompt": False,
        "fmt_adjacent_tiles": False,
        "fmt_whiteout": None,
        "fmt_respawn_memory": None,
    }
    # respawn-readout-v1 OFF hands no map table to the reader even when the caller has one.
    rerender.read_state(
        lambda a, n: b"", MapNames({}), active_ui=False, off=all_off, links=LinkCache({})
    )
    assert seen["respawn_links"] is None
    event = Whiteout(3000)
    links, memory = LinkCache({}), RespawnMemory()
    rerender.render(
        rerender.read_state(
            lambda a, n: b"", MapNames({}), active_ui=True, off=frozenset(), links=links
        ),
        frozenset(),
        warp_animation=True,
        whiteout=event,
        respawn_memory=memory,
    )
    assert seen.pop("fmt_whiteout") is event
    assert seen.pop("respawn_links") is links
    assert seen.pop("fmt_respawn_memory") is memory
    assert all(value is True for value in seen.values())


@pytest.mark.parametrize(
    "body",
    [
        "[]",
        '{"run_dir": 1, "raw_ram": []}',
        '{"run_dir": "/r", "raw_ram": {}}',
        '{"run_dir": "/r", "raw_ram": [{"path": "a"}]}',
        '{"run_dir": "/r", "raw_ram": ["a"]}',
        '{"run_dir": "/r", "raw_ram": [{"path": "/etc/x", "sha256": "s"}]}',
        '{"run_dir": "/r", "raw_ram": [{"path": "../x", "sha256": "s"}]}',
    ],
)
def test_rejects_malformed_requests(body):
    with pytest.raises(ValueError):
        rerender.parse_request(body)


def test_parse_request_keeps_order():
    run_dir, refs = rerender.parse_request(
        json.dumps(
            {
                "run_dir": "/r",
                "raw_ram": [
                    {"path": "raw-ram/2.json.gz", "sha256": "b"},
                    {"path": "raw-ram/1.json.gz", "sha256": "a"},
                ],
            }
        )
    )
    assert run_dir == Path("/r")
    assert [(r.path, r.sha256) for r in refs] == [
        ("raw-ram/2.json.gz", "b"),
        ("raw-ram/1.json.gz", "a"),
    ]


def test_main_reads_the_archive_with_the_operator_rom(monkeypatch, tmp_path):
    monkeypatch.setattr(
        rerender.MapMemory, "project", lambda self, read, state, *, whole_lit=False: state
    )
    rom = tmp_path / "rom.gba"
    rom.write_bytes(b"ROM")
    calls: list[tuple[Path, str, bytes]] = []
    monkeypatch.setattr(rerender, "resolve_rom", lambda env: rom)
    monkeypatch.setattr(
        rerender,
        "load_raw_ram",
        lambda path, sha, rom: calls.append((path, sha, rom)) or (lambda a, n: b""),
    )
    monkeypatch.setattr(rerender.MapNames, "load", classmethod(lambda cls, maps_dir: MapNames({})))
    monkeypatch.setattr(rerender, "read_game_state", lambda read, maps, **kwargs: "S")
    monkeypatch.setattr(
        rerender,
        "format_readout",
        lambda state, off, **kwargs: f"readout of {state} without {len(off)}",
    )
    out = io.StringIO()
    request = json.dumps(
        {"run_dir": str(tmp_path), "raw_ram": [{"path": "raw-ram/1.json.gz", "sha256": "abc"}]}
    )
    assert (
        rerender.main(
            {"POKEBENCH_FEATURES_OFF": "battle-details-v2,warp-arrival-settle-v1"},
            io.StringIO(request),
            out,
        )
        == 0
    )
    assert json.loads(out.getvalue()) == {"readouts": ["readout of S without 2"]}
    assert calls == [(tmp_path / "raw-ram/1.json.gz", "abc", b"ROM")]


def test_places_is_absent_unless_requested_and_checked_like_raw_ram():
    assert rerender.parse_places('{"run_dir": "/r", "raw_ram": []}') is None
    ref = rerender.parse_places(
        '{"run_dir": "/r", "raw_ram": [], "places": {"path": "raw-ram/9.json.gz", "sha256": "z"}}'
    )
    assert ref is not None and (ref.path, ref.sha256) == ("raw-ram/9.json.gz", "z")
    with pytest.raises(ValueError):
        rerender.parse_places('{"places": {"path": "../x", "sha256": "s"}}')


def _fake_directory(seen: list[bool]) -> type:
    class Place:
        def json(self) -> dict[str, object]:
            return {"name": "DEWFORD TOWN"}

    class Directory:
        def __init__(self, read, maps):
            pass

        def places(self, *, displayed):
            seen.append(displayed)
            return (Place(),)

    return Directory


def test_places_honors_displayed_place_names(monkeypatch, tmp_path):
    seen: list[bool] = []
    monkeypatch.setattr(rerender, "PlaceDirectory", _fake_directory(seen))
    ref = rerender.RawRef("raw-ram/9.json.gz", "z")
    loaded: list[tuple[Path, str]] = []

    def load(path: Path, sha: str):
        loaded.append((path, sha))
        return lambda a, n: b""

    for off in ("", "displayed-place-names-v1"):
        out = rerender.places(
            tmp_path,
            ref,
            load,
            MapNames({}),
            {
                "POKEBENCH_FEATURES_OFF": ",".join(
                    filter(None, (off, "player-map-visibility-v1", "player-map-visibility-v2"))
                )
            },
        )
        assert out == [{"name": "DEWFORD TOWN"}]
    assert seen == [True, False]
    assert loaded == [(tmp_path / "raw-ram/9.json.gz", "z")] * 2


def test_main_adds_the_map_table_read_from_the_named_archive(monkeypatch, tmp_path):
    rom = tmp_path / "rom.gba"
    rom.write_bytes(b"ROM")
    loaded: list[tuple[Path, str]] = []
    monkeypatch.setattr(rerender, "resolve_rom", lambda env: rom)
    monkeypatch.setattr(
        rerender,
        "load_raw_ram",
        lambda path, sha, rom: loaded.append((path, sha)) or (lambda a, n: b""),
    )
    monkeypatch.setattr(rerender.MapNames, "load", classmethod(lambda cls, maps_dir: MapNames({})))
    seen: list[bool] = []
    monkeypatch.setattr(rerender, "PlaceDirectory", _fake_directory(seen))
    request = json.dumps(
        {
            "run_dir": str(tmp_path),
            "raw_ram": [],
            "places": {"path": "raw-ram/9.json.gz", "sha256": "z"},
        }
    )
    out = io.StringIO()
    assert (
        rerender.main(
            {"POKEBENCH_FEATURES_OFF": "player-map-visibility-v1,player-map-visibility-v2"},
            io.StringIO(request),
            out,
        )
        == 0
    )
    assert json.loads(out.getvalue()) == {"readouts": [], "places": [{"name": "DEWFORD TOWN"}]}
    assert seen == [True]
    assert loaded == [(tmp_path / "raw-ram/9.json.gz", "z")]
