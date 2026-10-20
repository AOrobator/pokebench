"""trainer-sight-check-v1: which tiles of a planned walk an unbeaten trainer on this map can see.

pret/pokeemerald 731ad5bf, src/trainer_see.c. The agent posts navigate_to's planned route to
POST /pokebench/trainer-sight before it walks; nothing here reaches the readout or the state JSON.

- CheckForTrainersWantingBattle runs whenever field input is processed and checks every active
  object whose trainerType is TRAINER_TYPE_NORMAL (1) or TRAINER_TYPE_BURIED (3);
  TRAINER_TYPE_SEE_ALL_DIRECTIONS (2) is not checked there.
- CheckTrainer skips a trainer whose flag is set (GetTrainerFlagFromScriptPointer: the trainer id
  after the trainerbattle opcode and battle type, flag TRAINER_FLAGS_START + id). A double battle
  script (TRAINER_BATTLE_DOUBLE, _CONTINUE_SCRIPT_DOUBLE, _REMATCH_DOUBLE) needs two party Pokémon
  that can battle (GetMonsStateToDoubles_2); the agent decides that from the party it has.
- GetTrainerApproachDistance: a NORMAL trainer looks only along facingDirection, a BURIED one
  along all four directions, up to trainerRange_berryTreeId tiles on its own row or column.
- CheckPathBetweenTrainerAndPlayer: each tile strictly between must have no collision flag but
  "outside movement range" (GetCollisionFlagsAtCoords); on the player's tile, with the range
  zeroed, GetCollisionAtCoords must reach the player object, so impassable and elevation
  mismatch fail first.
- Objects not loaded are tested at their template tile (SaveBlock1.objectEventTemplates) with
  every direction their movement type faces (gInitialMovementTypeFacingDirections and the turning
  types); a wandering type anywhere in its movement range. Loaded objects (gObjectEvents) are
  tested at their tile now with their facing now plus their movement type's directions, since
  the trainer can turn or move before the player gets there.
"""

import struct
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from pokebench_env.character_presence import TEMPLATE_COUNT, TEMPLATES, _flag, _graphics
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import (
    EDGE_WALLS,
    MAP_OFFSET,
    OBJECT_EVENTS,
    _behavior,
    _layout,
)
from pokebench_env.world_context import GRAPHICS

SWITCH = "trainer-sight-check-v1"
SAVE_BLOCK_PTRS = 0x03005D8C
TRAINERBATTLE = 0x5C
FIELD_BATTLE_TYPES = range(0, 9)
DOUBLE_BATTLE_TYPES = frozenset({4, 6, 7})
TRAINER_FLAGS_START = 0x500
TRAINERS_COUNT = 855
TRAINER_TYPE_NORMAL = 1
TRAINER_TYPE_BURIED = 3
SIGHT_TYPES = frozenset({TRAINER_TYPE_NORMAL, TRAINER_TYPE_BURIED})
ROM = range(0x08000000, 0x0A000000)
MAX_ROUTE_TILES = 1024

# DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST (include/constants/global.h) and their vectors.
SOUTH, NORTH, WEST, EAST = 1, 2, 3, 4
ALL = (SOUTH, NORTH, WEST, EAST)
VECTORS = {SOUTH: (0, 1), NORTH: (0, -1), WEST: (-1, 0), EAST: (1, 0)}
NAMES = {SOUTH: "DOWN", NORTH: "UP", WEST: "LEFT", EAST: "RIGHT"}
# The side of a tile a step in this direction enters (live_map.EDGE_WALLS names the sides
# MetatileBehavior_Is{North,South,West,East}Blocked refuse).
ENTERED_SIDE = {SOUTH: "north", NORTH: "south", WEST: "east", EAST: "west"}
EXIT_SIDE = {SOUTH: "south", NORTH: "north", WEST: "west", EAST: "east"}

