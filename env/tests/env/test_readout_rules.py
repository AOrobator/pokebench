"""readout-rules-in-prompt-v1: the fixed map rules leave the readout for the system prompt."""

import itertools
import json
import re
import struct
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env.game_state import GameState
from pokebench_env.map_rules import (
    COUNTER_LINE,
    FEATURE,
    MAP_RULE_SWITCHES,
    POINTER,
    SECTION_HEADER,
    TERRAIN_RULE,
    TRIGGER_ELEVATION_RULE,
    prompt_section,
    render_ts,
)
from pokebench_env.map_rules import main as map_rules_main
from pokebench_env.observation import install_observation
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import read_state, render
from tests.env.test_feature_switches import _Shot, map_memory
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, Memory, game
from tests.env.test_live_map import tile
from tests.env.test_world_context import COORDS, world


def _special(behavior: int, collision: int) -> Callable[[], Memory]:
    def build() -> Memory:
        m = map_memory()
        m.put(0x02007000 + 2 * 3, struct.pack("<H", behavior))
        tile(m, 1, 2, collision | 3)
        return m

    return build


def _context() -> Memory:
    m = game(OVERWORLD)
    context = world()
    context.put(COORDS + 2, struct.pack("<h", 2))
    m.cells.update(context.cells)
    m.put(0x02037350, bytes(16 * 0x24))
    m.put(0x02037350, b"\x01\x00\x01")
    m.put(0x02037350 + 0x10, struct.pack("<hh", 17, 9))
    m.put(0x02037350 + 0x18, b"\x44")
    m.put(0x02037350 + 0x24, context.read(0x02037350, 0x24))
    m.put(SB1 + 0x139C + (0x4050 - 0x4000) * 2, struct.pack("<H", 1))
    return m


MEMORIES: dict[str, Callable[[], Memory]] = {
    "door": map_memory,
    "ledge": _special(0x3B, 0x400),
    "edge-wall": _special(0xC0, 0),
    "counter": _special(0x80, 0x400),
    "triggers": _context,
}

# Off sets the goldens cover; each also names this switch, so they are its OFF arm.
OFF_SETS: tuple[frozenset[str], ...] = (
    frozenset(),
    frozenset({"warp-activation-guidance-v1"}),
    frozenset({"named-warp-destinations-v1"}),
    frozenset({"ledge-hops-v1", "one-way-tiles-v1", "counter-talk-v1"}),
    frozenset({"full-map-navigation-v1"}),
    frozenset({"coordinate-script-conditions-v1"}),
    frozenset({"live-map-v1"}),
)


def observe(name: str, off: frozenset[str]) -> str:
    """The production server path: decode with the run's switches, then render."""
    state: GameState = read_state(MEMORIES[name]().read, MAPS, active_ui=False, off=off)
    if name == "triggers":
        state = replace(state, field_controls_locked=True)
    return render(state, off)


GOLDEN = Path(__file__).resolve().parent / "fixtures/readout-rules-off-ef9244e2.json"
GENERATED = Path(__file__).resolve().parents[3] / "packages/agent/src/map-rules.generated.ts"
LEGEND = "@ player; N live object; "
# Switches registered after the goldens were rendered at ef9244e2; OFF is their previous behavior.
ADJACENT = "adjacent-tiles-v1"
LATER = frozenset({"battle-triage-guidance-v1", ADJACENT})


def golden() -> list[tuple[str, frozenset[str], str]]:
    body = json.loads(GOLDEN.read_text())
    return [(c["state"], frozenset(c["off"]), c["text"]) for c in body["cases"]]


def legend_of(text: str) -> str | None:
    return next((line for line in text.split("\n") if line.startswith(LEGEND)), None)


def test_off_is_byte_identical_to_the_readout_before_the_switch() -> None:
    cases = golden()
    assert len(cases) == len(MEMORIES) * len(OFF_SETS)
    for name, off, text in cases:
        assert FEATURE in off
        assert observe(name, off | LATER) == text, (name, sorted(off))


