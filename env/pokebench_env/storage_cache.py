"""Bounded, journal-owned cache for unchanged, validated PC Pokémon records."""

from collections import OrderedDict

from pokebench_env.game_screen import ReadMemory
from pokebench_env.pokemon import (
    PartyMon,
    PokemonCpu,
    _representation_owner,
    decode_box_mon,
)


class StorageDecodeCache:
    """One native journal/core owns this cache; normal observations stay uncached.

    Every selected snapshot still reads all native storage bytes. Exact slot,
    raw record and qualified CPU representation must match. Invalid or unknown
    CPU ownership is redecoded and never retains stale diagnostic evidence.
    """

    def __init__(self) -> None:
        self._slots: OrderedDict[int, tuple[bytes, str, PartyMon]] = OrderedDict()

    def clear(self) -> None:
        self._slots.clear()

    def decode(
        self, body: bytes, read: ReadMemory, *, address: int, cpu: PokemonCpu | None
    ) -> PartyMon:
        owner = _representation_owner(cpu, address)
        cached = self._slots.get(address)
        if owner is not None and cached is not None and cached[:2] == (body, owner):
            self._slots.move_to_end(address)
            return cached[2]
        self._slots.pop(address, None)
        result = decode_box_mon(body, read, address=address, cpu=cpu)
        if (
            owner is not None
            and result.diagnostic is None
            and result.nickname_diagnostic is None
            and result.cpu_context is None
        ):
            self._slots[address] = (body, owner, result)
            if len(self._slots) > 420:
                self._slots.popitem(last=False)
        return result
