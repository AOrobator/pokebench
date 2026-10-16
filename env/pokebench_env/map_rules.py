"""The fixed map rules: one owner for the readout and the system prompt.

The map legend, the terrain rule, the warp-destination note and the trigger-elevation rule are
the same every turn of a run. live_map.py and world_context.py print them from these strings.
With readout-rules-in-prompt-v1 the readout drops them and the agent's system prompt states
them once: `prompt_section(off)` composes that section from the same strings, and
`just map-rules` writes every switch combination to packages/agent/src/map-rules.generated.ts,
which the agent looks up by the same off set the server reads. A test fails when it is stale.
"""

import itertools
import json
import sys
from collections.abc import Sequence
from pathlib import Path

FEATURE = "readout-rules-in-prompt-v1"
POINTER = "Map symbols and rules: see the system prompt."
SECTION_HEADER = (
    "Map symbols and rules (the readout's map and lists use these every turn;"
    " the readout does not repeat them):"
)
TERRAIN_RULE = "Terrain rules, elevation and objects can still block movement."
TRIGGER_ELEVATION_RULE = (
    "Trigger elevation must also match the player on entry (0 matches any elevation)."
)
_COUNTER = (
    "= counter: you cannot walk onto it, but you can talk to someone standing"
    " behind it by facing the counter and pressing A"
)
# A counter is drawn only on maps that have one, so its legend stays in that readout.
COUNTER_LINE = f"{_COUNTER}."

# The switches the section depends on, in key order for the generated table.
MAP_RULE_SWITCHES = (
    "live-map-v1",
    "warp-activation-guidance-v1",
    "ledge-hops-v1",
    "one-way-tiles-v1",
    "full-map-navigation-v1",
    "named-warp-destinations-v1",
    "coordinate-script-conditions-v1",
)


def legend(
    *,
    warp_guidance: bool,
    counters: bool,
    ledges: bool,
    edge_walls: bool,
    outside: bool,
    in_prompt: bool = False,
) -> str:
    # In the prompt nothing is "below": the parentheticals name the readout line instead.
    warps = (
        "(each warp's activation is listed in the readout's Warps line)"
        if in_prompt
        else "(see activation below)"
    )
    sides = (
        "(sides listed in the readout's Edge walls line)"
        if in_prompt
        else "(sides listed under Edge walls)"
    )
    return (
        (
            f"@ player; N live object; W warp location {warps};"
            if warp_guidance
            else "@ player; N live object; W warp;"
        )
        + " # collision; g grass; ~ water;"
        + (f" {_COUNTER};" if counters else "")
        + (
            " v ^ < > ledge: a one-way hop in the arrow's direction (move into it that way to"
            " jump over it, landing 2 tiles on); impassable from any other side;"
            if ledges
            else ""
        )
        + (
            " + edge walls: walkable, but movement across a walled side is refused in both"
            f" directions {sides};"
            if edge_walls
            else ""
        )
        + (
            " . clear terrain (may have script triggers); ? outside current map."
            if outside
            else " . clear terrain (may have script triggers)."
        )
    )


def warp_note(*, named: bool) -> str:
    return (
        (
            "Warp destinations are the map you arrive on: its name when the game's map"
            " table has one, then its group/number ID in parentheses; not warp indexes."
            if named
            else "Warp destinations are map group/number IDs, not warp indexes."
        )
        + " Activation also"
        " requires matching elevation and available field controls; W alone does not"
        " guarantee a transition. After a transition, check the new map and position."
    )


def prompt_section(off: frozenset[str]) -> str:
    """The system-prompt section for a run whose server switches `off` are off."""
    blocks = []
    if "live-map-v1" not in off:
        guidance = "warp-activation-guidance-v1" not in off
        blocks += [
            legend(
                warp_guidance=guidance,
                counters=False,
                ledges="ledge-hops-v1" not in off,
                edge_walls="one-way-tiles-v1" not in off,
                outside="full-map-navigation-v1" in off,
                in_prompt=True,
            ),
            TERRAIN_RULE,
        ]
        if guidance:
            blocks.append(warp_note(named="named-warp-destinations-v1" not in off))
    if "coordinate-script-conditions-v1" not in off:
        blocks.append(TRIGGER_ELEVATION_RULE)
    return "\n".join([SECTION_HEADER, *blocks]) if blocks else ""


def render_ts() -> str:
    texts: list[str] = []
    index: dict[str, int] = {}
    for bits in itertools.product((False, True), repeat=len(MAP_RULE_SWITCHES)):
        off = tuple(s for s, is_off in zip(MAP_RULE_SWITCHES, bits, strict=True) if is_off)
        text = prompt_section(frozenset(off))
        if text not in texts:
            texts.append(text)
        index[",".join(off)] = texts.index(text)
    return (
        "// Generated by `just map-rules` from env/pokebench_env/map_rules.py; do not edit.\n"
        "// The readout-rules-in-prompt-v1 system-prompt section for every combination of\n"
        '// MAP_RULE_SWITCHES, keyed by the ones that are off, in this order, joined by ",".\n'
        "export const MAP_RULE_SWITCHES = " + json.dumps(list(MAP_RULE_SWITCHES)) + " as const;\n"
        "export const MAP_RULE_TEXTS: readonly string[] = [\n"
        + ",\n".join(f"  {json.dumps(text, ensure_ascii=False)}" for text in texts)
        + "\n];\n"
        "export const MAP_RULE_INDEX: Readonly<Record<string, number>> = {\n"
        + ",\n".join(f"  {json.dumps(key)}: {i}" for key, i in index.items())
        + "\n};\n"
    )


def main(argv: Sequence[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m pokebench_env.map_rules <out.ts>", file=sys.stderr)
        return 2
    Path(argv[0]).write_text(render_ts())
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
