"""displayed-place-names-v1: signs and the buildings they name read as the game prints them.

Script bytes follow pret/pokeemerald 731ad5b: `msgbox` is `loadword 0, TEXT` (0F 00 ptr)
then `callstd TYPE` (09 type) with MSGBOX_SIGN 3 and MSGBOX_DEFAULT 4 (asm/macros/event.inc);
`call_if_eq VAR_RESULT, V, S` is `compare_var_to_value` (21 0D80 V) then
`call_if EQUAL, S` (07 01 ptr);
lockall 69, checkplayergender A0, releaseall 6B, end 02, return 03 (data/script_cmd_table.inc).
`{PLAYER}` is FD 01 (charmap.txt). SaveBlock2.playerGender is at +0x08, MALE 0 / FEMALE 1.
"""

import json
import struct
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env.displayed_names import PLACES, place_name, read_sign_text
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.observation import install_observation
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.rerender import read_state
from tests.env.test_feature_switches import _Shot, map_memory
from tests.env.test_game_state import SB1, SB2, text

SWITCH = "displayed-place-names-v1"
SIGN = 0x08006000
MALE_SUB, FEMALE_SUB = 0x08006100, 0x08006200
BIRCH_TEXT, PLAYER_TEXT = 0x08006300, 0x08006400
MAPS = MapNames(
    {
        (0, 9): "LITTLEROOT TOWN",
        (1, 0): "LITTLEROOT TOWN BRENDANS HOUSE 1F",
        (1, 1): "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        (1, 2): "LITTLEROOT TOWN MAYS HOUSE 1F",
        (1, 3): "LITTLEROOT TOWN MAYS HOUSE 2F",
        (1, 4): "LITTLEROOT TOWN PROFESSOR BIRCHS LAB",
    }
)
BIRCH = "PROF. BIRCH'S HOUSE"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def msgbox(target: int, kind: int) -> bytes:
    return b"\x0f\x00" + struct.pack("<I", target) + bytes([0x09, kind])


def gender_sign(male: int, female: int) -> bytes:
    branch = b"".join(
        b"\x21" + struct.pack("<HH", 0x800D, value) + b"\x07\x01" + struct.pack("<I", sub)
        for value, sub in ((0, male), (1, female))
    )
    return b"\x69\xa0" + branch + b"\x6b\x02"


def littleroot(gender: int = 0, *, warp_to: tuple[int, int] = (1, 2), player_map=(0, 9)):  # type: ignore[no-untyped-def]
    """The map fixture with one warp (0,1) and Mays House Sign's exact script shape at (3,1)."""
    m = map_memory()
    m.put(SB1 + 4, bytes([player_map[0], player_map[1]]))
    m.put(SB2 + 8, bytes([gender]))
    m.put(
        0x02002000,
        bytes([0, 1, 0, 1]) + struct.pack("<IIII", 0, 0x02009000, 0, 0x08003000),
    )
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 1, 0, 1, warp_to[1], warp_to[0]))
    m.put(0x08003000, struct.pack("<HHBB2xI", 3, 1, 3, 0, SIGN))
    m.put(SIGN, gender_sign(MALE_SUB, FEMALE_SUB))
    m.put(MALE_SUB, msgbox(BIRCH_TEXT, 4) + b"\x03")
    m.put(FEMALE_SUB, msgbox(PLAYER_TEXT, 4) + b"\x03")
    m.put(BIRCH_TEXT, text(BIRCH) + b"\xff")
    m.put(PLAYER_TEXT, b"\xfd\x01" + text("'s HOUSE") + b"\xff")
    return m


def readout(state, off=frozenset({"character-presence-v1"})) -> str:  # type: ignore[no-untyped-def]
    return format_readout(
        state, off, named_interactions=True, named_warps=True, world_destinations=True
    )


def on_state(gender: int = 0, **kw):  # type: ignore[no-untyped-def]
    return read_game_state(littleroot(gender, **kw).read, MAPS, displayed_names_enabled=True)


