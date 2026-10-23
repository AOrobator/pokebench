"""Read-only integrity/inventory audit for PokeBench evidence packets."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def audit(path, min_traces=1, min_native_ram=1):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP members")
        for name in names:
            p = PurePosixPath(name)
            if p.is_absolute() or ".." in p.parts or "\\" in name:
                raise ValueError("Unsafe ZIP path")
            if (p.suffix.lower() in {".gba", ".gb", ".gbc", ".sav", ".state", ".bios", ".zip"}
                    or any(part == ".env" or part.startswith(".env.") for part in p.parts)):
                raise ValueError("Prohibited payload type")
        manifest = json.loads(archive.read("MANIFEST.json"))
        rows = manifest["files"]
        covered = set()
        for row in rows:
            name = row["path"]
            if name in covered:
                raise ValueError("Duplicate manifest entry")
            covered.add(name)
            hasher = hashlib.sha256()
            size = 0
            with archive.open(name) as member:
                while chunk := member.read(1024 * 1024):
                    hasher.update(chunk)
                    size += len(chunk)
            if size != row["bytes"] or hasher.hexdigest() != row["sha256"]:
                raise ValueError("Payload hash/size mismatch: " + name)
        if set(names) - covered != {"MANIFEST.json", "SHA256SUMS.txt", "VALIDATION.json"}:
            raise ValueError("Unmanifested members or missing validation files")
        checks = dict(line.split("  ", 1)[::-1]
                      for line in archive.read("SHA256SUMS.txt").decode().splitlines())
        if set(checks) != covered | {"MANIFEST.json"}:
            raise ValueError("Checksum coverage mismatch")
        for row in rows:
            if checks[row["path"]] != row["sha256"]:
                raise ValueError("Manifest/checksum disagreement")
        if hashlib.sha256(archive.read("MANIFEST.json")).hexdigest() != checks["MANIFEST.json"]:
            raise ValueError("Manifest checksum mismatch")
        result = {"members": len(names), "payloadHashesVerified": len(rows),
                "completeTraceFiles": sum(n.startswith("traces/") and n.endswith("/events.jsonl") for n in names),
                "nativeRAMFiles": sum(n.startswith("traces/") and "/raw-ram/" in n and n.endswith(".json.gz") for n in names),
                "frameFiles": sum(n.startswith("traces/") and "/frames/" in n and n.endswith(".png") for n in names),
                "nativeRAMSemanticsValidatedByThisAudit": False,
                "privacyReviewPerformedByThisAudit": False}
        if result["completeTraceFiles"] < min_traces or result["nativeRAMFiles"] < min_native_ram:
            raise ValueError("Evidence inventory below declared trace/RAM minimum")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--min-traces", type=int, default=1)
    parser.add_argument("--min-native-ram", type=int, default=1)
    args = parser.parse_args()
    if args.min_traces < 0 or args.min_native_ram < 0:
        parser.error("Evidence minimums must be nonnegative")
    result = audit(args.zip, args.min_traces, args.min_native_ram)
    with args.zip.open("rb") as src:
        result["zipSHA256"] = hashlib.file_digest(src, "sha256").hexdigest()
    print(json.dumps(result, indent=2))
