import struct

from pokebench_env.character_presence import (
    TEMPLATES,
    StoryCharacters,
    read_story_characters,
)
from pokebench_env.world_context import SAVE_VARIABLES, LiveObject

SAVE1 = 0x02025A00
LAB = "LITTLEROOT TOWN PROFESSOR BIRCHS LAB"
FLAGS = 0x1270


class Memory:
    def __init__(self) -> None:
        self.bytes: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.bytes[address + i] = b

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.bytes.get(address + i, 0) for i in range(length))


def template(
    slot: int, local_id: int, graphics: int, x: int, y: int, flag: int
) -> tuple[int, bytes]:
    body = struct.pack(
        "<BBBxhhBBHHHIH2x", local_id, graphics, 0, x, y, 0, 0, 0, 0, 0, 0x08100000, flag
    )
    return SAVE1 + TEMPLATES + slot * 24, body


def lab(memory: Memory, *, birch_hidden: bool) -> None:
    for slot, args in enumerate([(1, 46, 9, 7, 0), (2, 64, 6, 4, 0x2D0), (3, 105, 2, 3, 0x2D1)]):
        memory.put(*template(slot, *args))
    if birch_hidden:
        memory.put(SAVE1 + FLAGS + 0x2D0 // 8, bytes([1 << (0x2D0 % 8)]))
    memory.put(
        SAVE1 + FLAGS + 0x2D1 // 8,
        bytes([memory.read(SAVE1 + FLAGS + 0x2D1 // 8, 1)[0] | 1 << (0x2D1 % 8)]),
    )


def test_hidden_story_characters_are_not_on_this_map_and_sprite_kinds_are_never_named_as_them() -> (
    None
):
    memory = Memory()
    lab(memory, birch_hidden=True)
    found = read_story_characters(memory.read, SAVE1, (1, 4), (), location=LAB)
    assert found is not None
    text = found.text()
    assert text.startswith("Story characters here (from this map's own object list): none.")
    assert (
        "Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN." in text
    )
    assert "SCIENTIST_1" not in text.split("Not on this map")[0]
    assert "Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters." in text


def test_a_visible_character_is_listed_with_its_live_position_or_as_out_of_view() -> None:
    memory = Memory()
    lab(memory, birch_hidden=False)
    live = (LiveObject(2, (1, 4), 64, "PROF_BIRCH", 6, 5),)
    shown = read_story_characters(memory.read, SAVE1, (1, 4), live, location=LAB)
    assert shown is not None
    assert "here (from this map's own object list): PROF. BIRCH at 6,5." in shown.text()
    assert "PROF. BIRCH," not in shown.text().split("Not on this map:")[1]
    unseen = read_story_characters(memory.read, SAVE1, (1, 4), (), location=LAB)
    assert unseen is not None and "PROF. BIRCH (on this map, out of view)" in unseen.text()


def test_variable_graphics_resolve_through_the_game_variable() -> None:
    memory = Memory()
    memory.put(*template(0, 1, 240 + 3, 4, 4, 0))
    memory.put(SAVE1 + SAVE_VARIABLES + 2 * (0x4010 + 3 - 0x4000), struct.pack("<H", 215))
    shown = read_story_characters(memory.read, SAVE1, (0, 9), (), location="LITTLEROOT TOWN")
    assert shown is not None and "MOM (on this map, out of view)" in shown.text()


def test_unreadable_save_block_gives_no_line() -> None:
    assert read_story_characters(Memory().read, 0, (0, 9), (), location="LITTLEROOT TOWN") is None


def test_readout_prints_the_line_only_when_the_switch_is_on() -> None:
    from dataclasses import replace

    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout
    from tests.env.test_feature_switches import map_memory
    from tests.env.test_game_state import MAPS

    state = read_game_state(map_memory().read, MAPS)
    memory = Memory()
    lab(memory, birch_hidden=True)
    found = read_story_characters(memory.read, SAVE1, (1, 4), (), location=LAB)
    with_line = replace(state, story_characters=found)
    on = format_readout(with_line)
    off = format_readout(with_line, frozenset({"character-presence-v1"}))
    assert "Story characters here" in on
    assert off == format_readout(replace(state, story_characters=None))
    assert "Story characters here" not in off


def rival(memory: Memory, var: int, graphics: int) -> None:
    memory.put(*template(0, 1, 240 + var, 4, 4, 0))
    memory.put(SAVE1 + SAVE_VARIABLES + 2 * (0x4010 + var - 0x4000), struct.pack("<H", graphics))


def test_reused_rival_graphics_off_the_story_maps_name_nobody() -> None:
    # SlateportCity_BattleTentBattleRoom/scripts.inc:27 sets VAR_OBJ_GFX_ID_1 to
    # OBJ_EVENT_GFX_RIVAL_MAY_NORMAL for the fake opponent; Route111/scripts.inc:62 uses it for
    # the falling player. Neither is the story rival.
    for location, var in (
        ("SLATEPORT CITY BATTLE TENT BATTLE ROOM", 1),
        ("ROUTE111", 0),
        ("BATTLE FRONTIER BATTLE ARENA BATTLE ROOM", 1),
        (None, 0),
    ):
        memory = Memory()
        rival(memory, var, 105)
        shown = read_story_characters(memory.read, SAVE1, (9, 4), (), location=location)
        assert shown is not None
        assert shown.here == (), location
        assert "MAY" in shown.absent


def test_the_rival_is_named_on_the_maps_where_pret_places_the_story_rival() -> None:
    for location in ("LITTLEROOT TOWN MAYS HOUSE 2F", "ROUTE103", "OLDALE TOWN"):
        memory = Memory()
        rival(memory, 0, 105)
        shown = read_story_characters(memory.read, SAVE1, (0, 0), (), location=location)
        assert shown is not None and shown.here == ("MAY (on this map, out of view)",), location


def test_a_graphics_id_names_a_character_only_on_that_characters_story_maps() -> None:
    memory = Memory()
    memory.put(*template(0, 1, 64, 4, 4, 0))
    birch = read_story_characters(memory.read, SAVE1, (0, 16), (), location="ROUTE101")
    assert birch is not None and birch.here == ("PROF. BIRCH (on this map, out of view)",)
    elsewhere = read_story_characters(memory.read, SAVE1, (9, 4), (), location="SLATEPORT CITY")
    assert elsewhere is not None and elsewhere.here == ()


def test_a_failed_or_short_read_gives_no_line() -> None:
    def broken(address: int, length: int) -> bytes:
        raise OSError("emulator gone")

    assert read_story_characters(broken, SAVE1, (0, 9), (), location="LITTLEROOT TOWN") is None
    assert (
        read_story_characters(
            lambda a, n: b"\x01\x02", SAVE1, (0, 9), (), location="LITTLEROOT TOWN"
        )
        is None
    )


def test_off_the_reader_is_not_called_on_the_observation_route(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import json

    from fastapi import FastAPI
    from test_view import get

    import pokebench_env.game_state as game_state
    from pokebench_env.observation import install_observation
    from tests.env.test_feature_switches import _Shot, map_memory
    from tests.env.test_game_state import MAPS

    calls: list[str] = []

    def spy(*args: object, **kwargs: object) -> None:
        calls.append("story")
        return None

    def battle_spy(*args: object, **kwargs: object) -> None:
        calls.append("battle")
        return None

    monkeypatch.setattr(game_state, "read_story_characters", spy)
    monkeypatch.setattr(game_state, "read_battle_details", battle_spy)
    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        "character-presence-v1,battle-details-v2,battle-triage-guidance-v1",
    )
    app = FastAPI()
    install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200 and "Story characters here" not in json.loads(body)["state_text"]
    assert calls == []
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    app = FastAPI()
    install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
    get(app, "/pokebench/observation")
    assert "story" in calls


def test_the_pending_experiment_activates_where_the_line_first_appears() -> None:
    # The line is printed on every readable overworld map, the truck included
    # (PLAYER_NAME_CONFIRMED).
    import json
    from pathlib import Path

    from pokebench_env.character_presence import StoryCharacters

    assert (
        StoryCharacters(here=(), absent=("MOM",))
        .text()
        .startswith("Story characters here (from this map's own object list): none.")
    )
    entry = json.loads(
        (Path(__file__).parents[3] / "experiments" / "character-presence.json").read_text()
    )
    assert entry["activationMilestone"] == "PLAYER_NAME_CONFIRMED"


def test_the_line_people_ledger_reads_keeps_its_exact_shape() -> None:
    # packages/agent/src/people-ledger.ts (people-ledger-v1) parses this line; keep both in step.
    line = StoryCharacters(
        here=("MAY at 2,5", "PROF. BIRCH (on this map, out of view)"), absent=("MOM", "NORMAN")
    ).text()
    assert line == (
        "Story characters here (from this map's own object list): "
        "MAY at 2,5, PROF. BIRCH (on this map, out of view). Not on this map: MOM, NORMAN. "
        "Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters."
    )
    assert (
        StoryCharacters(here=(), absent=())
        .text()
        .startswith(
            "Story characters here (from this map's own object list): none. Not on this map: none. "
        )
    )


def test_the_offscreen_entries_people_ledger_reads_keep_their_exact_shape() -> None:
    # offscreen-objects-v1 entries, as packages/agent/src/people-ledger.ts parses them.
    from types import SimpleNamespace

    out = (
        "MAY (on this map, out of view)",
        "PROF. BIRCH (on this map, out of view)",
    )
    line = StoryCharacters(
        here=out, absent=("MOM",), out_of_view=(("MAY", 7), ("PROF. BIRCH", 2))
    ).text(
        {
            7: SimpleNamespace(x=12, y=3, loaded=True),
            2: SimpleNamespace(x=6, y=4, loaded=False),
        }
    )
    assert line == (
        "Story characters here (from this map's own object list): "
        "MAY at 12,3 (out of view), PROF. BIRCH at 6,4 "
        "(out of view; where the map places this character, it may have moved). "
        "Not on this map: MOM. "
        "Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters."
    )
