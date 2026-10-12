"""Run the vendor game server's own `main()`, bound to 127.0.0.1.

The vendor `server.app.main()` hardcodes `uvicorn.run(host="0.0.0.0")`, which
would expose emulator control (save/load state, actions) on the LAN. Wrapping
`uvicorn.run` keeps the vendor code unmodified. Must run with the vendor
checkout as the working directory and on `sys.path`.
"""

import sys
from collections.abc import Callable, Sequence
from typing import Protocol, cast

from fastapi import FastAPI

from pokebench_env.audio import EmulatorLike
from pokebench_env.view import install_spectator

LOCALHOST = "127.0.0.1"


class UvicornLike(Protocol):
    run: Callable[..., object]


def pin_localhost(uvicorn: UvicornLike) -> None:
    real_run = uvicorn.run

    def run_on_localhost(*args: object, **kwargs: object) -> object:
        kwargs["host"] = LOCALHOST
        return real_run(*args, **kwargs)

    uvicorn.run = run_on_localhost


def run(
    argv: Sequence[str],
    uvicorn: UvicornLike,
    vendor_main: Callable[[], None],
    *,
    spectator: tuple[FastAPI, type[EmulatorLike]] | None = None,
) -> None:
    if spectator is not None:
        install_spectator(*spectator)
    pin_localhost(uvicorn)
    sys.argv = ["server.app", *argv]
    vendor_main()


def main() -> None:  # pragma: no cover - entrypoint, exercised by `just smoke`
    import uvicorn
    from pokemon_env.emulator import EmeraldEmulator
    from server import app  # vendor module, importable from the vendor cwd

    run(
        sys.argv[1:],
        uvicorn=cast(UvicornLike, uvicorn),
        vendor_main=app.main,
        spectator=(app.app, cast(type[EmulatorLike], EmeraldEmulator)),
    )


if __name__ == "__main__":  # pragma: no cover
    main()
