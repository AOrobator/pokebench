"""The README charts, rebuilt from the run logs.

Two charts, ``docs/images/badges-over-time.png`` and ``docs/images/badges-for-the-money.png``.
What is plotted is configured in ``docs/images/charts/chart-data.json`` (which runs make up each
line, colors, label positions, notes) and priced from ``docs/images/charts/prices.json`` (one
dated price per model). Generation has two stages:

``points``  reads each run's ``runs/<id>/events.jsonl`` (and, for Codex runs, the attached
            ``native.jsonl``) and writes every plotted number to ``chart-points.json``:
            the first observed time of each gym badge, Elite Four win, Champion win and game clear,
            measured from ``run_start`` and stitched across checkpoint legs, plus the cost up to
            the furthest milestone. Needs the local ``runs/`` folder.
``html``    renders the two chart pages from ``chart-points.json`` alone, so a clean clone
            can rebuild them. ``scripts`` in the viewer package turns each page into a PNG.

The core works on strings and returns ``{repo-relative path: text}``; ``main`` is the thin disk
entrypoint.
"""

from __future__ import annotations

import html
import json
import math
import sys
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

CHARTS = "docs/images/charts"
CHART_DATA = f"{CHARTS}/chart-data.json"
PRICES = f"{CHARTS}/prices.json"
POINTS = f"{CHARTS}/chart-points.json"
TIME_HTML = f"{CHARTS}/badges-over-time.html"
MONEY_HTML = f"{CHARTS}/badges-for-the-money.html"

BADGES = (
    "STONE_BADGE",
    "KNUCKLE_BADGE",
    "DYNAMO_BADGE",
    "HEAT_BADGE",
    "BALANCE_BADGE",
    "FEATHER_BADGE",
    "MIND_BADGE",
    "RAIN_BADGE",
)
LEAGUE = (
    "ELITE_FOUR_SIDNEY_DEFEATED",
    "ELITE_FOUR_PHOEBE_DEFEATED",
    "ELITE_FOUR_GLACIA_DEFEATED",
    "ELITE_FOUR_DRAKE_DEFEATED",
    "WALLACE_DEFEATED",
    "GAME_CLEAR_CONFIRMED",
)
PLOTTED = BADGES + LEAGUE
LEVEL = {name: i + 1 for i, name in enumerate(PLOTTED)}
TOP = len(PLOTTED)
LV = ["0", "1", "2", "3", "4", "5", "6", "7", "8"] + [
    "Sidney",
    "Phoebe",
    "Glacia",
    "Drake",
    "Champion",
    "Hall of Fame",
]


class ChartError(ValueError):
    """Inputs that cannot produce a chart: a missing run, milestone or price."""


