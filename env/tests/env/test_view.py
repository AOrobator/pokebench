import asyncio
from types import SimpleNamespace

from fastapi import FastAPI
from test_audio import Emulator, pcm

from pokebench_env.serve import run


def get(app, path, query=b""):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(
        app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": query,
                "headers": [],
                "server": ("127.0.0.1", 8000),
                "client": ("127.0.0.1", 1234),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    return (
        messages[0]["status"],
        dict(messages[0]["headers"]),
        b"".join(m.get("body", b"") for m in messages[1:]),
    )


def test_production_serve_registers_view_pcm_and_browser_module_before_vendor_main(tmp_path):
    import inspect

    assert "spectator" in inspect.signature(run).parameters, "spectator wiring missing"
    app = FastAPI()

    class LocalEmulator(Emulator):
        pass

    emu = LocalEmulator()
    calls = []
    uvicorn = SimpleNamespace(run=lambda *args, **kwargs: calls.append(kwargs))

    def main():
        assert emu.initialize() == "initialized"
        emu.core.run_frame()
        uvicorn.run(app, host="0.0.0.0", port=8129)

    run([], uvicorn, main, spectator=(app, LocalEmulator))
    assert calls == [{"host": "127.0.0.1", "port": 8129}]
    status, headers, wav = get(app, "/audio.wav", b"since=0&max_frames=2")
    assert status == 200
    assert wav[44:] == pcm(123)[:2] + (-456).to_bytes(2, "little", signed=True)
    assert headers[b"content-type"] == b"audio/wav"
    assert headers[b"cache-control"] == b"no-store"
    assert headers[b"x-audio-next"] == b"1"
    assert headers[b"x-audio-epoch"] == b"1"
    assert headers[b"x-audio-skipped"] == b"0"
    assert get(app, "/audio.wav", b"since=abc")[0] == 422
    assert get(app, "/audio.wav", b"since=-2")[0] == 422
    assert get(app, "/audio.wav", b"max_frames=0")[0] == 422
    assert get(app, "/audio.wav", b"max_frames=12001")[0] == 422
    assert emu.core.frames == 1
    emu.load_state("state")
    assert get(app, "/audio.wav")[2][44:] == b""
    status, headers, html = get(app, "/view")
    assert status == 200
    assert b"Unmute audio" in html and b'src="/stream"' in html
    assert b"AudioFollower" in html and b"/spectator.js" in html
    assert b"createBuffer" in html and b"playbackRate" in html
    assert b"visibilitychange" in html and b"pagehide" in html
    status, headers, module = get(app, "/spectator.js")
    # A build is a prerequisite of serving; a missing build must fail explicitly.
    assert status in (200, 503)
    if status == 200:
        assert b"export class AudioFollower" in module
    else:
        assert b"just build" in module
