"""respawn-readout-v1: stub (RED)."""

from dataclasses import dataclass

SWITCH = "respawn-readout-v1"
HEAL_POINTS: dict[tuple[str, int, int], object] = {}
CENTERS: dict[str, tuple[str, int, int]] = {}


@dataclass(frozen=True)
class CenterExit:
    map_id: tuple[int, int]
    name: str
    x: int | None
    y: int | None


@dataclass(frozen=True)
class Respawn:
    map_id: tuple[int, int]
    name: str
    x: int
    y: int
    hops: int | None
    centers: tuple[CenterExit, ...]


class LinkCache:
    def __init__(self, links: object = None) -> None:
        raise NotImplementedError


class RespawnMemory:
    def __init__(self) -> None:
        raise NotImplementedError


def map_changes(*args: object) -> int | None:
    raise NotImplementedError


def read_respawn(*args: object) -> Respawn | None:
    raise NotImplementedError


def respawn_line(*args: object, **kwargs: object) -> str:
    raise NotImplementedError
