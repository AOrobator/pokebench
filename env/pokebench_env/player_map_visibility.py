"""Player-visible terrain and current actors; hidden memory is never refreshed.

pret731ad5bf field_screen_effect.c sFlashLevelToRadius and its midpoint scanline
window; event_object_movement.c positions a field sprite at the tile's bottom
center. Rendered OAM includes camera pan. Addresses reuse the verified native
ObjectEvent/Sprite/layout readers. The central 8x8 pixels of a tile must be lit before its memory
attributes may be exposed; tiles outside that region remain unknown.
"""

import struct
import threading
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, TypeVar

from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS, FullMap, LocalMap, MapTile
from pokebench_env.map_layout import read_layout_context
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.naming import SPRITES
from pokebench_env.places import Links, Place

if TYPE_CHECKING:
    from pokebench_env.game_state import GameState

V2_SWITCH = "player-map-visibility-v2"


def visibility_enabled(off: frozenset[str]) -> bool:
    return V2_SWITCH not in off


RADII = (200, 72, 64, 56, 48, 40, 32, 24, 0)
SIZES = (
    ((8, 8), (16, 16), (32, 32), (64, 64)),
    ((16, 8), (32, 8), (32, 16), (64, 32)),
    ((8, 16), (8, 32), (16, 32), (32, 64)),
)
VIEWPORT = ((0, 240),) * 160
Point = tuple[int, int]
View = TypeVar("View", LocalMap, FullMap)


def place_names_only(places: Sequence[Place]) -> tuple[Place, ...]:
    # The global ROM link graph is not discovered terrain. Keep the name dictionary
    # for interpreting dialogue, without supplying hidden entrances or route distances.
    return tuple(replace(place, links=Links((), ())) for place in places)


def screen_visible(read: ReadMemory) -> bool:
    return (
        not read(PALETTE_FADE + 7, 1)[0] & 0x80
        and not int.from_bytes(read(0x04000000, 2), "little") & 0x80
        and any(read(0x05000000, 0x400))
    )


def illumination(read: ReadMemory, map_id: Point) -> tuple[tuple[int, int], ...] | None:
    layout = read_layout_context(read, map_id)
    # Pyramid uses a separate frontier light radius, not flashLevel.
    if layout is None or layout.flash_level is None or map_id == (26, 26):
        return None
    if layout.flash_level == 0:
        return VIEWPORT
    radius = RADII[layout.flash_level]
    rows = [(0, 0)] * 160
    r, error, y = radius, radius, 0
    while r >= y:
        for row, left, right in (
            (80 - y, 120 - r, 120 + r),
            (80 + y, 120 - r, 120 + r),
            (80 - r, 120 - y, 120 + y),
            (80 + r, 120 - y, 120 + y),
        ):
            if 0 <= row < 160:
                rows[row] = (max(0, left), min(240, right))
        error -= y * 2 - 1
        y += 1
        if error < 0:
            error += 2 * (r - 1)
            r -= 1
    return tuple(rows)


def sprite_rect(read: ReadMemory, body: bytes) -> tuple[int, int, int, int] | None:
    if not body[0] & 1 or body[1] & 0x60 or body[4] >= 64:
        return None
    sprite = read(SPRITES + body[4] * 0x44, 0x44)
    if len(sprite) != 0x44 or not sprite[0x3E] & 1 or sprite[0x3E] & 4:
        return None
    attr0, attr1 = struct.unpack_from("<HH", sprite)
    shape, size = attr0 >> 14, attr1 >> 14
    if shape == 3:
        return None
    width, height = SIZES[shape][size]
    x, y = attr1 & 511, attr0 & 255
    x = x - 512 if x >= 256 else x
    y = y - 256 if y >= 160 else y
    return x, y, width, height


def lit_rect(rows: tuple[Point, ...], rect: tuple[int, int, int, int]) -> bool:
    x, y, width, height = rect
    return (
        0 <= x
        and x + width <= 240
        and 0 <= y
        and y + height <= 160
        and all(left <= x and x + width <= right for left, right in rows[y : y + height])
    )


@dataclass(frozen=True)
class MapVisibility:
    known: tuple[Point, ...]
    visible: tuple[Point, ...]
    diagnostic: str | None

    def json(self) -> dict[str, object]:
        return {
            "known": [list(p) for p in self.known],
            "visible": [list(p) for p in self.visible],
            "diagnostic": self.diagnostic,
        }


@dataclass
class Discovered:
    tiles: dict[Point, MapTile]
    glyphs: dict[Point, str]
    warps: dict[Point, tuple[int, int, int, int]]


