"""ETA range computation is shown to every patient on every refresh.
A sign error or off-by-one would visibly mislead patients about their wait."""
from __future__ import annotations

import pytest

from app.services.eta import PRIOR_MINUTES, eta_range
from app.models.visit import Poli


def test_priors_cover_every_poli():
    for poli in Poli:
        assert poli in PRIOR_MINUTES, f"missing prior for {poli}"
        assert PRIOR_MINUTES[poli] > 0


def test_eta_range_position_one_is_one_avg_consult():
    low, high = eta_range(1, avg_minutes=10)
    assert low == 8  # 10 * 0.8
    assert high == 12  # 10 * 1.2


def test_eta_range_scales_with_position():
    low_p1, high_p1 = eta_range(1, 10)
    low_p5, high_p5 = eta_range(5, 10)
    assert low_p5 > low_p1
    assert high_p5 > high_p1


def test_eta_range_low_lt_or_eq_high():
    for pos in range(0, 12):
        for avg in (5.0, 8.0, 12.0, 20.0):
            low, high = eta_range(pos, avg)
            assert low <= high


def test_eta_range_position_zero_clamps_low_to_zero():
    low, high = eta_range(0, 10)
    assert low == 0
    assert high >= 1  # high - low must be >= 1


def test_eta_range_handles_fractional_avg():
    # Avg pulled from a 6-minute mean → no float weirdness in display
    low, high = eta_range(3, 6.7)
    assert low == round(3 * 6.7 * 0.8)
    assert high >= low + 1


@pytest.mark.parametrize("position,avg", [(1, 8.0), (3, 12.0), (10, 15.0)])
def test_eta_range_is_within_plus_minus_20_percent(position, avg):
    low, high = eta_range(position, avg)
    base = position * avg
    # Allow rounding slack of 1 minute either side
    assert low >= int(base * 0.8) - 1
    assert high <= int(base * 1.2) + 1
