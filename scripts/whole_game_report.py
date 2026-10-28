"""Offline section for the instruction-memory report; reads synthetic check receipts."""
import html
import json
from pathlib import Path

MODES = (
    ("Whole-game ON, dedup ON", "whole-game-whole-dedup.json"),
    ("Whole-game ON, dedup OFF", "whole-game-whole-split.json"),
    ("Legacy checkpoints, dedup ON", "whole-game-legacy-dedup.json"),
    ("Legacy checkpoints, dedup OFF", "whole-game-legacy-split.json"),
)


def html_section(data_root=None):
    root = Path(data_root) if data_root is not None else Path(__file__).parent
    if any(not (root / name).is_file() for _, name in MODES):
        return '<section><h2>Whole-game check</h2><p>Synthetic check data unavailable; no result is claimed.</p></section>'
    esc = lambda value: html.escape(str(value))
    out = ['<section id="whole-game-check"><style>#whole-game-check{font:14px/1.5 system-ui,sans-serif;scroll-margin-top:48px}#whole-game-check table{min-width:900px;border-collapse:collapse;font:13px/1.35 system-ui,sans-serif}#whole-game-check td{padding:8px;vertical-align:top}#whole-game-check td:first-child{min-width:145px}#whole-game-check th{padding:8px}</style><h2>Whole-game check</h2>',
           '<div class="card"><p><strong>A one-character speaker correction moved which steps lost a hint.</strong> '
           'Greedy whole-episode packing is fragile. These pinned steps describe one snapshot.</p>'
           '<p>Offline: 58 story steps, 78 NPC fillers, six separate signs, four modes, a 16,000-code-point cap. '
           'No gameplay benefit is measured.</p>'
           '<p>With whole-game ON and dedup ON, the Steven-house hint is left out at Aqua Hideout and Tate/Liza. '
           'Other tested treatment steps retain the sampled active hints. The ranking follow-up is not built.</p></div>',
           '<p>One row per story step, before new completion milestones. Left out includes completed and over-budget episodes.</p>']
    for index, (label, name) in enumerate(MODES):
        rows = json.loads((root / name).read_text())
        if not isinstance(rows, list) or not rows:
            raise ValueError("empty or malformed whole-game receipt")
        if any(not isinstance(row, dict) or not isinstance(row.get("chars"), int)
               or row["chars"] > 16000 for row in rows):
            raise ValueError("invalid whole-game character receipt")
        lost = sum(bool(row["missing_hints"]) for row in rows)
        out.append(f'<details{" open" if index == 0 else ""}><summary>{esc(label)}: '
                   f'{len(rows)} steps, {lost} steps with a sampled hint left out</summary>'
                   f'<p><a href="whole-game/{esc(name)}">Exact per-step blocks and evidence</a></p>'
                   '<div style="overflow-x:auto"><table><thead><tr><th>Story step</th><th>Code points</th>'
                   '<th>Kept</th><th>Left out</th><th>Active hints left out</th><th>Speakers kept</th></tr></thead><tbody>')
        for row in rows:
            speakers = ", ".join("(unattributed)" if who is None else who for who in row["speakers"])
            missing = ", ".join(row["missing_hints"]) or "none"
            out.append(f'<tr><td>{esc(row["id"])}</td><td>{row["chars"]:,}</td>'
                       f'<td>{row["episodes_kept"]}</td><td>{row["episodes_left_out"]}</td>'
                       f'<td>{esc(missing)}</td><td style="min-width:18em;max-width:28em;white-space:normal">{esc(speakers)}</td></tr>')
        out.append('</tbody></table></div></details>')
    out.append('<details><summary>Source and limits</summary><p>58 story steps run from Littleroot through the '
               'Hall of Fame and an optional Rayquaza encounter. The 78 fixed NPC fillers include three sampled progression '
               'hints per region; the separate six-sign rehearsal leaves that main stream unchanged. Seed:20261028. '
               'Only pret text is delivered. Inventory category labels stay offline; no walkthrough prose is used.</p>'
               '<p>The hard cap, current instruction (or existing exact episode), and closed-episode retirement are checked '
               'in all four modes. Printed DAD and individual TATE/LIZA pages retain their source attribution. '
               'Exactly two ON/dedup-ON hint exceptions are pinned, with no broader exemption by hint or region. '
               'Legacy controls first lose an active hint at Winona (dedup ON) and submarine theft (dedup OFF). '
               'The linked JSON preserves the exact memory blocks. No model, GPU, game server or activation is involved.</p>'
               '<p>pret/pokeemerald '

               '731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; checked-in whole-game-script.json; '
               'whole-game-stream.ts validates each emitted event once. Every pret file is read once per loader invocation. '
               'NPC sampling is fixed, not exhaustive. This minimal synthetic readout includes Location and a current quoted '
               'instruction, and deliberately supplies no simulated connectivity/warp observations. Current/next-region filler is introduced early to stress memory; its visits do not reconstruct a legal route. Each source label is one episode, while real tool calls can span several labels. Its omissions establish '
               'a reproducible memory-pressure limit, not a frequency estimate for live runs. The fixture does not reconstruct '
               'native frames or prove model learning, capture success, or story progress.</p></details></section>')
    return "\n".join(out)
