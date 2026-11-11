import io
import json
import wave
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path, PurePosixPath

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


def test_a_last_save_that_failed_is_tried_again_before_stopping() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)
    tried: list[int] = []

    def disk(lines: list[Line]) -> None:
        tried.append(len(lines))
        if len(tried) == 1:
            raise OSError("no space")

    assert len(follow(replace(run.deps(), save=disk), [])) == 1
    assert tried == [1, 1]


def test_a_last_save_that_keeps_failing_stops_loudly() -> None:
    run = FakeRun(HEAD + thought(1, 1, "a") + END)

    def disk(_lines: list[Line]) -> None:
        raise OSError("no space")

    with pytest.raises(OSError, match="no space"):
        follow(replace(run.deps(), save=disk), [])


def test_a_recovered_older_turn_is_saved_in_time_order() -> None:
    later = Line(turn=3, t=3.0, text="Later.", wav="t000003.wav", seconds=1.0)
    run = FakeRun(HEAD + thought(1, 1, "a") + thought(3, 3, "c") + END)
    assert [line.turn for line in follow(run.deps(), [later])] == [1, 3]
    assert [line.turn for line in run.saves[-1]] == [1, 3]


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


# ---------------------------------------------------------------- Piece 11: Claude-written lines

from pokebench_env.broadcast_commentary import (  # noqa: E402
    BATCH,
    Batch,
    ClaudeReply,
    Done,
    Options,
    Step,
    batch_prompt,
    claude_argv,
    claude_env,
    covered_turns,
    options_problem,
    parse_batch,
    parse_claude,
    private_reason,
    read_steps,
    run_claude,
    tool_summary,
    write_claude_lines,
)


def test_steps_keep_every_assistant_turn_with_its_text_and_tool_call() -> None:
    lines = [
        START,
        event(2, "turn_start", 1),
        event(3, "assistant", 1, thinking="", text="Heading north."),
        event(3, "tool_call", 1, name="navigate_to", args={"x": 14, "y": 7}),
        event(4, "turn_start", 2),
        event(5, "assistant", 2, thinking="Rayquaza is here.", text="Throwing the ball."),
        event(5, "tool_call", 2, name="press", args={"buttons": ["A"]}),
        event(6, "tool_call", 9, name="observe", args={}),
        "garbage",
    ]
    assert read_steps(lines) == [
        Step(1, 2.0, "", "Heading north.", ('navigate_to {"x":14,"y":7}',)),
        Step(2, 4.0, "Rayquaza is here.", "Throwing the ball.", ('press {"buttons":["A"]}',)),
    ]
    assert [s.turn for s in read_steps(lines, 3, 10)] == [2]


def test_steps_tolerate_missing_fields() -> None:
    lines = [START, event(3, "assistant", 1), event(3, "tool_call", 1, args={})]
    assert read_steps(lines) == [Step(1, 3.0, "", "", ("? {}",))]
    assert read_steps([event(3, "assistant", 1)]) == []
    assert read_steps([START, event(3, "assistant", 1).replace('"turn":1', '"turn":"x"')]) == []


def test_tool_summary_is_the_name_and_compact_arguments() -> None:
    assert tool_summary("observe", {}) == "observe {}"
    assert tool_summary("press", None) == "press"


def test_the_prompt_carries_every_turn_and_the_earlier_lines() -> None:
    steps = [Step(10, 3725.4, "think", "said", ("press {}",)), Step(11, 3730.0, "", "", ())]
    prompt = batch_prompt(steps, ["I'm off to the tower."])
    assert "I'm off to the tower." in prompt
    body = json.loads(prompt[prompt.index("[{") : prompt.rindex("}]") + 2])
    assert body[0] == {
        "turn": 10,
        "at": "1:02:05",
        "thinking": "think",
        "said": "said",
        "did": ["press {}"],
    }
    assert body[1]["turn"] == 11
    assert "(none)" in batch_prompt(steps, [])


