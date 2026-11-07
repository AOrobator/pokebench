"""`just broadcast-commentary`: one short spoken line per turn, then its voice.

Lines go to runs/broadcast/<run>/commentary.jsonl with the wavs beside them. Nothing is written
under runs/<run>/. The file is rewritten every few lines and on any stop, so a stopped job keeps
its work and the next one carries on from it. With --follow it tails a live run instead, saying
each thought as it finishes and dropping turns it can no longer say on time.
"""

import argparse
import functools
import importlib
import io
import json
import os
import re
import time
import urllib.request
import wave
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import cast
from urllib.parse import urlsplit

MAX_WORDS = 19
SAVE_EVERY = 25
TRIES = 3
STALE_TURNS = 2
POLL_S = 0.5
# A run that dies without a run_end line leaves its log silent; a live one is never quiet this long.
IDLE_END_S = 1800.0
LIVE_TIMEOUT_S = 30.0
CHUNK_BYTES = 1024 * 1024
# Words a viewer should not hear, which the model sometimes keeps despite the prompt.
JARGON = re.compile(r"\b(press(es|ed|ing)?|OHKO(s|'d)?|KO(s|'d)?|HP)\b", re.IGNORECASE)
VOICE = "af_heart"
VOICE_SPEED = 1.05
SYSTEM = (
    "You turn a game-playing AI's private thinking into one line it says aloud to a live "
    "audience watching it play Pokemon. First person, present or near future. Under 20 words. "
    "The decision is in the last lines of the thinking: earlier parts are often ideas it dropped. "
    "Say that decision and the reason given next to it. Use only what the thinking says: add no "
    "reason, plan, outcome or fact of your own, and never say a move wins or ends something "
    "unless the thinking does. Plain spoken English: never name a button or say press; no "
    "coordinates, tool names, damage numbers or abbreviations like OHKO or HP. If the thinking "
    "only answers a game prompt, say what the answer means, such as keeping my Pokemon in or "
    "not learning a move. Reply with the line alone."
)

WANTED = ("run_start", "run_end", "turn_start", "assistant")

Json = dict[str, object]
Post = Callable[[str, Json], Json]


@dataclass(frozen=True)
class Turn:
    turn: int
    t: float
    thinking: str
    said: float | None = None


@dataclass(frozen=True)
class Line:
    turn: int
    t: float
    text: str
    wav: str
    seconds: float | None = None
    said: float | None = None


@dataclass(frozen=True)
class Voiced:
    pcm: bytes
    rate: int


class TurnReader:
    """Reads log lines in order. Each thought is timed from the start of its turn, so the line
    plays while the model thinks; `said` is when the thought finished."""

    def __init__(self) -> None:
        self.started: float | None = None
        self.turn_began: dict[int, float] = {}
        self.newest = 0
        self.ended = False

    def feed(self, line: str) -> Turn | None:
        if not any(f'"type":"{kind}"' in line[:300] for kind in WANTED):
            return None
        try:
            event = json.loads(line)
            at = datetime.fromisoformat(event["t"]).timestamp()
            kind = event.get("type")
            if kind == "run_start":
                self.started = at
                return None
            if self.started is None:
                return None
            if kind == "run_end":
                self.ended = True
                return None
            number = int(event["turn"])
        except (ValueError, KeyError, TypeError):
            return None
        self.newest = max(self.newest, number)
        if kind == "turn_start":
            self.turn_began[number] = at
            return None
        thinking = event.get("thinking")
        if not isinstance(thinking, str) or thinking.strip() == "":
            return None
        t = round(self.turn_began.get(number, at) - self.started, 2)
        return Turn(turn=number, t=t, thinking=thinking, said=round(at - self.started, 2))


def read_turns(lines: Iterable[str], start: float = 0, end: float = float("inf")) -> list[Turn]:
    reader = TurnReader()
    found = (reader.feed(line) for line in lines)
    return [turn for turn in found if turn is not None and start <= turn.t < end]


def local_endpoint(url: str) -> bool:
    """Lines come from a model on this machine; a remote endpoint would be a paid or shared one."""
    parts = urlsplit(url)
    return parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")


def clean_line(reply: str) -> str | None:
    text = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL)
    text = " ".join(text.split()).strip("\"'“”‘’ ")
    spoken = text != "" and len(text.split()) <= MAX_WORDS and JARGON.search(text) is None
    return text if spoken else None