def as_map(value: object, what: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ChartError(f"{what}: expected an object")
    return value


def as_list(value: object, what: str) -> list[object]:
    if not isinstance(value, list):
        raise ChartError(f"{what}: expected a list")
    return value


def num(value: object, what: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ChartError(f"{what}: expected a number")
    return float(value)


def as_text(value: object, what: str) -> str:
    if not isinstance(value, str):
        raise ChartError(f"{what}: expected text")
    return value


def flag(value: object, what: str) -> bool:
    if not isinstance(value, bool):
        raise ChartError(f"{what}: expected true or false")
    return value


# ---------------------------------------------------------------- parsing the run logs


def ts(text: str) -> datetime:
    return datetime.fromisoformat(text)


@dataclass(frozen=True)
class Usage:
    t: str
    input: int
    cache_read: int
    output: int
    cache_write: int = 0


@dataclass(frozen=True)
class RunScan:
    """What the charts need from one run's events.jsonl."""

    run: str
    t0: str
    checkpoint: str | None
    # the run folder the checkpoint was saved in (runs/<run>/checkpoints/<milestone>.state)
    checkpoint_run: str | None
    # milestone name -> (turn, seconds from run_start, event time); first observed only.
    # Milestones already held at the start are recorded with turn -1.
    milestones: Mapping[str, tuple[int, float, str]]
    # assistant usage in file order, each tagged with the milestones observed before it
    usage: Sequence[tuple[Usage, frozenset[str]]]


WANTED = ('"run_start"', '"milestone"', '"assistant"')


def scan_events(run: str, lines: Iterable[str]) -> RunScan:
    t0: datetime | None = None
    t0_text = ""
    checkpoint: str | None = None
    checkpoint_run: str | None = None
    seen: dict[str, tuple[int, float, str]] = {}
    usage: list[tuple[Usage, frozenset[str]]] = []
    observed: frozenset[str] = frozenset()
    for line in lines:
        if not any(key in line for key in WANTED):
            continue
        event = json.loads(line)
        kind = event.get("type")
        if kind == "run_start":
            t0_text = str(event["t"])
            t0 = ts(t0_text)
            state = event.get("start_state")
            path = state.get("path") if isinstance(state, dict) else None
            if isinstance(path, str):
                checkpoint = Path(path).stem
                checkpoint_run = Path(path).parent.parent.name
        elif kind == "milestone":
            name = event.get("name")
            if not isinstance(name, str) or name in seen:
                continue
            if t0 is None:
                raise ChartError(f"{run}: milestone before run_start")
            if event.get("origin") == "present_at_start":
                seen[name] = (-1, 0.0, str(event["t"]))
                continue
            secs = (ts(str(event["t"])) - t0).total_seconds()
            seen[name] = (int(event.get("turn", -1)), secs, str(event["t"]))
            observed = observed | {name}
        elif kind == "assistant":
            u = event.get("usage") or {}
            usage.append(
                (
                    Usage(
                        str(event["t"]),
                        int(u.get("input", 0)),
                        int(u.get("cache_read", 0)),
                        int(u.get("output", 0)),
                        int(u.get("cache_write", 0)),
                    ),
                    observed,
                )
            )
    if t0 is None:
        raise ChartError(f"{run}: no run_start event")
    return RunScan(run, t0_text, checkpoint, checkpoint_run, seen, usage)


@dataclass(frozen=True)
class CodexReading:
    t: str
    input: int
    cached: int
    output: int


def scan_codex_native(lines: Iterable[str]) -> list[CodexReading]:
    """Cumulative token_count readings from a Codex native.jsonl, in file order."""
    out: list[CodexReading] = []
    for line in lines:
        if '"token_count"' not in line:
            continue
        event = json.loads(line)
        info = (event.get("payload") or {}).get("info") or {}
        total = info.get("total_token_usage")
        if not isinstance(total, dict):
            continue
        out.append(
            CodexReading(
                str(event["timestamp"]),
                int(total.get("input_tokens", 0)),
                int(total.get("cached_input_tokens", 0)),
                int(total.get("output_tokens", 0)),
            )
        )
    return out


# ---------------------------------------------------------------- stitching and costs


@dataclass(frozen=True)
class Price:
    input: float
    cache_read: float
    output: float
    peak_multiplier: float = 1.0
    peak_hours: tuple[tuple[int, int], ...] = ()
    # cache writes cost the input rate unless prices.json gives their own rate
    cache_write_rate: float | None = None

    @property
    def cache_write(self) -> float:
        return self.input if self.cache_write_rate is None else self.cache_write_rate

    def factor(self, t: str) -> float:
        """Peak windows are local wall-clock hours of the event's own timestamp."""
        hour = ts(t).hour
        if any(lo <= hour < hi for lo, hi in self.peak_hours):
            return self.peak_multiplier
        return 1.0


def hour_window(value: object, what: str) -> tuple[int, int]:
    pair = as_list(value, what)
    if len(pair) != 2 or not all(isinstance(h, int) and not isinstance(h, bool) for h in pair):
        raise ChartError(f"{what}: expected [start, end) whole hours")
    lo, hi = pair
    assert isinstance(lo, int) and isinstance(hi, int)
    return lo, hi


def parse_price(key: str, value: object) -> Price:
    raw = as_map(value, key)
    peak = as_map(raw.get("peak", {}), f"{key} peak")
    write = raw.get("cache_write")
    return Price(
        num(raw.get("input"), f"{key} input"),
        num(raw.get("cache_read"), f"{key} cache_read"),
        num(raw.get("output"), f"{key} output"),
        num(peak.get("multiplier", 1.0), f"{key} peak multiplier"),
        tuple(
            hour_window(w, f"{key} peak hours")
            for w in as_list(peak.get("local_hours", []), f"{key} peak local_hours")
        ),
        None if write is None else num(write, f"{key} cache_write"),
    )


def parse_prices(doc: Mapping[str, object]) -> dict[str, Price]:
    models = doc.get("models")
    if not isinstance(models, dict):
        raise ChartError("prices.json: no models")
    return {str(key): parse_price(str(key), raw) for key, raw in models.items()}


def stitch(legs: Sequence[RunScan]) -> dict[str, float]:
    """First observed seconds of each plotted milestone along a checkpoint chain.

    Each leg is cut at the milestone whose save state the next leg loaded (from the next
    leg's run_start), and the next leg's times are added to the sum of those cuts.
    """
    out: dict[str, float] = {}
    offset = 0.0
    for i, leg in enumerate(legs):
        cut_at = math.inf
        if i + 1 < len(legs):
            nxt = legs[i + 1]
            cut = nxt.checkpoint
            if cut is None:
                raise ChartError(f"{nxt.run}: loaded no checkpoint to stitch after {leg.run}")
            if nxt.checkpoint_run != leg.run:
                raise ChartError(
                    f"{nxt.run}: loaded a checkpoint from {nxt.checkpoint_run}, not {leg.run}"
                )
            hit = leg.milestones.get(cut or "")
            if not hit or hit[0] < 0:
                raise ChartError(f"{leg.run}: no observed {cut} to stitch the next leg at")
            cut_at = hit[1]
        for name in PLOTTED:
            got = leg.milestones.get(name)
            # play after the cut was rolled back when the next leg loaded the checkpoint
            if got and got[0] >= 0 and got[1] <= cut_at and name not in out:
                out[name] = offset + got[1]
        if i + 1 < len(legs):
            offset += cut_at
    return out


def levels(times: Mapping[str, float]) -> list[tuple[int, str]]:
    """(level, milestone) rising. Badges count in the order they were earned, since runs do not
    always take the gyms in game order; Elite Four, Champion and game clear have fixed rows."""
    badges = sorted((times[n], n) for n in BADGES if n in times)
    out = [(i + 1, name) for i, (_, name) in enumerate(badges)]
    out += [(LEVEL[n], n) for n in LEAGUE if n in times]
    return out


def furthest(times: Mapping[str, float]) -> str:
    if not times:
        raise ChartError("no plotted milestone")
    return levels(times)[-1][1]


def usage_cost(leg: RunScan, until: str, price: Price) -> float:
    """Logged tokens of every turn before the milestone event, at the given price."""
    total = 0.0
    for u, before in leg.usage:
        if until in before:
            break
        per_m = (
            u.input * price.input
            + u.cache_read * price.cache_read
            + u.cache_write * price.cache_write
            + u.output * price.output
        )
        total += per_m * price.factor(u.t) / 1e6
    return total


def codex_cost(readings: Sequence[CodexReading], until_t: str, price: Price) -> float:
    """The last cumulative Codex reading at or before the milestone, at the given price."""
    cutoff = ts(until_t)
    last: CodexReading | None = None
    for r in readings:
        if ts(r.t) <= cutoff:
            last = r
    if last is None:
        raise ChartError("no Codex token reading before the milestone")
    fresh = last.input - last.cached
    return (fresh * price.input + last.cached * price.cache_read + last.output * price.output) / 1e6


# ---------------------------------------------------------------- configuration


@dataclass(frozen=True)
class Series:
    label: str
    color: str
    assisted: bool
    runs: tuple[str, ...]
    cost_kind: str  # "events" | "codex" | "pinned"
    price: str | None
    pinned_usd: float | None
    estimated: bool
    label_offset: tuple[float, float, str] | None


COST_KINDS = ("events", "codex", "pinned")


def label_offset(value: object, what: str) -> tuple[float, float, str] | None:
    if value is None:
        return None
    raw = as_list(value, what)
    if (
        len(raw) != 3
        or not all(isinstance(v, int | float) and not isinstance(v, bool) for v in raw[:2])
        or not isinstance(raw[2], str)
    ):
        raise ChartError(f"{what}: expected [dx, dy, anchor]")
    return num(raw[0], what), num(raw[1], what), raw[2]


def parse_one_series(i: int, value: object) -> Series:
    s = as_map(value, f"series {i}")
    label = as_text(s.get("label"), f"series {i} label")
    runs = tuple(as_text(r, f"{label} run") for r in as_list(s.get("runs"), f"{label} runs"))
    if not runs:
        raise ChartError(f"{label} runs: expected at least one run")
    cost = as_map(s.get("cost"), f"{label} cost")
    kind = cost.get("kind")
    if kind not in COST_KINDS:
        raise ChartError(f"{label}: unknown cost kind {kind!r}")
    price = cost.get("price")
    usd = cost.get("usd")
    return Series(
        label,
        as_text(s.get("color"), f"{label} color"),
        flag(s.get("assisted", False), f"{label} assisted"),
        runs,
        str(kind),
        None if price is None else as_text(price, f"{label} price"),
        None if usd is None else num(usd, f"{label} usd"),
        flag(cost.get("estimated", False), f"{label} estimated"),
        label_offset(s.get("label_offset"), f"{label} label_offset"),
    )


def parse_series(doc: Mapping[str, object]) -> list[Series]:
    raw = doc.get("series")
    if not isinstance(raw, list):
        raise ChartError("chart-data.json: no series")
    return [parse_one_series(i + 1, s) for i, s in enumerate(raw)]


# ---------------------------------------------------------------- stage 1: points


class Runs(Protocol):
    def events(self, run: str) -> Iterable[str]: ...
    def codex_native(self, run: str) -> Iterable[str]: ...


def build_points(
    chart_data: Mapping[str, object], prices_doc: Mapping[str, object], runs: Runs
) -> dict[str, object]:
    prices = parse_prices(prices_doc)
    series_out = []
    for s in parse_series(chart_data):
        legs = [scan_events(r, runs.events(r)) for r in s.runs]
        times = stitch(legs)
        top = furthest(times)
        last = legs[-1]
        if s.cost_kind == "pinned":
            if s.pinned_usd is None:
                raise ChartError(f"{s.label}: pinned cost without usd")
            usd = s.pinned_usd
        else:
            if len(legs) != 1:
                raise ChartError(f"{s.label}: token costs need a single-run series")
            price = prices.get(s.price or "")
            if price is None:
                raise ChartError(f"{s.label}: no price {s.price!r} in prices.json")
            if s.cost_kind == "events":
                usd = usage_cost(last, top, price)
            elif s.cost_kind == "codex":
                usd = codex_cost(
                    scan_codex_native(runs.codex_native(last.run)), last.milestones[top][2], price
                )
            else:  # pragma: no cover - parse_series admits only COST_KINDS
                raise ChartError(f"{s.label}: unknown cost kind {s.cost_kind!r}")
        series_out.append(
            {
                "label": s.label,
                "runs": list(s.runs),
                "milestones": {name: round(times[name]) for name in PLOTTED if name in times},
                "furthest": top,
                "cost_usd": round(usd, 2),
                "cost_kind": s.cost_kind,
                "price": s.price,
            }
        )
    return {"prices_as_of": prices_doc.get("as_of"), "series": series_out}


# ---------------------------------------------------------------- stage 2: chart pages


def hms(s: int) -> str:
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def endlabel(n: int) -> str:
    if n <= 8:
        return f"{n} badge" + ("s" if n > 1 else "")
    if n == 14:
        return "Hall of Fame"
    if n == 13:
        return "Champion"
    return f"{n - 8} of the Elite Four"


# .in is as wide as the charts' SVG, so the card never clips the legend's right edge whatever the
# browser window; render with a viewport of at least 1400 px. The card hugs .in so the outer band is
# even on every side, and whole-pixel line heights keep its height whole, so the element screenshot
# takes no strip of page background.
CSS = (
    "body{margin:0;background:#f7f3e8;font-family:-apple-system,BlinkMacSystemFont,"
    '"Helvetica Neue",Arial,sans-serif;color:#24323d}\n'
    ".card{width:fit-content;margin:18px;border:4px solid #2c5f55;border-radius:30px;padding:6px;"
    "background:#2c5f55}\n"
    ".in{background:#fff;border:5px solid #5ab89c;border-radius:24px;padding:28px 34px 22px;"
    "width:1240px}\nh1{font-size:30px;line-height:36px;margin:4px 0 6px}"
    "p{margin:0;color:#44525e;font-size:15px;line-height:22px}"
    ".note{margin-top:8px;font-size:13.5px;line-height:20px}"
)


def page(title: str, sub: str, svg: str, notes: Sequence[str]) -> str:
    return (
        f'<!doctype html><meta charset="utf-8"><style>{CSS}</style>'
        f'<div class="card" id="c"><div class="in"><h1>{title}</h1><p>{sub}</p>{svg}'
        + "".join(f'<p class="note">{html.escape(n)}</p>' for n in notes)
        + "</div></div>"
    )


def text(x: float, y: float, s: str, **k: str) -> str:
    a = " ".join(f'{kk.replace("_", "-")}="{v}"' for kk, v in k.items())
    return f'<text x="{x:.1f}" y="{y:.1f}" {a}>{html.escape(s)}</text>'


def hline(x1: float, x2: float, y: float, stroke: str) -> str:
    return f'<line x1="{x1}" x2="{x2}" y1="{y}" y2="{y}" stroke="{stroke}"/>'


def vline(x: float, y1: float, y2: float) -> str:
    return f'<line x1="{x}" x2="{x}" y1="{y1}" y2="{y2}" stroke="#ece8dc"/>'


def progress_label(x: float, y: float) -> str:
    return (
        f'<text transform="translate({x} {y}) rotate(-90)" text-anchor="middle" '
        'fill="#44525e" font-size="14">Progress</text>'
    )


def end_point(x: float, y: float, r: str, ln: Line, width: str) -> str:
    """The run's end marker: hollow for heavily assisted runs."""
    fill = "#fff" if ln.assisted else ln.color
    return (
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" '
        f'stroke="{ln.color}" stroke-width="{width}"/>'
    )


@dataclass(frozen=True)
class Line:
    label: str
    color: str
    assisted: bool
    points: tuple[tuple[int, int], ...]  # (level, seconds), rising
    usd: float | None
    estimated: bool
    label_offset: tuple[float, float, str] | None

    @property
    def end(self) -> tuple[int, int]:
        return self.points[-1]


def lines_from(
    chart_data: Mapping[str, object], points: Mapping[str, object]
) -> tuple[Line, list[Line]]:
    by_label: dict[str, dict[str, object]] = {}
    for raw in as_list(points.get("series"), "chart-points series"):
        entry = as_map(raw, "chart-points series entry")
        by_label[str(entry["label"])] = entry
    out = []
    for s in parse_series(chart_data):
        p = by_label.get(s.label)
        if p is None:
            raise ChartError(f"chart-points.json has no {s.label!r}; run the points stage")
        ms = {k: int(num(v, k)) for k, v in as_map(p["milestones"], s.label).items()}
        pts = tuple((level, ms[n]) for level, n in levels(ms))
        out.append(
            Line(
                s.label,
                s.color,
                s.assisted,
                pts,
                num(p["cost_usd"], s.label),
                s.estimated,
                s.label_offset,
            )
        )
    human = as_map(chart_data.get("human"), "chart-data human")
    splits = as_list(human.get("splits_seconds"), "human splits_seconds")
    hpts = tuple(
        (i + 1, int(num(sec, "human split"))) for i, sec in enumerate(splits) if sec is not None
    )
    hline_ = Line(str(human["label"]), str(human["color"]), False, hpts, None, False, None)
    return hline_, out


def finish(notes: Mapping[str, object], o: Sequence[str]) -> str:
    """Wrap the SVG lines in the page with its title, subtitle and notes."""
    extra = [str(n) for n in as_list(notes.get("notes"), "page notes")]
    return page(str(notes["title"]), str(notes["subtitle"]), "\n".join(o), extra)


def time_chart(human: Line, lines: Sequence[Line], notes: Mapping[str, object]) -> str:
    W, H = 1240, 760
    L, T, PW, PH = 110, 24, 700, 680

    def X(s: float) -> float:
        return L + s / 86400 * PW

    def Y(n: float) -> float:
        return T + PH - n / TOP * PH

    o = [f'<svg width="{W}" height="{H + 50}" viewBox="0 0 {W} {H + 50}" font-size="13">']
    for n in range(TOP + 1):
        o += [
            hline(L, L + PW, Y(n), "#c9c3b0" if n == 8 else "#ece8dc"),
            text(
                L - 10,
                Y(n) + 4,
                LV[n],
                text_anchor="end",
                fill="#5a6670",
                font_weight="700" if n > 8 else "400",
            ),
        ]
    for h in range(0, 25, 4):
        o += [
            vline(X(h * 3600), T, T + PH),
            text(X(h * 3600), T + PH + 20, f"{h}h", text_anchor="middle", fill="#5a6670"),
        ]
    o.append(
        text(
            L + PW / 2,
            T + PH + 46,
            "Hours from the start of the run",
            text_anchor="middle",
            fill="#44525e",
            font_size="14",
        )
    )
    o.append(progress_label(18, T + PH / 2))
    rows = [human, *lines]
    for ln in rows:
        d = f"M{X(0)},{Y(0)}"
        for n, v in ln.points:
            d += f" H{X(v):.1f} V{Y(n):.1f}"
        dash = 'stroke-dasharray="3 4"' if ln.assisted else ""
        o.append(f'<path d="{d}" fill="none" stroke="{ln.color}" stroke-width="2.6" {dash}/>')
        for n, v in [q for q in ln.points[:-1] if q[0] <= 8]:
            o.append(f'<circle cx="{X(v):.1f}" cy="{Y(n):.1f}" r="2.6" fill="{ln.color}"/>')
        n, v = ln.end
        o.append(end_point(X(v), Y(n), "6.5", ln, "2.6"))
    ly: float = T + 6
    for ln in sorted(rows, key=lambda r: (-r.end[0], r.end[1])):
        o.append(
            text(L + PW + 24, ly + 4, ln.label, fill=ln.color, font_weight="700", font_size="13.5")
        )
        o.append(text(W - 8, ly + 4, hms(ln.end[1]), text_anchor="end", fill="#44525e"))
        ly += 17
        o.append(text(L + PW + 24, ly + 4, endlabel(ln.end[0]), fill="#5a6670", font_size="12"))
        ly += 27
    o.append("</svg>")
    return finish(notes, o)


def money_chart(lines: Sequence[Line], notes: Mapping[str, object]) -> str:
    W, H = 1240, 700
    L, T, PW, PH = 120, 30, 1050, 620
    lo, hi = 0.5, 3000

    def X(v: float) -> float:
        return L + (math.log10(v) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)) * PW

    def Yb(n: float) -> float:
        return T + PH - n / TOP * PH

    o = [f'<svg width="{W}" height="{H + 40}" viewBox="0 0 {W} {H + 40}" font-size="13">']
    for v, tick in [(1, "$1"), (10, "$10"), (100, "$100"), (1000, "$1,000")]:
        o += [
            vline(X(v), T, T + PH),
            text(X(v), T + PH + 22, tick, text_anchor="middle", fill="#5a6670"),
        ]
    for n in range(TOP + 1):
        o += [
            hline(L, L + PW, Yb(n), "#c9c3b0" if n == 8 else "#ece8dc"),
            text(
                L - 12,
                Yb(n) + 4,
                LV[n],
                text_anchor="end",
                fill="#5a6670",
                font_weight="700" if n > 8 else "400",
            ),
        ]
    o.append(
        text(
            L + PW / 2,
            T + PH + 50,
            "API cost to the furthest milestone (log scale)",
            text_anchor="middle",
            fill="#44525e",
            font_size="14",
        )
    )
    o.append(progress_label(22, T + PH / 2))
    for ln in lines:
        if ln.usd is None:
            continue
        x, y = X(ln.usd), Yb(ln.end[0])
        o.append(end_point(x, y, "9", ln, "3"))
        dx, dy, an = ln.label_offset or (14, 0, "start")
        o.append(
            text(
                x + dx,
                y + dy + 4,
                ln.label,
                fill=ln.color,
                font_weight="700",
                font_size="14",
                text_anchor=an,
            )
        )
        o.append(
            text(
                x + dx,
                y + dy + 22,
                f"${ln.usd:,.2f}" + (" (estimated)" if ln.estimated else ""),
                fill="#5a6670",
                text_anchor=an,
            )
        )
    o.append("</svg>")
    return finish(notes, o)


def build_pages(chart_data: Mapping[str, object], points: Mapping[str, object]) -> dict[str, str]:
    human, lines = lines_from(chart_data, points)
    pages = as_map(chart_data.get("pages"), "chart-data pages")
    return {
        TIME_HTML: time_chart(human, lines, as_map(pages.get("badges_over_time"), "time page")),
        MONEY_HTML: money_chart(lines, as_map(pages.get("badges_for_the_money"), "money page")),
    }


# ---------------------------------------------------------------- disk boundary


class Store(Protocol):
    def read(self, rel: str) -> str: ...
    def write(self, rel: str, body: str) -> None: ...


class DiskStore:  # pragma: no cover - the disk boundary; logic is tested in memory
    def __init__(self, root: Path, runs_root: Path) -> None:
        self.root = root
        self.runs_root = runs_root

    def read(self, rel: str) -> str:
        return (self.root / rel).read_text(encoding="utf-8")

    def write(self, rel: str, body: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")

    def _run(self, run: str) -> Path:
        path = self.runs_root / run
        if not path.is_dir():
            raise ChartError(f"no run folder {path}")
        return path

    def events(self, run: str) -> Iterable[str]:
        with open(self._run(run) / "events.jsonl", encoding="utf-8", errors="ignore") as f:
            yield from f

    def codex_native(self, run: str) -> Iterable[str]:
        with open(
            self._run(run) / "attached-harness/codex/native.jsonl",
            encoding="utf-8",
            errors="ignore",
        ) as f:
            yield from f


def dump(doc: Mapping[str, object]) -> str:
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


USAGE = "usage: readme_charts (points | html | check-points)"


STAGES = ("points", "html", "check-points")


def load(store: Store, rel: str) -> dict[str, object]:
    try:
        doc = json.loads(store.read(rel))
    except json.JSONDecodeError as err:
        raise ChartError(f"{rel} is not JSON: {err}") from err
    return as_map(doc, rel)


def run(argv: Sequence[str], store: Store, runs: Runs, say: Callable[[str], None]) -> int:
    if len(argv) != 1:
        say(USAGE)
        return 2
    if argv[0] not in STAGES:
        say(f"error: unknown stage {argv[0]!r}; {USAGE}")
        return 2
    try:
        chart_data = load(store, CHART_DATA)
        if argv[0] in ("points", "check-points"):
            fresh = dump(build_points(chart_data, load(store, PRICES), runs))
            if argv[0] == "check-points":
                if fresh != store.read(POINTS):
                    say(f"{POINTS} differs from the run logs; run `just readme-charts`")
                    return 1
                say(f"{POINTS} matches the run logs")
                return 0
            store.write(POINTS, fresh)
            say(f"wrote {POINTS}")
            return 0
        for rel, body in build_pages(chart_data, load(store, POINTS)).items():
            store.write(rel, body)
            say(f"wrote {rel}")
        return 0
    except ChartError as err:
        say(f"error: {err}")
        return 1


def main() -> None:  # pragma: no cover - entrypoint
    import os

    root = Path.cwd()
    runs_root = Path(os.environ.get("POKEBENCH_RUNS_ROOT", root / "runs"))
    store = DiskStore(root, runs_root)
    sys.exit(run(sys.argv[1:], store, store, print))


if __name__ == "__main__":  # pragma: no cover
    main()
