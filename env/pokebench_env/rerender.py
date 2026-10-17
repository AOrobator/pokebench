"""Re-render recorded readouts from a run's raw-RAM archive under a server feature set.

The live server decodes RAM with `read_state` and formats it with `render`; this module owns
both, so a probe that re-renders a recorded turn under other switches runs the server's code.
Input (stdin JSON): {"run_dir": str, "raw_ram": [{"path": str, "sha256": str}, ...]}.
Switches come from the environment the server reads (POKEBENCH_FEATURES_OFF, POKEBENCH_ACTIVE_UI).
blackout-readout-v1's once-only field line comes from the live server's frame latch, which a
single archive cannot carry; a re-render shows only the line read from its own state.
Output (stdout JSON): {"readouts": [str, ...]} in input order.
"""

import json
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import TextIO

from pokebench_env.blackout_readout import Whiteout
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames, read_game_state
from pokebench_env.heal_trainers import SWITCH as HEAL_TRAINERS
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import features_off_from_env, format_readout
from pokebench_env.rom import resolve_rom
from pokebench_env.screen_settle import WARP_FEATURE, warp_animating
from pokebench_env.surf_gate import SWITCH as SURF_GATE
from pokebench_env.ui_state import active_ui_enabled_from_env

PORYMAP_MAPS = (
    Path(__file__).resolve().parents[1] / "vendor/continual-harness/pokemon_env/porymap/data/maps"
)


def read_state(
    read: ReadMemory, maps: MapNames, *, active_ui: bool, off: frozenset[str]
) -> GameState:
    return read_game_state(
        read,
        maps,
        active_ui_enabled=active_ui,
        message_phase_enabled="field-dialogue-phase-v1" not in off,
        full_map_enabled="full-map-navigation-v1" not in off,
        story_characters_enabled="character-presence-v1" not in off,
        # battle-triage-guidance-v1 acts on battle-details-v2's RUN verdict, so either reads it.
        battle_details_enabled=not {"battle-details-v2", "battle-triage-guidance-v1"} <= off,
        dynamic_warp_enabled="named-warp-destinations-v1" not in off,
        displayed_names_enabled="displayed-place-names-v1" not in off,
        connection_edges_enabled="connection-edge-tiles-v1" not in off,
        in_game_naming_enabled="in-game-naming-readout-v1" not in off,
        offscreen_objects_enabled="offscreen-objects-v1" not in off,
        transition_coherence_enabled="transition-coherence-v1" not in off,
        readout_truth_enabled="readout-truth-v1" not in off,
        birch_pages_enabled="birch-speech-pages-v1" not in off,
        surf_gate_enabled=SURF_GATE not in off,
        heal_trainers_enabled=HEAL_TRAINERS not in off,
    )


def render(
    state: GameState,
    off: frozenset[str],
    *,
    warp_animation: bool = False,
    whiteout: Whiteout | None = None,
) -> str:
    return format_readout(
        state,
        off,
        named_interactions="named-interactions-v1" not in off,
        world_destinations="world-destinations-v1" not in off,
        bounded_navigation="bounded-navigation-v1" not in off,
        message_phase="field-dialogue-phase-v1" not in off,
        named_warps="named-warp-destinations-v1" not in off,
        warp_animation=warp_animation,
        adjacent_tiles="adjacent-tiles-v1" not in off,
        rules_in_prompt="readout-rules-in-prompt-v1" not in off,
        whiteout=whiteout,
    )


class RawRef:
    def __init__(self, path: str, sha256: str) -> None:
        self.path = path
        self.sha256 = sha256


def parse_request(text: str) -> tuple[Path, list[RawRef]]:
    body = json.loads(text)
    if (
        not isinstance(body, dict)
        or not isinstance(body.get("run_dir"), str)
        or not isinstance(body.get("raw_ram"), list)
    ):
        raise ValueError("request must be {run_dir: str, raw_ram: [{path, sha256}, ...]}")
    refs: list[RawRef] = []
    for item in body["raw_ram"]:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("path"), str)
            or not isinstance(item.get("sha256"), str)
        ):
            raise ValueError(f"bad raw_ram reference: {item!r}")
        path = Path(item["path"])
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"raw_ram path must stay inside the run directory: {item['path']}")
        refs.append(RawRef(item["path"], item["sha256"]))
    return Path(body["run_dir"]), refs


Loader = Callable[[Path, str], ReadMemory]


def rerender(
    run_dir: Path, refs: Sequence[RawRef], load: Loader, maps: MapNames, env: Mapping[str, str]
) -> list[str]:
    off = features_off_from_env(env)
    active_ui = active_ui_enabled_from_env(env)

    def one(read: ReadMemory) -> str:
        animation = WARP_FEATURE not in off and warp_animating(read)
        return render(
            read_state(read, maps, active_ui=active_ui, off=off), off, warp_animation=animation
        )

    return [one(load(run_dir / ref.path, ref.sha256)) for ref in refs]


def main(env: Mapping[str, str], stdin: TextIO, stdout: TextIO) -> int:
    run_dir, refs = parse_request(stdin.read())
    rom = resolve_rom(env).read_bytes()

    def load(path: Path, sha256: str) -> ReadMemory:
        return load_raw_ram(path, sha256, rom=rom)

    json.dump({"readouts": rerender(run_dir, refs, load, MapNames.load(PORYMAP_MAPS), env)}, stdout)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(os.environ, sys.stdin, sys.stdout))
