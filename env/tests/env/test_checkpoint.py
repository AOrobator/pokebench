"""Agent-run checkpoints: the game server hands back a native save state on request."""

from fastapi import FastAPI


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
