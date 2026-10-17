"""Build the viewer's trainer-card art from the pret/pokeemerald decomp, verified against the ROM.

Usage: build_art.py OUT_DIR [--pokeemerald DIR] [--rom FILE]

Inputs default to $POKEEMERALD (else ~/dev/pokeemerald) and $POKEBENCH_ROM. Every asset is checked
against the ROM bytes (raw, or LZ77-decompressed) and its offset is recorded in manifest.json's
"proof". Output is ROM-derived art: it belongs under the gitignored runs/ folder only. The build
goes to a temp dir next to OUT_DIR and is renamed into place only when everything verified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

TIERS = ("green", "bronze", "copper", "silver", "gold")
ROM_BASE = 0x08000000
ICON_BYTES = 32 * 64 // 2
RGB = tuple[int, int, int]
RGBA = tuple[int, int, int, int]
CLEAR: RGBA = (0, 0, 0, 0)

# name -> (front pic png, separate .pal or None for the png's own palette, stored LZ77-compressed)
TRAINERS: tuple[tuple[str, str, str | None, bool], ...] = (
    ("brendan", "trainers/front_pics/brendan.png", "trainers/palettes/brendan.pal", True),
    ("may", "trainers/front_pics/may.png", "trainers/palettes/may.pal", True),
    ("birch", "birch_speech/birch.png", None, False),
    ("wally", "trainers/front_pics/wally.png", "trainers/palettes/wally.pal", True),
    ("roxanne", "trainers/front_pics/leader_roxanne.png", None, True),
    ("brawly", "trainers/front_pics/leader_brawly.png", None, True),
    ("wattson", "trainers/front_pics/leader_wattson.png", None, True),
    ("flannery", "trainers/front_pics/leader_flannery.png", None, True),
    ("norman", "trainers/front_pics/leader_norman.png", None, True),
    ("winona", "trainers/front_pics/leader_winona.png", None, True),
    ("sidney", "trainers/front_pics/elite_four_sidney.png", None, True),
    ("phoebe", "trainers/front_pics/elite_four_phoebe.png", None, True),
    ("glacia", "trainers/front_pics/elite_four_glacia.png", None, True),
    ("drake", "trainers/front_pics/elite_four_drake.png", None, True),
)


class VerifyError(Exception):
    pass


@dataclass
class Rom:
    data: bytes
    _lz_cache: dict[int, bytes | None] = field(default_factory=dict)

    def raw(self, blob: bytes, what: str) -> int:
        off = self.data.find(blob)
        if off < 0:
            raise VerifyError(f"{what}: bytes not found in ROM")
        return off

    def lz(self, blob: bytes, what: str) -> int:
        hdr = b"\x10" + len(blob).to_bytes(3, "little")
        off = self.data.find(hdr)
        while off != -1:
            if off % 4 == 0 and self.decompress(off) == blob:
                return off
            off = self.data.find(hdr, off + 1)
        raise VerifyError(f"{what}: no LZ77 block in ROM decompresses to these bytes")

    def decompress(self, off: int) -> bytes | None:
        if off not in self._lz_cache:
            self._lz_cache[off] = lz77(self.data, off)
        return self._lz_cache[off]


def lz77(data: bytes, off: int) -> bytes | None:
    if data[off] != 0x10:
        return None
    size = int.from_bytes(data[off + 1 : off + 4], "little")
    out = bytearray()
    i = off + 4
    try:
        while len(out) < size:
            flags = data[i]
            i += 1
            for bit in range(8):
                if len(out) >= size:
                    break
                if flags & (0x80 >> bit):
                    b1, b2 = data[i], data[i + 1]
                    i += 2
                    n = (b1 >> 4) + 3
                    disp = ((b1 & 15) << 8 | b2) + 1
                    if disp > len(out):
                        return None
                    for _ in range(n):
                        out.append(out[-disp])
                else:
                    out.append(data[i])
                    i += 1
    except IndexError:
        return None
    return bytes(out[:size])


def hexoff(off: int) -> str:
    return f"0x{off:06X}"


def jasc(path: Path) -> list[RGB]:
    v = path.read_text().split()
    n = int(v[2])
    vals = [int(x) for x in v[3 : 3 + 3 * n]]
    return [(vals[i], vals[i + 1], vals[i + 2]) for i in range(0, 3 * n, 3)]


def png_palette(img: Image.Image) -> list[RGB]:
    p = img.getpalette() or []
    return [(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) for i in range(16)]


def gbapal(colors: list[RGB]) -> bytes:
    return b"".join(
        ((r >> 3) | (g >> 3) << 5 | (b >> 3) << 10).to_bytes(2, "little") for r, g, b in colors
    )


def rom_colors(pal: bytes) -> list[RGB]:
    vals = [int.from_bytes(pal[i : i + 2], "little") for i in range(0, 32, 2)]
    return [((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3) for c in vals]


def tiles4bpp(img: Image.Image) -> bytes:
    w, h = img.size
    px = img.load()
    out = bytearray()
    for ty in range(0, h, 8):
        for tx in range(0, w, 8):
            for y in range(8):
                for x in range(0, 8, 2):
                    out.append((px[tx + x, ty + y] & 15) | ((px[tx + x + 1, ty + y] & 15) << 4))
    return bytes(out)


def latfont(img: Image.Image) -> bytes:
    """gbagfx .latfont: 16x16 glyphs as four 8x8 2bpp tiles; rows are byte-swapped MSB-first."""
    px = img.load()
    out = bytearray()
    for row in range(img.size[1] // 16):
        for col in range(16):
            for tile in range(4):
                x0 = col * 16 + (tile & 1) * 8
                for i in range(8):
                    y = row * 16 + (tile >> 1) * 8 + i
                    hi = lo = 0
                    for k in range(4):
                        hi |= (px[x0 + k, y] & 3) << (6 - 2 * k)
                        lo |= (px[x0 + 4 + k, y] & 3) << (6 - 2 * k)
                    out += bytes((lo, hi))
    return bytes(out)


def indexed_to_rgba(img: Image.Image, colors: list[RGB]) -> Image.Image:
    out = Image.new("RGBA", img.size)
    src, dst = img.load(), out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            i = src[x, y] & 15
            dst[x, y] = CLEAR if i == 0 else (*colors[i], 255)
    return out


def render_tiles(tiles: bytes, colors: list[RGB], w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h))
    px = img.load()
    k = 0
    for ty in range(h // 8):
        for tx in range(w // 8):
            for y in range(8):
                for x in range(0, 8, 2):
                    b = tiles[k]
                    k += 1
                    for dx, idx in ((0, b & 15), (1, b >> 4)):
                        px[tx * 8 + x + dx, ty * 8 + y] = CLEAR if idx == 0 else (*colors[idx], 255)
    return img


# ---- trainers ------------------------------------------------------------------------------


def build_trainers(rom: Rom, gfx: Path, out: Path) -> dict[str, dict[str, str]]:
    proof: dict[str, dict[str, str]] = {}
    for name, png, pal, compressed in TRAINERS:
        img = Image.open(gfx / png)
        if img.mode != "P" or img.size != (64, 64):
            raise VerifyError(
                f"trainer {name}: expected a 64x64 indexed png, got {img.mode} {img.size}"
            )
        tiles = tiles4bpp(img)
        palette = gbapal(jasc(gfx / pal) if pal else png_palette(img))
        if compressed:
            po, pa = (
                rom.lz(tiles, f"trainer {name} pixels"),
                rom.lz(palette, f"trainer {name} palette"),
            )
            kind = "LZ77"
        else:
            po, pa = (
                rom.raw(tiles, f"trainer {name} pixels"),
                rom.raw(palette, f"trainer {name} palette"),
            )
            kind = "raw"
        rom_tiles = rom.decompress(po) if compressed else rom.data[po : po + len(tiles)]
        rom_pal = rom.decompress(pa) if compressed else rom.data[pa : pa + 32]
        assert rom_tiles is not None and rom_pal is not None
        render_tiles(rom_tiles, rom_colors(rom_pal), 64, 64).save(out / f"{name}.png")
        proof[name] = {"pixels": f"{hexoff(po)} ({kind})", "palette": f"{hexoff(pa)} ({kind})"}
    return proof


# ---- trainer card --------------------------------------------------------------------------


class CardTiles:
    def __init__(self, img: Image.Image) -> None:
        self.px = img.load()
        self.tw = img.size[0] // 8

    def tile(self, n: int) -> list[list[int]]:
        tx, ty = (n % self.tw) * 8, (n // self.tw) * 8
        return [[self.px[tx + x, ty + y] & 15 for x in range(8)] for y in range(8)]


def render_card(tiles: CardTiles, maps: list[bytes], pal: list[RGB]) -> Image.Image:
    img = Image.new("RGBA", (240, 160), CLEAR)
    px = img.load()
    for m in maps:
        for i in range(600):
            e = int.from_bytes(m[i * 2 : i * 2 + 2], "little")
            t, hf, vf, p = e & 0x3FF, e >> 10 & 1, e >> 11 & 1, e >> 12
            d = tiles.tile(t)
            for y in range(8):
                for x in range(8):
                    c = d[7 - y if vf else y][7 - x if hf else x]
                    if c:
                        px[(i % 30) * 8 + x, (i // 30) * 8 + y] = (*pal[p * 16 + c], 255)
    return img


def fill_mode(img: Image.Image, box: tuple[int, int, int, int]) -> RGBA:
    x0, y0, x1, y1 = box
    px = img.load()
    return Counter(px[x, y] for x in range(x0, x1) for y in range(y0, y1)).most_common(1)[0][0]


def clean(img: Image.Image) -> Image.Image:
    """Erase the TRAINER CARD tab text and the BADGES label with the card's own colours."""
    px = img.load()
    tab = fill_mode(img, (22, 21, 114, 27))
    for y in range(20, 28):
        for x in range(21, 115):
            px[x, y] = tab
    for y in range(111, 120):
        ref = px[200, y]
        for x in range(24, 68):
            px[x, y] = ref
    return img


