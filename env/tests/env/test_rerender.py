"""Re-rendering recorded readouts from raw RAM under a server switch set (M6 decision probes).

The golden fixture holds the RAM windows (never ROM bytes) one re-render of finals run dc0e turn 212
(INSIDE OF TRUCK) reads, and the readout recorded in that turn's tool_result.
"""

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
# Run dc0e predates displayed-place-names-v1, battle-triage-guidance-v1,
# adjacent-tiles-v1 and battle-message-waiting-v1, so its recorded harness features leave them off.


def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


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


def test_places_is_absent_unless_requested_and_checked_like_raw_ram():
    assert rerender.parse_places('{"run_dir": "/r", "raw_ram": []}') is None
    ref = rerender.parse_places(
        '{"run_dir": "/r", "raw_ram": [], "places": {"path": "raw-ram/9.json.gz", "sha256": "z"}}'
    )
    assert ref is not None and (ref.path, ref.sha256) == ("raw-ram/9.json.gz", "z")
    with pytest.raises(ValueError):
        rerender.parse_places('{"places": {"path": "../x", "sha256": "s"}}')
