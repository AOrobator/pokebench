import importlib
import io
import struct
import wave


def audio_module():
    from pokebench_env import __path__
    assert importlib.util.find_spec("pokebench_env.audio") is not None, "audio feature missing"
    return importlib.import_module("pokebench_env.audio")


def pcm(*values):
    return b"".join(struct.pack("<hh", value, -value) for value in values)


def test_tape_serves_bounded_latest_stereo_wav_to_independent_readers():
    audio = audio_module()
    tape = audio.AudioTape(capacity_frames=3)
    tape.append(pcm(1, 2))
    first = tape.segment(since=0, max_frames=2)
    tape.append(pcm(3, 4, 5))
    slow = tape.segment(since=first.next_frame, max_frames=2)
    other = tape.segment(since=-1, max_frames=2)
    assert slow.next_frame == other.next_frame == 5
    assert slow.skipped == 1
    assert slow.wav == other.wav
    with wave.open(io.BytesIO(slow.wav)) as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (2, 2, 48000)
        assert wav.readframes(10) == pcm(4, 5)
    assert tape.segment(since=999, max_frames=2).next_frame == 5
    assert tape.segment(since=5, max_frames=2).wav[44:] == b""
    assert len(tape.segment(since=0, max_frames=99).wav) == 44 + 3 * 4
    with __import__('pytest').raises(ValueError):
        tape.append(b"bad")
    with __import__('pytest').raises(ValueError):
        audio.AudioTape(capacity_frames=0)
    with __import__('pytest').raises(ValueError):
        tape.segment(since=0, max_frames=0)
    tape.clear()
    cleared = tape.segment(since=0, max_frames=2)
    assert cleared.epoch == 1
    assert cleared.next_frame == 5
    assert cleared.wav[44:] == b""