def test_male_save_reads_the_sign_and_the_warp_as_prof_birchs_house() -> None:
    text_on = readout(on_state(0))
    assert 'Sign text "PROF. BIRCH\'S HOUSE" at (3,1), elevation 3; A; conditional' in text_on
    assert "Warp to PROF. BIRCH'S HOUSE 1F (map 1/2) at (0,1)" in text_on
    assert "destination PROF. BIRCH'S HOUSE 1F (map 1/2) warp 1" in text_on
    assert "Warps: (0,1) -> PROF. BIRCH'S HOUSE 1F (map 1/2)" in text_on
    assert "Warp destination at (0,1): PROF. BIRCH'S HOUSE 1F" in text_on
    assert "MAYS HOUSE" not in text_on


def test_female_save_follows_the_scripts_own_branch_with_the_saved_name() -> None:
    state = on_state(1)
    text_on = readout(state)
    assert state.name == "MAY"
    assert 'Sign text "MAY\'s HOUSE" at (3,1)' in text_on
    assert "Warp to MAY's HOUSE 1F (map 1/2) at (0,1)" in text_on
    assert BIRCH not in text_on


def test_the_other_littleroot_buildings_swap_with_gender() -> None:
    male = {map_id: place_name(name, 0, "RED") for map_id, name in MAPS._names.items()}
    female = {map_id: place_name(name, 1, "MAY") for map_id, name in MAPS._names.items()}
    assert male == {
        (0, 9): None,
        (1, 0): "RED's HOUSE 1F",
        (1, 1): "RED's HOUSE 2F",
        (1, 2): "PROF. BIRCH'S HOUSE 1F",
        (1, 3): "PROF. BIRCH'S HOUSE 2F",
        (1, 4): "PROF. BIRCH'S POKéMON LAB",
    }
    assert female == {
        (0, 9): None,
        (1, 0): "PROF. BIRCH'S HOUSE 1F",
        (1, 1): "PROF. BIRCH'S HOUSE 2F",
        (1, 2): "MAY's HOUSE 1F",
        (1, 3): "MAY's HOUSE 2F",
        (1, 4): "PROF. BIRCH'S POKéMON LAB",
    }
    assert set(PLACES) == {name for map_id, name in MAPS._names.items() if map_id != (0, 9)}


def test_location_line_names_the_house_but_json_location_is_unchanged() -> None:
    state = on_state(0, player_map=(1, 2), warp_to=(0, 9))
    assert "Location: PROF. BIRCH'S HOUSE 1F\n" in readout(state)
    assert state_json(state)["location"] == "LITTLEROOT TOWN MAYS HOUSE 1F"
    assert state.location == "LITTLEROOT TOWN MAYS HOUSE 1F"
    off_state = read_game_state(littleroot(0, player_map=(1, 2), warp_to=(0, 9)).read, MAPS)
    assert "Location: LITTLEROOT TOWN MAYS HOUSE 1F\n" in readout(off_state)


def test_off_is_todays_readout_byte_for_byte() -> None:
    # Goldens were rendered by env/pokebench_env at fa09dbe6 (before this switch) from this fixture.
    for gender in (0, 1):
        for room, kw in (("town", {}), ("house", {"player_map": (1, 2), "warp_to": (0, 9)})):
            memory = littleroot(gender, **kw)
            golden = (FIXTURES / f"displayed-names-off-{room}-{gender}-fa09dbe6.txt").read_text()
            off = frozenset(
                {
                    SWITCH,
                    "character-presence-v1",
                    "offscreen-objects-v1",
                    "readout-truth-v1",
                    "birch-speech-pages-v1",
                    "blackout-readout-v1",
                    "surf-gated-exits-v1",
                    "tutorial-party-owner-v1",
                    "mid-frame-readout-v1",
                    "unset-dynamic-warp-v1",
                    "status-names-v1",
                    "surf-gated-exits-v2",
                }
            )
            state = read_state(memory.read, MAPS, active_ui=True, off=off)
            assert readout(state, off) == golden
            json_golden = json.loads(
                (FIXTURES / f"displayed-names-off-{room}-{gender}-fa09dbe6.json").read_text()
            )
            # route103_rival and trainer_opponent (measurement only, added after fa09dbe6) are
            # the only new keys.
            current = json.loads(json.dumps(state_json(state)))
            assert current.pop("route103_rival") == {
                "battle_active": False,
                "defeated": False,
                "oldale_stage": 0,
            }
            assert current.pop("trainer_opponent") is None
            assert current == json_golden