# include/constants/event_object_movement.h: the directions each movement type faces.
_TURNING: dict[int, tuple[int, ...]] = {
    0x01: ALL,  # LOOK_AROUND
    0x02: ALL,  # WANDER_AROUND
    0x03: (NORTH, SOUTH),
    0x04: (SOUTH, NORTH),
    0x05: (WEST, EAST),
    0x06: (EAST, WEST),
    0x0D: (SOUTH, NORTH),  # FACE_DOWN_AND_UP
    0x0E: (WEST, EAST),
    0x0F: (NORTH, WEST),
    0x10: (NORTH, EAST),
    0x11: (SOUTH, WEST),
    0x12: (SOUTH, EAST),
    0x13: (SOUTH, NORTH, WEST),
    0x14: (SOUTH, NORTH, EAST),
    0x15: (NORTH, WEST, EAST),
    0x16: (SOUTH, WEST, EAST),
    0x17: ALL,  # ROTATE_COUNTERCLOCKWISE
    0x18: ALL,  # ROTATE_CLOCKWISE
    0x19: (NORTH, SOUTH),  # WALK_UP_AND_DOWN
    0x1A: (SOUTH, NORTH),
    0x1B: (WEST, EAST),
    0x1C: (EAST, WEST),
    **{t: ALL for t in range(0x1D, 0x35)},  # WALK_SEQUENCE_*
    **{t: ALL for t in (0x35, 0x36, 0x37, 0x38, 0x3B, 0x3C, 0x3D, 0x3E)},  # COPY_PLAYER*
}
# Movement types that walk away from their tile, within the movement range.
_MOVING = frozenset(
    {
        0x02,
        0x03,
        0x04,
        0x05,
        0x06,
        *range(0x19, 0x35),
        0x35,
        0x36,
        0x37,
        0x38,
        0x3B,
        0x3C,
        0x3D,
        0x3E,
    }
)
# gInitialMovementTypeFacingDirections for the types not listed above.
_INITIAL: dict[int, int] = {
    0x07: NORTH,
    0x08: SOUTH,
    0x09: WEST,
    0x0A: EAST,
    0x41: NORTH,
    0x42: WEST,
    0x43: EAST,
    0x45: NORTH,
    0x46: WEST,
    0x47: EAST,
    0x49: NORTH,
    0x4A: WEST,
    0x4B: EAST,
    0x4E: NORTH,
    0x4F: WEST,
    0x50: EAST,
}

Point = tuple[int, int]
MapId = tuple[int, int]


def movement_facings(movement_type: int) -> tuple[int, ...]:
    return _TURNING.get(movement_type, (_INITIAL.get(movement_type, SOUTH),))


@dataclass(frozen=True)
class SightTrainer:
    local_id: int
    graphics_id: int
    sprite_kind: str | None
    trainer_id: int
    double: bool
    trainer_type: int
    sight: int
    elevation: int
    x: int
    y: int
    facing: int
    # True: loaded, (x, y) is its tile now. False: the map's template tile; it may have moved.
    loaded: bool
    poses: tuple[tuple[int, int, int], ...]

    def json(self) -> dict[str, object]:
        return {
            "local_id": self.local_id,
            "graphics_id": self.graphics_id,
            "sprite_kind": self.sprite_kind,
            "trainer_id": self.trainer_id,
            "double": self.double,
            "x": self.x,
            "y": self.y,
            "facing": NAMES[self.facing],
            "sight": self.sight,
            "loaded": self.loaded,
        }


@dataclass(frozen=True)
class Sighting:
    local_id: int
    step: int
    tile: Point
    origin: Point
    facing: int

    def json(self) -> dict[str, object]:
        return {
            "local_id": self.local_id,
            "step": self.step,
            "tile": list(self.tile),
            "from": list(self.origin),
            "facing": NAMES[self.facing],
        }


@dataclass(frozen=True)
class SightReport:
    map_id: MapId
    trainers: tuple[SightTrainer, ...]
    sightings: tuple[Sighting, ...]

    def json(self) -> dict[str, object]:
        return {
            "available": True,
            "map_id": list(self.map_id),
            "trainers": [t.json() for t in self.trainers],
            "sightings": [s.json() for s in self.sightings],
        }


@dataclass(frozen=True)
class _Grid:
    """The live backup map (MapGridGetCollisionAt, MapGridGetElevationAt, behaviors)."""

    width: int
    height: int
    blocks: dict[Point, int]
    behaviors: dict[Point, int]

    def collision(self, p: Point) -> int | None:
        block = self.blocks.get(p)
        return None if block is None else (block >> 10) & 3

    def elevation(self, p: Point) -> int:
        block = self.blocks.get(p)
        return 0 if block is None else (block >> 12) & 15

    def behavior(self, p: Point) -> int:
        return self.behaviors.get(p, 0)


def _read_grid(read: ReadMemory) -> _Grid | None:
    layout = _layout(read)
    if layout is None or not (1 <= layout.map_width <= 256 and 1 <= layout.map_height <= 256):
        return None
    blocks: dict[Point, int] = {}
    behaviors: dict[Point, int] = {}
    cache: dict[int, int] = {}
    for y in range(layout.map_height):
        start = layout.buffer + 2 * ((y + MAP_OFFSET) * layout.width + MAP_OFFSET)
        row = struct.unpack(f"<{layout.map_width}H", read(start, 2 * layout.map_width))
        for x, block in enumerate(row):
            blocks[(x, y)] = block
            behaviors[(x, y)] = _behavior(read, layout, cache, block & 0x3FF)
    return _Grid(layout.map_width, layout.map_height, blocks, behaviors)


