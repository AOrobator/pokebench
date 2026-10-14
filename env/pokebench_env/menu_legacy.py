"""Exact US-ROM owners for the save-recovery and legacy Mystery Event screens."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.menus import MenuValue, owner_details
from pokebench_env.native_text import decode_native_text

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

SAVE_CALLBACKS = frozenset((0x08178FDD, 0x08179289, 0x08179391, 0x081793E1, 0x08179429))
MYSTERY_CALLBACKS = frozenset((0x08178975, 0x08178A79))
BERRY_CALLBACKS = frozenset((0x080AAF29, 0x081BF385, 0x081BF3DD))


def _number(read: ReadMemory, address: int, size: int = 4) -> int:
    raw = read(address, size)
    if len(raw) != size:
        raise ValueError("short legacy menu read")
    return int.from_bytes(raw, "little")


def _text(read: ReadMemory, address: int) -> str:
    return decode_native_text(read(address, 512), require_terminator=True)


def _save(read: ReadMemory, callback: int, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    save_type = _number(read, 0x0203BCFC, 2)
    damaged = _number(read, 0x030061FC)
    continuation = _number(read, 0x03006214)
    vblank = _number(read, GMAIN + 0x0C)
    window = _number(read, 0x0203BD0E, 1)
    if window >= 32 or save_type > 255:
        raise ValueError("invalid native save-recovery window/sectors")
    details.update(
        {
            "save_type": save_type,
            "damaged_sectors": damaged,
            "continue_callback": continuation,
            "vblank_callback": vblank,
        }
    )
    if callback in (0x08178FDD, 0x08179289, 0x08179429):
        phase = {0x08178FDD: "load", 0x08179289: "repair", 0x08179429: "closing"}[callback]
        return ActiveUi(
            "save_recovery_" + phase,
            None,
            False,
            "Save recovery advances automatically",
            details=details,
        )
    if not _window_drawn(read, window):
        raise ValueError("save-recovery message window not drawn")
    if callback == 0x08179391:
        message = 0x085EC86F
    elif vblank == 0x08178FC9:
        message = 0x085EC8D4  # Error was acknowledged; gameplay cannot continue.
    elif vblank == 0x08179455:
        message = 0x085EC86F if damaged else 0x085EC9A2 if continuation else 0x085EC94F
    else:
        raise ValueError("save-recovery result has unknown native VBlank owner")
    details["message"] = _text(read, message)
    return ActiveUi(
        "save_recovery_result",
        None,
        True,
        "A acknowledges the displayed recovery result",
        details=details,
    )


def _mystery(read: ReadMemory, callback: int, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import STRING_VAR4, ActiveUi, _window_drawn

    if callback == 0x08178975:
        return ActiveUi(
            "mystery_event_load",
            None,
            False,
            "Legacy Mystery Event initialization advances automatically",
            details=details,
        )
    state = _number(read, GMAIN + 0x438, 1)
    link_status = _number(read, 0x030030E0)
    remote = _number(read, 0x03003124, 1)
    active = _number(read, 0x020201B0 + 0x1B, 1)
    if state > 16 or remote > 1 or active > 1:
        raise ValueError("invalid native Mystery Event state")
    count = (link_status & 0x1C) >> 2
    connected = bool(link_status & 0x40)
    details.update(
        {
            "state": state,
            "link_status": link_status,
            "player_count": count,
            "master": bool(link_status & 0x20),
            "connected": connected,
            "remote_players": bool(remote),
            "printing": bool(active),
        }
    )
    ready = (
        state == 3 or (state == 5 and count == 2) or (state == 6 and not connected) or state == 14
    )
    ready = ready and not (connected and not link_status & 0x20)
    if state in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14):
        if not _window_drawn(read, 0):
            raise ValueError("Mystery Event message window not drawn")
        address = (
            0x085EE765
            if state in (2, 3)
            else 0x085EE788
            if state in (4, 5, 6)
            else 0x085EE7CE
            if state in (7, 8, 9, 10, 11)
            else STRING_VAR4
        )
        details["message"] = _text(read, address)
    if state == 6:
        if not _window_drawn(read, 1):
            raise ValueError("Mystery Event loading window not drawn")
        details["loading_message"] = _text(read, 0x085EE7BF)
    controls = (
        "A loads event; B cancels"
        if state == 5 and count == 2
        else "B cancels the connection"
        if ready and state in (3, 6)
        else "A acknowledges the result"
        if state == 14
        else "Legacy Mystery Event communication advances automatically"
    )
    return ActiveUi(
        "mystery_event_" + ("input" if ready else "transition"),
        None,
        ready,
        controls,
        details=details,
    )


def _berry(read: ReadMemory, callback: int, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    if callback != 0x081BF3DD:
        return ActiveUi(
            "berry_fix_load",
            None,
            False,
            "Berry Program Update initializes automatically",
            details=details,
        )
    pointer = _number(read, 0x030012B8)
    if not 0x02000000 <= pointer <= 0x02040000 - 80 or pointer % 4:
        raise ValueError("invalid native Berry Program Update heap")
    raw = read(pointer, 80)
    if len(raw) != 80 or raw[0] > 7 or raw[1] > 6:
        raise ValueError("invalid native Berry Program Update state")
    state, scene = raw[:2]
    details.update(
        {
            "state": state,
            "scene": scene,
            "timer": int.from_bytes(raw[2:4], "little"),
            "probe_count": raw[0x1C],
            "response_bits": raw[0x21],
            "client_bits": raw[0x22],
        }
    )
    if scene != 6:
        if not _window_drawn(read, 1):
            raise ValueError("Berry Program Update scene window not drawn")
        address = _number(read, 0x08618160 + scene * 4)
        if not 0x08000000 <= address < 0x0A000000 - 512:
            raise ValueError("invalid Berry Program Update scene text")
        details["message"] = _text(read, address)
    required_scene = {1: 5, 2: 0, 6: 3, 7: 4}.get(state)
    ready = required_scene is not None and scene == required_scene
    return ActiveUi(
        "berry_fix_" + ("input" if ready else "transition"),
        None,
        ready,
        "A continues the displayed update instructions"
        if ready
        else "Berry Program Update changes scenes or transfers automatically",
        details=details,
    )


def read_legacy_menu(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback not in SAVE_CALLBACKS | MYSTERY_CALLBACKS | BERRY_CALLBACKS:
        return None
    details = owner_details(read, callback)
    try:
        if callback in BERRY_CALLBACKS:
            return _berry(read, callback, details)
        return (
            _save(read, callback, details)
            if callback in SAVE_CALLBACKS
            else _mystery(read, callback, details)
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            "legacy_menu_unavailable",
            None,
            None,
            "Observe; native menu state unavailable",
            f"harness bug: {error}",
            details=details,
        )
