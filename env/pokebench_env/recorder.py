"""Records a run's full-rate picture and sound to hourly files, as a read-only game server client.

Sync is by game frame, not wall clock: picture and sound both follow the emulator, so a pause costs
neither anything and they stay together. The recorder never writes to the server, so a recorder
failure cannot reach the run; it logs the failure and carries on or exits.
"""

import argparse
import json
import re
import signal
import subprocess  # noqa: S404 - ffmpeg, argv lists only
import sys
import threading
import time
import urllib.error
import urllib.request
from base64 import b64decode
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Protocol

GBA_FPS = 16777216 / 280896
SAMPLE_RATE = 48000
SAMPLE_BYTES = 4
SAMPLES_PER_FRAME = SAMPLE_RATE / GBA_FPS
# Past this, a hole in the picture is left out rather than filled with a held frame.
MAX_HELD_FRAMES = int(GBA_FPS * 600)
# Past this, a jump in the sound counter is logged and bridged no further.
MAX_SILENCE_SAMPLES = SAMPLE_RATE * 600
# The sound counter trails frame_count * SAMPLES_PER_FRAME by this much, within 3 samples
# (measured 2026-11-06 over 45 s of a real server); both count from the same emulator.
AUDIO_LAG_SAMPLES = 686
WAV_HEADER_BYTES = 44
SEGMENT_SECONDS = 3600


@dataclass(frozen=True)
class FramePlan:
    writes: int
    event: str | None


class VideoTimeline:
    """How many times to write each frame so the file keeps the game's own timing."""

    def __init__(self) -> None:
        self.last: int | None = None

    def accept(self, frame_count: int) -> FramePlan:
        last, self.last = self.last, frame_count
        if last is None:
            return FramePlan(1, None)
        gap = frame_count - last
        if gap == 0:
            return FramePlan(0, None)
        if gap < 0:
            return FramePlan(1, "frame_counter_reset")
        if gap > MAX_HELD_FRAMES:
            return FramePlan(1, "frames_lost")
        return FramePlan(gap, None)


@dataclass(frozen=True)
class AudioPlan:
    silence_samples: int
    skip_samples: int
    event: str | None


def plan_audio(start: int, pcm_samples: int, written: int) -> AudioPlan:
    """Place sound by where it belongs in the file: `start` is that position, `written` the end."""
    if start > written:
        gap = start - written
        if gap > MAX_SILENCE_SAMPLES:
            return AudioPlan(MAX_SILENCE_SAMPLES, 0, "audio_jump")
        return AudioPlan(gap, 0, "audio_gap")
    return AudioPlan(0, min(pcm_samples, written - start), None)


class Sink(Protocol):
    def write(self, data: bytes) -> None: ...
    def close(self) -> None: ...


class Log(Protocol):
    def __call__(self, event: str, **fields: object) -> None: ...


def next_part(names: Iterable[str]) -> int:
    """The part after every file already here, so a restart never touches an earlier one."""
    return max((int(m[1]) for n in names if (m := re.search(r"-p(\d+)-", n))), default=0) + 1


def supervise(run_child: Callable[[bool], int], log: Log, pause: Callable[[], None]) -> None:
    """Keep the recorder going: it exits 0 only once the server has gone for good."""
    first = True
    while True:
        code = run_child(first)
        first = False
        if code == 0:
            log("supervisor_done")
            return
        log("recorder_restarted", exit_code=code)
        pause()


class Restarting:
    """A sink that starts a new part when its encoder dies, so one failure loses little."""

    def __init__(self, start: Callable[[int], Sink], log: Log, name: str, part: int = 1) -> None:
        self.start, self.log, self.name = start, log, name
        self.part = part - 1
        self.sink: Sink | None = None

    def write(self, data: bytes) -> None:
        for _attempt in range(2):
            if self.sink is None:
                self.part += 1
                self.sink = self.start(self.part)
                self.log("part_started", stream=self.name, part=self.part)
            try:
                self.sink.write(data)
                return
            except OSError as error:
                self.log("encoder_failed", stream=self.name, part=self.part, error=str(error))
                self.sink = None

    def close(self) -> None:
        if self.sink is not None:
            self.sink.close()


