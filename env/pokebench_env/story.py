"""Emerald's own story state; source/ROM evidence in findings/story-milestones.md."""

from dataclasses import asdict, dataclass

from pokebench_env.game_screen import TASKS, ReadMemory, Screen

SAVE_FLAGS = 0x1270
SAVE_VARS = 0x139C
# Exact post-YES Birch tasks, not a broad address range or a copied editor name.
NAME_CONFIRMED_TASKS = frozenset({0x08031221, 0x08031259, 0x0803133D, 0x080313E5, 0x080314C5})
NAME_CONFIRMATION_TASK = 0x08031189
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
VAR_FIELDS = {
    "intro_stage": (0x4092, 7),
    "rival_stage": (0x408D, 4),
    "birch_lab_stage": (0x4084, 5),
    "petalburg_gym_stage": (0x4085, 8),
    "woods_stage": (0x4098, 1),
}


@dataclass(frozen=True)
class StoryState:
    name_confirmed: bool | None = None
    intro_stage: int | None = None
    rival_stage: int | None = None
    birch_lab_stage: int | None = None
    petalburg_gym_stage: int | None = None
    woods_stage: int | None = None
    clock_set: bool | None = None
    rival_battle_won: bool | None = None
    pokedex_received: bool | None = None
    running_shoes_received: bool | None = None
    starter_tutorial_complete: bool | None = None
    rustboro_gym_complete: bool | None = None
    stone_badge: bool | None = None
    rock_tomb_received: bool | None = None

    def json(self) -> dict[str, object]:
        return asdict(self)

    def text(self) -> str:
        completed = []
        if self.name_confirmed is True:
            completed.append("player name confirmed")
        if self.clock_set is True:
            completed.append("clock set")
        if self.rival_stage in (3, 4):
            completed.append("rival met")
        if self.birch_lab_stage in (2, 3, 4, 5):
            completed.append("Birch rescue complete")
        for field, label in (
            (self.rival_battle_won, "Route 103 rival battle won"),
            (self.pokedex_received, "Pokédex received"),
            (self.starter_tutorial_complete, "starter tutorial complete"),
            (self.running_shoes_received, "running shoes received"),
            (self.petalburg_gym_stage in (2, 3, 4, 5, 6, 7, 8), "Wally tutorial complete"),
            (self.woods_stage == 1, "Petalburg Woods Aqua event complete"),
            (self.rustboro_gym_complete, "Rustboro Gym complete"),
            (self.stone_badge, "Stone Badge received"),
            (self.rock_tomb_received, "Rock Tomb received"),
        ):
            if field is True:
                completed.append(label)
        # The underlying JSON distinguishes false from unavailable.
        return "Story: " + ("; ".join(completed) if completed else "no completion confirmed")


def _exact(read: ReadMemory, address: int, length: int) -> bytes:
    body = read(address, length)
    if len(body) != length:
        raise ValueError(f"short story read at 0x{address:08X}: {len(body)} of {length}")
    return body


def read_story(read: ReadMemory, screen: Screen, save1: int | None = None) -> StoryState:
    if save1 is None:
        confirmed: bool | None = None
        if screen.callback2 in (0x0802F6B1, 0x08031679):
            tasks = _exact(read, TASKS, 16 * 0x28)
            functions = {
                int.from_bytes(tasks[i : i + 4], "little")
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4]
            }
            if functions & NAME_CONFIRMED_TASKS:
                confirmed = True
            elif NAME_CONFIRMATION_TASK in functions:
                confirmed = False
        return StoryState(name_confirmed=confirmed)
    if not 0x02000000 <= save1 <= 0x02040000 - 0x159C or save1 % 4:
        return StoryState()
    flags = _exact(read, save1 + SAVE_FLAGS, 0x12C)
    variables = _exact(read, save1 + SAVE_VARS, 0x200)
    flag_values = {
        field: bool(flags[flag >> 3] & (1 << (flag & 7))) for field, flag in FLAG_FIELDS.items()
    }
    variable_values: dict[str, int | None] = {}
    for field, (variable, maximum) in VAR_FIELDS.items():
        offset = 2 * (variable - 0x4000)
        value = int.from_bytes(variables[offset : offset + 2], "little")
        variable_values[field] = value if value <= maximum else None
    return StoryState(
        name_confirmed=True,
        intro_stage=variable_values["intro_stage"],
        rival_stage=variable_values["rival_stage"],
        birch_lab_stage=variable_values["birch_lab_stage"],
        petalburg_gym_stage=variable_values["petalburg_gym_stage"],
        woods_stage=variable_values["woods_stage"],
        clock_set=flag_values["clock_set"],
        rival_battle_won=flag_values["rival_battle_won"],
        pokedex_received=flag_values["pokedex_received"],
        running_shoes_received=flag_values["running_shoes_received"],
        starter_tutorial_complete=flag_values["starter_tutorial_complete"],
        rustboro_gym_complete=flag_values["rustboro_gym_complete"],
        stone_badge=flag_values["stone_badge"],
        rock_tomb_received=flag_values["rock_tomb_received"],
    )
