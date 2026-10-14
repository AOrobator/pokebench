"""Additional exact-ROM menu owners; content is game-owned, never inferred."""

import struct
from typing import TYPE_CHECKING, cast

from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.menus import (
    LIST_TASK,
    PALETTE_FADE,
    MenuValue,
    _ewram,
    _list_selection,
    _text_pointer,
    owner_details,
    task_snapshot,
)
from pokebench_env.pokemon import (
    MOVE_NAMES,
    SPECIES_NAMES,
    PartyMon,
    decode_party_mon,
    pokemon_cpu_context,
    read_item_name,
)

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

MAIL_CALLBACK = 0x08121C65
MAIL_POINTER = 0x0203A134
EASY_CHAT_CALLBACK = 0x0811A279
EASY_CHAT_TASK = 0x0811A2FD
EASY_CHAT_POINTER = 0x0203A118
EASY_CHAT_WORD_DATA = 0x0203A120
EASY_CHAT_GROUPS = 0x0859D004
EASY_CHAT_GROUP_NAMES = 0x0859E5D4
MYSTERY_GIFT_CALLBACK = 0x08018439
MYSTERY_GIFT_TASK = 0x080191F5
POKEBLOCK_CALLBACK = 0x0813591D
POKEBLOCK_POINTER = 0x0203AB50


def _word(read: ReadMemory, word: int) -> str:
    if word == 0xFFFF:
        return "(empty)"
    group, index = word >> 9, word & 0x1FF
    if not 0 <= group < 22:
        raise ValueError("invalid Easy Chat word group")
    if group in (0, 21):
        if not 1 <= index < 412:
            raise ValueError("invalid Easy Chat Pokémon word")
        return _text_pointer(read, SPECIES_NAMES + 11 * index)
    if group in (18, 19):
        if not 0 < index < 355:
            raise ValueError("invalid Easy Chat move word")
        return _text_pointer(read, MOVE_NAMES + 13 * index)
    pointer, count, _ = struct.unpack("<IHH", read(EASY_CHAT_GROUPS + group * 8, 8))
    if index >= count or not 0x08000000 <= pointer < 0x0A000000:
        raise ValueError("invalid Easy Chat dictionary index")
    (text,) = struct.unpack("<I", read(pointer + index * 12, 4))
    return _text_pointer(read, text)


