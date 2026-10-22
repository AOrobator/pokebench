"""State bodies as runs recorded them before the party readout gained the summary facts."""

# The PartyMon fields added for the POKéMON PARTY page (2026-10-21); recorded fixtures predate them.
SUMMARY_FIELDS = frozenset(
    {
        "attack",
        "defense",
        "speed",
        "sp_attack",
        "sp_defense",
        "ability_num",
        "ability_id",
        "met_location",
        "met_location_name",
        "met_level",
        "met_game",
        "ball",
        "ball_name",
        "ot_name",
        "ot_gender",
    }
)


def as_recorded(value: object) -> object:
    """Drop the summary facts from every Pokémon record (a dict with a personality key)."""
    if isinstance(value, dict):
        mon = "personality" in value
        return {k: as_recorded(v) for k, v in value.items() if not (mon and k in SUMMARY_FIELDS)}
    if isinstance(value, list):
        return [as_recorded(v) for v in value]
    return value
