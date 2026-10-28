"""One observation-only presentation of current map elements and edge geometry."""

from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.map_layout import LayoutContext
from pokebench_env.map_observation_types import MapElement
from pokebench_env.map_terrain_elements import terrain_effect, terrain_elements
from pokebench_env.map_tile_elements import tile_elements
from pokebench_env.mauville_puzzle import HORIZONTAL, MAP, SWITCHES, VERTICAL

if TYPE_CHECKING:
    from pokebench_env.field_moves import MapGates

SWITCH = "map-observability-v1"
KIND_TOKENS = {
    "switch": "S",
    "arrow": "A",
    "barrier": "B",
    "door": "D",
    "generator": "G",
    "rotating_gate": "R",
    "ice": "I",
    "slippery_floor": "Sl",
    "cracked_floor": "Cf",
    "hole": "H",
    "forced_walk": "Fw",
    "forced_slide": "Fs",
    "current": "C",
    "muddy_slope": "Ms",
    "bumpy_slope": "Bs",
    "rail": "Rl",
    "water": "Wa",
    "waterfall": "Wf",
    "bridge": "Br",
    "log": "Lg",
    "jump_mat": "Jm",
    "spin_mat": "Sm",
    "warp": "Wp",
    "puzzle_door": "Pd",
    "room_door": "Rd",
    "closed_door": "Cd",
    "pyramid_exit": "Pe",
    "secret_base_entrance": "Se",
    "encounter_ground": "Eg",
    "ground": "Gr",
    "decoration": "Dc",
    "other_level": "Lv",
    "sandstorm_boundary": "Ss",
}
STATE_TOKENS = {
    "raised": "up",
    "pressed": "dn",
    "blocked": "X",
    "open": "O",
    "locked": "L",
    "unlocked": "U",
    "transitioning": "?",
    "on": "1",
    "off": "0",
    "arm": "a",
    "pivot": "+",
    "thin": "t",
    "cracked": "c",
    "deep": "d",
    "grass": "g",
    "long_grass": "lg",
    "indoor": "in",
    "cave": "cv",
    "pond": "p",
    "ocean": "o",
}
DIRECTION_TOKENS = {"north": "^", "east": ">", "south": "v", "west": "<"}
COLOR_TOKENS = {"yellow": "Y", "blue": "B", "green": "G", "purple": "P", "red": "R"}


def element_token(element: MapElement) -> str:
    parts = [KIND_TOKENS[element.kind]]
    if element.state is not None:
        parts.append(STATE_TOKENS.get(element.state, element.state))
    if element.color is not None:
        parts.append(COLOR_TOKENS[element.color])
    if element.direction is not None:
        parts.append(DIRECTION_TOKENS[element.direction])
    if element.orientation is not None:
        parts.append(str(element.orientation))
    return ":".join(parts)


def element_label(element: MapElement) -> str:
    noun = "ground" if element.kind == "encounter_ground" else element.kind.replace("_", " ")
    words = [v for v in (element.color, noun, element.direction) if v is not None]
    if element.state is not None:
        words.append(f"({element.state.replace('_', ' ')})")
    if element.orientation is not None:
        words.append(f"orientation {element.orientation * 90} degrees")
    label = " ".join(words)
    if element.kind == "sandstorm_boundary":
        from pokebench_env.terrain_visibility import SANDSTORM

        label += f"; {SANDSTORM[2]}"
    return label


def _element_json(element: MapElement) -> dict[str, object]:
    return {
        k: list(v) if isinstance(v, tuple) else v
        for k, v in asdict(element).items()
        if v is not None
    }


@dataclass(frozen=True)
class MapObservation:
    map_id: tuple[int, int]
    origin: tuple[int, int]
    width: int
    height: int
    elements: tuple[MapElement, ...]
    unavailable: tuple[str, ...] = ()
    layout: LayoutContext | None = None

    def json(self) -> dict[str, object]:
        body: dict[str, object] = {
            "version": 1,
            "map_id": list(self.map_id),
            "origin": list(self.origin),
            "width": self.width,
            "height": self.height,
            "elements": [_element_json(e) for e in self.elements],
            "unavailable": list(self.unavailable),
        }
        if self.layout is not None:
            body["layout"] = {k: v for k, v in asdict(self.layout).items() if v is not None}
        return body


def _inside(shown: LocalMap | FullMap, x: int, y: int) -> bool:
    ox, oy = shown.origin
    return 0 <= y - oy < len(shown.rows) and 0 <= x - ox < len(shown.rows[y - oy])


