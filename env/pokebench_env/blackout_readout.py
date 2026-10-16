"""blackout-readout-v1: say once in the readout that the player whited out.

pret/pokeemerald 731ad5bf src/overworld.c: CB2_WhiteOut (US ROM 0x08085F59) runs for 120
frames, then DoWhiteOut halves SaveBlock1.money, heals the party and warps to the last
heal location (SetWarpDestinationToLastHealLocation). No field text follows
(FieldCB_WarpExitFadeFromBlack), so without this line the model sees only a new room.

The latch watches gMain.callback2 after every emulated frame (the vendor frame loop, under
its memory lock) and keeps the money read on the first whiteout frame. The first
observation back on the field reports it and clears it. While CB2_WhiteOut runs, the
readout says so from that observation's own state.
"""

import struct
import threading
from dataclasses import dataclass

from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.game_state import SAVE_BLOCK_PTRS, GameState
from pokebench_env.screen_settle import SteppedEmulator

SWITCH = "blackout-readout-v1"
CB2_WHITE_OUT = 0x08085F59
MONEY = 0x490
ENCRYPTION_KEY = 0xAC

WHITING_OUT = (
    "Whiting out: your party has no usable Pokémon left; the game is taking you back "
    "to the last place you healed."
)


@dataclass(frozen=True)
class Whiteout:
    money_before: int | None


def _money(read: ReadMemory) -> int | None:
    save1, save2 = struct.unpack("<II", read(SAVE_BLOCK_PTRS, 8))
    if not (
        0x02000000 <= save1 <= 0x02040000 - (MONEY + 4)
        and 0x02000000 <= save2 <= 0x02040000 - (ENCRYPTION_KEY + 4)
    ):
        return None
    money = int.from_bytes(read(save1 + MONEY, 4), "little")
    return money ^ int.from_bytes(read(save2 + ENCRYPTION_KEY, 4), "little")


def whiteout_line(event: Whiteout, state: GameState) -> str:
    place = state.location or "the last place you healed"
    money = (
        f"halved your money: ₽{event.money_before} → ₽{state.money}"
        if event.money_before is not None and state.money is not None
        else "halved your money"
    )
    return (
        "Whited out: your party had no usable Pokémon left, so the game took you back to "
        f"{place} (the last place you healed), healed your party and {money}."
    )


class WhiteoutLatch:
    def __init__(self, read: ReadMemory) -> None:
        self.read = read
        self._lock = threading.Lock()
        self._inside = False
        self._pending: Whiteout | None = None

    def on_frame(self) -> None:
        """After each emulated frame; the vendor holds its memory lock."""
        inside = int.from_bytes(self.read(GMAIN + 4, 4), "little") == CB2_WHITE_OUT
        with self._lock:
            if inside and not self._inside:
                self._pending = Whiteout(_money(self.read))
            self._inside = inside

    def take(self, state: GameState) -> Whiteout | None:
        """The pending whiteout, once, on the first observation back on the field."""
        with self._lock:
            # The observation's own state decides: CB2_WhiteOut is never the overworld screen,
            # so the line cannot be taken while the whiteout still runs, whatever the hook order.
            if self._pending is None or state.position is None:
                return None
            if state.screen != "overworld" or state.in_battle:
                return None
            event, self._pending = self._pending, None
            return event


def install_whiteout_latch(emulator: type[SteppedEmulator], latch: WhiteoutLatch) -> None:
    step = emulator.run_frame_with_buttons

    def step_watching(self: SteppedEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        latch.on_frame()

    emulator.run_frame_with_buttons = step_watching
