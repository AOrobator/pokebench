"""Fixtures cover game-owned representations, never plausible-species fallbacks."""

import struct
from dataclasses import replace

import pytest
from test_game_state import Memory, text

from pokebench_env.pokemon import (
    BATTLE_MOVES,
    ITEMS,
    MOVE_NAMES,
    SPECIES_NAMES,
    SUBSTRUCT_ORDERS,
    PokemonMove,
    decode_box_mon,
    decode_party_mon,
)


def fixture(personality=0x12345671, *, plain=False, key=None, species=280, egg=False):
    ot_id = personality ^ key if key is not None else 0xCAFEBABE
    key = personality ^ ot_id
    growth = struct.pack("<HHIBBH", species, 13, 125, 0b11100100, 70, 0)
    attacks = struct.pack("<4H4B", 55, 78, 0, 33, 25, 30, 0, 56)
    misc = struct.pack("<III", 0, (1 << 30) if egg else 0, 0)
    subs = {"G": growth, "A": attacks, "E": bytes(12), "M": misc}
    secure = b"".join(subs[k] for k in SUBSTRUCT_ORDERS[personality % 24])
    body = bytearray(100)
    struct.pack_into("<II", body, 0, personality, ot_id)
    body[0x13] = 2 | (4 if egg else 0)
    struct.pack_into("<H", body, 0x1C, sum(struct.unpack("<24H", secure)) & 0xFFFF)
    body[0x20:0x50] = (
        secure if plain else struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", secure)))
    )
    struct.pack_into("<IBBHH", body, 0x50, 0x40, 5, 0, 18, 20)
    memory = Memory()
    memory.put(SPECIES_NAMES + 11 * species, text("TORCHIC") + b"\xff")
    for move, name in [(55, "WATER GUN"), (78, "STUN SPORE"), (33, "TACKLE")]:
        memory.put(MOVE_NAMES + 13 * move, text(name) + b"\xff")
    memory.put(
        ITEMS + 44 * 13, (text("POTION") + b"\xff").ljust(14, b"\x00") + struct.pack("<H", 13)
    )
    for move, pp in [(55, 25), (78, 30), (33, 35)]:
        memory.put(BATTLE_MOVES + 12 * move + 4, bytes([pp]))
    return bytes(body), memory.read


@pytest.mark.parametrize("personality", range(24))
def test_all_orders_and_in_place_plaintext_match_exactly(personality):
    encrypted, read = fixture(personality)
    plain, _ = fixture(personality, plain=True)
    result = decode_party_mon(encrypted, read)
    assert result.species_id == 280
    assert result.species == "TORCHIC"
    assert result.experience == 125
    assert result.held_item == 13
    assert result.status == 0x40
    assert result.moves == (
        PokemonMove(55, 25, 0, "WATER GUN", 25),
        PokemonMove(78, 30, 1, "STUN SPORE", 36),
        PokemonMove(0, 0, 2, None, 0),
        PokemonMove(33, 56, 3, "TACKLE", 56),
    )
    assert decode_party_mon(plain, read) == replace(result, decode_mode="plaintext")


def test_zero_xor_key_identical_representations_are_not_ambiguous():
    body, read = fixture(key=0)
    assert decode_party_mon(body, read).diagnostic is None


def test_checksum_collision_uses_complete_validation_for_a_legal_key():
    # The top bit in both halves produces two matching checksums; the decrypted
    # layout alone has valid species, moves, egg flags and a verified ROM name.
    body, read = fixture(key=0x80008000)
    result = decode_party_mon(body, read)
    assert result.species == "TORCHIC"
    assert result.diagnostic is None
    plain, _ = fixture(key=0x80008000, plain=True)
    assert decode_party_mon(plain, read) == replace(result, decode_mode="plaintext")


def test_mixed_decryption_and_corruption_are_explicit_harness_bugs():
    body, read = fixture()
    for offset in [0x20, 0x2C, 0x38, 0x44]:
        corrupt = bytearray(body)
        corrupt[offset] ^= 1
        result = decode_party_mon(bytes(corrupt), read)
        assert result.species is None
        assert "checksum mismatch" in result.diagnostic
        assert result.raw_hex == corrupt.hex()


