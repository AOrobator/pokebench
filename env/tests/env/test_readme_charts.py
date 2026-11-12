import hashlib
import json
import re

import pytest

from pokebench_env import readme_charts as rc


def ev(kind, t, **k):
    return json.dumps({"type": kind, "t": t, **k})


def start(t="2026-11-07T10:00:00.000-05:00", path=None):
    state = {"kind": "save_state", "path": path} if path else None
    return ev("run_start", t, start_state=state)


def ms(name, t, turn=1, origin="observed"):
    return ev("milestone", t, name=name, turn=turn, origin=origin)


def turn(t, i=1000, c=0, o=10, w=0):
    return ev("assistant", t, usage={"input": i, "cache_read": c, "output": o, "cache_write": w})


PRICES = {
    "as_of": "2026-11-11",
    "models": {
        "flat": {"input": 1.0, "cache_read": 0.5, "output": 2.0},
        "writes": {"input": 1.0, "cache_read": 0.5, "output": 2.0, "cache_write": 1.25},
        "peaky": {
            "input": 1.0,
            "cache_read": 0.0,
            "output": 0.0,
            "peak": {"multiplier": 2, "local_hours": [[20, 23], [1, 5]]},
        },
    },
}


# ---------------------------------------------------------------- scanning


def test_scan_keeps_first_observed_and_marks_held_milestones():
    scan = rc.scan_events(
        "r",
        [
            '{"type":"state","t":"x"}',
            start(path="/runs/prev/checkpoints/MAGMA_HIDEOUT.state"),
            ms("STONE_BADGE", "2026-11-07T10:00:00.000-05:00", origin="present_at_start"),
            ms("KNUCKLE_BADGE", "2026-11-07T11:00:00.000-05:00", turn=5),
            ms("KNUCKLE_BADGE", "2026-11-07T12:00:00.000-05:00", turn=9),
            ev("milestone", "2026-11-07T12:00:00.000-05:00", name=None),
        ],
    )
    assert scan.checkpoint == "MAGMA_HIDEOUT"
    assert scan.checkpoint_run == "prev"
    assert scan.milestones["STONE_BADGE"][0] == -1
    assert scan.milestones["KNUCKLE_BADGE"][:2] == (5, 3600.0)


def test_scan_tags_usage_with_milestones_seen_before_it():
    scan = rc.scan_events(
        "r",
        [
            start(),
            turn("2026-11-07T10:01:00.000-05:00"),
            ms("STONE_BADGE", "2026-11-07T10:02:00.000-05:00"),
            ev("assistant", "2026-11-07T10:03:00.000-05:00"),
        ],
    )
    assert [before for _, before in scan.usage] == [frozenset(), frozenset({"STONE_BADGE"})]
    assert scan.usage[1][0].input == 0


def test_scan_rejects_logs_without_a_start():
    with pytest.raises(rc.ChartError, match="no run_start"):
        rc.scan_events("r", [turn("2026-11-07T10:01:00.000-05:00")])
    with pytest.raises(rc.ChartError, match="before run_start"):
        rc.scan_events("r", [ms("STONE_BADGE", "2026-11-07T10:00:00.000-05:00")])


def test_codex_scan_reads_cumulative_totals_only():
    lines = [
        json.dumps(
            {
                "timestamp": "2026-11-07T06:55:15.860Z",
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 10,
                            "cached_input_tokens": 4,
                            "output_tokens": 2,
                        }
                    },
                },
            }
        ),
        json.dumps({"timestamp": "x", "payload": {"type": "token_count", "info": None}}),
        '{"type":"other"}',
    ]
    assert rc.scan_codex_native(lines) == [rc.CodexReading("2026-11-07T06:55:15.860Z", 10, 4, 2)]


# ---------------------------------------------------------------- stitching, levels, costs


def leg(run, lines):
    return rc.scan_events(run, lines)


def test_stitch_adds_each_cut_to_the_next_leg():
    a = leg(
        "a",
        [
            start("2026-11-07T10:00:00.000-05:00"),
            ms("STONE_BADGE", "2026-11-07T10:10:00.000-05:00"),
            ms("CHECK", "2026-11-07T10:20:00.000-05:00"),
            ms("KNUCKLE_BADGE", "2026-11-07T10:30:00.000-05:00"),
        ],
    )
    b = leg(
        "b",
        [
            start("2026-11-07T12:00:00.000-05:00", path="/runs/a/checkpoints/CHECK.state"),
            ms("STONE_BADGE", "2026-11-07T12:00:00.000-05:00", origin="present_at_start"),
            ms("KNUCKLE_BADGE", "2026-11-07T12:05:00.000-05:00"),
        ],
    )
    assert rc.stitch([a, b]) == {"STONE_BADGE": 600.0, "KNUCKLE_BADGE": 1200.0 + 300.0}


