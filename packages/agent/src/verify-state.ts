// A bounded, deterministic button protocol; screenshots are recorded by the
// ordinary probe recorder for each checkpoint, and checked beside RAM fields.
import type { StateSource, GameStateSnapshot } from "./game-state.js";
import type { ProbeCommand } from "./probe.js";

export function verifyPreGame(state: GameStateSnapshot): void {
  if (state.started || state.name !== null || state.position !== null || state.location !== null || state.money !== null || state.party.length !== 0) {
    throw new Error(`pre-game data is not empty: ${JSON.stringify(state)}`);
  }
}

export function verifyTruck(state: GameStateSnapshot): void {
  if (!state.started || state.screen !== "overworld" || state.location !== "INSIDE OF TRUCK" || state.map_id?.[0] !== 25 || state.map_id[1] !== 40 || state.money !== 3000 || state.party.length !== 0 || state.badges.length !== 0 || state.name?.trim() === "" || state.name === null || state.position === null || state.field_controls_locked !== true) {
    throw new Error(`truck checkpoint mismatch: ${JSON.stringify(state)}`);
  }
}

export async function* verifyIntro(
  source: StateSource,
  report: (label: string, state: GameStateSnapshot) => void,
  limit = 160,
  settle: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000)),
): AsyncGenerator<ProbeCommand> {
  const seen = new Set<string>();
  for (let step = 0; step < limit; step++) {
    const state = await source.read();
    if (state.started) {
      verifyTruck(state);
      for (const screen of ["title", "main_menu", "birch_speech", "naming"]) {
        if (!seen.has(screen)) throw new Error(`verification missed ${screen} checkpoint`);
      }
      await settle();
      const settled = await source.read();
      verifyTruck(settled);
      report("truck", settled);
      yield { action: "observe" };
      yield { action: "end" };
      return;
    }
    verifyPreGame(state);
    if (!seen.has(state.screen)) {
      await settle();
      seen.add(state.screen); report(state.screen, await source.read());
      yield { action: "observe" };
    }
    yield { action: "press", buttons: ["A"] };
  }
  throw new Error(`intro did not reach truck within ${String(limit)} presses`);
}