def extend_tab(img: Image.Image, extra: int) -> Image.Image:
    px = img.load()
    out = img.copy()
    op = out.load()
    edge = [[px[x, y] for y in range(16, 32)] for x in range(112, 118)]
    inner = [px[60, y] for y in range(16, 32)]
    for x in range(112, 112 + extra):
        for j, y in enumerate(range(16, 32)):
            op[x, y] = inner[j]
    for i, col in enumerate(edge):
        for j, y in enumerate(range(16, 32)):
            op[112 + extra + i, y] = col[j]
    return out


def widen(base: Image.Image, width: int) -> Image.Image:
    h = base.size[1]
    col = base.crop((146, 0, 150, h))
    out = Image.new("RGBA", (width, h))
    out.paste(base.crop((0, 0, 146, h)), (0, 0))
    x = 146
    while x < width - 90:
        out.paste(col, (x, 0))
        x += 4
    out.paste(base.crop((150, 0, 240, h)), (width - 90, 0))
    return out


def wide(img: Image.Image, width: int = 400) -> Image.Image:
    out = widen(img, width)
    px, src = out.load(), img.load()
    for y in range(119, 137):
        ref = src[147, y]
        for x in range(24, width - 24):
            px[x, y] = ref
    boxes = [img.crop((32 + 24 * i, 119, 49 + 24 * i, 137)) for i in range(6)]
    step = (width - 120) / 6
    for i, b in enumerate(boxes):
        out.paste(b, (int(40 + step * i), 119))
    return out


