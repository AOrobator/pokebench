"""Emerald's own story state; source/ROM evidence in findings/story-milestones.md."""

from dataclasses import asdict, dataclass

from pokebench_env.game_screen import TASKS, ReadMemory, Screen

SAVE_FLAGS = 0x1270
SAVE_VARS = 0x139C
# Exact post-YES Birch tasks, not a broad address range or a copied editor name.
NAME_CONFIRMED_TASKS = frozenset({0x08031221, 0x08031259, 0x0803133D, 0x080313E5, 0x080314C5})
# Exact new-game roots before accepting the player's name, including NO/B retries.
# See findings/story-milestones.md and the qualified-task-graph native receipt.
NAME_UNCONFIRMED_TASKS = frozenset(
    {
        0x080307B1,
        0x080308B1,
        0x08030929,
        0x080309CD,
        0x08030A2D,
        0x08030BCD,
        0x08030C19,
        0x08030C91,
        0x08030CD5,
        0x08030D85,
        0x08030DC9,
        0x08030E09,
        0x08030E39,
        0x08030ED5,
        0x08030F7D,
        0x08030FD5,
        0x08031015,
        0x08031041,
        0x08031091,
        0x0803261D,
        0x08031105,
        0x08031145,
        0x08031189,
    }
)
FLAG_FIELDS = {
    "clock_set": 0x51,
    "rival_battle_won": 0x82,
    "pokedex_received": 0x8E4,
    "running_shoes_received": 0x112,
    "starter_tutorial_complete": 0x74,
    "rustboro_gym_complete": 0x4F0,
    "stone_badge": 0x867,
    "rock_tomb_received": 0xA5,
}
# These bits also get set for skipped trainers after Roxanne's victory script.
# Expose defeat evidence only while the gym-clear flag is explicitly unset.
GYM_TRAINER_FLAGS = {
    "rustboro_josh_defeated": 0x640,
    "rustboro_tommy_defeated": 0x641,
    "rustboro_marc_defeated": 0x73B,
}
INITIAL_TRAINER_FLAGS = {
    "petalburg_woods_lyle_defeated": 0x768,
    "petalburg_woods_james_defeated": 0x76D,
    "petalburg_woods_aqua_grunt_defeated": 0x50A,
    "route116_joey_defeated": 0x642,
    "route116_jose_defeated": 0x769,
    "route116_jerry_defeated": 0x611,
    "route116_clark_defeated": 0x777,
    "route116_janice_defeated": 0x75D,
    "route116_karen_defeated": 0x618,
    "route116_sarah_defeated": 0x7B7,
    "route116_dawson_defeated": 0x7B6,
    "route116_devan_defeated": 0x7F1,
    "route116_johnson_defeated": 0x7F2,
    "roxanne_defeated": 0x609,
    "route102_calvin_defeated": 0x63E,
    "route102_rick_defeated": 0x767,
    "route102_tiana_defeated": 0x75B,
    "route102_allen_defeated": 0x64D,
    "route104_ivan_defeated": 0x651,
    "route104_billy_defeated": 0x63F,
    "route104_haley_defeated": 0x75C,
    "route104_winston_defeated": 0x588,
    "route104_cindy_defeated": 0x572,
    "route104_gina_mia_defeated": 0x6E3,
    "route104_darian_defeated": 0x7B8,
}
VAR_FIELDS = {
    "intro_stage": (0x4092, 7),
    "rival_stage": (0x408D, 4),
    "birch_lab_stage": (0x4084, 5),
    "petalburg_gym_stage": (0x4085, 8),
    "woods_stage": (0x4098, 1),
    # 0 blocked, 1 rival met, 2 sent to save Birch, 3 Pokédex, 4 running shoes.
    "town_stage": (0x4050, 4),
}


