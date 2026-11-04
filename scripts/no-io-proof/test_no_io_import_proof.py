"""Guard proof: reading disk while a test module imports must be a collection error."""

from pathlib import Path

HOSTS = Path("/etc/hosts").read_text()


def test_never_collected():
    assert HOSTS