@pytest.mark.parametrize(
    "offset,value,reason",
    [
        (0x13, 3, "Bad Egg"),
        (0x13, 0, "no species"),
        (0x13, 6, "egg flags"),
        (0x54, 0, "level"),
        (0x54, 101, "level"),
        (0x56, 21, "HP"),
        (0x58, 0, "HP"),
        (0x53, 1, "status"),
    ],
)
def test_invalid_header_and_tail_are_never_plausible_pokemon(offset, value, reason):
    body, read = fixture()
    invalid = bytearray(body)
    invalid[offset] = value
    result = decode_party_mon(bytes(invalid), read)
    assert result.species is None
    assert reason in result.diagnostic


def test_egg_keeps_its_real_species_and_explicit_egg_identity():
    body, read = fixture(egg=True)
    result = decode_party_mon(body, read)
    assert result.is_egg is True
    assert result.species_id == 280


def test_box_mon_uses_same_validated_secure_layout_without_fabricating_hp_or_level():
    body, read = fixture()
    result = decode_box_mon(body[:80], read)
    assert result.species == "TORCHIC"
    assert result.moves[0].name == "WATER GUN"
    assert result.level is None and result.hp is None and result.status is None


def test_short_snapshots_and_failed_rom_reads_are_diagnostic():
    body, read = fixture()
    assert "short" in decode_party_mon(body[:99], read).diagnostic
    assert "short" in decode_box_mon(body[:79], read).diagnostic
    assert (
        "species-name"
        in decode_party_mon(
            body,
            lambda a, n: bytes(n) if SPECIES_NAMES <= a < SPECIES_NAMES + 412 * 11 else read(a, n),
        ).diagnostic
    )
    assert (
        "move-name"
        in decode_party_mon(
            body, lambda a, n: bytes(n) if MOVE_NAMES <= a < MOVE_NAMES + 355 * 13 else read(a, n)
        ).diagnostic
    )


def change_secure(body, *, growth=None, attacks=None):
    body = bytearray(body)
    personality, ot_id = struct.unpack_from("<II", body)
    key = personality ^ ot_id
    secure = bytearray(
        struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", body[0x20:0x50])))
    )
    order = SUBSTRUCT_ORDERS[personality % 24]
    for kind, value in [("G", growth), ("A", attacks)]:
        if value is not None:
            offset = 12 * order.index(kind)
            secure[offset : offset + len(value)] = value
    struct.pack_into("<H", body, 0x1C, sum(struct.unpack("<24H", secure)) & 0xFFFF)
    body[0x20:0x50] = struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", secure)))
    return bytes(body)


@pytest.mark.parametrize("move,pp", [(355, 1), (55, 65), (0, 1)])
def test_invalid_move_and_pp_are_diagnostic(move, pp):
    body, read = fixture()
    result = decode_party_mon(
        change_secure(body, attacks=struct.pack("<4H4B", move, 0, 0, 0, pp, 0, 0, 0)), read
    )
    assert result.species is None
    assert "move or PP" in result.diagnostic


@pytest.mark.parametrize("species", [0, 412, 999])
def test_out_of_range_species_never_indexes_the_rom_table(species):
    body, read = fixture()
    result = decode_party_mon(change_secure(body, growth=struct.pack("<H", species)), read)
    assert result.species is None
    assert "species out of range" in result.diagnostic


def test_identity_and_secure_moves_survive_slot_reordering_and_evolution():
    body, read = fixture()
    result = decode_party_mon(body, read)
    evolved = change_secure(body, growth=struct.pack("<H", 281))

    def evolution_read(address, length):
        if address == SPECIES_NAMES + 11 * 281:
            return (text("COMBUSKEN") + b"\xff").ljust(length, b"\x00")
        return read(address, length)

    evolved_result = decode_party_mon(evolved, evolution_read)
    assert result.identity == evolved_result.identity
    assert evolved_result.species == "COMBUSKEN"
    assert evolved_result.moves == result.moves


def test_item_rom_table_is_validated_and_pp_respects_its_actual_move():
    from pokebench_env.pokemon import read_item_name

    body, read = fixture()
    assert read_item_name(read, 13) == "POTION"
    assert decode_party_mon(body, read).held_item_name == "POTION"
    assert (
        "held item out of range"
        in decode_party_mon(
            change_secure(body, growth=struct.pack("<HH", 280, 377)), read
        ).diagnostic
    )
    assert (
        "held-item"
        in decode_party_mon(body, lambda a, n: bytes(n) if a >= ITEMS else read(a, n)).diagnostic
    )
    assert (
        "base-PP"
        in decode_party_mon(
            body,
            lambda a, n: bytes(n) if BATTLE_MOVES <= a < BATTLE_MOVES + 355 * 12 else read(a, n),
        ).diagnostic
    )
    excessive = change_secure(body, attacks=struct.pack("<4H4B", 55, 0, 0, 0, 26, 0, 0, 0))
    assert "PP exceeds" in decode_party_mon(excessive, read).diagnostic


