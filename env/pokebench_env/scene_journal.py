"""Frame-owned visible scene history; no story/script lookup or input policy.

pret731ad5bf: ObjectEvent/Sprite layouts (global.fieldmap.h, sprite.h),
UpdateSprites' rendered OAM coordinates (sprite.c), field text printer (text.c).
US addresses reuse the verified world_context/naming/game_state readers.
"""

import os
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from fastapi import FastAPI, HTTPException, Query

from pokebench_env.game_screen import GMAIN, SCREENS, ReadMemory
from pokebench_env.game_state import FIELD_CONTROLS_LOCK, SAVE_BLOCK_PTRS
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.naming import SPRITES
from pokebench_env.native_text import decode_native_text, native_text_payload
from pokebench_env.player_map_visibility import SWITCH as VISIBILITY
from pokebench_env.player_map_visibility import (
    VIEWPORT,
    illumination,
    lit_rect,
    screen_visible,
    sprite_rect,
)
from pokebench_env.raw_ram import RawRamSnapshot, persist_diagnostic_window
from pokebench_env.readout import features_off_from_env
from pokebench_env.transition_coherence import main_loop_idle
from pokebench_env.world_context import GRAPHICS, STRING_VAR4, read_field_message

FEATURE = "cutscene-journal-v1"
CAPACITY = 512
VISUAL_INTERVAL = 120
MAX_VISUALS = 6
# Callback-owned sequences that do not consist of field objects. Unknown owners
# receive visual evidence too; never label them as a known story or character.
VISUAL_SCREENS = frozenset(
    {
        "unknown",
        "intro",
        "intro_transition",
        "birch_speech",
        "trade_animation",
        "hall_of_fame",
        "egg_hatching",
    }
)
SIZES = (
    ((8, 8), (16, 16), (32, 32), (64, 64)),
    ((16, 8), (32, 8), (32, 16), (64, 32)),
    ((8, 16), (8, 32), (16, 32), (32, 64)),
)


@dataclass(frozen=True)
class Actor:
    local_id: int
    graphics: int
    x: int
    y: int
    player: bool = False

    @property
    def label(self) -> str:
        return (
            "player" if self.player else f"object {self.local_id}"
        ) + f" (sprite {GRAPHICS.get(self.graphics, str(self.graphics))})"


@dataclass(frozen=True)
class Scene:
    screen: str
    map_id: tuple[int, int] | None
    locked: bool
    actors: tuple[Actor, ...]
    message: str | None
    message_active: bool = False


def _exact(read: ReadMemory, address: int, count: int) -> bytes:
    raw = read(address, count)
    if len(raw) != count:
        raise ValueError(f"short scene read at {address:#x}")
    return raw


def read_scene(read: ReadMemory, *, player_visibility: bool = False) -> Scene:
    callback = int.from_bytes(_exact(read, GMAIN + 4, 4), "little")
    screen = SCREENS.get(callback, "unknown")
    if screen != "overworld":
        return Scene(screen, None, False, (), None)
    locked = bool(_exact(read, FIELD_CONTROLS_LOCK, 1)[0])
    save = int.from_bytes(_exact(read, SAVE_BLOCK_PTRS, 4), "little")
    if not 0x02000000 <= save <= 0x02040000 - 0x1A9C or save % 4:
        raise ValueError("scene map owner unavailable")
    group, num = _exact(read, save + 4, 2)
    map_id = (group, num)
    light = illumination(read, map_id) if player_visibility and screen_visible(read) else None
    actors = []
    bodies = _exact(read, OBJECT_EVENTS, 16 * 0x24)
    for offset in range(0, len(bodies), 0x24):
        body = bodies[offset : offset + 0x24]
        if not body[0] & 1 or body[1] & 0x20:
            continue
        if (body[10], body[9]) != map_id or body[4] >= 64:
            continue
        sprite = _exact(read, SPRITES + body[4] * 0x44, 0x44)
        if not sprite[0x3E] & 1 or sprite[0x3E] & 4:
            continue
        attr0, attr1 = (int.from_bytes(sprite[i : i + 2], "little") for i in (0, 2))
        shape, size = attr0 >> 14, attr1 >> 14
        if shape == 3:
            continue
        width, height = SIZES[shape][size]
        # OAM coordinates already include the camera, sprite offsets and corner
        # vector. Wrap negative positions as hardware does (9-bit X, 8-bit Y).
        px, py = attr1 & 511, attr0 & 255
        if px >= 256:
            px -= 512
        if py >= 160:
            py -= 256
        if not (-width < px < 240 and -height < py < 160):
            continue
        if player_visibility:
            rect = sprite_rect(read, body)
            # A locked scene may animate the light, so its destination radius is not proof.
            if (
                (locked and light != VIEWPORT)
                or light is None
                or rect is None
                or not lit_rect(light, rect)
            ):
                continue
        x = int.from_bytes(body[0x10:0x12], "little", signed=True) - MAP_OFFSET
        y = int.from_bytes(body[0x12:0x14], "little", signed=True) - MAP_OFFSET
        actors.append(Actor(body[8], body[5], x, y, bool(body[2] & 1)))
    message = read_field_message(read)
    visible_text = None
    if message is not None:
        payload = native_text_payload(_exact(read, STRING_VAR4, 1000))
        # Only the printer-consumed prefix: do not reveal the rest of a message
        # merely because the complete string is already present in RAM.
        end = min(message.cursor, len(payload))
        visible_text = decode_native_text(
            payload[:end] + b"\xff",
            require_terminator=True,
            line_breaks={0xFA: "\n", 0xFB: "\n", 0xFE: "\n"},
        )
        if not message.ready:
            visible_text = None
    return Scene(screen, map_id, locked, tuple(actors), visible_text, message is not None)


