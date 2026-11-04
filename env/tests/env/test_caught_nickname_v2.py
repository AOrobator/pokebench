"""429f archived native Cmd_trygivecaughtmonnick YES/NO, no emulator input."""

import os
from functools import cache

from pokebench_env.readout import features_off_from_env
from pokebench_env.rom import resolve_rom

ID = "caught-nickname-prompt-v2"


@cache
def rom():
    return resolve_rom(os.environ).read_bytes()


def test_server_defaults_keep_omitted_v2_off():
    assert ID in features_off_from_env({})