def ambiguous_fixture():
    body, read = fixture(key=1)
    # Make checksum changes cancel without making either candidate invalid.
    attacks = struct.pack("<4H4B", 55, 78, 0, 33, 25, 12, 0, 3)
    body = change_secure(body, attacks=attacks)
    changed = bytearray(body)
    personality, ot_id = struct.unpack_from("<II", changed)
    key = personality ^ ot_id
    secure = bytearray(
        struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", changed[0x20:0x50])))
    )
    ev = 12 * SUBSTRUCT_ORDERS[personality % 24].index("E")
    for offset in [0, 4, 8]:
        secure[ev + offset] = 1
    struct.pack_into("<H", changed, 0x1C, sum(struct.unpack("<24H", secure)) & 0xFFFF)
    changed[0x20:0x50] = struct.pack("<12I", *(w ^ key for w in struct.unpack("<12I", secure)))
    memory = Memory()
    memory.put(SPECIES_NAMES + 11 * 281, text("COMBUSKEN") + b"\xff")
    memory.put(
        ITEMS + 44 * 12, (text("PREMIER BALL") + b"\xff").ljust(14, b"\x00") + struct.pack("<H", 12)
    )
    for move, name, pp in [
        (54, "MIST", 30),
        (79, "SLEEP POWDER", 15),
        (1, "POUND", 35),
        (32, "HORN DRILL", 5),
    ]:
        memory.put(MOVE_NAMES + 13 * move, text(name) + b"\xff")
        memory.put(BATTLE_MOVES + 12 * move + 4, bytes([pp]))

    def both(address, length):
        return memory.read(address, length) if address in memory.cells else read(address, length)

    return bytes(changed), both


def test_two_completely_valid_checksum_layouts_need_bound_cpu_ownership():
    body, read = ambiguous_fixture()
    result = decode_party_mon(body, read)
    assert result.species is None
    assert "CPU owner unavailable" in result.diagnostic


def test_native_frame_9783_in_place_plaintext_regression():
    # Owned isolated US-ROM probe; old XOR-only reader returned species 61358.
    # The game was paused at its ordinary frame boundary inside an in-place read.
    body = bytes.fromhex(
        "e45539fe51bb7104c7cfbec5c3caff0801000202bbbbbbbbbbbbbb00a6a800000000000000000000000000001b010000870000000046000021002d0000000000232800000010852161f7ad0f000000000000000005ff140014000e000b000a000b000900"
    )
    memory = Memory()
    memory.put(SPECIES_NAMES + 11 * 283, text("MUDKIP") + b"\xff")
    for move, name, pp in [(33, "TACKLE", 35), (45, "GROWL", 40)]:
        memory.put(MOVE_NAMES + 13 * move, text(name) + b"\xff")
        memory.put(BATTLE_MOVES + 12 * move + 4, bytes([pp]))
    result = decode_party_mon(body, memory.read)
    assert result.species == "MUDKIP"
    assert result.species_id == 283
    assert result.identity == "fe3955e4:0471bb51"
    assert result.decode_mode == "plaintext"
    assert result.diagnostic is None


def cpu_context(pc=0x082E7C54, lr=0x0806A283, *, mode=0x3F, pointer=0x020244EC):
    from pokebench_env.pokemon import PokemonCpu

    regs = [0] * 16
    regs[5] = regs[8] = pointer
    regs[13:16] = [0x03007BF4, lr, pc]
    words = [0] * 32
    words[4] = 0x08068CA3
    words[10] = 0x0806A6D1
    return PokemonCpu(tuple(regs), mode, regs[13], struct.pack("<32I", *words))


def test_ambiguous_legal_key_uses_native_frame_cpu_unwind_and_same_mon_pointer():
    body, read = ambiguous_fixture()
    cpu = cpu_context()
    # An encrypted fixture at the identical read-only owner describes Combusken;
    # source/ROM call stack proves that bytes currently represent plaintext.
    result = decode_party_mon(body, read, address=0x020244EC, cpu=cpu)
    assert result.species == "COMBUSKEN"
    assert result.decode_mode == "plaintext"
    encrypted = decode_party_mon(
        body, read, address=0x020244EC, cpu=cpu_context(pc=0x08085E5C, lr=0)
    )
    assert encrypted.species == "TORCHIC"
    assert encrypted.decode_mode == "encrypted"
    assert decode_box_mon(body[:80], read, address=0x020244EC, cpu=cpu).species == "COMBUSKEN"


