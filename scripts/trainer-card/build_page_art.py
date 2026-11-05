"""Build the art and gym table for the PokéNav TRAINER CARD page, verified against the ROM.

Usage: build_page_art.py OUT_DIR [--pokeemerald DIR] [--rom FILE]

The run cards keep their own art (build_art.py). Output is ROM-derived and belongs under the
gitignored runs/ folder only. It builds beside OUT_DIR and switches in atomically.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from types import ModuleType

from PIL import Image


def _build_art() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "build_art", Path(__file__).with_name("build_art.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["build_art"] = module
    spec.loader.exec_module(module)
    return module


art = _build_art()

# badge, title, city, leader, type, leader pic, party symbol, gym map holding the TM script
GYMS: tuple[tuple[str, str, str, str, str, str, str, str], ...] = (
    ("STONE", "Stone Badge", "RUSTBORO CITY", "ROXANNE", "ROCK", "roxanne", "Roxanne1", "RustboroCity_Gym"),
    ("KNUCKLE", "Knuckle Badge", "DEWFORD TOWN", "BRAWLY", "FIGHTING", "brawly", "Brawly1", "DewfordTown_Gym"),
    ("DYNAMO", "Dynamo Badge", "MAUVILLE CITY", "WATTSON", "ELECTRIC", "wattson", "Wattson1", "MauvilleCity_Gym"),
    ("HEAT", "Heat Badge", "LAVARIDGE TOWN", "FLANNERY", "FIRE", "flannery", "Flannery1", "LavaridgeTown_Gym_1F"),
    ("BALANCE", "Balance Badge", "PETALBURG CITY", "NORMAN", "NORMAL", "norman", "Norman1", "PetalburgCity_Gym"),
    ("FEATHER", "Feather Badge", "FORTREE CITY", "WINONA", "FLYING", "winona", "Winona1", "FortreeCity_Gym"),
    ("MIND", "Mind Badge", "MOSSDEEP CITY", "TATE & LIZA", "PSYCHIC", "tate_and_liza", "TateAndLiza1", "MossdeepCity_Gym"),
    ("RAIN", "Rain Badge", "SOOTOPOLIS CITY", "JUAN", "WATER", "juan", "Juan1", "SootopolisCity_Gym_1F"),
)  # fmt: skip


# region_map.c: 233 tiles on a 64-wide affine tilemap; the land fits the top-left 256x160.
MAP_TILES, MAP_STRIDE, MAP_WIDTH, MAP_HEIGHT = 233, 64, 256, 160


def parse_party(source: str, symbol: str) -> list[tuple[str, int]]:
    """The (species constant, level) pairs of one trainer party in trainer_parties.h."""
    match = re.search(rf"sParty_{re.escape(symbol)}\[\] = \{{(.*?)\n\}};", source, re.S)
    if match is None:
        raise art.VerifyError(f"party {symbol}: not found")
    team = [
        (species, int(level))
        for level, species in re.findall(
            r"\.lvl = (\d+),.*?\.species = (SPECIES_\w+)", match.group(1), re.S
        )
    ]
    if not team:
        raise art.VerifyError(f"party {symbol}: no members")
    return team


def parse_tm(script: str, gym: str) -> str:
    """The TM a gym's script gives, as its move name: ITEM_TM_ROCK_TOMB -> Rock Tomb."""
    match = re.search(r"giveitem ITEM_TM_([A-Z_]+)", script)
    if match is None:
        raise art.VerifyError(f"gym {gym}: no TM in its script")
    return match.group(1).replace("_", " ").title()


def build_cards(rom: object, gfx: Path, out: Path) -> dict[str, str]:
    card = gfx / "trainer_card"
    tiles_img = Image.open(card / "tiles.png")
    maps = [(card / f"{layer}.bin").read_bytes() for layer in ("bg", "front")]
    rom.lz(art.tiles4bpp(tiles_img), "card tiles")  # type: ignore[attr-defined]
    for blob, what in zip(maps, ("bg", "front"), strict=True):
        rom.lz(blob, f"card {what} tilemap")  # type: ignore[attr-defined]
    tiles = art.CardTiles(tiles_img)
    green = art.jasc(card / "green.pal")
    female = art.jasc(card / "female_bg.pal")
    proof = {
        "green": art.hexoff(rom.raw(art.gbapal(green), "green palette")),  # type: ignore[attr-defined]
        "female": art.hexoff(rom.raw(art.gbapal(female), "female palette")),  # type: ignore[attr-defined]
    }
    # trainer_card.c loads the female background over palette line 1 of the card's palette.
    palettes = {"male": green, "female": green[:16] + female + green[32:]}
    for gender, palette in palettes.items():
        front = art.render_card(tiles, maps, palette)
        front.save(out / f"card-{gender}.png")
        front.crop((0, 0, 4, 4)).save(out / f"stripes-{gender}.png")
    return proof


def indexed(rom: object, png: Path, out: Path, what: str, compressed: bool) -> str:
    img = Image.open(png)
    blob = art.tiles4bpp(img)
    offset = rom.lz(blob, what) if compressed else rom.raw(blob, what)  # type: ignore[attr-defined]
    art.indexed_to_rgba(img, art.png_palette(img)).save(out)
    return art.hexoff(offset)


