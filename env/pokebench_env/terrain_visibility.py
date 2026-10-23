"""field-move-gates-v1 special-terrain presentation."""

from pokebench_env.field_moves import FieldObstacles
from pokebench_env.live_map import FullMap, LocalMap


def terrain_view(
    shown: LocalMap | FullMap, field: FieldObstacles[object] | None
) -> tuple[LocalMap | FullMap, str]:
    return shown, ""