def test_stitch_needs_the_checkpoint_milestone():
    a = leg("a", [start()])
    b = leg("b", [start(path="/runs/a/checkpoints/NOWHERE.state")])
    with pytest.raises(rc.ChartError, match="no observed NOWHERE"):
        rc.stitch([a, b])


def test_stitch_needs_the_checkpoint_from_the_previous_leg():
    a = leg("a", [start(), ms("CHECK", "2026-11-07T10:20:00.000-05:00")])
    b = leg("b", [start(path="/runs/other/checkpoints/CHECK.state")])
    with pytest.raises(rc.ChartError, match="loaded a checkpoint from other, not a"):
        rc.stitch([a, b])
    held = leg("c", [start()])
    with pytest.raises(rc.ChartError, match="loaded no checkpoint"):
        rc.stitch([a, held])


def test_badges_count_in_the_order_earned_and_league_rows_are_fixed():
    times = {"DYNAMO_BADGE": 10.0, "KNUCKLE_BADGE": 20.0, "ELITE_FOUR_SIDNEY_DEFEATED": 30.0}
    assert rc.levels(times) == [
        (1, "DYNAMO_BADGE"),
        (2, "KNUCKLE_BADGE"),
        (9, "ELITE_FOUR_SIDNEY_DEFEATED"),
    ]
    assert rc.furthest(times) == "ELITE_FOUR_SIDNEY_DEFEATED"
    assert rc.furthest({"DYNAMO_BADGE": 30.0, "HEAT_BADGE": 20.0}) == "DYNAMO_BADGE"
    with pytest.raises(rc.ChartError):
        rc.furthest({})


def test_usage_cost_stops_at_the_milestone_and_doubles_peak_hours():
    prices = rc.parse_prices(PRICES)
    scan = leg(
        "r",
        [
            start(),
            turn("2026-11-07T19:59:59.000-05:00", i=1_000_000, o=0),  # off-peak
            turn("2026-11-07T20:00:00.000-05:00", i=1_000_000, o=0),  # peak
            turn("2026-11-08T04:59:00.000-05:00", i=1_000_000, o=0),  # peak
            ms("STONE_BADGE", "2026-11-08T05:00:00.000-05:00"),
            turn("2026-11-08T05:01:00.000-05:00", i=1_000_000, o=0),
        ],
    )
    assert rc.usage_cost(scan, "STONE_BADGE", prices["peaky"]) == pytest.approx(5.0)
    flat = leg(
        "r", [start(), turn("2026-11-07T10:01:00.000-05:00", i=1_000_000, c=2_000_000, o=1_000_000)]
    )
    assert rc.usage_cost(flat, "STONE_BADGE", prices["flat"]) == pytest.approx(1 + 1 + 2)


def test_usage_cost_prices_cache_writes_at_their_rate_or_the_input_rate():
    prices = rc.parse_prices(PRICES)
    scan = leg("r", [start(), turn("2026-11-07T10:01:00.000-05:00", i=0, o=0, w=1_000_000)])
    assert prices["flat"].cache_write == 1.0
    assert rc.usage_cost(scan, "STONE_BADGE", prices["flat"]) == pytest.approx(1.0)
    assert prices["writes"].cache_write == 1.25
    assert rc.usage_cost(scan, "STONE_BADGE", prices["writes"]) == pytest.approx(1.25)


def test_codex_cost_takes_the_last_reading_at_or_before_the_milestone():
    price = rc.Price(2.0, 0.1, 10.0)
    readings = [
        rc.CodexReading("2026-11-07T15:00:00Z", 1_000_000, 0, 0),
        rc.CodexReading("2026-11-07T16:00:00Z", 3_000_000, 2_000_000, 100_000),
        rc.CodexReading("2026-11-07T17:00:00Z", 9_000_000, 0, 0),
    ]
    assert rc.codex_cost(readings, "2026-11-07T11:00:00.000-05:00", price) == pytest.approx(
        2 + 0.2 + 1
    )
    with pytest.raises(rc.ChartError, match="no Codex"):
        rc.codex_cost(readings, "2026-11-07T09:00:00.000-05:00", price)


def test_prices_need_a_models_table():
    with pytest.raises(rc.ChartError):
        rc.parse_prices({})


