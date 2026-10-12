import importlib
import importlib.util
import io
import struct
import wave


def audio_module():
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
    with __import__("pytest").raises(ValueError):
        tape.append(b"bad")
    with __import__("pytest").raises(ValueError):
        audio.AudioTape(capacity_frames=0)
    with __import__("pytest").raises(ValueError):
        tape.segment(since=0, max_frames=0)
    tape.clear()
    cleared = tape.segment(since=0, max_frames=2)
    assert cleared.epoch == 1
    assert cleared.next_frame == 5
    assert cleared.wav[44:] == b""


class Buffer:
    def __init__(self):
        self.samples = []
        self.rates = []
        self.fail = False

    @property
    def available(self):
        return len(self.samples) // 2

    def set_rate(self, rate):
        self.rates.append(rate)

    def clear(self):
        self.samples.clear()

    def read(self, count):
        if self.fail:
            raise RuntimeError("broken sound")
        result = self.samples[: count * 2]
        del self.samples[: count * 2]
        return result


class Core:
    def __init__(self):
        self.buffer = Buffer()
        self.callbacks = []
        self.frames = 0

    def get_audio_channels(self):
        return self.buffer

    def add_frame_callback(self, callback):
        self.callbacks.append(callback)

    def run_frame(self):
        self.frames += 1
        self.buffer.samples.extend([123, -456])
        for callback in self.callbacks:
            callback()


class Emulator:
    core = None

    def initialize(self):
        self.core = Core()
        return "initialized"

    def load_state(self, value):
        self.core.buffer.samples.extend([999, 999])
        self.core.run_frame()
        return value


def test_native_callback_captures_only_on_core_frames_and_flushes_lifecycle(monkeypatch):
    audio = audio_module()
    assert hasattr(audio, "install_tap"), "native audio callback missing"

    class OwnedEmulator(Emulator):
        pass

    tape = audio.AudioTape(capacity_frames=3)
    audio.install_tap(OwnedEmulator, tape)
    emu = OwnedEmulator()
    assert emu.initialize() == "initialized"
    core = emu.core
    assert core.buffer.rates == [48000]
    core.run_frame()
    assert tape.segment(0, 3).wav[44:] == struct.pack("<hh", 123, -456)
    assert core.buffer.available == 0
    tape.segment(0, 3)
    assert core.frames == 1
    assert emu.load_state("saved") == "saved"
    assert tape.segment(0, 3).wav[44:] == b""
    core.run_frame()
    assert tape.segment(-1, 3).wav[44:] == struct.pack("<hh", 123, -456)
    core.buffer.fail = True
    core.run_frame()  # sound errors do not break emulation
    assert core.frames == 4
    core.buffer.fail = False
    assert emu.initialize() == "initialized"
    core.run_frame()  # retired core must not write into the new session
    assert tape.segment(-1, 3).wav[44:] == b""
    emu.core.run_frame()
    assert tape.segment(-1, 3).wav[44:] == struct.pack("<hh", 123, -456)


def test_audio_setup_failure_preserves_vendor_initialize_result(caplog):
    audio = audio_module()
    assert hasattr(audio, "install_tap"), "native audio callback missing"

    class NoCore(Emulator):
        def initialize(self):
            return 42

    audio.install_tap(NoCore, audio.AudioTape())
    assert NoCore().initialize() == 42
    assert "audio" in caplog.text.lower()
