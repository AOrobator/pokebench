"""Measurement-only flag bitmap from the same locked save snapshot as story.py."""

from dataclasses import asdict, dataclass

from pokebench_env.game_screen import ReadMemory
from pokebench_env.resources import Resources


@dataclass(frozen=True)
class StoryProgress:
    flags: str
    rustboro_stage: int | None
    devon_stage: int | None
    letter: bool | None
    variables: str | None = None
    avatar_flags: int | None = None

    def json(self) -> dict[str, object]:
        return {
            key: value
            for key, value in asdict(self).items()
            if key not in ("variables", "avatar_flags") or value is not None
        }


def read_story_progress(
    read: ReadMemory, save1: int, resources: Resources | None
) -> StoryProgress | None:
    if not 0x02000000 <= save1 <= 0x02040000 - 0x159C or save1 % 4:
        return None

    def exact(address: int, size: int) -> bytes:
        body = read(address, size)
        if len(body) != size:
            raise ValueError("short story progress read")
        return body

    flags = exact(save1 + 0x1270, 0x12C)
    variables = exact(save1 + 0x139C, 0x200)

    def stage(variable: int, maximum: int) -> int | None:
        offset = 2 * (variable - 0x4000)
        value = int.from_bytes(variables[offset : offset + 2], "little")
        return value if value <= maximum else None

    try:
        avatar_body = read(0x02037590, 1)
    except (KeyError, ValueError):
        avatar_flags = None
    else:
        if len(avatar_body) != 1:
            raise ValueError("short campaign avatar read")
        avatar_flags = avatar_body[0]

    return StoryProgress(
        flags.hex(),
        stage(0x405A, 8),
        stage(0x408F, 1),
        None
        if resources is None or resources.bag is None
        else any(item.item_id == 274 and item.quantity > 0 for item in resources.bag),
        variables.hex(),
        avatar_flags,
    )
