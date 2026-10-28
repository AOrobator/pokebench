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
    out = ['<section id="whole-game-check"><h2>Whole-game check</h2>',
           '<div class="card"><p><strong>Deterministic offline stress check, not a gameplay run.</strong> '
           '58 story steps run from Littleroot through the Hall of Fame and an optional Rayquaza encounter. '
           '78 fixed NPC fillers include three sampled progression hints per region. A separate six-sign rehearsal preserves unattributed source text in all four modes without changing that main stream. Seed: 20261028. '
           'Only pret text is delivered; the NPC inventory supplies source keys and category labels, not walkthrough prose.</p>'
           '<p>The 16,000-code-point cap, current instruction (including an existing exact episode), and completed-episode retirement '
           'are checked in all four modes. The printed-name correction preserves DAD and distinguishes TATE/LIZA pages.</p>'
           '<p><strong>Greedy whole-episode packing is fragile:</strong> correcting one speaker label by one character moved which steps lose a hint. Pinned step names describe this snapshot, not a stable property. With whole-game ON and dedup ON, '
           'MossdeepCity_Text_StevensHouseOverThere is left out at aqua-hideout and tate-liza. '
           'All other tested treatment steps retain the sampled current/next-region hints. '
           'Those exact two exceptions are pinned; there is no blanket exception for the hint or its region. '
           'A cap-ranking follow-up is proposed separately and is not built or activated here.</p>'
           '<p>Legacy controls first lose an active hint at Winona (dedup ON) and submarine theft (dedup OFF). '
           'These are expected control failures, not evidence that the treatment satisfies every retention goal. '
           'No model, GPU, game server or gameplay benefit is measured.</p></div>',
           '<p>Each table has one row per story step, before its new completion milestones. '
           '“Left out” includes both native-completed and over-budget episodes. The linked JSON preserves the exact block shown.</p>']
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
    out.append('<details><summary>Source and limits</summary><p>pret/pokeemerald '
               '731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; checked-in whole-game-script.json; '
               'whole-game-stream.ts validates each emitted event once. Every pret file is read once per loader invocation. '
               'NPC sampling is fixed, not exhaustive. This minimal synthetic readout includes Location and a current quoted '
               'instruction, and deliberately supplies no simulated connectivity/warp observations. Its omissions establish '
               'a reproducible memory-pressure limit, not a frequency estimate for live runs. The fixture does not reconstruct '
               'native frames or prove model learning, capture success, or story progress.</p></details></section>')
    return "\n".join(out)
