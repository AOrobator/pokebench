"""Checksum-validated Emerald Pokémon snapshots, including in-place decryption.

GetBoxMonData decrypts secure bytes in RAM while reading them. Both representations
are checked against the stored checksum; a plausible species alone is never proof.
"""

import struct
from dataclasses import dataclass, replace

from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.native_text import decode_native_text

SPECIES_NAMES = 0x083185C8
MOVE_NAMES = 0x0831977C
BATTLE_MOVES = 0x0831C898
ITEMS = 0x085839A0
ITEMS_COUNT = 377
SUBSTRUCT_ORDERS = (
    "GAEM GAME GEAM GEMA GMAE GMEA AGEM AGME AEGM AEMG AMGE AMEG "
    "EGAM EGMA EAGM EAMG EMGA EMAG MGAE MGEA MAGE MAEG MEGA MEAG"
).split()


@dataclass(frozen=True)
class PokemonCpu:
    gprs: tuple[int, ...]
    cpsr: int
    stack_address: int
    stack_bytes: bytes


@dataclass(frozen=True)
class PokemonCpuEvidence:
    gprs: tuple[int, ...]
    cpsr: int
    stack_address: int
    stack_hex: str


def _cpu_evidence(cpu: PokemonCpu | None) -> PokemonCpuEvidence | None:
    if cpu is None or len(cpu.gprs) != 16:
        return None
    return PokemonCpuEvidence(
        tuple(word & 0xFFFFFFFF for word in cpu.gprs),
        cpu.cpsr & 0xFFFFFFFF,
        cpu.stack_address & 0xFFFFFFFF,
        cpu.stack_bytes[:128].hex(),
    )


def pokemon_cpu_context(read: ReadMemory) -> PokemonCpu | None:
    capture = getattr(read, "pokemon_cpu_context", None)
    context = capture() if callable(capture) else None
    return context if isinstance(context, PokemonCpu) else None


def _representation_owner(cpu: PokemonCpu | None, address: int | None) -> str | None:
    """Finite exact-ROM unwind; every plaintext decision binds the BoxMon pointer.

    Only user/system Thumb execution is qualified here. IRQ/banked registers and
    partial encryption loops are unavailable, never a default encrypted guess.
    """
    if (
        cpu is None
        or address is None
        or len(cpu.gprs) != 16
        or cpu.stack_address != cpu.gprs[13]
        or cpu.cpsr & 0x1F not in (0x10, 0x1F)
        or not cpu.cpsr & 0x20
        or len(cpu.stack_bytes) < 64
    ):
        return None
    regs = cpu.gprs
    pc, lr = regs[15] & ~1, regs[14]
    if not 0x08000000 <= pc < 0x0A000000:
        return None
    words = struct.unpack("<16I", cpu.stack_bytes[:64])
    checksum_returns = {0x0806A6D1, 0x0806ADF7, 0x0806B3E5, 0x08067C9B}
    substruct_checksum_returns = {0x08068C8B, 0x08068C97, 0x08068CA3, 0x08068CAF}
    pre_decrypt_returns = {
        0x0806A69D,
        0x0806A6A9,
        0x0806A6B7,
        0x0806A6C3,
        0x0806ADC5,
        0x0806ADD1,
        0x0806ADDD,
        0x0806ADE9,
    }
    if 0x0806A228 <= pc < 0x0806A270:
        return None  # Secure words are being XORed in place.
    if 0x0806A674 <= pc < 0x0806ACA8:
        if regs[8] != address:
            return "encrypted"
        if 0x0806A6CA <= pc <= 0x0806AC94 and words[0] > 10:
            return "plaintext"
        return "encrypted"
    if 0x0806AD9C <= pc < 0x0806B3FC:
        if regs[7] != address:
            return "encrypted"
        if 0x0806ADF0 <= pc <= 0x0806B3E8 and regs[10] > 10:
            return "plaintext"
        return "encrypted"
    if 0x08068C78 <= pc < 0x08068D0C:
        if regs[4] == address and words[5] in checksum_returns:
            return "plaintext"
        return None
    if 0x0806A270 <= pc < 0x0806A518:
        if pc < 0x0806A276 or pc >= 0x0806A512:
            return None  # The qualified stack frame/register binding is not live yet/anymore.
        if regs[5] != address:
            return "encrypted"
        if words[3] in substruct_checksum_returns and words[9] in checksum_returns:
            return "plaintext"
        if words[3] in pre_decrypt_returns:
            return "encrypted"
        return None
    if 0x082E7BE0 <= pc < 0x082E7C9C and lr == 0x0806A283:
        if regs[5] != address:
            return "encrypted"
        # __umodsi3 pushes r4 after 0x082E7BEC; GetSubstruct saved LR is
        # then SP+16 and its caller checksum saved LR is SP+40.
        offset = 1 if pc >= 0x082E7BEE else 0
        if (
            words[3 + offset] in substruct_checksum_returns
            and words[9 + offset] in checksum_returns
        ):
            return "plaintext"
        if words[3 + offset] in pre_decrypt_returns:
            return "encrypted"
        return None
    if 0x08067400 <= pc < 0x08067D00:
        return None  # CreateBoxMon constructs secure plaintext before encryption.
    # Get/SetBoxMonData's decrypted interval calls only the finite helpers above.
    # IRQ mode was excluded before interpreting the active stack/register bank.
    return "encrypted"


