import base64
import json
from pathlib import Path

from pokebench_env.recorder import (
    AUDIO_LAG_SAMPLES,
    GBA_FPS,
    MAX_HELD_FRAMES,
    SAMPLE_BYTES,
    SAMPLES_PER_FRAME,
    SILENCE_CHUNK_SAMPLES,
    Anchor,
    AudioPlan,
    Frame,
    Restarting,
    Sound,
    SoundWriter,
    VideoTimeline,
    audio_command,
    next_part,
    parse_frame,
    parse_sound,
    plan_audio,
    record_frames,
    supervise,
    video_command,
)


class FakeSink:
    def __init__(self, fail_after: int | None = None) -> None:
        self.chunks: list[bytes] = []
        self.fail_after = fail_after
        self.closed = False

    def write(self, data: bytes) -> None:
        if self.fail_after is not None and len(self.chunks) >= self.fail_after:
            raise BrokenPipeError("encoder gone")
        self.chunks.append(data)

    def close(self) -> None:
        self.closed = True


class Events:
    def __init__(self) -> None:
        self.seen: list[tuple[str, dict[str, object]]] = []

    def __call__(self, event: str, **fields: object) -> None:
        self.seen.append((event, fields))

    @property
    def names(self) -> list[str]:
        return [name for name, _ in self.seen]


def test_every_frame_is_written_once() -> None:
    timeline = VideoTimeline()
    assert [timeline.accept(n).writes for n in (10, 11, 12)] == [1, 1, 1]


def test_a_repeat_of_the_same_frame_writes_nothing() -> None:
    timeline = VideoTimeline()
    timeline.accept(10)
    assert timeline.accept(10).writes == 0


def test_a_small_gap_holds_the_frame_so_timing_stays_true() -> None:
    timeline = VideoTimeline()
    timeline.accept(10)
    assert timeline.accept(13).writes == 3


def test_a_long_gap_is_left_out_and_logged() -> None:
    timeline = VideoTimeline()
    timeline.accept(10)
    plan = timeline.accept(11 + MAX_HELD_FRAMES)
    assert (plan.writes, plan.event) == (1, "frames_lost")


def test_a_counter_that_goes_back_starts_again() -> None:
    timeline = VideoTimeline()
    timeline.accept(100)
    plan = timeline.accept(5)
    assert (plan.writes, plan.event) == (1, "frame_counter_reset")
    assert timeline.accept(6).writes == 1


def test_sound_on_time_is_written_whole() -> None:
    assert plan_audio(0, 800, 0) == AudioPlan(0, 0, None)


def test_a_hole_in_the_sound_becomes_silence() -> None:
    assert plan_audio(150, 100, 100) == AudioPlan(50, 0, "audio_gap")


def test_sound_already_written_is_not_written_twice() -> None:
    assert plan_audio(90, 100, 100) == AudioPlan(0, 10, None)


def test_sound_wholly_before_the_end_is_skipped() -> None:
    assert plan_audio(0, 100, 500) == AudioPlan(0, 100, None)


