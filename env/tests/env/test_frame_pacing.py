import ast
import threading
from pathlib import Path

import pytest

from pokebench_env.frame_pacing import TimeProxy, install_deadline_pacing
from pokebench_env.launcher import VENDOR_DIR


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def time(self) -> float:
        return 1_700_000_000.0 + self.now

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds

    def work(self, seconds: float) -> None:
        self.now += seconds


def test_pacing_subtracts_frame_work_from_absolute_deadline() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock)

    with proxy.game_loop():
        clock.work(0.004)
        proxy.sleep(1 / 80)
        clock.work(0.003)
        proxy.sleep(1 / 80)

    assert clock.sleeps == pytest.approx([0.0085, 0.0095])
    assert clock.now == pytest.approx(100.025)


def test_large_overrun_resets_deadline_and_bounds_catchup() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock, max_lateness_periods=4)

    with proxy.game_loop():
        clock.work(0.1)
        proxy.sleep(1 / 80)
        clock.work(0.001)
        proxy.sleep(1 / 80)

    assert clock.sleeps == pytest.approx([0.0125, 0.0115])


def test_dynamic_period_change_starts_a_fresh_safe_cadence() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock)

    with proxy.game_loop():
        clock.work(0.0025)
        proxy.sleep(1 / 80)
        clock.work(0.001)
        proxy.sleep(1 / 160)

    assert clock.sleeps == pytest.approx([0.01, 0.00625])


def test_unrelated_sleeps_and_clock_calls_delegate_outside_game_loop() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock)

    assert proxy.time() == clock.time()
    assert proxy.monotonic() == clock.monotonic()
    proxy.sleep(1.0)
    proxy.sleep(5.0)

    assert clock.sleeps == [1.0, 5.0]


def test_game_loop_context_is_thread_local() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock)

    with proxy.game_loop():
        worker = threading.Thread(target=lambda: proxy.sleep(1.0))
        worker.start()
        worker.join()

    assert clock.sleeps == [1.0]


@pytest.mark.parametrize("period", [0.0, -0.1, float("inf"), float("nan")])
def test_game_loop_rejects_invalid_cadence(period: float) -> None:
    proxy = TimeProxy(FakeClock())
    with proxy.game_loop(), pytest.raises(ValueError, match="finite and positive"):
        proxy.sleep(period)


def test_pacing_context_rejects_nesting_and_cleans_up_after_errors() -> None:
    clock = FakeClock()
    proxy = TimeProxy(clock)

    with proxy.game_loop(), pytest.raises(RuntimeError, match="cannot be nested"):
        with proxy.game_loop():
            pass
    with pytest.raises(LookupError):
        with proxy.game_loop():
            raise LookupError("frame failed")
    proxy.sleep(1.0)

    assert clock.sleeps == [1.0]


def test_lateness_bound_must_be_positive() -> None:
    with pytest.raises(ValueError, match="must be positive"):
        TimeProxy(FakeClock(), max_lateness_periods=0)


def test_install_wraps_only_explicit_game_loop_context() -> None:
    clock = FakeClock()

    class Server:
        time = clock

        @staticmethod
        def game_loop() -> str:
            clock.work(0.0025)
            server.time.sleep(1 / 80)
            return "done"

    server = Server()
    install_deadline_pacing(server)

    assert server.game_loop() == "done"
    server.time.sleep(1.0)
    assert clock.sleeps == pytest.approx([0.01, 1.0])


def test_pinned_vendor_game_loop_has_the_single_expected_cadence_seam() -> None:
    source_path = Path(VENDOR_DIR) / "server" / "app.py"
    module = ast.parse(source_path.read_text())
    game_loop = next(
        node
        for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "game_loop"
    )
    sleeps = [
        node
        for node in ast.walk(game_loop)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "time"
        and node.func.attr == "sleep"
    ]

    assert len(sleeps) == 1
    assert ast.dump(sleeps[0].args[0], include_attributes=False) == (
        "BinOp(left=Constant(value=1.0), op=Div(), right=Name(id='current_fps', ctx=Load()))"
    )

    constant_sleeps = sorted(
        call.args[0].value
        for call in ast.walk(module)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and isinstance(call.func.value, ast.Name)
        and call.func.value.id == "time"
        and call.func.attr == "sleep"
        and len(call.args) == 1
        and isinstance(call.args[0], ast.Constant)
        and isinstance(call.args[0].value, float)
    )
    assert constant_sleeps == [1.0, 5.0]