@dataclass(frozen=True)
class PokemonMove:
    move_id: int
    pp: int
    pp_bonus: int
    name: str | None = None
    max_pp: int | None = None


@dataclass(frozen=True)
class PartyMon:
    species: str | None
    level: int | None
    hp: int | None
    max_hp: int | None
    identity: str | None = None
    species_id: int | None = None
    personality: int | None = None
    ot_id: int | None = None
    is_egg: bool | None = None
    status: int | None = None
    held_item: int | None = None
    experience: int | None = None
    moves: tuple[PokemonMove, ...] | None = None
    decode_mode: str | None = None
    diagnostic: str | None = None
    raw_hex: str | None = None
    held_item_name: str | None = None
    cpu_context: PokemonCpuEvidence | None = None
    language: int | None = None
    nickname: str | None = None
    nickname_diagnostic: str | None = None


def _checksum(secure: bytes) -> int:
    return int(sum(struct.unpack("<24H", secure))) & 0xFFFF


def _decode_mon(
    body: bytes,
    read: ReadMemory,
    *,
    party: bool,
    address: int | None,
    cpu: PokemonCpu | None,
    empty_move_pp: bool = False,
) -> PartyMon:
    """Never emit guessed data from a corrupt, mixed or ambiguous snapshot."""
    if len(body) != (100 if party else 80):
        return PartyMon(
            None,
            None,
            None,
            None,
            diagnostic="harness bug: short Pokémon read",
            raw_hex=body[:100].hex(),
            cpu_context=_cpu_evidence(cpu),
        )
    personality, ot_id = struct.unpack_from("<II", body)
    identity = f"{personality:08x}:{ot_id:08x}"

    def invalid(reason: str) -> PartyMon:
        return PartyMon(
            None,
            None,
            None,
            None,
            identity,
            personality=personality,
            ot_id=ot_id,
            diagnostic=f"harness bug: Pokémon {reason}",
            raw_hex=body.hex(),
            cpu_context=_cpu_evidence(cpu),
        )

    checksum = struct.unpack_from("<H", body, 0x1C)[0]
    stored = body[0x20:0x50]
    key = personality ^ ot_id
    decrypted = struct.pack("<12I", *(word ^ key for word in struct.unpack("<12I", stored)))
    encrypted_valid, plain_valid = _checksum(decrypted) == checksum, _checksum(stored) == checksum
    if not encrypted_valid and not plain_valid:
        return invalid("checksum mismatch (encrypted and plaintext)")

    def candidate(secure: bytes, mode: str) -> PartyMon:
        order = SUBSTRUCT_ORDERS[personality % 24]
        growth = secure[12 * order.index("G") : 12 * (order.index("G") + 1)]
        attacks = secure[12 * order.index("A") : 12 * (order.index("A") + 1)]
        misc = secure[12 * order.index("M") : 12 * (order.index("M") + 1)]
        species_id, held_item, experience, pp_bonuses = struct.unpack_from("<HHIB", growth)
        if body[0x13] & 1:
            return invalid("Bad Egg flag set")
        if not body[0x13] & 2:
            return invalid("party member has no species flag")
        if not 1 <= species_id < 412:
            return invalid(f"species out of range: {species_id}")
        is_egg = bool(struct.unpack_from("<I", misc, 4)[0] & (1 << 30))
        if is_egg != bool(body[0x13] & 4):
            return invalid("inconsistent egg flags")
        level = hp = max_hp = status = None
        if party:
            status = struct.unpack_from("<I", body, 0x50)[0]
            level, _, hp, max_hp = struct.unpack_from("<BBHH", body, 0x54)
            if not 1 <= level <= 100 or max_hp == 0 or hp > max_hp or status & ~0xFFF:
                return invalid("invalid level, HP or status")
        try:
            held_item_name = read_item_name(read, held_item) if held_item else None
        except ValueError as error:
            return invalid(str(error))
        move_ids = struct.unpack_from("<4H", attacks)
        pps = attacks[8:12]
        # tutorial-party-owner-v1: LoadWallyZigzagoon (field_specials.c:1423-1435) empties
        # MOVE2-4 after CreateMon without clearing their PP; the game ignores a slot's PP
        # while its move is MOVE_NONE.
        if any(
            move >= 355 or pp > 64 or (move == 0 and pp != 0 and not empty_move_pp)
            for move, pp in zip(move_ids, pps, strict=True)
        ):
            return invalid("invalid move or PP")
        if 252 <= species_id <= 276:
            return replace(invalid("reserved OLD_UNOWN species ID"), species_id=species_id)
        raw_name = read(SPECIES_NAMES + 11 * species_id, 11)
        try:
            name = decode_text(raw_name)
        except ValueError:
            return invalid("invalid species-name ROM read")
        if len(raw_name) != 11 or not name or "?" in name or b"\xff" not in raw_name:
            return invalid("invalid species-name ROM read")
        moves_list = []
        for i, (move, pp) in enumerate(zip(move_ids, pps, strict=True)):
            move_name = None
            max_pp = 0
            bonus = (pp_bonuses >> (2 * i)) & 3
            if move:
                base_pp_body = read(BATTLE_MOVES + 12 * move + 4, 1)
                if len(base_pp_body) != 1 or not 1 <= base_pp_body[0] <= 40:
                    return invalid("invalid move-base-PP ROM read")
                max_pp = base_pp_body[0] + (base_pp_body[0] * bonus // 5)
                if pp > max_pp:
                    return invalid("PP exceeds move maximum")
                raw_move_name = read(MOVE_NAMES + 13 * move, 13)
                try:
                    move_name = decode_text(raw_move_name)
                except ValueError:
                    return invalid("invalid move-name ROM read")
                if (
                    len(raw_move_name) != 13
                    or not move_name
                    or "?" in move_name
                    or b"\xff" not in raw_move_name
                ):
                    return invalid("invalid move-name ROM read")
            moves_list.append(PokemonMove(move, pp, bonus, move_name, max_pp))
        moves = tuple(moves_list)
        language = body[0x12]
        nickname = None
        nickname_diagnostic = None
        # Old synthetic/replay records may have an absent all-zero name/header.
        # This qualifies absence, never a guessed English decoding of unknown data.
        if language == 0 and body[8:18] == bytes(10):
            language_value = None
        elif language not in range(1, 8):
            language_value = language
            nickname_diagnostic = "harness bug: Pokémon unknown nickname language"
        else:
            language_value = language
            try:
                nickname = decode_native_text(body[8:18] + b"\xff", japanese=language == 1)
            except ValueError as error:
                nickname_diagnostic = f"harness bug: Pokémon nickname text: {error}"
        return PartyMon(
            name,
            level,
            hp,
            max_hp,
            identity,
            species_id,
            personality,
            ot_id,
            is_egg,
            status,
            held_item,
            experience,
            moves,
            mode,
            held_item_name=held_item_name,
            language=language_value,
            nickname=nickname,
            nickname_diagnostic=nickname_diagnostic,
            raw_hex=body.hex() if nickname_diagnostic else None,
            cpu_context=_cpu_evidence(cpu) if nickname_diagnostic else None,
        )

    results = []
    if encrypted_valid:
        results.append(candidate(decrypted, "encrypted"))
    if plain_valid and (not encrypted_valid or stored != decrypted):
        results.append(candidate(stored, "plaintext"))
    valid = [result for result in results if result.diagnostic is None]
    if len(valid) == 1:
        return valid[0]
    if len(valid) > 1:
        owner = _representation_owner(cpu, address)
        if owner is not None:
            return next(result for result in valid if result.decode_mode == owner)
        return invalid(
            "ambiguous checksum representation after complete validation; CPU owner unavailable"
        )
    return results[0]


def decode_party_mon(
    body: bytes,
    read: ReadMemory,
    *,
    address: int | None = None,
    cpu: PokemonCpu | None = None,
    empty_move_pp: bool = False,
) -> PartyMon:
    return _decode_mon(
        body, read, party=True, address=address, cpu=cpu, empty_move_pp=empty_move_pp
    )


def decode_box_mon(
    body: bytes, read: ReadMemory, *, address: int | None = None, cpu: PokemonCpu | None = None
) -> PartyMon:
    """Box slots have no cached level, HP or status; these remain unavailable."""
    return _decode_mon(body, read, party=False, address=address, cpu=cpu)


def read_item_name(read: ReadMemory, item_id: int) -> str:
    """Exact-ROM item table; reject wrong table/stride/ID rather than invent names."""
    if not 0 < item_id < ITEMS_COUNT:
        raise ValueError("held item out of range")
    item = read(ITEMS + 44 * item_id, 16)
    try:
        name = decode_text(item[:14])
    except ValueError as error:
        raise ValueError("invalid held-item ROM read") from error
    if len(item) == 16 and struct.unpack_from("<H", item, 14)[0] == 0:
        raise ValueError("unused/reserved held-item table row")
    if (
        len(item) != 16
        or struct.unpack_from("<H", item, 14)[0] != item_id
        or not name
        or "?" in name
        or b"\xff" not in item[:14]
    ):
        raise ValueError("invalid held-item ROM read")
    return name
