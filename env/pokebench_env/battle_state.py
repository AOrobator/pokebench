"""Continuous Emerald battle RAM and controller receipts, not selected-move guesses.

Pinned source731ad5bf, US ROMf3ae0881. Exact literal map and semantic proof in
findings/2026-10-14_battle-state.md. Attack announcements are attempts; damage,
status effects and battle outcomes are separate game-owned observations.
"""

import struct
from dataclasses import asdict, dataclass

from pokebench_env.battle_choices import (
    COMMUNICATION,
    COUNT,
    IN_BATTLE,
    MAIN_FUNC,
    MONS,
    PARTY_INDEXES,
    POSITIONS,
    RESULTS,
    SELECT_ACTION,
    TYPE_FLAGS,
    exact,
    number,
)
from pokebench_env.battle_text import (
    BattleMessage,
    BattlePrompt,
    battle_text_phase,
    read_battle_message,
    read_battle_prompt,
)
from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.pokemon import BATTLE_MOVES, MOVE_NAMES, SPECIES_NAMES

CONTROLLERS = 0x03005D60
EXEC_FLAGS = 0x02024068
BUFFER_A = 0x02023064
ACTION_CURSOR = 0x020244AC
MOVE_CURSOR = 0x020244B0
MULTI_CURSOR = 0x03005D74
CURRENT_MOVE = 0x020241EA
ATTACKER = 0x0202420B
TARGET = 0x0202420C
SCRIPT_PC = 0x02024214
MOVE_RESULT = 0x0202427C
HIT_MARKER = 0x02024280
STATUSES3 = 0x020242AC
OUTCOME = 0x0202433A
CURRENT_ACTION = 0x02024083
CURRENT_TURN_ACTION = 0x02024082
SCRIPT_OWNERS = frozenset({0x0803E019, 0x0803E08D})
INPUT_OWNERS = {
    0x08057589: "action",
    0x08057BFD: "move",
    0x08057825: "target",
    0x08058139: "move_reorder",
    0x081593D9: "safari_action",
    0x080599D5: "yes_no",
}
OUTCOMES = {
    0: "ongoing",
    1: "won",
    2: "lost",
    3: "drew",
    4: "ran",
    5: "player_teleported",
    6: "opponent_fled",
    7: "caught",
    8: "no_safari_balls",
    9: "forfeited",
    10: "opponent_teleported",
}


@dataclass(frozen=True)
class BattleMove:
    slot: int
    move_id: int
    name: str | None
    pp: int
    max_pp: int
    move_type: int | None
    power: int | None
    accuracy: int | None
    effect: int | None


@dataclass(frozen=True)
class BattleBattler:
    battler: int
    position: int
    party_slot: int
    identity: str
    species_id: int
    species: str
    level: int
    hp: int
    max_hp: int
    status1: int
    status2: int
    status3: int
    stat_stages: tuple[int, ...]
    stats: tuple[int, ...]
    types: tuple[int, int]
    ability: int
    held_item: int
    moves: tuple[BattleMove, ...]
    absent: bool


@dataclass(frozen=True)
class BattleInput:
    battler: int
    controller: int
    phase: str
    ready: bool
    action_cursor: int | None = None
    move_cursor: int | None = None
    target_cursor: int | None = None
    selected: str | None = None
    selected_move_id: int | None = None
    displayed_pp: int | None = None
    displayed_max_pp: int | None = None
    communication: int | None = None


@dataclass(frozen=True)
class BattleSignal:
    kind: str
    battler: int
    command: int
    request: int | None = None
    party_mask: int | None = None
    string_id: int | None = None
    move_id: int | None = None
    originally_used_move: int | None = None
    hp: int | None = None
    status: int | None = None
    raw_hex: str | None = None


@dataclass(frozen=True)
class BattleExecution:
    attacker: int
    target: int
    move_id: int
    phase: str
    script_pc: int
    move_result_flags: int
    hit_marker: int
    damage: int
    hp_dealt: int
    current_action: int
    turn_action: int


@dataclass(frozen=True)
class BattlePlayback:
    stoppable: bool
    finished: bool
    controls: str = "B stops playback while the battle screen owns input"