@dataclass(frozen=True)
class _Body:
    local_id: int
    map_id: MapId
    player: bool
    trainer_type: int
    movement_type: int
    elevation: int
    initial: Point
    current: Point
    previous: Point
    facing: int
    range_x: int
    range_y: int
    sight: int


def _bodies(read: ReadMemory) -> list[_Body]:
    raw = read(OBJECT_EVENTS, 16 * 0x24)
    found = []
    for offset in range(0, len(raw), 0x24):
        b = raw[offset : offset + 0x24]
        if not b[0] & 1:
            continue
        coords = struct.unpack_from("<hhhhhh", b, 0x0C)
        found.append(
            _Body(
                local_id=b[8],
                map_id=(b[10], b[9]),
                player=bool(b[2] & 1),
                trainer_type=b[7],
                movement_type=b[6],
                elevation=b[0x0B] & 15,
                initial=(coords[0] - MAP_OFFSET, coords[1] - MAP_OFFSET),
                current=(coords[2] - MAP_OFFSET, coords[3] - MAP_OFFSET),
                previous=(coords[4] - MAP_OFFSET, coords[5] - MAP_OFFSET),
                facing=b[0x18] & 15,
                range_x=b[0x19] & 15,
                range_y=b[0x19] >> 4,
                sight=b[0x1D],
            )
        )
    return found


def _script_head(read: ReadMemory, script: int) -> tuple[int, int] | None:
    """(battle type, trainer id) of a field trainerbattle script, else None."""
    if script not in ROM:
        return None
    head = read(script, 4)
    if len(head) != 4 or head[0] != TRAINERBATTLE or head[1] not in FIELD_BATTLE_TYPES:
        return None
    trainer = int.from_bytes(head[2:4], "little")
    return (head[1], trainer) if 0 < trainer < TRAINERS_COUNT else None


def _poses(tiles: Iterable[Point], facings: Iterable[int]) -> tuple[tuple[int, int, int], ...]:
    out: list[tuple[int, int, int]] = []
    for x, y in tiles:
        for f in facings:
            if (x, y, f) not in out:
                out.append((x, y, f))
    return tuple(out)


def _area(center: Point, range_x: int, range_y: int, moving: bool) -> list[Point]:
    if not moving:
        return [center]
    cx, cy = center
    return [
        (cx + dx, cy + dy)
        for dy in range(-range_y, range_y + 1)
        for dx in range(-range_x, range_x + 1)
    ]


@dataclass(frozen=True)
class _Blocker:
    local_id: int | None
    tiles: tuple[Point, ...]
    elevation: int


def read_sight_trainers(
    read: ReadMemory, save1: int, map_id: MapId
) -> tuple[tuple[SightTrainer, ...], tuple[_Blocker, ...]]:
    """Unbeaten trainers that can spot the player on this map, and the other objects."""
    raw = read(save1 + TEMPLATES, TEMPLATE_COUNT * 24)
    if len(raw) != TEMPLATE_COUNT * 24:
        raise ValueError("short object template read")
    bodies = _bodies(read)
    here = {b.local_id: b for b in bodies if b.map_id == map_id and not b.player}
    trainers: list[SightTrainer] = []
    blockers: list[_Blocker] = [
        _Blocker(None if b.map_id != map_id else b.local_id, (b.current, b.previous), b.elevation)
        for b in bodies
        if not b.player
    ]
    for slot in range(TEMPLATE_COUNT):
        entry = raw[slot * 24 : slot * 24 + 24]
        local_id, graphics = entry[0], entry[1]
        if local_id == 0 and graphics == 0:
            continue
        hide = struct.unpack_from("<H", entry, 0x14)[0]
        body = here.get(local_id)
        if body is None and hide != 0 and _flag(read, save1, hide):
            continue
        tx, ty = struct.unpack_from("<hh", entry, 4)
        if body is None:
            blockers.append(_Blocker(local_id, ((tx, ty),), entry[8]))
        trainer_type = body.trainer_type if body is not None else entry[0x0C]
        if trainer_type not in SIGHT_TYPES:
            continue
        head = _script_head(read, struct.unpack_from("<I", entry, 0x10)[0])
        if head is None or _flag(read, save1, TRAINER_FLAGS_START + head[1]):
            continue
        resolved = _graphics(read, save1, graphics)
        if body is not None:
            facings = (body.facing, *movement_facings(body.movement_type))
            if trainer_type == TRAINER_TYPE_BURIED:
                facings = ALL
            tiles = [body.current] + _area(
                body.initial, body.range_x, body.range_y, body.movement_type in _MOVING
            )
            x, y, facing, sight, elevation = (
                body.current[0],
                body.current[1],
                body.facing,
                body.sight,
                body.elevation,
            )
        else:
            movement = entry[9]
            facings = ALL if trainer_type == TRAINER_TYPE_BURIED else movement_facings(movement)
            tiles = _area((tx, ty), entry[0x0A] & 15, entry[0x0A] >> 4, movement in _MOVING)
            x, y, facing = tx, ty, facings[0]
            sight = struct.unpack_from("<H", entry, 0x0E)[0]
            elevation = entry[8]
        if facing not in VECTORS:
            facing = facings[0] if facings[0] in VECTORS else SOUTH
        trainers.append(
            SightTrainer(
                local_id=local_id,
                graphics_id=resolved,
                sprite_kind=GRAPHICS.get(resolved),
                trainer_id=head[1],
                double=head[0] in DOUBLE_BATTLE_TYPES,
                trainer_type=trainer_type,
                sight=sight,
                elevation=elevation,
                x=x,
                y=y,
                facing=facing,
                loaded=body is not None,
                poses=_poses(tiles, [f for f in facings if f in VECTORS]),
            )
        )
    return tuple(trainers), tuple(blockers)


