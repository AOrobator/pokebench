import pytest
from fastapi import FastAPI

from pokebench_env.human import HumanController, install_human


def test_frame_applied_inputs_idle_order_and_watchdog():
    now = [0.0]

    def clock():
        return now[0]

    human = HumanController(clock=clock)
    human.claim("session-one")
    human.input("session-one", 1, ["UP", "A"])
    assert human.frame() == ["UP", "A"]
    human.input("session-one", 2, [])
    assert human.frame() == []
    data = human.snapshot(0)
    assert data["frame"] == 2
    assert data["segments"][0]["buttons"] == ["UP", "A"]
    human.input("session-one", 3, ["R"])
    assert human.frame() == ["R"]
    now[0] = 1.0
    assert human.frame() == []
    with pytest.raises(ValueError):
        human.input("session-one", 4, ["A"])
    human.claim("session-two")
    assert human.frame() == []


def test_session_sequence_pause_validation_and_journal_bounds():
    human = HumanController(max_segments=2)
    human.claim("session-one")
    with pytest.raises(ValueError):
        human.claim("session-two")
    human.input("session-one", 1, ["L"])
    with pytest.raises(ValueError):
        human.input("session-one", 1, ["A"])
    with pytest.raises(ValueError):
        human.input("session-one", 2, ["INVALID"])
    human.set_paused(True)
    with pytest.raises(ValueError):
        human.input("session-one", 2, ["A"])
    human.set_paused(False)
    human.claim("session-two")
    human.input("session-two", 1, ["A"])
    human.frame()
    human.snapshot(0)
    human.frame()
    human.snapshot(0)
    human.frame()
    with pytest.raises(ValueError, match="journal"):
        human.snapshot(0)


def request(api, path, body=None, *, token="secret", method="POST", query=b""):
    import asyncio
    import json

    messages = []

    async def receive():
        return {"type": "http.request", "body": json.dumps(body).encode(), "more_body": False}

    async def send(message):
        messages.append(message)

    asyncio.run(
        api(
            {
                "type": "http",
                "http_version": "1.1",
                "method": method,
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": query,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"x-human-token", token.encode()),
                ],
                "server": ("127.0.0.1", 8040),
                "client": ("127.0.0.1", 1234),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    return messages[0]["status"], json.loads(b"".join(m.get("body", b"") for m in messages[1:]))


def test_owned_routes_credentials_validation_journal_and_atomic_observation():
    import types

    api = FastAPI()
    applied = []
    server = types.SimpleNamespace(step_environment=lambda buttons: applied.append(buttons), fps=80)
    human = install_human(
        api, server, "secret", pace=False, observe=lambda: {"coherent_frame": human.frames}
    )
    assert server.fps == 10**9
    assert (
        request(api, "/pokebench/human/claim", {"session": "session-one"}, token="wrong")[0] == 403
    )
    assert request(api, "/pokebench/human/claim", {"session": "bad"})[0] == 422
    assert request(api, "/pokebench/human/claim", {"session": "session-one"}) == (
        200,
        {"accepted": True},
    )
    assert request(api, "/pokebench/human/claim", {"session": "session-two"})[0] == 409
    assert (
        request(
            api,
            "/pokebench/human/input",
            {"session": "session-one", "seq": 1, "buttons": ["A", "RIGHT"]},
        )[0]
        == 200
    )
    server.step_environment(["LEFT"])
    assert applied == [["A", "RIGHT"]]
    status, snapshot = request(api, "/pokebench/human/snapshot", method="GET", query=b"after=0")
    assert status == 200 and snapshot["frame"] == snapshot["observation"]["coherent_frame"] == 1
    assert (
        request(api, "/pokebench/human/input", {"session": "session-one", "seq": 1, "buttons": []})[
            0
        ]
        == 409
    )
    assert (
        request(
            api, "/pokebench/human/input", {"session": "session-one", "seq": 2, "buttons": ["NO"]}
        )[0]
        == 409
    )
    assert request(api, "/pokebench/human/snapshot", method="GET", query=b"after=999")[0] == 503
    assert (
        request(
            api,
            "/pokebench/human/input",
            {"session": "session-one", "seq": 2, "buttons": [], "release": True},
        )[0]
        == 200
    )
    assert request(api, "/pokebench/human/claim", {"session": "session-two"})[0] == 200
    assert (
        request(
            api, "/pokebench/human/input", {"session": "session-one", "seq": 3, "buttons": ["A"]}
        )[0]
        == 409
    )
    human.set_paused(True)
    assert request(api, "/pokebench/human/claim", {"session": "session-three"})[0] == 409


def test_ordered_taps_acknowledgement_and_release_retirement():
    human = HumanController()
    human.claim("session-one")
    human.input("session-one", 1, ["A"])
    human.input("session-one", 2, [])
    human.input("session-one", 3, ["B"])
    assert [human.frame(), human.frame(), human.frame()] == [["A"], [], ["B"]]
    first = human.snapshot(0)
    assert [s["buttons"] for s in first["segments"]] == [["A"], [], ["B"]]
    assert human.snapshot(first["last_id"])["segments"] == []
    with pytest.raises(ValueError, match="release"):
        human.input("session-one", 4, ["B"], release=True)
    human.input("session-one", 4, [], release=True)
    with pytest.raises(ValueError):
        human.claim("session-one")
    human.claim("session-two")
    assert human.frame() == []
    assert human.snapshot(first["last_id"])["segments"][0]["session"] == "idle"


def test_bounded_queue_disables_old_inputs_and_step_failure_does_not_count():
    human = HumanController()
    human.claim("session-one")
    for n in range(1, 65):
        human.input("session-one", n, ["A"] if n % 2 else [])
    with pytest.raises(ValueError, match="queue full"):
        human.input("session-one", 65, ["A"])
    assert human.frame() == []

    def failed(_):
        raise RuntimeError("emulator failed")

    before = human.frames
    with pytest.raises(RuntimeError):
        human.frame(failed)
    assert human.frames == before


def test_human_frame_pacing_stays_one_x_in_dialogue(monkeypatch):
    import types

    import pokebench_env.human as module

    now = [0.0]
    sleeps = []

    def sleep(seconds):
        sleeps.append(seconds)
        now[0] += seconds

    monkeypatch.setattr(module.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(module.time, "sleep", sleep)
    server = types.SimpleNamespace(step_environment=lambda _: None, fps=80)
    human = install_human(FastAPI(), server, "secret")
    for _ in range(5):
        server.step_environment(["A"])
    assert human.frames == 5
    assert sleeps == pytest.approx([0, 1 / 59.7275, 1 / 59.7275, 1 / 59.7275, 1 / 59.7275])


def test_pause_releases_human_input_before_park_and_resumes_with_fresh_session():
    import time
    import types

    from test_pause import FrameLoop, post

    from pokebench_env.pause import install_pause

    api = FastAPI()
    server = types.SimpleNamespace(step_environment=lambda _: None, fps=80)
    human = install_human(api, server, "secret", pace=False)
    install_pause(api, server, input_pause=human.set_paused)
    human.claim("session-one")
    human.input("session-one", 1, ["A"])
    with FrameLoop(server) as loop:
        time.sleep(0.01)
        assert post(api, "/pokebench/pause", b'{"paused":true}')[0] == 200
        frames = human.frames
        time.sleep(0.01)
        assert human.frames == frames
        assert human.buttons == []
        assert post(api, "/pokebench/pause", b'{"paused":false}')[0] == 200
        human.claim("session-two")
        loop.stop.set()
        post(api, "/pokebench/pause", b'{"paused":false}')
        loop.thread.join(2)