def build_observation(
    shown: LocalMap | FullMap,
    map_id: tuple[int, int],
    elements: tuple[MapElement, ...],
    unavailable: tuple[str, ...] = (),
    layout: LayoutContext | None = None,
) -> MapObservation:
    current = tuple(e for e in elements if _inside(shown, e.x, e.y))
    return MapObservation(
        map_id, shown.origin, len(shown.rows[0]), len(shown.rows), current, unavailable, layout
    )


def observed_elements(
    shown: LocalMap | FullMap,
    map_id: tuple[int, int],
    player_elevation: int | None = None,
    avatar_flags: int | None = None,
    *,
    field_gates: "MapGates | None" = None,
) -> tuple[MapElement, ...]:
    result: list[MapElement] = []
    sand = {
        tile
        for obstacle in (() if field_gates is None else field_gates.obstacles)
        if obstacle.gate == "go_goggles"
        and field_gates is not None
        and field_gates.closed(obstacle)
        for tile in obstacle.tiles
    }
    for tile in shown.tiles:
        specific = tile_elements(map_id, tile)
        if map_id == MAP:
            status = SWITCHES.get(tile.metatile)
            if status is not None:
                specific = (MapElement("switch", tile.x, tile.y, state=status),)
            elif tile.metatile in HORIZONTAL or tile.metatile in VERTICAL.get((tile.x, tile.y), ()):
                specific = (
                    MapElement(
                        "barrier", tile.x, tile.y, state="blocked" if tile.collision else "open"
                    ),
                )
        result.extend(specific or terrain_elements(tile, map_id))
        if (tile.x, tile.y) in sand and not tile.collision:
            result.append(MapElement("sandstorm_boundary", tile.x, tile.y, state="blocked"))
        if (
            player_elevation is not None
            and avatar_flags is not None
            and not avatar_flags & 8
            and not tile.collision
        ):
            from pokebench_env.elevation_view import mismatch

            if mismatch(player_elevation, tile.elevation):
                result.append(MapElement("other_level", tile.x, tile.y, state=str(tile.elevation)))
    return tuple(result)


def labels_at(
    observation: MapObservation,
    x: int,
    y: int,
    *,
    tile: MapTile | None = None,
    terrain: bool = False,
) -> tuple[str, ...]:
    return tuple(
        element_label(e)
        + (
            f"; {effect}"
            if terrain and tile is not None and (effect := terrain_effect(e, tile)) is not None
            else ""
        )
        for e in observation.elements
        if (e.x, e.y) == (x, y) and e.edge is None and e.kind != "rotating_gate"
    )


# Codes never reuse a one-character glyph (W warp, N object, g grass, v ledge and the rest), so a
# code can never be mistaken for a glyph; one-letter codes run out before two-letter ones start.
CODE_LETTERS = "ABCDEFGHIJKLMOPQRSTUXYZabcdefhijklmnopqrstuwxyz"


