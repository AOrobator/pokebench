"""The party art build writes ROM-derived art only under the repository's runs/.

Covers scripts/party-art/build_party_art.py main()'s output check, which runs before any build.
"""

import importlib.util
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(SCRIPTS / "trainer-card"))
spec = importlib.util.spec_from_file_location(
    "build_party_art", SCRIPTS / "party-art" / "build_party_art.py"
)
assert spec is not None and spec.loader is not None
party_art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(party_art)


def test_the_real_root_is_the_repository_runs() -> None:
    assert party_art.RUNS_ROOT == SCRIPTS.parent / "runs"
