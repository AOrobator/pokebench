"""compact-map-grid-v1: the observed-elements grid with short codes is lossless at every pret layout size."""

import json
import os
import random
import re
from pathlib import Path

import pytest

from pokebench_env.live_map import FullMap, MapTile
from pokebench_env.map_observation import build_observation, render_observation
from pokebench_env.map_observation_types import MapElement

PRET = Path(os.environ.get("POKEEMERALD_DIR", Path.home() / "dev" / "pokeemerald"))
LAYOUTS = PRET / "data" / "layouts" / "layouts.json"
# The extremes the game ships (80x80 Routes 124/126/127, 40x140 Routes 111/119) and small odd shapes,
# used when no pret checkout is present.
FALLBACK_SIZES = [(80, 80), (40, 140), (1, 1), (5, 3), (12, 100), (100, 12)]


def layout_sizes() -> list[tuple[int, int]]:
    if not LAYOUTS.exists():
        return FALLBACK_SIZES
    layouts = json.loads(LAYOUTS.read_text())["layouts"]
    return sorted({(lay["width"], lay["height"]) for lay in layouts if "width" in lay})


def synthetic(width: int, height: int, seed: int) -> tuple[FullMap, tuple[MapElement, ...]]:
    rng = random.Random(seed)
    rows = tuple("".join(rng.choice(".#g~") for _ in range(width)) for _ in range(height))
    tiles = tuple(MapTile(x, y, 0, 0, 0) for y in range(height) for x in range(width))
    shown = FullMap(width, height, rows, tiles, (), ())
    elements: list[MapElement] = []
    for _ in range(max(1, width * height // 6)):
        x, y = rng.randrange(width), rng.randrange(height)
        elements.append(rng.choice((
            MapElement("water", x, y, state="o"),
            MapElement("other_level", x, y, state="1"),
            MapElement("encounter_ground", x, y, state="g"),
            MapElement("bridge", x, y, state="reflection_below"),
            MapElement("switch", x, y, color="blue"),
            MapElement("arrow", x, y, direction="east", color="red"),
        )))
    for k in range(min(6, width * height // 4)):
        x, y = rng.randrange(width), rng.randrange(height)
        if x + 1 < width:
            elements.append(MapElement("rotating_gate", x, y, state="arm", group=f"gate:{k}", edge=(x, y, x + 1, y)))
        if y + 1 < height:
            elements.append(MapElement("rotating_gate", x, y, state="arm", group=f"gate:{k}", edge=(x, y, x, y + 1)))
        elements.append(MapElement("rotating_gate", x, y, state="pivot", group=f"gate:{k}"))
    return shown, tuple(elements)


def parse(text: str) -> dict[str, object]:
    """Cells, gate marks and junctions of either form, by the column positions its header implies."""
    lines = text.split("\n")
    title = lines[0]
    compact = "compact codes" in title
    codes: dict[str, str] = {}
    i = 1
    if compact:
        assert lines[1].startswith("Codes:")
        for part in lines[1][len("Codes: "):].split("; ") if lines[1] != "Codes: none" else []:
            code, token = part.split(" = ", 1)
            codes[code] = token
        i = 2
    header = []
    while lines[i][:4].strip() == "" and lines[i].strip() != "" and set(lines[i].strip()) <= set("0123456789 "):
        header.append(lines[i])
        i += 1
    if compact:
        width = max([1, *(len(c) for c in codes)])
        columns = max(len(h) for h in header)
        ends = list(range(4 + width, columns + 1, width + 1))
    else:
        ends = [m.end() - 1 for m in re.finditer(r"\d+", header[0])]
    starts = [5] + [e + 2 for e in ends[:-1]]
    cells, vertical, horizontal, junctions = [], set(), set(), set()
    y = -1
    body = lines[i:]
    end = next(k for k, line in enumerate(body) if line.startswith("Base glyph"))
    for line in body[:end]:
        if line[:4].strip().isdigit():
            y += 1
            padded = line.ljust(ends[-1] + 2)
            row = []
            for x, (s, e) in enumerate(zip(starts, ends)):
                tok = padded[s:e + 1].strip()
                row.append(codes.get(tok, tok))
                if padded[e + 1] == "|":
                    vertical.add((x, y))
            if padded[4] == "|":
                vertical.add((-1, y))
            cells.append(row)
        else:
            padded = line.ljust(ends[-1] + 2)
            for x, (s, e) in enumerate(zip(starts, ends)):
                if "-" in padded[s:e + 1]:
                    horizontal.add((x, y))
                if padded[e + 1] == "*":
                    junctions.add((x + 1, y + 1))
            if padded[4] == "*":
                junctions.add((0, y + 1))
    return {"cells": cells, "vertical": vertical, "horizontal": horizontal, "junctions": junctions, "rest": "\n".join(body[end:])}


@pytest.mark.parametrize("width,height", layout_sizes())
def test_compact_codes_round_trip_every_pret_layout_size(width: int, height: int) -> None:
    shown, elements = synthetic(width, height, width * 1000 + height)
    observation = build_observation(shown, (0, 0), elements)
    verbose = render_observation(shown, observation)
    compact = render_observation(shown, observation, compact=True)
    assert compact.startswith("Current map (observed elements v1, compact codes); top-left (0,0)")
    assert parse(compact) == parse(verbose)
    if width * height >= 400:
        assert len(compact) < len(verbose) * 0.6


def test_compact_is_off_by_default_and_codes_skip_glyph_letters() -> None:
    shown, elements = synthetic(6, 2, 7)
    observation = build_observation(shown, (0, 0), elements)
    assert render_observation(shown, observation) == render_observation(shown, observation, compact=False)
    compact = render_observation(shown, observation, compact=True)
    codes = compact.split("\n")[1]
    assert codes.startswith("Codes: ")
    for code in re.findall(r"(?:^Codes: |; )(\S+) = ", codes):
        assert code not in {"g", "W", "N", "v", "#", ".", "~", "@", "+", "^", "<", ">"}


def test_compact_header_reads_multi_digit_columns_top_to_bottom() -> None:
    shown, elements = synthetic(12, 1, 3)
    compact = render_observation(shown, build_observation(shown, (0, 0), elements), compact=True)
    tens, ones = compact.split("\n")[2:4]
    assert tens.rstrip().endswith("1 1") and ones.rstrip().endswith("0 1")


def test_server_switch_is_default_off_and_only_recodes_the_grid() -> None:
    from test_map_observation_wiring import MAPS, map_memory, off_set

    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
    from pokebench_env.rerender import read_state, render

    switch = "compact-map-grid-v1"
    assert switch in SERVER_FEATURES and switch in features_off_from_env({})
    state = read_state(map_memory().read, MAPS, active_ui=False, off=off_set())
    verbose = render(state, off_set())
    compact = render(state, off_set() - {switch})
    assert "observed elements v1)" in verbose and "compact codes" not in verbose
    assert "Current map (observed elements v1, compact codes)" in compact
    grid = slice(compact.index("Current map"), compact.index("Base glyph"))
    assert parse(compact[grid.start:]) == parse(verbose[verbose.index("Current map"):])
    assert compact[: grid.start] == verbose[: verbose.index("Current map")]
    assert compact[grid.stop:] == verbose[verbose.index("Base glyph"):]
