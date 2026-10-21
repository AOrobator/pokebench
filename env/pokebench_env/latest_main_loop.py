"""Exploratory loop: a fresh main launcher, registry and bundle definition for every trial.

Existing fixed-run owns game leases, isolated trial trees, events and outcome recording.
This controller never signals a trial or edits its checkout. It is not a fixed-build experiment.
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit


class Child(Protocol):
    pid: int

    def poll(self) -> int | None: ...


class Host:
    def run(self, args: list[str], cwd: Path) -> str:
        return subprocess.check_output(
            args, cwd=cwd, text=True, stderr=subprocess.STDOUT, timeout=1800
        )

    def spawn(self, args: list[str], cwd: Path, log: Path) -> Child:
        with log.open("ab") as output:
            return subprocess.Popen(
                args, cwd=cwd, stdin=subprocess.DEVNULL, stdout=output, stderr=output
            )

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)

    def alive(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True


@dataclass(frozen=True)
class Lane:
    id: str
    port: int
    model_url: str
    first_arm: str


@dataclass(frozen=True)
class Config:
    repo: Path
    runs: Path
    archive: Path
    launchers: Path
    experiment: str = "whole-map-pair-2h"
    phase: str = "cook"
    wall_ms: int = 7_200_000
    poll: float = 10
    frame_limit: int = 75
    max_failures: int = 6
    retry_sleep: float = 300
    stop_override: Path | None = None
    pause_override: Path | None = None
    viewer_stamp: Path = Path("/private/tmp/pokebench-viewer/packages/viewer/dist/build-stamp.json")

    def __post_init__(self) -> None:
        for name in (self.experiment, self.phase):
            if re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,95}", name) is None:
                raise ValueError("invalid experiment or phase identifier")
        if (
            self.wall_ms <= 0
            or self.poll <= 0
            or self.retry_sleep <= 0
            or self.max_failures <= 0
            or not 0 <= self.frame_limit <= 100
        ):
            raise ValueError("invalid controller budget or limit")

    @property
    def pause(self) -> Path:
        return self.pause_override or self.archive / "whole-map-loop.PAUSE"

    @property
    def stop(self) -> Path:
        return self.stop_override or self.archive / "whole-map-loop.STOP"


def rows(path: Path) -> list[dict[str, object]]:
    # Writers append complete newline-terminated records; ignore only a concurrent partial tail.
    text = path.read_text()
    values = [json.loads(line) for line in text.split("\n")[:-1] if line.strip()]
    if any(not isinstance(value, dict) for value in values):
        raise ValueError(f"invalid record in {path}")
    return values


class Controller:
    def __init__(self, config: Config, host: Host) -> None:
        self.c = config
        self.h = host
        self.stopping = threading.Event()
        self.preparation = threading.Lock()
        self.ledgers: set[Path] = {
            config.runs
            / "experiments"
            / f"{config.experiment}-dryrun-{config.phase}"
            / "trials.jsonl"
        }
        self.ledger_lock = threading.Lock()

    def log(self, message: str) -> None:
        print(f"{time.strftime('%Y-%m-%d %H:%M:%S %Z')} latest-main-loop: {message}", flush=True)

    def head(self) -> str:
        pin = self.h.run(["git", "rev-parse", "refs/heads/main"], self.c.repo).strip()
        if re.fullmatch(r"[0-9a-f]{40}", pin) is None:
            raise ValueError("main did not resolve to a full commit")
        return pin

    def lanes(self, pin: str) -> list[Lane]:
        raw = json.loads(
            self.h.run(
                ["git", "show", f"{pin}:experiments/fixed/{self.c.experiment}.json"], self.c.repo
            )
        )
        result = []
        for lane in raw["lanes"]:
            arm = next(
                p["arm"]
                for p in raw["plan"]
                if p["lane"] == lane["id"] and p["phase"] == self.c.phase
            )
            if (
                not isinstance(lane["id"], str)
                or re.fullmatch(r"[A-Za-z0-9_-]+", lane["id"]) is None
                or arm not in {"bundle", "control"}
            ):
                raise ValueError("invalid lane or arm")
            if (
                type(lane["gamePort"]) is not int
                or not 1 <= lane["gamePort"] <= 65535
                or not isinstance(lane["modelUrl"], str)
            ):
                raise ValueError("invalid lane port or model URL")
            result.append(Lane(lane["id"], lane["gamePort"], lane["modelUrl"], arm))
        if not result or len({lane.id for lane in result}) != len(result):
            raise ValueError("missing or duplicate lanes")
        return result

    def observe_stop(self) -> bool:
        if self.c.stop.exists():
            self.stopping.set()
        with self.ledger_lock:
            ledgers = list(self.ledgers)
        for ledger in ledgers:
            if not ledger.exists():
                continue
            for row in rows(ledger):
                run = row.get("run", "")
                if (
                    row.get("kind") != "launch"
                    or not isinstance(run, str)
                    or re.fullmatch(r"[A-Za-z0-9_.-]+", run) is None
                ):
                    continue
                directory = self.c.runs / run
                control = directory / "control.jsonl"
                aborted = control.exists() and any(
                    json.loads(s).get("action") == "abort" for s in control.read_text().splitlines()
                )
                events = directory / "events.jsonl"
                ended = False
                if events.exists():
                    with events.open("rb") as stream:
                        stream.seek(max(0, events.stat().st_size - 65536))
                        tail = stream.read().decode("utf8", errors="replace").splitlines()
                    for text in tail if events.stat().st_size <= 65536 else tail[1:]:
                        try:
                            event = json.loads(text)
                        except json.JSONDecodeError:
                            continue
                        if event.get("type") == "run_end" and event.get("reason") in {
                            "operator_stop",
                            "operator_abort",
                        }:
                            ended = True
                if aborted or ended:
                    self.c.stop.write_text(f"operator stopped {run}\n")
                    self.stopping.set()
        return self.stopping.is_set()

    def busy(self, lane: Lane) -> bool:
        for path in (self.c.runs / "experiments").glob("*/status.json"):
            row = json.loads(path.read_text())
            if (
                row.get("state") not in {"finished", "stopped"}
                and isinstance(row.get("pid"), int)
                and row["pid"] > 0
                and self.h.alive(row["pid"])
            ):
                if any(item.get("port") == lane.port for item in row.get("lanes", [])):
                    return True
        pool = re.sub(r"[^a-z0-9.]+", "-", urlsplit(lane.model_url).netloc.lower())
        owner = self.c.runs / f".naming-gameplay.{pool}.lock" / "owner.json"
        if owner.exists():
            row = json.loads(owner.read_text())
            if any(
                isinstance(pid, int) and pid > 0 and self.h.alive(pid)
                for pid in (row.get("pid"), row.get("child"))
            ):
                return True
        try:
            self.h.run(["lsof", "-tiTCP:" + str(lane.port), "-sTCP:LISTEN"], self.c.repo)
            return True
        except subprocess.CalledProcessError as error:
            if error.returncode != 1:
                raise
        return False

    def viewer_current(self, pin: str) -> bool:
        if not self.c.viewer_stamp.exists():
            return False
        viewer = json.loads(self.c.viewer_stamp.read_text())
        if (
            viewer.get("dirty") is not False
            or re.fullmatch(r"[0-9a-f]{40}", str(viewer.get("commit"))) is None
        ):
            return False
        try:
            self.h.run(["git", "merge-base", "--is-ancestor", pin, viewer["commit"]], self.c.repo)
            return True
        except subprocess.CalledProcessError:
            return False

    def prepare(self, pin: str) -> Path:
        tree = self.c.launchers / pin
        if not (tree / ".git").exists():
            self.h.run(
                [
                    "git",
                    "clone",
                    "--quiet",
                    "--local",
                    "--no-checkout",
                    str(self.c.repo),
                    str(tree),
                ],
                self.c.repo,
            )
            self.h.run(["git", "checkout", "--quiet", "--detach", pin], tree)
            for source, destination in (
                (self.c.repo / ".env", tree / ".env"),
                (self.c.runs, tree / "runs"),
                (self.c.repo / "env/.venv", tree / "env/.venv"),
            ):
                destination.symlink_to(source, target_is_directory=source.is_dir())
        if (
            self.h.run(["git", "rev-parse", "HEAD"], tree).strip() != pin
            or self.h.run(["git", "status", "--porcelain"], tree).strip()
        ):
            raise ValueError("launcher checkout is not the clean captured main commit")
        stamp = tree / "packages/viewer/dist/.latest-main-ready"
        if not stamp.exists():
            self.h.run(["pnpm", "install", "--frozen-lockfile"], tree)
            self.h.run(["pnpm", "-r", "build"], tree)
            # Prebuild through the same production owner under the preparation lock. The later
            # trial only validates its completed immutable tree, avoiding concurrent first builds.
            code = """import {productionFixedHost} from './packages/viewer/dist/fixed-cli.js';
