"""Exercise the real shell loop with fake launch/serving commands and a real local git source."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

DRIVER = Path(__file__).with_name("whole-map-loop.sh").resolve()

FAKE_JUST = '''#!/usr/bin/env python3
import json,os,pathlib,subprocess,sys
root=pathlib.Path(os.environ['REPO']);runs=root/'runs';archive=pathlib.Path(os.environ['ARCHIVE'])
if sys.argv[1:] == ['viewer-main']: sys.exit(1 if os.environ.get('REHEARSAL_VIEWER_FAIL') else 0)
if sys.argv[1:] == ['runs-disk']: (root/'disk-read').write_text('read');print('frames 1 GiB / cap (1%)');sys.exit(0)
args=sys.argv[1:]
assert args == ['fixed-run','dry-run','glm53-flash-4h','--phase','cook','--wall-ms','14400000','--feature-recipe','bundle-v-control'],args
counter=root/'rounds';n=int(counter.read_text())+1 if counter.exists() else 1;counter.write_text(str(n))
pin=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
with (root/'launches.jsonl').open('a') as out:out.write(json.dumps({'round':n,'pin':pin,'recipe':json.loads((pathlib.Path.cwd()/'experiments/fixed/bundle-v-control.json').read_text())})+'\\n')
ledger=runs/'experiments/glm53-flash-4h-dryrun-cook';ledger.mkdir(parents=True,exist_ok=True)
rows=[]
for arm in ['bundle','control']:
 run=f'fake-{n}-{arm}';d=runs/run;d.mkdir()
 reason='operator_abort' if os.environ.get('REHEARSAL_ABORT') else 'budget'
 (d/'events.jsonl').write_text(json.dumps({'type':'run_end','reason':reason},separators=(',',':'))+'\\n')
 rows.extend([{'kind':'launch','lane':'A','arm':arm,'run':run,'at':f'2026-10-21T00:00:0{n}.000Z'},{'kind':'outcome','valid':reason=='budget'}])
(ledger/'trials.jsonl').write_text(''.join(json.dumps(r,separators=(',',':'))+'\\n' for r in rows))
if n==1:
 p=root/'experiments/fixed/bundle-v-control.json';p.write_text(json.dumps({'revision':2}))
 subprocess.run(['git','add',str(p)],cwd=root,check=True)
 subprocess.run(['git','commit','-qm','advance main between pairs'],cwd=root,check=True)
if n==2:(archive/'glm-four-hour-loop.STOP').write_text('fake rehearsal complete')
'''


class GlmLoopRehearsal(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="glm-loop-rehearsal-")
        self.root = Path(self.tmp.name) / "source"
        self.root.mkdir()
        self.archive = self.root / "runs/dryruns"
        self.archive.mkdir(parents=True)
        self.bin = Path(self.tmp.name) / "bin"
        self.bin.mkdir()
        for name, body in [("just", FAKE_JUST), ("pnpm", "#!/bin/sh\nexit 0\n"), ("lsof", "#!/bin/sh\nexit 1\n")]:
            p = self.bin / name
            p.write_text(body)
            p.chmod(0o755)
        definitions = self.root / "experiments/fixed"
        definitions.mkdir(parents=True)
        (definitions / "glm53-flash-4h.json").write_text(json.dumps({"lanes": [{"gamePort": 8077, "modelUrl": "http://127.0.0.1:8099"}]}))
        (definitions / "bundle-v-control.json").write_text(json.dumps({"revision": 1}))
        (self.root / "env").mkdir()
        (self.root / "env/.keep").write_text("")
        (self.root / ".env").write_text("")
        (self.root / ".gitignore").write_text("runs/\nrounds\nlaunches.jsonl\ndisk-read\n")
        for cmd in [["init", "-q", "-b", "main"], ["config", "user.name", "Rehearsal"], ["config", "user.email", "rehearsal@example.invalid"], ["add", "."], ["commit", "-qm", "fixture"]]:
            subprocess.run(["git", *cmd], cwd=self.root, check=True)
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}", "REPO": str(self.root), "RUNS": str(self.root / "runs"), "ARCHIVE": str(self.archive), "JUST": str(self.bin / "just"), "VIEWER_CMD": f"{self.bin / 'just'} viewer-main", "MAIN_WT": str(Path(self.tmp.name) / "pinned-main"), "LOOP_NAME": "glm-four-hour-loop", "EXP_ID": "glm53-flash-4h", "FEATURE_RECIPE": "bundle-v-control", "EXPECTED_TRIALS": "2", "WALL_MS": "14400000", "POLL": "0.05", "STOP_POLL": "0.05", "MIN_ROUND_S": "0"}
        self.children = []

    def tearDown(self):
        for p in self.children:
            if p.poll() is None:
                p.terminate()
                p.communicate(timeout=5)
        self.tmp.cleanup()

    def start(self):
        p = subprocess.Popen(["/bin/sh", str(DRIVER)], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.children.append(p)
        return p

    def test_two_serial_pairs_refresh_main_and_preserve_first_ledger(self):
        p = self.start()
        out = p.communicate(timeout=20)[0]
        self.assertEqual(p.returncode, 0, out)
        rows = [json.loads(l) for l in (self.root / "launches.jsonl").read_text().splitlines()]
        self.assertEqual([r["recipe"]["revision"] for r in rows], [1, 2], out)
        self.assertNotEqual(rows[0]["pin"], rows[1]["pin"], out)
        self.assertEqual(out.count("2 valid trial(s)"), 2, out)
        self.assertEqual(len(list(self.archive.glob("glm53-flash-4h-dryrun-cook-*/trials.jsonl"))), 1)
        self.assertFalse((self.archive / "glm-four-hour-loop.lock").exists())

    def test_viewer_abort_stops_outer_loop(self):
        self.env["REHEARSAL_ABORT"] = "1"
        p = self.start()
        out = p.communicate(timeout=20)[0]
        self.assertEqual(p.returncode, 0, out)
        self.assertEqual((self.root / "rounds").read_text(), "1", out)
        self.assertIn("operator stopped run fake-1-bundle", (self.archive / "glm-four-hour-loop.STOP").read_text())

    def test_viewer_restart_failure_refuses_launch(self):
        self.env["REHEARSAL_VIEWER_FAIL"] = "1"
        p = self.start()
        out = p.communicate(timeout=5)[0]
        self.assertEqual(p.returncode, 1, out)
        self.assertIn("viewer restart failed; refusing to launch", out)
        self.assertFalse((self.root / "rounds").exists(), out)

    def test_singleton_and_disk_hold_do_not_launch(self):
        self.env["FRAME_LIMIT"] = "0"
        p = self.start()
        lock = self.archive / "glm-four-hour-loop.lock/pid"
        deadline = time.monotonic() + 5
        while not lock.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(lock.exists())
        other = self.start()
        other_out = other.communicate(timeout=5)[0]
        self.assertEqual(other.returncode, 1, other_out)
        self.assertIn("refusing duplicate loop", other_out)
        # Wait for the real driver to reach frame-cap hold, not just lock acquisition.
        deadline = time.monotonic() + 5
        while not (self.root / "disk-read").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        (self.archive / "glm-four-hour-loop.STOP").write_text("stop held loop")
        out = p.communicate(timeout=5)[0]
        self.assertEqual(p.returncode, 0, out)
        self.assertFalse((self.root / "rounds").exists(), out)
        self.assertTrue((self.root / "disk-read").exists(), out)


if __name__ == "__main__":
    unittest.main()
