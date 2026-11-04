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


def test_zero_frame_pause_boundary_cannot_extend_next_hold_across_pause(monkeypatch):
    from pokebench_env import human as module

    wall = [1.0]
    monkeypatch.setattr(module.time, "time", lambda: wall[0])
    controller = HumanController(clock=lambda: 0.0)
    controller.frame()
    before = controller.snapshot(0)
    assert before["segments"][0]["start_ms"] == 1000
    wall[0] = 2.0
    controller.set_paused(True)
    wall[0] = 32.0
    controller.set_paused(False)
    controller.claim("after-pause")
    controller.input("after-pause", 1, ["A"])
    controller.frame()
    wall[0] = 32.02
    after = controller.snapshot(1)
    assert after["segments"] == [
        {
            "id": 2,
            "start_frame": 1,
            "end_frame": 2,
            "buttons": ["A"],
            "start_ms": 32000,
            "end_ms": 32020,
            "request_seq": 1,
            "session": "after-pause",
        }
    ]
