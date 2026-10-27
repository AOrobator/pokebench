#!/usr/bin/env python3
"""Size and read PokeBench A/B cohorts with exact small-sample statistics.

Standard library only. power_test.py cross-checks it against scipy.

  power.py plan --control 0.5 --lifts 0.15,0.25 --cap-min 15 --executors 2 --budget-gpu-hours 48
  power.py observed 3/8 5/8
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass
from functools import cache

Z_95 = 1.959963984540054
RELATIVE_TIE = 1 + 1e-7  # scipy's tolerance for "as or more extreme" two-sided tables


def log_choose(n: int, k: int) -> float:
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def fisher_two_sided(control_hits: int, control_runs: int, variant_hits: int, variant_runs: int) -> float:
    total_hits = control_hits + variant_hits
    total_runs = control_runs + variant_runs
    low = max(0, total_hits - control_runs)
    high = min(variant_runs, total_hits)
    denominator = log_choose(total_runs, total_hits)

    def pmf(variant: int) -> float:
        return math.exp(log_choose(variant_runs, variant) + log_choose(control_runs, total_hits - variant) - denominator)

    observed = pmf(variant_hits) * RELATIVE_TIE
    return min(1.0, sum(p for p in (pmf(x) for x in range(low, high + 1)) if p <= observed))


def binomial_pmf(runs: int, rate: float) -> list[float]:
    if rate <= 0 or rate >= 1:
        hit = runs if rate >= 1 else 0
        return [1.0 if k == hit else 0.0 for k in range(runs + 1)]
    return [math.exp(log_choose(runs, k) + k * math.log(rate) + (runs - k) * math.log1p(-rate)) for k in range(runs + 1)]


@cache
def favourable_rejections(runs_per_arm: int, alpha: float) -> tuple[tuple[int, int], ...]:
    """(control hits, variant hits) tables a two-sided Fisher test at alpha rejects with the variant ahead.

    Tables sharing a hit total share one hypergeometric, so each total is scored once.
    """
    rejected = []
    total_runs = 2 * runs_per_arm
    for total_hits in range(total_runs + 1):
        low, high = max(0, total_hits - runs_per_arm), min(runs_per_arm, total_hits)
        denominator = log_choose(total_runs, total_hits)
        pmf = {x: math.exp(log_choose(runs_per_arm, x) + log_choose(runs_per_arm, total_hits - x) - denominator) for x in range(low, high + 1)}
        ascending = sorted(pmf.values())
        for variant_hits in range(low, high + 1):
            control_hits = total_hits - variant_hits
            if variant_hits <= control_hits:
                continue
            threshold = pmf[variant_hits] * RELATIVE_TIE
            if min(1.0, sum(p for p in ascending if p <= threshold)) <= alpha:
                rejected.append((control_hits, variant_hits))
    return tuple(rejected)


def exact_power(runs_per_arm: int, control_rate: float, variant_rate: float, alpha: float) -> float:
    """Chance a two-sided Fisher test at alpha comes out significant in the variant's favour."""
    control = binomial_pmf(runs_per_arm, control_rate)
    variant = binomial_pmf(runs_per_arm, variant_rate)
    return sum(control[a] * variant[b] for a, b in favourable_rejections(runs_per_arm, alpha))


STABLE_WINDOW = 10


def runs_for_power(control_rate: float, variant_rate: float, alpha: float, target: float, ceiling: int = 400) -> int | None:
    """Smallest runs per arm whose exact power reaches target (the first crossing; a linear scan)."""
    return next((runs for runs in range(2, ceiling + 1) if exact_power(runs, control_rate, variant_rate, alpha) >= target), None)


def stable_runs_for_power(control_rate: float, variant_rate: float, alpha: float, target: float, ceiling: int = 400) -> int | None:
    """Smallest N whose power stays at or above target for N..N+STABLE_WINDOW-1.

    Exact power saw-tooths, so a lucky first crossing can dip below target at N+1. Size plans on this.
    """
    streak = 0
    for runs in range(2, ceiling + STABLE_WINDOW):
        streak = streak + 1 if exact_power(runs, control_rate, variant_rate, alpha) >= target else 0
        if streak == STABLE_WINDOW:
            start = runs - STABLE_WINDOW + 1
            return start if start <= ceiling else None
    return None


def wilson(hits: int, runs: int) -> tuple[float, float]:
    rate = hits / runs
    centre = (rate + Z_95**2 / (2 * runs)) / (1 + Z_95**2 / runs)
    half = Z_95 * math.sqrt(rate * (1 - rate) / runs + Z_95**2 / (4 * runs**2)) / (1 + Z_95**2 / runs)
    return centre - half, centre + half