@pytest.mark.parametrize(
    ("reply", "want"),
    [
        ('[{"turn": 1, "line": "Hi."}, {"turn": 2, "line": ""}]', {1: "Hi.", 2: ""}),
        ('```json\n[{"turn": 2, "line": "Go."}]\n```', {2: "Go."}),
        ("Here you go: [] done", {}),
        ("not json", None),
        ('{"turn": 1}', None),
        ('[{"turn": 7, "line": "x"}]', None),
        ('[{"turn": 1, "line": 3}]', None),
        ('[{"turn": "1", "line": "x"}]', None),
        ('[{"turn": true, "line": "x"}]', None),
        ('[{"turn": 1, "line": "a"}, {"turn": 1, "line": "b"}]', None),
        ("[1]", None),
        ("[", None),
    ],
)
def test_a_batch_reply_parses_only_when_every_turn_is_in_the_batch(
    reply: str, want: dict[int, str] | None
) -> None:
    assert parse_batch(reply, {1, 2}) == want


@pytest.mark.parametrize(
    "line",
    [
        "I saved it in /Users/me/run.",
        "Look at ~/dev/thing.",
        "See https://example.com now.",
        "Off to www.example.org today.",
        "The box at 192.168.1.20 helps.",
        "Mail me at someone@example.com.",
        "My host viewer.example.ts.net is busy.",
        "Running on localhost again.",
        "The operator would like this.",
        "The events.jsonl file grew.",
        "Check C:\\games now.",
    ],
)
def test_private_details_are_refused(line: str) -> None:
    assert private_reason(line, ["The operator", "Orobator"]) is not None


@pytest.mark.parametrize(
    "line",
    [
        "Rayquaza is mine, caught with the Master Ball!",
        "I'll run from this Golbat and keep climbing.",
        "Mr. Briney and/or the sailor can help.",
        "Two down, 3/4 of the way there.",
        "Andrewsville is not a word here.",
    ],
)
def test_ordinary_lines_pass_the_privacy_scrub(line: str) -> None:
    assert private_reason(line, ["The operator", ""]) is None


def reply(text: str, cost: float = 0.01, error: str | None = None) -> ClaudeReply:
    return ClaudeReply(text=text, cost=cost, error=error)


def steps(*turns: int) -> list[Step]:
    return [Step(n, float(n * 10), "", f"turn {n}", ()) for n in turns]


def answer(pairs: dict[int, str]) -> str:
    return json.dumps([{"turn": k, "line": v} for k, v in pairs.items()])


def test_claude_lines_come_in_batches_with_earlier_lines_for_continuity() -> None:
    prompts: list[str] = []
    answers = iter(
        [
            answer({1: "I'm heading for the tower.", 2: ""}),
            answer({3: "Rayquaza, here I come!"}),
        ]
    )

    def ask(prompt: str) -> ClaudeReply:
        prompts.append(prompt)
        return reply(next(answers))

    saved: list[list[Line]] = []
    batches: list[Batch] = []
    done = write_claude_lines(
        steps(1, 2, 3), [], set(), ask, saved.append, batches.append, lambda _m: None, [], size=2
    )
    assert done.lines == [
        Line(1, 10.0, "I'm heading for the tower.", "t000001.wav"),
        Line(3, 30.0, "Rayquaza, here I come!", "t000003.wav"),
    ]
    assert "I'm heading for the tower." in prompts[1]
    assert [(b.first, b.last, b.turns, b.lines, b.tries, b.ok) for b in batches] == [
        (1, 2, 2, 1, 1, True),
        (3, 3, 1, 1, 1, True),
    ]
    assert done == Done(done.lines, calls=2, cost=0.02, retries=0, refused=0, failed=0)
    assert saved[-1] == done.lines
    assert len(saved) == 3


