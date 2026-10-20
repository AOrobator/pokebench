"""Map event targets using the verified US gMapHeader and live object events.

Source: pret/pokeemerald global.fieldmap.h, field_control_avatar.c. Definitions
are candidates, not proof a flag, elevation, script or facing permits use now.
"""

import struct
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass

from pokebench_env.game_screen import ReadMemory
from pokebench_env.interaction_names import script_name
from pokebench_env.live_map import (
    BACKUP_LAYOUT,
    MAP_HEADER,
    MAP_OFFSET,
    MAX_MAP_DATA_SIZE,
    OBJECT_EVENTS,
    _pointer,
)
from pokebench_env.world_context import GRAPHICS


@dataclass(frozen=True)
class InteractionTarget:
    kind: str
    x: int
    y: int
    elevation: int
    activation: str
    availability: str = "conditional"
    facing: str | None = None
    local_id: int | None = None
    destination: tuple[int, int, int] | None = None
    name: str | None = None
    # semantic-navigation-v1: exact gObjectEvents identity; omitted when off.
    native_slot: int | None = None

    def json(self) -> dict[str, object]:
        body = asdict(self)
        if self.native_slot is None:
            body.pop("native_slot")
        return body

    def text(
        self,
        *,
        named: bool = False,
        destinations: Mapping[tuple[int, int], str] | None = None,
        dynamic: str | None = None,
    ) -> str:
        facing = "" if self.facing is None else f", face {self.facing}"
        identity = "" if self.local_id is None else f" id {self.local_id}"
        destination = ""
        label = self.kind if not named else (self.name or f"{self.kind} (identity unavailable)")
        if self.destination is not None:
            group, number, warp = self.destination
            place = (
                None
                if destinations is None or (group, number) == (127, 127)
                else destinations.get((group, number))
            )
            if (group, number) == (127, 127) and dynamic is not None:
                place = dynamic
            destination = (
                f"; destination {dynamic}"
                if (group, number) == (127, 127) and dynamic is not None
                else "; dynamic destination"
                if (group, number) == (127, 127)
                else f"; destination map {group}/{number} warp {warp}"
                if place is None
                else f"; destination {place} (map {group}/{number}) warp {warp}"
            )
            if named and place is not None:
                label = (
                    f"Warp to {place}"
                    if (group, number) == (127, 127)
                    else f"Warp to {place} (map {group}/{number})"
                )
        return (
            f"{label}{identity} at ({self.x},{self.y}), elevation {self.elevation}; "
            f"{self.activation}{facing}; {self.availability}{destination}"
        )


def _background_name(
    read: ReadMemory, script: int, sign_label: Callable[[int], str | None] | None
) -> str | None:
    # A verified non-sign identity (Notebook, GameCube) keeps its name; signs take their text.
    known = script_name(read, script)
    if sign_label is None or (known is not None and "Sign" not in known.split()):
        return known
    return sign_label(script) or known


def read_targets(
    read: ReadMemory,
    map_id: tuple[int, int],
    *,
    sign_label: Callable[[int], str | None] | None = None,
    native_slots: bool = False,
) -> tuple[InteractionTarget, ...] | None:
    """All event records in this map; object positions come only from live RAM.

    sign_label (displayed-place-names-v1) names a background event by the text its script prints.
    """
    events = int.from_bytes(read(MAP_HEADER + 4, 4), "little")
    if not _pointer(events):
        return None
    header = read(events, 20)
    counts = header[:4]
    pointers = struct.unpack_from("<IIII", header, 4)
    if any(
        count and not _pointer(pointer) for count, pointer in zip(counts, pointers, strict=True)
    ):
        return None
    templates = read(pointers[0], counts[0] * 24) if counts[0] else b""
    scripts = {
        templates[i * 24]: int.from_bytes(templates[i * 24 + 16 : i * 24 + 20], "little")
        for i in range(counts[0])
    }
    targets = []
    objects = read(OBJECT_EVENTS, 16 * 0x24)
    for slot in range(16):
        body = objects[slot * 0x24 : (slot + 1) * 0x24]
        if not body[0] & 1 or body[1] & 0x20 or body[2] & 1:
            continue
        if (body[10], body[9]) != map_id or not _pointer(scripts.get(body[8], 0)):
            continue
        x, y = struct.unpack_from("<hh", body, 16)
        targets.append(
            InteractionTarget(
                "object",
                x - MAP_OFFSET,
                y - MAP_OFFSET,
                body[11] & 15,
                "A",
                local_id=body[8],
                name=GRAPHICS.get(body[5]),
                native_slot=slot if native_slots else None,
            )
        )
    warps = read(pointers[1], counts[1] * 8) if counts[1] else b""
    for i in range(counts[1]):
        x, y, elevation, warp, number, group = struct.unpack_from("<hhBBBB", warps, i * 8)
        targets.append(
            InteractionTarget(
                "warp",
                x,
                y,
                elevation,
                "movement; activation depends on metatile (see local map)",
                destination=(group, number, warp),
                name=f"Warp to map {group}/{number}"
                if (group, number) != (127, 127)
                else "Dynamic warp",
            )
        )
    coords = read(pointers[2], counts[2] * 16) if counts[2] else b""
    for i in range(counts[2]):
        x, y, elevation, _, _, script = struct.unpack_from("<hhBxHH2xI", coords, i * 16)
        if script == 0:
            targets.append(InteractionTarget("weather_trigger", x, y, elevation, "step"))
        elif _pointer(script):
            targets.append(InteractionTarget("coordinate_trigger", x, y, elevation, "step"))
        else:
            return None
    backgrounds = read(pointers[3], counts[3] * 12) if counts[3] else b""
    for i in range(counts[3]):
        x, y, elevation, kind, script = struct.unpack_from("<HHBB2xI", backgrounds, i * 12)
        label = (
            "background"
            if kind <= 4
            else "hidden_item"
            if kind in (5, 6, 7)
            else "secret_base"
            if kind == 8
            else "background_unknown"
        )
        facing = {1: "up", 2: "down", 3: "right", 4: "left", 8: "up"}.get(kind)
        targets.append(
            InteractionTarget(
                label,
                x,
                y,
                elevation,
                "A",
                facing=facing,
                name=_background_name(read, script, sign_label) if kind <= 4 else None,
            )
        )
    terrain = read_metatile_targets(read)
    return None if terrain is None else tuple(targets) + terrain


