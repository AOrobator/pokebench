"""Authored labels identify already displayed field pages; no route/task text is added.

Native source: pret 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881,
RustboroCity_Text_OutOfTheWay/WaitDontTakeMyGoods/HelpMeIWasRobbed.
The synthetic memory contains bounded text windows, never a ROM image.
"""

import io
import json
import struct
from dataclasses import replace
from hashlib import sha256

import pytest

from pokebench_env import authored_scene_labels as labels
from pokebench_env import rerender
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.native_text import decode_native_text
from pokebench_env.rom import EMERALD_SHA1
from pokebench_env.world_context import FieldMessage, WorldContext
from tests.env.test_game_state import Memory, text
from tests.env.test_world_context import field_printer

SCRIPT = 0x03000E40
BUFFER = 0x02021FC4
CASES = (
    (0x081E17FE, 0x081E09D5, "grunt-escape", "TEAM AQUA GRUNT", 10, "Get out!\nOut of the way!"),
    (
        0x081E1817,
        0x081E09FF,
        "employee-chase",
        "DEVON EMPLOYEE",
        9,
        "Wait! Pleeeaaase!\nDon't take my GOODS!",
    ),
    (0x081E183E, 0x081E0B6D, "employee-request", "DEVON EMPLOYEE", 9, "Oh, it's you!"),
)


class SceneMemory:
    def __init__(self, memory: Memory) -> None:
        self.memory = memory
        self.metadata: dict[str, object] = {"rom_sha1": EMERALD_SHA1}
        self.reads: list[tuple[int, int]] = []

    def __call__(self, address: int, length: int) -> bytes:
        self.reads.append((address, length))
        return self.memory.read(address, length)


def fixture(index: int = 0) -> tuple[SceneMemory, GameState]:
    pointer, return_pc, _beat, _speaker, _actor, words = CASES[index]
    memory = field_printer()
    payload = b"\xfe".join(text(line) for line in words.split("\n"))
    memory.put(BUFFER, payload + b"\xff")
    memory.put(pointer, payload + b"\xff")
    # msgbox expands to loadword 0,<text>; callstd MSGBOX_DEFAULT (opcodes 0f/09).
    memory.put(return_pc - 8, b"\x0f\x00" + struct.pack("<I", pointer) + b"\x09\x04")
    context = bytearray(0x74)
    context[0:2] = b"\x01\x02"
    struct.pack_into("<I", context, 4, 0x0809AC99)
    struct.pack_into("<I", context, 8, 0x08271331)
    struct.pack_into("<I", context, 12, return_pc)
    struct.pack_into("<I", context, 0x64, pointer)
    memory.put(SCRIPT, context)
    memory.put(0x020201B0, struct.pack("<I", BUFFER + len(payload)))
    world = WorldContext(
        (),
        (),
        decode_native_text(payload + b"\xff", line_breaks={0xFE: "\n"}),
        FieldMessage("page_wait", len(payload), True, sha256(payload).hexdigest()),
    )
    state = GameState(
        "overworld",
        True,
        "MAY",
        "RUSTBORO CITY",
        (0, 3),
        (1, 1),
        "up",
        False,
        (),
        0,
        (),
        (0, 0, 0),
        field_controls_locked=True,
        world_context=world,
    )
    return SceneMemory(memory), state


@pytest.mark.parametrize("index", range(3))
def test_exact_native_catalog_labels_only_the_current_authored_role(index: int) -> None:
    read, state = fixture(index)
    label = labels.read_scene_label(read, state)
    pointer, return_pc, beat, speaker, actor, _words = CASES[index]
    assert label is not None
    assert label.json() == {
        "scene": "rustboro-employee-request" if index == 2 else "rustboro-theft-chase",
        "beat": beat,
        "speaker": speaker,
        "source": "authored-script",
        "map_id": [0, 3],
        "actor_local_id": actor,
        "message_pointer": pointer,
        "return_pc": return_pc,
        "rom_sha1": EMERALD_SHA1,
    }
    assert not {"text", "coordinates", "position", "next_action", "objective"} & label.json().keys()
    assert all(length <= 1000 for _address, length in read.reads)