FLAT = {"input": 1, "cache_read": 0.5, "output": 2}


@pytest.mark.parametrize(
    ("model", "message"),
    [
        ([], "m: expected an object"),
        ({"cache_read": 0.5, "output": 2}, "m input: expected a number"),
        ({**FLAT, "input": "1"}, "m input: expected a number"),
        ({**FLAT, "cache_write": True}, "m cache_write: expected a number"),
        ({**FLAT, "peak": []}, "m peak: expected an object"),
        ({**FLAT, "peak": {"multiplier": "2"}}, "m peak multiplier: expected a number"),
        ({**FLAT, "peak": {"local_hours": [[1]]}}, "m peak hours: expected"),
        ({**FLAT, "peak": {"local_hours": [[1, 2.5]]}}, "m peak hours: expected"),
        ({**FLAT, "peak": {"local_hours": "1-5"}}, "m peak local_hours: expected a list"),
    ],
)
def test_prices_reject_bad_shapes(model, message):
    with pytest.raises(rc.ChartError, match=message):
        rc.parse_prices({"models": {"m": model}})


# ---------------------------------------------------------------- points and pages


def chart_data(series):
    return {
        "human": {
            "label": "Human",
            "color": "#d83a3a",
            "splits_seconds": [60, 120] + [None] * 10 + [300, 360],
        },
        "series": series,
        "pages": {
            "badges_over_time": {"title": "T", "subtitle": "S", "notes": ["a & b"]},
            "badges_for_the_money": {"title": "M", "subtitle": "S", "notes": ["n"]},
        },
    }


def one(label, runs, cost, **k):
    return {"label": label, "color": "#123456", "runs": runs, "cost": cost, **k}


class FakeRuns:
    def __init__(self, events, native=None):
        self._events = events
        self._native = native or {}

    def events(self, run):
        return self._events[run]

    def codex_native(self, run):
        return self._native[run]


RUNS = FakeRuns(
    {
        "local": [
            start(),
            turn("2026-11-07T10:01:00.000-05:00", i=2_000_000, o=0),
            ms("STONE_BADGE", "2026-11-07T10:10:00.400-05:00"),
            turn("2026-11-07T10:11:00.000-05:00", i=9_000_000, o=0),
        ],
        "codex": [start(), ms("STONE_BADGE", "2026-11-07T11:00:00.000-05:00")],
        "pinned": [start(), ms("STONE_BADGE", "2026-11-07T10:30:00.000-05:00")],
        "next": [
            start(path="/runs/local/checkpoints/STONE_BADGE.state"),
            ms("KNUCKLE_BADGE", "2026-11-07T10:05:00.000-05:00"),
        ],
    },
    {
        "codex": [
            json.dumps(
                {
                    "timestamp": "2026-11-07T15:59:00Z",
                    "payload": {
                        "info": {
                            "total_token_usage": {
                                "input_tokens": 1_000_000,
                                "cached_input_tokens": 0,
                                "output_tokens": 0,
                            }
                        },
                        "type": "token_count",
                    },
                }
            )
        ]
    },
)

SERIES = [
    one(
        "Local",
        ["local"],
        {"kind": "events", "price": "flat", "estimated": True},
        label_offset=[-16, -6, "end"],
    ),
    one("Codex", ["codex"], {"kind": "codex", "price": "flat"}),
    one("Pinned*", ["pinned"], {"kind": "pinned", "usd": 12.346}, assisted=True),
]


def test_points_derive_times_and_costs():
    points = rc.build_points(chart_data(SERIES), PRICES, RUNS)
    assert points["prices_as_of"] == "2026-11-11"
    local, codex, pinned = points["series"]
    assert local["milestones"] == {"STONE_BADGE": 600}
    assert (local["furthest"], local["cost_usd"]) == ("STONE_BADGE", 2.0)
    assert codex["cost_usd"] == 1.0
    assert pinned["cost_usd"] == 12.35


@pytest.mark.parametrize(
    ("series", "message"),
    [
        ([one("X", ["pinned"], {"kind": "pinned"})], "without usd"),
        ([one("X", ["local", "next"], {"kind": "events", "price": "flat"})], "single-run"),
        ([one("X", ["local"], {"kind": "events", "price": "nope"})], "no price"),
        ([one("X", ["local"], {"kind": "magic", "price": "flat"})], "unknown cost kind"),
    ],
)
def test_points_reject_bad_series(series, message):
    with pytest.raises(rc.ChartError, match=message):
        rc.build_points(chart_data(series), PRICES, RUNS)


def test_series_list_is_required():
    with pytest.raises(rc.ChartError):
        rc.parse_series({})


