"""
seed_instructors.py
===================
Populates the `instructors` table from seed_instructors.json.

Notes:
  - `rank_type` is set to "TBD" for all instructors and should be updated
    manually or via a separate data source (e.g. HR export).
  - IDs are generated as: lowercase_last_firstinitial (e.g. "solow_d").
    These IDs are what Sections will reference via instructor_id.
  - "Staff" entries from the spreadsheet are intentionally excluded —
    they are placeholders, not real instructors.
  - InstructorPreferences records are NOT seeded here; they require
    deliberate input and are created separately.
  - Idempotent: safe to run multiple times, skips existing records.

Usage:
    from seed_instructors import seed
    seed(db)
"""

import json
from pathlib import Path

HERE = Path(__file__).parent


def seed(db):
    from app.model import Instructor  # adjust to your project structure

    data = json.loads((HERE / "seed_instructors.json").read_text())
    added = 0
    for row in data:
        if db.session.get(Instructor, row["id"]) is None:
            db.session.add(Instructor(
                id=row["id"],
                name=row["name"],
                rank_type=row["rank_type"],
            ))
            added += 1

    db.session.commit()
    print(f"[seed] Instructors: {added} added, {len(data) - added} already existed.")
    print(f"[seed] NOTE: rank_type is 'TBD' for all — update before scheduling.")