@pytest.mark.parametrize(
    "metadata", [{}, {"rom_sha1": "0" * 40}, {"rom_sha1": None}, {"romSha1": EMERALD_SHA1}]
)
def test_missing_wrong_or_unrecognized_rom_identity_is_unannotated(
    metadata: dict[str, object],
) -> None:
    read, state = fixture()
    read.metadata = metadata
    assert labels.read_scene_label(read, state) is None


@pytest.mark.parametrize(
    "change",
    [
        {"map_id": (0, 4)},
        {"map_id": (1, 3)},
        {"screen": "battle"},
        {"in_battle": True},
        {"started": False},
        {"active_ui": object()},
        {"world_context": None},
    ],
)
def test_current_native_owner_and_map_must_qualify(change: dict[str, object]) -> None:
    read, state = fixture()
    assert labels.read_scene_label(read, replace(state, **change)) is None


@pytest.mark.parametrize(
    "address,value",
    [
        (SCRIPT, b"\x00"),
        (SCRIPT, b"\x02"),
        (SCRIPT + 1, b"\x00"),
        (SCRIPT + 12, struct.pack("<I", 0x081E09FF)),
        (SCRIPT + 0x64, struct.pack("<I", 0x081E1817)),
        (0x081E09D5 - 8, b"\x00"),
        (0x081E09D5 - 7, b"\x01"),
        (0x081E09D5 - 2, b"\x00"),
        (0x081E09D5 - 1, b"\x03"),
        (0x020375BC, b"\x03"),
        (0x020201B0 + 0x1C, b"\x00"),
        (BUFFER, b"\xbb\xff"),
        (0x081E17FE, b"\xbb\xff"),
    ],
)
def test_mismatched_script_bytes_stale_buffer_and_partial_printer_fail_closed(
    address: int, value: bytes
) -> None:
    read, state = fixture()
    read.memory.put(address, value)
    assert labels.read_scene_label(read, state) is None


def test_unknown_callsite_and_identical_decoded_but_different_native_payload_are_rejected() -> None:
    read, state = fixture()
    read.memory.put(SCRIPT + 12, struct.pack("<I", 0x081E0000))
    assert labels.read_scene_label(read, state) is None
    read, state = fixture()
    # Newline opcodes render alike but are not the exact source payload.
    read.memory.put(0x081E17FE, read.memory.read(0x081E17FE, 1000).replace(b"\xfe", b"\xfb", 1))
    assert labels.read_scene_label(read, state) is None


@pytest.mark.parametrize(
    "message",
    [None, FieldMessage("printing", 0, False), FieldMessage("page_wait", 2, True, "0" * 64)],
)
def test_missing_partial_or_stale_delivered_message_cannot_supply_identity(
    message: FieldMessage | None,
) -> None:
    read, state = fixture()
    assert state.world_context is not None
    state = replace(state, world_context=replace(state.world_context, message=message))
    assert labels.read_scene_label(read, state) is None


def test_short_or_unavailable_script_memory_is_unannotated() -> None:
    read, state = fixture()

    def unavailable(address: int, length: int) -> bytes:
        if address == SCRIPT:
            raise ValueError("archive window unavailable")
        return read(address, length)

    assert labels.read_scene_label(unavailable, state) is None


def test_optional_metadata_is_omitted_without_changing_previous_message_bytes() -> None:
    message = FieldMessage("page_wait", 3, True)
    assert message.json() == {"phase": "page_wait", "cursor": 3, "ready": True}
    world = WorldContext((), (), "shown text", message)
    assert world.json()["message"] == {
        "phase": "page_wait",
        "cursor": 3,
        "ready": True,
        "identity": None,
    }
    assert "scene_label" not in json.dumps(world.json())


def test_factory_off_is_same_state_same_json_and_never_calls_the_recognizer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    read, state = fixture()
    monkeypatch.setattr(rerender, "read_game_state", lambda *_args, **_kwargs: state)

    def forbidden(*_args: object, **_kwargs: object) -> GameState:
        raise AssertionError("OFF read authored scene evidence")

    monkeypatch.setattr(labels, "annotate_scene_label", forbidden)
    before = json.dumps(state.world_context.json(), sort_keys=True)
    off = rerender.read_state(read, MapNames({}), active_ui=True, off=frozenset({labels.SWITCH}))
    assert off is state
    assert json.dumps(off.world_context.json(), sort_keys=True) == before
    assert read.reads == []