@dataclass(frozen=True)
class InteractionObjectSlot:
    """Active gObjectEvents entry in native GetObjectEventIdByPosition order."""

    slot: int
    x: int
    y: int
    elevation: int
    local_id: int
    map_id: tuple[int, int]
    is_player: bool

    def json(self) -> dict[str, object]:
        body = asdict(self)
        body["map_id"] = list(self.map_id)
        return body


def read_interaction_object_slots(read: ReadMemory) -> tuple[InteractionObjectSlot, ...]:
    """All active slots, including entries the display-oriented target list filters."""
    objects = read(OBJECT_EVENTS, 16 * 0x24)
    result = []
    for slot in range(16):
        body = objects[slot * 0x24 : (slot + 1) * 0x24]
        if not body[0] & 1:
            continue
        x, y = struct.unpack_from("<hh", body, 16)
        result.append(
            InteractionObjectSlot(
                slot,
                x - MAP_OFFSET,
                y - MAP_OFFSET,
                body[11] & 15,
                body[8],
                (body[10], body[9]),
                bool(body[2] & 1),
            )
        )
    return tuple(result)


# Exact enum values at the pinned source revision. Only behavior predicates
# returning scripts in GetInteractedMetatileScript are included.
METATILE_TARGETS = {
    0x83: "pc",
    0x84: "cable_box_results_1",
    0x85: "region_map",
    0x86: "television",
    0x87: "pokeblock_feeder",
    0x8B: "closed_sootopolis_door",
    0xEA: "sky_pillar_closed_door",
    0x8C: "trick_house_puzzle_door",
    0x8E: "running_shoes_instruction",
    0xE0: "picture_book_shelf",
    0xE1: "bookshelf",
    0xE2: "pokemon_center_bookshelf",
    0xE3: "vase",
    0xE4: "trash_can",
    0xE5: "shop_shelf",
    0xE6: "blueprint",
    0xE8: "wireless_box_results",
    0xE7: "cable_box_results_2",
    0x8F: "questionnaire",
    0xE9: "trainer_hill_timer",
    0xB0: "secret_base_pc",
    0xB1: "secret_base_register_pc",
    0xBF: "secret_base_sand_ornament",
    0xC4: "secret_base_tv_shield",
}


def read_metatile_targets(read: ReadMemory) -> tuple[InteractionTarget, ...] | None:
    """Scan current mutable map tiles in one bounded bulk snapshot, not source layouts."""
    width, height, buffer = struct.unpack("<III", read(BACKUP_LAYOUT, 12))
    layout = int.from_bytes(read(MAP_HEADER, 4), "little")
    if not _pointer(layout) or not _pointer(buffer) or width * height > MAX_MAP_DATA_SIZE:
        return None
    mw, mh, _, _, primary, secondary = struct.unpack("<IIIIII", read(layout, 24))
    if width != mw + 15 or height != mh + 14 or not _pointer(primary) or not _pointer(secondary):
        return None
    attr = [int.from_bytes(read(t + 16, 4), "little") for t in (primary, secondary)]
    if not all(_pointer(a) for a in attr):
        return None
    tables = [read(a, 1024) for a in attr]
    grid = read(buffer, width * height * 2)
    result = []
    for y in range(mh):
        for x in range(mw):
            block = struct.unpack_from("<H", grid, 2 * ((y + MAP_OFFSET) * width + x + MAP_OFFSET))[
                0
            ]
            tile = block & 0x3FF
            which = int(tile >= 512)
            behavior = tables[which][2 * (tile - 512 * which)]
            label = METATILE_TARGETS.get(behavior)
            if label is not None:
                facing = (
                    "up"
                    if label in ("television", "wireless_box_results", "cable_box_results_2")
                    else None
                )
                result.append(
                    InteractionTarget(
                        "metatile_" + label,
                        x,
                        y,
                        block >> 12,
                        "A",
                        facing=facing,
                        name=label.replace("_", " "),
                    )
                )
    return tuple(result)