def ask_model(endpoint: str, model: str, post: Post, thinking: str) -> str:
    answer = post(
        f"{endpoint.rstrip('/')}/chat/completions",
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": thinking},
            ],
            "temperature": 0.4,
            "max_tokens": 200,
            "chat_template_kwargs": {"enable_thinking": False},
        },
    )
    try:
        content = cast(list[dict[str, dict[str, object]]], answer["choices"])[0]["message"][
            "content"
        ]
    except (KeyError, IndexError, TypeError):
        return ""
    return content if isinstance(content, str) else ""


def write_lines(
    turns: Sequence[Turn],
    existing: Sequence[Line],
    ask: Callable[[str], str],
    save: Callable[[list[Line]], None],
    log: Callable[[str], None],
) -> list[Line]:
    lines = list(existing)
    done = {line.turn for line in lines}
    try:
        for turn in turns:
            if turn.turn in done:
                continue
            text = next(filter(None, (clean_line(ask(turn.thinking)) for _ in range(TRIES))), None)
            if text is None:
                log(f"turn {turn.turn}: no usable line")
                continue
            lines.append(Line(turn=turn.turn, t=turn.t, text=text, wav=f"t{turn.turn:06d}.wav"))
            if len(lines) % SAVE_EVERY == 0:
                save(sorted(lines, key=lambda line: line.t))
    finally:
        lines.sort(key=lambda line: line.t)
        save(lines)
    return lines


def wav_bytes(voiced: Voiced) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(voiced.rate)
        wav.writeframes(voiced.pcm)
    return out.getvalue()


def voice_lines(
    lines: Sequence[Line],
    synth: Callable[[str], Voiced],
    write: Callable[[str, bytes], None],
    save: Callable[[list[Line]], None],
) -> list[Line]:
    out = list(lines)
    try:
        for index, line in enumerate(out):
            if line.seconds is not None:
                continue
            voiced = synth(line.text)
            write(line.wav, wav_bytes(voiced))
            out[index] = replace(line, seconds=round(len(voiced.pcm) / 2 / voiced.rate, 3))
            if index % SAVE_EVERY == 0:
                save(out)
    finally:
        save(out)
    return out


class LogTail:
    """Finished lines from a file still being written; a partial last line waits for its end."""

    def __init__(self, read: Callable[[int, int], bytes], chunk: int = CHUNK_BYTES) -> None:
        self.read = read
        self.chunk = chunk
        self.offset = 0
        self.rest = b""

    def lines(self) -> Iterator[str]:
        while True:
            data = self.read(self.offset, self.chunk)
            if data == b"":
                return
            self.offset += len(data)
            *whole, self.rest = (self.rest + data).split(b"\n")
            for line in whole:
                yield line.decode("utf-8", "replace")


@dataclass(frozen=True)
class Follow:
    read: Callable[[int, int], bytes]
    ask: Callable[[str], str]
    synth: Callable[[str], Voiced]
    write_wav: Callable[[str, bytes], None]
    save: Callable[[list[Line]], None]
    wait: Callable[[float], None]
    now: Callable[[], float]
    log: Callable[[str], None]


def say_turn(turn: Turn, deps: Follow) -> Line | None:
    """The wav lands before its line can, so a reader of the file never meets a missing sound."""
    try:
        text = next(filter(None, (clean_line(deps.ask(turn.thinking)) for _ in range(TRIES))), None)
        if text is None:
            deps.log(f"turn {turn.turn}: no usable line")
            return None
        voiced = deps.synth(text)
        wav = f"t{turn.turn:06d}.wav"
        deps.write_wav(wav, wav_bytes(voiced))
    except Exception as error:  # one bad turn must never end the follower
        deps.log(f"turn {turn.turn}: skipped: {error}")
        return None
    seconds = round(len(voiced.pcm) / 2 / voiced.rate, 3)
    return Line(turn.turn, turn.t, text, wav, seconds, turn.said)


def follow(deps: Follow, existing: Sequence[Line]) -> list[Line]:
    lines = list(existing)
    done = {line.turn for line in lines}
    reader = TurnReader()
    tail = LogTail(deps.read)
    waiting: list[Turn] = []
    heard = deps.now()
    while True:
        for raw in tail.lines():
            heard = deps.now()
            turn = reader.feed(raw)
            if turn is not None and turn.turn not in done:
                done.add(turn.turn)
                waiting.append(turn)
        current = [turn for turn in waiting if turn.turn >= reader.newest - STALE_TURNS]
        if len(current) < len(waiting):
            deps.log(f"dropped {len(waiting) - len(current)} stale turns")
        waiting = current
        if waiting:
            line = say_turn(waiting.pop(0), deps)
            if line is not None:
                lines.append(line)
                try:
                    deps.save(lines)
                except OSError as error:
                    deps.log(f"turn {line.turn}: not saved yet: {error}")
        elif reader.ended:
            return lines
        elif deps.now() - heard >= IDLE_END_S:
            deps.log("run log silent, stopping")
            return lines
        else:
            deps.wait(POLL_S)


