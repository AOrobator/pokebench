import struct

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

NAMING = struct.pack("<II", 0, 0x080E4F59)


class Shot(BaseModel):
    screenshot_base64: object = "iVBORw0KGgo="
    step_number: int = 12


def memory(address: int, length: int) -> bytes:
    if address == 0x030022C0:
        return NAMING
    return bytes(length)


def test_native_frame_adapter_without_video_is_unavailable() -> None:
    from types import SimpleNamespace

    from pokebench_env.serve import native_screenshot

    with pytest.raises(HTTPException, match="no screenshot available"):
        native_screenshot(SimpleNamespace(get_screenshot=lambda: None))
