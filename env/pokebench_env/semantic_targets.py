"""semantic-navigation-v2: the navigate_to_target argument for each listed game target.

The argument is written exactly as the tool's schema takes it, so the model can copy it. Only
targets the tool can resolve from the same readout get one: a listed object by its map-local id,
a listed warp by its tile, another listed interaction by its kind and tile, and a walking map
connection by its direction.
"""

import json
from collections.abc import Iterable

from pokebench_env.world import InteractionTarget

SWITCH = "semantic-navigation-v2"
WALKING = ("NORTH", "SOUTH", "EAST", "WEST")


def _argument(body: dict[str, object]) -> str:
    return json.dumps(body, separators=(",", ":"))


def interaction_argument(target: InteractionTarget) -> str | None:
    if target.kind == "object":
        if target.local_id is None:
            return None
        return _argument({"kind": "object", "local_id": target.local_id})
    if target.kind == "warp":
        return _argument({"kind": "warp", "x": target.x, "y": target.y})
    return _argument(
        {"kind": "interaction", "interaction_kind": target.kind, "x": target.x, "y": target.y}
    )


def interaction_suffix(target: InteractionTarget) -> str:
    argument = interaction_argument(target)
    return "" if argument is None else f"; navigate_to_target target {argument}"


def connection_argument(direction: str) -> str | None:
    if direction not in WALKING:
        return None
    return _argument({"kind": "connection", "direction": direction})


def listed_objects(targets: Iterable[InteractionTarget] | None) -> frozenset[int]:
    """Map-local ids of the objects the readout lists, which the tool can resolve."""
    return frozenset(
        t.local_id for t in targets or () if t.kind == "object" and t.local_id is not None
    )


def object_argument(local_id: int) -> str:
    return _argument({"kind": "object", "local_id": local_id})


def same_tile(targets: Iterable[InteractionTarget] | None, target: InteractionTarget) -> int:
    """How many listed targets the tool could confuse with this one on its tile.

    A warp is told apart from other warps. Any other interaction (background, bookshelf
    metatile, trigger) must be the only non-warp target on its tile, objects included.
    """

    def rival(t: InteractionTarget) -> bool:
        if target.kind == "warp":
            return t.kind == "warp"
        # A person or object on the tile answers A before any background or metatile does.
        return t.kind != "warp"

    return sum(rival(t) and (t.x, t.y) == (target.x, target.y) for t in targets or ())
