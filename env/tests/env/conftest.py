from pathlib import Path

import pytest

from pokebench_env import rerender
from pokebench_env.game_state import MapNames

# Path.read_text calls made by each porymap_names load this session (the fixture is session-scoped).
PORYMAP_LOADS: list[int] = []


@pytest.fixture(scope="session")
def porymap_names() -> MapNames:
    """The real porymap MapNames, loaded once per session and shared by every module."""
    reads = 0
    read_text = Path.read_text

    def counted(self: Path, *args: object, **kwargs: object) -> str:
        nonlocal reads
        reads += 1
        return read_text(self, *args, **kwargs)  # type: ignore[arg-type]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(Path, "read_text", counted)
        names = MapNames.load(rerender.PORYMAP_MAPS)
    PORYMAP_LOADS.append(reads)
    return names