GOOD = one("X", ["r"], {"kind": "pinned", "usd": 1})


@pytest.mark.parametrize(
    ("series", "message"),
    [
        ("X", "series 1: expected an object"),
        ({**GOOD, "label": 3}, "series 1 label: expected text"),
        ({**GOOD, "color": None}, "X color: expected text"),
        ({**GOOD, "assisted": "yes"}, "X assisted: expected true or false"),
        ({**GOOD, "runs": []}, "X runs: expected at least one run"),
        ({**GOOD, "runs": ["r", 2]}, "X run: expected text"),
        ({**GOOD, "cost": []}, "X cost: expected an object"),
        ({**GOOD, "cost": {"kind": "magic"}}, "unknown cost kind"),
        ({**GOOD, "cost": {"kind": "events", "price": 5}}, "X price: expected text"),
        ({**GOOD, "cost": {"kind": "pinned", "usd": "1"}}, "X usd: expected a number"),
        ({**GOOD, "cost": {"kind": "pinned", "usd": 1, "estimated": 1}}, "X estimated"),
        ({**GOOD, "label_offset": [1, 2]}, "X label_offset: expected"),
        ({**GOOD, "label_offset": [1, "2", "end"]}, "X label_offset: expected"),
        ({**GOOD, "dark_color": 5}, "X dark_color: expected text"),
    ],
)
def test_series_reject_bad_shapes(series, message):
    with pytest.raises(rc.ChartError, match=message):
        rc.parse_series({"series": [series]})


def test_pages_plot_every_line_and_mark_assisted_runs():
    data = chart_data(SERIES)
    points = rc.build_points(data, PRICES, RUNS)
    pages = rc.build_pages(data, points)
    time_page, money_page = pages[rc.TIME_HTML], pages[rc.MONEY_HTML]
    assert time_page.startswith("<!doctype html>") and "<h1>T</h1>" in time_page
    assert "a &amp; b" in time_page
    assert time_page.count('stroke-dasharray="3 4"') == 1
    assert ">0:10:00<" in time_page and ">1 badge<" in time_page and ">Hall of Fame<" in time_page
    assert "$2.00 (estimated)" in money_page and "$12.35<" in money_page
    assert 'text-anchor="end">Local<' in money_page


def test_card_hugs_the_chart_at_whole_pixel_heights():
    css = rc.css(rc.LIGHT)
    assert ".card{width:fit-content;" in css
    # whole-pixel line heights keep the card's height whole, so the PNG has no page strip
    assert "h1{font-size:30px;line-height:36px;" in css
    assert "p{margin:0;color:#44525e;font-size:15px;line-height:22px}" in css
    assert ".note{margin-top:8px;font-size:13.5px;line-height:20px}" in css


# sha256 of main's (e1dbd1906) light pages for chart_data(SERIES); the light output must not move.
MAIN_LIGHT = {
    rc.TIME_HTML: "166dca40389cf496df8a1dafad763b6f80c356acbc74118686593c5b4f89c8b5",
    rc.MONEY_HTML: "7477ee9e66e3395f4bcda969d086ad0fe44db56962f77407f5a8e945dcb508cd",
}

LIGHT_ONLY = ("#f7f3e8", "#fff", "#24323d", "#44525e", "#5a6670", "#ece8dc", "#c9c3b0")


def pages_for(series):
    data = chart_data(series)
    return rc.build_pages(data, rc.build_points(data, PRICES, RUNS))


def test_light_pages_are_byte_identical_to_main():
    pages = pages_for(SERIES)
    for rel, digest in MAIN_LIGHT.items():
        assert hashlib.sha256(pages[rel].encode()).hexdigest() == digest


def test_build_pages_writes_light_and_dark_pages():
    assert set(pages_for(SERIES)) == {
        rc.TIME_HTML,
        rc.MONEY_HTML,
        rc.TIME_HTML_DARK,
        rc.MONEY_HTML_DARK,
    }
    assert rc.TIME_HTML_DARK == "docs/images/charts/badges-over-time-dark.html"
    assert rc.MONEY_HTML_DARK == "docs/images/charts/badges-for-the-money-dark.html"


