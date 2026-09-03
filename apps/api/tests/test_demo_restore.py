"""The demo clinic restores itself between visitors — and never otherwise.

Judging runs for weeks against one shared dataset. Every visitor who works
through the flow calls patients in and closes visits, so the floor drains and a
later judge finds an empty waiting room. This puts it back.

The dangerous direction is the other one: this truncates tables, so it must be
impossible to trigger on a deployment that holds real data, and impossible to
trigger while somebody is mid-consultation.
"""
from __future__ import annotations

import inspect

from app.core.config import Settings
from app.services import demo_restore


def test_disabled_by_default():
    """A deployment that never opts in must never lose its data.

    Checks the field default rather than a constructed Settings(), which would
    pick up whatever the local .env says and pass for the wrong reason.
    """
    assert Settings.model_fields["DEMO_AUTO_RESTORE"].default is False


def test_the_flag_is_checked_before_anything_else_happens():
    """The opt-in gate must come before any query or write."""
    src = inspect.getsource(demo_restore.restore_if_idle)
    gate = src.index("DEMO_AUTO_RESTORE")
    for later in ("select(", "_reset", "_seed"):
        assert gate < src.index(later), f"{later} is reachable before the opt-in check"


def test_active_tickets_block_a_restore():
    """Someone mid-consultation must not have the board wiped underneath them."""
    src = inspect.getsource(demo_restore.restore_if_idle)
    assert "if active:" in src and "return False" in src
    # Every non-terminal status counts as active.
    from app.models.queue_ticket import TicketStatus

    assert set(demo_restore._ACTIVE) == {
        TicketStatus.waiting,
        TicketStatus.in_intake,
        TicketStatus.intake_complete,
        TicketStatus.in_consultation,
    }
    assert TicketStatus.done not in demo_restore._ACTIVE
    assert TicketStatus.cancelled not in demo_restore._ACTIVE


def test_an_idle_period_is_required_on_top_of_emptiness():
    """Emptiness alone would wipe the board the moment someone closed their last
    visit, taking the stats they were about to read with it."""
    src = inspect.getsource(demo_restore.restore_if_idle)
    assert "DEMO_RESTORE_IDLE_MINUTES" in src
    assert Settings.model_fields["DEMO_RESTORE_IDLE_MINUTES"].default >= 5


def test_it_does_not_dispose_the_running_engine():
    """seed.main() ends with engine.dispose(), which would tear down the live
    application's connection pool. The restore must drive _reset/_seed itself."""
    src = inspect.getsource(demo_restore.restore_if_idle)
    code = "\n".join(
        line for line in src.split("\n") if not line.lstrip().startswith("#")
    )
    assert "from seed.demo_scenarios import _reset, _seed" in code
    assert "import main" not in code
    assert "dispose" not in code, "the restore must not touch the shared engine"


def test_a_never_seeded_database_is_seeded_rather_than_skipped():
    """No tickets at all is 'never seeded', not 'drained' — the first visitor
    should not find an empty clinic."""
    src = inspect.getsource(demo_restore.restore_if_idle)
    assert "last_touch is None" in src or "if last_touch is not None" in src


def test_an_abandoned_floor_is_eventually_restored_anyway():
    """A stranded ticket must not freeze the clinic for the rest of judging.

    Requiring an empty board was not enough on its own: anyone who calls a
    patient in and closes the tab leaves that ticket in consultation forever,
    the floor never drains again, and the restore silently stops running. The
    stale window releases that, and must be strictly longer than the idle one so
    it can never fire on someone who is simply reading the screen.
    """
    src = inspect.getsource(demo_restore.restore_if_idle)
    assert "DEMO_RESTORE_STALE_MINUTES" in src, "no release for an abandoned floor"
    stale = Settings.model_fields["DEMO_RESTORE_STALE_MINUTES"].default
    idle = Settings.model_fields["DEMO_RESTORE_IDLE_MINUTES"].default
    assert stale > idle, "the stale window must be longer than the idle window"
    assert stale >= 30, "too short: this fires with patients still on the board"


def test_being_called_in_counts_as_touching_the_floor():
    """called_at is the only timestamp that moves when a patient is called in.

    Without it, a ticket in consultation looks as old as the moment it was
    issued, and an actively-used clinic could be judged abandoned.
    """
    src = inspect.getsource(demo_restore.restore_if_idle)
    assert "called_at" in src