def test_a_bad_batch_is_retried_and_then_given_up() -> None:
    logs: list[str] = []
    answers = iter(
        ["not json", answer({1: "Got it."}), "nope", "nope", "nope", answer({5: "Done."})]
    )
    batches: list[Batch] = []
    done = write_claude_lines(
        steps(1, 2, 3, 4, 5),
        [],
        set(),
        lambda _p: reply(next(answers)),
        lambda _l: None,
        batches.append,
        logs.append,
        [],
        size=2,
    )
    assert [line.turn for line in done.lines] == [1, 5]
    assert done.calls == 6
    assert done.retries == 3
    assert done.failed == 1
    assert [b.ok for b in batches] == [True, False, True]
    assert any("turns 3-4" in log for log in logs)


def test_long_jargon_and_private_lines_are_dropped_and_logged() -> None:
    logs: list[str] = []
    pairs = {
        1: "word " * 25,
        2: "I'll press A.",
        3: "Saved in /Users/x.",
        4: "The operator cheers.",
        5: "Fine.",
    }
    done = write_claude_lines(
        steps(1, 2, 3, 4, 5),
        [],
        set(),
        lambda _p: reply(answer(pairs)),
        lambda _l: None,
        lambda _b: None,
        logs.append,
        ["The operator"],
    )
    assert [line.text for line in done.lines] == ["Fine."]
    assert done.refused == 4
    assert sum("refused" in log for log in logs) == 4


def test_covered_turns_and_old_lines_are_not_asked_again() -> None:
    prompts: list[str] = []

    def ask(prompt: str) -> ClaudeReply:
        prompts.append(prompt)
        return reply(answer({3: "New."}))

    old = Line(2, 20.0, "Old.", "t000002.wav", seconds=1.0)
    done = write_claude_lines(
        steps(1, 2, 3), [old], {1}, ask, lambda _l: None, lambda _b: None, lambda _m: None, []
    )
    assert [line.turn for line in done.lines] == [2, 3]
    assert '"turn":1' not in prompts[0].replace(" ", "")
    assert "Old." in prompts[0]
    nothing = write_claude_lines(
        steps(1), [], {1}, ask, lambda _l: None, lambda _b: None, lambda _m: None, []
    )
    assert nothing.calls == 0


def test_a_claude_that_keeps_failing_stops_the_job_with_lines_saved() -> None:
    answers = iter([reply(answer({1: "First."})), *[reply("", 0, "auth expired")] * 3])
    saved: list[list[Line]] = []
    with pytest.raises(RuntimeError, match="auth expired"):
        write_claude_lines(
            steps(1, 2),
            [],
            set(),
            lambda _p: next(answers),
            saved.append,
            lambda _b: None,
            lambda _m: None,
            [],
            size=1,
        )
    assert [line.turn for line in saved[-1]] == [1]


def test_one_failed_call_then_a_good_one_carries_on() -> None:
    answers = iter([reply("", 0, "overloaded"), reply(answer({1: "Back."}), 0.02)])
    done = write_claude_lines(
        steps(1),
        [],
        set(),
        lambda _p: next(answers),
        lambda _l: None,
        lambda _b: None,
        lambda _m: None,
        [],
    )
    assert [line.text for line in done.lines] == ["Back."]
    assert (done.calls, done.retries, done.cost) == (2, 1, 0.02)


def test_covered_turns_come_from_the_batch_log() -> None:
    log = "\n".join(
        [
            json.dumps(asdict_batch(Batch(1, 3, 3, 1, 1, 0.01, True, [1, 2, 3]))),
            json.dumps(asdict_batch(Batch(4, 5, 2, 0, 3, 0.03, False, [4, 5]))),
            "junk",
            json.dumps({"ok": True, "covered": "x"}),
        ]
    )
    assert covered_turns(log) == {1, 2, 3}


def asdict_batch(batch: Batch) -> dict[str, object]:
    from dataclasses import asdict

    return asdict(batch)


