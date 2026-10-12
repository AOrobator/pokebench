"""Bounded, non-consuming spectator PCM tape; readers never touch the core."""

import io
import logging
import sys
import threading
import wave
from array import array
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

SAMPLE_RATE = 48000
FRAME_BYTES = 4


@dataclass(frozen=True)
class AudioSegment:
    wav: bytes
    next_frame: int
    skipped: int
    epoch: int


class AudioTape:
    def __init__(self, capacity_frames: int = 24000) -> None:
        if capacity_frames < 1:
            raise ValueError("capacity_frames must be positive")
        self.capacity_frames = capacity_frames
        self._pcm = bytearray()
        self._end = 0
        self._epoch = 0
        self._lock = threading.Lock()

    def append(self, pcm: bytes) -> None:
        if len(pcm) % FRAME_BYTES:
            raise ValueError("PCM must contain whole stereo frames")
        with self._lock:
            self._end += len(pcm) // FRAME_BYTES
            self._pcm.extend(pcm[-self.capacity_frames * FRAME_BYTES :])
            del self._pcm[: max(0, len(self._pcm) - self.capacity_frames * FRAME_BYTES)]

    def clear(self) -> None:
        with self._lock:
            self._pcm.clear()
            self._epoch += 1

    def segment(self, since: int = -1, max_frames: int = 12000) -> AudioSegment:
        if max_frames < 1:
            raise ValueError("max_frames must be positive")
        with self._lock:
            oldest = self._end - len(self._pcm) // FRAME_BYTES
            requested = self._end - min(max_frames, self.capacity_frames) if since < 0 else since
            start = min(self._end, max(oldest, self._end - max_frames, requested))
            pcm = bytes(self._pcm[(start - oldest) * FRAME_BYTES :])
            end, epoch = self._end, self._epoch
        out = io.BytesIO()
        with wave.open(out, "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(pcm)
        return AudioSegment(out.getvalue(), end, max(0, start - requested), epoch)


class StereoBufferLike(Protocol):
    @property
    def available(self) -> int: ...
    def set_rate(self, rate: int) -> None: ...
    def read(self, frames: int) -> Sequence[int]: ...
    def clear(self) -> None: ...


class AudioCoreLike(Protocol):
    def get_audio_channels(self) -> StereoBufferLike: ...
    def add_frame_callback(self, callback: Callable[[], None]) -> None: ...


class EmulatorLike(Protocol):
    core: AudioCoreLike | None

    initialize: Callable[..., object]
    load_state: Callable[..., object]


def install_tap(emulator_class: type[EmulatorLike], tape: AudioTape) -> None:
    """Patch lifecycle only; native callbacks drain in the frame owner's thread."""
    initialize = emulator_class.initialize
    load_state = emulator_class.load_state
    generation = 0
    logger = logging.getLogger(__name__)

    def initialize_with_audio(self: EmulatorLike, *args: object, **kwargs: object) -> object:
        nonlocal generation
        generation += 1
        current = generation
        tape.clear()
        result = initialize(self, *args, **kwargs)
        try:
            core = self.core
            if core is None:
                raise RuntimeError("no audio core")
            buffer = core.get_audio_channels()
            buffer.set_rate(SAMPLE_RATE)
            buffer.clear()
            warned = False

            def capture() -> None:
                nonlocal warned
                if current != generation:
                    return
                try:
                    samples = array("h", buffer.read(buffer.available))
                    if sys.byteorder != "little":
                        samples.byteswap()
                    tape.append(samples.tobytes())
                except Exception:
                    if not warned:
                        logger.warning("Spectator audio capture failed", exc_info=True)
                        warned = True

            core.add_frame_callback(capture)
        except Exception:
            logger.warning("Spectator audio unavailable", exc_info=True)
        return result

    def load_with_audio(self: EmulatorLike, *args: object, **kwargs: object) -> object:
        try:
            return load_state(self, *args, **kwargs)
        finally:
            tape.clear()
            try:
                if self.core is not None:
                    self.core.get_audio_channels().clear()
            except Exception:
                logger.warning("Spectator audio flush failed", exc_info=True)

    emulator_class.initialize = initialize_with_audio
    emulator_class.load_state = load_with_audio
