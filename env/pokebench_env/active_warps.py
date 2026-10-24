"""Source-supported warp activation, independent of a static WarpEvent's destination.

pret/pokeemerald731ad5b field_control_avatar.c IsWarpMetatileBehavior,
IsArrowWarpMetatileBehavior and TryDoorWarp require both the event and a matching
metatile behavior. Ordinary ground over a dormant event is not an entrance.
Script-owned tiles and unreadable/unsupported behavior remain unclassified.
"""

# IsWarpMetatileBehavior plus IsArrowWarpMetatileBehavior (metatile_behavior.c).
ACTIVATING = frozenset({0x0E, 0x0F, 0x1B, 0x1C, 0x29, *range(0x60, 0x66), *range(0x67, 0x6F), 0x70})
# TryStartMiscWalkingScripts / interaction scripts handle these separately.
# Keep them as conditional candidates rather than interpreting an ordinary-warp
# predicate's FALSE as proof that no script can transition the player.
SCRIPT_OWNED = frozenset({0x0D, 0x66, 0x8B, 0x8C, 0x8D, *range(0x90, 0xA0)})


def warp_activation(behavior: int | None) -> bool | None:
    """TRUE is an entrance candidate, not a guarantee of elevation/control readiness."""
    if behavior is None or not 0 <= behavior < 0xF0 or behavior in SCRIPT_OWNED:
        return None
    return behavior in ACTIVATING