def test_the_claude_call_has_no_tools_no_session_and_its_own_system_prompt() -> None:
    argv = claude_argv("claude", "claude-sonnet-5-5")
    assert argv[:4] == ["claude", "-p", "--model", "claude-sonnet-5-5"]
    assert argv[argv.index("--output-format") + 1] == "json"
    assert argv[argv.index("--tools") + 1] == ""
    assert argv[argv.index("--setting-sources") + 1] == ""
    assert "--no-session-persistence" in argv
    assert "--strict-mcp-config" in argv
    assert "Pokemon" in argv[argv.index("--system-prompt") + 1]


def test_the_claude_env_keeps_only_the_basics_and_the_chosen_login() -> None:
    source = {"HOME": "/h", "PATH": "/p", "LC_ALL": "C", "ANTHROPIC_API_KEY": "k", "SECRET": "s"}
    assert claude_env(source, None) == {"HOME": "/h", "PATH": "/p", "LC_ALL": "C"}
    assert claude_env(source, "/h/.claude-review")["CLAUDE_CONFIG_DIR"] == "/h/.claude-review"


@pytest.mark.parametrize(
    ("stdout", "code", "want"),
    [
        ('{"result": "[]", "is_error": false, "total_cost_usd": 0.5}', 0, reply("[]", 0.5)),
        (
            '{"result": "OAuth expired", "is_error": true, "total_cost_usd": 0}',
            1,
            reply("", 0.0, "OAuth expired"),
        ),
        ('{"result": 5}', 0, reply("", 0.0)),
        ("crash", 2, reply("", 0.0, "claude exited 2: oops")),
        ("[1]", 0, reply("", 0.0, "claude exited 0: oops")),
    ],
)
def test_claude_output_is_read_into_text_cost_and_error(
    stdout: str, code: int, want: ClaudeReply
) -> None:
    assert parse_claude(stdout, "oops", code) == want


def test_run_claude_passes_the_prompt_on_stdin_from_an_empty_folder() -> None:
    seen: list[tuple[list[str], str, str, dict[str, str]]] = []

    def runner(argv: list[str], stdin: str, cwd: str, env: dict[str, str]) -> tuple[str, str, int]:
        seen.append((argv, stdin, cwd, env))
        return '{"result": "[]", "total_cost_usd": 0.1}', "", 0

    got = run_claude(runner, ["claude"], "/empty", {"HOME": "/h"}, "the prompt")
    assert got == reply("[]", 0.1)
    assert seen == [(["claude"], "the prompt", "/empty", {"HOME": "/h"})]


def test_a_runner_that_raises_is_a_failed_call() -> None:
    def runner(argv: list[str], stdin: str, cwd: str, env: dict[str, str]) -> tuple[str, str, int]:
        raise TimeoutError("timed out after 600s")

    assert run_claude(runner, [], "/e", {}, "p") == reply("", 0.0, "timed out after 600s")


def test_default_options_keep_todays_voice_and_writer() -> None:
    options = Options(run="run1", endpoint="http://127.0.0.1:9/v1")
    assert (options.voice, options.lang, options.speed, options.writer) == (
        "af_heart",
        "en-us",
        1.05,
        "local",
    )
    assert (options.lines_only, options.voice_only, options.out) == (False, False, None)
    assert (options.start, options.end) == (0.0, float("inf"))
    assert options_problem(options) is None


def test_claude_writer_options_need_no_endpoint() -> None:
    options = Options(
        run="run1",
        writer="claude",
        claude_model="claude-sonnet-5-5",
        voice="bm_lewis",
        lang="en-gb",
        speed=0.95,
        lines_only=True,
    )
    assert options_problem(options) is None
    assert options_problem(Options(run="run1", voice_only=True)) is None


LOCAL = "http://127.0.0.1:9/v1"


