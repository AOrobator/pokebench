"""Require an exact, staged approval receipt for protected design changes."""

import hashlib
import json
import re
import subprocess
import sys

PROTECTED = (
    "docs/design/trainer-cards/",
    "packages/viewer/design-tests/",
    "packages/viewer/src/trainer-card.test.ts",
    "packages/viewer/src/trainer-card-app.test.ts",
    "packages/viewer/src/workbench.test.ts",
    "scripts/check-trainer-card-design.py",
    "scripts/test_trainer_card_design_guard.py",
    ".githooks/pre-commit",
)
RECEIPT = "docs/design/trainer-card-approval.json"


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


def check() -> None:
    changed = (
        git("diff", "--cached", "--name-only", "-z", "--no-renames")
        .decode()
        .split("\0")
    )
    protected = sorted(
        p
        for p in changed
        if p and any(p == x or (x.endswith("/") and p.startswith(x)) for x in PROTECTED)
    )
    if "justfile" in changed:
        before = git("show", "HEAD:justfile").decode()
        after = git("show", ":justfile").decode()

        def recipe(text: str, name: str) -> str:
            match = re.search(r"^" + name + r":\n(?:[ \t].*\n|\n)*", text, re.MULTILINE)
            return "" if match is None else match.group()

        def invokes_check(text: str) -> bool:
            return any(
                line.strip() == "just trainer-card-check"
                for line in recipe(text, "test").splitlines()
            )

        if recipe(before, "trainer-card-check") != recipe(
            after, "trainer-card-check"
        ) or invokes_check(before) != invokes_check(after):
            protected.append("justfile")
            protected.sort()
    if not protected:
        return
    if RECEIPT not in changed:
        raise ValueError("stage a new operator approval receipt")
    receipt = json.loads(git("show", ":" + RECEIPT))
    if receipt.get("parent") != git("rev-parse", "HEAD").decode().strip():
        raise ValueError("approval must name the current parent commit")
    if not all(
        isinstance(receipt.get(k), str) and receipt[k].strip()
        for k in ("user_quote", "source")
    ):
        raise ValueError(
            "approval must quote the user and identify the source chat/message"
        )
    expected = {}
    staged = set(git("ls-files", "-z").decode().split("\0"))
    for path in protected:
        expected[path] = (
            hashlib.sha256(git("show", ":" + path)).hexdigest()
            if path in staged
            else None
        )
    if receipt.get("files") != expected:
        raise ValueError(
            "approval hashes must exactly match all protected staged changes (null for deletions)"
        )


if __name__ == "__main__":
    try:
        check()
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(
            f"Trainer-card design is operator protected: {error}. See docs/design/trainer-cards/README.md.",
            file=sys.stderr,
        )
        sys.exit(1)
