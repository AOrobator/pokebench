import asyncio
from types import SimpleNamespace

from fastapi import FastAPI
from test_audio import Emulator, pcm


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


def test_production_main_registers_view_pcm_and_browser_module_before_vendor_main(
    monkeypatch, tmp_path
):
    import sys
    from pathlib import Path

    from pokebench_env import view
    from pokebench_env.serve import main

    repo = Path(__file__).resolve().parents[3]
    assert view.BROWSER_MODULE.relative_to(repo) == Path("packages/agent/dist/spectator.js")
    module_path = tmp_path / "spectator.js"
    module_path.write_text("export class AudioFollower {}")
    monkeypatch.setattr(view, "BROWSER_MODULE", module_path)
    monkeypatch.setattr(sys, "argv", ["server.app"])
    app = FastAPI()

    class LocalEmulator(Emulator):
        def get_screenshot(self):
            from PIL import Image

            assert memory_lock.locked(), "native frame escaped snapshot lock"
            return Image.new("RGB", (240, 160), (22, 33, 44))

    emu = LocalEmulator()
    import struct
    import threading

    memory_lock = threading.Lock()
    memory_reads = []
    raw = {0x030022C0 + i: b for i, b in enumerate(struct.pack("<II", 0, 0x080E4F59))}

    class ByteView:
        def __getitem__(self, span):
            assert memory_lock.locked(), "production state read escaped the frame lock"
            memory_reads.append((span.start, span.stop))
            return [raw.get(i, 0) for i in range(span.start, span.stop)]

    calls = []
    uvicorn = SimpleNamespace(run=lambda *args, **kwargs: calls.append(kwargs))

    def vendor_main():
        assert emu.initialize() == "initialized"
        emu.core.memory = SimpleNamespace(u8=ByteView())
        emu.core.run_frame()
        uvicorn.run(app, host="0.0.0.0", port=8129)

    monkeypatch.setitem(sys.modules, "uvicorn", uvicorn)
    monkeypatch.setitem(
        sys.modules, "pokemon_env.emulator", SimpleNamespace(EmeraldEmulator=LocalEmulator)
    )

    async def get_screenshot():
        raise AssertionError("not called at startup")

    monkeypatch.setitem(
        sys.modules,
        "server",
        SimpleNamespace(
            app=SimpleNamespace(
                app=app,
                main=vendor_main,
                get_screenshot=get_screenshot,
                env=emu,
                memory_lock=memory_lock,
            )
        ),
    )
    main()
    assert "/pokebench/observation" in [getattr(r, "path", "") for r in app.routes]
    import json

    state_status, _, state_body = get(app, "/pokebench/state")
    assert state_status == 200
    assert json.loads(state_body)["screen"] == "naming"
    assert memory_reads == [
        (0x030022C0, 0x030022C8),
        (0x030026F9, 0x030026FA),
        (0x0203CD92, 0x0203CD96),
        (0x02039F94, 0x02039F98),
    ]
    assert calls == [{"host": "127.0.0.1", "port": 8129}]
    observation_status, _, observation_body = get(app, "/pokebench/observation")
    assert observation_status == 200
    import base64
    from io import BytesIO

    from PIL import Image

    payload = json.loads(observation_body)
    assert payload["state"]["screen"] == "naming"
    image = Image.open(BytesIO(base64.b64decode(payload["screenshot_base64"])))
    assert image.size == (240, 160) and image.getpixel((0, 0)) == (22, 33, 44)
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
    assert status == 200
    assert headers[b"content-type"].startswith(b"text/javascript")
    assert module == b"export class AudioFollower {}"


def test_missing_browser_build_is_explicitly_unavailable(monkeypatch, tmp_path):
    from pokebench_env import view

    monkeypatch.setattr(view, "BROWSER_MODULE", tmp_path / "missing.js")
    app = FastAPI()

    class LocalEmulator(Emulator):
        pass

    view.install_spectator(app, LocalEmulator)
    status, headers, module = get(app, "/spectator.js")
    assert status == 503
    assert b"just build" in module
