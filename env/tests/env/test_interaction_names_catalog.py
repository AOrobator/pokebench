import json
from unittest.mock import patch

import pytest

from pokebench_env.interaction_names import load_names


@pytest.mark.parametrize(
    "raw",
    [
        [],
        {"x": {}},
        {"0": {}},
        {"134217728": {}},
        {"134217728": {"name": "", "signature": "00" * 16}},
        {"134217728": {"name": "clock", "signature": "ff"}},
        {"134217728": {"name": "clock", "signature": "zz" * 32}},
    ],
)
def test_rejects_malformed_catalog(raw):
    with patch("pathlib.Path.read_text", return_value=json.dumps(raw)):
        with pytest.raises(ValueError):
            load_names()
