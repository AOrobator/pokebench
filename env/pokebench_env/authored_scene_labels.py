"""Qualified authored roles for three already displayed Rustboro messages.

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:
RustboroCity_Text_OutOfTheWay, RustboroCity_Text_WaitDontTakeMyGoods,
and RustboroCity_Text_HelpMeIWasRobbed. ScriptContext layout is script.h;
msgbox's loadword/callstd expansion is asm/macros/event.inc. Exact US-ROM
callsites were checked against seventeen hash-validated native archives.
The catalog identifies a historical script role, never current actor presence.
"""

import json
import os
import struct
import sys
from collections.abc import Mapping
from dataclasses import asdict, dataclass, replace
from hashlib import sha256
from typing import Literal, TextIO

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.native_text import decode_native_text, native_text_payload
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.rom import EMERALD_SHA1, resolve_rom
from pokebench_env.world_context import GLOBAL_SCRIPT, STRING_VAR4, read_field_message

SWITCH = "authored-scene-labels-v1"
Scene = Literal["rustboro-theft-chase", "rustboro-employee-request"]
Beat = Literal["grunt-escape", "employee-chase", "employee-request"]
Speaker = Literal["TEAM AQUA GRUNT", "DEVON EMPLOYEE"]


@dataclass(frozen=True)
class SceneLabel:
    scene: Scene
    beat: Beat
    speaker: Speaker
    source: Literal["authored-script"]
    map_id: tuple[int, int]
    actor_local_id: int
    message_pointer: int
    return_pc: int
    rom_sha1: str

    def json(self) -> dict[str, object]:
        return {**asdict(self), "map_id": list(self.map_id)}


# Keys are (ScriptContext.data[0], the sole callstd return address).
# Local ids identify the authored role in this map's script, not a live object claim.
CATALOG: dict[tuple[int, int], tuple[Scene, Beat, Speaker, int]] = {
    (0x081E17FE, 0x081E09D5): ("rustboro-theft-chase", "grunt-escape", "TEAM AQUA GRUNT", 10),
    (0x081E1817, 0x081E09FF): ("rustboro-theft-chase", "employee-chase", "DEVON EMPLOYEE", 9),
    (0x081E183E, 0x081E0B6D): (
        "rustboro-employee-request",
        "employee-request",
        "DEVON EMPLOYEE",
        9,
    ),
}


def read_scene_label(read: ReadMemory, state: GameState) -> SceneLabel | None:
    """Fail closed on unknown identity, printer, script, source payload or state.

    The archive/frame owner verified ROM identity before decoding; only that
    metadata is consulted here. No cartridge hash or text from later pages is emitted.
    """
    metadata = getattr(read, "metadata", None)
    if not isinstance(metadata, Mapping) or metadata.get("rom_sha1") != EMERALD_SHA1:
        return None
    world = state.world_context
    if (
        not state.started
        or state.map_id != (0, 3)
        or state.screen != "overworld"
        or state.in_battle
        or state.active_ui is not None
        or state.naming is not None
        or state.field_controls_locked is not True
        or world is None
        or world.message_diagnostic is not None
        or world.message is None
        or not world.message.ready
        or world.message.identity is None
    ):
        return None
    message = world.message
    try:
        printer = read_field_message(read)
        if (
            printer is None
            or not printer.ready
            or printer.phase != message.phase
            or printer.cursor != message.cursor
        ):
            return None
        context = read(GLOBAL_SCRIPT, 0x74)
        if len(context) != 0x74 or context[0] != 1 or context[1] != 2:
            return None
        return_pc = struct.unpack_from("<I", context, 12)[0]
        pointer = struct.unpack_from("<I", context, 0x64)[0]
        definition = CATALOG.get((pointer, return_pc))
        if definition is None:
            return None
        # MSGBOX_DEFAULT is loadword 0,<message pointer>; callstd 4.
        if read(return_pc - 8, 8) != b"\x0f\x00" + struct.pack("<I", pointer) + b"\x09\x04":
            return None
        source = native_text_payload(read(pointer, 1000))
        displayed = native_text_payload(read(STRING_VAR4, 1000))
        if source != displayed or sha256(displayed).hexdigest() != message.identity:
            return None
        decoded = decode_native_text(
            displayed + b"\xff",
            require_terminator=True,
            line_breaks={0xFA: "\n", 0xFB: "\n", 0xFE: "\n"},
        )
        if decoded != world.dialogue:
            return None
    except (ValueError, IndexError, struct.error):
        return None
    scene, beat, speaker, actor = definition
    return SceneLabel(
        scene, beat, speaker, "authored-script", (0, 3), actor, pointer, return_pc, EMERALD_SHA1
    )


def annotate_scene_label(read: ReadMemory, state: GameState) -> GameState:
    label = read_scene_label(read, state)
    if label is None:
        return state
    world = state.world_context
    if world is None or world.message is None:
        return state
    return replace(
        state, world_context=replace(world, message=replace(world.message, scene_label=label))
    )


def main(env: Mapping[str, str], stdin: TextIO, stdout: TextIO) -> int:
    """Probe-only labels projection through the same validated native factory."""
    from pokebench_env.readout import features_off_from_env
    from pokebench_env.rerender import PORYMAP_MAPS, parse_request, read_state
    from pokebench_env.ui_state import active_ui_enabled_from_env

    run_dir, refs = parse_request(stdin.read())
    # Resolve/hash external ROM once per invocation, never once per frame.
    rom = resolve_rom(env).read_bytes()
    maps = MapNames.load(PORYMAP_MAPS)
    off = features_off_from_env(env)
    output: list[dict[str, object] | None] = []
    for ref in refs:
        read = load_raw_ram(run_dir / ref.path, ref.sha256, rom=rom)
        state = read_state(read, maps, active_ui=active_ui_enabled_from_env(env), off=off)
        message = None if state.world_context is None else state.world_context.message
        label = None if message is None else message.scene_label
        output.append(None if label is None else label.json())
    json.dump({"labels": output}, stdout)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(os.environ, sys.stdin, sys.stdout))
