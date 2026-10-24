"""Exercise the actual guard against staged changes in disposable repositories."""

import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

GUARD = Path(__file__).with_name("check-trainer-card-design.py").resolve()
HOOK = GUARD.parent.parent / ".githooks/pre-commit"


class DesignGuardTest(unittest.TestCase):
    def test_staged_approval_is_exact_and_cannot_be_reused(self):
        with tempfile.TemporaryDirectory() as root:

            def git(*args):
                return (
                    subprocess.check_output(
                        ["git", "-C", root, *args], stderr=subprocess.DEVNULL
                    )
                    .decode()
                    .strip()
                )

            def run():
                return subprocess.run(
                    ["bash", str(HOOK)], cwd=root, capture_output=True
                ).returncode

            path = "docs/design/trainer-cards/baseline.txt"
            target = Path(root, path)
            target.parent.mkdir(parents=True)
            target.write_text("approved")
            guard_copy = Path(root, "scripts/check-trainer-card-design.py")
            guard_copy.parent.mkdir()
            guard_copy.write_bytes(GUARD.read_bytes())
            Path(root, "justfile").write_text(
                "test:\n    just trainer-card-check\n\ntrainer-card-check:\n    check-design\n"
            )
            git("init", "-q")
            git("add", ".")
            git(
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.test",
                "commit",
                "-qm",
                "base",
            )
            self.assertEqual(run(), 0)
            guard_copy.write_text("raise SystemExit(0)")
            git("add", str(guard_copy))
            self.assertEqual(
                run(), 1, "committed guard rejects staging a weakened guard"
            )
            git("restore", "--staged", "--worktree", str(guard_copy))
            gate = Path(root, "justfile")
            gate.write_text(
                "test:\n    other-tests\n\ntrainer-card-check:\n    check-design\n"
            )
            git("add", "justfile")
            self.assertEqual(
                run(), 1, "cannot remove the design gate from normal tests"
            )
            git("restore", "--staged", "--worktree", "justfile")
            target.write_text("changed")
            git("add", path)
            self.assertEqual(run(), 1)
            approval = {
                "parent": git("rev-parse", "HEAD"),
                "source": "test-owned user message",
                "user_quote": "Approve this fixture change",
                "files": {path: hashlib.sha256(b"changed").hexdigest()},
            }
            receipt = Path(root, "docs/design/trainer-card-approval.json")
            receipt.write_text(json.dumps(approval))
            self.assertEqual(run(), 1, "unstaged receipt cannot authorize a commit")
            git("add", str(receipt))
            self.assertEqual(run(), 0)
            target.write_text("changed again")
            git("add", path)
            self.assertEqual(run(), 1, "approval binds staged bytes")
            approval["files"][path] = hashlib.sha256(b"changed again").hexdigest()
            receipt.write_text(json.dumps(approval))
            git("add", str(receipt))
            self.assertEqual(run(), 0)
            git(
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.test",
                "commit",
                "-qm",
                "approved",
            )
            target.unlink()
            git("add", path)
            self.assertEqual(run(), 1, "prior receipt cannot authorize deletion")
            approval["parent"] = git("rev-parse", "HEAD")
            approval["files"] = {path: None}
            receipt.write_text(json.dumps(approval))
            git("add", str(receipt))
            self.assertEqual(run(), 0)
            approval["parent"] = "0" * 40
            receipt.write_text(json.dumps(approval))
            git("add", str(receipt))
            self.assertEqual(run(), 1)


if __name__ == "__main__":
    unittest.main()
