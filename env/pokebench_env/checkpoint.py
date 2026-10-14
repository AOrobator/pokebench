"""Agent-run checkpoints: return the emulator's native save state on request."""

import base64
import hashlib
from collections.abc import Callable

from fastapi import FastAPI, HTTPException


def install_checkpoint(api: FastAPI, checkpoint: Callable[[], bytes | None]) -> None:
    @api.post("/pokebench/checkpoint")
    def save_checkpoint() -> dict[str, object]:
        data = checkpoint()
        if not data:
            raise HTTPException(503, "native checkpoint unavailable")
        return {
            "sha1": hashlib.sha1(data, usedforsecurity=False).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(),
            "state_base64": base64.b64encode(data).decode("ascii"),
        }