def _mismatch(elevation: int, tile: int) -> bool:
    """IsElevationMismatchAt."""
    return elevation != 0 and tile not in (0, 15) and tile != elevation


def _compatible(a: int, b: int) -> bool:
    """AreElevationsCompatible."""
    return a == 0 or b == 0 or a == b


def sees(
    grid: _Grid,
    trainer: SightTrainer,
    pose: tuple[int, int, int],
    blockers: Sequence[_Blocker],
    tile: Point,
) -> bool:
    """CheckTrainer's distance and path test for one pose and the player on this tile."""
    px, py, direction = pose
    dx, dy = VECTORS[direction]
    steps = (tile[0] - px) * dx + (tile[1] - py) * dy
    lateral = (tile[0] - px) * dy + (tile[1] - py) * dx
    if lateral != 0 or not 0 < steps <= trainer.sight:
        return False
    own = grid.behavior((px, py))
    others = [
        b
        for b in blockers
        if b.local_id != trainer.local_id and _compatible(trainer.elevation, b.elevation)
    ]

    def impassable(p: Point) -> bool:
        collision = grid.collision(p)
        return (
            collision is None
            or collision != 0
            or EXIT_SIDE[direction] in EDGE_WALLS.get(own, ())
            or ENTERED_SIDE[direction] in EDGE_WALLS.get(grid.behavior(p), ())
        )

    for i in range(1, steps):
        p = (px + dx * i, py + dy * i)
        if (
            impassable(p)
            or _mismatch(trainer.elevation, grid.elevation(p))
            or any(p in b.tiles for b in others)
        ):
            return False
    return not impassable(tile) and not _mismatch(trainer.elevation, grid.elevation(tile))


def check_route(
    grid: _Grid,
    trainers: Sequence[SightTrainer],
    blockers: Sequence[_Blocker],
    route: Sequence[Point],
) -> tuple[Sighting, ...]:
    """The first route tile (1-based step) each trainer can see, ordered by step."""
    found: list[Sighting] = []
    for trainer in trainers:
        hit = next(
            (
                Sighting(trainer.local_id, step, tile, (pose[0], pose[1]), pose[2])
                for step, tile in enumerate(route, start=1)
                for pose in trainer.poses
                if sees(grid, trainer, pose, blockers, tile)
            ),
            None,
        )
        if hit is not None:
            found.append(hit)
    return tuple(sorted(found, key=lambda s: (s.step, s.local_id)))


def sight_report(read: ReadMemory, map_id: MapId, route: Sequence[Point]) -> dict[str, object]:
    """The JSON the endpoint serves: a report, or why there is none."""
    try:
        save1 = struct.unpack("<I", read(SAVE_BLOCK_PTRS, 4))[0]
        if not 0x02000000 <= save1 < 0x02040000 - TEMPLATES - TEMPLATE_COUNT * 24:
            return {"available": False, "reason": "save data unreadable"}
        _, _, group, number = struct.unpack("<hhBB", read(save1, 6))
        if (group, number) != map_id:
            return {
                "available": False,
                "reason": f"the player is on map {group}/{number}, not {map_id[0]}/{map_id[1]}",
            }
        grid = _read_grid(read)
        if grid is None:
            return {"available": False, "reason": "map grid unreadable"}
        trainers, blockers = read_sight_trainers(read, save1, map_id)
        return SightReport(map_id, trainers, check_route(grid, trainers, blockers, route)).json()
    except (ValueError, OSError, struct.error, IndexError):
        return {"available": False, "reason": "game memory unreadable"}
