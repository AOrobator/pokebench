import io
import json
import wave
from collections.abc import Callable
from dataclasses import replace
from pathlib import PurePosixPath

import pytest

from pokebench_env.broadcast_commentary import (
    IDLE_END_S,
    Follow,
    Line,
    LogTail,
    Turn,
    Voiced,
    ask_model,
    clean_line,
    follow,
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
    assert turns == [Turn(turn=1, t=5.0, thinking="Go up.", said=5.0)]


def test_a_line_starts_when_its_turn_starts() -> None:
    lines = [START, event(3, "turn_start"), event(5, "assistant", thinking="Go up.")]
    assert read_turns(lines) == [Turn(turn=1, t=3.0, thinking="Go up.", said=5.0)]


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
        ("I'll press B to stay in.", None),
        ("Surf will OHKO it.", None),
        ("Surf OHKOs it.", None),
        ("I pressed A.", None),
        ("I'll KO Altaria.", None),
        ("My HP is low.", None),
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


class FakeRun:
    """A growing log: each wait lets the next batch of bytes land, as a live run does."""

    def __init__(self, *batches: str) -> None:
        self.log = b""
        self.batches = [batch.encode() for batch in batches]
        self.spoken: list[str] = []
        self.wavs: dict[str, bytes] = {}
        self.saves: list[list[Line]] = []
        self.logs: list[str] = []
        self.waits = 0
        self.clock = 0.0
        self.ask: Callable[[str], str] = self.reply
        self.synth: Callable[[str], Voiced] = self.voice

    def read(self, offset: int, length: int) -> bytes:
        return self.log[offset : offset + length]

    def reply(self, thinking: str) -> str:
        self.spoken.append(thinking)
        return f"Saying {thinking}."

    def voice(self, _text: str) -> Voiced:
        return Voiced(pcm=b"\0\0" * 12000, rate=24000)

    def wait(self, seconds: float) -> None:
        self.waits += 1
        self.clock += seconds
        if self.batches:
            self.log += self.batches.pop(0)

    def deps(self) -> Follow:
        return Follow(
            read=self.read,
            ask=lambda thinking: self.ask(thinking),
            synth=lambda text: self.synth(text),
            write_wav=self.wavs.__setitem__,
            save=lambda lines: self.saves.append(list(lines)),
            wait=self.wait,
            now=lambda: self.clock,
            log=self.logs.append,
        )


def thought(seconds: int, turn: int, thinking: str) -> str:
    began = event(seconds, "turn_start", turn)
    return f"{began}\n{event(seconds + 1, 'assistant', turn, thinking=thinking)}\n"


END = event(50, "run_end", 9) + "\n"
HEAD = START + "\n"


def test_tail_gives_only_finished_lines_and_holds_a_partial_one() -> None:
    log = b"one\ntw"
    tail = LogTail(lambda offset, length: log[offset : offset + length], chunk=3)
    assert list(tail.lines()) == ["one"]
    log += b"o\n"
    assert list(tail.lines()) == ["two"]
    assert list(tail.lines()) == []


def test_each_finished_thought_gets_its_line_and_wav_as_the_run_goes() -> None:
    run = FakeRun(HEAD, thought(1, 1, "a"), thought(3, 2, "b"), END)
    lines = follow(run.deps(), [])
    assert [(line.turn, line.t, line.said, line.seconds) for line in lines] == [
        (1, 1.0, 2.0, 0.5),
        (2, 3.0, 4.0, 0.5),
    ]
    assert set(run.wavs) == {"t000001.wav", "t000002.wav"}
    assert [len(saved) for saved in run.saves] == [1, 2]


def test_a_saved_line_already_has_its_wav() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)
    seen: list[bool] = []
    deps = replace(run.deps(), save=lambda lines: seen.append(lines[-1].wav in run.wavs))
    follow(deps, [])
    assert seen == [True]


def test_a_thought_still_being_written_waits_for_its_newline() -> None:
    whole = HEAD + thought(1, 1, "a")
    run = FakeRun(whole[:-5], whole[-5:], END)
    assert [line.turn for line in follow(run.deps(), [])] == [1]


