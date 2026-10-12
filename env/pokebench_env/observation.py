"""Owned agent observation: the vendor's own LLM text state plus the frame.

The vendor's `/mcp/get_game_state` pulls in its agent stack (and a `google`
dependency); this route reuses only its `/state` handler and
`utils.state_formatter.format_state_for_llm`, so vendor code stays pristine.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pokebench_env.game_screen import ReadMemory, read_screen

GameState = dict[str, object]
StateFn = Callable[[], Awaitable[BaseModel]]
Formatter = Callable[[GameState], str]


def install_observation(
    app: FastAPI, get_state: StateFn, formatter: Formatter, read_memory: ReadMemory
) -> None:
    @app.get("/pokebench/observation")
    async def observation() -> dict[str, object]:
        state = (await get_state()).model_dump()
        visual = state.get("visual")
        screenshot = visual.get("screenshot_base64") if isinstance(visual, dict) else None
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot in game state")
        return {
            "state_text": formatter(state),
            "screenshot_base64": screenshot,
            "step_number": state.get("step_number"),
            "screen": _screen(read_memory),
        }


def _screen(read_memory: ReadMemory) -> dict[str, object]:
    screen = read_screen(read_memory)
    return {"kind": screen.kind, "callback1": screen.callback1, "callback2": screen.callback2}
