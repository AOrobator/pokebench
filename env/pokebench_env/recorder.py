"""Records a run's full-rate picture and sound to hourly files, as a read-only game server client.

Sync is by game frame, not wall clock: picture and sound both follow the emulator, so a pause costs
neither anything and they stay together. The recorder never writes to the server, so a recorder
failure cannot reach the run; it logs the failure and carries on or exits.
"""

import argparse
import json
import os
import re
import select
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
# Silence is written in pieces this long, so a long outage needs no large buffer.
SILENCE_CHUNK_SAMPLES = SAMPLE_RATE
# After an encoder fails to start, how long to drop data before trying again.
ENCODER_RETRY_SECONDS = 5.0
MAX_RESTART_PAUSE_SECONDS = 60.0
# The sound counter trails frame_count * SAMPLES_PER_FRAME by this much, within 3 samples
# (measured 2026-11-06 over 45 s of a real server); both count from the same emulator.
AUDIO_LAG_SAMPLES = 686
WAV_HEADER_BYTES = 44
SEGMENT_SECONDS = 3600
# Each mark ties wall clock (the journal's `at`), game frame and file position, for compositing.
# flush_packets works only here: on the outer muxer the inner file buffers 256 KiB at a time.
SEGMENT_OPTIONS = "cluster_time_limit=1000:flush_packets=1"
SYNC_MARK_FRAMES = 3600
# Sound further than this from the first frame's place did not start with the frame counter.
ANCHOR_TOLERANCE_SAMPLES = SAMPLE_RATE
ENCODER_WRITE_DEADLINE_SECONDS = 10.0


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
        return AudioPlan(start - written, 0, "audio_gap")
    return AudioPlan(0, min(pcm_samples, written - start), None)


class Sink(Protocol):
    def write(self, data: bytes) -> None: ...
    def close(self) -> None: ...


class Log(Protocol):
    def __call__(self, event: str, **fields: object) -> None: ...


def next_part(names: Iterable[str]) -> int:
    """The part after every file already here, so a restart never touches an earlier one."""
    return max((int(m[1]) for n in names if (m := re.search(r"-p(\d+)-", n))), default=0) + 1


def supervise(run_child: Callable[[bool], int], log: Log, pause: Callable[[float], None]) -> None:
    """Keep the recorder going: it exits 0 only once the server has gone for good."""
    first = True
    wait = 0.2
    while True:
        code = run_child(first)
        first = False
        if code == 0:
            log("supervisor_done")
            return
        log("recorder_restarted", exit_code=code, pause=wait)
        pause(wait)
        wait = min(wait * 2, MAX_RESTART_PAUSE_SECONDS)


class Restarting:
    """A sink that starts a new part when its encoder dies, so one failure loses little."""

    def __init__(
        self,
        start: Callable[[int], Sink],
        log: Log,
        name: str,
        part: int = 1,
        clock: Callable[[], float] = time.monotonic,
        position: Callable[[], int] = lambda: 0,
    ) -> None:
        self.start, self.log, self.name, self.clock = start, log, name, clock
        self.position = position
        self.part = part - 1
        self.sink: Sink | None = None
        self.retry_at = 0.0
        self.started_at = 0.0

    def _open(self) -> Sink | None:
        if self.clock() < self.retry_at:
            return None
        self.part += 1
        try:
            sink = self.start(self.part)
        except OSError as error:
            self.log("encoder_unstartable", stream=self.name, part=self.part, error=str(error))
            self.part -= 1
            self.retry_at = self.clock() + ENCODER_RETRY_SECONDS
            return None
        self.started_at = self.clock()
        self.log("part_started", stream=self.name, part=self.part, position=self.position())
        return sink

    def write(self, data: bytes) -> None:
        for _attempt in range(2):
            if self.sink is None:
                self.sink = self._open()
            if self.sink is None:
                return
            try:
                self.sink.write(data)
                return
            except OSError as error:
                self.log("encoder_failed", stream=self.name, part=self.part, error=str(error))
                dead, self.sink = self.sink, None
                # One that had been running restarts at once; one that dies on starting waits.
                if self.clock() - self.started_at < ENCODER_RETRY_SECONDS:
                    self.retry_at = self.clock() + ENCODER_RETRY_SECONDS
                try:
                    dead.close()
                except (OSError, subprocess.SubprocessError) as closing:
                    self.log("encoder_close_failed", stream=self.name, error=str(closing))

    def close(self) -> None:
        if self.sink is not None:
            self.sink.close()