class SceneJournal:
    def __init__(
        self,
        capacity: int = CAPACITY,
        visual_interval: int = VISUAL_INTERVAL,
        *,
        player_visibility: bool = False,
        safe_capture: bool = False,
        raw_capture: Callable[[int], RawRamSnapshot] | None = None,
    ) -> None:
        if capacity < 1 or visual_interval < 1:
            raise ValueError("scene journal bounds must be positive")
        if safe_capture and raw_capture is None:
            raise ValueError("safe scene capture requires native raw evidence")
        self.safe_capture = safe_capture
        self.raw_capture = raw_capture
        if safe_capture:
            self.safe_frames = self.deferred_frames = self.recoveries = 0
            self._deferred_run = 0
            self._raw_history: deque[RawRamSnapshot] = deque(maxlen=2)
            self._incident: deque[RawRamSnapshot] = deque(maxlen=8)
            self._post_frames = 0
            self._incident_open = False
            self.diagnostic_revision = self.persisted_revision = 0
            self.diagnostic_omitted_samples = 0
            self.diagnostic_error: str | None = None
            self._persist_lock = threading.Lock()
        self.player_visibility = player_visibility
        self.lock = threading.RLock()
        self.entries: deque[dict[str, object]] = deque(maxlen=capacity)
        self.frame = 0
        self.last_id = 0
        self.errors = 0
        self.last_error: str | None = None
        self.previous: Scene | None = None
        self.last_visual = -visual_interval
        self.visual_interval = visual_interval
        self.last_message: str | None = None

    def _add(self, text: str, image: str | None = None) -> None:
        self.last_id += 1
        entry: dict[str, object] = {"id": self.last_id, "frame": self.frame, "text": text}
        if image is not None:
            entry["image"] = image
        self.entries.append(entry)

    def advance(self, read: ReadMemory, screenshot: Callable[[], str] | None = None) -> None:
        with self.lock:
            self.frame += 1
            if self.safe_capture:
                self._advance_safe(read, screenshot)
                return
            if main_loop_idle(read) is False:
                self.errors += 1
                self.last_error = "frame ended mid-callback; coherent scene snapshot unavailable"
                self.previous = None
                self.last_message = None
                return
            try:
                self._observe(
                    read_scene(read, player_visibility=self.player_visibility), screenshot
                )
            except Exception as error:
                self.errors += 1
                self.last_error = str(error)
                # Do not infer movement across a failed read.
                self.previous = None
                self.last_message = None

    def _advance_safe(self, read: ReadMemory, screenshot: Callable[[], str] | None) -> None:
        sample = None
        incident = False
        try:
            assert self.raw_capture is not None
            sample = self.raw_capture(self.frame)
            if main_loop_idle(read) is not True:
                self.deferred_frames += 1
                self._deferred_run += 1
                incident = True
                self.previous = None
                self.last_message = None
            else:
                self._observe(
                    read_scene(read, player_visibility=self.player_visibility), screenshot
                )
                self.safe_frames += 1
                if self._deferred_run:
                    self.recoveries += 1
                    self._deferred_run = 0
        except Exception as error:
            self.errors += 1
            self.last_error = str(error)
            self.previous = None
            self.last_message = None
            incident = True
        if sample is None:
            return
        if incident:
            if not self._incident_open:
                self._incident.clear()
                self.diagnostic_omitted_samples = 0
                self._incident.extend(self._raw_history)
            self._incident_open = True
            self._post_frames = 2
        if self._incident_open:
            if len(self._incident) == self._incident.maxlen:
                self.diagnostic_omitted_samples += 1
            self._incident.append(sample)
            self.diagnostic_revision += 1
            if not incident:
                self._post_frames -= 1
                self._incident_open = self._post_frames > 0
        self._raw_history.append(sample)

    def persist_diagnostics(self, directory: Path) -> None:
        if not self.safe_capture:
            return
        # The HTTP reader calls this outside the emulator's memory lock. Only
        # immutable snapshots cross this boundary; frame execution never waits
        # for compression, fsync or diagnostic retention cleanup.
        with self._persist_lock:
            with self.lock:
                revision, snapshots = self.diagnostic_revision, tuple(self._incident)
                omitted = self.diagnostic_omitted_samples
                if not snapshots or revision == self.persisted_revision:
                    return
            try:
                persist_diagnostic_window(directory, revision, snapshots, omitted)
            except Exception as error:
                with self.lock:
                    self.diagnostic_error = str(error)
                return
            with self.lock:
                self.persisted_revision = revision
                self.diagnostic_error = None

    def _observe(self, scene: Scene, screenshot: Callable[[], str] | None) -> None:
        prev = self.previous
        field = scene.screen == "overworld"
        active = scene.locked or (prev is not None and prev.locked and field)
        # An owned printer remains active while printing/scrolling. Only its
        # disappearance or a scene boundary ends prefix continuity.
        if (
            not scene.message_active
            or prev is None
            or prev.map_id != scene.map_id
            or not prev.locked
        ):
            self.last_message = None
        if active:
            prefix = f"map {scene.map_id}: "
            same_map = (
                prev is not None and prev.screen == "overworld" and prev.map_id == scene.map_id
            )
            before = {a.local_id: a for a in prev.actors} if same_map and prev else {}
            now = {a.local_id: a for a in scene.actors}
            if not same_map or not prev or not prev.locked:
                self._add(
                    prefix
                    + "scripted field scene; visible objects: "
                    + ("; ".join(f"{a.label} at ({a.x},{a.y})" for a in scene.actors) or "none")
                )
            for key, actor in now.items():
                old = before.get(key)
                if old is None or old.graphics != actor.graphics:
                    self._add(prefix + f"{actor.label} appeared at ({actor.x},{actor.y})")
                elif (old.x, old.y) != (actor.x, actor.y):
                    self._add(
                        prefix + f"{actor.label} moved ({old.x},{old.y}) -> ({actor.x},{actor.y})"
                    )
            for key, actor in before.items():
                if key not in now or now[key].graphics != actor.graphics:
                    self._add(
                        prefix + f"{actor.label} left view; last seen at ({actor.x},{actor.y})"
                    )
            if scene.message is not None and scene.message != self.last_message:
                # A scrolling prefix can grow; deliver only the newly displayed
                # suffix, keeping movement/dialogue interleaved without repeats.
                text = scene.message
                if self.last_message and text.startswith(self.last_message):
                    text = text[len(self.last_message) :].lstrip()
                if text:
                    self._add(prefix + f'field text (speaker not established): "{text}"')
                self.last_message = scene.message
            if not scene.locked:
                self._add(prefix + "field controls returned")
        cinematic = scene.screen in VISUAL_SCREENS
        if screenshot is not None and (active or cinematic):
            changed = (
                prev is None or prev.screen != scene.screen or (scene.locked and not prev.locked)
            )
            if changed or self.frame - self.last_visual >= self.visual_interval:
                self._add(
                    f"Visual sample; screen {scene.screen}; "
                    "intermediate frames are not continuous video",
                    screenshot(),
                )
                self.last_visual = self.frame
        self.previous = scene

    def snapshot(self, after: int) -> dict[str, object]:
        with self.lock:
            if after < 0 or after > self.last_id:
                raise ValueError("scene journal cursor out of range")
            entries = [dict(e) for e in self.entries if int(str(e["id"])) > after]
            visual_count = 0
            for entry in entries:
                if "image" in entry:
                    visual_count += 1
                    if visual_count > MAX_VISUALS:
                        del entry["image"]
            coverage = (
                {}
                if not self.safe_capture
                else {
                    "coverage": {
                        "frames": self.frame,
                        "safe_frames": self.safe_frames,
                        "deferred_frames": self.deferred_frames,
                        "recoveries": self.recoveries,
                        "diagnostic_samples": len(self._incident),
                        "diagnostic_omitted_samples": self.diagnostic_omitted_samples,
                        "diagnostic_revision": self.diagnostic_revision,
                        "persisted_revision": self.persisted_revision,
                        "diagnostic_error": self.diagnostic_error,
                    }
                }
            )
            return {
                **coverage,
                "first_id": self.entries[0]["id"] if self.entries else self.last_id + 1,
                "last_id": self.last_id,
                "entries": entries,
                "errors": self.errors,
                "last_error": self.last_error,
                "omitted_images": max(0, visual_count - MAX_VISUALS),
            }


class Stepped(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_scene_journal(
    api: FastAPI,
    emulator: type[Stepped],
    read: ReadMemory,
    screenshot: Callable[[], str],
    *,
    safe_capture: bool = False,
    raw_capture: Callable[[int], RawRamSnapshot] | None = None,
    diagnostics_dir: Path | None = None,
) -> SceneJournal:
    if safe_capture and diagnostics_dir is None:
        raise ValueError("safe scene capture requires a diagnostic directory")
    journal = SceneJournal(
        safe_capture=safe_capture,
        raw_capture=raw_capture,
        player_visibility=VISIBILITY not in features_off_from_env(os.environ),
    )
    step = emulator.run_frame_with_buttons

    def recording(self: Stepped, buttons: list[str]) -> None:
        # The vendor frame owner holds memory_lock around this call.
        step(self, buttons)
        journal.advance(read, screenshot)

    emulator.run_frame_with_buttons = recording

    @api.get("/pokebench/scene/events")
    def events(after: int = Query(default=0, ge=0)) -> dict[str, object]:
        try:
            if diagnostics_dir is not None:
                journal.persist_diagnostics(diagnostics_dir)
            return journal.snapshot(after)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    return journal