def test_unknown_gender_or_missing_name_keeps_todays_labels() -> None:
    for gender in (2, 0xFF):
        state = on_state(gender)
        assert readout(state) == readout(read_game_state(littleroot(gender).read, MAPS))
    assert place_name("LITTLEROOT TOWN MAYS HOUSE 1F", 0, None) == BIRCH + " 1F"
    assert place_name("LITTLEROOT TOWN MAYS HOUSE 1F", 1, None) is None
    assert place_name("LITTLEROOT TOWN MAYS HOUSE 1F", 1, "") is None
    assert place_name("LITTLEROOT TOWN MAYS HOUSE 1F", None, "RED") is None


def test_single_text_sign_prints_every_line_with_arrows() -> None:
    m = littleroot(0)
    m.put(SIGN, msgbox(0x08006500, 3) + b"\x02")
    m.put(0x08006500, text("ROUTE 101") + b"\xfe\x79" + text(" OLDALE TOWN") + b"\xff")
    state = read_game_state(m.read, MAPS, displayed_names_enabled=True)
    assert 'Sign text "ROUTE 101 | ↑ OLDALE TOWN" at (3,1)' in readout(state)
    assert read_sign_text(m.read, SIGN, 0, "RED") == "ROUTE 101 | ↑ OLDALE TOWN"


@pytest.mark.parametrize(
    "script",
    [
        msgbox(0x08006500, 4) + b"\x02",  # MSGBOX_DEFAULT is not the sign box
        msgbox(0x08006500, 3) + b"\x03",  # return, not end
        msgbox(0x08006500, 3),  # no terminator
        b"\x69\xa0" + bytes(30),  # a gender check of another shape
        gender_sign(MALE_SUB, MALE_SUB)[:-1] + b"\x03",
        # two MALE branches
        b"\x69\xa0\x21\x0d\x80\x00\x00\x07\x01"
        + struct.pack("<I", MALE_SUB)
        + b"\x21\x0d\x80\x00\x00\x07\x01"
        + struct.pack("<I", FEMALE_SUB)
        + b"\x6b\x02",
    ],
)
def test_other_script_shapes_keep_todays_label(script: bytes) -> None:
    m = littleroot(0)
    m.put(SIGN, script)
    m.put(0x08006500, text("ROUTE 101") + b"\xff")
    assert read_sign_text(m.read, SIGN, 0, "RED") is None


@pytest.mark.parametrize(
    "body",
    [
        b"\xfd\x02" + text("X") + b"\xff",  # STR_VAR_1 is not something a sign can know
        text("NO END"),  # unterminated within the bound
        b"\xfd",  # truncated placeholder
        b"\x00" * 3 + b"\xf7" + b"\xff",  # an undecodable glyph
    ],
)
def test_text_the_harness_cannot_render_keeps_todays_label(body: bytes) -> None:
    m = littleroot(0)
    m.put(SIGN, msgbox(0x08006500, 3) + b"\x02")
    for i in range(0x400):
        m.put(0x08006500 + i, b"\x01")
    m.put(0x08006500, body)
    assert read_sign_text(m.read, SIGN, 0, "RED") is None


