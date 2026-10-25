from pokebench_env.map_layout import effective_dimensions


def test_ordinary_dimensions_must_agree_with_live_backup_padding():
    assert effective_dimensions((15, 22), (30, 36), (0, 1), 1) == (15, 22)
    assert effective_dimensions((15, 22), (31, 36), (0, 1), 1) is None
    assert effective_dimensions((0, 22), (15, 36), (0, 1), 1) is None
    assert effective_dimensions((256, 256), (271, 270), (0, 1), 1) is None


def test_pyramid_is_qualified_by_map_header_layout_and_exact_generated_size():
    # GenerateBattlePyramidFloorLayout assembles four-by-four 8x8 squares.
    assert effective_dimensions((8, 8), (47, 46), (26, 26), 361) == (32, 32)
    for map_id, layout_id, declared, backup in [
        ((26, 25), 361, (8, 8), (47, 46)),
        ((26, 26), 362, (8, 8), (47, 46)),
        ((26, 26), 361, (16, 16), (47, 46)),
        ((26, 26), 361, (8, 8), (46, 46)),
        (None, 361, (8, 8), (47, 46)),
        ((26, 26), None, (8, 8), (47, 46)),
    ]:
        assert effective_dimensions(declared, backup, map_id, layout_id) is None


def test_trainer_hill_requires_no_generated_dimension_exception():
    for floor in range(4):
        assert effective_dimensions((16, 21), (31, 35), (26, 61 + floor), 415 + floor) == (
            16,
            21,
        )