def test_turns_already_said_are_not_said_again() -> None:
    old = Line(turn=1, t=1.0, text="Old.", wav="t000001.wav", seconds=1.0)
    run = FakeRun(HEAD + thought(1, 1, "a") + thought(3, 2, "b") + END)
    assert [line.turn for line in follow(run.deps(), [old])] == [1, 2]
    assert run.spoken == ["b"]


def test_a_backlog_keeps_only_the_turns_within_two_of_the_newest() -> None:
    backlog = "".join(thought(turn, turn, f"t{turn}") for turn in range(1, 8))
    run = FakeRun(HEAD + backlog + END)
    follow(run.deps(), [])
    assert run.spoken == ["t5", "t6", "t7"]
    assert any("4 stale" in message for message in run.logs)


def test_falling_behind_drops_a_stale_turn_while_running() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + thought(2, 2, "b"), END)

    def slow(thinking: str) -> str:
        if thinking == "a":
            run.log += "".join(thought(turn, turn, f"t{turn}") for turn in (3, 4, 5)).encode()
        return run.reply(thinking)

    run.ask = slow
    follow(run.deps(), [])
    assert run.spoken == ["a", "t3", "t4", "t5"]


def test_a_turn_with_no_thought_yet_still_counts_as_the_run_moving_on() -> None:
    late = event(9, "turn_start", 9) + "\n"
    run = FakeRun(HEAD + thought(1, 1, "a") + late + END)
    follow(run.deps(), [])
    assert run.spoken == []


def test_a_model_server_hiccup_skips_that_turn_and_carries_on() -> None:
    run = FakeRun(HEAD, thought(1, 1, "a"), thought(3, 2, "b"), END)

    def flaky(thinking: str) -> str:
        if thinking == "a":
            raise OSError("connection refused")
        return run.reply(thinking)

    run.ask = flaky
    assert [line.turn for line in follow(run.deps(), [])] == [2]
    assert any("turn 1" in message and "refused" in message for message in run.logs)


def test_a_failing_voice_skips_that_turn_too() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)

    def broken(_text: str) -> Voiced:
        raise RuntimeError("onnx")

    run.synth = broken
    assert follow(run.deps(), []) == []
    assert run.wavs == {}


def test_a_failed_save_keeps_the_line_for_the_next_save() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a"), thought(3, 2, "b"), END)
    tried: list[int] = []

    def disk(lines: list[Line]) -> None:
        tried.append(len(lines))
        if len(tried) == 1:
            raise OSError("no space")

    assert len(follow(replace(run.deps(), save=disk), [])) == 2
    assert tried == [1, 2]


def test_no_usable_line_skips_the_turn() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)
    run.ask = lambda thinking: "word " * 30
    assert follow(run.deps(), []) == []
    assert any("turn 1" in message for message in run.logs)


def test_stops_when_the_run_ends_after_finishing_what_is_waiting() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)
    assert [line.turn for line in follow(run.deps(), [])] == [1]
    assert run.waits == 1


def test_a_run_that_dies_with_no_end_line_stops_after_a_long_silence() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a"))
    assert [line.turn for line in follow(run.deps(), [])] == [1]
    assert run.clock >= IDLE_END_S
    assert any("silent" in message for message in run.logs)


def test_new_bytes_of_any_kind_reset_the_silence() -> None:
    state = event(7, "state") + "\n"
    run = FakeRun(HEAD, state, state, state, END)

    def long_wait(seconds: float) -> None:
        run.wait(seconds)
        run.clock += IDLE_END_S - 1

    assert follow(replace(run.deps(), wait=long_wait), []) == []
    assert not any("silent" in message for message in run.logs)


def test_a_bad_line_in_the_log_is_skipped() -> None:
    bad = '{"type":"assistant","t":"2026-11-06T12:00:09.500-05:00"}\nnot json\n'
    run = FakeRun(HEAD + bad + thought(1, 1, "a") + END)
    assert [line.turn for line in follow(run.deps(), [])] == [1]