def test_dark_pages_use_the_dark_palette_and_no_light_only_colour():
    pages = pages_for(SERIES)
    for rel in (rc.TIME_HTML_DARK, rc.MONEY_HTML_DARK):
        body = pages[rel].lower()
        for colour in LIGHT_ONLY:
            assert not re.search(re.escape(colour) + r"(?![0-9a-f])", body), (rel, colour)
        for colour in ("#0f1720", "#17212b", "#e6ecef", "#c3ccd2", "#2c5f55", "#5ab89c"):
            assert colour in body, (rel, colour)
    assert "#9aa6ae" in pages[rc.TIME_HTML_DARK] and "#26323d" in pages[rc.TIME_HTML_DARK]
    assert "#4a5866" in pages[rc.TIME_HTML_DARK] and "#4a5866" in pages[rc.MONEY_HTML_DARK]


def test_palettes_hold_the_approved_values():
    assert rc.LIGHT == rc.Palette(
        page="#f7f3e8",
        frame="#2c5f55",
        rim="#5ab89c",
        interior="#fff",
        text="#24323d",
        secondary="#44525e",
        axis="#5a6670",
        grid="#ece8dc",
        eighth="#c9c3b0",
    )
    assert rc.DARK == rc.Palette(
        page="#0f1720",
        frame="#2c5f55",
        rim="#5ab89c",
        interior="#17212b",
        text="#e6ecef",
        secondary="#c3ccd2",
        axis="#9aa6ae",
        grid="#26323d",
        eighth="#4a5866",
    )


def test_hollow_points_take_the_card_interior_colour():
    for palette in (rc.LIGHT, rc.DARK):
        assert palette.hollow == palette.interior
    pages = pages_for(SERIES)
    for rel, palette in ((rc.TIME_HTML, rc.LIGHT), (rc.TIME_HTML_DARK, rc.DARK)):
        hollow = re.findall(r'<circle [^>]*fill="([^"]+)" stroke="#123456"', pages[rel])
        assert palette.hollow in hollow, rel


def test_dark_color_is_used_in_dark_and_falls_back_to_color():
    series = [
        {**SERIES[0], "dark_color": "#abcdef"},
        SERIES[1],
        SERIES[2],
    ]
    assert rc.parse_series({"series": series})[0].dark_color == "#abcdef"
    assert rc.parse_series({"series": series})[1].dark_color is None
    pages = pages_for(series)
    for rel in (rc.TIME_HTML_DARK, rc.MONEY_HTML_DARK):
        assert 'fill="#abcdef"' in pages[rel]
        assert 'fill="#123456"' in pages[rel]  # Codex and Pinned keep color
    for rel in (rc.TIME_HTML, rc.MONEY_HTML):
        assert "#abcdef" not in pages[rel]


def test_pages_need_points_for_every_series():
    with pytest.raises(rc.ChartError, match="run the points stage"):
        rc.build_pages(chart_data(SERIES), {"series": []})


def test_end_labels():
    assert [rc.endlabel(n) for n in (1, 2, 9, 12, 13, 14)] == [
        "1 badge",
        "2 badges",
        "1 of the Elite Four",
        "4 of the Elite Four",
        "Champion",
        "Hall of Fame",
    ]


# ---------------------------------------------------------------- command


class MemStore:
    def __init__(self, files):
        self.files = dict(files)

    def read(self, rel):
        return self.files[rel]

    def write(self, rel, body):
        self.files[rel] = body


def store():
    return MemStore({rc.CHART_DATA: json.dumps(chart_data(SERIES)), rc.PRICES: json.dumps(PRICES)})


def test_command_writes_points_then_pages_and_checks_drift():
    s, said = store(), []
    assert rc.run(["points"], s, RUNS, said.append) == 0
    assert rc.run(["check-points"], s, RUNS, said.append) == 0
    assert rc.run(["html"], s, RUNS, said.append) == 0
    assert rc.TIME_HTML in s.files and rc.MONEY_HTML in s.files
    assert rc.TIME_HTML_DARK in s.files and rc.MONEY_HTML_DARK in s.files
    s.files[rc.POINTS] = "{}"
    assert rc.run(["check-points"], s, RUNS, said.append) == 1
    assert "differs" in said[-1]


def test_command_usage_and_errors():
    said = []
    assert rc.run([], store(), RUNS, said.append) == 2
    assert rc.run(["pionts"], store(), RUNS, said.append) == 2
    assert said[-1] == "error: unknown stage 'pionts'; " + rc.USAGE
    s = store()
    s.files[rc.CHART_DATA] = "{not json"
    assert rc.run(["html"], s, RUNS, said.append) == 1
    assert said[-1].startswith(f"error: {rc.CHART_DATA} is not JSON")
    s = store()
    s.files[rc.PRICES] = "{}"
    assert rc.run(["points"], s, RUNS, said.append) == 1
    assert said[-1].startswith("error:")