def test_factory_on_adds_only_qualified_metadata_and_preserves_original_dialogue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    read, state = fixture()
    monkeypatch.setattr(rerender, "read_game_state", lambda *_args, **_kwargs: state)
    on = rerender.read_state(read, MapNames({}), active_ui=True, off=frozenset())
    assert on is not state
    assert on.world_context.dialogue == state.world_context.dialogue
    assert on.world_context.message.identity == state.world_context.message.identity
    assert on.world_context.message.scene_label.speaker == "TEAM AQUA GRUNT"
    original = state.world_context.json()
    annotated = on.world_context.json()
    annotated["message"].pop("scene_label")
    assert annotated == original
    assert state.world_context.message.scene_label is None


@pytest.mark.parametrize("bad_path", ["../foreign.json.gz", "/foreign.json.gz"])
def test_label_cli_rejects_archive_paths_outside_the_named_run(bad_path: str) -> None:
    request = {"run_dir": "/run", "raw_ram": [{"path": bad_path, "sha256": "a" * 64}]}
    with pytest.raises(ValueError, match="inside the run"):
        labels.main({}, io.StringIO(json.dumps(request)), io.StringIO())


def test_state_ready_identity_and_dialogue_each_bind_the_native_message() -> None:
    read, state = fixture()
    assert state.world_context is not None and state.world_context.message is not None
    message = state.world_context.message
    for changed in [
        replace(message, ready=False),
        replace(message, identity=None),
        replace(message, identity="0" * 64),
        replace(message, cursor=message.cursor + 1),
    ]:
        assert (
            labels.read_scene_label(
                read, replace(state, world_context=replace(state.world_context, message=changed))
            )
            is None
        )
    assert (
        labels.read_scene_label(
            read,
            replace(
                state, world_context=replace(state.world_context, dialogue="other delivered text")
            ),
        )
        is None
    )
    assert (
        labels.read_scene_label(
            read,
            replace(
                state,
                world_context=replace(
                    state.world_context, message_diagnostic="unsupported printer"
                ),
            ),
        )
        is None
    )
    assert labels.read_scene_label(read, replace(state, field_controls_locked=False)) is None


@pytest.mark.parametrize("short", [0, 2, 0x68])
def test_verified_metadata_does_not_hide_unavailable_or_short_native_context(short: int) -> None:
    read, state = fixture()

    class Unavailable:
        metadata = {"rom_sha1": EMERALD_SHA1}

        def __call__(self, address: int, length: int) -> bytes:
            if address == SCRIPT:
                if short:
                    return read(address, length)[:short]
                raise ValueError("snapshot context unavailable")
            return read(address, length)

    assert labels.read_scene_label(Unavailable(), state) is None


def test_native_source_and_buffer_match_cannot_override_the_rom_loadword_pointer() -> None:
    read, state = fixture()
    read.memory.put(0x081E09D5 - 6, struct.pack("<I", 0x081E1817))
    assert labels.read_scene_label(read, state) is None


def test_matching_bytes_at_an_unknown_pointer_and_return_pc_are_not_catalog_evidence() -> None:
    read, state = fixture()
    pointer, return_pc = 0x081E2000, 0x081E2100
    read.memory.put(pointer, read.memory.read(0x081E17FE, 1000))
    read.memory.put(return_pc - 8, b"\x0f\x00" + struct.pack("<I", pointer) + b"\x09\x04")
    read.memory.put(SCRIPT + 12, struct.pack("<I", return_pc))
    read.memory.put(SCRIPT + 0x64, struct.pack("<I", pointer))
    assert labels.read_scene_label(read, state) is None


def test_two_ready_phases_cannot_substitute_for_the_coherent_printer_phase() -> None:
    read, state = fixture()
    read.memory.put(0x020201B0 + 0x1C, b"\x01")
    assert labels.read_scene_label(read, state) is None
