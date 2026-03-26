"""
seed_timeslots.py
=================
Populates the `timeslots` and `meeting_patterns` tables from their
JSON seed files. These values are FIXED and FINAL — they represent
the canonical CWRU Fall/Spring course time grid (effective Fall 2016).

Rules enforced:
  - Timeslots are never overwritten if they already exist (idempotent).
  - Sections that carry a `last_year_time` string reference a timeslot ID
    from this table, but do NOT override it — timeslots are the authority.
  - MeetingPattern.compatible_timeslot_sets only references IDs that exist
    in this seed, so run this before seeding any other table.

Usage:
    from seed_timeslots import seed
    seed(db)          # pass in your SQLAlchemy db instance
"""

import json
from pathlib import Path
from datetime import time as dt_time

HERE = Path(__file__).parent


def _parse_time(t_str: str) -> dt_time:
    h, m, s = t_str.split(":")
    return dt_time(int(h), int(m), int(s))


def seed(db):
    from app.model import Timeslot, MeetingPattern  # adjust import to your project structure

    # ── Timeslots ─────────────────────────────────────────────────────────────
    ts_data = json.loads((HERE / "seed_timeslots.json").read_text())
    ts_added = 0
    for row in ts_data:
        if db.session.get(Timeslot, row["id"]) is None:
            db.session.add(Timeslot(
                id=row["id"],
                days=row["days"],
                start_time=_parse_time(row["start_time"]),
                end_time=_parse_time(row["end_time"]),
                slot_type=row["slot_type"],
            ))
            ts_added += 1
    print(f"[seed] Timeslots: {ts_added} added, {len(ts_data) - ts_added} already existed.")

    # ── MeetingPatterns ───────────────────────────────────────────────────────
    mp_data = json.loads((HERE / "seed_meeting_patterns.json").read_text())
    mp_added = 0
    for row in mp_data:
        if db.session.get(MeetingPattern, row["id"]) is None:
            db.session.add(MeetingPattern(
                id=row["id"],
                slots_required=row["slots_required"],
                allowed_days=row["allowed_days"],
                compatible_timeslot_sets=row["compatible_timeslot_sets"],
            ))
            mp_added += 1
    print(f"[seed] MeetingPatterns: {mp_added} added, {len(mp_data) - mp_added} already existed.")

    db.session.commit()
    print("[seed] Done — timeslots and meeting patterns committed.")