def build_leaders(rom: object, gfx: Path, out: Path) -> dict[str, str]:
    return {
        pic: indexed(
            rom,
            gfx / f"trainers/front_pics/leader_{pic}.png",
            out / f"leader-{pic.replace('_', '-')}.png",
            f"leader {pic}",
            True,
        )
        for *_, pic, _symbol, _gym in GYMS
    }


def build_region_map(rom: object, gfx: Path, root: Path, out: Path) -> dict[str, str]:
    """The Hoenn region map from its 8bpp tiles and tilemap, cropped to the land the game shows."""
    region = gfx / "pokenav/region_map"
    sheet = Image.open(region / "map.png")
    width = sheet.width // 8
    pixels = sheet.load()
    tiles = [
        bytes(pixels[(n % width) * 8 + x, (n // width) * 8 + y] for y in range(8) for x in range(8))
        for n in range(MAP_TILES)
    ]
    tilemap = (region / "map.bin").read_bytes()
    proof = {
        "tiles": art.hexoff(rom.lz(b"".join(tiles), "region map tiles")),  # type: ignore[attr-defined]
        "tilemap": art.hexoff(rom.lz(tilemap, "region map tilemap")),  # type: ignore[attr-defined]
        "palette": art.hexoff(rom.raw(art.gbapal(art.jasc(region / "map.pal")), "region map palette")),  # type: ignore[attr-defined]
    }
    raw = sheet.getpalette() or []
    colors = [tuple(raw[i : i + 3]) for i in range(0, len(raw), 3)]
    image = Image.new("RGB", (MAP_WIDTH, MAP_HEIGHT))
    for cell in range(MAP_STRIDE * MAP_STRIDE):
        tx, ty = cell % MAP_STRIDE, cell // MAP_STRIDE
        if tx * 8 >= MAP_WIDTH or ty * 8 >= MAP_HEIGHT:
            continue
        tile = tiles[tilemap[cell]]
        for i, index in enumerate(tile):
            image.putpixel((tx * 8 + i % 8, ty * 8 + i // 8), colors[index])
    image.save(out / "region-map.png")
    proof["run"] = indexed(rom, region / "brendan_icon.png", out / "map-run.png", "map run icon", True)
    proof["frontier"] = indexed(rom, region / "may_icon.png", out / "map-frontier.png", "map frontier icon", True)
    return proof


def map_sections(root: Path) -> list[dict[str, object]]:
    data = json.loads((root / "src/data/region_map/region_map_sections.json").read_text())
    return [
        {key: section[key] for key in ("name", "x", "y", "width", "height")}
        for section in data["map_sections"]
        if "x" in section
    ]


def gym_table(root: Path) -> list[dict[str, object]]:
    parties = (root / "src/data/trainer_parties.h").read_text()
    ids = art.species_ids(root)
    table: list[dict[str, object]] = []
    for badge, title, city, leader, kind, pic, symbol, gym in GYMS:
        team = parse_party(parties, symbol)
        script = (root / f"data/maps/{gym}/scripts.inc").read_text()
        table.append(
            {
                "badge": badge,
                "title": title,
                "city": city,
                "leader": leader,
                "type": kind,
                "tm": parse_tm(script, gym),
                "sprite": f"leader-{pic.replace('_', '-')}.png",
                "team": [
                    {"name": s.removeprefix("SPECIES_"), "level": level, "icon": ids[s]}
                    for s, level in team
                ],
            }
        )
    return table


def build(out: Path, root: Path, rom_path: Path) -> None:
    rom_bytes = rom_path.read_bytes()
    rom = art.Rom(rom_bytes)
    gfx = root / "graphics"
    proof: dict[str, object] = {
        "card": build_cards(rom, gfx, out),
        "badges": indexed(rom, gfx / "trainer_card/badges.png", out / "badges.png", "badges", True),
        "text_window": indexed(rom, gfx / "text_window/1.png", out / "text-window.png", "text window", False),
        "leaders": build_leaders(rom, gfx, out),
        "region_map": build_region_map(rom, gfx, root, out),
    }  # fmt: skip
    data = {
        "version": 1,
        "gyms": gym_table(root),
        "map": map_sections(root),
        "proof": proof,
        "source": {
            "pokeemerald": art.git_sha(root),
            "rom_sha1": hashlib.sha1(rom_bytes, usedforsecurity=False).hexdigest(),
        },
    }
    (out / "data.json").write_text(json.dumps(data, indent=1) + "\n")


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
        print("build_page_art: set POKEBENCH_ROM (or pass --rom)", file=sys.stderr)
        return 2
    out: Path = args.out.expanduser().absolute()
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{out.name}.build-", dir=out.parent))
    try:
        build(tmp, args.pokeemerald.expanduser(), args.rom.expanduser())
        art.publish(out, tmp)
    except (art.VerifyError, OSError) as error:
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"build_page_art: FAILED: {error}", file=sys.stderr)
        return 1
    print(f"trainer page art -> {out}: card, badges, window, {len(GYMS)} gyms; verified against ROM")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