def compact_codes(rendered: list[list[str]]) -> dict[str, str]:
    glyphs = {token for row in rendered for token in row if len(token) == 1}
    letters = [c for c in CODE_LETTERS if c not in glyphs]
    codes: dict[str, str] = {}
    for row in rendered:
        for token in row:
            if len(token) > 1 and token not in codes:
                n = len(codes)
                if n < len(letters):
                    codes[token] = letters[n]
                else:
                    codes[token] = letters[n // len(letters) - 1] + letters[n % len(letters)]
    return codes


def render_observation(
    shown: LocalMap | FullMap,
    observation: MapObservation,
    *,
    ledges: bool = True,
    edge_walls: bool = True,
    counters: bool = True,
    terrain: bool = False,
    compact: bool = False,
) -> str:
    cells: dict[tuple[int, int], list[str]] = defaultdict(list)
    vertical: dict[tuple[int, int], str] = {}
    horizontal: dict[tuple[int, int], str] = {}
    junctions: set[tuple[int, int]] = set()
    legend: dict[str, str] = {}
    groups: dict[str, list[str]] = defaultdict(list)
    detailed: set[str] = set()
    tiles = {(tile.x, tile.y): tile for tile in shown.tiles}
    effects: dict[str, str] = {}
    for element in observation.elements:
        token, label = element_token(element), element_label(element)
        if token in legend and legend[token] != label:
            raise ValueError(f"ambiguous map token {token}")
        legend[token] = label
        tile = tiles.get((element.x, element.y))
        if terrain and tile is not None and (effect := terrain_effect(element, tile)) is not None:
            effects[token] = effect
        at = f"({element.x},{element.y})"
        if element.edge is not None:
            ax, ay, bx, by = element.edge
            at = f"edge ({ax},{ay})-({bx},{by})"
            if ay == by:
                vertical[(min(ax, bx), ay)] = "|"
            elif ax == bx:
                horizontal[(ax, min(ay, by))] = "-"
        elif element.kind == "rotating_gate":
            if element.state == "pivot":
                junctions.add((element.x, element.y))
                at = f"junction ({element.x},{element.y})"
            else:
                at = "transitioning in this view; settled edge geometry unavailable"
        else:
            cells[(element.x, element.y)].append(token)
        grouped_label = (
            f"{label} [{element.group}]"
            if element.kind == "rotating_gate" and element.group is not None
            else label
        )
        groups[grouped_label].append(at)
        if element.kind in {"switch", "arrow", "barrier", "door", "generator", "rotating_gate"}:
            detailed.add(grouped_label)
    ox, oy = observation.origin
    rendered: list[list[str]] = []
    base_cells = shown.cells(ledges=ledges, edge_walls=edge_walls, counters=counters)
    for row_index, row in enumerate(base_cells):
        output = []
        for column, glyph in enumerate(row):
            underlying = cells.get((ox + column, oy + row_index), [])
            annotation = "/".join(underlying)
            output.append(f"{glyph}/{annotation}" if annotation else glyph)
        rendered.append(output)
    if compact:
        # compact-map-grid-v1: each multi-character token is shown by its code from the Codes line,
        # columns share one width and column numbers read top to bottom. Nothing is cut or dropped.
        codes = compact_codes(rendered)
        rendered = [[codes.get(token, token) for token in row] for row in rendered]
        width = max([1, *(len(code) for code in codes.values())])
        widths = [width] * observation.width
        digits = len(str(ox + observation.width - 1))
        numbers = [str(ox + x).rjust(digits) for x in range(observation.width)]
        lines = [
            "Current map (observed elements v1, compact codes); "
            f"top-left ({ox},{oy}), north is up:",
            "Codes: " + ("; ".join(f"{code} = {token}" for token, code in codes.items()) or "none"),
            *(
                ("     " + " ".join(n[place].rjust(width) for n in numbers)).rstrip()
                for place in range(digits)
            ),
        ]
    else:
        widths = [
            max(3, len(str(ox + x)), *(len(row[x]) for row in rendered))
            for x in range(observation.width)
        ]
        lines = [
            f"Current map (observed elements v1); top-left ({ox},{oy}), north is up:",
            "     " + " ".join(str(ox + x).rjust(widths[x]) for x in range(observation.width)),
        ]
    if any(
        (ox + x, oy - 1) in horizontal or (ox + x, oy) in junctions
        for x in range(observation.width + 1)
    ):
        boundary = "    " + ("*" if (ox, oy) in junctions else " ")
        for x in range(observation.width):
            boundary += ("-" * widths[x]) if (ox + x, oy - 1) in horizontal else " " * widths[x]
            boundary += "*" if (ox + x + 1, oy) in junctions else " "
        lines.append(boundary.rstrip())
    for y, cell_row in enumerate(rendered):
        text = f"{oy + y:4}" + vertical.get((ox - 1, oy + y), " ")
        for x, token in enumerate(cell_row):
            text += token.rjust(widths[x]) + vertical.get((ox + x, oy + y), " ")
        lines.append(text.rstrip())
        if any(
            (ox + x, oy + y) in horizontal or (ox + x, oy + y + 1) in junctions
            for x in range(observation.width + 1)
        ):
            boundary = "    " + ("*" if (ox, oy + y + 1) in junctions else " ")
            for x in range(observation.width):
                boundary += ("-" * widths[x]) if (ox + x, oy + y) in horizontal else " " * widths[x]
                boundary += "*" if (ox + x + 1, oy + y + 1) in junctions else " "
            lines.append(boundary.rstrip())
    lines.append(
        "Base glyph / element token preserves both layers; @ player, N object, W warp. "
        "Gate | and - between cells mark edges; * marks a gate junction, not a solid cell. "
        "A + inside a cell remains a base edge wall."
    )
    if legend:
        lines.append(
            "Element legend: "
            + "; ".join(
                f"{k} = {v}" + (f"; on collision-clear tiles: {effects[k]}" if k in effects else "")
                for k, v in legend.items()
            )
        )
        lines.extend(
            f"Now {label}: "
            + (
                ", ".join(places)
                if label in detailed or len(places) <= 8
                else f"{len(places)} tiles; positions are marked in the grid"
            )
            for label, places in groups.items()
        )
    if observation.layout is not None:
        layout = observation.layout
        lines.append(
            f"Current layout: {layout.layout_id}"
            + (f" ({layout.variant})" if layout.variant is not None else "")
            + (
                f"; darkness level {layout.flash_level}"
                if layout.flash_level is not None
                else "; darkness level unavailable"
            )
        )
    lines.extend(f"Map detail unavailable: {reason}" for reason in observation.unavailable)
    return "\n".join(lines)
