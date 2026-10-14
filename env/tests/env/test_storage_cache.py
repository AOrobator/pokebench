from pokebench_env.storage_cache import StorageDecodeCache
from tests.env.test_pokemon import ambiguous_fixture, cpu_context, fixture

ADDRESS = 0x020244EC


def test_unchanged_slot_reuses_valid_result_and_clear_redecodes():
    body, read = fixture()
    cache = StorageDecodeCache()
    cpu = cpu_context(pc=0x08085E5C, lr=0)
    first = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu)
    assert cache.decode(body[:80], read, address=ADDRESS, cpu=cpu) is first
    cache.clear()
    assert cache.decode(body[:80], read, address=ADDRESS, cpu=cpu) is not first


def test_invalid_snapshot_always_redecodes_and_repaired_body_invalidates_old_entry():
    body, read = fixture()
    cache = StorageDecodeCache()
    cpu = cpu_context(pc=0x08085E5C, lr=0)
    first = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu)
    bad = bytearray(body[:80])
    bad[32] ^= 1
    failure = cache.decode(bytes(bad), read, address=ADDRESS, cpu=cpu)
    again = cache.decode(bytes(bad), read, address=ADDRESS, cpu=cpu)
    assert failure.diagnostic and failure is not again
    assert failure.cpu_context.gprs == cpu.gprs
    repaired = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu)
    assert repaired.diagnostic is None and repaired is not first


def test_same_bytes_resolve_again_when_cpu_plaintext_owner_changes():
    body, read = ambiguous_fixture()
    cache = StorageDecodeCache()
    encrypted = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu_context(pc=0x08085E5C, lr=0))
    plain = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu_context())
    assert encrypted.species == "TORCHIC" and plain.species == "COMBUSKEN"
    assert encrypted is not plain
    unknown = cache.decode(body[:80], read, address=ADDRESS, cpu=None)
    assert "CPU owner unavailable" in unknown.diagnostic
    assert unknown is not cache.decode(body[:80], read, address=ADDRESS, cpu=None)


def test_nickname_diagnostic_and_unknown_cpu_never_cache():
    body, read = fixture()
    cache = StorageDecodeCache()
    cpu = cpu_context(pc=0x08085E5C, lr=0)
    raw = bytearray(body[:80])
    raw[8] = 0x0A
    raw[0x12] = 2
    first = cache.decode(bytes(raw), read, address=ADDRESS, cpu=cpu)
    assert first.nickname_diagnostic and first.diagnostic is None
    assert cache.decode(bytes(raw), read, address=ADDRESS, cpu=cpu) is not first
    valid = cache.decode(body[:80], read, address=ADDRESS, cpu=None)
    assert cache.decode(body[:80], read, address=ADDRESS, cpu=None) is not valid


def test_cache_bounded_to_420_actual_slot_addresses_and_reader_journal_independent():
    body, read = fixture()
    cache = StorageDecodeCache()
    cpu = cpu_context(pc=0x08085E5C, lr=0)
    first = cache.decode(body[:80], read, address=ADDRESS, cpu=cpu)
    for slot in range(1, 422):
        cache.decode(body[:80], read, address=ADDRESS + slot * 80, cpu=cpu)
    assert len(cache._slots) == 420
    assert cache.decode(body[:80], read, address=ADDRESS, cpu=cpu) is not first
    other = StorageDecodeCache()
    assert other.decode(body[:80], read, address=ADDRESS, cpu=cpu) is not cache.decode(
        body[:80], read, address=ADDRESS, cpu=cpu
    )
