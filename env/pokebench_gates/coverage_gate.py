"""Per-metric coverage gate over a coverage.py JSON report.

coverage.py's `fail_under` checks one aggregate number, which lets low branch
coverage hide behind high line coverage and does not measure functions at all.
This gate enforces lines, branches, and functions independently.
"""

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path


class CoverageReportError(ValueError):
    pass


@dataclass(frozen=True)
class CoverageResult:
    lines: float
    branches: float
    functions: float
    failures: list[str] = field(default_factory=list)


def _int(summary: Mapping[str, object], key: str) -> int:
    value = summary.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise CoverageReportError(f"summary field {key!r} must be an integer, got {value!r}")
    return value


def _mapping(value: object, where: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise CoverageReportError(f"{where} must be an object")
    return value


def _percent(covered: int, total: int) -> float:
    return 100.0 if total == 0 else 100.0 * covered / total


def evaluate(report: Mapping[str, object], minimum: float) -> CoverageResult:
    files = _mapping(report.get("files"), "files")
    statements = covered_lines = branches = covered_branches = 0
    functions = covered_functions = 0
    for name, raw_entry in files.items():
        entry = _mapping(raw_entry, f"files[{name!r}]")
        summary = _mapping(entry.get("summary"), f"files[{name!r}].summary")
        statements += _int(summary, "num_statements")
        covered_lines += _int(summary, "covered_lines")
        branches += _int(summary, "num_branches")
        covered_branches += _int(summary, "covered_branches")
        for function_name, raw_function in _mapping(
            entry.get("functions"), f"files[{name!r}].functions"
        ).items():
            if function_name == "":
                continue
            function = _mapping(raw_function, f"function {function_name!r}")
            function_summary = _mapping(function.get("summary"), f"function {function_name!r}")
            functions += 1
            if _int(function_summary, "covered_lines") > 0:
                covered_functions += 1

    metrics = {
        "lines": _percent(covered_lines, statements),
        "branches": _percent(covered_branches, branches),
        "functions": _percent(covered_functions, functions),
    }
    failures = [
        f"{metric} {value:.2f}% < {minimum:.2f}%"
        for metric, value in metrics.items()
        if value < minimum
    ]
    return CoverageResult(failures=failures, **metrics)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--min", type=float, default=90.0, dest="minimum")
    args = parser.parse_args(argv)
    try:
        report = _mapping(json.loads(args.report.read_text(encoding="utf-8")), "report")
        result = evaluate(report, args.minimum)
    except (OSError, ValueError) as exc:
        print(f"coverage report {args.report} is unusable: {exc}", file=sys.stderr)
        return 2
    print(
        f"lines {result.lines:.2f}%  branches {result.branches:.2f}%  "
        f"functions {result.functions:.2f}%  (floor {args.minimum:.2f}%)"
    )
    if result.failures:
        for failure in result.failures:
            print(f"coverage gate failed: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