def load_lines(text: str) -> list[Line]:
    lines: list[Line] = []
    for raw in text.splitlines():
        try:
            lines.append(Line(**json.loads(raw)))
        except (ValueError, TypeError):
            continue
    return lines


def dump_lines(lines: Sequence[Line]) -> str:  # pragma: no cover - the disk
    return "".join(json.dumps(asdict(line)) + "\n" for line in lines)


def _post(url: str, body: Json, timeout: float = 300) -> Json:  # pragma: no cover - the network
    request = urllib.request.Request(  # noqa: S310 - local_endpoint
        url, json.dumps(body).encode(), {"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - local_endpoint
        return cast(Json, json.load(response))


def _served_model(endpoint: str) -> str:  # pragma: no cover - the network
    url = f"{endpoint.rstrip('/')}/models"
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 - local_endpoint
        return str(json.load(response)["data"][0]["id"])


def _read_at(path: Path, offset: int, length: int) -> bytes:  # pragma: no cover - the disk
    with path.open("rb") as log:
        log.seek(offset)
        return log.read(length)


def _log_lines(path: Path) -> Iterator[str]:  # pragma: no cover - the disk
    with path.open(encoding="utf-8") as lines:
        yield from lines


def _synth(models: Path) -> Callable[[str], Voiced]:  # pragma: no cover - the voice model
    kokoro = importlib.import_module("kokoro_onnx").Kokoro(
        str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin")
    )
    numpy = importlib.import_module("numpy")

    def speak(text: str) -> Voiced:
        audio, rate = kokoro.create(text, voice=VOICE, speed=VOICE_SPEED, lang="en-us")
        pcm = (numpy.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        return Voiced(pcm=pcm, rate=int(rate))

    return speak


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entrypoint
    parser = argparse.ArgumentParser(prog="just broadcast-commentary")
    parser.add_argument("run")
    parser.add_argument("start", nargs="?", type=float, default=0.0)
    parser.add_argument("end", nargs="?", type=float, default=float("inf"))
    parser.add_argument("--endpoint", required=True, help="a local OpenAI-style /v1 address")
    parser.add_argument("--follow", action="store_true", help="tail a live run until it ends")
    parser.add_argument("--model", help="default: the first model the endpoint serves")
    parser.add_argument("--runs", type=Path, default=Path("runs"))
    parser.add_argument(
        "--kokoro",
        type=Path,
        default=Path(os.environ.get("KOKORO_MODELS", "~/.cache/pokebench/kokoro")).expanduser(),
    )
    args = parser.parse_args(argv)
    if Path(args.run).name != args.run:
        parser.error("run must be a run id")
    if not local_endpoint(args.endpoint):
        parser.error("--endpoint must be a loopback http address")
    if args.follow and (args.start != 0.0 or args.end != float("inf")):
        parser.error("--follow takes no time range")
    folder = args.runs / "broadcast" / args.run
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "commentary.jsonl"

    def save(lines: list[Line]) -> None:
        scratch = target.with_suffix(".tmp")
        scratch.write_text(dump_lines(lines), encoding="utf-8")
        scratch.replace(target)

    model = args.model or _served_model(args.endpoint)
    log_path = args.runs / args.run / "events.jsonl"
    existing = load_lines(target.read_text(encoding="utf-8")) if target.exists() else []
    if args.follow:
        post = functools.partial(_post, timeout=LIVE_TIMEOUT_S)
        lines = follow(
            Follow(
                read=functools.partial(_read_at, log_path),
                ask=lambda thinking: ask_model(args.endpoint, model, post, thinking),
                synth=_synth(args.kokoro),
                write_wav=lambda n, b: (folder / n).write_bytes(b) and None,
                save=save,
                wait=time.sleep,
                now=time.monotonic,
                log=functools.partial(print, flush=True),
            ),
            existing,
        )
        print(f"{len(lines)} lines in {target}")
        return 0
    turns = read_turns(_log_lines(log_path), args.start, args.end)
    lines = write_lines(
        turns,
        existing,
        lambda thinking: ask_model(args.endpoint, model, _post, thinking),
        save,
        print,
    )
    voice_lines(lines, _synth(args.kokoro), lambda n, b: (folder / n).write_bytes(b) and None, save)
    print(f"{len(lines)} lines in {target}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