def test_on_replaces_the_legend_with_the_pointer_and_drops_the_fixed_rules() -> None:
    # Every golden case, ON: the same readout minus exactly the fixed blocks, pointer in place,
    # with adjacent-tiles-v1 off (the goldens) and on (its Next tiles line stays above the pointer).
    for (name, off, golden_text), later in itertools.product(golden(), (LATER, LATER - {ADJACENT})):
        before = observe(name, off | later)
        assert later != LATER or before == golden_text
        after = observe(name, (off | later) - {FEATURE})
        section = prompt_section(off - {FEATURE})
        expected = []
        for line in before.split("\n"):
            if line.startswith(LEGEND):
                expected.append(POINTER)
                if "= counter:" in line:
                    expected.append(COUNTER_LINE)
            elif line in (TERRAIN_RULE, TRIGGER_ELEVATION_RULE) or line.startswith(
                "Warp destinations are "
            ):
                assert line in section.split("\n"), (name, sorted(off), line)
            else:
                expected.append(line)
        assert after.split("\n") == expected, (name, sorted(off))


def test_on_door_readout_lacks_all_three_map_blocks_and_keeps_the_rest() -> None:
    off = frozenset({"named-warp-destinations-v1"}) | LATER
    before, after = observe("door", off | {FEATURE}), observe("door", off)
    assert legend_of(before) is not None and legend_of(after) is None
    for block in (TERRAIN_RULE, "Warp destinations are", "see activation below"):
        assert block in before and block not in after
    rows = after.split("\n")
    assert rows[rows.index(POINTER) - 1].startswith("   4 "), after
    assert rows[rows.index(POINTER) + 1].startswith("Live objects: ")
    assert "Warps: (0,1) -> map 0/9 [door: approach from below and press UP toward door]" in rows
    assert len(before) - len(after) > 600


def test_on_trigger_readout_keeps_the_trigger_list_and_drops_only_the_elevation_rule() -> None:
    before, after = observe("triggers", frozenset({FEATURE})), observe("triggers", frozenset())
    assert TRIGGER_ELEVATION_RULE in before.split("\n")
    assert [line for line in before.split("\n") if line != TRIGGER_ELEVATION_RULE] == (
        after.split("\n")
    )
    assert "Nearby script-trigger tiles" in after and POINTER not in after


def test_a_drawn_counter_keeps_its_own_legend_line_because_it_depends_on_the_map() -> None:
    on = observe("counter", frozenset())
    rows = on.split("\n")
    assert rows[rows.index(POINTER) + 1] == COUNTER_LINE
    assert COUNTER_LINE == (
        "= counter: you cannot walk onto it, but you can talk to someone standing behind it by"
        " facing the counter and pressing A."
    )
    assert COUNTER_LINE not in observe("door", frozenset())
    for off in OFF_SETS:
        assert "= counter" not in prompt_section(off)


def test_a_whole_map_fallback_to_the_local_map_keeps_its_own_legend() -> None:
    # The prompt describes the whole map (no "?"); a local-map fallback must not lose "?".
    off: frozenset[str] = frozenset()
    state = replace(read_state(map_memory().read, MAPS, active_ui=False, off=off), full_map=None)
    text = render(state, off)
    assert legend_of(text) is not None and "? outside current map." in text
    assert POINTER not in text and TERRAIN_RULE in text
    assert "?" not in prompt_section(off)


