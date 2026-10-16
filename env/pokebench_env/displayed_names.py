"""displayed-place-names-v1: the text the game itself prints for signs and the buildings they name.

Sign scripts are read from the ROM at the event's own script pointer and accepted only in the
two shapes pret/pokeemerald 731ad5b compiles a sign to (asm/macros/event.inc,
data/script_cmd_table.inc):

- `msgbox TEXT, MSGBOX_SIGN` + `end`: 0F 00 <TEXT> 09 03 02
- the player-gender sign (LittlerootTown_EventScript_BrendansHouseSign / MaysHouseSign):
  lockall; checkplayergender; call_if_eq VAR_RESULT, MALE|FEMALE, SUB (both genders);
  releaseall; end
  = 69 A0 (21 0D80 <v> 07 01 <SUB>)x2 6B 02, each SUB = `msgbox TEXT, MSGBOX_DEFAULT` + `return`
  = 0F 00 <TEXT> 09 04 03.

The branch is picked by SaveBlock2.playerGender (+0x08; MALE 0, FEMALE 1). `{PLAYER}` (FD 01) is
the saved player name. Any other shape, placeholder or undecodable byte gives None: today's label.
"""

import struct
from collections.abc import Callable

from pokebench_env.game_screen import ReadMemory
from pokebench_env.native_text import CONTROL_ARGS, decode_native_text

MALE, FEMALE = 0, 1
SIGN_BOX, DEFAULT_BOX = 3, 4
VAR_RESULT = 0x800D
TEXT_BOUND = 0x400
ROM = range(0x08000000, 0x0A000000)


def player_gender(read: ReadMemory, save2: int) -> int | None:
    gender = read(save2 + 8, 1)[0]
    return gender if gender in (MALE, FEMALE) else None


def _text(read: ReadMemory, address: int, player: str | None) -> str | None:
    """Decode one ROM text up to its EOS, filling only {PLAYER}; None for anything else."""
    if address not in ROM:
        return None
    raw = read(address, TEXT_BOUND)
    segments: list[bytes] = []
    start = index = 0
    while index < len(raw) and raw[index] != 0xFF:
        byte = raw[index]
        if byte == 0xFD:
            if raw[index + 1 : index + 2] != b"\x01" or not player:
                return None
            segments.append(raw[start:index])
            index += 2
            start = index
            continue
        if byte == 0xFC and index + 1 < len(raw):
            index += 2 + CONTROL_ARGS.get(raw[index + 1], 0)
        else:
            index += 2 if byte == 0xF9 else 1
    if index >= len(raw):
        return None
    segments.append(raw[start:index])
    try:
        decoded = [decode_native_text(segment) for segment in segments]
    except ValueError:
        return None
    return (player or "").join(decoded)


def _msgbox(read: ReadMemory, address: int, box: int, closing: int) -> int | None:
    if address not in ROM:
        return None
    body = read(address, 9)
    if body[:2] != b"\x0f\x00" or body[6:] != bytes([0x09, box, closing]):
        return None
    return int(struct.unpack_from("<I", body, 2)[0])


def read_sign_text(
    read: ReadMemory, script: int, gender: int | None, player: str | None
) -> str | None:
    """The text this save sees when it reads the sign at `script`, or None when unverified."""
    single = _msgbox(read, script, SIGN_BOX, 0x02)
    if single is not None:
        return _text(read, single, player)
    if script not in ROM or gender is None:
        return None
    body = read(script, 2 + 2 * 11 + 2)
    if body[:2] != b"\x69\xa0" or body[24:] != b"\x6b\x02":
        return None
    branches: dict[int, int] = {}
    for offset in (2, 13):
        op, var, value, call, condition, sub = struct.unpack_from("<BHHBBI", body, offset)
        if (op, var, call, condition) != (0x21, VAR_RESULT, 0x07, 0x01) or value in branches:
            return None
        branches[value] = sub
    if set(branches) != {MALE, FEMALE}:
        return None
    chosen = _msgbox(read, branches[gender], DEFAULT_BOX, 0x03)
    return None if chosen is None else _text(read, chosen, player)


def sign_labeler(
    read: ReadMemory, gender: int | None, player: str | None
) -> Callable[[int], str | None]:
    def label(script: int) -> str | None:
        shown = read_sign_text(read, script, gender, player)
        return None if shown is None else f'Sign text "{shown}"'

    return label


# The Littleroot buildings the game names on their signs (data/maps/LittlerootTown/scripts.inc):
# BrendansHouseSign 386-400 and MaysHouseSign 402-416 branch on the player's gender; the lab sign
# 382-384 does not. Texts 943-950: "PROF. BIRCH'S POKéMON LAB", "{PLAYER}'s HOUSE",
# "PROF. BIRCH'S HOUSE". Keys are the map table names MapNames builds from the map constants.
PLAYERS_HOUSE, BIRCHS_HOUSE = "{PLAYER}'s HOUSE", "PROF. BIRCH'S HOUSE"
PLACES: dict[str, tuple[tuple[str, str], str]] = {
    "LITTLEROOT TOWN BRENDANS HOUSE 1F": ((PLAYERS_HOUSE, BIRCHS_HOUSE), " 1F"),
    "LITTLEROOT TOWN BRENDANS HOUSE 2F": ((PLAYERS_HOUSE, BIRCHS_HOUSE), " 2F"),
    "LITTLEROOT TOWN MAYS HOUSE 1F": ((BIRCHS_HOUSE, PLAYERS_HOUSE), " 1F"),
    "LITTLEROOT TOWN MAYS HOUSE 2F": ((BIRCHS_HOUSE, PLAYERS_HOUSE), " 2F"),
    "LITTLEROOT TOWN PROFESSOR BIRCHS LAB": (
        ("PROF. BIRCH'S POKéMON LAB", "PROF. BIRCH'S POKéMON LAB"),
        "",
    ),
}


def place_name(map_name: str | None, gender: int | None, player: str | None) -> str | None:
    entry = PLACES.get(map_name or "")
    if entry is None or gender not in (MALE, FEMALE):
        return None
    (male, female), floor = entry
    shown = male if gender == MALE else female
    if "{PLAYER}" in shown:
        if not player:
            return None
        shown = shown.replace("{PLAYER}", player)
    return shown + floor
