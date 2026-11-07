import io
import json
import wave
from pathlib import PurePosixPath

import pytest

from pokebench_env.broadcast_commentary import (
    Line,
    Turn,
    Voiced,
    ask_model,
    clean_line,
    load_lines,
    local_endpoint,
    read_turns,
    voice_lines,
    wav_bytes,
    write_lines,
)


def event(seconds: int, kind: str, turn: int = 1, **rest: object) -> str:
    stamp = f"2026-11-06T12:00:{seconds:02d}.500-05:00"
    body = {"v": 1, "seq": 1, "t": stamp, "type": kind, "turn": turn, **rest}
    return json.dumps(body, separators=(",", ":"))


START = event(0, "run_start", 0)


def test_turns_come_from_each_assistant_thought_timed_from_run_start() -> None:
    turns = read_turns(
        [START, event(5, "assistant", thinking="Go up."), "not json", event(7, "state")]
    )
    assert turns == [Turn(turn=1, t=5.0, thinking="Go up.")]


def test_a_line_starts_when_its_turn_starts() -> None:
    lines = [START, event(3, "turn_start"), event(5, "assistant", thinking="Go up.")]
    assert read_turns(lines) == [Turn(turn=1, t=3.0, thinking="Go up.")]


def test_a_turn_with_no_thinking_has_nothing_to_say() -> None:
    assert (
        read_turns([START, event(5, "assistant", text="ok"), event(6, "assistant", thinking="  ")])
        == []
    )


def test_range_keeps_only_turns_inside_it() -> None:
    lines = [START, event(5, "assistant", 1, thinking="a"), event(9, "assistant", 2, thinking="b")]
    assert [t.turn for t in read_turns(lines, 6, 20)] == [2]
    assert [t.turn for t in read_turns(lines, 0, 6)] == [1]


def test_events_before_run_start_are_ignored() -> None:
    assert read_turns([event(5, "assistant", thinking="a")]) == []


@pytest.mark.parametrize(
    ("reply", "line"),
    [
        ('"Rock Tomb first, it hits hardest."', "Rock Tomb first, it hits hardest."),
        ("“I'll heal.”\n", "I'll heal."),
        ("<think>hm</think>I'll go north.", "I'll go north."),
        ("one two\nthree", "one two three"),
        ("", None),
        ("word " * 20, None),
    ],
)
def test_a_reply_becomes_one_short_line_or_nothing(reply: str, line: str | None) -> None:
    assert clean_line(reply) == line


def test_the_model_gets_the_whole_thinking_with_its_own_thinking_off() -> None:
    seen: list[dict[str, object]] = []

    def post(url: str, body: dict[str, object]) -> dict[str, object]:
        seen.append({"url": url, **body})
        return {"choices": [{"message": {"content": "Going north."}}]}

    long = "x " * 5000
    assert ask_model("http://127.0.0.1:9/v1", "m", post, long) == "Going north."
    assert seen[0]["url"] == "http://127.0.0.1:9/v1/chat/completions"
    assert seen[0]["model"] == "m"
    assert seen[0]["chat_template_kwargs"] == {"enable_thinking": False}
    messages = seen[0]["messages"]
    assert isinstance(messages, list)
    assert messages[1] == {"role": "user", "content": long}


def test_a_malformed_answer_says_nothing() -> None:
    assert ask_model("u", "m", lambda _u, _b: {"nope": 1}, "x") == ""
    null = {"choices": [{"message": {"content": None}}]}
    assert ask_model("u", "m", lambda _u, _b: null, "x") == ""


def test_writes_a_line_per_turn_keeps_old_ones_and_retries_a_long_reply() -> None:
    replies = iter(["word " * 30, "Short now."])
    saved: list[list[Line]] = []
    old = Line(turn=1, t=1.0, text="Old.", wav="t000001.wav", seconds=2.0)
    turns = [Turn(1, 1.0, "a"), Turn(2, 5.0, "b")]
    out = write_lines(turns, [old], lambda _t: next(replies), saved.append, lambda _m: None)
    assert out == [old, Line(turn=2, t=5.0, text="Short now.", wav="t000002.wav")]
    assert saved[-1] == out


def test_a_turn_the_model_never_gets_short_is_left_out_and_logged() -> None:
    logs: list[str] = []
    out = write_lines(
        [Turn(2, 5.0, "b")], [], lambda _t: "word " * 30, lambda _l: None, logs.append
    )
    assert out == []
    assert "turn 2" in logs[0]


def test_a_failing_endpoint_stops_the_job_with_finished_lines_saved() -> None:
    saved: list[list[Line]] = []

    def ask(thinking: str) -> str:
        if thinking == "b":
            raise OSError("refused")
        return "Fine."

    with pytest.raises(OSError, match="refused"):
        write_lines([Turn(1, 1.0, "a"), Turn(2, 2.0, "b")], [], ask, saved.append, lambda _m: None)
    assert [line.turn for line in saved[-1]] == [1]


def test_voices_only_lines_without_sound_and_records_their_length() -> None:
    done = Line(turn=1, t=1.0, text="Done.", wav="t000001.wav", seconds=2.0)
    new = Line(turn=2, t=5.0, text="New.", wav="t000002.wav")
    written: dict[str, bytes] = {}
    saved: list[list[Line]] = []

    def synth(text: str) -> Voiced:
        assert text == "New."
        return Voiced(pcm=b"\0\0" * 24000, rate=24000)

    out = voice_lines([done, new], synth, written.__setitem__, saved.append)
    assert out[1].seconds == 1.0
    assert set(written) == {"t000002.wav"}
    assert saved[-1] == out


def test_wav_bytes_is_a_real_mono_wav() -> None:
    with wave.open(io.BytesIO(wav_bytes(Voiced(pcm=b"\0\0" * 10, rate=24000)))) as read:
        assert (read.getnchannels(), read.getframerate(), read.getnframes()) == (1, 24000, 10)


def test_load_reads_the_file_the_viewer_reads() -> None:
    text = json.dumps({"turn": 3, "t": 2.5, "text": "Hi.", "wav": "t000003.wav", "seconds": 1.5})
    assert load_lines(f"{text}\nbad\n") == [Line(3, 2.5, "Hi.", "t000003.wav", 1.5)]


def test_only_a_local_endpoint_is_accepted() -> None:
    assert local_endpoint("http://127.0.0.1:8123/v1")
    assert local_endpoint("http://localhost:8123/v1")
    assert not local_endpoint("https://api.example.com/v1")
    assert not local_endpoint("file:///etc/passwd")


def test_wav_names_stay_inside_the_folder() -> None:
    assert PurePosixPath(Line(3, 1.0, "x", "t000003.wav").wav).name == "t000003.wav"
