"""Build the README charts as HTML (render each #c element to PNG at 2x with any headless browser).

Every time and badge below is read from runs/<id>/events.jsonl by audit_runs.py: milestone time minus
run_start, unassisted Opus stitched at the checkpoint each leg loaded (6302, 1121, 69d8, d718), first
DEFEATED event for each Elite Four member. Costs: Opus from its gateway session records, Astra and Sol
from Codex token counts, DeepSeek from recorded tokens at list price, local models (estimated) at the
cheapest OpenRouter provider as of 11/8. keepingiticy's splits are from his world-record video.
"""

import math
import html


def hms(s):
    s = int(s)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def sec(t):
    h, m, s = map(int, t.split(":"))
    return h * 3600 + m * 60 + s


TOP = 14
LV = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "Sidney",
    "Phoebe",
    "Glacia",
    "Drake",
    "Champion",
    "Hall of Fame",
]


def reach(b):
    return [(i + 1, x) for i, x in enumerate(b) if x]


def endlabel(b):
    n = reach(b)[-1][0]
    return (
        (f"{n} badge" + ("s" if n > 1 else ""))
        if n <= 8
        else (
            "Hall of Fame"
            if n == 14
            else "Champion"
            if n == 13
            else f"{n - 8} of the Elite Four"
        )
    )


# (label, color, assisted, [(badge, seconds)], cost_to_last_badge, cost_note, extra)
S = [
    (
        "Claude Opus 5.5",
        "#1a9a6c",
        False,
        [
            "0:53:30",
            "1:50:14",
            "3:06:15",
            "5:11:03",
            "5:55:53",
            "8:07:03",
            "10:52:18",
            "13:04:50",
            "15:02:10",
            "15:08:41",
            "16:21:51",
        ],
        679.16,
        "",
    ),
    (
        "Claude Opus 5.5, Rayquaza lane*",
        "#16405e",
        True,
        [
            "0:50:49",
            "3:32:34",
            "4:15:14",
            "5:45:38",
            "6:14:01",
            "8:15:14",
            "11:20:12",
            "14:07:12",
            "16:21:05",
            "16:27:22",
            "16:53:52",
            "17:01:28",
            "17:14:01",
            "17:16:02",
        ],
        780.00,
        "",
    ),
    (
        "DeepSeek V4.1 Flash",
        "#2a72d8",
        False,
        ["0:49:46", "1:55:11", "3:37:00", "6:27:41", "7:07:01"],
        9.56,
        "",
    ),
    (
        "GPT-6 Astra",
        "#6a4fd6",
        False,
        ["1:53:45", "3:53:51", "6:07:17", "10:56:47"],
        718.54,
        "",
    ),
    ("GPT-6.1 Sol", "#8a8f98", False, ["3:26:53", "9:32:15", "11:56:39"], 149.92, ""),
    (
        "Qwen3.6 35B-A3B",
        "#e8692c",
        False,
        ["3:39:49", "11:57:42", "19:57:57"],
        2.94,
        "est",
    ),
    (
        "Qwen3.6 35B-A3B, Rayquaza lane*",
        "#e8692c",
        True,
        ["0:43:02", "4:12:54", "13:24:29", "13:54:30", "20:13:46"],
        2.82,
        "est",
    ),
    ("GLM-5.3 Flash", "#9a6a3a", False, ["5:53:28", "22:08:46"], 2.85, "est"),
    ("Qwen3.8 27B", "#c8409a", False, ["2:15:15"], 1.04, "est"),
    (
        "Qwen3.8 27B, Rayquaza lane*",
        "#c8409a",
        True,
        ["1:10:47", "9:19:19", "16:02:31", "17:21:49"],
        6.09,
        "est",
    ),
]
HUMAN = (
    "Human: keepingiticy (world record)",
    "#d83a3a",
    [
        "0:17:29",
        "0:42:22",
        "0:56:21",
        "0:59:53",
        "1:05:56",
        "1:26:00",
        "1:46:57",
        "2:11:01",
        None,
        None,
        None,
        None,
        "2:28:39",
        "2:29:44",
    ],
)
CSS = """body{margin:0;background:#f7f3e8;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#24323d}
.card{margin:18px;border:4px solid #2c5f55;border-radius:30px;padding:6px;background:#2c5f55}
.in{background:#fff;border:5px solid #5ab89c;border-radius:24px;padding:28px 34px 22px}
h1{font-size:30px;margin:4px 0 6px}p{margin:0;color:#44525e;font-size:15px;line-height:1.45}.note{margin-top:8px;font-size:13.5px}"""