import {execFileSync} from 'node:child_process';
import {main} from './packages/viewer/dist/fixed-cli.js';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=process.cwd(),[commit,id,phase,wall]=process.argv.slice(1);
const def=JSON.parse(readFileSync(root+'/experiments/fixed/'+id+'.json','utf8'));
const scratch=mkdtempSync(join(tmpdir(),'pokebench-latest-main-rehearsal-'));
let tested=0;
try {
 for(const lane of def.lanes)for(const arm of ['control','bundle']) {
  const result=await main(['dry-run',id,'--phase',phase,'--wall-ms',wall,
   '--arm',arm,'--lane',lane.id],{
   root,runsRoot:scratch,out:()=>{},err:console.error,head:()=>commit,
   now:()=>new Date(),user:'rehearsal',rom:process.env.POKEBENCH_ROM,
   sha1File:path=>existsSync(path)?createHash('sha1').update(readFileSync(path)).digest('hex'):null,
   run:async options=>{
    if(options.def.plan.length!==1||options.def.lanes.length!==1||
     options.def.plan[0].arm!==arm||options.def.plan[0].lane!==lane.id)
     throw new Error('captured main does not support isolated single-trial dry runs');
    tested++;return 'finished';
   },host:()=>({})
  });
  if(result!==0)throw new Error('single-trial rehearsal failed');
 }
} finally {rmSync(scratch,{recursive:true,force:true});}
if(tested!==2*def.lanes.length)throw new Error('incomplete single-trial rehearsal');
console.log('single-trial CLI rehearsal passed for every lane and arm');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const host=productionFixedHost({root,runsRoot:root+'/runs',node:process.execPath,
  env:process.env,fetchFn:fetch,log:console.log,git});
