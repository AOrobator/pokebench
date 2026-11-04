"""Agent-run checkpoints: the game server hands back a native save state on request."""

import asyncio

from fastapi import FastAPI


def post(app: FastAPI, path: str, body: bytes) -> tuple[int, bytes]:
    messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    asyncio.run(
        app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": b"",
                "headers": [(b"content-type", b"application/json")],
                "server": ("127.0.0.1", 8000),
                "client": ("127.0.0.1", 1234),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    status = messages[0]["status"]
    assert isinstance(status, int)
    chunks = [m.get("body", b"") for m in messages[1:]]
    return status, b"".join(chunk for chunk in chunks if isinstance(chunk, bytes))


def test_serve_installs_the_route_before_the_vendor_starts() -> None:
    import types

    from pokebench_env.serve import run

    app = FastAPI()
    seen: list[bool] = []

    def vendor_main() -> None:
        seen.append("/pokebench/checkpoint" in [getattr(r, "path", "") for r in app.routes])

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=vendor_main,
        agent_checkpoint=(app, lambda: b"x"),
    )
    assert seen == [True]