def test_a_long_outage_keeps_later_sound_in_its_true_place() -> None:
    anchor = anchored()
    origin = round(8 * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
    writer, sink, _ = writer_for(anchor)
    forty_minutes = 40 * 60 * 48000
    writer.accept(sound(100, origin + forty_minutes + 100))
    assert writer.written == forty_minutes + 100
    assert max(len(c) for c in sink.chunks) == SILENCE_CHUNK_SAMPLES * SAMPLE_BYTES


def anchored(frame_count: int = 8) -> Anchor:
    anchor = Anchor()
    anchor.first_frame(frame_count)
    return anchor


def writer_for(anchor: Anchor) -> tuple[SoundWriter, FakeSink, Events]:
    sink, events = FakeSink(), Events()
    return SoundWriter(sink, anchor, events), sink, events


def sound(samples: int, end: int) -> Sound:
    return Sound(bytes(samples * SAMPLE_BYTES), end)


def test_sound_before_the_first_frame_waits_for_the_anchor() -> None:
    writer, sink, _ = writer_for(Anchor())
    writer.accept(sound(100, 100))
    assert sink.chunks == []


def test_the_first_sample_lands_at_the_first_frames_position() -> None:
    anchor = anchored()
    origin = round(8 * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
    writer, sink, _ = writer_for(anchor)
    writer.accept(sound(100, origin + 100))
    assert writer.written == 100
    assert sink.chunks == [bytes(100 * SAMPLE_BYTES)]


def test_sound_that_starts_before_the_file_loses_only_that_part() -> None:
    anchor = anchored()
    origin = round(8 * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
    writer, _, _ = writer_for(anchor)
    writer.accept(sound(100, origin + 40))
    assert writer.written == 40


def test_sound_lost_by_the_tape_keeps_its_place_as_silence() -> None:
    anchor = anchored()
    origin = round(8 * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
    writer, _, events = writer_for(anchor)
    writer.accept(sound(100, origin + 100))
    writer.accept(sound(100, origin + 300))
    assert writer.written == 300
    assert events.names == ["audio_gap"]


def test_the_picture_lagging_never_costs_sound() -> None:
    anchor = anchored()
    origin = round(8 * SAMPLES_PER_FRAME) - AUDIO_LAG_SAMPLES
    writer, _, events = writer_for(anchor)
    for chunk in range(1, 101):
        writer.accept(sound(12000, origin + chunk * 12000))
    assert writer.written == 1_200_000
    assert anchor.frames == 0
    assert events.names == []


def test_record_frames_writes_png_and_moves_the_picture_on() -> None:
    sink, events, anchor = FakeSink(), Events(), Anchor()
    record_frames([Frame(1, b"a"), Frame(3, b"b")], sink, anchor, events)
    assert sink.chunks == [b"a", b"b", b"b"]
    assert anchor.frames == 3
    assert events.names == ["first_frame"]


def test_a_counter_reset_reanchors_sound_at_the_pictures_place() -> None:
    sink, events, anchor = FakeSink(), Events(), Anchor()
    record_frames([Frame(100, b"a"), Frame(101, b"b"), Frame(1, b"c")], sink, anchor, events)
    assert "frame_counter_reset" in events.names
    writer, _, _ = writer_for(anchor)
    writer.written = round(2 * SAMPLES_PER_FRAME) - 50
    writer.accept(sound(50, 9_000_000))
    assert writer.written == round(2 * SAMPLES_PER_FRAME)


def test_a_dead_encoder_starts_a_new_part_and_keeps_the_data() -> None:
    now = [0.0]
    sinks = [FakeSink(fail_after=1), FakeSink()]
    events = Events()
    restarting = Restarting(lambda part: sinks[part - 1], events, "video", 1, lambda: now[0])
    restarting.write(b"a")
    now[0] = 60.0
    restarting.write(b"b")
    assert restarting.part == 2
    assert sinks[1].chunks == [b"b"]
    assert events.names == ["part_started", "encoder_failed", "part_started"]


def test_an_encoder_that_keeps_dying_does_not_raise() -> None:
    events = Events()
    restarting = Restarting(lambda part: FakeSink(fail_after=0), events, "audio")
    restarting.write(b"a")
    assert events.names.count("encoder_failed") == 1


def test_close_closes_the_live_encoder() -> None:
    sink = FakeSink()
    restarting = Restarting(lambda part: sink, Events(), "video")
    restarting.write(b"a")
    restarting.close()
    assert sink.closed


def test_parse_frame_reads_the_servers_message() -> None:
    message = json.dumps({"frame_data": base64.b64encode(b"png").decode(), "frame_count": 7})
    assert parse_frame(message) == Frame(7, b"png")


def test_parse_sound_drops_the_wav_header() -> None:
    assert parse_sound(bytes(44) + b"pcm!", 3) == Sound(b"pcm!", 3)


def test_commands_are_argv_lists_that_name_their_part() -> None:
    video, audio = video_command(Path("out dir"), 2), audio_command(Path("out dir"), 2)
    assert video[-1] == "out dir/video-p02-%04d.mkv"
    assert audio[-1] == "out dir/audio-p02-%04d.mka"
    assert f"{GBA_FPS:.4f}" in video


def test_next_part_follows_every_file_here() -> None:
    assert next_part(["recording.jsonl"]) == 1
    assert next_part(["video-p01-0000.mkv", "audio-p03-0001.mka", "ffmpeg.log"]) == 4


def test_a_restart_part_starts_where_it_is_told() -> None:
    parts: list[int] = []

    def start(part: int) -> FakeSink:
        parts.append(part)
        return FakeSink()

    Restarting(start, Events(), "video", 4).write(b"a")
    assert parts == [4]


def test_supervise_restarts_a_dead_recorder_until_it_exits_cleanly() -> None:
    codes = iter([-9, 1, 0])
    firsts: list[bool] = []
    pauses: list[float] = []
    events = Events()

    def run_child(first: bool) -> int:
        firsts.append(first)
        return next(codes)

    supervise(run_child, events, pauses.append)
    assert firsts == [True, False, False]
    assert pauses == [0.2, 0.4]
    assert events.names == ["recorder_restarted", "recorder_restarted", "supervisor_done"]


def test_supervise_backs_off_to_a_limit() -> None:
    codes = iter([1] * 12 + [0])
    pauses: list[float] = []
    supervise(lambda first: next(codes), Events(), pauses.append)
    assert max(pauses) == 60.0


def test_an_encoder_that_cannot_start_drops_data_and_retries_later() -> None:
    now = [0.0]
    attempts: list[int] = []
    good = FakeSink()

    def start(part: int) -> FakeSink:
        attempts.append(part)
        if len(attempts) == 1:
            raise FileNotFoundError("ffmpeg")
        return good

    events = Events()
    restarting = Restarting(start, events, "video", 1, lambda: now[0])
    restarting.write(b"lost")
    restarting.write(b"lost too")
    now[0] = 6.0
    restarting.write(b"kept")
    assert good.chunks == [b"kept"]
    assert attempts == [1, 1]
    assert events.names == ["encoder_unstartable", "part_started"]


def test_a_dead_encoder_is_closed_so_it_is_reaped() -> None:
    dead = FakeSink(fail_after=0)
    restarting = Restarting(lambda part: dead, Events(), "video")
    restarting.write(b"a")
    assert dead.closed


def test_an_encoder_that_dies_on_starting_waits_before_the_next_try() -> None:
    now = [100.0]
    starts: list[int] = []

    def start(part: int) -> FakeSink:
        starts.append(part)
        return FakeSink(fail_after=0)

    restarting = Restarting(start, Events(), "video", 1, lambda: now[0])
    for _ in range(50):
        restarting.write(b"a")
    assert len(starts) == 1
    now[0] = 106.0
    restarting.write(b"a")
    assert len(starts) == 2


def test_an_encoder_that_had_been_running_restarts_at_once() -> None:
    now = [100.0]
    sinks = [FakeSink(fail_after=1), FakeSink()]
    restarting = Restarting(lambda part: sinks[part - 1], Events(), "video", 1, lambda: now[0])
    restarting.write(b"a")
    now[0] = 500.0
    restarting.write(b"b")
    assert sinks[1].chunks == [b"b"]
