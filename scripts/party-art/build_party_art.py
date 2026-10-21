"""Build the viewer's POKéMON PARTY page art and tables from pret/pokeemerald.

Usage: build_party_art.py OUT_DIR [--pokeemerald DIR] [--rom FILE]

Same rules as scripts/trainer-card/build_art.py, whose helpers this reuses: inputs default to
$POKEEMERALD (else ~/dev/pokeemerald) and $POKEBENCH_ROM; every image is checked against the ROM
(raw or LZ77) and every table is read from the ROM and cross-checked against the decomp; the output
is ROM-derived and belongs under the gitignored runs/ folder only, switched into place atomically
once everything verified.

Output:
  front/<species>.png   first frame of each species' front picture, normal palette
  parts/*.png           type icons, status icons, party balls, summary Poké Ball, HP tag, EXP bar,
                        mon markings
  data.json             species (Hoenn dex, types, abilities, gender ratio, growth rate), moves
                        (type, power, accuracy, PP, description), abilities, natures, EXP tables
  manifest.json         version, sizes and the ROM offsets that prove each piece
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
    RGB,
    Rom,
    VerifyError,
    c_array,
    gbapal,
    git_sha,
    hexoff,
    indexed_to_rgba,
    jasc,
    latfont,
    png_palette,
    publish,
    species_ids,
    tiles4bpp,
)

TYPES = (
    "normal fight flying poison ground rock bug ghost steel mystery "
    "fire water grass electric psychic ice dragon dark"
).split()
CONTEST = "cool beauty cute smart tough".split()
SPECIES_ROW = 28  # sizeof(struct SpeciesInfo)
MOVE_ROW = 12  # sizeof(struct BattleMove)
MAX_LEVEL = 100
GROWTH_RATES = 6
# Ball item IDs 1-12 (ITEM_MASTER_BALL .. ITEM_PREMIER_BALL), the values of a Pokémon's ball field.
BALLS = "master ultra great poke safari net dive nest repeat timer luxury premier".split()


# ---- decomp parsing --------------------------------------------------------------------------


def int_defines(path: Path, prefix: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for name, value in re.findall(rf"^#define\s+({prefix}\w+)\s+(\w+)", path.read_text(), re.M):
        if re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", value):
            out[name] = int(value, 0)
        elif value in out:
            out[name] = out[value]
    return out


def enum_values(src: str, first: str) -> dict[str, int]:
    body = src[src.index(first) :]
    body = body[: body.index("}")]
    names = [n for n in re.findall(r"^\s*(\w+)\s*,", body, re.M)]
    return {n: i for i, n in enumerate(names)}


def c_string(literals: str) -> str:
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', literals)
    return "".join(parts).replace("\\n", "\n").replace('\\"', '"').replace("\\'", "'")


def charmap(root: Path) -> dict[str, int]:
    cmap: dict[str, int] = {}
    for line in (root / "charmap.txt").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^'(\\'|.)'\s*=\s*([0-9A-F]{2})\s*$", line)
        if m:
            ch = "'" if m.group(1) == "\\'" else m.group(1)
            cmap.setdefault(ch, int(m.group(2), 16))
    return cmap


def encode(text: str, cmap: dict[str, int]) -> bytes:
    out = bytearray()
    for ch in text:
        if ch == "\n":
            out.append(0xFE)
        elif ch in cmap:
            out.append(cmap[ch])
        else:
            raise VerifyError(f"text: no game character for {ch!r} in {text!r}")
    return bytes(out) + b"\xff"


def struct_blocks(src: str, key: str) -> dict[str, str]:
    """`[KEY_X] = { ... },` initializer bodies of a designated-initializer table."""
    marks = list(re.finditer(rf"\[({key}_\w+)\]\s*=", src))
    ends = [m.start() for m in marks[1:]] + [len(src)]
    return {m.group(1): src[m.end() : end] for m, end in zip(marks, ends, strict=False)}


def field(body: str, name: str) -> str | None:
    m = re.search(rf"\.{name}\s*=\s*(\{{[^}}]*\}}|[^,\n]+)", body)
    return None if m is None else m.group(1).strip()


# ---- tables (read from the ROM, cross-checked against the decomp) ---------------------------


def locate(rom: Rom, pattern: bytes, what: str, align: int = 4) -> int:
    hits = [m.start() for m in re.finditer(pattern, rom.data, re.S) if m.start() % align == 0]
    if len(hits) != 1:
        raise VerifyError(f"{what}: expected one match in ROM, found {len(hits)}")
    return hits[0]


def gender_value(expr: str, consts: dict[str, int]) -> int | None:
    m = re.fullmatch(r"PERCENT_FEMALE\(([\d.]+)\)", expr)
    if m:
        return min(254, int(float(m.group(1)) * 255 / 100))
    return consts.get(expr)


def build_species(rom: Rom, root: Path) -> tuple[dict[str, object], dict[str, object]]:
    ids = species_ids(root)
    num = ids["NUM_SPECIES"]
    types = int_defines(root / "include/constants/pokemon.h", "TYPE_")
    growth = int_defines(root / "include/constants/pokemon.h", "GROWTH_")
    gender_consts = int_defines(root / "include/constants/pokemon.h", "MON_")
    abilities = int_defines(root / "include/constants/abilities.h", "ABILITY_")
    blocks = struct_blocks((root / "src/data/pokemon/species_info.h").read_text(), "SPECIES")

    def row_head(name: str) -> bytes:
        b = blocks[name]
        stats = [
            int(field(b, f) or "x", 0)
            for f in (
                "baseHP",
                "baseAttack",
                "baseDefense",
                "baseSpeed",
                "baseSpAttack",
                "baseSpDefense",
            )
        ]
        t = re.findall(r"TYPE_\w+", field(b, "types") or "")
        return bytes(stats + [types[t[0]], types[t[1]]])

    pattern = b"".join(
        re.escape(row_head(n)) + b".{20}"
        for n in ("SPECIES_BULBASAUR", "SPECIES_IVYSAUR", "SPECIES_VENUSAUR")
    )
    first = locate(rom, pattern, "gSpeciesInfo (Bulbasaur..Venusaur)")
    table = first - SPECIES_ROW
    if rom.data[table : table + SPECIES_ROW] != bytes(SPECIES_ROW):
        raise VerifyError("gSpeciesInfo: SPECIES_NONE row is not empty")

    by_id = {v: k for k, v in ids.items() if k.startswith("SPECIES_") and k != "SPECIES_NONE"}
    out: dict[str, object] = {}
    checked = 0
    for sid in range(1, num):
        row = rom.data[table + sid * SPECIES_ROW : table + (sid + 1) * SPECIES_ROW]
        rec = {
            "types": [row[6], row[7]],
            "gender": row[16],
            "growth": row[19],
            "abilities": [row[22], row[23]],
        }
        name = by_id.get(sid)
        b = blocks.get(name or "")
        if b is not None and field(b, "types") is not None:
            want_types = [types[t] for t in re.findall(r"TYPE_\w+", field(b, "types") or "")]
            want_ab = [
                abilities[a] for a in re.findall(r"ABILITY_\w+", field(b, "abilities") or "")
            ]
            want_growth = growth.get(field(b, "growthRate") or "")
            want_gender = gender_value(field(b, "genderRatio") or "", gender_consts)
            if (
                want_types != rec["types"]
                or want_ab != rec["abilities"]
                or want_growth != rec["growth"]
                or want_gender != rec["gender"]
            ):
                raise VerifyError(f"gSpeciesInfo: {name} differs between ROM {rec} and decomp")
            checked += 1
        out[str(sid)] = rec
    if checked < num - 30:
        raise VerifyError(
            f"gSpeciesInfo: only {checked} of {num - 1} species cross-checked against the decomp"
        )

    # sSpeciesToHoennPokedexNum: the decomp's table must be in the ROM byte for byte.
    dex_src = (root / "include/constants/pokedex.h").read_text()
    hoenn = enum_values(dex_src, "HOENN_DEX_NONE")
    pairs = [
        n
        for n in re.findall(r"SPECIES_TO_HOENN\((\w+)\)", (root / "src/pokemon.c").read_text())
        if n != "name"
    ]
    dex = [0] * (num - 1)
    for name in pairs:
        dex[ids[f"SPECIES_{name}"] - 1] = hoenn[f"HOENN_DEX_{name}"]
    dex_off = rom.raw(struct.pack(f"<{num - 1}H", *dex), "sSpeciesToHoennPokedexNum")
    for sid in range(1, num):
        out[str(sid)]["dex"] = dex[sid - 1]  # type: ignore[index]
    proof = {
        "species_info": f"{hexoff(table)} (raw, {num} rows; {checked} cross-checked)",
        "hoenn_dex": f"{hexoff(dex_off)} (raw)",
    }
    return out, proof


def build_moves(
    rom: Rom, root: Path, cmap: dict[str, int]
) -> tuple[dict[str, object], dict[str, object]]:
    moves = int_defines(root / "include/constants/moves.h", "MOVE")
    types = int_defines(root / "include/constants/pokemon.h", "TYPE_")
    count = moves["MOVES_COUNT"]
    blocks = struct_blocks((root / "src/data/battle_moves.h").read_text(), "MOVE")
    by_id = {v: k for k, v in moves.items() if k.startswith("MOVE_") and k != "MOVE_NONE"}

    def head(name: str) -> tuple[int, int, int, int]:
        b = blocks[name]
        return (
            int(field(b, "power") or "0", 0),
            types[field(b, "type") or "TYPE_NORMAL"],
            int(field(b, "accuracy") or "0", 0),
            int(field(b, "pp") or "0", 0),
        )

    pattern = b"".join(b"." + re.escape(bytes(head(by_id[i]))) + b".{7}" for i in range(1, 7))
    first = locate(rom, pattern, "gBattleMoves (moves 1-6)")
    table = first - MOVE_ROW
    if rom.data[table : table + MOVE_ROW] != bytes(MOVE_ROW):
        raise VerifyError("gBattleMoves: MOVE_NONE row is not empty")

    desc_src = (root / "src/data/text/move_descriptions.h").read_text()
    strings = {
        n: c_string(body)
        for n, body in re.findall(
            r"static const u8 (s\w+Description)\[\]\s*=\s*_\((.*?)\);", desc_src, re.S
        )
    }
    pointers = dict(re.findall(r"\[(MOVE_\w+)\s*-\s*1\]\s*=\s*(s\w+Description)", desc_src))
    out: dict[str, object] = {}
    for mid in range(1, count):
        row = rom.data[table + mid * MOVE_ROW : table + (mid + 1) * MOVE_ROW]
        name = by_id[mid]
        if name in blocks and head(name) != (row[1], row[2], row[3], row[4]):
            raise VerifyError(f"gBattleMoves: {name}: ROM {tuple(row[1:5])} != decomp {head(name)}")
        desc = strings[pointers[name]]
        rom.raw(encode(desc, cmap), f"move description {name}")
        out[str(mid)] = {
            "type": row[2],
            "power": row[1],
            "accuracy": row[3],
            "pp": row[4],
            "description": desc,
        }
    return out, {
        "battle_moves": f"{hexoff(table)} (raw, {count} rows of {MOVE_ROW})",
        "descriptions": f"{count - 1} strings found in ROM",
    }


def build_abilities(
    rom: Rom, root: Path, cmap: dict[str, int]
) -> tuple[dict[str, object], dict[str, object]]:
    ids = int_defines(root / "include/constants/abilities.h", "ABILITY_")
    src = (root / "src/data/text/abilities.h").read_text()
    names = dict(
        re.findall(
            r"\[(ABILITY_\w+)\]\s*=\s*_\(\"([^\"]*)\"\)",
            c_array(src, "gAbilityNames[ABILITIES_COUNT][ABILITY_NAME_LENGTH + 1] ="),
        )
    )
    descs = {
        n: c_string(b)
        for n, b in re.findall(
            r"static const u8 (s\w+Description)\[\]\s*=\s*_\((.*?)\);", src, re.S
        )
    }
    pointers = dict(
        re.findall(
            r"\[(ABILITY_\w+)\]\s*=\s*(s\w+Description)",
            c_array(src, "gAbilityDescriptionPointers[ABILITIES_COUNT] ="),
        )
    )
    out: dict[str, object] = {}
    for name, aid in ids.items():
        if name == "ABILITIES_COUNT" or name not in names:
            continue
        rom.raw(encode(names[name], cmap), f"ability name {name}")
        desc = descs[pointers[name]]
        rom.raw(encode(desc, cmap), f"ability description {name}")
        out[str(aid)] = {"name": names[name], "description": desc}
    return out, {"abilities": f"{len(out)} names and descriptions found in ROM"}


def build_natures(
    rom: Rom, root: Path, cmap: dict[str, int]
) -> tuple[list[str], dict[str, object]]:
    src = (root / "src/data/text/nature_names.h").read_text()
    strings = dict(
        re.findall(r"static const u8 (s\w+NatureName)\[\]\s*=\s*_\(\"([^\"]*)\"\);", src)
    )
    order = re.findall(r"\[NATURE_\w+\]\s*=\s*(s\w+NatureName)", src)
    natures = [strings[s] for s in order]
    if len(natures) != 25:
        raise VerifyError(f"natures: expected 25, found {len(natures)}")
    for n in natures:
        rom.raw(encode(n, cmap), f"nature {n}")
    return natures, {"natures": "25 names found in ROM"}


def build_exp(rom: Rom) -> tuple[list[list[int]], dict[str, object]]:
    head = struct.pack("<11I", 0, 1, *(n**3 for n in range(2, 11)))
    off = rom.raw(head, "gExperienceTables (Medium Fast row)")
    words = struct.unpack_from(f"<{GROWTH_RATES * (MAX_LEVEL + 1)}I", rom.data, off)
    tables = [
        list(words[g * (MAX_LEVEL + 1) : (g + 1) * (MAX_LEVEL + 1)]) for g in range(GROWTH_RATES)
    ]
    # experience_tables.h, row by row (GROWTH_* order), with C integer division.
    formulas = (
        lambda n: n**3,
        lambda n: (100 - n) * n**3 // 50
        if n <= 50
        else (150 - n) * n**3 // 100
        if n <= 68
        else ((1911 - 10 * n) // 3) * n**3 // 500
        if n <= 98
        else (160 - n) * n**3 // 100,
        lambda n: ((n + 1) // 3 + 24) * n**3 // 50
        if n <= 15
        else (n + 14) * n**3 // 50
        if n <= 36
        else ((n // 2) + 32) * n**3 // 50,
        lambda n: (6 * n**3) // 5 - 15 * n * n + 100 * n - 140,
        lambda n: (4 * n**3) // 5,
        lambda n: (5 * n**3) // 4,
    )
    for g, formula in enumerate(formulas):
        if tables[g] != [0, 1] + [formula(n) for n in range(2, MAX_LEVEL + 1)]:
            raise VerifyError(f"gExperienceTables: growth rate {g} does not match its formula")
    return tables, {"experience": f"{hexoff(off)} (raw, {GROWTH_RATES} x {MAX_LEVEL + 1})"}


# ---- images ----------------------------------------------------------------------------------


def verify_lz(rom: Rom, blob: bytes, what: str) -> str:
    return f"{hexoff(rom.lz(blob, what))} (LZ77)"


def colors_of(img: Image.Image) -> list[RGB]:
    return png_palette(img)


def build_fronts(rom: Rom, root: Path, out: Path) -> tuple[list[int], dict[str, object]]:
    ids = species_ids(root)
    pics = dict(
        re.findall(
            r"SPECIES_SPRITE\((\w+),\s*(\w+)\)",
            (root / "src/data/pokemon_graphics/front_pic_table.h").read_text(),
        )
    )
    pals = dict(
        re.findall(
            r"SPECIES_PAL\((\w+),\s*(\w+)\)",
            (root / "src/data/pokemon_graphics/palette_table.h").read_text(),
        )
    )
    pic_paths = dict(
        re.findall(
            r"const u32 (gMonFrontPic_\w+)\[\]\s*=\s*INCGFX_U32\(\"([^\"]+)\"",
            (root / "src/anim_mon_front_pics.c").read_text(),
        )
    )
    pal_paths = dict(
        re.findall(
            r"const u32 (gMonPalette_\w+)\[\]\s*=\s*INCGFX_U32\(\"([^\"]+)\"",
            (root / "src/data/graphics/pokemon.h").read_text(),
        )
    )
    egg = ids["SPECIES_EGG"]
    wanted = [
        sid
        for name, sid in ids.items()
        if name.startswith("SPECIES_")
        and 1 <= sid < egg
        and not name.startswith("SPECIES_OLD_UNOWN_")
        and name[8:] in pics
    ]
    wanted = sorted(set(wanted))
    proof: dict[str, str] = {}
    by_id = {v: k[8:] for k, v in ids.items() if k.startswith("SPECIES_")}
    for sid in wanted:
        name = by_id[sid]
        pic_path, pal_path = root / pic_paths[pics[name]], root / pal_paths[pals[name]]
        # Castform: graphics_file_rules.mk concatenates its four forms; the normal form comes first.
        forms = (
            [pic_path.parent / f for f in ("normal", "sunny", "rainy", "snowy")]
            if pic_path.suffix == ".4bpp"
            else []
        )
        img = Image.open(forms[0] / "anim_front.png" if forms else pic_path)
        if img.mode != "P" or img.size not in ((64, 128), (64, 64)):
            raise VerifyError(
                f"front pic {name}: {img.mode} {img.size}, expected indexed 64x128 (or 64x64)"
            )
        colors = jasc(forms[0] / "normal.pal" if forms else pal_path)
        pic_blob = (
            b"".join(tiles4bpp(Image.open(f / "anim_front.png")) for f in forms)
            if forms
            else tiles4bpp(img)
        )
        pal_blob = (
            b"".join(gbapal(jasc(f / "normal.pal")) for f in forms) if forms else gbapal(colors)
        )
        pic_off = rom.lz(pic_blob, f"front pic {name}")
        pal_off = rom.lz(pal_blob, f"front palette {name}")
        indexed_to_rgba(img.crop((0, 0, 64, 64)), colors).save(out / f"{sid}.png")
        proof[str(sid)] = f"{hexoff(pic_off)} / {hexoff(pal_off)} (LZ77)"
    return wanted, proof


def build_parts(rom: Rom, root: Path, out: Path) -> dict[str, object]:
    g = root / "graphics"
    proof: dict[str, object] = {}

    # gMoveTypes_Gfx = the type icons then the contest icons, concatenated; three palettes.
    icons = [Image.open(g / f"types/{t}.png") for t in TYPES] + [
        Image.open(g / f"types/contest_{c}.png") for c in CONTEST
    ]
    type_pals = [jasc(g / f"types/move_types_{i}.pal") for i in (1, 2, 3)]
    proof["types"] = (
        verify_lz(rom, b"".join(tiles4bpp(i) for i in icons), "gMoveTypes_Gfx")
        + ", palettes "
        + verify_lz(rom, b"".join(gbapal(p) for p in type_pals), "gMoveTypes_Pal")
    )
    table = c_array(
        (root / "src/pokemon_summary_screen.c").read_text(),
        "sMoveTypeToOamPaletteNum[NUMBER_OF_MON_TYPES + CONTEST_CATEGORIES_COUNT] =",
    )
    pal_num = {m: int(n) for m, n in re.findall(r"\[(TYPE_\w+)\]\s*=\s*(\d+)", table)}
    type_ids = int_defines(root / "include/constants/pokemon.h", "TYPE_")
    sheet = Image.new("RGBA", (32, 16 * len(TYPES)))
    for t_name, tid in type_ids.items():
        if t_name in pal_num and tid < len(TYPES):
            sheet.paste(indexed_to_rgba(icons[tid], type_pals[pal_num[t_name] - 13]), (0, 16 * tid))
    sheet.save(out / "types.png")

    def lz_png(
        path: str,
        what: str,
        name: str,
        crop: tuple[int, int, int, int] | None = None,
        pal_what: str | None = None,
    ) -> None:
        img = Image.open(g / path)
        proof[name] = verify_lz(rom, tiles4bpp(img), what)
        if pal_what is not None:
            proof[name] += ", palette " + verify_lz(rom, gbapal(colors_of(img)), pal_what)  # type: ignore[operator]
        rgba = indexed_to_rgba(img, colors_of(img))
        (rgba.crop(crop) if crop else rgba).save(out / f"{name}.png")

    lz_png("interface/status_icons.png", "gStatusGfx_Icons", "status", pal_what="gStatusPal_Icons")
    lz_png(
        "party_menu/pokeball.png",
        "gPartyMenuPokeball_Gfx",
        "ball-big",
        pal_what="gPartyMenuPokeball_Pal",
    )
    lz_png(
        "party_menu/pokeball_small.png",
        "gPartyMenuPokeballSmall_Gfx",
        "ball-small",
        crop=(0, 0, 16, 32),
    )
    # The summary screen's caught-ball sprite, first frame, one row per ball item ID (1-12).
    balls = Image.new("RGBA", (16, 16 * len(BALLS)))
    for i, ball in enumerate(BALLS):
        img = Image.open(g / f"balls/{ball}.png")
        name = ball.capitalize()
        proof[f"ball_{ball}"] = (
            verify_lz(rom, tiles4bpp(img), f"gBallGfx_{name}")
            + ", palette "
            + verify_lz(rom, gbapal(colors_of(img)), f"gBallPal_{name}")
        )
        balls.paste(indexed_to_rgba(img, colors_of(img)).crop((0, 0, 16, 16)), (0, 16 * i))
    balls.save(out / "balls.png")

    marks = Image.open(g / "interface/mon_markings.png")
    proof["marks"] = f"{hexoff(rom.raw(tiles4bpp(marks), 'sMonMarkings_Gfx'))} (raw)"
    # All four markings off, in the summary screen's own markings palette (sMarkings_Pal).
    mark_colors = jasc(g / "summary_screen/markings.pal")
    proof["marks"] += f", palette {hexoff(rom.raw(gbapal(mark_colors), 'sMarkings_Pal'))} (raw)"  # type: ignore[operator]
    indexed_to_rgba(marks, mark_colors).crop((0, 0, 32, 8)).save(out / "marks.png")

    # The HP tag of a wide party slot: sSlotTilemap_Wide's tiles from gPartyMenuBg_Gfx.
    bg = Image.open(g / "party_menu/bg.png")
    proof["party_bg"] = verify_lz(rom, tiles4bpp(bg)[: 62 * 32], "gPartyMenuBg_Gfx")
    wide = (g / "party_menu/slot_wide.bin").read_bytes()
    proof["slot_wide"] = f"{hexoff(rom.raw(wide, 'sSlotTilemap_Wide'))} (raw)"
    pal = colors_of_full(bg)
    slot = Image.new("RGBA", (144, 24))
    sp, bp = slot.load(), bg.load()
    for i, t in enumerate(wide):
        tx, ty = (t % 8) * 8, (t // 8) * 8
        for y in range(8):
            for x in range(8):
                c = bp[tx + x, ty + y] & 15
                sp[(i % 18) * 8 + x, (i // 18) * 8 + y] = (
                    (0, 0, 0, 0) if c in (0, 4, 5, 6, 7, 8) else (*pal[48 + c], 255)
                )
    slot.crop((72, 6, 88, 15)).save(out / "hp-tag.png")

    # SKILLS page EXP bar: tiles 0x62 (empty) .. 0x6A (full) of gSummaryScreen_Gfx.
    tiles = Image.open(g / "summary_screen/tiles.png")
    proof["summary_tiles"] = verify_lz(rom, tiles4bpp(tiles), "gSummaryScreen_Gfx")
    skills = (g / "summary_screen/page_skills.bin").read_bytes()
    proof["page_skills"] = verify_lz(rom, skills, "gSummaryPage_Skills_Tilemap")
    spal = colors_of_full(tiles)
    entries = list(struct.unpack("<1024H", skills))
    for name, fill in (("exp-empty", 0), ("exp-full", 64)):
        e = list(entries)
        k = fill
        for i in range(8):
            e[0x255 + i] = 0x206A if k > 7 else 0x2062 + (k % 8)
            k = max(0, k - 8)
        strip = Image.new("RGBA", (84, 7))
        draw_row(
            strip, e, tiles, spal, row=18, col0=19, cols=11, x_off=-152 + 19 * 8, y0=144 - 18 * 8
        )
        strip.save(out / f"{name}.png")
    return proof


def colors_of_full(img: Image.Image) -> list[RGB]:
    p = img.getpalette() or []
    return [(p[i], p[i + 1], p[i + 2]) for i in range(0, len(p), 3)]


def draw_row(
    dst: Image.Image,
    entries: list[int],
    tiles: Image.Image,
    pal: list[RGB],
    row: int,
    col0: int,
    cols: int,
    x_off: int,
    y0: int,
) -> None:
    tp, dp, tw = tiles.load(), dst.load(), tiles.size[0] // 8
    for col in range(col0, col0 + cols):
        v = entries[row * 32 + col]
        tile, hf, vf, pl = v & 0x3FF, v >> 10 & 1, v >> 11 & 1, v >> 12
        tx, ty = (tile % tw) * 8, (tile // tw) * 8
        for y in range(8):
            for x in range(8):
                X, Y = (col - col0) * 8 + x + x_off, y + y0
                if 0 <= X < dst.size[0] and 0 <= Y < dst.size[1]:
                    c = tp[tx + (7 - x if hf else x), ty + (7 - y if vf else y)] & 15
                    dp[X, Y] = (*pal[pl * 16 + c], 255)


# ---- fonts -----------------------------------------------------------------------------------

# Private-use characters the viewer writes for the game's control codes, mapped to glyph codes.
# 0x105.. are the 0xF9 extra symbols, which text.c draws from glyph 0x100 + code.
FONT_TOKENS = {
    "\ue000": 0x34,
    "\ue001": 0x105,
    "\ue002": 0x106,
    "\ue003": 0x107,
    "\ue004": 0x108,
    "\ue005": 0x53,
    "\ue006": 0x54,
}


def build_fonts(rom: Rom, root: Path, out: Path, cmap: dict[str, int]) -> dict[str, object]:
    """Small (party slots) and normal (summary) fonts: red stroke, green shadow, fonts.c widths."""
    src = (root / "src/fonts.c").read_text()
    proof: dict[str, object] = {}
    for name, sheet_name, widths_decl in (
        ("small", "latin_small", "gFontSmallLatinGlyphWidths[] = {"),
        ("normal", "latin_normal", "gFontNormalLatinGlyphWidths[] = {"),
    ):
        sheet = Image.open(root / f"graphics/fonts/{sheet_name}.png")
        widths = [int(v) for v in re.findall(r"\d+", c_array(src, widths_decl))]
        if len(widths) != 512:
            raise VerifyError(f"font {name}: expected 512 widths, found {len(widths)}")
        proof[name] = (
            f"glyphs {hexoff(rom.raw(latfont(sheet), f'{name} font glyphs'))} (raw latfont), "
            f"widths {hexoff(rom.raw(bytes(widths), f'{name} font widths'))} (raw)"
        )
        px = sheet.load()
        o = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        op = o.load()
        for y in range(sheet.size[1]):
            for x in range(sheet.size[0]):
                v = px[x, y]
                if v == 1:
                    op[x, y] = (255, 0, 0, 255)
                elif v == 2:
                    op[x, y] = (0, 255, 0, 255)
        o.save(out / f"{name}.png")
        (out / f"{name}.json").write_text(
            json.dumps({"widths": widths, "cmap": {**cmap, **FONT_TOKENS}}, separators=(",", ":"))
            + "\n"
        )
    return proof


# ---- main ------------------------------------------------------------------------------------

# ROM-derived art stays under the repository's gitignored runs/ (CLAUDE.md).
RUNS_ROOT = Path(__file__).resolve().parents[2] / "runs"


def build(out: Path, root: Path, rom_path: Path) -> int:
    rom_bytes = rom_path.read_bytes()
    rom = Rom(rom_bytes)
    for sub in ("front", "parts", "font"):
        (out / sub).mkdir(parents=True)
    cmap = charmap(root)
    species, p_species = build_species(rom, root)
    moves, p_moves = build_moves(rom, root, cmap)
    abilities, p_abilities = build_abilities(rom, root, cmap)
    natures, p_natures = build_natures(rom, root, cmap)
    exp, p_exp = build_exp(rom)
    fronts, p_fronts = build_fronts(rom, root, out / "front")
    p_parts = build_parts(rom, root, out / "parts")
    p_fonts = build_fonts(rom, root, out / "font", cmap)
    data = {
        "version": 1,
        "types": TYPES,
        "species": species,
        "moves": moves,
        "abilities": abilities,
        "natures": natures,
        "experience": exp,
    }
    (out / "data.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")
    manifest = {
        "version": 1,
        "fronts": fronts,
        "proof": {
            **p_species,
            **p_moves,
            **p_abilities,
            **p_natures,
            **p_exp,
            "parts": p_parts,
            "fonts": p_fonts,
            "fronts": p_fronts,
        },
        "source": {
            "pokeemerald": git_sha(root),
            "rom_sha1": hashlib.sha1(rom_bytes, usedforsecurity=False).hexdigest(),
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    return len(fronts)


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
        print("build_party_art: set POKEBENCH_ROM (or pass --rom)", file=sys.stderr)
        return 2
    out: Path = args.out.expanduser().absolute()
    runs = RUNS_ROOT.resolve()
    if not out.parent.resolve().is_relative_to(runs):
        print(
            f"build_party_art: {out} is outside {runs}; ROM-derived art stays there",
            file=sys.stderr,
        )
        return 2
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out.name}.build-", dir=out.parent))
    try:
        n = build(tmp, args.pokeemerald.expanduser(), args.rom.expanduser())
    except (VerifyError, OSError, KeyError) as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(
            f"build_party_art: FAILED, nothing written: {e!r} {getattr(e, 'filename', '') or ''}",
            file=sys.stderr,
        )
        return 1
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    try:
        publish(out, tmp)
    except OSError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"build_party_art: FAILED, previous art left as it was: {e}", file=sys.stderr)
        return 1
    print(f"party art -> {out}: {n} front pics, parts and tables; all verified against ROM")
    return 0


if __name__ == "__main__":
    sys.exit(main())
