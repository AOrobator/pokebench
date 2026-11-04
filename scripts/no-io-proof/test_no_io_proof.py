"""Guard proof: run by scripts/no-io-proof.py, never collected by the suites. Only test_pure may pass."""

import asyncio
import os
import socket
import subprocess
import tempfile
import urllib.request
from pathlib import Path


def test_pure():
    assert 1 + 1 == 2


def test_one_loop_passes():
    asyncio.run(asyncio.sleep(0))


def test_two_loops():
    asyncio.run(asyncio.sleep(0))
    asyncio.run(asyncio.sleep(0))


def test_read():
    Path("/etc/hosts").read_text()


def test_stat():
    os.path.exists("/etc/hosts")


def test_write():
    with open("/tmp/pokebench-no-io-proof", "w") as out:
        out.write("x")


def test_tempdir():
    tempfile.mkdtemp()


def test_tmp_path(tmp_path):
    assert tmp_path


def test_process():
    subprocess.run(["true"], check=True)


def test_socket():
    socket.socket()


def test_dns():
    socket.getaddrinfo("localhost", 80)


def test_urlopen():
    urllib.request.urlopen("http://127.0.0.1:9/")


def test_swallowed():
    try:
        Path("/etc/hosts").read_text()
    except OSError:
        pass