def page(title, sub, svg, notes):
    return (
        f'<!doctype html><meta charset="utf-8"><style>{CSS}</style><div class="card" id="c"><div class="in"><h1>{title}</h1><p>{sub}</p>{svg}'
        + "".join(f'<p class="note">{html.escape(n)}</p>' for n in notes)
        + "</div></div>"
    )


def t(x, y, s, **k):
    a = " ".join(f'{kk.replace("_", "-")}="{v}"' for kk, v in k.items())
    return f'<text x="{x:.1f}" y="{y:.1f}" {a}>{html.escape(s)}</text>'


# ---- time chart
W, H = 1240, 760
L, T, PW, PH = 110, 24, 700, 680


def X(s):
    return L + s / 86400 * PW


def Y(n):
    return T + PH - n / TOP * PH


o = [f'<svg width="{W}" height="{H + 50}" viewBox="0 0 {W} {H + 50}" font-size="13">']
for n in range(TOP + 1):
    o += [
        f'<line x1="{L}" x2="{L + PW}" y1="{Y(n)}" y2="{Y(n)}" stroke="{"#c9c3b0" if n == 8 else "#ece8dc"}"/>',
        t(
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
        f'<line x1="{X(h * 3600)}" x2="{X(h * 3600)}" y1="{T}" y2="{T + PH}" stroke="#ece8dc"/>',
        t(X(h * 3600), T + PH + 20, f"{h}h", text_anchor="middle", fill="#5a6670"),
    ]
o.append(
    t(
        L + PW / 2,
        T + PH + 46,
        "Hours from the start of the run",
        text_anchor="middle",
        fill="#44525e",
        font_size="14",
    )
)
o.append(
    f'<text transform="translate(18 {T + PH / 2}) rotate(-90)" text-anchor="middle" fill="#44525e" font-size="14">Progress</text>'
)
rows = [(HUMAN[0], HUMAN[1], False, HUMAN[2], None, "")] + S
for name, c, a, b, _, _ in rows:
    pts = [(n, sec(x)) for n, x in reach(b)]
    s = [v for _, v in pts]
    d = f"M{X(0)},{Y(0)}"
    for n, v in pts:
        d += f" H{X(v):.1f} V{Y(n):.1f}"
    dash = 'stroke-dasharray="3 4"' if a else ""
    o.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2.6" {dash}/>')
    for n, v in [q for q in pts[:-1] if q[0] <= 8]:
        o.append(f'<circle cx="{X(v):.1f}" cy="{Y(n):.1f}" r="2.6" fill="{c}"/>')
    o.append(
        f'<circle cx="{X(s[-1]):.1f}" cy="{Y(pts[-1][0]):.1f}" r="6.5" fill="{"#fff" if a else c}" stroke="{c}" stroke-width="2.6"/>'
    )
# legend sorted by badges desc then time asc
leg = sorted(rows, key=lambda r: (-reach(r[3])[-1][0], sec(reach(r[3])[-1][1])))
ly = T + 6
for name, c, a, b, _, ex in leg:
    o.append(t(L + PW + 24, ly + 4, name, fill=c, font_weight="700", font_size="13.5"))
    o.append(t(W - 8, ly + 4, f"{reach(b)[-1][1]}", text_anchor="end", fill="#44525e"))
    ex = endlabel(b)
    if ex:
        ly += 17
        o.append(t(L + PW + 24, ly + 4, ex, fill="#5a6670", font_size="12"))
    ly += 27
o.append("</svg>")
open("badges-over-time.html", "w").write(
    page(
        "Badges over time",
        "Each step is a gym badge, then each Elite Four member and the Champion beaten, at the time it happened. Every model’s best run, against keepingiticy’s English-language world record.",
        "\n".join(o),
        [
            "* Heavily assisted: the Rayquaza lane adds a just-in-time guide to the harness. Dotted lines and hollow end points are lane runs.",
            "keepingiticy’s Elite Four splits aren’t marked; the line runs from the Rain Badge to the Champion at 2:28:39. Unassisted Opus ran out of time against Drake.",
            "Unassisted Qwen3.6, Qwen3.8 and GLM start from a main-menu save with fast text already set; every other run, the Rayquaza lane runs included, starts from power-on. Unassisted Opus is one chain of four linked legs, stitched at the checkpoints each leg loaded.",
        ],
    )
)
# ---- money chart
W, H = 1240, 700
L, T, PW, PH = 120, 30, 1050, 620
lo, hi = 0.5, 3000


def X(v):
    return L + (math.log10(v) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)) * PW