def _easy_chat(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    owners = [t for t in task_snapshot(read) if t[1] == EASY_CHAT_TASK]
    if len(owners) != 1:
        raise ValueError("Easy Chat has no unique input task")
    (pointer,) = struct.unpack("<I", read(EASY_CHAT_POINTER, 4))
    if not _ewram(pointer, 0x50):
        raise ValueError("invalid Easy Chat screen pointer")
    body = read(pointer, 0x50)
    mode, columns, rows, phase = body[0], body[2], body[3], body[4]
    if mode > 20 or not 1 <= columns <= 2 or not 1 <= rows <= 5 or phase > 10:
        raise ValueError("invalid Easy Chat layout/input state")
    phrase = struct.unpack_from("<9H", body, 0x3C)
    max_words = body[7]
    if not 1 <= max_words <= 9 or max_words > columns * rows:
        raise ValueError("invalid Easy Chat phrase length")
    details.update(
        {
            "phrase_words": [_word(read, w) for w in phrase[:max_words]],
            "phrase_codes": list(phrase[:max_words]),
            "input_state": phase,
            "chat_type": mode,
            "owner_task": owners[0][0],
            "title": _text_pointer(read, struct.unpack_from("<I", body, 0x34)[0]),
        }
    )
    ready = owners[0][2][0] == 1 and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    column, row = struct.unpack_from("<bb", body, 5)
    selected = None
    if phase in (0, 7):
        index = row * columns + column
        if not 0 <= column < columns or not 0 <= row < rows or index >= max_words:
            raise ValueError("invalid Easy Chat phrase cursor")
        selected = _word(read, phrase[index])
        details["selected_index"] = index
    elif phase == 1:
        options = ["DEL. ALL", "CANCEL", "OK"]
        if mode in (16, 17):
            options.append("QUIZ")
        elif mode in (15, 18):
            options.append("ANSWER")
        if not 0 <= column < len(options):
            raise ValueError("invalid Easy Chat footer cursor")
        selected = options[column]
        details["options"] = cast(MenuValue, options)
    elif phase == 2:
        column, row = struct.unpack_from("<bb", body, 0xA)
        if column == -1:
            if not 0 <= row < 3:
                raise ValueError("invalid Easy Chat keyboard button")
            selected = ["MODE", "DELETE", "CANCEL"][row]
        elif body[9]:
            alphabet = [
                [1, 2, 3, 4, 5, 6, 0],
                [7, 8, 9, 10, 11, 12, 0],
                [13, 14, 15, 16, 17, 18, 19],
                [20, 21, 22, 23, 24, 25, 26],
            ]
            if not 0 <= row < 4 or not 0 <= column < 7 or (row == 1 and column == 6):
                raise ValueError("invalid Easy Chat alphabet cursor")
            group = alphabet[row][column]
            selected = "OTHERS" if group == 0 else chr(64 + group)
        else:
            (word_data,) = struct.unpack("<I", read(EASY_CHAT_WORD_DATA, 4))
            if not _ewram(word_data, 0x3BA4):
                raise ValueError("invalid Easy Chat word-data pointer")
            group_index = 2 * (row + body[0xC]) + column
            count = int.from_bytes(read(word_data, 2), "little")
            if not 0 <= column < 2 or not 0 <= row < 4 or not 0 <= group_index < count <= 22:
                raise ValueError("invalid Easy Chat group cursor")
            group = int.from_bytes(read(word_data + 2 + group_index * 2, 2), "little")
            if group >= 22:
                raise ValueError("invalid Easy Chat unlocked group")
            selected = _text_pointer(
                read, int.from_bytes(read(EASY_CHAT_GROUP_NAMES + 4 * group, 4), "little")
            )
    elif phase == 3:
        (word_data,) = struct.unpack("<I", read(EASY_CHAT_WORD_DATA, 4))
        if not _ewram(word_data, 0x3BA4):
            raise ValueError("invalid Easy Chat word-data pointer")
        column, row = struct.unpack_from("<bb", body, 0x10)
        index = 2 * (row + body[0xE]) + column
        count = int.from_bytes(read(word_data + 0x3BA0, 2), "little")
        if not 0 <= column < 2 or not 0 <= row < 4 or not 0 <= index < count <= 270:
            raise ValueError("invalid Easy Chat word cursor")
        word = int.from_bytes(read(word_data + 0x3984 + 2 * index, 2), "little")
        selected = _word(read, word)
        details.update({"selected_word_code": word, "selected_index": index})
    elif phase in (4, 5, 6, 10):
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            if ready:
                raise ValueError("Easy Chat prompt menu undrawn/invalid")
        else:
            selected = ["YES", "NO"][menu.selected - 1]
    elif phase == 8:
        selected = "CONTINUE"
    elif phase == 9:
        ready = False
    return ActiveUi(
        "easy_chat",
        selected,
        ready,
        "Directions select; A confirms; B cancels",
        value=cast(str, details["title"]),
        details=details,
    )


def _mail(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    (pointer,) = struct.unpack("<I", read(MAIL_POINTER, 4))
    if not _ewram(pointer, 0x22C):
        raise ValueError("invalid mail owner pointer")
    body = read(pointer, 0x22C)
    callback, mail = struct.unpack_from("<II", body, 0x210)
    if callback not in (0x08121C99, 0x08121CC1, 0x08121D01):
        raise ValueError("unsupported mail input owner")
    if not _ewram(mail, 36):
        raise ValueError("invalid mail data pointer")
    layout = int.from_bytes(body[0x228:0x22C], "little")
    if not 0x08000000 <= layout < 0x0A000000:
        raise ValueError("invalid mail layout pointer")
    lines = read(layout, 1)[0]
    if not 1 <= lines <= 8:
        raise ValueError("invalid mail line count")
    messages = []
    for i in range(lines if body[0x218] else 0):
        raw = body[i * 64 : (i + 1) * 64]
        if b"\xff" not in raw:
            raise ValueError("unterminated mail text")
        messages.append(decode_text(raw))
    sender = decode_text(body[0x200:0x20C])
    details.update(
        {
            "message_lines": cast(MenuValue, messages),
            "sender": sender,
            "mail_type": body[0x21A],
            "mail_word_codes": list(struct.unpack("<9H", read(mail, 18))),
            "input_owner": f"0x{callback:08X}",
        }
    )
    ready = callback == 0x08121CC1 and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "mail_read",
        "CLOSE" if ready else None,
        ready,
        "A or B closes mail",
        value=" ".join(messages),
        details=details,
    )


def _mystery_gift(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    owners = [t for t in task_snapshot(read) if t[1] == MYSTERY_GIFT_TASK]
    if len(owners) != 1:
        raise ValueError("Mystery Gift input task unavailable")
    data = owners[0][2]
    phase = data[4] & 0xFF
    text_phase = (data[4] >> 8) & 0xFF
    details.update(
        {
            "gift_state": phase,
            "text_state": text_phase,
            "wonder_news": bool(data[6] & 0xFF),
            "source_friend": bool(data[6] >> 8),
            "owner_task": owners[0][0],
        }
    )
    lists = [t for t in task_snapshot(read) if t[1] == LIST_TASK]
    selected = None
    ready = False
    if phase in (1, 4, 21) and len(lists) == 1:
        selected, item, index = _list_selection(read, lists[0][0])
        details.update({"selected_item_id": item, "selected_index": index})
        ready = True
    elif phase in (9, 11, 12, 22, 23):
        menu = read_menu(read)
        if menu is not None and menu.options == 2:
            selected = ["YES", "NO"][menu.selected - 1]
            ready = True
    elif phase == 20:
        selected = "VIEW WONDER NEWS" if data[6] & 0xFF else "VIEW WONDER CARD"
        ready = True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "mystery_gift", selected, ready, "Directions select; A confirms; B cancels", details=details
    )


def _pokeblock(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    tasks = task_snapshot(read)
    owners = [task for task in tasks if task[1] in (0x081365C9, 0x0813671D, 0x081369E1, 0x08136BC1)]
    if len(owners) != 1:
        raise ValueError("Pokéblock input owner unavailable")
    task_id, function, data = owners[0]
    pointer = int.from_bytes(read(POKEBLOCK_POINTER, 4), "little")
    if not _ewram(pointer, 0xE88):
        raise ValueError("invalid Pokéblock menu pointer")
    details.update(
        {
            "owner_task": task_id,
            "case_type": read(pointer + 0x809, 1)[0],
            "swapping": bool(read(pointer + 0xE7D, 1)[0]),
        }
    )
    if function == 0x08136BC1:
        index = int.from_bytes(read(0x0203CE7C, 2), "little")
        if index >= 40:
            raise ValueError("invalid tossed Pokéblock slot")
        details.update({"pokeblock_slot": index, "action": "toss_pokeblock"})
        selected = "CONTINUE"
        phase = "pokeblock_toss_result"
    elif function == 0x081369E1:
        menu = read_menu(read)
        count = read(pointer + 0x808, 1)[0]
        actions = int.from_bytes(read(pointer + 0x804, 4), "little")
        if menu is None or menu.options != count or not 0 < count <= 3:
            raise ValueError("invalid Pokéblock action menu")
        if not 0x08000000 <= actions < 0x0A000000:
            raise ValueError("invalid Pokéblock action table")
        options: list[str | int | float | bool | None] = []
        for action in read(actions, count):
            if action > 5:
                raise ValueError("invalid Pokéblock action ID")
            label = int.from_bytes(read(0x085B2668 + action * 8, 4), "little")
            options.append(_text_pointer(read, label))
        selected = cast(str, options[menu.selected - 1])
        details["options"] = options
        phase = "pokeblock_actions"
    else:
        selected, item, index = _list_selection(read, data[0])
        details.update({"selected_item_id": item, "selected_index": index})
        phase = "pokeblock_swap" if function == 0x0813671D else "pokeblock_case"
    ready = not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "Directions select; A confirms; B cancels; SELECT rearranges",
        details=details,
    )


DODRIO_CALLBACK = 0x080261CD
JUMP_CALLBACK = 0x0802AC6D
CRUSH_CALLBACK = 0x08020F89


def _linked_minigame(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, read_menu

    callback = int(cast(str, details["callback2"]), 16)
    selected = None
    ready = False
    if callback == DODRIO_CALLBACK:
        pointer = int.from_bytes(read(0x02022C98, 4), "little")
        if not _ewram(pointer, 0x3330):
            raise ValueError("invalid Dodrio Berry Picking owner")
        body = read(pointer, 0x31A0)
        player, count, func, state = body[0x28], body[0x24], body[0x18], body[0x10]
        functions = [
            "intro",
            "init_countdown",
            "countdown",
            "wait_start",
            "play_game",
            "init_results",
            "results",
            "ask_play_again",
            "end_link",
            "exit",
            "reset_game",
            "wait_end_game",
        ]
        if not 2 <= count <= 5 or player >= count or func >= len(functions):
            raise ValueError("invalid Dodrio minigame players/function")
        phase = "dodrio_" + functions[func]
        details.update(
            {
                "game_state": state,
                "player_id": player,
                "player_count": count,
                "berries_picked_in_row": int.from_bytes(body[0x112:0x114], "little"),
                "max_berries_picked_in_row": int.from_bytes(body[0x114:0x116], "little"),
                "berries_eaten": list(struct.unpack_from("<5H", body, 0x86)),
                "berry_results": list(struct.unpack_from("<30H", body, 0x4A)),
                "display_state": body[0x3174],
                "display_timer": int.from_bytes(body[0x317C:0x317E], "little"),
            }
        )
        ready = func == 4 and body[0xB0 + player] == 0
        if func == 6 and body[0x3174] in (4, 8, 11):
            selected = "CONTINUE"
            ready = int.from_bytes(body[0x317C:0x317E], "little") >= 29
        if func == 7 and body[0x3174] == 3:
            choice = body[0x3180]
            if choice not in (0, 1, 2):
                raise ValueError("invalid Dodrio play-again cursor")
            # PLAY_AGAIN_NONE draws YES before any cursor movement.
            selected = "NO" if choice == 2 else "YES"
            window_id = body[0x3168 + 1]
            if not _window_drawn(read, window_id):
                raise ValueError("Dodrio play-again window undrawn")
            ready = True
        controls = "LEFT/UP/RIGHT picks a berry; A confirms play-again choice; B declines"
    elif callback == JUMP_CALLBACK:
        pointer = int.from_bytes(read(0x02022CFC, 4), "little")
        if not _ewram(pointer, 0x83B0):
            raise ValueError("invalid Pokémon Jump owner")
        body = read(pointer, 0x7C)
        count, player, func = body[5], body[6], body[0x70]
        functions = [
            "intro",
            "wait_round",
            "game_round",
            "game_over",
            "ask_play_again",
            "reset_game",
            "exit",
            "give_prize",
            "save",
            "none",
        ]
        if not 2 <= count <= 5 or player >= count or func >= len(functions):
            raise ValueError("invalid Pokémon Jump players/function")
        main, helper = struct.unpack_from("<HH", body, 8)
        phase = "pokemon_jump_" + functions[func]
        details.update(
            {
                "game_state": main,
                "helper_state": helper,
                "player_id": player,
                "player_count": count,
                "jump_score": int.from_bytes(body[0x78:0x7C], "little"),
                "jumps_in_row": int.from_bytes(body[0x74:0x76], "little"),
                "prize_item_id": int.from_bytes(body[0x3E:0x40], "little"),
                "prize_quantity": int.from_bytes(body[0x40:0x42], "little"),
            }
        )
        ready = func == 2 and helper == 1 and not bool(int.from_bytes(body[0x36:0x38], "little"))
        if func == 7 and helper in (2, 5):
            selected, ready = "CONTINUE", True
        if func == 4 and helper == 2:
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                raise ValueError("Pokémon Jump play-again menu undrawn")
            selected = ["YES", "NO"][menu.selected - 1]
            ready = True
        controls = "A jumps; directions select play-again choice; A confirms; B declines"
    else:
        pointer = int.from_bytes(read(0x02022C90, 4), "little")
        if not _ewram(pointer, 0x139):
            raise ValueError("invalid Berry Crush owner")
        body = read(pointer, 0x139)
        player, count, state = body[8], body[9], body[0xC]
        command = int.from_bytes(body[4:8], "little")
        commands = struct.unpack("<26I", read(0x082F43CC, 26 * 4))
        names = [
            "none",
            "fade",
            "wait_fade",
            "print_message",
            "show_game",
            "hide_game",
            "ready_begin",
            "ask_pick_berry",
            "pick_berry",
            "wait_berries",
            "drop_berries",
            "drop_lid",
            "countdown",
            "play_leader",
            "play_member",
            "finish_game",
            "times_up",
            "calculate_results",
            "show_results",
            "save",
            "ask_play_again",
            "communicate_play_again",
            "play_again_yes",
            "play_again_no",
            "close_link",
            "quit",
        ]
        if not 2 <= count <= 5 or player >= count or command not in commands:
            raise ValueError("invalid Berry Crush players/command")
        index = commands.index(command)
        phase = "berry_crush_" + names[index]
        details.update(
            {
                "command_state": state,
                "player_id": player,
                "player_count": count,
                "game_state": int.from_bytes(body[0x12:0x14], "little"),
                "total_a_presses": int.from_bytes(body[0x1A:0x1C], "little", signed=True),
                "target_a_presses": int.from_bytes(body[0x18:0x1A], "little", signed=True),
            }
        )
        details["results_page"] = int.from_bytes(body[0x12:0x14], "little")
        details["results_delay"] = body[0x138]
        ready = index in (13, 14)
        if index == 18 and state == 2:
            selected, ready = "CONTINUE", body[0x138] == 0
        elif index == 3:
            args = body[0x3C:0x48]
            details.update(
                {
                    "message_id": args[0],
                    "message_flags": args[1],
                    "wait_keys": int.from_bytes(args[2:4], "little"),
                }
            )
            if state == 2:
                if args[0] >= 9:
                    raise ValueError("invalid Berry Crush message ID")
                if args[1] & 2:
                    from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE, decode_message

                    details["message"] = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
                else:
                    label = int.from_bytes(read(0x082F32A4 + args[0] * 4, 4), "little")
                    details["message"] = _text_pointer(read, label)
                selected, ready = "CONTINUE", bool(int.from_bytes(args[2:4], "little"))
        if index == 20 and state == 2:
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                raise ValueError("Berry Crush play-again menu undrawn")
            selected = ["YES", "NO"][menu.selected - 1]
            ready = True
        controls = "A crushes berries; directions select play-again choice; A confirms; B declines"
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(phase, selected, ready, controls, details=details)


CONTEST_CALLBACK = 0x080D823D


def _contest(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    resource = int.from_bytes(read(0x02039F34, 4), "little")
    if not _ewram(resource, 4):
        raise ValueError("invalid Contest resource owner")
    contest = int.from_bytes(read(resource, 4), "little")
    if not _ewram(contest, 0x20):
        raise ValueError("invalid Contest state owner")
    body = read(contest, 0x20)
    player = read(0x02039F25, 1)[0]
    if player >= 4:
        raise ValueError("invalid Contest player index")
    details.update(
        {
            "player_index": player,
            "appeal_number": body[1],
            "turn_number": body[0x10],
            "current_contestant": body[0x11],
            "applause_level": struct.unpack_from("<b", body, 0x13)[0],
        }
    )
    owners = [task for task in task_snapshot(read) if task[1] in (0x080D8611, 0x080D8425)]
    selected = None
    ready = False
    phase = "contest_animation"
    if len(owners) > 1:
        raise ValueError("Contest has multiple input owners")
    if owners:
        task_id, function, _ = owners[0]
        details["owner_task"] = task_id
        if function == 0x080D8425:
            selected = "CONTINUE"
            phase = "contest_appeal_prompt"
            ready = True
        else:
            moves = struct.unpack("<4H", read(0x02039E1E + 64 * player, 8))
            choice = body[0]
            if choice >= 4 or not 0 < moves[choice] < 355 or any(move >= 355 for move in moves):
                raise ValueError("invalid Contest move cursor/data")
            options = [_text_pointer(read, MOVE_NAMES + 13 * move) for move in moves if move]
            details.update(
                {
                    "move_ids": list(moves),
                    "options": cast(MenuValue, options),
                    "selected_move_id": moves[choice],
                    "selected_index": choice,
                }
            )
            selected = _text_pointer(read, MOVE_NAMES + 13 * moves[choice])
            if not _window_drawn(read, choice + 5):
                raise ValueError("Contest selected move window undrawn")
            phase = "contest_move_selection"
            ready = True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase, selected, ready, "UP/DOWN selects move; A confirms; B returns", details=details
    )


BLENDER_CALLBACKS = {
    0x08080019: "start_link",
    0x080808D5: "start_local",
    0x08081899: "play",
    0x08081FC9: "results",
    0x08082645: "play_again_link",
    0x08082925: "play_again_local",
}


def _blender(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    callback = int(cast(str, details["callback2"]), 16)
    pointer = int.from_bytes(read(0x020322A4, 4), "little")
    if not _ewram(pointer, 0x120):
        raise ValueError("invalid Berry Blender owner")
    body = read(pointer, 0x120)
    phase = "berry_blender_" + BLENDER_CALLBACKS[callback]
    end_state, state, players = body[0x63], body[0], body[0x7C]
    if not 2 <= players <= 4:
        raise ValueError("invalid Berry Blender player count")
    berries = struct.unpack_from("<4H", body, 0x74)
    berry_names = [read_item_name(read, berry) for berry in berries if berry]
    details.update(
        {
            "game_state": state,
            "end_state": end_state,
            "player_count": players,
            "chosen_berry_item_ids": list(berries),
            "chosen_berry_names": cast(MenuValue, berry_names),
            "arrow_position": int.from_bytes(body[0x4A:0x4C], "little"),
            "speed": int.from_bytes(body[0x4C:0x4E], "little", signed=True),
            "max_rpm": int.from_bytes(body[0x4E:0x50], "little"),
            "game_frames": int.from_bytes(body[0x104:0x108], "little"),
            "play_again_answer": body[0x9E],
        }
    )
    selected = None
    ready = callback == 0x08081899 and end_state == 0
    if callback == 0x08081FC9:
        if end_state == 10:
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                raise ValueError("Berry Blender play-again menu undrawn")
            selected = ["YES", "NO"][menu.selected - 1]
            ready = True
            phase = "berry_blender_play_again"
        elif (end_state == 5 and state == 5) or (end_state == 6 and state == 4):
            selected = "CONTINUE"
            ready = True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "A hits the blender arrow; A continues; directions select play-again choice",
        details=details,
    )


TRADE_CALLBACK = 0x0807825D


def _pokemon_failure_details(
    details: dict[str, MenuValue], prefix: str, mons: list[PartyMon]
) -> None:
    details[prefix + "_pokemon_raw"] = cast(MenuValue, [mon.raw_hex for mon in mons])
    details[prefix + "_pokemon_diagnostics"] = cast(
        MenuValue, [mon.diagnostic or mon.nickname_diagnostic for mon in mons]
    )
    contexts = [mon.cpu_context for mon in mons if mon.cpu_context is not None]
    if contexts:
        details[prefix + "_cpu_pc"] = [context.gprs[15] for context in contexts]
        details[prefix + "_cpu_lr"] = [context.gprs[14] for context in contexts]
        details[prefix + "_cpu_sp"] = [context.gprs[13] for context in contexts]
        details[prefix + "_cpu_cpsr"] = [context.cpsr for context in contexts]
        details[prefix + "_cpu_stack_hex"] = [context.stack_hex for context in contexts]


def _trade(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    pointer = int.from_bytes(read(0x0203229C, 4), "little")
    if not _ewram(pointer, 0x80):
        raise ValueError("invalid trade-menu owner")
    body = read(pointer, 0x80)
    cursor, callback = body[0x35], body[0x6F]
    counts = body[0x36:0x38]
    if callback not in (*range(18), 100):
        raise ValueError("invalid trade callback ID")
    if cursor > 12 or any(count > 6 for count in counts):
        raise ValueError("invalid trade cursor/party counts")
    details.update(
        {
            "callback_id": callback,
            "cursor_index": cursor,
            "player_party_count": counts[0],
            "partner_party_count": counts[1],
            "selected_player_index": body[0x76],
            "selected_partner_index": body[0x77],
            "player_confirm_status": body[0x7A],
            "partner_confirm_status": body[0x7B],
        }
    )
    cpu = pokemon_cpu_context(read)
    for side, base, count in [
        ("player", 0x020244EC, counts[0]),
        ("partner", 0x02024744, counts[1]),
    ]:
        raw = read(base, count * 100)
        mons = [
            decode_party_mon(raw[i * 100 : (i + 1) * 100], read, address=base + 100 * i, cpu=cpu)
            for i in range(count)
        ]
        details[side + "_species"] = cast(MenuValue, [mon.species for mon in mons])
        details[side + "_identities"] = cast(MenuValue, [mon.identity for mon in mons])
        details[side + "_nicknames"] = cast(MenuValue, [mon.nickname for mon in mons])
        details[side + "_languages"] = cast(MenuValue, [mon.language for mon in mons])
        failures = [mon for mon in mons if mon.diagnostic or mon.nickname_diagnostic]
        if failures:
            _pokemon_failure_details(details, side, failures)
            raise ValueError("trade Pokémon decoding failure")
    selected = None
    ready = False
    phase = "trade_wait"
    if callback == 0:
        if cursor == 12:
            selected = "CANCEL"
        else:
            side = "player" if cursor < 6 else "partner"
            slot = cursor if cursor < 6 else cursor - 6
            names = cast(list[str | int | float | bool | None], details[side + "_species"])
            if slot >= len(names) or not body[0x38 + cursor]:
                raise ValueError("trade cursor selects an inactive party slot")
            selected = cast(str, names[slot])
            details.update({"selected_side": side, "selected_party_index": slot})
        phase = "trade_pokemon_selection"
        ready = True
    elif callback == 1:
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("trade Pokémon action menu undrawn")
        selected = ["SUMMARY", "TRADE"][menu.selected - 1]
        details["options"] = ["SUMMARY", "TRADE"]
        ready = True
        phase = "trade_actions"
    elif callback in (3, 4):
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("trade confirmation menu undrawn")
        selected = ["YES", "NO"][menu.selected - 1]
        ready = True
        phase = "trade_confirm" if callback == 3 else "trade_cancel_confirm"
    elif callback in (8, 17):
        selected = "CONTINUE"
        ready = True
        phase = "trade_message"
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase, selected, ready, "Directions select; A confirms; B cancels", details=details
    )


PYRAMID_CALLBACK = 0x081C501D


def _pyramid_bag(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    pointer = int.from_bytes(read(0x0203CF2C, 4), "little")
    if not _ewram(pointer, 0x98C):
        raise ValueError("invalid Pyramid Bag owner")
    owners = [
        task
        for task in task_snapshot(read)
        if task[1]
        in (0x081C5BC9, 0x081C68B1, 0x081C5F69, 0x081C5FE5, 0x081C64B5, 0x081C65CD, 0x081C66ED)
    ]
    if len(owners) != 1:
        raise ValueError("Pyramid Bag has no unique input owner")
    task_id, function, data = owners[0]
    details.update(
        {
            "owner_task": task_id,
            "location": read(0x0203CF34, 1)[0],
            "swapping_from": read(pointer + 0x814, 1)[0],
        }
    )
    if function in (0x081C64B5, 0x081C65CD, 0x081C66ED):
        item = int.from_bytes(read(0x0203CE7C, 2), "little")
        label = read_item_name(read, item)
        details.update(
            {
                "item_id": item,
                "item_name": label,
                "quantity": data[8],
                "available_quantity": data[2],
            }
        )
        if function == 0x081C64B5:
            if not 1 <= data[8] <= data[2] <= 999:
                raise ValueError("invalid Pyramid Bag toss quantity")
            selected = str(data[8])
            phase = "pyramid_bag_toss_quantity"
        else:
            selected = "CONTINUE"
            phase = (
                "pyramid_bag_toss_result" if function == 0x081C65CD else "pyramid_bag_error_message"
            )
    elif function in (0x081C5BC9, 0x081C68B1):
        selected, item, index = _list_selection(read, data[0])
        details.update({"selected_item_id": item, "selected_index": index})
        phase = "pyramid_bag_swap" if function == 0x081C68B1 else "pyramid_bag"
    else:
        menu = read_menu(read)
        count = read(pointer + 0x820, 1)[0]
        actions = int.from_bytes(read(pointer + 0x818, 4), "little")
        if menu is None or menu.options != count or not 1 <= count <= 4:
            raise ValueError("invalid Pyramid Bag action cursor")
        if not 0x08000000 <= actions < 0x0A000000:
            raise ValueError("invalid Pyramid Bag action table")
        options: list[str | int | float | bool | None] = []
        for action in read(actions, count):
            if action >= 6:
                raise ValueError("invalid Pyramid Bag action ID")
            label_pointer = int.from_bytes(read(0x0861F2D8 + 8 * action, 4), "little")
            options.append(_text_pointer(read, label_pointer))
        selected = cast(str, options[menu.selected - 1])
        details["options"] = options
        phase = "pyramid_bag_actions"
    ready = not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "Directions select; A confirms; B cancels; SELECT rearranges",
        details=details,
    )


UNION_ROOM_TASK = 0x080156E1
UNION_ROOM_STATES = [
    "init",
    "init_objects",
    "init_link",
    "check_selecting_mon",
    "main",
    "do_something_prompt",
    "handle_do_something_prompt_input",
    "do_something_prompt_2",
    "print_msg",
    "handle_activity_request",
    "decline_activity_request",
    "player_contacted_you",
    "recv_contact_data",
    "print_start_activity_msg",
    "start_activity_link",
    "start_activity_wait_for_link",
    "start_activity_free_uroom",
    "start_activity_fade",
    "start_activity",
    "recv_join_chat_request",
    "try_accept_chat_request_delay",
    "try_accept_chat_request",
    "accept_chat_request",
    "wait_for_start_menu",
    "interact_with_player",
    "try_communicating",
    "print_and_exit",
    "send_activity_request",
    "trainer_appears_busy",
    "wait_for_response_to_request",
    "cancel_activity_link_error",
    "send_trade_requst",
    "request_declined",
    "print_contact_msg",
    "handle_contact_data",
    "recv_activity_request",
    "cancel_request_print_msg",
    "cancel_request_restart_link",
    "communicating_wait_for_data",
    "wait_for_contact_data",
    "print_card_info",
    "wait_finish_reading_card",
    "interact_with_attendant",
    "register_prompt",
    "cancel_registration_prompt",
    "check_trading_board",
    "trading_board_load",
    "register_prompt_handle_input",
    "trading_board_handle_input",
    "trade_prompt",
    "trade_select_mon",
    "trade_offer_mon",
    "register_request_type",
    "register_select_mon_fade",
    "register_select_mon",
    "register_complete",
    "cancel_registration",
]


def _union_room(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    owners = [task for task in task_snapshot(read) if task[1] == UNION_ROOM_TASK]
    if len(owners) != 1:
        raise ValueError("Union Room has no unique owner")
    pointer = int.from_bytes(read(0x02022C30, 4), "little")
    if not _ewram(pointer, 0xA0):
        raise ValueError("invalid Union Room state owner")
    body = read(pointer, 0xA0)
    state, text_state = body[0x14], body[0x16]
    if state >= len(UNION_ROOM_STATES):
        raise ValueError("invalid Union Room state")
    details.update(
        {
            "room_state": UNION_ROOM_STATES[state],
            "text_state": text_state,
            "current_activity": read(0x02022C2C, 1)[0],
            "partner_response": int.from_bytes(body[0x98:0x9A], "little"),
            "received_activity": list(struct.unpack_from("<3H", body, 0x9A)),
            "owner_task": owners[0][0],
        }
    )
    selected = None
    ready = False
    if state in (6, 47, 48, 52):
        list_id = body[0x1C] if state == 6 else body[0x4A] if state == 48 else body[0x1E]
        # Substates create/redraw the list before the input-processing substate.
        if text_state == 2:
            selected, item, index = _list_selection(read, list_id)
            details.update({"selected_item_id": item, "selected_index": index})
            ready = True
    elif state in (9, 21, 44, 49):
        menu = read_menu(read)
        if menu is not None and menu.options == 2:
            selected = ["YES", "NO"][menu.selected - 1]
            ready = True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "union_room_" + UNION_ROOM_STATES[state],
        selected,
        ready,
        "Directions select; A confirms; B cancels",
        details=details,
    )


FACTORY_SELECT_CALLBACK = 0x0819A4C9
FACTORY_SWAP_CALLBACK = 0x0819C7E1


def _factory_mons(
    read: ReadMemory, addresses: list[int], details: dict[str, MenuValue], prefix: str
) -> list[str]:
    cpu = pokemon_cpu_context(read)
    mons = [
        decode_party_mon(read(address, 100), read, address=address, cpu=cpu)
        for address in addresses
    ]
    details[prefix + "_identities"] = cast(MenuValue, [mon.identity for mon in mons])
    details[prefix + "_species"] = cast(MenuValue, [mon.species for mon in mons])
    details[prefix + "_levels"] = cast(MenuValue, [mon.level for mon in mons])
    details[prefix + "_nicknames"] = cast(MenuValue, [mon.nickname for mon in mons])
    details[prefix + "_languages"] = cast(MenuValue, [mon.language for mon in mons])
    failures = [mon for mon in mons if mon.diagnostic or mon.nickname_diagnostic]
    if failures:
        _pokemon_failure_details(details, prefix, failures)
        raise ValueError("Battle Factory Pokémon decoding failure")
    return [cast(str, mon.species) for mon in mons]


def _factory(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    selecting = int(cast(str, details["callback2"]), 16) == FACTORY_SELECT_CALLBACK
    address = 0x0300127C if selecting else 0x03001284
    size = 0x2AC if selecting else 0x34
    pointer = int.from_bytes(read(address, 4), "little")
    if not _ewram(pointer, size):
        raise ValueError("invalid Battle Factory screen pointer")
    body = read(pointer, size)
    tasks = task_snapshot(read)
    input_functions = (
        [0x0819B02D, 0x0819B125, 0x0819B379]
        if selecting
        else [0x0819CB1D, 0x0819CD35, 0x0819CE41, 0x0819F489]
    )
    owners = [task for task in tasks if task[1] in input_functions]
    details.update({"screen_pointer": pointer, "cursor_index": body[3], "menu_cursor": body[0]})
    selected = None
    ready = False
    phase = "factory_rental_transition" if selecting else "factory_swap_transition"
    if len(owners) > 1:
        raise ValueError("Battle Factory has multiple input owners")
    if owners:
        task, function, data = owners[0]
        state = data[0]
        details.update({"input_task": task, "input_function": function, "input_state": state})
        if selecting:
            if body[3] >= 6 or body[5] > 4 or body[7] > 1:
                raise ValueError("invalid Battle Factory rental cursor/selection")
            names = _factory_mons(
                read, [pointer + 0x14 + 0x6C * i for i in range(6)], details, "rental"
            )
            selected_ids = [body[0x10 + 0x6C * i] for i in range(6)]
            if any(index > 3 for index in selected_ids) or len(
                [i for i in selected_ids if i]
            ) != len(set(i for i in selected_ids if i)):
                raise ValueError("invalid Battle Factory rental order")
            details["selected_order"] = selected_ids
            details["selected_species"] = names[body[3]]
            phase = "factory_rental"
            if function == 0x0819B379:
                if state == 1:
                    selected, ready = names[body[3]], not bool(body[0x2A0])
                elif state == 11:
                    selected, ready = "CONTINUE", not bool(body[0x2A0])
                    phase = "factory_rental_message"
                elif state != 0:
                    raise ValueError("unknown Battle Factory rental input phase")
            elif function == 0x0819B125:
                if state == 3:
                    options = ["SUMMARY", "DESELECT" if selected_ids[body[3]] else "RENT", "OTHERS"]
                    if body[0] >= len(options):
                        raise ValueError("invalid Battle Factory rental action cursor")
                    details["options"] = options
                    selected, ready = options[body[0]], True
                    phase = "factory_rental_actions"
                elif state not in (2, 9):
                    raise ValueError("unknown Battle Factory rental action phase")
            else:
                if state == 5:
                    details["options"] = ["YES", "NO"]
                    selected, ready = ["YES", "NO"][body[7]], not bool(body[0x2A0])
                    phase = "factory_rental_confirm"
                elif state not in (4, 10):
                    raise ValueError("unknown Battle Factory rental confirmation phase")
        else:
            if body[0x10] > 1 or body[0x0E] > 1:
                raise ValueError("invalid Battle Factory swap confirmation/side")
            player = _factory_mons(
                read, [0x020244EC + 100 * i for i in range(3)], details, "player"
            )
            opponent = _factory_mons(
                read, [0x02024744 + 100 * i for i in range(3)], details, "opponent"
            )
            details.update(
                {
                    "enemy_screen": bool(body[0x0E]),
                    "selected_player_index": body[0x0C],
                    "selected_opponent_index": body[0x0D],
                    "mon_swapped": bool(body[0x20]),
                }
            )
            phase = "factory_swap"
            if function == 0x0819CE41:
                if state == 1:
                    count = body[0x11]
                    actions = int.from_bytes(body[0x18:0x1C], "little")
                    if (
                        count not in (4, 5)
                        or not 0x08000000 <= actions < 0x0A000000
                        or body[3] >= count
                    ):
                        raise ValueError("invalid Battle Factory swap action table")
                    ids = [read(actions + i * 8, 1)[0] for i in range(count)]
                    expected = [1, 1, 1, 2, 3] if body[0x0E] else [1, 1, 1, 3]
                    if ids != expected:
                        raise ValueError("Battle Factory swap action table does not match side")
                    options = (opponent if body[0x0E] else player) + (
                        ["POKÉMON FOR SWAP", "CANCEL"] if body[0x0E] else ["CANCEL"]
                    )
                    details["options"] = options
                    selected, ready = options[body[3]], True
                elif state != 0:
                    raise ValueError("unknown Battle Factory swap input phase")
            elif function == 0x0819CD35:
                if state == 3:
                    options = ["SUMMARY", "SWAP", "RECHOOSE"]
                    if body[0] >= 3:
                        raise ValueError("invalid Battle Factory swap action cursor")
                    details["options"] = options
                    selected, ready = options[body[0]], True
                    phase = "factory_swap_actions"
                elif state not in (2, 9):
                    raise ValueError("unknown Battle Factory swap action phase")
            elif function == 0x0819CB1D:
                if state == 5:
                    details["options"] = ["YES", "NO"]
                    selected, ready = ["YES", "NO"][body[0x10]], not bool(body[0x30])
                    phase = "factory_swap_confirm"
                elif state != 4:
                    raise ValueError("unknown Battle Factory swap confirmation phase")
            elif function == 0x0819F489:
                if not 0 <= state <= 4:
                    raise ValueError("unknown Battle Factory duplicate-species phase")
                if state == 1:
                    selected, ready = "CONTINUE", not bool(body[0x30])
                    phase = "factory_swap_duplicate_species"
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase, selected, ready, "Directions select; A confirms; B cancels", details=details
    )


CHAT_GLYPHS = {
    0: " ",
    1: "À",
    2: "Á",
    3: "Â",
    4: "Ç",
    5: "È",
    6: "É",
    7: "Ê",
    8: "Ë",
    9: "Ì",
    11: "Î",
    12: "Ï",
    13: "Ò",
    14: "Ó",
    15: "Ô",
    16: "Œ",
    17: "Ù",
    18: "Ú",
    19: "Û",
    20: "Ñ",
    21: "ß",
    22: "à",
    23: "á",
    25: "ç",
    26: "è",
    27: "é",
    28: "ê",
    29: "ë",
    30: "ì",
    32: "î",
    33: "ï",
    34: "ò",
    35: "ó",
    36: "ô",
    37: "œ",
    38: "ù",
    39: "ú",
    40: "û",
    41: "ñ",
    42: "º",
    43: "ª",
    45: "&",
    46: "+",
    53: "=",
    54: ";",
    81: "¿",
    82: "¡",
    90: "Í",
    91: "%",
    92: "(",
    93: ")",
    104: "â",
    111: "í",
    133: "<",
    134: ">",
    161: "0",
    162: "1",
    163: "2",
    164: "3",
    165: "4",
    166: "5",
    167: "6",
    168: "7",
    169: "8",
    170: "9",
    171: "!",
    172: "?",
    173: ".",
    174: "-",
    175: "·",
    176: "…",
    177: "“",
    178: "”",
    179: "‘",
    180: "'",
    181: "♂",
    182: "♀",
    183: "¥",
    184: ",",
    185: "×",
    186: "/",
    187: "A",
    188: "B",
    189: "C",
    190: "D",
    191: "E",
    192: "F",
    193: "G",
    194: "H",
    195: "I",
    196: "J",
    197: "K",
    198: "L",
    199: "M",
    200: "N",
    201: "O",
    202: "P",
    203: "Q",
    204: "R",
    205: "S",
    206: "T",
    207: "U",
    208: "V",
    209: "W",
    210: "X",
    211: "Y",
    212: "Z",
    213: "a",
    214: "b",
    215: "c",
    216: "d",
    217: "e",
    218: "f",
    219: "g",
    220: "h",
    221: "i",
    222: "j",
    223: "k",
    224: "l",
    225: "m",
    226: "n",
    227: "o",
    228: "p",
    229: "q",
    230: "r",
    231: "s",
    232: "t",
    233: "u",
    234: "v",
    235: "w",
    236: "x",
    237: "y",
    238: "z",
    239: "▶",
    240: ":",
    241: "Ä",
    242: "Ö",
    243: "Ü",
    244: "ä",
    245: "ö",
    246: "ü",
    255: "$",
    44: "ᵉʳ",
    52: "Lv",
    83: "PK",
    84: "MN",
    85: "PO",
    86: "Ké",
    87: "BL",
    88: "OC",
    89: "K",
    119: " ",
    121: "↑",
    122: "↓",
    123: "←",
    124: "→",
    132: "ᵉ",
    160: "ʳᵉ",
}
CHAT_SPECIAL_GLYPHS = {
    0: "UP_ARROW_2",
    1: "DOWN_ARROW_2",
    2: "LEFT_ARROW_2",
    3: "RIGHT_ARROW_2",
    4: "PLUS",
    5: "LV_2",
    6: "PP",
    7: "ID",
    8: "NO",
    9: "UNDERSCORE",
    10: "CIRCLE_1",
    11: "CIRCLE_2",
    12: "CIRCLE_3",
    13: "CIRCLE_4",
    14: "CIRCLE_5",
    15: "CIRCLE_6",
    16: "CIRCLE_7",
    17: "CIRCLE_8",
    18: "CIRCLE_9",
    19: "ROUND_LEFT_PAREN",
    20: "ROUND_RIGHT_PAREN",
    21: "CIRCLE_DOT",
    22: "TRIANGLE",
    23: "BIG_MULT_X",
    208: "EMOJI_UNDERSCORE",
    209: "EMOJI_PIPE",
    210: "EMOJI_HIGHBAR",
    211: "EMOJI_TILDE",
    212: "EMOJI_LEFT_PAREN",
    213: "EMOJI_RIGHT_PAREN",
    214: "EMOJI_UNION",
    215: "EMOJI_GREATER_THAN",
    216: "EMOJI_LEFT_EYE",
    217: "EMOJI_RIGHT_EYE",
    218: "EMOJI_AT",
    219: "EMOJI_SEMICOLON",
    220: "EMOJI_PLUS",
    221: "EMOJI_MINUS",
    222: "EMOJI_EQUALS",
    223: "EMOJI_SPIRAL",
    224: "EMOJI_TONGUE",
    225: "EMOJI_TRIANGLE_OUTLINE",
    226: "EMOJI_ACUTE",
    227: "EMOJI_GRAVE",
    228: "EMOJI_CIRCLE",
    229: "EMOJI_TRIANGLE",
    230: "EMOJI_SQUARE",
    231: "EMOJI_HEART",
    232: "EMOJI_MOON",
    233: "EMOJI_NOTE",
    234: "EMOJI_BALL",
    235: "EMOJI_BOLT",
    236: "EMOJI_LEAF",
    237: "EMOJI_FIRE",
    238: "EMOJI_WATER",
    239: "EMOJI_LEFT_FIST",
    240: "EMOJI_RIGHT_FIST",
    241: "EMOJI_BIGWHEEL",
    242: "EMOJI_SMALLWHEEL",
    243: "EMOJI_SPHERE",
    244: "EMOJI_IRRITATED",
    245: "EMOJI_MISCHIEVOUS",
    246: "EMOJI_HAPPY",
    247: "EMOJI_ANGRY",
    248: "EMOJI_SURPRISED",
    249: "EMOJI_BIGSMILE",
    250: "EMOJI_EVIL",
    251: "EMOJI_TIRED",
    252: "EMOJI_NEUTRAL",
    253: "EMOJI_SHOCKED",
    254: "EMOJI_BIGANGER",
}

CHAT_CALLBACK = 0x0801DF39
CHAT_TASK = 0x0801DF55


def _chat_glyphs(raw: bytes) -> list[str]:
    glyphs: list[str] = []
    index = 0
    while index < len(raw) and raw[index] != 0xFF:
        byte = raw[index]
        if byte == 0xF9:
            if index + 1 >= len(raw) or raw[index + 1] not in CHAT_SPECIAL_GLYPHS:
                raise ValueError("unknown Union Room Chat multibyte glyph")
            glyphs.append(CHAT_SPECIAL_GLYPHS[raw[index + 1]])
            index += 2
        else:
            if byte not in CHAT_GLYPHS:
                raise ValueError("unknown Union Room Chat glyph")
            glyphs.append(CHAT_GLYPHS[byte])
            index += 1
    if index == len(raw):
        raise ValueError("Union Room Chat text is not terminated")
    return glyphs


def _chat(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    pointer = int.from_bytes(read(0x02022C84, 4), "little")
    if not _ewram(pointer, 0x1BC):
        raise ValueError("invalid Union Room Chat owner")
    owners = [task for task in task_snapshot(read) if task[1] == CHAT_TASK]
    if len(owners) != 1:
        raise ValueError("Union Room Chat has no unique input owner")
    body = read(pointer, 0x1BC)
    function, state = struct.unpack_from("<HH", body, 4)
    page, column, row, player = body[0x10:0x14]
    names = [
        "join",
        "keyboard",
        "switch_page",
        "quit",
        "send",
        "register",
        "exit",
        "drop",
        "disbanded",
        "save_and_exit",
    ]
    allowed_states = [
        set(range(3)),
        {0, 1},
        set(range(5)),
        {0, 1, 2, 3, 4, 5, 8, 9, 10},
        set(range(5)),
        set(range(7)),
        set(range(8)),
        set(range(4)),
        set(range(5)),
        set(range(14)),
    ]
    if (
        function >= len(names)
        or state not in allowed_states[function]
        or page > 3
        or row >= 10
        or column >= 5
        or not 2 <= body[0xD] <= 5
        or player >= body[0xD]
        or body[0x15] > 15
    ):
        raise ValueError("invalid Union Room Chat phase/keyboard/players")
    message = "".join(_chat_glyphs(body[0x1A:0x39]))
    phrases = ["".join(_chat_glyphs(body[0xB9 + 21 * i : 0xB9 + 21 * (i + 1)])) for i in range(10)]
    details.update(
        {
            "owner_task": owners[0][0],
            "function_id": function,
            "function_state": state,
            "page_index": page,
            "column": column,
            "row": row,
            "player_id": player,
            "player_count": body[0xD],
            "input_message": message,
            "buffer_cursor": body[0x15],
            "registered_phrases": phrases,
            "registered_texts_changed": bool(body[0x18]),
        }
    )
    selected = None
    ready = False
    phase = "union_room_chat_" + names[function]
    if (function == 1 and state == 0) or (function == 5 and state == 1):
        if page == 3 or function == 5:
            selected = phrases[row]
            details["keyboard_rows"] = phrases
        else:
            pointers = struct.unpack("<10I", read(0x082F2BA8 + page * 40, 40))
            rows = [
                _chat_glyphs(read(address, 32))
                for address in pointers
                if 0x08000000 <= address < 0x0A000000
            ]
            if len(rows) != 10 or any(len(glyphs) != 5 for glyphs in rows):
                raise ValueError("invalid Union Room Chat ROM keyboard rows")
            selected = rows[row][column]
            details["keyboard_rows"] = ["".join(glyphs) for glyphs in rows]
        ready = True
    elif function == 2 and state == 2:
        menu = read_menu(read)
        if menu is None or menu.options != 5:
            raise ValueError("Union Room Chat page menu undrawn")
        # Printed table uses these five game labels, including cancel.
        labels = [
            _text_pointer(read, int.from_bytes(read(0x082F2DC8 + 8 * i, 4), "little"))
            for i in range(5)
        ]
        details["options"] = labels
        selected = labels[menu.selected - 1]
        ready = True
    elif (function == 3 and state in (2, 8)) or (function == 9 and state in (2, 5)):
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("Union Room Chat confirmation menu undrawn")
        details["options"] = ["YES", "NO"]
        selected, ready = ["YES", "NO"][menu.selected - 1], True
    elif function == 5 and state == 6:
        selected, ready = "CONTINUE", True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "Directions select; A adds text; B deletes/quits; START sends; "
        "SELECT changes page; R changes case/registers",
        details=details,
    )


FEED_CALLBACK = 0x08179B69
CONTEST_RESULTS_CALLBACK = 0x080F5C01


def _feed(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    pointer = int.from_bytes(read(0x0203BD18, 4), "little")
    if not _ewram(pointer, 0x1080):
        raise ValueError("invalid Pokéblock feeding owner")
    slot = read(0x0203BC9C, 1)[0]
    block = int.from_bytes(read(0x0203CE7C, 2), "little")
    if slot >= 6 or block >= 40:
        raise ValueError("invalid Pokéblock feeding Pokémon/block slot")
    names = _factory_mons(read, [0x020244EC + 100 * slot], details, "fed_pokemon")
    save = int.from_bytes(read(0x03005D8C, 4), "little")
    if not _ewram(save, 0x848 + 40 * 8):
        raise ValueError("invalid Pokéblock feeding save pointer")
    data = read(save + 0x848 + 8 * block, 8)
    body = read(pointer + 0x1050, 0x10)
    details.update(
        {
            "party_index": slot,
            "pokeblock_slot": block,
            "pokeblock_color": data[0],
            "pokeblock_flavors": list(data[1:6]),
            "pokeblock_feel": data[6],
            "feeding_timer": int.from_bytes(body[6:8], "little"),
            "animation_length": int.from_bytes(body[8:10], "little"),
            "nature_id": body[10],
            "pokeblock_gain": int.from_bytes(read(0x0203BC9E, 2), "little", signed=True),
        }
    )
    return ActiveUi(
        "pokeblock_feeding",
        names[0],
        False,
        "A or B speeds the feeding message; animation completes automatically",
        details=details,
    )


def _contest_results(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    pointer = int.from_bytes(read(0x0203A034, 4), "little")
    if not _ewram(pointer, 0x20):
        raise ValueError("invalid Contest results owner")
    state, results = struct.unpack("<2I", read(pointer, 8))
    if not _ewram(state, 0x18) or not _ewram(results, 80):
        raise ValueError("invalid Contest results state/data owner")
    body = read(state, 0x18)
    points = [struct.unpack("<iiII", read(results + 20 * i, 16)) for i in range(4)]
    details.update(
        {
            "preliminary_relative_points": [p[0] for p in points],
            "round_two_relative_points": [p[1] for p in points],
            "preliminary_bar_lengths": [p[2] for p in points],
            "round_two_bar_lengths": [p[3] for p in points],
            "sliding_text_state": body[4],
            "standings_printed": body[5],
            "winner_mon_sliding_state": body[6],
        }
    )
    tasks = task_snapshot(read)
    owners = [task for task in tasks if task[1] == 0x080F66B5]
    if len(owners) > 1:
        raise ValueError("Contest results has multiple continuation owners")
    ready = bool(owners) and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "contest_results",
        "CONTINUE" if owners else None,
        ready,
        "A closes the Contest results",
        details=details,
    )


MINIGAME_RECORD_TASKS = {0x08022251: "berry_crush_records", 0x0802E3E5: "pokemon_jump_records"}


def _minigame_records(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    owners = [task for task in task_snapshot(read) if task[1] in MINIGAME_RECORD_TASKS]
    if len(owners) != 1:
        raise ValueError("minigame records has no unique input owner")
    task, function, data = owners[0]
    state, window = data[:2]
    if not 0 <= state <= 3 or not 0 <= window < 32:
        raise ValueError("invalid minigame records state/window")
    details.update({"owner_task": task, "record_state": state, "window_id": window})
    if function == 0x08022251:
        # The displayed snapshot is copied into task.data[2:6] on creation.
        details["pressing_speeds_fixed_8_8"] = [word & 0xFFFF for word in data[2:6]]
    else:
        save = int.from_bytes(read(0x03005D90, 4), "little")
        if not _ewram(save, 0x20C):
            raise ValueError("invalid Pokémon Jump records save pointer")
        jumps, _, excellents, full_games, _, score = struct.unpack("<4H2I", read(save + 0x1FC, 16))
        details.update(
            {
                "best_jump_score": score,
                "jumps_in_row": jumps,
                "excellents_in_row": excellents,
                "games_with_five_players": full_games,
            }
        )
    if state == 2 and not _window_drawn(read, window):
        raise ValueError("minigame records window undrawn")
    ready = state == 2 and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        MINIGAME_RECORD_TASKS[function],
        "CONTINUE" if state == 2 else None,
        ready,
        "A or B closes the records",
        details=details,
    )


TRADE_ANIMATION_STATES = frozenset(
    [
        0,
        1,
        10,
        11,
        12,
        13,
        14,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        50,
        51,
        52,
        60,
        61,
        62,
        63,
        64,
        65,
        66,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        124,
        125,
        126,
        144,
        145,
        146,
        167,
        200,
        267,
    ]
)

TRADE_ANIMATION_CALLBACKS = {0x0807B60D: "in_game", 0x0807EA11: "link"}


def _trade_animation(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    callback = int(cast(str, details["callback2"]), 16)
    pointer = int.from_bytes(read(0x020322A0, 4), "little")
    if not _ewram(pointer, 0x100):
        raise ValueError("invalid trade animation owner")
    body = read(pointer, 0x100)
    state = int.from_bytes(body[0x94:0x96], "little")
    positions = list(read(0x02032298, 2))
    if positions[0] >= 6 or positions[1] >= 6 or body[0xEE] > 1:
        raise ValueError("invalid trade animation Pokémon indices/type")
    # Numeric cases are present in the matching historical primary C and ASM.
    if state not in TRADE_ANIMATION_STATES:
        raise ValueError("invalid trade animation state")
    _factory_mons(read, [0x020244EC + 100 * positions[0]], details, "player")
    _factory_mons(read, [0x02024744 + 100 * positions[1]], details, "partner")
    details.update(
        {
            "trade_kind": TRADE_ANIMATION_CALLBACKS[callback],
            "trade_state": state,
            "timer": int.from_bytes(body[0x64:0x68], "little"),
            "selected_party_indices": positions,
            "is_link_trade": bool(body[0xEE]),
            "mon_species_ids": list(struct.unpack_from("<2H", body, 0xF0)),
            "player_finish_status": body[0x72],
            "partner_finish_status": body[0x73],
            "link_timeout": int.from_bytes(body[0x8A:0x8C], "little"),
        }
    )
    ready = state == 71 and not body[0xEE] and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "trade_animation_confirmation" if ready else "trade_animation",
        "CONTINUE" if ready else None,
        ready,
        "A continues after an in-game trade; link animation advances automatically",
        details=details,
    )


PAINTING_CALLBACKS = {0x0812FDED: "loading", 0x0812FDF9: "view", 0x0812FE0D: "closing"}


def _painting(read: ReadMemory, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    callback = int(cast(str, details["callback2"]), 16)
    selected = None
    ready = False
    if callback == 0x0812FDF9:
        pointer = int.from_bytes(read(0x030061C0, 4), "little")
        if not _ewram(pointer, 32):
            raise ValueError("invalid Contest painting winner pointer")
        body = read(pointer, 32)
        species = int.from_bytes(body[8:10], "little")
        state = read(0x030011F0, 1)[0]
        if not 0 < species < 412 or body[10] >= 15 or body[30] > 4 or state > 2:
            raise ValueError("invalid Contest painting winner/hold state")
        details.update(
            {
                "personality": int.from_bytes(body[:4], "little"),
                "trainer_id": int.from_bytes(body[4:8], "little"),
                "species_id": species,
                "species": _text_pointer(read, SPECIES_NAMES + species * 11),
                "pokemon_name": "".join(_chat_glyphs(body[11:22])),
                "trainer_name": "".join(_chat_glyphs(body[22:30])),
                "contest_category": body[10],
                "contest_rank": body[30],
                "hold_state": state,
                "mosaic": int.from_bytes(read(0x030011F2, 2), "little"),
                "fade_counter": int.from_bytes(read(0x030011F4, 2), "little"),
                "artist_mode": bool(read(0x02039F5C, 1)[0]),
            }
        )
        selected = "CLOSE" if state == 1 else None
        ready = state == 1 and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        "contest_painting_" + PAINTING_CALLBACKS[callback],
        selected,
        ready,
        "A or B closes the painting",
        details=details,
    )


def read_extra_menu(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    reader = {
        MAIL_CALLBACK: _mail,
        **{address: _painting for address in PAINTING_CALLBACKS},
        **{address: _trade_animation for address in TRADE_ANIMATION_CALLBACKS},
        FEED_CALLBACK: _feed,
        CONTEST_RESULTS_CALLBACK: _contest_results,
        CHAT_CALLBACK: _chat,
        FACTORY_SELECT_CALLBACK: _factory,
        FACTORY_SWAP_CALLBACK: _factory,
        EASY_CHAT_CALLBACK: _easy_chat,
        MYSTERY_GIFT_CALLBACK: _mystery_gift,
        POKEBLOCK_CALLBACK: _pokeblock,
        DODRIO_CALLBACK: _linked_minigame,
        JUMP_CALLBACK: _linked_minigame,
        CRUSH_CALLBACK: _linked_minigame,
        CONTEST_CALLBACK: _contest,
        **{address: _blender for address in BLENDER_CALLBACKS},
        TRADE_CALLBACK: _trade,
        PYRAMID_CALLBACK: _pyramid_bag,
    }.get(callback)
    if reader is None and callback == 0x08085E5D:
        tasks = task_snapshot(read)
        if any(task[1] == UNION_ROOM_TASK for task in tasks):
            reader = _union_room
        elif any(task[1] in MINIGAME_RECORD_TASKS for task in tasks):
            reader = _minigame_records
    if reader is None:
        return None
    details = owner_details(read, callback)
    try:
        return reader(read, details)
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            "menu_unsupported",
            None,
            None,
            "Observe and report this coverage error",
            f"harness bug: {error}",
            details=details,
        )
