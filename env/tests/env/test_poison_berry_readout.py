from dataclasses import replace
import struct

from pokebench_env.game_state import read_game_state
from pokebench_env.live_map import OBJECT_EVENTS
from pokebench_env.poison_berry_readout import BERRY, POISON, POISON_WARNING
from pokebench_env.readout import features_off_from_env, format_readout, state_json
from pokebench_env.rerender import read_state
from pokebench_env.resources import ResourceItem, Resources
from tests.env.test_game_state import MAPS, OVERWORLD, game, mon
from tests.env.test_readout import IN_GAME


def poisoned(status=8, hp=20):
    return replace(IN_GAME, party=(replace(IN_GAME.party[0], status=status, hp=hp),))


def test_poison_is_independent_of_status_names_and_off_is_exact():
    state = poisoned()
    off = frozenset({POISON, BERRY, "status-names-v1"})
    before = format_readout(state, off)
    assert "STATUS 8" in before and "poisoned" not in before
    on = format_readout(state, off - {POISON})
    assert "STATUS PSN (poisoned)" in on
    assert POISON_WARNING in on
    assert state_json(state, off) == state_json(state, off - {POISON})
    assert format_readout(state, off) == before


def test_warning_uses_game_words_without_unseen_remedies():
    assert POISON_WARNING == ('Poison (PSN): "If you walk around with a poisoned '
                              'POKéMON, it will lose HP until it faints."')
    for status in (8, 128):
        assert POISON_WARNING in format_readout(poisoned(status))
    for state in (poisoned(16), poisoned(hp=0), replace(poisoned(), in_battle=True),
                  replace(poisoned(), party_owner="unknown"),
                  replace(poisoned(), screen="pokemon_summary")):
        assert POISON_WARNING not in format_readout(state)
    assert "ANTIDOTE" not in format_readout(poisoned())


def berry_memory(stage=5):
    m = game(OVERWORLD, [mon(280,5,18,20)])
    # Player is (7,9), and map 0/9: one visible loaded berry object at (8,9).
    obj=bytearray(0x24)
    obj[0]=1
    obj[5]=62
    obj[8:11]=bytes([18,9,0])
    struct.pack_into("<hh",obj,0x10,15,16)
    obj[0x1D]=4
    m.put(OBJECT_EVENTS + 0x24,bytes(obj))
    from tests.env.test_game_state import SB1
    m.put(SB1+0x169C+4*8, struct.pack("<BBHBBxx",7,stage,720,2,0))
    return m


def test_production_factory_reads_only_enabled_visible_ripe_trees():
    m=berry_memory()
    off=frozenset({BERRY})
    baseline=read_state(m.read,MAPS,active_ui=False,off=off)
    on=read_state(m.read,MAPS,active_ui=False,off=frozenset())
    before=format_readout(baseline,off)
    after=format_readout(on)
    assert "Berry tree at (8,9): berries ready to pick" in after
    assert "face the tree and press A to examine" in after
    assert "ORAN BERRY" not in after
    assert "Berry tree at" not in before
    assert state_json(baseline,off)==state_json(on,off)
    assert format_readout(on,off)==before
    assert "Berry tree at" not in format_readout(replace(on,in_battle=True))
    assert read_game_state(m.read,MAPS).berry_readout is None


def test_growing_tree_is_not_reported_as_ripe():
    m=berry_memory(4)
    on=read_state(m.read,MAPS,active_ui=False,off=frozenset())
    result=format_readout(on)
    assert "Berry tree at (8,9): growing; no ripe berries" in result
    assert "ready to pick" not in result


def test_bag_quotes_only_descriptions_of_berries_already_owned():
    state=replace(IN_GAME,resources=Resources(bag=(ResourceItem(0,139,2,"berries","ORAN BERRY"),)))
    on=format_readout(state)
    assert 'ORAN BERRY ×2 — "A hold item that restores 10 HP in battle."' in on
    assert "PECHA" not in on
    assert 'restores 10 HP' not in format_readout(state,frozenset({BERRY}))
    assert format_readout(state,frozenset({POISON,BERRY})) == format_readout(state,frozenset({BERRY}))


def test_both_switches_default_off_on_the_server():
    assert {POISON,BERRY} <= features_off_from_env({})
