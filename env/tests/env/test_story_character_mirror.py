import json
from pathlib import Path

from pokebench_env.character_presence import CHARACTERS

GOLDEN = Path(__file__).parents[3] / "packages" / "agent" / "test-support" / "story-characters.json"


def test_character_table_matches_the_agent_mirror() -> None:
    # packages/agent/src/script-line-presence.ts (script-line-presence-v1) names story characters
    # on dialogue pages by this table; both suites check the same golden file.
    golden = json.loads(GOLDEN.read_text())
    assert golden == [
        {"name": name, "graphics": sorted(graphics), "maps": sorted(maps)}
        for name, graphics, maps in CHARACTERS
    ]
