"""Game-owned running permission, separate from the optional travel behavior flag."""

from dataclasses import asdict, dataclass

from pokebench_env.battle_choices import IN_BATTLE, exact, number
from pokebench_env.game_screen import GMAIN, ReadMemory

PLAYER_AVATAR = 0x02037590
OBJECT_EVENTS = 0x02037350
MAP_HEADER = 0x02037318
FIELD_LOCK = 0x03000F2C
SAVE1 = 0x03005D8C
RUNNING_SHOES_FLAG = 0x8C0
OVERWORLD_CB1 = 0x08085E05
OVERWORLD_CB2 = 0x08085E5D
FORCED_TILES = frozenset(
    (*range(0x40, 0x49), *range(0x50, 0x54), 0x13, 0x20, 0xBB, 0xBC, 0xD0, 0xD2)
)
NO_RUNNING_TILES = frozenset((3, 0xA, 0x28, *range(0x74, 0x78)))


@dataclass(frozen=True)
class RunningPermission:
    permitted: bool | None
    controllable: bool | None
    reason: str
    shoes: bool | None = None
    allow_running: bool | None = None
    avatar_flags: int | None = None
    metatile: int | None = None
    elevation: int | None = None
    map_type: int | None = None
    callback1: int | None = None
    callback2: int | None = None
    diagnostic: str | None = None
    raw_hex: str | None = None
    movement_direction: int | None = None

    def json(self) -> dict[str, object]:
        result = asdict(self)
        if self.movement_direction is None:
            del result["movement_direction"]
        return result


def read_running_permission(
    read: ReadMemory, *, waterfall_handoff: bool = False
) -> RunningPermission:
    """Unknown permission stays unknown; callers may append B only for True.

    IsRunningDisallowed checks map allowRunning, prohibited tiles and Fortree
    bridge *previous* elevation. Shoe ownership and on-foot mode are separate
    PlayerNotOnBikeStep conditions. Menus/locked controls/forced movement cannot
    receive automatic B even when the map would otherwise permit running.
    """
    raw = b""
    try:
        cb1, cb2 = number(read, GMAIN), number(read, GMAIN + 4)
        if number(read, IN_BATTLE, 1) & 2:
            return RunningPermission(False, False, "battle", callback1=cb1, callback2=cb2)
        if (cb1, cb2) != (OVERWORLD_CB1, OVERWORLD_CB2):
            return RunningPermission(False, False, "external_owner", callback1=cb1, callback2=cb2)
        locked = number(read, FIELD_LOCK, 1)
        if locked not in (0, 1):
            raise ValueError("invalid native field-control lock")
        if locked:
            return RunningPermission(
                False, False, "field_controls_locked", callback1=cb1, callback2=cb2
            )
        avatar = exact(read, PLAYER_AVATAR, 8)
        raw = avatar
        flags, transition, running_state, tile_state, _sprite, object_id, prevent, _gender = avatar
        if object_id >= 16 or prevent not in (0, 1) or running_state > 2 or tile_state > 2:
            raise ValueError("invalid native player-avatar state")
        obj = exact(read, OBJECT_EVENTS + 0x24 * object_id, 0x24)
        raw += obj
        if not obj[0] & 1 or not obj[2] & 1:
            raise ValueError("player-avatar object is inactive or not player")
        header = exact(read, MAP_HEADER, 0x1C)
        raw += header
        if not 0x08000000 <= int.from_bytes(header[:4], "little") < 0x0A000000:
            raise ValueError("invalid native map-layout pointer")
        save1 = number(read, SAVE1)
        if not 0x02000000 <= save1 < 0x02040000 - 0x1270 - 0x120:
            raise ValueError("invalid native SaveBlock1 pointer")
        shoes = bool(
            number(read, save1 + 0x1270 + RUNNING_SHOES_FLAG // 8, 1)
            & (1 << (RUNNING_SHOES_FLAG % 8))
        )
        metatile, elevation = obj[0x1E], obj[0xB] >> 4
        allow, map_type = bool(header[0x1A] & 4), header[0x17]
        reason = "permitted"
        controllable = True
        if prevent or obj[1] & 1 or (obj[0] & 0x40 and not obj[0] & 0x80):
            reason, controllable = "player_step_blocked", False
        elif transition or flags & 0x40 or metatile in FORCED_TILES:
            reason, controllable = "forced_or_transitioning", False
        elif flags & 0x1F != 1:
            reason = "not_on_foot"
        elif not shoes:
            reason = "no_running_shoes"
        elif not allow:
            reason = "map_disallows_running"
        elif metatile in NO_RUNNING_TILES:
            reason = "metatile_disallows_running"
        elif metatile == 0x78 and not elevation & 1:
            reason = "fortree_bridge_lower_level"
        movement = obj[0x18] >> 4  # ObjectEvent.movementDirection, distinct from facingDirection.
        return RunningPermission(
            reason == "permitted",
            controllable,
            reason,
            shoes,
            allow,
            flags,
            metatile,
            elevation,
            map_type,
            cb1,
            cb2,
            movement_direction=movement
            if waterfall_handoff and flags & 8 and 1 <= movement <= 8
            else None,
        )
    except (ValueError, OSError, IndexError) as error:
        return RunningPermission(
            None, None, "unavailable", diagnostic=f"harness bug: {error}", raw_hex=raw.hex()[:4096]
        )