class Anchor:
    """Ties the sound counter to the file: which sample of the run is the file's first."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._origin: int | None = None
        self._rebase_frames: int | None = None
        self.frames = 0

    def first_frame(self, frame_count: int) -> None:
        with self._lock:
            self._origin = round(frame_count * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES

    def add(self, frames: int) -> None:
        with self._lock:
            self.frames += frames

    def counter_reset(self) -> None:
        with self._lock:
            self._rebase_frames = self.frames

    def origin(self, sample_end: int) -> int | None:
        """Sample at file position 0; after a counter reset, set from the sound's current end."""
        with self._lock:
            if self._rebase_frames is not None:
                self._origin = sample_end - round(self._rebase_frames * SAMPLES_PER_FRAME)
                self._rebase_frames = None
            return self._origin


@dataclass(frozen=True)
class Frame:
    frame_count: int
    png: bytes


def parse_frame(message: str | bytes) -> Frame:
    body = json.loads(message)
    return Frame(int(body["frame_count"]), b64decode(body["frame_data"]))


def record_frames(frames: Iterable[Frame], sink: Sink, anchor: Anchor, log: Log) -> None:
    timeline = VideoTimeline()
    for frame in frames:
        if timeline.last is None:
            anchor.first_frame(frame.frame_count)
            log("first_frame", frame_count=frame.frame_count)
        plan = timeline.accept(frame.frame_count)
        if plan.event is not None:
            log(plan.event, frame_count=frame.frame_count, video_frames=anchor.frames)
        if plan.event == "frame_counter_reset":
            anchor.counter_reset()
        for _ in range(plan.writes):
            sink.write(frame.png)
        anchor.add(plan.writes)


@dataclass(frozen=True)
class Sound:
    pcm: bytes
    end: int


def parse_sound(wav: bytes, end: int) -> Sound:
    return Sound(wav[WAV_HEADER_BYTES:], end)


class SoundWriter:
    def __init__(self, sink: Sink, anchor: Anchor, log: Log) -> None:
        self.sink, self.anchor, self.log = sink, anchor, log
        self.written = 0

    def accept(self, sound: Sound) -> None:
        origin = self.anchor.origin(sound.end)
        if origin is None:
            return
        samples = len(sound.pcm) // SAMPLE_BYTES
        plan = plan_audio(sound.end - samples - origin, samples, self.written)
        if plan.event is not None:
            self.log(plan.event, silence=plan.silence_samples, at=self.written)
        if plan.silence_samples > 0:
            self.sink.write(bytes(plan.silence_samples * SAMPLE_BYTES))
            self.written += plan.silence_samples
        kept = samples - plan.skip_samples
        if kept > 0:
            self.sink.write(sound.pcm[plan.skip_samples * SAMPLE_BYTES :])
            self.written += kept


def video_command(out: Path, part: int) -> list[str]:
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "image2pipe", "-c:v", "png", "-framerate", f"{GBA_FPS:.4f}", "-i", "pipe:0",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "16",
        "-pix_fmt", "yuv444p",
        "-g", "600", "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
        "-flush_packets", "1", "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
        "-segment_format", "matroska", "-segment_format_options", "cluster_time_limit=1000",
        "-reset_timestamps", "1", str(out / f"video-p{part:02d}-%04d.mkv"),
    ]  # fmt: skip


def audio_command(out: Path, part: int) -> list[str]:
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "2", "-i", "pipe:0",
        "-c:a", "flac", "-flush_packets", "1",
        "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
        "-segment_format", "matroska", "-segment_format_options", "cluster_time_limit=1000",
        "-reset_timestamps", "1",
        str(out / f"audio-p{part:02d}-%04d.mka"),
    ]  # fmt: skip


class Encoder:  # pragma: no cover - the ffmpeg process
    def __init__(self, argv: list[str], log_file: IO[bytes]) -> None:
        self.process = subprocess.Popen(  # noqa: S603
            argv, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log_file
        )

    def write(self, data: bytes) -> None:
        stdin = self.process.stdin
        if stdin is None:
            raise OSError("encoder has no input")
        stdin.write(data)
        stdin.flush()

    def close(self) -> None:
        if self.process.stdin is not None:
            try:
                self.process.stdin.close()
            except OSError:
                pass
        self.process.wait(timeout=30)


