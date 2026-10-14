"""Owned Trainer Card, Berry Tag and field/Fly Region Map snapshots."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import GBA_TEXT, decode_text
from pokebench_env.menus import _ewram, owner_details, task_snapshot
from pokebench_env.pokemon import read_item_name

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

CARD_CALLBACK = 0x080C2711
BERRY_CALLBACK = 0x08177C55
FIELD_MAP_CALLBACK = 0x08170275
FLY_CALLBACK = 0x081248D5


def _buffer_text(raw: bytes) -> str:
    if b"\xff" not in raw:
        raise ValueError("unterminated menu text buffer")
    meaningful = raw[: raw.index(0xFF)]
    if any(byte not in GBA_TEXT for byte in meaningful):
        raise ValueError("unsupported menu text buffer character")
    return decode_text(raw)


def read_view_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback not in (CARD_CALLBACK, BERRY_CALLBACK, FIELD_MAP_CALLBACK, FLY_CALLBACK):
        return None
    details = owner_details(read, callback)
    phase = "menu_view_transition"
    try:
        fading = bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        if callback == CARD_CALLBACK:
            phase = "trainer_card"
            pointer = struct.unpack("<I", read(0x02039CE8, 4))[0]
            if not _ewram(pointer, 0x598):
                raise ValueError("invalid TrainerCardData pointer")
            raw = read(pointer, 0x598)
            owners = [task for task in task_snapshot(read) if task[1] == 0x080C2761]
            if len(owners) != 1 or raw[0] > 16:
                raise ValueError("invalid Trainer Card task/state")
            state = raw[0]
            card = raw[0x534:0x598]
            if card[0] not in (0, 1) or card[1] > 5:
                raise ValueError("invalid Trainer Card gender/stars")
            details.update(
                {
                    "owner_task": owners[0][0],
                    "card_state": state,
                    "is_link": bool(raw[5]),
                    "side": "BACK" if raw[8] else "FRONT",
                    "player_name": _buffer_text(card[0x30:0x38]),
                    "gender": card[0],
                    "stars": card[1],
                    "caught_count": struct.unpack_from("<H", card, 0x0C)[0],
                    "trainer_id": struct.unpack_from("<H", card, 0x0E)[0],
                    "play_hours": struct.unpack_from("<H", card, 0x10)[0],
                    "play_minutes": struct.unpack_from("<H", card, 0x12)[0],
                    "money": struct.unpack_from("<I", card, 0x24)[0],
                    "battle_wins": struct.unpack_from("<H", card, 0x14)[0],
                    "battle_losses": struct.unpack_from("<H", card, 0x16)[0],
                    "trades": struct.unpack_from("<H", card, 0x20)[0],
                    "frontier_bp": struct.unpack_from("<H", card, 0x62)[0],
                }
            )
            ready = state in (10, 11) and not fading
            return ActiveUi(
                phase,
                "BACK" if raw[8] else "FRONT",
                ready,
                "A flips front or closes back; B returns/closes",
                details=details,
            )
        if callback == BERRY_CALLBACK:
            phase = "berry_tag"
            pointer = struct.unpack("<I", read(0x0203BCF4, 4))[0]
            if not _ewram(pointer, 0x180C):
                raise ValueError("invalid BerryTagScreenStruct pointer")
            berry_id = struct.unpack("<H", read(pointer + 0x1800, 2))[0]
            if berry_id not in range(1, 47):
                raise ValueError("invalid Berry Tag berry id")
            item_id = berry_id + 132
            label = read_item_name(read, item_id)
            owners = [task for task in task_snapshot(read) if task[1] == 0x08178655]
            if len(owners) != 1:
                raise ValueError("Berry Tag has no unique verified input owner")
            details.update({"owner_task": owners[0][0], "berry_id": berry_id, "item_id": item_id})
            return ActiveUi(
                phase, label, not fading, "UP/DOWN changes berry; A or B closes", details=details
            )
        phase = "fly_map" if callback == FLY_CALLBACK else "town_map"
        address = 0x0203A148 if callback == FLY_CALLBACK else 0x0203BCD0
        pointer = struct.unpack("<I", read(address, 4))[0]
        if not _ewram(pointer, 0x890):
            raise ValueError("invalid map owner pointer")
        region = pointer + 8
        if struct.unpack("<I", read(0x0203A144, 4))[0] != region:
            raise ValueError("Region Map input pointer does not match active map owner")
        raw = read(region, 0x84)
        map_section = struct.unpack_from("<H", raw)[0]
        section_type = raw[2]
        input_callback = struct.unpack_from("<I", raw, 0x18)[0]
        if map_section > 213 or section_type > 4 or raw[0x78] not in (0, 1):
            raise ValueError("invalid Region Map selection/type/zoom")
        x, y = struct.unpack_from("<HH", raw, 0x54)
        if not 1 <= x <= 28 or not 2 <= y <= 16:
            raise ValueError("invalid Region Map cursor coordinates")
        label = _buffer_text(raw[4:24])
        details.update(
            {
                "map_section": map_section,
                "map_section_type": section_type,
                "map_name": label,
                "column": x,
                "row": y,
                "zoomed": bool(raw[0x78]),
                "position_within_section": raw[3],
                "map_input_callback": f"0x{input_callback:08X}",
            }
        )
        if input_callback not in (0x081230C5, 0x08123191, 0x08123255, 0x08123335):
            raise ValueError("unverified Region Map input owner")
        ready = input_callback in (0x081230C5, 0x08123255) and not fading
        if callback == FLY_CALLBACK:
            fn, state = struct.unpack("<IH", read(pointer, 6))
            details.update(
                {
                    "fly_callback": f"0x{fn:08X}",
                    "fly_state": state,
                    "can_fly": section_type in (2, 4),
                }
            )
            ready = ready and fn == 0x08124D65 and state == 0
        else:
            state = struct.unpack("<H", read(pointer + 0x88C, 2))[0]
            details["map_state"] = state
            ready = ready and state == 4
        return ActiveUi(
            phase, label, ready, "Directions move map cursor; A accepts; B returns", details=details
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "Menu view observation unavailable", str(error), details=details
        )