@dataclass(frozen=True)
class BattleState:
    active: bool
    initialized: bool = False
    phase: str = "inactive"
    ready: bool | None = None
    main_func: int | None = None
    script_pc: int | None = None
    battle_type: int | None = None
    turn: int | None = None
    outcome_code: int | None = None
    outcome: str | None = None
    battlers: tuple[BattleBattler, ...] | None = None
    player_inputs: tuple[BattleInput, ...] | None = None
    controller_exec_flags: int | None = None
    signals: tuple[BattleSignal, ...] = ()
    current_execution: BattleExecution | None = None
    non_pokemon_battlers: tuple[int, ...] = ()
    playback: BattlePlayback | None = None
    diagnostic: str | None = None
    raw_hex: str | None = None
    # The battle message window (battle_text.py); recorded, shown only by its switch.
    message: BattleMessage | None = None
    prompt: BattlePrompt | None = None
    text_phase: str | None = None

    def json(self) -> dict[str, object]:
        return asdict(self)


def _text_fields(read: ReadMemory) -> tuple[BattleMessage, BattlePrompt | None, str | None]:
    """Message window, YES/NO prompt and advance phase; a failed read stays local."""
    try:
        return read_battle_message(read), read_battle_prompt(read), battle_text_phase(read)
    except (ValueError, OSError, IndexError) as error:
        return BattleMessage("idle", diagnostic=f"harness bug: battle text: {error}"), None, None


def _move(read: ReadMemory, slot: int, move: int, pp: int, bonuses: int) -> BattleMove:
    if move == 0:
        if pp:
            raise ValueError("empty battle move has PP")
        return BattleMove(slot, 0, None, 0, 0, None, None, None, None)
    if not 1 <= move <= 354:
        raise ValueError("invalid battle move ID")
    data = exact(read, BATTLE_MOVES + move * 12, 12)
    name = decode_text(exact(read, MOVE_NAMES + move * 13, 13))
    maximum = data[4] + data[4] * 20 * ((bonuses >> (slot * 2)) & 3) // 100
    if not name or "?" in name or not data[4] or pp > 64 or data[2] >= 18:
        raise ValueError("invalid battle move table or PP")
    return BattleMove(slot, move, name, pp, maximum, data[2], data[1], data[3], data[0])


def _battler(
    read: ReadMemory, index: int, position: int, body: bytes, absent: int
) -> BattleBattler:
    species, *stats = struct.unpack_from("<6H", body)
    hp, maximum = struct.unpack_from("<H", body, 0x28)[0], struct.unpack_from("<H", body, 0x2C)[0]
    level = body[0x2A]
    party = number(read, PARTY_INDEXES + 2 * index, 2)
    stages = struct.unpack_from("<8b", body, 0x18)
    ability, type1, type2 = body[0x20:0x23]
    held_item = struct.unpack_from("<H", body, 0x2E)[0]
    if (
        not 1 <= species <= 411
        or not 1 <= level <= 100
        or not 0 <= hp <= maximum
        or not maximum
        or party > 5
    ):
        raise ValueError("invalid battle Pokémon species/level/HP/party slot")
    name = decode_text(exact(read, SPECIES_NAMES + species * 11, 11))
    if (
        not name
        or "?" in name
        or any(not 0 <= value <= 12 for value in stages)
        or ability >= 78
        or type1 >= 18
        or type2 >= 18
        or held_item >= 377
    ):
        raise ValueError("invalid battle Pokémon name/stages/type/ability/item")
    moves = tuple(
        _move(read, slot, move, body[0x24 + slot], body[0x3B])
        for slot, move in enumerate(struct.unpack_from("<4H", body, 0x0C))
    )
    personality, ot = (
        struct.unpack_from("<I", body, 0x48)[0],
        struct.unpack_from("<I", body, 0x54)[0],
    )
    return BattleBattler(
        index,
        position,
        party,
        f"{personality:08x}:{ot:08x}",
        species,
        name,
        level,
        hp,
        maximum,
        struct.unpack_from("<I", body, 0x4C)[0],
        struct.unpack_from("<I", body, 0x50)[0],
        number(read, STATUSES3 + 4 * index),
        tuple(stages),
        tuple(stats),
        (type1, type2),
        ability,
        held_item,
        moves,
        bool(absent & (1 << index)),
    )


