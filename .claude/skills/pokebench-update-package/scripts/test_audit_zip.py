import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("audit_zip", Path(__file__).with_name("audit_zip.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AuditTests(unittest.TestCase):
    def packet(self, root, name="traces/ended/events.jsonl", corrupt=False, extra=None):
        payload = b'{"type":"run_end"}\n'
        digest = hashlib.sha256(payload).hexdigest()
        manifest = json.dumps({"files": [{"path": name, "bytes": len(payload), "sha256": digest}]}).encode()
        checks = digest + "  " + name + "\n" + hashlib.sha256(manifest).hexdigest() + "  MANIFEST.json\n"
        path = Path(root) / "packet.zip"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(name, b"broken" if corrupt else payload)
            z.writestr("MANIFEST.json", manifest)
            z.writestr("SHA256SUMS.txt", checks)
            z.writestr("VALIDATION.json", "{}")
            if extra:
                z.writestr(extra, "unmanifested")
        return path

    def test_valid_and_inventory(self):
        with tempfile.TemporaryDirectory() as root:
            result = module.audit(self.packet(root), min_native_ram=0)
            self.assertEqual(result["completeTraceFiles"], 1)
            self.assertEqual(result["nativeRAMFiles"], 0)
            self.assertFalse(result["nativeRAMSemanticsValidatedByThisAudit"])

    def test_evidence_minimums_reject_light_packet(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "inventory below"):
                module.audit(self.packet(root))

    def test_corruption(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "mismatch"):
                module.audit(self.packet(root, corrupt=True))

    def test_unsafe_and_prohibited(self):
        for name in ["../escape", "/absolute", "C:\\bad", "rom.gba", ".env", "source/.env.local", "old.zip"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as root:
                with self.assertRaises(ValueError):
                    module.audit(self.packet(root, name=name))

    def test_unmanifested(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "Unmanifested"):
                module.audit(self.packet(root, extra="forgotten.txt"))


if __name__ == "__main__":
    unittest.main()
