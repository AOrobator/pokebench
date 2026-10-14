"""Game-owned inventory, storage and berry state from the coherent RAM snapshot.

US Emerald SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7; source
731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. Layout proof: global.h,
item.c, pokemon_storage_system.h, berry.c and exact ROM GetBerryTreeInfo
080E16C0 (8-byte stride), WaterBerryTree 080E16DC, PlantBerryTree 080E191C.
Snapshots alone describe changes, not the cause of inventory changes.
"""

import struct
from dataclasses import asdict, dataclass, replace

from pokebench_env.daycare import DaycarePokemon, read_daycare
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import OBJECT_EVENTS
from pokebench_env.pokemon import PartyMon, decode_box_mon, pokemon_cpu_context, read_item_name
from pokebench_env.storage_cache import StorageDecodeCache

BAG_POCKETS = (
    ("items", 0x560, 30),
    ("key_items", 0x5D8, 30),
    ("poke_balls", 0x650, 16),
    ("tm_hm", 0x690, 64),
    ("berries", 0x790, 46),
)
BERRY_TREES_OFFSET = 0x169C
BERRY_TREE_SIZE = 8
BERRY_TREE_COUNT = 128
FIRST_BERRY_ITEM = 133
LAST_BERRY_ITEM = 175
ITEM_COUNT = 377
# SetSaveBlocksPointers exact US ROM proof; storage is ASLR, never a fixed base.
STORAGE_POINTER = 0x03005D94
STORAGE_SIZE = 0x83D0


@dataclass(frozen=True)
class ResourceDiagnostic:
    owner: str
    message: str
    raw_hex: str | None = None


@dataclass(frozen=True)
class ResourceItem:
    slot: int
    item_id: int
    quantity: int
    pocket: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class StoragePokemon:
    box: int
    slot: int
    pokemon: PartyMon


@dataclass(frozen=True)
class PokemonStorage:
    current_box: int
    occupied: tuple[StoragePokemon, ...]


@dataclass(frozen=True)
class BerryTree:
    tree_id: int
    berry: int
    item_id: int | None
    stage: int
    stop_growth: bool
    minutes_until_next_stage: int
    yield_count: int
    regrowth_count: int
    watered: tuple[bool, bool, bool, bool]


@dataclass(frozen=True)
class Resources:
    bag: tuple[ResourceItem, ...] | None = None
    pc_items: tuple[ResourceItem, ...] | None = None
    storage: PokemonStorage | None = None
    berry_trees: tuple[BerryTree, ...] | None = None
    planted_berries: int | None = None
    diagnostics: tuple[ResourceDiagnostic, ...] = ()
    script_pc: int | None = None
    script_mode: int | None = None
    script_status: int | None = None
    selected_tree_id: int | None = None
    berry_script_owner: str | None = None
    daycare: tuple[DaycarePokemon, ...] | None = None

    def json(self) -> dict[str, object]:
        return asdict(self)


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    data = read(address, length)
    if len(data) != length:
        raise ValueError(f"short resource read at {address:08X}: {len(data)} of {length}")
    return data


def _pointer(address: int, length: int) -> bool:
    return 0x02000000 <= address <= 0x02040000 - length and address % 4 == 0


def _items(body: bytes, key: int, pocket: str | None) -> tuple[ResourceItem, ...]:
    result = []
    for slot, (item, encrypted_quantity) in enumerate(struct.iter_unpack("<HH", body)):
        quantity = encrypted_quantity ^ key
        if item == 0:
            if quantity != 0:
                raise ValueError(f"empty item slot {slot} has nonzero quantity")
            continue
        capacity = 999 if pocket in (None, "berries") else 99
        if not 1 <= item < ITEM_COUNT or not 1 <= quantity <= capacity:
            raise ValueError(f"invalid item/quantity in slot {slot}: {item}/{quantity}")
        if pocket == "berries" and not FIRST_BERRY_ITEM <= item <= LAST_BERRY_ITEM:
            raise ValueError(f"non-berry item in berry pocket slot {slot}: {item}")
        result.append(ResourceItem(slot, item, quantity, pocket))
    return tuple(result)


