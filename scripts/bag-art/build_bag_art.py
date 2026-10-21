"""Build the viewer's BAG page item icons from pret/pokeemerald.

Usage: build_bag_art.py OUT_DIR [--pokeemerald DIR] [--rom FILE]

Same rules as scripts/trainer-card/build_art.py, whose helpers this reuses: inputs default to
$POKEEMERALD (else ~/dev/pokeemerald) and $POKEBENCH_ROM; every asset is checked against the ROM
(gItemIconTable's pointers must decompress to the decomp's icon and palette); the output is ROM-derived and belongs under the
gitignored runs/ folder only, switched into place atomically once everything verified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import tempfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "trainer-card"))

from build_art import (  # noqa: E402
    ROM_BASE,
    Rom,
    VerifyError,
    c_array,
    gbapal,
    git_sha,
    hexoff,
    jasc,
    publish,
    render_tiles,
    rom_colors,
    tiles4bpp,
)


def item_ids(root: Path) -> dict[str, int]:
    src = (root / "include/constants/items.h").read_text()
    body = src[
        src.index("enum {") + len("enum {") : src.index("ITEMS_COUNT")
        + len("ITEMS_COUNT")
    ]
    body = re.sub(r"//.*", "", body)
    names = [n.strip() for n in body.split(",") if n.strip()]
    if any("=" in n for n in names):
        raise VerifyError("items: the item enum has explicit values; update item_ids()")
    ids = {name: i for i, name in enumerate(names)}
    for name, want in (("ITEM_POKE_BALL", 4), ("ITEM_POTION", 13), ("ITEM_TM09", 297)):
        if ids.get(name) != want:
            raise VerifyError(f"items: {name} is {ids.get(name)}, expected {want}")
    return ids


def item_gfx_paths(root: Path) -> dict[str, str]:
    pattern = re.compile(
        r'const u32 (gItemIcon\w+)\[\] = INCGFX_U32\("([^"]+)", "[^"]+"\)'
    )
    return dict(pattern.findall((root / "src/data/graphics/items.h").read_text()))


def build_items(rom: Rom, root: Path, out: Path) -> tuple[list[int], dict[str, object]]:
    ids = item_ids(root)
    table_src = c_array(
        (root / "src/data/item_icon_table.h").read_text(), "gItemIconTable["
    )
    table = {
        ids[k]: (icon, pal)
        for k, icon, pal in re.findall(
            r"\[(ITEMS?_\w+)\]\s*=\s*\{(\w+),\s*(\w+)\}", table_src
        )
    }
    size = ids["ITEMS_COUNT"] + 1
    if sorted(table) != list(range(size)):
        raise VerifyError("items: gItemIconTable is not dense over every item id")
    paths = item_gfx_paths(root)

    blobs: dict[str, bytes] = {}
    for icon, pal in table.values():
        for sym in (icon, pal):
            if sym in blobs:
                continue
            if sym not in paths:
                raise VerifyError(f"items: no graphics path for {sym}")
            if sym.startswith("gItemIconPalette_"):
                blobs[sym] = gbapal(jasc(root / paths[sym]))
            else:
                img = Image.open(root / paths[sym])
                if img.mode != "P" or img.size != (24, 24):
                    raise VerifyError(
                        f"items: {sym} is {img.mode} {img.size}, expected 24x24"
                    )
                blobs[sym] = tiles4bpp(img)

    first = {s: rom.lz(blobs[s], s) for s in table[0]}
    head = struct.pack(
        "<II", ROM_BASE + first[table[0][0]], ROM_BASE + first[table[0][1]]
    )
    table_off = rom.raw(head, "gItemIconTable")
    proof_items: dict[str, str] = {}
    wanted = [i for i in range(1, size - 1) if table[i][0] != "gItemIcon_QuestionMark"]
    for item in range(size):
        icon_ptr, pal_ptr = (
            p - ROM_BASE
            for p in struct.unpack_from("<II", rom.data, table_off + 8 * item)
        )
        icon, pal = table[item]
        tiles, colors = rom.decompress(icon_ptr), rom.decompress(pal_ptr)
        if tiles != blobs[icon] or colors != blobs[pal]:
            raise VerifyError(
                f"items: item {item} ROM pointers do not hold {icon} / {pal}"
            )
        if item in wanted:
            render_tiles(tiles, rom_colors(colors), 24, 24).save(out / f"{item}.png")
            proof_items[str(item)] = f"{hexoff(icon_ptr)} / {hexoff(pal_ptr)} (LZ77)"
    proof: dict[str, object] = {
        "table": f"{hexoff(table_off)} (gItemIconTable: {size} icon/palette pointer pairs)",
        "items": proof_items,
    }
    return wanted, proof


def build(out: Path, root: Path, rom_path: Path) -> int:
    rom_bytes = rom_path.read_bytes()
    rom = Rom(rom_bytes)
    (out / "items").mkdir(parents=True)
    items, item_proof = build_items(rom, root, out / "items")
    manifest = {
        "version": 1,
        "items": items,
        "proof": {"items": item_proof},
        "source": {
            "pokeemerald": git_sha(root),
            "rom_sha1": hashlib.sha1(rom_bytes, usedforsecurity=False).hexdigest(),
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return len(items)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("out", type=Path)
    ap.add_argument(
        "--pokeemerald",
        type=Path,
        default=Path(os.environ.get("POKEEMERALD") or Path.home() / "dev/pokeemerald"),
    )
    ap.add_argument("--rom", type=Path, default=os.environ.get("POKEBENCH_ROM") or None)
    args = ap.parse_args(argv)
    if args.rom is None:
        print("build_bag_art: set POKEBENCH_ROM (or pass --rom)", file=sys.stderr)
        return 2
    out: Path = args.out.expanduser().absolute()
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out.name}.build-", dir=out.parent))
    try:
        n_items = build(tmp, args.pokeemerald.expanduser(), args.rom.expanduser())
    except (VerifyError, OSError) as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"build_bag_art: FAILED, nothing written: {e}", file=sys.stderr)
        return 1
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    try:
        publish(out, tmp)
    except OSError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(
            f"build_bag_art: FAILED, previous art left as it was: {e}", file=sys.stderr
        )
        return 1
    print(f"bag art -> {out}: {n_items} item icons; all verified against ROM")
    return 0


if __name__ == "__main__":
    sys.exit(main())