def frames_from(
    port: int, stopping: threading.Event, log: Log, wait: float
) -> Iterable[Frame]:  # pragma: no cover - the socket
    from websockets.exceptions import WebSocketException
    from websockets.sync.client import connect

    url = f"ws://127.0.0.1:{port}/pokebench/frames"
    deadline = time.monotonic() + wait
    connected = False
    while not stopping.is_set():
        try:
            with connect(url, max_size=None, open_timeout=2) as socket:
                log("frames_connected")
                connected = True
                while not stopping.is_set():
                    try:
                        yield parse_frame(socket.recv(timeout=1))
                    except TimeoutError:
                        continue
        except (OSError, WebSocketException) as error:
            if connected:
                log("server_gone", error=str(error))
                deadline = time.monotonic() + 15
                connected = False
            if time.monotonic() > deadline:
                log("gave_up")
                stopping.set()
                return
            time.sleep(0.05)


def sound_loop(
    port: int, writer: SoundWriter, stopping: threading.Event, log: Log
) -> None:  # pragma: no cover - the socket
    cursor = -1
    failing = False
    while not stopping.is_set():
        url = f"http://127.0.0.1:{port}/audio.wav?since={cursor}&max_frames=12000"
        try:
            with urllib.request.urlopen(url, timeout=2) as response:  # noqa: S310 - loopback
                wav = response.read()
                cursor = int(response.headers["X-Audio-Next"])
            writer.accept(parse_sound(wav, cursor))
            failing = False
        except (OSError, urllib.error.URLError, ValueError, TypeError) as error:
            if not failing:
                log("sound_unavailable", error=str(error))
            failing = True
            time.sleep(0.1)
        time.sleep(0.05)


def journal(path: Path) -> Log:  # pragma: no cover - the disk
    lock = threading.Lock()

    def log(event: str, **fields: object) -> None:
        line = json.dumps({"at": time.time(), "event": event, **fields})
        with lock, path.open("a") as out:
            out.write(line + "\n")

    return log


def run_supervised(
    port: int, out: Path, wait: float, log: Log
) -> int:  # pragma: no cover - processes
    live: list[subprocess.Popen[bytes]] = []
    stopping = threading.Event()

    def stop(*_: object) -> None:
        stopping.set()
        for child in live:
            child.terminate()

    signal.signal(signal.SIGTERM, stop)

    def run_child(first: bool) -> int:
        if stopping.is_set():
            return 0
        patience = wait if first else 30.0
        argv = [sys.executable, "-m", "pokebench_env.recorder", "--port", str(port)]
        child = subprocess.Popen([*argv, "--out", str(out), "--wait", str(patience)])  # noqa: S603
        live[:] = [child]
        code = child.wait()
        return 0 if stopping.is_set() else code

    supervise(run_child, log, lambda: time.sleep(0.2))
    return 0


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entrypoint
    parser = argparse.ArgumentParser(description="Record a run's picture and sound to files.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--wait", type=float, default=900, help="seconds to wait for the server")
    parser.add_argument("--supervise", action="store_true", help="restart the recorder if it dies")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    log = journal(args.out / "recording.jsonl")
    if args.supervise:
        return run_supervised(args.port, args.out, args.wait, log)
    errors = (args.out / "ffmpeg.log").open("ab")
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    anchor = Anchor()
    part = next_part(path.name for path in args.out.iterdir())
    video = Restarting(lambda n: Encoder(video_command(args.out, n), errors), log, "video", part)
    audio = Restarting(lambda n: Encoder(audio_command(args.out, n), errors), log, "audio", part)
    log("started", port=args.port, fps=GBA_FPS, sample_rate=SAMPLE_RATE)
    writer = SoundWriter(audio, anchor, log)
    sound = threading.Thread(
        target=sound_loop, args=(args.port, writer, stopping, log), daemon=True
    )
    sound.start()
    try:
        record_frames(frames_from(args.port, stopping, log, args.wait), video, anchor, log)
    finally:
        stopping.set()
        sound.join(timeout=5)
        video.close()
        audio.close()
        log("stopped", frames=anchor.frames, audio_samples=writer.written)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