def _trees(body: bytes) -> tuple[BerryTree, ...]:
    trees = []
    for tree_id in range(BERRY_TREE_COUNT):
        data = body[tree_id * BERRY_TREE_SIZE : (tree_id + 1) * BERRY_TREE_SIZE]
        berry, stage_byte, minutes, count, bits = struct.unpack_from("<BBHBB", data)
        stage = stage_byte & 0x7F
        if berry > 43 or stage > 5 or (stage == 0) != (berry == 0) or bits & 15 > 10:
            raise ValueError(f"invalid berry tree {tree_id}: {data.hex()}")
        trees.append(
            BerryTree(
                tree_id,
                berry,
                None if berry == 0 else FIRST_BERRY_ITEM + berry - 1,
                stage,
                bool(stage_byte & 0x80),
                minutes,
                count,
                bits & 15,
                (bool(bits & 0x10), bool(bits & 0x20), bool(bits & 0x40), bool(bits & 0x80)),
            )
        )
    return tuple(trees)


def read_resources(
    read: ReadMemory,
    save1: int,
    save2: int,
    *,
    include_storage: bool = True,
    storage_cache: StorageDecodeCache | None = None,
) -> Resources:
    """Call only under the game state's snapshot lock with initialized save owners.

    Invalid data remains explicit and includes raw proof. A corrupt occupied mon
    stays in the storage snapshot with the shared decoder's harness-bug diagnostic.
    """
    diagnostics: list[ResourceDiagnostic] = []
    if not _pointer(save1, BERRY_TREES_OFFSET + BERRY_TREE_COUNT * BERRY_TREE_SIZE) or not _pointer(
        save2, 0xB0
    ):
        return Resources(
            diagnostics=(ResourceDiagnostic("save", "harness bug: invalid resource save pointer"),)
        )
    bag = pc = trees = storage = None
    planted = None
    key = None
    try:
        key = struct.unpack("<I", _exact(read, save2 + 0xAC, 4))[0]
    except (ValueError, OSError) as error:
        diagnostics.append(ResourceDiagnostic("encryption", f"harness bug: {error}"))
    if key is not None:
        raw = b""
        try:
            # One contiguous bag snapshot, including all empty encrypted slots.
            raw = _exact(read, save1 + 0x560, 0x2E8)
            bag = tuple(
                replace(item, name=read_item_name(read, item.item_id))
                for pocket, offset, count in BAG_POCKETS
                for item in _items(
                    raw[offset - 0x560 : offset - 0x560 + count * 4], key & 0xFFFF, pocket
                )
            )
        except (ValueError, OSError) as error:
            diagnostics.append(ResourceDiagnostic("bag", f"harness bug: {error}", raw.hex()[:4096]))
        try:
            planted = struct.unpack("<I", _exact(read, save1 + 0x159C + 3 * 4, 4))[0] ^ key
            if planted > 0xFFFFFF:
                planted = None
                raise ValueError("invalid planted berries counter")
        except (ValueError, OSError) as error:
            diagnostics.append(ResourceDiagnostic("planted_berries", f"harness bug: {error}"))
    raw = b""
    try:
        raw = _exact(read, save1 + 0x498, 50 * 4)
        pc = tuple(
            replace(item, name=read_item_name(read, item.item_id)) for item in _items(raw, 0, None)
        )
    except (ValueError, OSError) as error:
        diagnostics.append(
            ResourceDiagnostic("pc_items", f"harness bug: {error}", raw.hex()[:4096])
        )
    raw = b""
    try:
        raw = _exact(read, save1 + BERRY_TREES_OFFSET, BERRY_TREE_COUNT * BERRY_TREE_SIZE)
        trees = _trees(raw)
    except (ValueError, OSError) as error:
        diagnostics.append(
            ResourceDiagnostic("berry_trees", f"harness bug: {error}", raw.hex()[:4096])
        )
    if include_storage:
        raw = b""
        try:
            pointer = struct.unpack("<I", _exact(read, STORAGE_POINTER, 4))[0]
            if not _pointer(pointer, STORAGE_SIZE):
                raise ValueError(f"invalid Pokémon storage pointer {pointer:08X}")
            raw = _exact(read, pointer, STORAGE_SIZE)
            current_box = raw[0]
            if current_box >= 14:
                raise ValueError(f"invalid current box {current_box}")
            occupied = []
            cpu = pokemon_cpu_context(read)
            for index in range(14 * 30):
                body = raw[4 + index * 80 : 4 + (index + 1) * 80]
                if not any(body):
                    continue
                address = pointer + 4 + index * 80
                pokemon = (
                    decode_box_mon(body, read, address=address, cpu=cpu)
                    if storage_cache is None
                    else storage_cache.decode(body, read, address=address, cpu=cpu)
                )
                occupied.append(StoragePokemon(index // 30, index % 30, pokemon))
                if pokemon.diagnostic is not None:
                    diagnostics.append(
                        ResourceDiagnostic(
                            f"storage:{index // 30}:{index % 30}",
                            pokemon.diagnostic,
                            pokemon.raw_hex,
                        )
                    )
                if pokemon.nickname_diagnostic is not None:
                    diagnostics.append(
                        ResourceDiagnostic(
                            f"storage_nickname:{index // 30}:{index % 30}",
                            pokemon.nickname_diagnostic,
                            pokemon.raw_hex,
                        )
                    )
            storage = PokemonStorage(current_box, tuple(occupied))
        except (ValueError, OSError) as error:
            diagnostics.append(
                ResourceDiagnostic("storage", f"harness bug: {error}", raw[:100].hex())
            )
    daycare = None
    daycare_raw = b""
    try:
        daycare_raw = _exact(read, save1 + 0x3030, 280)
        daycare = read_daycare(read, save1)
        for entry in daycare:
            mon = entry.pokemon
            for label, diagnostic in (("", mon.diagnostic), ("_nickname", mon.nickname_diagnostic)):
                if diagnostic:
                    diagnostics.append(
                        ResourceDiagnostic(f"daycare{label}:{entry.slot}", diagnostic, mon.raw_hex)
                    )
    except (ValueError, OSError, struct.error) as error:
        diagnostics.append(
            ResourceDiagnostic("daycare", f"harness bug: {error}", daycare_raw.hex()[:560])
        )
    script_pc = script_mode = script_status = selected_tree_id = None
    berry_script_owner = None
    try:
        context = _exact(read, 0x03000E40, 12)
        script_mode = context[1]
        script_pc = struct.unpack_from("<I", context, 8)[0]
        script_status = _exact(read, 0x03000E38, 1)[0]
        if script_mode > 2 or script_status > 2:
            raise ValueError("invalid berry script context")
        if script_mode in (1, 2) and script_status == 0:
            # Bytecode ranges after the committing special, before that path's end.
            if 0x0827445C <= script_pc < 0x08274470:
                berry_script_owner = "harvest"
            elif 0x082744D0 <= script_pc < 0x082744DD:
                berry_script_owner = "water"
            elif 0x082744E2 <= script_pc < 0x082744F0:
                berry_script_owner = "plant"
        if berry_script_owner is not None:
            selected = _exact(read, 0x03005DF0, 1)[0]
            if selected >= 16:
                raise ValueError("invalid selected berry object")
            obj = _exact(read, OBJECT_EVENTS + selected * 0x24, 0x24)
            if not obj[0] & 1 or obj[0x1D] >= BERRY_TREE_COUNT:
                raise ValueError("invalid selected berry tree")
            selected_tree_id = obj[0x1D]
    except (ValueError, OSError) as error:
        berry_script_owner = None
        selected_tree_id = None
        diagnostics.append(ResourceDiagnostic("berry_script", f"harness bug: {error}"))
    return Resources(
        bag,
        pc,
        storage,
        trees,
        planted,
        tuple(diagnostics),
        script_pc,
        script_mode,
        script_status,
        selected_tree_id,
        berry_script_owner,
        daycare,
    )