def newcombe_difference(control_hits: int, control_runs: int, variant_hits: int, variant_runs: int) -> tuple[float, float]:
    """95% Newcombe hybrid score interval for variant rate minus control rate."""
    control_rate, variant_rate = control_hits / control_runs, variant_hits / variant_runs
    control_low, control_high = wilson(control_hits, control_runs)
    variant_low, variant_high = wilson(variant_hits, variant_runs)
    difference = variant_rate - control_rate
    low = difference - math.sqrt((variant_rate - variant_low) ** 2 + (control_high - control_rate) ** 2)
    high = difference + math.sqrt((variant_high - variant_rate) ** 2 + (control_rate - control_low) ** 2)
    return low, high


@dataclass(frozen=True)
class LiftPlan:
    lift: float
    runs_per_arm_for_half: int | None
    first_crossing_for_target: int | None
    runs_per_arm_for_target: int | None
    gpu_hours_for_target: float | None
    wall_hours_for_target: float | None
    power_at_budget: float | None


def gpu_hours(runs_per_arm: int, cap_minutes: float, failure_rate: float) -> float:
    """Upper bound on trial time: every launched trial runs to the cap. Boot and save-load overhead are not counted."""
    launched = 2 * runs_per_arm / (1 - failure_rate)
    return launched * cap_minutes / 60