@dataclass(frozen=True)
class StoryState:
    name_confirmed: bool | None = None
    intro_stage: int | None = None
    rival_stage: int | None = None
    birch_lab_stage: int | None = None
    petalburg_gym_stage: int | None = None
    woods_stage: int | None = None
    town_stage: int | None = None
    clock_set: bool | None = None
    rival_battle_won: bool | None = None
    pokedex_received: bool | None = None
    running_shoes_received: bool | None = None
    starter_tutorial_complete: bool | None = None
    rustboro_gym_complete: bool | None = None
    stone_badge: bool | None = None
    rock_tomb_received: bool | None = None
    rustboro_josh_defeated: bool | None = None
    rustboro_tommy_defeated: bool | None = None
    rustboro_marc_defeated: bool | None = None

    petalburg_woods_lyle_defeated: bool | None = None
    petalburg_woods_james_defeated: bool | None = None
    petalburg_woods_aqua_grunt_defeated: bool | None = None
    route116_joey_defeated: bool | None = None
    route116_jose_defeated: bool | None = None
    route116_jerry_defeated: bool | None = None
    route116_clark_defeated: bool | None = None
    route116_janice_defeated: bool | None = None
    route116_karen_defeated: bool | None = None
    route116_sarah_defeated: bool | None = None
    route116_dawson_defeated: bool | None = None
    route116_devan_defeated: bool | None = None
    route116_johnson_defeated: bool | None = None

    roxanne_defeated: bool | None = None
    route102_calvin_defeated: bool | None = None
    route102_rick_defeated: bool | None = None
    route102_tiana_defeated: bool | None = None
    route102_allen_defeated: bool | None = None
    route104_ivan_defeated: bool | None = None
    route104_billy_defeated: bool | None = None
    route104_haley_defeated: bool | None = None
    route104_winston_defeated: bool | None = None
    route104_cindy_defeated: bool | None = None
    route104_gina_mia_defeated: bool | None = None
    route104_darian_defeated: bool | None = None

    def json(self) -> dict[str, object]:
        return asdict(self)

    def text(self) -> str:
        if all(value is None for value in asdict(self).values()):
            return (
                "Story: unavailable while the game state reloads; "
                "progress already confirmed still stands"
            )
        completed = []
        if self.name_confirmed is True:
            completed.append("player name confirmed")
        if self.intro_stage in (4, 5, 6, 7):
            completed.append("Mom clock instruction received")
        if self.clock_set is True:
            completed.append("clock set")
        if self.intro_stage == 7:
            completed.append("Mom rival instruction received")
        if self.rival_stage in (3, 4):
            completed.append("rival met")
        if self.town_stage in (2, 3, 4):
            completed.append("sent to save Birch")
        if self.birch_lab_stage in (2, 3, 4, 5):
            completed.append("Birch rescue complete")
        if self.birch_lab_stage in (3, 4, 5):
            completed.append("Birch starter handoff complete")
        if self.petalburg_gym_stage in (1, 2, 3, 4, 5, 6, 7, 8):
            completed.append("Norman first meeting complete")
        for field, label in (
            (self.rival_battle_won, "Route 103 rival battle won"),
            (self.pokedex_received, "Pokédex received"),
            (self.starter_tutorial_complete, "starter tutorial complete"),
            (self.running_shoes_received, "running shoes received"),
            (self.petalburg_gym_stage in (2, 3, 4, 5, 6, 7, 8), "Wally tutorial complete"),
            (self.woods_stage == 1, "Petalburg Woods Aqua event complete"),
            (self.rustboro_josh_defeated, "Rustboro Gym Josh defeated"),
            (self.rustboro_tommy_defeated, "Rustboro Gym Tommy defeated"),
            (self.rustboro_marc_defeated, "Rustboro Gym Marc defeated"),
            (self.rustboro_gym_complete, "Rustboro Gym complete"),
            (self.stone_badge, "Stone Badge received"),
            (self.rock_tomb_received, "Rock Tomb received"),
        ):
            if field is True:
                completed.append(label)
        for trainer_field in INITIAL_TRAINER_FLAGS:
            if getattr(self, trainer_field) is True:
                completed.append(
                    trainer_field.removesuffix("_defeated").replace("_", " ") + " defeated"
                )
        # The underlying JSON distinguishes false from unavailable.
        return "Story: " + ("; ".join(completed) if completed else "no completion confirmed")


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    body = read(address, length)
    if len(body) != length:
        raise ValueError(f"short story read at 0x{address:08X}: {len(body)} of {length}")
    return body


def read_story(read: ReadMemory, screen: Screen, save1: int | None = None) -> StoryState:
    if screen.kind == "field_transition":
        return StoryState()
    if save1 is None:
        confirmed: bool | None = None
        if screen.callback2 in (0x0802F6B1, 0x08031679):
            tasks = _exact(read, TASKS, 16 * 0x28)
            functions = {
                int.from_bytes(tasks[i : i + 4], "little")
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4] == 1
            }
            if functions & NAME_CONFIRMED_TASKS:
                confirmed = True
            elif functions & NAME_UNCONFIRMED_TASKS:
                confirmed = False
        return StoryState(name_confirmed=confirmed)
    if not 0x02000000 <= save1 <= 0x02040000 - 0x159C or save1 % 4:
        return StoryState()
    flags = _exact(read, save1 + SAVE_FLAGS, 0x12C)
    variables = _exact(read, save1 + SAVE_VARS, 0x200)
    flag_values = {
        field: bool(flags[flag >> 3] & (1 << (flag & 7))) for field, flag in FLAG_FIELDS.items()
    }
    trainer_values = {
        field: (
            None
            if flag_values["rustboro_gym_complete"]
            else bool(flags[flag >> 3] & (1 << (flag & 7)))
        )
        for field, flag in GYM_TRAINER_FLAGS.items()
    }
    initial_trainer_values = {
        field: bool(flags[flag >> 3] & (1 << (flag & 7)))
        for field, flag in INITIAL_TRAINER_FLAGS.items()
    }
    variable_values: dict[str, int | None] = {}
    for field, (variable, maximum) in VAR_FIELDS.items():
        offset = 2 * (variable - 0x4000)
        value = int.from_bytes(variables[offset : offset + 2], "little")
        variable_values[field] = value if value <= maximum else None
    return StoryState(
        **initial_trainer_values,
        name_confirmed=True,
        intro_stage=variable_values["intro_stage"],
        rival_stage=variable_values["rival_stage"],
        birch_lab_stage=variable_values["birch_lab_stage"],
        petalburg_gym_stage=variable_values["petalburg_gym_stage"],
        woods_stage=variable_values["woods_stage"],
        town_stage=variable_values["town_stage"],
        clock_set=flag_values["clock_set"],
        rival_battle_won=flag_values["rival_battle_won"],
        pokedex_received=flag_values["pokedex_received"],
        running_shoes_received=flag_values["running_shoes_received"],
        starter_tutorial_complete=flag_values["starter_tutorial_complete"],
        rustboro_gym_complete=flag_values["rustboro_gym_complete"],
        stone_badge=flag_values["stone_badge"],
        rock_tomb_received=flag_values["rock_tomb_received"],
        rustboro_josh_defeated=trainer_values["rustboro_josh_defeated"],
        rustboro_tommy_defeated=trainer_values["rustboro_tommy_defeated"],
        rustboro_marc_defeated=trainer_values["rustboro_marc_defeated"],
    )