o = [f'<svg width="{W}" height="{H + 40}" viewBox="0 0 {W} {H + 40}" font-size="13">']
for v, tick in [(1, "$1"), (10, "$10"), (100, "$100"), (1000, "$1,000")]:
    o += [
        f'<line x1="{X(v)}" x2="{X(v)}" y1="{T}" y2="{T + PH}" stroke="#ece8dc"/>',
        t(X(v), T + PH + 22, tick, text_anchor="middle", fill="#5a6670"),
    ]
o += sum(
    [
        [
            f'<line x1="{L}" x2="{L + PW}" y1="{T + PH - n / TOP * PH}" y2="{T + PH - n / TOP * PH}" stroke="{"#c9c3b0" if n == 8 else "#ece8dc"}"/>',
            t(
                L - 12,
                T + PH - n / TOP * PH + 4,
                LV[n],
                text_anchor="end",
                fill="#5a6670",
                font_weight="700" if n > 8 else "400",
            ),
        ]
        for n in range(TOP + 1)
    ],
    [],
)
o.append(
    t(
        L + PW / 2,
        T + PH + 50,
        "API cost to the furthest milestone (log scale)",
        text_anchor="middle",
        fill="#44525e",
        font_size="14",
    )
)
o.append(
    f'<text transform="translate(22 {T + PH / 2}) rotate(-90)" text-anchor="middle" fill="#44525e" font-size="14">Progress</text>'
)


def Yb(n):
    return T + PH - n / TOP * PH


# label placement: (dx, dy_name, anchor)
POS = {
    "Claude Opus 5.5": (-16, -6, "end"),
    "Claude Opus 5.5, Rayquaza lane*": (-16, -6, "end"),
    "GPT-6 Astra": (-14, -10, "end"),
    "Qwen3.6 35B-A3B, Rayquaza lane*": (-14, -10, "end"),
    "Qwen3.6 35B-A3B": (-16, -6, "end"),
    "GLM-5.3 Flash": (14, -8, "start"),
    "Qwen3.8 27B, Rayquaza lane*": (14, -10, "start"),
}
for name, c, a, b, usd, est in S:
    x, y = X(usd), Yb(reach(b)[-1][0])
    o.append(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="{"#fff" if a else c}" stroke="{c}" stroke-width="3"/>'
    )
    dx, dy, an = POS.get(name, (14, 0, "start"))
    o.append(
        t(
            x + dx,
            y + dy + 4,
            name,
            fill=c,
            font_weight="700",
            font_size="14",
            text_anchor=an,
        )
    )
    o.append(
        t(
            x + dx,
            y + dy + 22,
            f"${usd:,.2f}" + (" (estimated)" if est else ""),
            fill="#5a6670",
            text_anchor=an,
        )
    )
o.append("</svg>")
open("badges-for-the-money.html", "w").write(
    page(
        "Badges for the money",
        "Each model’s best run: how far it got (gym badges, then the Elite Four and Champion) against what the tokens would have cost at API prices, up to that point.",
        "\n".join(o),
        [
            "* Heavily assisted (Rayquaza lane), shown as hollow points. Unassisted Opus’s cost is up to Glacia, the third of the Elite Four.",
            "Prices: frontier models at their API list prices (Opus from its gateway session records; Astra and Sol from Codex token counts; DeepSeek from recorded tokens at OrcaRouter’s list price). Local models (estimated) use the same prices as the article: the cheapest OpenRouter provider for each model as of 11/8.",
        ],
    )
)