def runs_within_budget(budget_gpu_hours: float, cap_minutes: float, failure_rate: float) -> int:
    return int(budget_gpu_hours * 60 / cap_minutes * (1 - failure_rate) // 2)


def plan(args: argparse.Namespace) -> tuple[int | None, list[LiftPlan]]:
    budget_runs = runs_within_budget(args.budget_gpu_hours, args.cap_min, args.failure_rate) if args.budget_gpu_hours is not None else None
    rows = []
    for lift in args.lifts:
        variant = args.control + lift
        if not 0 < variant <= 1:
            raise SystemExit(f"control {args.control} + lift {lift} is not a rate in (0, 1]")
        target_runs = stable_runs_for_power(args.control, variant, args.alpha, args.power)
        hours = gpu_hours(target_runs, args.cap_min, args.failure_rate) if target_runs else None
        rows.append(LiftPlan(
            lift=lift,
            runs_per_arm_for_half=stable_runs_for_power(args.control, variant, args.alpha, 0.5),
            first_crossing_for_target=runs_for_power(args.control, variant, args.alpha, args.power),
            runs_per_arm_for_target=target_runs,
            gpu_hours_for_target=hours,
            wall_hours_for_target=hours / args.executors if hours else None,
            power_at_budget=None if budget_runs is None else (exact_power(budget_runs, args.control, variant, args.alpha) if budget_runs >= 1 else 0.0),
        ))
    return budget_runs, rows


def power_curve_svg(args: argparse.Namespace, max_runs: int) -> str:
    """Linear axes: x is GPU-hours, y is exact power, one line per lift."""
    width, height, left, bottom, top, right = 640, 300, 48, 40, 16, 120
    max_hours = gpu_hours(max_runs, args.cap_min, args.failure_rate)
    sizes = sorted({max(4, round(max_runs * step / 40)) for step in range(1, 41)})

    def x(hours: float) -> float:
        return left + (width - left - right) * hours / max_hours

    def y(power: float) -> float:
        return top + (height - top - bottom) * (1 - power)

    parts = [f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="Exact power against GPU-hours">']
    for tick in (0, 0.2, 0.4, 0.6, 0.8, 1.0):
        parts.append(f'<line class="grid" x1="{left}" x2="{width - right}" y1="{y(tick):.1f}" y2="{y(tick):.1f}"/>')
        parts.append(f'<text class="small" x="{left - 6}" y="{y(tick) + 4:.1f}" text-anchor="end">{int(tick * 100)}%</text>')
    for index in range(5):
        hours = max_hours * index / 4
        parts.append(f'<text class="small" x="{x(hours):.1f}" y="{height - bottom + 16}" text-anchor="middle">{hours:.0f}</text>')
    parts.append(f'<text class="small" x="{(left + width - right) / 2:.0f}" y="{height - 6}" text-anchor="middle">GPU-hours (cap {args.cap_min:g} min, both arms)</text>')
    parts.append(f'<line class="target" x1="{left}" x2="{width - right}" y1="{y(args.power):.1f}" y2="{y(args.power):.1f}"/>')
    if args.budget_gpu_hours and args.budget_gpu_hours <= max_hours:
        parts.append(f'<line class="budget" x1="{x(args.budget_gpu_hours):.1f}" x2="{x(args.budget_gpu_hours):.1f}" y1="{top}" y2="{height - bottom}"/>')
        parts.append(f'<text class="small" x="{x(args.budget_gpu_hours) + 4:.1f}" y="{top + 12}">budget</text>')
    for index, lift in enumerate(args.lifts):
        points = " ".join(f"{x(gpu_hours(n, args.cap_min, args.failure_rate)):.1f},{y(exact_power(n, args.control, args.control + lift, args.alpha)):.1f}" for n in sizes)
        parts.append(f'<polyline class="curve c{index % 4}" points="{points}"/>')
        parts.append(f'<text class="small" x="{width - right + 8}" y="{top + 16 + index * 18}"><tspan class="key c{index % 4}">━</tspan> +{lift * 100:.0f} pts</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def rate_pair(text: str) -> tuple[int, int]:
    hits, runs = (int(part) for part in text.split("/"))
    if runs <= 0 or not 0 <= hits <= runs:
        raise argparse.ArgumentTypeError(f"{text} is not hits/runs")
    return hits, runs


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    sizing = commands.add_parser("plan", help="runs per arm, GPU-hours and power at a budget")
    sizing.add_argument("--control", type=float, required=True, help="control rate on the primary milestone, from a recent comparable cohort")
    sizing.add_argument("--lifts", type=lambda text: [float(part) for part in text.split(",")], required=True, help="absolute lifts, e.g. 0.15,0.25")
    sizing.add_argument("--alpha", type=float, default=0.05, help="family alpha; divided by --comparisons")
    sizing.add_argument("--comparisons", type=int, default=1, help="primary comparisons in the Holm family; sizes at alpha/m, the most stringent Holm step")
    sizing.add_argument("--power", type=float, default=0.8)
    sizing.add_argument("--cap-min", type=float, required=True, help="trial cap in minutes")
    sizing.add_argument("--executors", type=int, default=1, help="independent GPUs running trials at once")
    sizing.add_argument("--failure-rate", type=float, default=0.0, help="share of launches that never begin (re-run); every trial that began is an outcome, crashes and gateway errors included")
    sizing.add_argument("--budget-gpu-hours", type=float)
    sizing.add_argument("--svg", help="write a linear-axis power curve to this file")
    sizing.add_argument("--json", action="store_true")

    reading = commands.add_parser("observed", help="Fisher p and Newcombe interval for a finished comparison")
    reading.add_argument("control", type=rate_pair, help="hits/runs")
    reading.add_argument("variant", type=rate_pair, help="hits/runs")

    args = parser.parse_args(argv)
    if args.command == "observed":
        (control_hits, control_runs), (variant_hits, variant_runs) = args.control, args.variant
        low, high = newcombe_difference(control_hits, control_runs, variant_hits, variant_runs)
        difference = variant_hits / variant_runs - control_hits / control_runs
        p_value = fisher_two_sided(control_hits, control_runs, variant_hits, variant_runs)
        print(f"difference {difference * 100:+.1f} pts, 95% Newcombe interval {low * 100:+.1f} to {high * 100:+.1f}, two-sided Fisher p = {p_value:.3f}")
        return 0

    if not 0 <= args.failure_rate < 1:
        raise SystemExit("--failure-rate must be in [0, 1)")
    if args.comparisons < 1:
        raise SystemExit("--comparisons must be at least 1")
    args.family_alpha, args.alpha = args.alpha, args.alpha / args.comparisons
    budget_runs, rows = plan(args)
    if args.svg:
        largest = max(row.runs_per_arm_for_target or 0 for row in rows)
        with open(args.svg, "w", encoding="utf-8") as handle:
            handle.write(power_curve_svg(args, max(largest, budget_runs or 0, 16)))
    if args.json:
        print(json.dumps({
            "control": args.control, "familyAlpha": args.family_alpha, "comparisons": args.comparisons, "alpha": args.alpha, "power": args.power, "capMinutes": args.cap_min,
            "executors": args.executors, "failureRate": args.failure_rate, "budgetGpuHours": args.budget_gpu_hours,
            "runsPerArmWithinBudget": budget_runs, "lifts": [asdict(row) for row in rows],
        }, indent=1))
        return 0

    def show(value: float | None, form: str) -> str:
        return "none<=400" if value is None else format(value, form)

    print(f"control {args.control:.0%}, alpha {args.family_alpha} over {args.comparisons} comparison(s) = {args.alpha:.4g} per test, target power {args.power:.0%}, cap {args.cap_min:g} min, "
          f"{args.executors} executor(s), {args.failure_rate:.0%} of launches re-run because they never began")
    if budget_runs is not None:
        print(f"budget {args.budget_gpu_hours:g} GPU-h buys {budget_runs} runs per arm (expected; outages can push spend over)")
    print(f"n/arm = smallest N whose power stays at target for {STABLE_WINDOW} consecutive N; first = first crossing. GPU-h is an upper bound (every trial runs to the cap; no boot or load overhead).")
    print("lift     | n/arm 50% | first | n/arm target | GPU-h | wall h | power at budget")
    for row in rows:
        print(f"+{row.lift * 100:5.1f}   | {show(row.runs_per_arm_for_half, 'd'):>9} | {show(row.first_crossing_for_target, 'd'):>5} | {show(row.runs_per_arm_for_target, 'd'):>12} | "
              f"{show(row.gpu_hours_for_target, '.0f'):>5} | {show(row.wall_hours_for_target, '.0f'):>6} | "
              f"{'-' if row.power_at_budget is None else format(row.power_at_budget, '.0%')}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
