# /// script
# dependencies = ["scipy", "pytest"]
# ///
"""Cross-check power.py against scipy. Run: uv run --with scipy --with pytest pytest power_test.py"""

import itertools
import math

import pytest
from scipy.stats import binom, fisher_exact

import power


@pytest.mark.parametrize("control_runs,variant_runs", [(8, 8), (5, 9), (16, 16), (1, 3)])
def test_fisher_matches_scipy_on_every_table(control_runs: int, variant_runs: int) -> None:
    for control_hits, variant_hits in itertools.product(range(control_runs + 1), range(variant_runs + 1)):
        expected = fisher_exact([[variant_hits, variant_runs - variant_hits], [control_hits, control_runs - control_hits]])[1]
        assert power.fisher_two_sided(control_hits, control_runs, variant_hits, variant_runs) == pytest.approx(expected, rel=1e-9, abs=1e-12)


def scipy_power(runs: int, control_rate: float, variant_rate: float, alpha: float) -> float:
    total = 0.0
    for control_hits in range(runs + 1):
        for variant_hits in range(control_hits + 1, runs + 1):
            if fisher_exact([[variant_hits, runs - variant_hits], [control_hits, runs - control_hits]])[1] <= alpha:
                total += binom.pmf(control_hits, runs, control_rate) * binom.pmf(variant_hits, runs, variant_rate)
    return total


@pytest.mark.parametrize("runs,control_rate,variant_rate,alpha", [(8, 0.375, 0.625, 0.05), (24, 0.5, 0.75, 0.1), (40, 0.25, 0.5, 0.05), (12, 0.0, 0.5, 0.05)])
def test_power_matches_scipy_enumeration(runs: int, control_rate: float, variant_rate: float, alpha: float) -> None:
    assert power.exact_power(runs, control_rate, variant_rate, alpha) == pytest.approx(scipy_power(runs, control_rate, variant_rate, alpha), abs=1e-9)


def test_power_reproduces_the_recorded_planning_numbers() -> None:
    # 2026-10-15 Hermes sizing used scipy and counted significance in either direction; wrong-direction
    # rejections are negligible at these sizes, so the variant-ahead power must agree.
    assert power.exact_power(8, 0.375, 0.625, 0.05) == pytest.approx(0.095, abs=0.005)
    assert power.exact_power(64, 0.5, 0.75, 0.05) == pytest.approx(0.80, abs=0.01)


def brute_first(control_rate: float, variant_rate: float, alpha: float, target: float, ceiling: int) -> int | None:
    return next((n for n in range(2, ceiling + 1) if scipy_power(n, control_rate, variant_rate, alpha) >= target), None)


@pytest.mark.parametrize("control_rate,variant_rate,alpha,target,ceiling", [
    (0.375, 0.575, 0.05, 0.8, 130),  # a crossing behind a dip: true first crossing is 102, a stepped search said 108
    (0.3, 0.6, 0.05, 0.5, 60),
    (0.5, 0.75, 0.05, 0.8, 90),
    (0.25, 0.5, 0.1, 0.8, 80),
])
def test_runs_for_power_is_the_true_first_crossing(control_rate: float, variant_rate: float, alpha: float, target: float, ceiling: int) -> None:
    assert power.runs_for_power(control_rate, variant_rate, alpha, target, ceiling) == brute_first(control_rate, variant_rate, alpha, target, ceiling)


def test_runs_for_power_checks_up_to_the_ceiling() -> None:
    first = power.runs_for_power(0.2, 0.35, 0.05, 0.9)
    assert first is not None
    assert power.runs_for_power(0.2, 0.35, 0.05, 0.9, ceiling=first) == first
    assert power.runs_for_power(0.2, 0.35, 0.05, 0.9, ceiling=first - 1) is None


def test_stable_runs_stay_above_target() -> None:
    stable = power.stable_runs_for_power(0.375, 0.575, 0.05, 0.8)
    assert stable is not None and stable >= power.runs_for_power(0.375, 0.575, 0.05, 0.8)
    assert all(power.exact_power(n, 0.375, 0.575, 0.05) >= 0.8 for n in range(stable, stable + power.STABLE_WINDOW))
    assert power.exact_power(stable - 1, 0.375, 0.575, 0.05) < 0.8 or stable == 2


def test_newcombe_matches_the_reviewed_interval() -> None:
    low, high = power.newcombe_difference(3, 8, 5, 8)
    assert (round(low, 2), round(high, 2)) == (-0.20, 0.59)


def test_budget_arithmetic() -> None:
    assert power.gpu_hours(64, 15, 0.0) == pytest.approx(32)
    assert power.runs_within_budget(48, 15, 0.0) == 96
    assert power.runs_within_budget(48, 15, 0.2) == math.floor(48 * 4 * 0.8 / 2)
    assert power.runs_within_budget(0.1, 15, 0.0) == 0