def read_battle_state(read: ReadMemory) -> BattleState:
    active = bool(number(read, IN_BATTLE, 1) & 2)
    if not active:
        return BattleState(False)
    raw = b""
    try:
        main = number(read, MAIN_FUNC)
        count = number(read, COUNT, 1)
        # Before BattleIntro has copied party/enemy data, an empty battle is a
        # genuine initialization phase, not a decoded Pokémon with species0.
        if count == 0 or main == 0:
            return BattleState(True, phase="initializing", ready=False, main_func=main)
        if count not in (2, 4) or not 0x08000001 <= main < 0x0A000000 or not main & 1:
            raise ValueError("invalid battle count or main owner")
        battle_type = number(read, TYPE_FLAGS)
        safari = bool(battle_type & 0x80)
        if safari and count != 2:
            raise ValueError("invalid Safari battler count")
        positions = tuple(exact(read, POSITIONS, count))
        if len(set(positions)) != count or any(position > 3 for position in positions):
            raise ValueError("invalid battle positions")
        raw = exact(read, MONS, count * 0x58)
        trainer_banks = tuple(
            index for index, position in enumerate(positions) if safari and not position & 1
        )
        for index in trainer_banks:
            if any(raw[index * 0x58 : (index + 1) * 0x58]):
                raise ValueError("Safari trainer bank has nonzero Pokémon data")
        if any(
            struct.unpack_from("<H", raw, index * 0x58)[0] == 0
            for index in range(count)
            if index not in trainer_banks
        ):
            if main not in (SELECT_ACTION, 0x0803D2E9, 0x0803D819, *SCRIPT_OWNERS):
                return BattleState(True, phase="initializing", ready=False, main_func=main)
        absent = number(read, 0x02024210, 1)
        battlers = tuple(
            _battler(read, index, position, raw[index * 0x58 : (index + 1) * 0x58], absent)
            for index, position in enumerate(positions)
            if index not in trainer_banks
        )
        exec_flags = number(read, EXEC_FLAGS)
        controllers = struct.unpack("<4I", exact(read, CONTROLLERS, 16))
        phases = exact(read, COMMUNICATION, count)
        inputs = []
        signals = []
        for index, position in enumerate(positions):
            controller = controllers[index]
            busy = bool(exec_flags & (1 << index))
            packet = exact(read, BUFFER_A + index * 0x200, 32)
            if busy and packet[0] == 16:
                string = struct.unpack_from("<H", packet, 2)[0]
                move, original = struct.unpack_from("<HH", packet, 4)
                signals.append(
                    BattleSignal(
                        "move_announced" if string == 4 else "message",
                        index,
                        16,
                        string_id=string,
                        move_id=move,
                        originally_used_move=original,
                        raw_hex=packet.hex(),
                    )
                )
            elif busy and packet[0] == 2 and packet[1] in (40, 42):
                if packet[1] == 42:
                    signals.append(
                        BattleSignal(
                            "party_hp_updated" if packet[2] else "hp_updated",
                            index,
                            2,
                            request=42,
                            party_mask=packet[2],
                            hp=struct.unpack_from("<H", packet, 3)[0],
                            raw_hex=packet[:5].hex(),
                        )
                    )
                else:
                    signals.append(
                        BattleSignal(
                            "party_status_updated" if packet[2] else "status_updated",
                            index,
                            2,
                            request=40,
                            party_mask=packet[2],
                            status=struct.unpack_from("<I", packet, 3)[0],
                            raw_hex=packet[:7].hex(),
                        )
                    )
            if position & 1:
                continue
            if not 0x08000001 <= controller < 0x0A000000 or not controller & 1:
                raise ValueError("invalid player battle controller")
            phase = INPUT_OWNERS.get(controller, "controller_busy")
            ready = busy and controller in INPUT_OWNERS
            action_cursor = move_cursor = target_cursor = selected_move = shown_pp = shown_max = (
                None
            )
            selected = None
            if ready and phase in ("action", "safari_action"):
                action_cursor = number(read, ACTION_CURSOR + index, 1)
                if action_cursor > 3:
                    raise ValueError("invalid battle action cursor")
                selected = (
                    ("SAFARI BALL", "POKEBLOCK", "GO NEAR", "RUN")
                    if phase == "safari_action"
                    else ("FIGHT", "BAG", "POKEMON", "RUN")
                )[action_cursor]
            elif ready and phase in ("move", "move_reorder"):
                move_cursor = number(read, MOVE_CURSOR + index, 1)
                if move_cursor > 3:
                    raise ValueError("invalid battle move cursor")
                # ChooseMoveStruct at packet+4 has moves8,PP4,maxPP4,species2,types2.
                selected_move = struct.unpack_from("<H", packet, 4 + move_cursor * 2)[0]
                if not 1 <= selected_move <= 354:
                    raise ValueError("invalid displayed battle move")
                selected = decode_text(exact(read, MOVE_NAMES + selected_move * 13, 13))
                shown_pp, shown_max = packet[12 + move_cursor], packet[16 + move_cursor]
                if not selected or "?" in selected or shown_pp > 64 or not 1 <= shown_max <= 64:
                    raise ValueError("invalid displayed battle move name/PP")
                if phase == "move_reorder":
                    target_cursor = number(read, MULTI_CURSOR, 1)
                    if target_cursor > 3:
                        raise ValueError("invalid battle move reorder cursor")
            elif ready and phase == "yes_no":
                target_cursor = number(read, MULTI_CURSOR, 1)
                if target_cursor > 1:
                    raise ValueError("invalid battle yes/no cursor")
                selected = ("YES", "NO")[target_cursor]
            elif ready and phase == "target":
                target_cursor = number(read, MULTI_CURSOR, 1)
                if target_cursor >= count:
                    raise ValueError("invalid battle target cursor")
                target_mon = next((mon for mon in battlers if mon.battler == target_cursor), None)
                selected = (
                    "TRAINER"
                    if target_mon is None and target_cursor in trainer_banks
                    else None
                    if target_mon is None
                    else target_mon.species
                )
            inputs.append(
                BattleInput(
                    index,
                    controller,
                    phase,
                    ready,
                    action_cursor,
                    move_cursor,
                    target_cursor,
                    selected,
                    selected_move,
                    shown_pp,
                    shown_max,
                    phases[index],
                )
            )
        script = number(read, SCRIPT_PC)
        outcome = number(read, OUTCOME, 1)
        if outcome & 0x7F not in OUTCOMES:
            raise ValueError("invalid native battle outcome")
        execution = None
        if main in SCRIPT_OWNERS or any(signal.kind == "move_announced" for signal in signals):
            attacker, target = number(read, ATTACKER, 1), number(read, TARGET, 1)
            move = number(read, CURRENT_MOVE, 2)
            if (
                attacker >= count
                or target >= count
                or move > 354
                or not 0x08000000 <= script < 0x0A000000
            ):
                raise ValueError("invalid battle script execution fields")
            execution = BattleExecution(
                attacker,
                target,
                move,
                "move_announced"
                if any(s.kind == "move_announced" for s in signals)
                else "script_resolution",
                script,
                number(read, MOVE_RESULT, 1),
                number(read, HIT_MARKER),
                struct.unpack("<i", exact(read, 0x020241F0, 4))[0],
                struct.unpack("<i", exact(read, 0x020241F4, 4))[0],
                number(read, CURRENT_ACTION, 1),
                number(read, CURRENT_TURN_ACTION, 1),
            )
        playback = None
        if battle_type & (1 << 24):
            finished = number(read, 0x0203CCD0, 1)
            if finished not in (0, 1):
                raise ValueError("invalid recorded-battle playback state")
            playback = BattlePlayback(
                number(read, GMAIN + 4) == 0x08038421 and finished == 0, bool(finished)
            )
        ready = any(player.ready for player in inputs) or (
            playback is not None and playback.stoppable
        )
        phase = (
            "finishing"
            if outcome
            else "replay"
            if playback is not None
            else "input"
            if ready
            else "resolving"
        )
        return BattleState(
            True,
            True,
            phase,
            ready,
            main,
            script,
            battle_type,
            number(read, RESULTS + 0x13, 1) + 1,
            outcome,
            OUTCOMES[outcome & 0x7F],
            battlers,
            tuple(inputs),
            exec_flags,
            tuple(signals),
            execution,
            trainer_banks,
            playback,
            None,
            None,
            *_text_fields(read),
        )
    except (ValueError, OSError, struct.error) as error:
        return BattleState(
            True, phase="unavailable", diagnostic=f"harness bug: {error}", raw_hex=raw.hex()[:4096]
        )