class MapMemory:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.frame: int | None = None
        self.maps: dict[tuple[int, ...], Discovered] = {}

    def project(self, read: ReadMemory, state: "GameState") -> "GameState":
        with self.lock:
            frame = int.from_bytes(read(GMAIN + 0x20, 4), "little")
            if self.frame is not None and frame < self.frame:
                self.maps.clear()
            self.frame = frame
            return self._project(read, state)

    def _project(self, read: ReadMemory, state: "GameState") -> "GameState":
        if state.map_id is None or state.position is None:
            return state
        layout = read_layout_context(read, state.map_id)
        shown = state.full_map or state.nearby
        if shown is None:
            return self._filter(
                state,
                frozenset(),
                frozenset(),
                frozenset(),
                MapVisibility((), (), "current map geometry unavailable"),
            )
        key = (
            *state.map_id,
            -1 if layout is None else layout.layout_id,
            len(shown.rows[0]),
            len(shown.rows),
        )
        if key not in self.maps:
            self.maps[key] = Discovered({}, {}, {})
        memory = self.maps[key]
        rows = illumination(read, state.map_id)
        bodies = read(OBJECT_EVENTS, 16 * 0x24)
        players = [
            bodies[i : i + 0x24]
            for i in range(0, len(bodies), 0x24)
            if bodies[i] & 1 and bodies[i + 2] & 1
        ]
        player = players[0] if len(players) == 1 else None
        rect = None if player is None else sprite_rect(read, player)
        rendered = screen_visible(read)
        # ObjectEvent map IDs identify its spawn map; connected-map camera updates
        # shift coordinates without updating them (pret731ad5bf event_object_movement.c).
        overworld = rendered and state.screen == "overworld" and not state.in_battle
        located = (
            overworld
            and player is not None
            and tuple(v - MAP_OFFSET for v in struct.unpack_from("<hh", player, 0x10))
            == state.position
            and player[0x10:0x14] == player[0x14:0x18]
        )
        # A script that holds field controls moves the player; it does not change what the map is.
        # On a fully lit layout every in-bounds tile is visible by its own light, so the lock may
        # withhold the player-relative proof but never the element layer. Run
        # 2026-11-01T09-10-00_deepseek-v4.1-flash_control24h seq 84184: a forced move inside
        # Mauville Gym emptied this set, which filtered every barrier/switch element out of the
        # observation and drew closed electric gates as plain '#' walls. A hidden or unreadable
        # player sprite still withholds the whole map: the lock is the only proof relaxed here.
        lit = layout is not None and layout.flash_level == 0
        can_see = located and rect is not None and (lit or rows is not None)
        visible: set[Point] = set()
        actors: set[int] = set()
        if can_see:
            center = None
            if rect is not None:
                px, py, width, height = rect
                # Field sprite feet are the tile bottom center; its tile center is 8px above.
                assert player is not None
                offsets = read(SPRITES + player[4] * 0x44 + 0x24, 4)
                dx2, dy2 = struct.unpack("<hh", offsets)
                center = (px + width // 2 - dx2, py + height - 8 - dy2)
            ox, oy = shown.origin
            for tile in shown.tiles:
                dx, dy = tile.x - state.position[0], tile.y - state.position[1]
                if lit or (
                    center is not None
                    and rows is not None
                    and lit_rect(rows, (center[0] + dx * 16 - 4, center[1] + dy * 16 - 4, 8, 8))
                ):
                    point = (tile.x, tile.y)
                    visible.add(point)
                    memory.tiles[point] = tile
                    glyph = shown.rows[tile.y - oy][tile.x - ox]
                    memory.glyphs[point] = (
                        ("#" if tile.collision else ".") if glyph in "@N" else glyph
                    )
            for point in visible:
                memory.warps.pop(point, None)
            for warp in shown.warps:
                if warp[:2] in visible:
                    memory.warps[warp[:2]] = warp
        if (
            rendered
            and state.screen == "overworld"
            and not state.in_battle
            and rows is not None
            and (state.field_controls_locked is False or rows == VIEWPORT)
        ):
            for i in range(0, len(bodies), 0x24):
                body = bodies[i : i + 0x24]
                actor_rect = sprite_rect(read, body)
                if (
                    (body[10], body[9]) == state.map_id
                    and actor_rect is not None
                    and lit_rect(rows, actor_rect)
                ):
                    actors.add(body[8])
        known = frozenset(memory.tiles)
        visibility = MapVisibility(
            tuple(sorted(known)),
            tuple(sorted(visible)),
            None if can_see else "current map visibility unavailable",
        )

        position = state.position

        def view(original: View) -> View:
            ox, oy = original.origin
            current_rows = tuple(
                "".join(memory.glyphs.get((x + ox, y + oy), "?") for x in range(len(row)))
                for y, row in enumerate(original.rows)
            )
            inside = {
                (x + ox, y + oy) for y, row in enumerate(original.rows) for x in range(len(row))
            }
            objects = tuple(o for o in original.objects if o[0] in actors)
            cells = [list(r) for r in current_rows]
            for _, x, y in objects:
                if (x, y) in inside and (x, y) in visible:
                    cells[y - oy][x - ox] = "N"
            x, y = position
            if (x, y) in inside and (x, y) in known:
                cells[y - oy][x - ox] = "@"
            return replace(
                original,
                rows=tuple("".join(r) for r in cells),
                tiles=tuple(t for p, t in memory.tiles.items() if p in inside),
                objects=objects,
                warps=tuple(w for p, w in memory.warps.items() if p in inside),
            )

        state = replace(
            state,
            full_map=None if state.full_map is None else view(state.full_map),
            nearby=None if state.nearby is None else view(state.nearby),
            map_visibility=visibility,
            local_map=None,
        )
        return self._filter(state, known, frozenset(visible), frozenset(actors), visibility)

    @staticmethod
    def _filter(
        state: "GameState",
        known: frozenset[Point],
        visible: frozenset[Point],
        actors: frozenset[int],
        visibility: MapVisibility | None,
    ) -> "GameState":
        context = state.world_context
        targets = state.interaction_targets
        observation = state.map_observation
        topology = state.topology
        trainers = state.heal_trainers
        actor_tiles = frozenset(
            (o.x, o.y) for o in (() if context is None else context.objects) if o.local_id in actors
        )
        respawn = state.respawn
        return replace(
            state,
            local_map=None,
            world_context=None
            if context is None
            else replace(
                context,
                objects=tuple(o for o in context.objects if o.local_id in actors),
                triggers=tuple(t for t in context.triggers if (t.x, t.y) in visible),
            ),
            interaction_targets=None
            if targets is None
            else tuple(
                t
                for t in targets
                if (t.x, t.y) in visible and (t.kind != "object" or t.local_id in actors)
            ),
            interaction_object_slots=None
            if state.interaction_object_slots is None
            else tuple(s for s in state.interaction_object_slots if s.local_id in actors),
            heal_trainers=None
            if trainers is None
            else replace(
                trainers,
                trainers=tuple(t for t in trainers.trainers if t.loaded and t.local_id in actors),
            ),
            offscreen_objects=None,
            static_npc_templates=None,
            story_characters=None,
            respawn=None
            if respawn is None
            else replace(
                respawn,
                hops=None,
                centers=tuple(
                    c
                    for c in respawn.centers
                    if (c.x is None and c.y is None) or (c.x, c.y) in visible
                ),
            ),
            exit_labels=None,
            exit_sections=None,
            # exit-reachability-v1, surf-gated-exits-v1, field-move-gates-v1: the flood's verdict on
            # every exit of this map, computed from the full map the state already carries
            # (map_grid, topology, and the exits those list), so keeping it reveals nothing the
            # projection does not already deliver. Nulling it left every exit looking walkable:
            # the readout could not say "not reachable on foot" and the model walked at doors
            # sealed behind another map's half (ROUTE104 at (39,62), 2026-11-02).
            exit_reach=state.exit_reach,
            surf_gate=state.surf_gate,
            field_obstacles=state.field_obstacles,
            resources=None
            if state.resources is None
            else replace(state.resources, berry_trees=None, planted_berries=None),
            overhead_cover=None,
            berry_readout=None,
            object_elevations=None
            if state.object_elevations is None
            else tuple(o for o in state.object_elevations if o[:2] in actor_tiles),
            topology=None
            if topology is None
            else replace(
                topology,
                connections=tuple(
                    replace(c, edges=tuple(p for p in c.edges or () if p in visible))
                    for c in topology.connections
                    if any(p in visible for p in c.edges or ())
                ),
            ),
            map_observation=None
            if observation is None
            else replace(
                observation,
                elements=tuple(
                    e
                    for e in observation.elements
                    if (e.x, e.y) in visible
                    and (e.edge is None or (e.edge[:2] in visible and e.edge[2:] in visible))
                ),
            ),
            map_visibility=visibility,
        )