def test_irq_stale_stack_and_partial_crypto_never_select_a_candidate():
    from dataclasses import replace

    body, read = ambiguous_fixture()
    for cpu in [
        cpu_context(mode=0x32),
        cpu_context(pc=0x0806A256),
        replace(cpu_context(), stack_address=0x03007BE0),
        replace(cpu_context(), stack_bytes=bytes(4)),
        replace(cpu_context(), gprs=()),
        cpu_context(pc=0x03007FAC),
    ]:
        result = decode_party_mon(body, read, address=0x020244EC, cpu=cpu)
        assert result.species is None
        assert "CPU owner unavailable" in result.diagnostic
    other = decode_party_mon(body, read, address=0x02024550, cpu=cpu_context())
    assert other.species == "TORCHIC"


def test_cpu_capture_is_optional_and_type_checked():
    from pokebench_env.pokemon import pokemon_cpu_context

    class Reader:
        def pokemon_cpu_context(self):
            return cpu_context()

    assert pokemon_cpu_context(Reader()) == cpu_context()
    assert pokemon_cpu_context(lambda a, n: bytes(n)) is None

    class InvalidReader:
        def pokemon_cpu_context(self):
            return None

    assert pokemon_cpu_context(InvalidReader()) is None


@pytest.mark.parametrize(
    "pc,reg,field_index,return_index,return_address,expected",
    [
        (0x0806A6D4, 8, 0, None, None, "plaintext"),
        (0x0806A69A, 8, 0, None, None, "encrypted"),
        (0x0806AC98, 8, 0, None, None, "encrypted"),
        (0x0806AE34, 7, None, None, None, "plaintext"),
        (0x0806ADCA, 7, None, None, None, "encrypted"),
        (0x0806B3F0, 7, None, None, None, "encrypted"),
        (0x08068CC2, 4, None, 5, 0x0806A6D1, "plaintext"),
        (0x08068CC2, 4, None, 5, 0, None),
        (0x0806A272, 5, None, 3, 0x08068CA3, None),
        (0x0806A516, 5, None, 3, 0x08068CA3, None),
        (0x0806A300, 5, None, 3, 0x08068CA3, "plaintext"),
        (0x0806A300, 5, None, 3, 0x0806A6A9, "encrypted"),
        (0x0806A300, 5, None, 3, 0, None),
        (0x082E7BE4, 5, None, 3, 0x08068CA3, "plaintext"),
        (0x082E7C14, 5, None, 4, 0x0806A6A9, "encrypted"),
        (0x082E7C14, 5, None, 4, 0, None),
        (0x08067C9E, 4, None, None, None, None),
    ],
)
def test_source_qualified_owner_intervals_and_exact_unwind_frames(
    pc, reg, field_index, return_index, return_address, expected
):
    from pokebench_env.pokemon import PokemonCpu, _representation_owner

    regs = [0] * 16
    regs[reg] = 0x020244EC
    regs[10] = 45
    regs[13:16] = [0x03007BF4, 0x0806A283, pc]
    words = [0] * 16
    if field_index is not None:
        words[field_index] = 45
    if return_index is not None:
        words[return_index] = return_address
    words[9 if pc < 0x082E7BEE else 10] = 0x0806A6D1
    cpu = PokemonCpu(tuple(regs), 0x3F, regs[13], struct.pack("<16I", *words))
    assert _representation_owner(cpu, 0x020244EC) == expected
    if reg in (7, 8) or pc == 0x0806A300:
        assert _representation_owner(cpu, 0x02024550) == "encrypted"


def test_invalid_snapshot_preserves_its_bounded_atomic_cpu_evidence():
    from dataclasses import replace

    body, read = ambiguous_fixture()
    cpu = replace(cpu_context(mode=0x32), stack_bytes=bytes(256))
    result = decode_party_mon(body, read, address=0x020244EC, cpu=cpu)
    assert result.species is None
    assert result.cpu_context.gprs == cpu.gprs
    assert result.cpu_context.cpsr == 0x32
    assert result.cpu_context.stack_address == cpu.gprs[13]
    assert len(result.cpu_context.stack_hex) == 256
    assert decode_party_mon(body[:99], read, cpu=cpu).cpu_context == result.cpu_context
    assert decode_party_mon(body[:99], read, cpu=replace(cpu, gprs=())).cpu_context is None
    valid, read = fixture()
    assert decode_party_mon(valid, read, cpu=cpu).cpu_context is None
