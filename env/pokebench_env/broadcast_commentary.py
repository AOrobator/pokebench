"""`just broadcast-commentary`: after a run, one short spoken line per turn, then its voice.

Lines go to runs/broadcast/<run>/commentary.jsonl with the wavs beside them. Nothing is written
under runs/<run>/. The file is rewritten after every line, so a stopped job keeps its work and
the next one carries on from it.
"""

import argparse
import importlib
import io
import json
import os
import re
import urllib.request
import wave
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import cast
from urllib.parse import urlsplit

MAX_WORDS = 19
TRIES = 2
VOICE = "af_heart"
VOICE_SPEED = 1.05
SYSTEM = (
    "You turn a game-playing AI's private thinking into one line it says aloud to a live "
    "audience watching it play Pokemon. First person. Under 20 words. Plain spoken words: "
    "no coordinates, tool names, numbers worked out step by step, or jargon. Say what you "
    "are doing or deciding right now and why. Reply with the line alone."
)

Json = dict[str, object]
Post = Callable[[str, Json], Json]


@dataclass(frozen=True)
class Turn:
    turn: int
    t: float
    thinking: str


@dataclass(frozen=True)
class Line:
    turn: int
    t: float
    text: str
    wav: str
    seconds: float | None = None


@dataclass(frozen=True)
class Voiced:
    pcm: bytes
    rate: int


def read_turns(lines: Iterable[str], start: float = 0, end: float = float("inf")) -> list[Turn]:
    """Each thought with the seconds since run_start at which it finished."""
    started: float | None = None
    turns: list[Turn] = []
    for line in lines:
        if '"type":"assistant"' not in line[:300] and '"type":"run_start"' not in line[:300]:
            continue
        try:
            event = json.loads(line)
            at = datetime.fromisoformat(event["t"]).timestamp()
        except (ValueError, KeyError, TypeError):
            continue
        if event.get("type") == "run_start":
            started = at
            continue
        thinking = event.get("thinking")
        if started is None or not isinstance(thinking, str) or thinking.strip() == "":
            continue
        t = round(at - started, 2)
        if start <= t < end:
            turns.append(Turn(turn=int(event["turn"]), t=t, thinking=thinking))
    return turns


def local_endpoint(url: str) -> bool:
    """Lines come from a model on this machine; a remote endpoint would be a paid or shared one."""
    parts = urlsplit(url)
    return parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")


def clean_line(reply: str) -> str | None:
    text = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL)
    text = " ".join(text.split()).strip("\"'“”‘’ ")
    return text if text != "" and len(text.split()) <= MAX_WORDS else None


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
        choices = cast(list[dict[str, dict[str, str]]], answer["choices"])
        return choices[0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""


def write_lines(
    turns: Sequence[Turn],
    existing: Sequence[Line],
    ask: Callable[[str], str],
    save: Callable[[list[Line]], None],
    log: Callable[[str], None],
) -> list[Line]:
    lines = list(existing)
    done = {line.turn for line in lines}
    for turn in turns:
        if turn.turn in done:
            continue
        text = next(filter(None, (clean_line(ask(turn.thinking)) for _ in range(TRIES))), None)
        if text is None:
            log(f"turn {turn.turn}: no usable line")
            continue
        lines.append(Line(turn=turn.turn, t=turn.t, text=text, wav=f"t{turn.turn:06d}.wav"))
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
    for index, line in enumerate(out):
        if line.seconds is not None:
            continue
        voiced = synth(line.text)
        write(line.wav, wav_bytes(voiced))
        out[index] = replace(line, seconds=round(len(voiced.pcm) / 2 / voiced.rate, 3))
        save(out)
    return out


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


def _post(url: str, body: Json) -> Json:  # pragma: no cover - the network
    request = urllib.request.Request(  # noqa: S310 - local_endpoint
        url, json.dumps(body).encode(), {"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=300) as response:  # noqa: S310 - local_endpoint
        return cast(Json, json.load(response))


def _served_model(endpoint: str) -> str:  # pragma: no cover - the network
    url = f"{endpoint.rstrip('/')}/models"
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 - local_endpoint
        return str(json.load(response)["data"][0]["id"])


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
    folder = args.runs / "broadcast" / args.run
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "commentary.jsonl"

    def save(lines: list[Line]) -> None:
        scratch = target.with_suffix(".tmp")
        scratch.write_text(dump_lines(lines), encoding="utf-8")
        scratch.replace(target)

    model = args.model or _served_model(args.endpoint)
    turns = read_turns(_log_lines(args.runs / args.run / "events.jsonl"), args.start, args.end)
    existing = load_lines(target.read_text(encoding="utf-8")) if target.exists() else []
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
