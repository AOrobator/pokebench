"""Verify the vendored continual-harness checkout is the pinned, unmodified commit."""

import subprocess
from pathlib import Path

VENDOR_PIN = "bbab97ad73e460b7cd7c08527d10ced30cc03fbe"


class VendorError(RuntimeError):
    pass


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise VendorError(f"{repo} is not a git checkout: {result.stderr.strip()}")
    return result.stdout


def check_vendor(repo: Path, pin: str = VENDOR_PIN) -> None:
    if not repo.is_dir():
        raise VendorError(f"{repo} is not a git checkout")
    head = _git(repo, "rev-parse", "HEAD").strip()
    if head != pin:
        raise VendorError(f"{repo} is at {head}, expected {pin}")
    dirty = _git(repo, "status", "--porcelain=v1", "--untracked-files=all").strip()
    if dirty:
        raise VendorError(f"{repo} has local changes:\n{dirty}")