class Anchor:
    """Ties the sound counter to the file: which sample of the run is the file's first."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._origin: int | None = None
        self._rebase_frames: int | None = None
        self._check = False
        self.frames = 0

    def first_frame(self, frame_count: int) -> None:
        with self._lock:
            self._origin = round(frame_count * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
            self._check = True

    def add(self, frames: int) -> None:
        with self._lock:
            self.frames += frames

    def rebase(self) -> None:
        """The frame counter no longer maps to the sound counter: place sound from its next end."""
        with self._lock:
            self._rebase_frames = self.frames

    def origin(self, sample_end: int) -> tuple[int | None, bool]:
        """Sample at file position 0, and whether it was set from the sound just now."""
        with self._lock:
            if self._origin is None:
                return None, False
            expected = self._origin + round(self.frames * SAMPLES_PER_FRAME)
            # A loaded save restores the frame counter but not the sound counter.
            drifted = abs(sample_end - expected) > ANCHOR_TOLERANCE_SAMPLES
            if self._check and drifted and self._rebase_frames is None:
                self._rebase_frames = self.frames
            self._check = False
            if self._rebase_frames is None:
                return self._origin, False
            self._origin = sample_end - round(self._rebase_frames * SAMPLES_PER_FRAME)
            self._rebase_frames = None
            return self._origin, True


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
        if plan.event is not None:
            anchor.rebase()
        for _ in range(plan.writes):
            sink.write(frame.png)
        before = anchor.frames
        anchor.add(plan.writes)
        if anchor.frames // SYNC_MARK_FRAMES != before // SYNC_MARK_FRAMES:
            log("sync", frame_count=frame.frame_count, video_frames=anchor.frames - 1)


@dataclass(frozen=True)
class Sound:
    pcm: bytes
    end: int


def parse_sound(wav: bytes, end: int) -> Sound:
    return Sound(wav[WAV_HEADER_BYTES:], end)


class SoundWriter:
    def __init__(
        self, sink: Sink, anchor: Anchor, log: Log, total: list[int] | None = None
    ) -> None:
        self.sink, self.anchor, self.log = sink, anchor, log
        self.total = [0] if total is None else total

    @property
    def written(self) -> int:
        return self.total[0]

    @written.setter
    def written(self, value: int) -> None:
        self.total[0] = value

    def accept(self, sound: Sound) -> None:
        origin, rebased = self.anchor.origin(sound.end)
        if origin is None:
            return
        if rebased:
            self.log("sound_rebased", sound_end=sound.end, origin=origin)
        samples = len(sound.pcm) // SAMPLE_BYTES
        plan = plan_audio(sound.end - samples - origin, samples, self.written)
        if plan.event is not None:
            self.log(plan.event, silence=plan.silence_samples, position=self.written)
        left = plan.silence_samples
        while left > 0:
            piece = min(left, SILENCE_CHUNK_SAMPLES)
            self.sink.write(bytes(piece * SAMPLE_BYTES))
            left -= piece
        self.written += plan.silence_samples
        kept = samples - plan.skip_samples
        if kept > 0:
            self.sink.write(sound.pcm[plan.skip_samples * SAMPLE_BYTES :])
            self.written += kept


@dataclass(frozen=True)
class Mark:
    position: float
    frame_count: int
    at: float


def _wall(marks: list[Mark], frames: float) -> float | None:
    before = [m for m in marks if m.position <= frames]
    after = [m for m in marks if m.position > frames]
    if not before:
        return None
    low = before[-1]
    high = after[0] if after else (before[-2] if len(before) > 1 else None)
    if high is None or high.position == low.position:
        return low.at
    return low.at + (frames - low.position) * (high.at - low.at) / (high.position - low.position)


def _frame_at(marks: list[Mark], frames: float) -> int | None:
    before = [m for m in marks if m.position <= frames]
    return None if not before else before[-1].frame_count + round(frames - before[-1].position)


def segment_rows(
    events: Iterable[dict[str, object]], names: Iterable[str]
) -> list[dict[str, object]]:
    """One row per file: where it starts in the game and on the wall clock, from the journal.

    Each `started` begins a session whose positions count from zero, so a file reads only the
    marks of the session that wrote it.
    """
    sessions: list[list[Mark]] = []
    parts: dict[tuple[str, int], tuple[int, int]] = {}
    for event in events:
        kind, at = event.get("event"), event.get("at")
        if kind == "started" or not sessions:
            sessions.append([])
        if kind == "first_frame" and isinstance(at, float):
            sessions[-1].append(Mark(0.0, int(str(event["frame_count"])), at))
        elif kind in ("sync", "frame_counter_reset", "frames_lost") and isinstance(at, float):
            position = float(str(event["video_frames"]))
            sessions[-1].append(Mark(position, int(str(event["frame_count"])), at))
        elif kind == "part_started":
            key = (str(event["stream"]), int(str(event["part"])))
            parts[key] = (len(sessions) - 1, int(str(event["position"])))

    rows: list[dict[str, object]] = []
    for name in sorted(names):
        found = re.fullmatch(r"(video|audio)-p(\d+)-(\d+)\.mk[av]", name)
        if found is None or (found[1], int(found[2])) not in parts:
            continue
        session, start = parts[(found[1], int(found[2]))]
        frames = float(start) if found[1] == "video" else start / SAMPLES_PER_FRAME
        frames += int(found[3]) * SEGMENT_SECONDS * GBA_FPS
        rows.append(
            {
                "file": name,
                "stream": found[1],
                "first_frame_count": _frame_at(sessions[session], frames),
                "first_wall_time": _wall(sessions[session], frames),
            }
        )
    return rows


def video_command(out: Path, part: int) -> list[str]:
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "image2pipe", "-c:v", "png", "-framerate", f"{GBA_FPS:.4f}", "-i", "pipe:0",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "16",
        "-pix_fmt", "yuv444p",
        "-g", "600", "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
        "-flush_packets", "1", "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
        "-segment_format", "matroska", "-segment_format_options", SEGMENT_OPTIONS,
        "-reset_timestamps", "1", str(out / f"video-p{part:02d}-%04d.mkv"),
    ]  # fmt: skip


def audio_command(out: Path, part: int) -> list[str]:
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "2", "-i", "pipe:0",
        "-c:a", "flac", "-flush_packets", "1",
        "-f", "segment", "-segment_time", str(SEGMENT_SECONDS),
        "-segment_format", "matroska", "-segment_format_options", SEGMENT_OPTIONS,
        "-reset_timestamps", "1",
        str(out / f"audio-p{part:02d}-%04d.mka"),
    ]  # fmt: skip


class Encoder:  # pragma: no cover - the ffmpeg process
    def __init__(self, argv: list[str], log_file: IO[bytes]) -> None:
        self.process = subprocess.Popen(  # noqa: S603
            argv, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log_file, bufsize=0
        )
        if self.process.stdin is None:
            raise OSError("encoder has no input")
        self.stdin = self.process.stdin
        os.set_blocking(self.stdin.fileno(), False)

    def write(self, data: bytes) -> None:
        fd = self.stdin.fileno()
        left = memoryview(data)
        while len(left) > 0:
            if not select.select([], [fd], [], ENCODER_WRITE_DEADLINE_SECONDS)[1]:
                self.process.kill()
                raise OSError("encoder stopped reading")
            left = left[os.write(fd, left) :]

    def close(self) -> None:
        try:
            self.stdin.close()
        except OSError:
            pass
        try:
            self.process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)


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


def follow_owner(
    pid: int | None,
    alive: Callable[[int], bool],
    wait: Callable[[], bool],
    stop: Callable[[], None],
) -> None:
    """Stop only this recorder when its game server exits; never follow a reused port."""
    if pid is None:
        return
    while not wait():
        if not alive(pid):
            stop()
            return


def _alive(pid: int) -> bool:  # pragma: no cover - process lookup
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def _watch_owner(
    pid: int | None, stopping: threading.Event, stop: Callable[[], None]
) -> None:  # pragma: no cover - thread
    if pid is None:
        return
    threading.Thread(
        target=follow_owner,
        args=(pid, _alive, lambda: stopping.wait(0.1), stop),
        daemon=True,
    ).start()


def run_supervised(
    port: int, out: Path, wait: float, log: Log, owner_pid: int | None = None
) -> int:  # pragma: no cover - processes
    live: list[subprocess.Popen[bytes]] = []
    stopping = threading.Event()

    def stop(*_: object) -> None:
        stopping.set()
        for child in live:
            child.terminate()

    signal.signal(signal.SIGTERM, stop)
    _watch_owner(owner_pid, stopping, stop)

    def run_child(first: bool) -> int:
        if stopping.is_set():
            return 0
        patience = wait if first else 30.0
        argv = [sys.executable, "-m", "pokebench_env.recorder", "--port", str(port)]
        owner = [] if owner_pid is None else ["--owner-pid", str(owner_pid)]
        child = subprocess.Popen([*argv, "--out", str(out), "--wait", str(patience), *owner])  # noqa: S603
        live[:] = [child]
        code = child.wait()
        return 0 if stopping.is_set() else code

    supervise(run_child, log, time.sleep)
    return 0


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entrypoint
    parser = argparse.ArgumentParser(description="Record a run's picture and sound to files.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--wait", type=float, default=900, help="seconds to wait for the server")
    parser.add_argument("--owner-pid", type=int, help="stop recording when this game server exits")
    parser.add_argument("--supervise", action="store_true", help="restart the recorder if it dies")
    parser.add_argument("--index", action="store_true", help="write segments.json and stop")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    if args.index:
        lines = (args.out / "recording.jsonl").read_text().splitlines()
        rows = segment_rows((json.loads(line) for line in lines), os.listdir(args.out))
        (args.out / "segments.json").write_text(json.dumps(rows, indent=1) + "\n")
        return 0
    log = journal(args.out / "recording.jsonl")
    if args.supervise:
        return run_supervised(args.port, args.out, args.wait, log, args.owner_pid)
    errors = (args.out / "ffmpeg.log").open("ab")
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    _watch_owner(args.owner_pid, stopping, stopping.set)
    anchor = Anchor()
    part = next_part(path.name for path in args.out.iterdir())
    written = [0]
    video = Restarting(
        lambda n: Encoder(video_command(args.out, n), errors),
        log,
        "video",
        part,
        position=lambda: anchor.frames,
    )
    audio = Restarting(
        lambda n: Encoder(audio_command(args.out, n), errors),
        log,
        "audio",
        part,
        position=lambda: written[0],
    )
    log("started", port=args.port, fps=GBA_FPS, sample_rate=SAMPLE_RATE)
    writer = SoundWriter(audio, anchor, log, written)
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