def mini(img: Image.Image, width: int = 300) -> Image.Image:
    base = Image.new("RGBA", (240, 34 + 40 + 22))
    base.paste(img.crop((0, 0, 240, 34)), (0, 0))
    stripe = img.crop((0, 36, 240, 40))
    y = 34
    while y < 74:
        base.paste(stripe, (0, y))
        y += 4
    base.paste(img.crop((0, 138, 240, 160)), (0, 74))
    return widen(base, width)


def cropcard(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    frame = {px[0, y] for y in range(h)} | {px[x, 0] for x in range(w)}
    xs = [x for x in range(w) if px[x, h // 2] not in frame]
    ys = [y for y in range(h) if px[w // 2, y] not in frame]
    c = im.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1)).convert("RGBA")
    cp = c.load()
    cw, ch = c.size
    for y in range(ch):
        for x in range(cw):
            if cp[x, y] in frame and (x < 8 or x >= cw - 8) and (y < 8 or y >= ch - 8):
                cp[x, y] = CLEAR
    return c


def ball_left(im: Image.Image) -> Image.Image:
    im = im.copy()
    px = im.load()
    w, _ = im.size
    ball = im.crop((w - 90, 40, w - 22, 110))
    for y in range(34, 111):
        ref = px[w // 2, y]
        for x in range(8, w - 8):
            px[x, y] = ref
    im.paste(ball, (14, 40))
    return im


def add_rows(im: Image.Image, at: int, rows: int) -> Image.Image:
    w, h = im.size
    stripe = im.crop((0, at - 4, w, at))
    out = Image.new("RGBA", (w, h + rows))
    out.paste(im.crop((0, 0, w, at)), (0, 0))
    y = at
    while y < at + rows:
        out.paste(stripe, (0, y))
        y += 4
    out.paste(im.crop((0, at, w, h)), (0, at + rows))
    return out


def band3(im: Image.Image, extra: int = 40, n: int = 6, scale: int = 3) -> Image.Image:
    """Taller party band from its own plain rows, six 3x unnumbered boxes from the game's box."""
    im = im.copy()
    w, h = im.size
    px = im.load()
    box = im.crop((40, 120, 56, 136)).copy()
    bp = box.load()
    for y in range(1, 15):
        row = bp[2, y]
        for x in range(1, 15):
            bp[x, y] = row
    for y in range(116, 140):
        ref = px[w // 2, y]
        for x in range(12, w - 12):
            px[x, y] = ref
    plain = im.crop((0, 112, w, 116))
    out = Image.new("RGBA", (w, h + extra))
    out.paste(im.crop((0, 0, w, 116)), (0, 0))
    y = 116
    while y < 116 + extra:
        out.paste(plain, (0, y))
        y += 4
    out.paste(im.crop((0, 116, w, h)), (0, 116 + extra))
    op = out.load()
    band_top = 111
    band_rows = (op[w // 2, 113], op[w // 2, 114])
    band_bot = max(y for y in range(h + extra) if op[w // 2, y] in band_rows)
    s = 16 * scale
    big = box.resize((s, s), Image.NEAREST)
    first, last = 6 + 42, w - 6 - 42
    step = (last - first) / (n - 1)
    cy = (band_top + band_bot) // 2
    for i in range(n):
        out.paste(big, (round(first + step * i - s / 2), cy - s // 2), big)
    return out


def build_cards(rom: Rom, gfx: Path, out: Path) -> dict[str, object]:
    card = gfx / "trainer_card"
    tiles_img = Image.open(card / "tiles.png")
    maps = [(card / f"{layer}.bin").read_bytes() for layer in ("bg", "front")]
    proof: dict[str, object] = {
        "tiles": f"{hexoff(rom.lz(tiles4bpp(tiles_img), 'card tiles'))} (LZ77)",
        "bg_tilemap": f"{hexoff(rom.lz(maps[0], 'card bg tilemap'))} (LZ77)",
        "front_tilemap": f"{hexoff(rom.lz(maps[1], 'card front tilemap'))} (LZ77)",
    }
    tiles = CardTiles(tiles_img)
    pal_proof: dict[str, str] = {}
    for tier in TIERS:
        pal = jasc(card / f"{tier}.pal")
        pal_proof[tier] = f"{hexoff(rom.raw(gbapal(pal), f'card {tier} palette'))} (raw)"
        full = clean(render_card(tiles, maps, pal))
        w = extend_tab(wide(full), 70)
        m = extend_tab(mini(full), 78)
        cropcard(band3(ball_left(w))).save(out / f"wide-{tier}.png")
        cropcard(m).save(out / f"mini-{tier}.png")
        cropcard(add_rows(m, 74, 18)).save(out / f"mini-ribbon-{tier}.png")
    proof["palettes"] = pal_proof
    return proof


# ---- font ----------------------------------------------------------------------------------


def c_array(src: str, decl: str) -> str:
    body = src[src.index(decl) :]
    return body[body.index("{") + 1 : body.index("};")]


def build_font(rom: Rom, root: Path, out: Path) -> dict[str, str]:
    sheet = Image.open(root / "graphics/fonts/latin_normal.png")
    widths = [
        int(v)
        for v in re.findall(
            r"\d+", c_array((root / "src/fonts.c").read_text(), "gFontNormalLatinGlyphWidths[] = {")
        )
    ]
    proof = {
        "glyphs": f"{hexoff(rom.raw(latfont(sheet), 'font glyphs'))} (raw latfont)",
        "widths": f"{hexoff(rom.raw(bytes(widths), 'font glyph widths'))} (raw)",
    }
    cmap: dict[str, int] = {}
    for line in (root / "charmap.txt").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^'(.)'\s*=\s*([0-9A-F]{2})\s*$", line)
        if m and m.group(1) not in cmap:
            cmap[m.group(1)] = int(m.group(2), 16)
    sp = sheet.load()
    o = Image.new("RGBA", sheet.size, CLEAR)
    op = o.load()
    for y in range(sheet.size[1]):
        for x in range(sheet.size[0]):
            v = sp[x, y]
            if v == 1:
                op[x, y] = (255, 0, 0, 255)
            elif v == 2:
                op[x, y] = (0, 255, 0, 255)
    o.save(out / "glyphs.png")
    (out / "glyphs.json").write_text(json.dumps({"widths": widths, "cmap": cmap}))
    return proof


# ---- party icons ---------------------------------------------------------------------------


def species_ids(root: Path) -> dict[str, int]:
    defs = dict(
        re.findall(
            r"^#define\s+(SPECIES_\w+|NUM_SPECIES)\s+(.+?)\s*(?://.*)?$",
            (root / "include/constants/species.h").read_text(),
            re.M,
        )
    )
    ids: dict[str, int] = {}

    def value(name: str) -> int:
        if name not in ids:
            total = 0
            for term in defs[name].strip("()").split("+"):
                term = term.strip().strip("()")
                total += int(term) if term.isdigit() else value(term)
            ids[name] = total
        return ids[name]

    for name in defs:
        value(name)
    return ids


def designated(src: str, decl: str, ids: dict[str, int]) -> dict[int, str]:
    return {ids[k]: v for k, v in re.findall(r"\[(SPECIES_\w+)\]\s*=\s*(\w+)", c_array(src, decl))}


def icon_paths(root: Path) -> dict[str, str]:
    paths: dict[str, str] = {}
    pattern = re.compile(r'const u8 (gMonIcon_\w+)\[\] = INCGFX_U8\("([^"]+\.png)", "\.4bpp"\)')
    for f in (root / "src").rglob("*"):
        if f.suffix in (".c", ".h"):
            paths.update(pattern.findall(f.read_text(errors="replace")))
    return paths


def build_icons(rom: Rom, root: Path, out: Path) -> tuple[list[int], int, dict[str, object]]:
    ids = species_ids(root)
    src = (root / "src/pokemon_icon.c").read_text()
    table = designated(src, "gMonIconTable[] =", ids)
    pal_index = {k: int(v) for k, v in designated(src, "gMonIconPaletteIndices[] =", ids).items()}
    gfx_paths = icon_paths(root)
    size = max(table) + 1
    if sorted(table) != list(range(size)) or sorted(pal_index) != list(range(size)):
        raise VerifyError(
            "icons: gMonIconTable / gMonIconPaletteIndices are not dense over every species id"
        )

    pal_files = sorted(
        (root / "graphics/pokemon/icon_palettes").glob("icon_palette_*.pal"),
        key=lambda p: int(p.stem.rsplit("_", 1)[1]),
    )
    pals = [jasc(p) for p in pal_files]
    pal_bytes = [gbapal(p) for p in pals]
    pals_off = rom.raw(b"".join(pal_bytes), "icon palettes (gMonIconPalettes)")

    pixels: dict[int, bytes] = {}
    images: dict[int, Image.Image] = {}
    for sid, sym in table.items():
        if sym not in gfx_paths:
            raise VerifyError(f"icons: no graphics path for {sym}")
        img = Image.open(root / gfx_paths[sym])
        if img.mode != "P" or img.size != (32, 64):
            raise VerifyError(f"icons: {sym} is {img.mode} {img.size}, expected indexed 32x64")
        pixels[sid] = tiles4bpp(img)
        images[sid] = img

    head = b"".join(
        struct.pack("<I", ROM_BASE + rom.raw(pixels[s], f"icon species {s}")) for s in range(4)
    )
    table_off = rom.raw(head, "gMonIconTable")
    index_off = rom.raw(bytes(pal_index[s] for s in range(size)), "gMonIconPaletteIndices")

    old_unown = {v for k, v in ids.items() if k.startswith("SPECIES_OLD_UNOWN_")}
    egg = ids["SPECIES_EGG"]
    wanted = [s for s in range(1, egg + 1) if s not in old_unown]
    per_species: dict[str, str] = {}
    for sid in range(size):
        ptr = struct.unpack_from("<I", rom.data, table_off + 4 * sid)[0] - ROM_BASE
        if (
            not 0 <= ptr <= len(rom.data) - ICON_BYTES
            or rom.data[ptr : ptr + ICON_BYTES] != pixels[sid]
        ):
            raise VerifyError(
                f"icons: species {sid} ({table[sid]}) ROM pointer does not hold the decomp icon"
            )
        if sid in wanted:
            per_species[str(sid)] = hexoff(ptr)
            indexed_to_rgba(images[sid], pals[pal_index[sid]]).save(out / f"{sid}.png")
    proof: dict[str, object] = {
        "table": f"{hexoff(table_off)} (gMonIconTable: {size} pointers, each to its raw 4bpp)",
        "palette_indices": f"{hexoff(index_off)} (raw)",
        "palettes": [f"{hexoff(pals_off + 32 * i)} (raw)" for i in range(len(pals))],
        "species": per_species,
    }
    return wanted, egg, proof


# ---- main ----------------------------------------------------------------------------------


def git_sha(repo: Path) -> str:
    r = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True, check=False
    )
    if r.returncode != 0:
        raise VerifyError(f"pokeemerald at {repo} is not a git checkout: {r.stderr.strip()}")
    return r.stdout.strip()


def build(out: Path, root: Path, rom_path: Path) -> int:
    rom_bytes = rom_path.read_bytes()
    rom = Rom(rom_bytes)
    gfx = root / "graphics"
    for sub in ("card", "trainers", "font", "icons"):
        (out / sub).mkdir(parents=True)
    proof: dict[str, object] = {
        "card": build_cards(rom, gfx, out / "card"),
        "trainers": build_trainers(rom, gfx, out / "trainers"),
        "font": build_font(rom, root, out / "font"),
    }
    icons, egg, proof["icons"] = build_icons(rom, root, out / "icons")
    manifest = {
        "version": 1,
        "tiers": list(TIERS),
        "trainers": [t[0] for t in TRAINERS],
        "icons": icons,
        "egg": egg,
        "proof": proof,
        "source": {
            "pokeemerald": git_sha(root),
            "rom_sha1": hashlib.sha1(rom_bytes, usedforsecurity=False).hexdigest(),
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return len(icons)


def publish(out: Path, built: Path) -> None:
    """Serve `built` at `out` in one atomic step.

    `out` is a symlink to the current build directory beside it. A new build is switched in
    with a single rename of a fresh link over `out`, so readers see the old art or the new
    art, never a missing or half-built directory; the previous build is deleted only after
    the switch."""
    if out.exists() and not out.is_symlink():
        raise OSError(f"{out} is a directory, not a link to a build; remove it once and rerun")
    previous = out.resolve() if out.is_symlink() else None
    link = out.with_name(f".{out.name}.link-{os.getpid()}")
    link.unlink(missing_ok=True)
    link.symlink_to(built.name)
    try:
        os.replace(link, out)
    except BaseException:
        link.unlink(missing_ok=True)
        raise
    if previous is not None and previous != built.resolve() and previous.parent == built.parent:
        shutil.rmtree(previous, ignore_errors=True)


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
        print("build_art: set POKEBENCH_ROM (or pass --rom)", file=sys.stderr)
        return 2
    out: Path = args.out.expanduser().absolute()
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out.name}.build-", dir=out.parent))
    try:
        n_icons = build(tmp, args.pokeemerald.expanduser(), args.rom.expanduser())
    except (VerifyError, OSError) as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"build_art: FAILED, nothing written: {e}", file=sys.stderr)
        return 1
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    try:
        publish(out, tmp)
    except OSError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"build_art: FAILED, previous art left as it was: {e}", file=sys.stderr)
        return 1
    print(
        f"trainer-card art -> {out}: {len(TIERS)} tiers x 3 cards, {len(TRAINERS)} trainers, "
        f"{n_icons} icons, font; all verified against ROM"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
