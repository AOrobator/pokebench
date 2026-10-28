"""Generate pret-only junk-filter labels, templates and signal lexicons. No walkthrough prose."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

PIN = "731ad5bfd6e6f265508d0efcca0ba42f9dcf5881"
OVERRIDES = {
    "Route104_Text_ThrowBallAtWeakenedPokemon": "FLAVOR",
    "PetalburgCity_Text_FullPartyExplanation": "FLAVOR",
    "Route110_Text_WhichShouldIChoose": "PROGRESSION_HINT",
}
SERVICE = ["data/text/pkmn_center_nurse.inc", "data/text/mart_clerk.inc", "data/text/pc.inc", "data/text/cable_club.inc", "data/scripts/repel.inc"]
BERRY = ["data/scripts/berry_tree.inc"]
KEEP_SIGN = "RustboroCity_Text_CuttersHouse"
ROCK = ["MauvilleCity_House1_Text_ImRockSmashDudeTakeThis", "MauvilleCity_House1_Text_ExplainRockSmash"]
# These are the approved signals_v4 selectors. Entries are emitted only after their wording is audited against pret.
DIRECTION = ["north", "south", "east", "west", "up ahead", "ahead", "head for", "head to", "go to", "beeline", "cycling road", "by boat", "across the sea", "upstairs", "downstairs", "next door", "this way", "that way", "the other side", "past this", "through the", "over the top", "dead end", "shortcut"]
GATING = ["can't", "cannot", "need", "needs", "blocked", "if you had", "only if", "you'll want", "to get past", "in the way", "won't let", "not allowed", "must", "require", "unless", "without a", "too dangerous", "closed", "come back with", "if you have"]
EXTRA = {"h_rest_heal": ["rest", "heal", "restore", "full health", "tired"], "i_gift": ["take this", "have this", "you can have", "for you", "give you", "here you go", "you may have"], "k_money": ["¥", "money", "fee", "price", "buy", "sell", "cost"], "l_place_word": ["cave", "cavern", "edge of town", "tunnel", "island", "shop", "house", "gym", "center", "mart", "forest", "woods", "mountain", "desert", "sea", "river", "bridge", "gate", "path", "road", "cottage", "shipyard", "museum", "tower", "station"]}
STORY = {"TEAM AQUA", "TEAM MAGMA", "AQUA", "MAGMA", "PROF. BIRCH", "MAY", "BRENDAN", "WALLY", "STEVEN", "MR. STONE", "MR. BRINEY", "CAPT. STERN", "SCOTT", "NORMAN", "DAD", "MOM", "ARCHIE", "MAXIE"}


def read(pret, path):
    return (pret / path).read_text()


def string_values(pret, path, pattern=r'_\("([^"]*)"\)'):
    return [s for s in re.findall(pattern, read(pret, path)) if s and s != "????????" and not s.startswith("-")]


def text_labels(pret):
    labels, sources = {}, {}
    files = sorted((pret / "data/maps").glob("**/scripts.inc")) + sorted((pret / "data/text").glob("**/*")) + sorted((pret / "data/scripts").glob("*.inc"))
    for file in files:
        if not file.is_file():
            continue
        body = file.read_text()
        marks = list(re.finditer(r"(?m)^(\w+)::?[^\n]*\n", body))
        for i, mark in enumerate(marks):
            block = body[mark.end(): marks[i + 1].start() if i + 1 < len(marks) else len(body)]
            parts = re.findall(r'(?m)^\s*\.string "(.*)"', block)
            if not parts:
                continue
            text = "".join(parts).rstrip("$")
            label = mark[1]
            if label in labels and labels[label] != text:
                raise ValueError("inconsistent duplicate pret label " + label)
            labels[label] = text
            sources[label] = str(file.relative_to(pret))
    return labels, sources


def generate(pret, label_dir):
    revision = subprocess.check_output(["git", "-C", str(pret), "rev-parse", "HEAD"], text=True).strip()
    if revision != PIN or subprocess.check_output(["git", "-C", str(pret), "status", "--porcelain"], text=True):
        raise ValueError("requires clean pinned pret " + PIN)
    labels, sources = text_labels(pret)
    rows = []
    for path in ([label_dir] if label_dir.is_file() else sorted(label_dir.glob("region-*.json"))):
        for row in json.loads(path.read_text()):
            label = row["text_label"]
            if row["category"] not in {"FLAVOR", "USEFUL_OPTIONAL", "PROGRESSION_HINT"}:
                raise ValueError("unknown category for " + label)
            if label not in labels:
                raise ValueError("label absent from pinned pret: " + label)
            rows.append({"text_label": label, "map": row["map"], "category": OVERRIDES.get(label, row["category"]), "text": labels[label]})
    if len(rows) != 1442:
        raise ValueError("expected1442approved rows")
    groups = json.loads(read(pret, "data/maps/map_groups.json"))
    maps = {name: [group, index] for group, key in enumerate(groups["group_order"]) for index, name in enumerate(groups[key])}
    for row in rows:
        if row["map"] not in maps:
            raise ValueError("unknown pret map " + row["map"])
    service = [{"text_label": label, "text": text} for label, text in labels.items() if sources[label] in SERVICE]
    berry = [{"text_label": label, "text": text} for label, text in labels.items() if sources[label] in BERRY]
    lex = {
        "b_item": sorted(set(string_values(pret, "src/data/items.h", r'\.name = _\("([^"]*)"\)')) | {"HM", "TM", "BADGE", "BADGES", "BIKE", "POKéNAV", "POKéDEX"}),
        "b_move": string_values(pret, "src/data/text/move_names.h"),
        "b_ability": string_values(pret, "src/data/text/abilities.h"),
        "b_type": sorted((set(re.findall(r'_\("(\w+)"\)', read(pret, "src/battle_main.c").split("gTypeNames", 1)[1].split("};", 1)[0])) - {"???"}) | {"ELECTRIC", "PSYCHIC", "FIGHTING"}),
        "b_species": string_values(pret, "src/data/text/species_names.h"),
        "e_person": sorted(set(string_values(pret, "src/data/trainers.h", r'\.trainerName = _\("([^"]*)"\)')) | STORY),
    }
    for k in ["b_move", "b_ability", "b_species", "e_person"]:
        lex[k] = sorted({w for w in lex[k] if (len(w) >= 4 and w.upper() == w) or w in STORY})
    lex.update({"c_direction": DIRECTION, "d_gating": GATING, **EXTRA, "v4_gating": ["around the corner", "dangerous", "if you don't have", "if you don't"]})
    # Signal selectors are checked against actual pret wording after line/page folding; names are extracted above.
    flat = " ".join(labels.values()).replace("\\n", " ").replace("\\l", " ").replace("\\p", " ").lower()
    absent = [(key, word) for key in ["c_direction", "d_gating", *EXTRA, "v4_gating"] for word in lex[key] if word.lower() not in flat]
    if absent:
        print("Excluded unattested proposed selectors:", repr(absent))
        for key, word in absent:
            lex[key] = [value for value in lex[key] if value != word]
    flags = read(pret, "include/constants/flags.h")
    if not re.search(r"#define\s+FLAG_RECEIVED_HM_ROCK_SMASH\s+0x6B\b", flags):
        raise ValueError("Rock Smash flag changed")
    source = {"pret": PIN, "maps": maps, "service": service, "berry": berry, "keep_sign": {"text_label": KEEP_SIGN, "map": "RustboroCity", "text": labels[KEEP_SIGN]}, "rock_smash": [{"text_label": l, "map": "MauvilleCity_House1", "text": labels[l]} for l in ROCK], "signals": lex}
    return {"npc-flavor-labels.json": rows, "instruction-memory-junk-source.json": source}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pret", type=Path, required=True)
    parser.add_argument("--labels-dir", "--labels", dest="labels_dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = generate(args.pret, args.labels_dir)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in output.items():
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        path = args.output / name
        if args.check:
            if path.read_text() != text:
                raise ValueError("generated data differs: " + str(path))
        else:
            path.write_text(text)
        print(name, hashlib.sha256(text.encode()).hexdigest())


if __name__ == "__main__":
    main()