def test_a_pointer_outside_the_rom_is_never_read() -> None:
    m = littleroot(0)
    assert read_sign_text(m.read, 0x02000000, 0, "RED") is None
    m.put(SIGN, msgbox(0x02000000, 3) + b"\x02")
    assert read_sign_text(m.read, SIGN, 0, "RED") is None


def test_observation_route_applies_the_switch_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    memory = littleroot(0)
    payloads = {}
    for off in ("", SWITCH):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, _Shot, memory.read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200
        payloads[off] = json.loads(body)
    assert 'Sign text "PROF. BIRCH\'S HOUSE"' in payloads[""]["state_text"]
    assert "PROF. BIRCH'S HOUSE 1F (map 1/2)" in payloads[""]["state_text"]
    assert "Sign text" not in payloads[SWITCH]["state_text"]
    assert "LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2)" in payloads[SWITCH]["state_text"]
    signs = [t for t in payloads[""]["state"]["interaction_targets"] if t["kind"] == "background"]
    assert signs[0]["name"] == 'Sign text "PROF. BIRCH\'S HOUSE"'
    off_signs = [
        t for t in payloads[SWITCH]["state"]["interaction_targets"] if t["kind"] == "background"
    ]
    assert off_signs[0]["name"] is None
    assert payloads[""]["state"]["location"] == payloads[SWITCH]["state"]["location"]


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


@pytest.mark.parametrize(
    ("catalog", "shown"),
    [
        ("Mays House Sign", 'Sign text "PROF. BIRCH\'S HOUSE"'),
        ("Route Sign Oldale", 'Sign text "PROF. BIRCH\'S HOUSE"'),
        ("Notebook", "Notebook"),
        ("GameCube", "GameCube"),
    ],
)
def test_verified_furniture_keeps_its_name_and_signs_take_their_text(
    monkeypatch: pytest.MonkeyPatch, catalog: str, shown: str
) -> None:
    import hashlib

    from pokebench_env.interaction_names import SCRIPT_NAMES, ScriptName

    memory = littleroot(0)
    digest = hashlib.sha256(memory.read(SIGN, 16)).hexdigest()
    monkeypatch.setitem(SCRIPT_NAMES, SIGN, ScriptName(catalog, digest))
    on = read_game_state(memory.read, MAPS, displayed_names_enabled=True)
    off = read_game_state(memory.read, MAPS)
    assert [t.name for t in on.interaction_targets or () if t.kind == "background"] == [shown]
    assert [t.name for t in off.interaction_targets or () if t.kind == "background"] == [catalog]


def test_a_gender_check_on_values_other_than_male_and_female_is_not_followed() -> None:
    m = littleroot(0)
    script = bytearray(gender_sign(MALE_SUB, FEMALE_SUB))
    script[16:18] = struct.pack("<H", 2)
    m.put(SIGN, bytes(script))
    assert read_sign_text(m.read, SIGN, 0, "RED") is None


def test_text_controls_inside_a_sign_are_skipped_whole() -> None:
    m = littleroot(0)
    m.put(SIGN, msgbox(0x08006500, 3) + b"\x02")
    # FC 01 <color> is a text-color control: it prints nothing, and its argument may be any byte.
    m.put(0x08006500, text("ROUTE") + b"\xfc\x01\xfd" + text(" 101") + b"\xff")
    assert read_sign_text(m.read, SIGN, 0, "RED") == "ROUTE 101"


def test_state_json_carries_the_displayed_location_only_when_the_switch_names_this_map() -> None:
    house = state_json(on_state(0, player_map=(1, 2), warp_to=(0, 9)))
    assert house["location"] == "LITTLEROOT TOWN MAYS HOUSE 1F"
    assert house["location_display"] == "PROF. BIRCH'S HOUSE 1F"
    assert "location_display" not in state_json(on_state(0))
    off = read_game_state(littleroot(0, player_map=(1, 2), warp_to=(0, 9)).read, MAPS)
    assert "location_display" not in state_json(off)
