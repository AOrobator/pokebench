"""Owned agent observation: the vendor's own LLM text state plus the frame.

The vendor's `/mcp/get_game_state` pulls in its agent stack (and a `google`
dependency); this route reuses only its `/state` handler and
`utils.state_formatter.format_state_for_llm`, so vendor code stays pristine.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException

GameState = dict[str, object]
StateFn = Callable[[], Awaitable[GameState]]
Formatter = Callable[[GameState], str]


def install_observation(app: FastAPI, get_state: StateFn, formatter: Formatter) -> None:
    @app.get("/pokebench/observation")
    async def observation() -> dict[str, str]:
        state = await get_state()
        visual = state.get("visual")
        screenshot = visual.get("screenshot_base64") if isinstance(visual, dict) else None
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot in game state")
        return {"state_text": formatter(state), "screenshot_base64": screenshot}