const problem=await host.verifyBuild(commit);if(problem!==null)throw new Error(problem);"""
            self.h.run(
                [
                    "node",
                    "--env-file=.env",
                    "--input-type=module",
                    "-e",
                    code,
                    pin,
                    self.c.experiment,
                    self.c.phase,
                    str(self.c.wall_ms),
                ],
                tree,
            )
            stamp.write_text(pin + "\n")
        if not self.viewer_current(pin):
            self.h.run(["just", "viewer-main"], self.c.repo)
            if not self.viewer_current(pin):
                raise ValueError("viewer refresh did not serve the captured main build")
        return tree

    def trial(self, lane: Lane, arm: str) -> bool:
        if self.observe_stop() or self.c.pause.exists() or self.busy(lane):
            return False
        with self.preparation:
            pin = self.head()
            current = next((item for item in self.lanes(pin) if item.id == lane.id), None)
            if current is None or (current.port, current.model_url) != (lane.port, lane.model_url):
                raise ValueError(
                    "main changed this lane's port or model pool; restart the controller"
                )
            tree = self.prepare(pin)
            if (
                self.head() != pin
                or self.observe_stop()
                or self.c.pause.exists()
                or self.busy(lane)
            ):
                return False
            usage = self.h.run(["just", "runs-disk"], tree)
            match = re.search(r"cap \((\d+)%\)", usage)
            if match is None or int(match[1]) > self.c.frame_limit:
                return False
            if self.head() != pin:
                return False
            identity = f"{self.c.experiment}-dryrun-{self.c.phase}-solo-{arm}-{lane.id.lower()}-1"
            directory = self.c.runs / "experiments" / identity
            if directory.exists():
                destination = self.c.archive / f"{identity}-{time.time_ns()}"
                directory.rename(destination)
            ledger = directory / "trials.jsonl"
            with self.ledger_lock:
                self.ledgers.add(ledger)
            self.log(f"lane {lane.id} {arm}: launching fresh main {pin}")
            child = self.h.spawn(
                [
                    "just",
                    "fixed-run",
                    "dry-run",
                    self.c.experiment,
                    "--phase",
                    self.c.phase,
                    "--wall-ms",
                    str(self.c.wall_ms),
                    "--arm",
                    arm,
                    "--lane",
                    lane.id,
                ],
                tree,
                self.c.archive / f"latest-main-{lane.id}.log",
            )
            (self.c.archive / f"latest-main-{lane.id}.json").write_text(
                json.dumps(
                    {
                        "controller": os.getpid(),
                        "runner": child.pid,
                        "commit": pin,
                        "lane": lane.id,
                        "arm": arm,
                        "ledger": str(ledger),
                    }
                )
            )
        while child.poll() is None:
            self.observe_stop()
            self.h.sleep(2)
        self.observe_stop()
        if child.poll() != 0:
            raise RuntimeError(
                f"lane {lane.id}: exploratory runner failed; see latest-main-{lane.id}.log"
            )
        records = rows(ledger)
        launches = [row for row in records if row.get("kind") == "launch"]
        outcomes = [row for row in records if row.get("kind") == "outcome"]
        if (
            len(launches) != 1
            or len(outcomes) != 1
            or outcomes[0].get("run") != launches[0].get("run")
            or outcomes[0].get("valid") is not True
        ):
            raise RuntimeError(f"lane {lane.id}: expected one recorded valid trial; see {ledger}")
        return True

    def worker(self, lane: Lane) -> None:
        arm = lane.first_arm
        failures = 0
        while not self.stopping.is_set():
            try:
                if self.observe_stop():
                    return
                if self.trial(lane, arm):
                    arm = "control" if arm == "bundle" else "bundle"
                    failures = 0
            except Exception as error:
                failures += 1
                self.log(f"lane {lane.id} holding: {error}")
                if failures >= self.c.max_failures:
                    self.stopping.set()
                    return
            self.h.sleep(self.c.retry_sleep if failures else self.c.poll)


def main() -> None:
    repo = Path(os.environ.get("REPO", str(Path.home() / "dev/pokebench")))
    runs = Path(os.environ.get("RUNS", str(repo / "runs")))
    archive = Path(os.environ.get("ARCHIVE", str(runs / "dryruns")))
    config = Config(
        repo,
        runs,
        archive,
        Path(os.environ.get("LATEST_MAIN_LAUNCHERS", "/private/tmp/pokebench-auto-launchers")),
        os.environ.get("EXP_ID", "whole-map-pair-2h"),
        os.environ.get("PHASE", "cook"),
        int(os.environ.get("WALL_MS", "7200000")),
        float(os.environ.get("POLL", "10")),
        int(os.environ.get("FRAME_LIMIT", "75")),
        max_failures=int(os.environ.get("MAX_FAILS", "6")),
        retry_sleep=float(os.environ.get("RETRY_SLEEP", "300")),
        stop_override=Path(os.environ["STOP_FILE"]) if "STOP_FILE" in os.environ else None,
        pause_override=Path(os.environ["PAUSE_FILE"]) if "PAUSE_FILE" in os.environ else None,
        viewer_stamp=Path(
            os.environ.get("POKEBENCH_VIEWER_WORKTREE", "/private/tmp/pokebench-viewer")
        )
        / "packages/viewer/dist/build-stamp.json",
    )
    archive.mkdir(parents=True, exist_ok=True)
    config.launchers.mkdir(parents=True, exist_ok=True)
    with (archive / "latest-main-loop.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        controller = Controller(config, Host())
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: controller.stopping.set())
        (archive / "latest-main-loop.pid").write_text(str(os.getpid()))
        controller.log(
            "started; each trial captures main independently; active runs are never signalled"
        )
        threads = [
            threading.Thread(target=controller.worker, args=(lane,))
            for lane in controller.lanes(controller.head())
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()


if __name__ == "__main__":
    main()
