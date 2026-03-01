"""
Seed script: populate Room and RoomPreferences tables from static JSON fixtures.

These room records are fixed and authoritative — they represent the actual physical
inventory of schedulable classrooms. Run this BEFORE any section/schedule import.
Running it again is safe: existing records are updated in place (upsert behavior).

Usage (from project root):
    flask shell < seed_rooms.py
    -- or --
    python seed_rooms.py          (if __main__ block finds your Flask app)
    -- or --
    from seed_rooms import seed_rooms; seed_rooms(db)
"""

import json
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths — JSON fixtures live next to this script
# ---------------------------------------------------------------------------
FIXTURES_DIR = Path(__file__).resolve().parent
ROOMS_FILE = FIXTURES_DIR / "rooms.json"
ROOM_PREFS_FILE = FIXTURES_DIR / "room_preferences.json"


def seed_rooms(db):
    """
    Upsert all Room and RoomPreferences records from JSON fixtures.

    Args:
        db: The Flask-SQLAlchemy db instance (from model.py).

    Raises:
        FileNotFoundError: If either JSON fixture file is missing.
        ValueError: If a room_preferences entry references a room_id not in rooms.json.
    """
    from model import Room, RoomPreferences  # import here to avoid circular deps

    # -- Load fixtures -------------------------------------------------------
    if not ROOMS_FILE.exists():
        raise FileNotFoundError(f"Room fixture not found: {ROOMS_FILE}")
    if not ROOM_PREFS_FILE.exists():
        raise FileNotFoundError(f"Room preferences fixture not found: {ROOM_PREFS_FILE}")

    with open(ROOMS_FILE, encoding="utf-8") as f:
        rooms_data = json.load(f)
    with open(ROOM_PREFS_FILE, encoding="utf-8") as f:
        prefs_data = json.load(f)

    # Validate that every room_preferences entry has a matching room
    room_ids_in_fixture = {r["id"] for r in rooms_data}
    for pref in prefs_data:
        if pref["room_id"] not in room_ids_in_fixture:
            raise ValueError(
                f"room_preferences references unknown room_id '{pref['room_id']}'. "
                f"Add it to rooms.json first."
            )

    # -- Upsert Rooms --------------------------------------------------------
    rooms_created = 0
    rooms_updated = 0

    for room_dict in rooms_data:
        existing = db.session.get(Room, room_dict["id"])
        if existing is None:
            room = Room(
                id=room_dict["id"],
                building=room_dict["building"],
                room_number=room_dict["room_number"],
                capacity=room_dict["capacity"],
                room_type=room_dict["room_type"],
                has_av=room_dict["has_av"],
                is_accessible=room_dict["is_accessible"],
                features=room_dict.get("features", []),
            )
            db.session.add(room)
            rooms_created += 1
        else:
            # Update all fields — JSON is the source of truth for rooms
            existing.building = room_dict["building"]
            existing.room_number = room_dict["room_number"]
            existing.capacity = room_dict["capacity"]
            existing.room_type = room_dict["room_type"]
            existing.has_av = room_dict["has_av"]
            existing.is_accessible = room_dict["is_accessible"]
            existing.features = room_dict.get("features", [])
            rooms_updated += 1

    # Flush so that RoomPreferences FK constraints resolve
    db.session.flush()

    # -- Upsert RoomPreferences ----------------------------------------------
    prefs_created = 0
    prefs_updated = 0

    for pref_dict in prefs_data:
        existing_pref = RoomPreferences.query.filter_by(
            room_id=pref_dict["room_id"]
        ).first()

        if existing_pref is None:
            pref = RoomPreferences(
                room_id=pref_dict["room_id"],
                need_projector=pref_dict["need_projector"],
                need_lab=pref_dict["need_lab"],
                can_be_outside_weatherhead=pref_dict["can_be_outside_weatherhead"],
                other_requirements=pref_dict.get("other_requirements") or {},
            )
            db.session.add(pref)
            prefs_created += 1
        else:
            existing_pref.need_projector = pref_dict["need_projector"]
            existing_pref.need_lab = pref_dict["need_lab"]
            existing_pref.can_be_outside_weatherhead = pref_dict["can_be_outside_weatherhead"]
            existing_pref.other_requirements = pref_dict.get("other_requirements") or {}
            prefs_updated += 1

    db.session.commit()

    print(
        f"Rooms:            {rooms_created} created, {rooms_updated} updated\n"
        f"RoomPreferences:  {prefs_created} created, {prefs_updated} updated"
    )
    print("\nSeeded rooms:")
    for r in rooms_data:
        print(
            f"  [{r['id']:12s}] {r['building']} {r['room_number']:5s} "
            f"cap={r['capacity']:3d}  type={r['room_type']}"
        )


# ---------------------------------------------------------------------------
# CLI entry point — finds your Flask app automatically
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    import os

    # Walk up from this file looking for the Flask app factory
    # Adjust 'app' and module name to match your project structure
    try:
        from app import create_app  # type: ignore
        from model import db        # type: ignore

        application = create_app()
        with application.app_context():
            seed_rooms(db)
    except ImportError as e:
        print(
            f"Could not import app: {e}\n"
            "Run this inside a Flask shell instead:\n"
            "  flask shell\n"
            "  >>> from seed_rooms import seed_rooms\n"
            "  >>> from model import db\n"
            "  >>> seed_rooms(db)"
        )
        sys.exit(1)
