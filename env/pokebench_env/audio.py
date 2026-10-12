"""Bounded, non-consuming spectator PCM tape; readers never touch the core."""

import io
import threading
import wave
from dataclasses import dataclass

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
