"""Fake-clock frame publication: cadence, bounded phase borrowing, and no catch-up."""

import math
import threading
from types import SimpleNamespace

import pytest

from pokebench_env import serve


class Clock:
    def __init__(self):
        self.now = 0.0
        self.calls = 0

    def __call__(self):
        self.calls += 1
        return self.now


class Manager:
    def __init__(self):
        self.lock = threading.Lock()
        self.active_connections = [object()]
        self.publications = []
        self._latest_frame = None

    @property
    def latest_frame(self):
        return self._latest_frame

    @latest_frame.setter
    def latest_frame(self, value):
        self._latest_frame = value
        if value is not None:
            self.publications.append(value)


def fixture(monkeypatch, fps=80.0):
    clock = Clock()
    manager = Manager()
    encoded = []
    counts = []
    current = [0]

    def encode(frame):
        encoded.append(frame)
        if frame == "unsupported":
            return None
        if frame == "explode":
            raise RuntimeError("encoder failed")
        return f"encoded-{frame}"

    def frame_count():
        counts.append(current[0])
        return current[0]

    monkeypatch.setattr(serve, "encode_png_base64", encode)
    server = SimpleNamespace(frame_manager=manager, update_frame_cache=lambda _frame: None)
    if fps is None:
        serve.install_on_demand_frame_cache(server, frame_count, clock=clock)
    else:
        serve.install_on_demand_frame_cache(server, frame_count, clock=clock, max_publish_fps=fps)

    def tick(at, frame):
        clock.now = at
        current[0] = frame
        server.update_frame_cache(frame)

    return clock, manager, encoded, counts, tick


def test_publication_factory_default_is_80_without_changing_game_speed(monkeypatch):
    _, manager, encoded, _, tick = fixture(monkeypatch, fps=None)
    for frame in range(80):
        tick(frame / 80, frame)
    assert len(encoded) == 80
    assert [p["frame_count"] for p in manager.publications] == list(range(80))


@pytest.mark.parametrize("phase", [0.0, 1000.0, 1_792_446_000.0])
@pytest.mark.parametrize("pattern", [(1, -1), (1, 0, -1, 0), (1, -1, -1, 1)])
def test_80hz_source_retains_every_frame_with_quarter_period_jitter(monkeypatch, phase, pattern):
    _, manager, encoded, _, tick = fixture(monkeypatch)
    period = 1 / 80
    for frame in range(160):
        # First callback is late; later callbacks can be half a period earlier
        # than that initial phase while still being the next source frame.
        tick(phase + frame * period + pattern[frame % len(pattern)] * period / 4, frame)
    assert len(encoded) == 160
    assert [p["frame_count"] for p in manager.publications] == list(range(160))


@pytest.mark.parametrize("cap", [60.0, 80.0])
def test_320hz_source_keeps_explicit_cap_with_only_constant_boundary_slack(monkeypatch, cap):
    _, manager, encoded, _, tick = fixture(monkeypatch, fps=cap)
    seconds = 10
    for frame in range(320 * seconds):
        tick(frame / 320, frame)
    assert cap * seconds - 1 <= len(encoded) <= cap * seconds + 2
    assert len(encoded) == len(manager.publications)
    assert all(
        a["frame_count"] < b["frame_count"]
        for a, b in zip(manager.publications, manager.publications[1:], strict=False)
    )


def test_half_period_early_boundary_is_inclusive_but_not_more(monkeypatch):
    _, manager, encoded, _, tick = fixture(monkeypatch)
    period = 1 / 80
    tick(0.0, 0)
    tick(period / 2 - 0.000001, 1)
    assert encoded == [0]
    tick(period / 2, 2)
    assert encoded == [0, 2]
    assert manager.latest_frame["timestamp"] == period / 2


def test_early_acceptance_advances_deadline_and_repeated_clock_cannot_encode_again(monkeypatch):
    _, manager, encoded, _, tick = fixture(monkeypatch)
    period = 1 / 80
    tick(0.0, 0)
    tick(period * 0.75, 1)
    for frame in range(2, 20):
        tick(period * 0.75, frame)
    assert encoded == [0, 1]
    assert [p["frame_count"] for p in manager.publications] == [0, 1]


def test_late_pause_rebases_once_without_accumulated_catchup(monkeypatch):
    _, _, encoded, _, tick = fixture(monkeypatch)
    period = 1 / 80
    tick(0.0, 0)
    resumed = period * 100
    tick(resumed, 1)
    for frame in range(2, 22):
        tick(resumed, frame)
    tick(resumed + period * 0.49, 22)
    assert encoded == [0, 1]
    tick(resumed + period, 23)
    assert encoded == [0, 1, 23]


def test_no_consumers_skip_all_image_cpu_and_reconnect_discards_old_phase(monkeypatch):
    clock, manager, encoded, counts, tick = fixture(monkeypatch)
    manager.active_connections.clear()
    manager.latest_frame = {"stale": True}
    manager.publications.clear()
    for frame in range(100):
        tick(0.0, frame)
    assert manager.latest_frame is None
    assert encoded == counts == []
    assert clock.calls == 0
    manager.active_connections.append(object())
    tick(0.0, 100)
    manager.active_connections.clear()
    tick(0.0, 101)
    assert manager.latest_frame is None
    manager.active_connections.append(object())
    tick(0.0, 102)
    assert encoded == counts == [100, 102]
    assert manager.latest_frame["frame_count"] == 102


@pytest.mark.parametrize("failed_frame", ["unsupported", "explode"])
def test_encoder_failure_still_consumes_slot_and_keeps_error_semantics(monkeypatch, failed_frame):
    _, manager, encoded, counts, tick = fixture(monkeypatch)
    if failed_frame == "explode":
        with pytest.raises(RuntimeError, match="encoder failed"):
            tick(0.0, failed_frame)
    else:
        tick(0.0, failed_frame)
    tick(0.0, 1)
    assert encoded == [failed_frame]
    assert counts == []
    assert manager.latest_frame is None
    tick(1 / 80, 2)
    assert encoded == [failed_frame, 2]
    assert counts == [2]


def test_disconnect_during_encode_cannot_retain_unobserved_payload(monkeypatch):
    _, manager, encoded, _, tick = fixture(monkeypatch)

    def disconnect(frame):
        encoded.append(frame)
        manager.active_connections.clear()
        return "encoded"

    monkeypatch.setattr(serve, "encode_png_base64", disconnect)
    tick(0.0, 0)
    assert encoded == [0]
    assert manager.latest_frame is None


@pytest.mark.parametrize("cap", [0.0, -1.0, math.inf, math.nan])
def test_invalid_publication_cap_is_rejected_without_installing(monkeypatch, cap):
    with pytest.raises(ValueError, match="finite and positive"):
        fixture(monkeypatch, fps=cap)