@pytest.mark.parametrize(
    "options",
    [
        Options(run="../x", endpoint=LOCAL),
        Options(run="run1"),
        Options(run="run1", endpoint="https://api.example.com/v1"),
        Options(run="run1", writer="claude"),
        Options(run="run1", writer="claude", claude_model="m", follow=True),
        Options(run="run1", endpoint=LOCAL, follow=True, start=5.0),
        Options(run="run1", endpoint=LOCAL, lines_only=True, voice_only=True),
        Options(run="run1", endpoint=LOCAL, follow=True, voice_only=True),
        Options(run="run1", endpoint=LOCAL, speed=0),
        Options(run="run1", endpoint=LOCAL, writer="other"),
    ],
)
def test_bad_option_combinations_are_refused(options: Options) -> None:
    assert options_problem(options) is not None


def test_a_job_with_a_skipped_batch_is_not_complete() -> None:
    assert Done([], 1, 0.0, 0, 0, 0).complete
    assert not Done([], 3, 0.0, 2, 0, 1).complete


def test_a_nonzero_exit_is_a_failure_even_with_a_good_looking_result() -> None:
    got = parse_claude('{"result": "[]", "is_error": false, "total_cost_usd": 0.2}', "boom", 1)
    assert got == reply("", 0.2, "claude exited 1: boom")


def test_the_machine_name_is_a_private_word() -> None:
    names = ["The operator", "studio-host", "studio-host.local"]
    assert private_reason("I am using studio-host to plan.", names) is not None


def test_batch_size_is_twenty_to_thirty() -> None:
    assert 20 <= BATCH <= 30


from pokebench_env.broadcast_commentary import gateway_calls, join_thinking  # noqa: E402


def stream(thinking: list[str], text: str | None) -> str:
    blocks = [{"type": "thinking", "thinking": t} for t in thinking]
    lines = [
        json.dumps({"type": "system", "subtype": "init"}),
        json.dumps({"type": "assistant", "message": {"content": blocks}}),
        "not json",
    ]
    if text is not None:
        reply = json.dumps({"name": "press", "arguments": {}, "text": text})
        lines.append(json.dumps({"type": "result", "result": reply}))
    return "\n".join(lines)


def test_gateway_calls_pair_each_request_with_its_reply_text_and_thinking() -> None:
    log = "\n".join(
        [
            json.dumps({"request": 1, "record": "call-1-1.jsonl"}),
            json.dumps({"request": 2, "record": "call-2-1.jsonl"}),
            json.dumps({"request": 2, "record": "call-2-2.jsonl"}),
            json.dumps({"request": 3, "record": "../evil.jsonl"}),
            json.dumps({"request": "4", "record": "call-4-1.jsonl"}),
            json.dumps({"request": 5, "record": "call-5-1.jsonl"}),
            "junk",
        ]
    )
    records = {
        "call-1-1.jsonl": stream(["Rayquaza ", "is here."], "Throwing."),
        "call-2-1.jsonl": stream(["first try"], None),
        "call-2-2.jsonl": stream([], "Walking."),
        "call-5-1.jsonl": json.dumps({"type": "result", "result": "[1]"}),
    }
    read: list[str] = []

    def reader(name: str) -> str | None:
        read.append(name)
        return records.get(name)

    assert gateway_calls(log, reader) == [
        (1, "Throwing.", "Rayquaza is here."),
        (2, "Walking.", ""),
    ]
    assert "../evil.jsonl" not in read


def test_result_text_that_is_not_a_reply_object_is_left_out() -> None:
    log = json.dumps({"request": 1, "record": "a.jsonl"})
    bad = [
        json.dumps({"type": "result", "result": "plain words"}),
        json.dumps({"type": "result", "result": "[1]"}),
        json.dumps({"type": "result", "result": json.dumps({"text": 3})}),
        json.dumps({"type": "result", "result": 7}),
        json.dumps({"type": "assistant", "message": {"content": "x"}}),
        json.dumps({"type": "assistant", "message": {"content": [{"type": "thinking"}, 5]}}),
        json.dumps([1]),
    ]
    for line in bad:
        assert gateway_calls(log, lambda _n, body=line: body) == []