def test_the_prompt_never_describes_a_glyph_this_configuration_cannot_draw() -> None:
    full = prompt_section(frozenset())
    assert full.split("\n")[0] == SECTION_HEADER
    assert "W warp location (each warp's activation is listed in the readout's Warps line);" in full
    assert "(sides listed in the readout's Edge walls line)" in full
    assert "see activation below" not in full and "? outside" not in full
    assert "one-way hop" not in prompt_section(frozenset({"ledge-hops-v1"}))
    assert "+ edge walls" not in prompt_section(frozenset({"one-way-tiles-v1"}))
    assert "? outside current map." in prompt_section(frozenset({"full-map-navigation-v1"}))
    guidance_off = prompt_section(frozenset({"warp-activation-guidance-v1"}))
    assert "W warp;" in guidance_off and "Warp destinations are" not in guidance_off
    assert "group/number IDs, not warp indexes" in prompt_section(
        frozenset({"named-warp-destinations-v1"})
    )
    assert prompt_section(frozenset({"live-map-v1"})) == (
        f"{SECTION_HEADER}\n{TRIGGER_ELEVATION_RULE}"
    )
    assert prompt_section(frozenset({"live-map-v1", "coordinate-script-conditions-v1"})) == ""
    assert TRIGGER_ELEVATION_RULE not in prompt_section(
        frozenset({"coordinate-script-conditions-v1"})
    )


def test_the_prompt_section_depends_only_on_its_listed_switches() -> None:
    assert MAP_RULE_SWITCHES == (
        "live-map-v1",
        "warp-activation-guidance-v1",
        "ledge-hops-v1",
        "one-way-tiles-v1",
        "full-map-navigation-v1",
        "named-warp-destinations-v1",
        "coordinate-script-conditions-v1",
    )
    assert set(MAP_RULE_SWITCHES) < set(SERVER_FEATURES)
    others = frozenset(SERVER_FEATURES) - set(MAP_RULE_SWITCHES)
    assert prompt_section(others) == prompt_section(frozenset())


def test_the_agent_table_is_generated_from_this_module_and_is_current() -> None:
    assert GENERATED.read_text() == render_ts(), "stale: run `just map-rules`"


def test_the_generated_table_holds_every_switch_combination(tmp_path: Path) -> None:
    out = tmp_path / "map-rules.generated.ts"
    assert map_rules_main([str(out)]) == 0
    text = out.read_text()
    assert text == render_ts()
    keys = re.findall(r'^  "([a-z0-9,-]*)": (\d+),?$', text, re.M)
    assert len(keys) == 2 ** len(MAP_RULE_SWITCHES)
    sections = json.loads(text.split("MAP_RULE_TEXTS: readonly string[] = ")[1].split(";\n")[0])
    for key, index in keys:
        off = frozenset(key.split(",")) if key else frozenset()
        assert sections[int(index)] == prompt_section(off)
    assert map_rules_main([]) == 2


def test_switch_is_registered_server_side_last_and_default_off() -> None:
    assert FEATURE in SERVER_FEATURES
    assert FEATURE in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": FEATURE}) == frozenset({FEATURE})


def test_the_observation_route_follows_the_env_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    texts = {}
    for raw in ("", FEATURE):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", raw)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        texts[raw] = json.loads(body)["state_text"]
    assert POINTER in texts[""] and TERRAIN_RULE not in texts[""]
    assert POINTER not in texts[FEATURE] and TERRAIN_RULE in texts[FEATURE]


def test_with_adjacent_tiles_on_the_map_reads_grid_then_next_tiles_then_the_pointer() -> None:
    # Both switches on: the Next tiles line stays directly under the grid, the pointer follows it.
    both_on, rules_off = observe("door", frozenset()), observe("door", frozenset({FEATURE}))
    rows, plain = both_on.split("\n"), rules_off.split("\n")
    nxt = next(i for i, line in enumerate(rows) if line.startswith("Next tiles"))
    assert rows[nxt - 1].startswith("   4 ") and rows[nxt + 1] == POINTER
    assert rows[nxt + 2].startswith("Live objects: ")
    # rules OFF with adjacent tiles ON keeps the legend right after the Next tiles line.
    nxt_off = next(i for i, line in enumerate(plain) if line.startswith("Next tiles"))
    assert plain[nxt_off] == rows[nxt] and plain[nxt_off + 1].startswith(LEGEND)
    assert plain[nxt_off + 2] == TERRAIN_RULE
    # Both off is the golden readout from before either switch.
    goldens = {(n, o): t for n, o, t in golden()}
    assert observe("door", frozenset({FEATURE}) | LATER) == goldens[("door", frozenset({FEATURE}))]
