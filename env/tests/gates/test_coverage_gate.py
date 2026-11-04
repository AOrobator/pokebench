import pytest

from pokebench_gates.coverage_gate import CoverageReportError, evaluate


def summary(statements: int, covered: int, branches: int = 0, covered_branches: int = 0) -> dict:
    return {
        "num_statements": statements,
        "covered_lines": covered,
        "num_branches": branches,
        "covered_branches": covered_branches,
    }


def report(files: dict) -> dict:
    return {"files": files}


def file_entry(file_summary: dict, functions: dict) -> dict:
    return {"summary": file_summary, "functions": functions}


def fully_covered_function(statements: int = 10) -> dict:
    return {"summary": summary(statements, statements)}


def test_all_metrics_at_floor_pass() -> None:
    data = report(
        {
            "a.py": file_entry(
                summary(100, 90, 10, 9),
                {
                    **{f"f{i}": fully_covered_function() for i in range(9)},
                    "g": {"summary": summary(10, 0)},
                    "": {"summary": summary(5, 5)},
                },
            )
        }
    )
    result = evaluate(data, minimum=90.0)
    assert result.lines == 90.0
    assert result.branches == 90.0
    assert result.functions == 90.0
    assert result.failures == []


def test_branch_deficit_fails_even_when_aggregate_is_high() -> None:
    data = report(
        {
            "a.py": file_entry(
                summary(100, 100, 2, 1),
                {"f": fully_covered_function()},
            )
        }
    )
    result = evaluate(data, minimum=90.0)
    assert result.lines == 100.0
    assert result.branches == 50.0
    assert result.failures == ["branches 50.00% < 90.00%"]


def test_function_deficit_fails_independently() -> None:
    functions = {f"f{i}": fully_covered_function(1) for i in range(8)}
    functions.update({"dead1": {"summary": summary(1, 0)}, "dead2": {"summary": summary(1, 0)}})
    data = report({"a.py": file_entry(summary(100, 100), functions)})
    result = evaluate(data, minimum=90.0)
    assert result.functions == 80.0
    assert result.failures == ["functions 80.00% < 90.00%"]


def test_line_deficit_fails_independently() -> None:
    data = report({"a.py": file_entry(summary(100, 89), {"f": fully_covered_function()})})
    assert evaluate(data, minimum=90.0).failures == ["lines 89.00% < 90.00%"]


def test_module_level_pseudo_function_is_not_counted() -> None:
    data = report(
        {
            "a.py": file_entry(
                summary(1, 1), {"": {"summary": summary(1, 0)}, "f": fully_covered_function()}
            )
        }
    )
    assert evaluate(data, minimum=90.0).functions == 100.0


def test_metrics_aggregate_across_files() -> None:
    data = report(
        {
            "a.py": file_entry(summary(50, 50, 4, 4), {"f": fully_covered_function()}),
            "b.py": file_entry(summary(50, 40, 6, 4), {"g": {"summary": summary(5, 0)}}),
        }
    )
    result = evaluate(data, minimum=90.0)
    assert result.lines == 90.0
    assert result.branches == 80.0
    assert result.functions == 50.0
    assert result.failures == ["branches 80.00% < 90.00%", "functions 50.00% < 90.00%"]


def test_empty_branch_and_function_denominators_count_as_fully_covered() -> None:
    data = report({"a.py": file_entry(summary(3, 3), {})})
    result = evaluate(data, minimum=90.0)
    assert (result.lines, result.branches, result.functions) == (100.0, 100.0, 100.0)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"files": []},
        {"files": {"a.py": {"summary": summary(1, 1)}}},
        {"files": {"a.py": {"summary": {"num_statements": "1"}, "functions": {}}}},
        {"files": {"a.py": {"summary": summary(1, 1), "functions": {"f": {}}}}},
    ],
)
def test_malformed_reports_are_rejected(payload: dict) -> None:
    with pytest.raises(CoverageReportError):
        evaluate(payload, minimum=90.0)


def test_functions_without_statements_are_not_counted() -> None:
    functions = {
        "real": fully_covered_function(),
        "docstring_only": {"summary": summary(0, 0)},
    }
    data = report({"a.py": file_entry(summary(10, 10), functions)})
    assert evaluate(data, minimum=90.0).functions == 100.0


def test_report_that_measured_nothing_fails() -> None:
    with pytest.raises(CoverageReportError, match="measured no"):
        evaluate(report({}), minimum=90.0)
    with pytest.raises(CoverageReportError, match="measured no"):
        evaluate(report({"a.py": file_entry(summary(0, 0), {})}), minimum=90.0)