def test_thinking_joins_a_step_only_when_turn_and_text_match() -> None:
    plain = [
        Step(1, 1.0, "", "Throwing."),
        Step(2, 2.0, "", "Walking."),
        Step(3, 3.0, "already", "Same."),
    ]
    calls = [
        (1, "Throwing.", "Rayquaza is here."),
        (2, "Other.", "wrong turn"),
        (3, "Same.", "new"),
    ]
    joined, matched, mismatched = join_thinking(plain, calls)
    assert [s.thinking for s in joined] == ["Rayquaza is here.", "", "already"]
    assert (matched, mismatched) == (1, 1)


@pytest.mark.parametrize(
    ("result", "text"),
    [
        ('```json\n{"name":"press","arguments":{},"text":"Fenced."}\n```', "Fenced."),
        (
            'I will heal first.\n{"name":"press","arguments":{},"text":"After prose."}',
            "After prose.",
        ),
        ('{"oops": 1} then {"name":"press","arguments":{}}', ""),
        ('{"name":"press","text":{"a":1}}', '{"a": 1}'),
        ("nothing {here", None),
    ],
)
def test_gateway_replies_are_read_the_way_the_gateway_reads_them(
    result: str, text: str | None
) -> None:
    log = json.dumps({"request": 1, "record": "a.jsonl"})
    record = json.dumps({"type": "result", "result": result})
    want = [] if text is None else [(1, text, "")]
    assert gateway_calls(log, lambda _n: record) == want


# ---------------------------------------------------------------- Piece 12: side files for /broadcast

from pokebench_env.broadcast_commentary import cost_rows, scrub_private, thinking_rows  # noqa: E402


def test_scrub_blanks_every_private_kind_and_keeps_the_rest() -> None:
    text = (
        "Rayquaza at 20/45 HP. See /Users/someone/x and https://a.b/c, mail a@b.com, "
        "ip 10.0.0.2, host box.local, file notes.md, the operator said hi, on mymac today."
    )
    out = scrub_private(text, ["The operator", "mymac", ""])
    for gone in ("/Users", "https", "a@b.com", "10.0.0.2", "box.local", "notes.md", "The operator", "mymac"):
        assert gone not in out
    assert out.startswith("Rayquaza at 20/45 HP. See … and …")
    assert "today." in out


def test_thinking_rows_keep_turns_with_thinking_scrubbed() -> None:
    steps = [Step(1, 1.0, "Go to /tmp/x now.", "a"), Step(2, 2.0, "", "b"), Step(3, 3.0, "Throw.", "c")]
    assert thinking_rows(steps, []) == [
        {"turn": 1, "thinking": "Go to … now."},
        {"turn": 3, "thinking": "Throw."},
    ]


def test_cost_rows_take_each_requests_last_session_total_in_turn_order() -> None:
    row = lambda request, attempt, total: json.dumps(  # noqa: E731
        {"request": request, "attempt": attempt, "session_cost_total_usd": total}
    )
    log = "\n".join(
        [
            row(2, 1, 0.5),
            row(1, 1, 0.2),
            row(2, 2, 0.7),
            json.dumps({"request": 3, "session_cost_total_usd": True}),
            json.dumps({"request": "4", "session_cost_total_usd": 1.0}),
            json.dumps({"request": 5}),
            "junk",
            row(6, 1, 0.9),
        ]
    )
    assert cost_rows(log) == [
        {"turn": 1, "usd": 0.2},
        {"turn": 2, "usd": 0.7},
        {"turn": 6, "usd": 0.9},
    ]


def test_side_only_needs_a_bridge_and_the_whole_run() -> None:
    assert options_problem(Options(run="run1", side_only=True, thinking_from=Path("/b"))) is None
    assert options_problem(Options(run="run1", side_only=True)) is not None
    for bad in (
        Options(run="run1", side_only=True, thinking_from=Path("/b"), start=5.0),
        Options(run="run1", side_only=True, thinking_from=Path("/b"), lines_only=True),
        Options(run="run1", side_only=True, thinking_from=Path("/b"), voice_only=True),
    ):
        assert options_problem(bad) is not None
