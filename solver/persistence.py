from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time
from typing import Any, Dict, List

from model import (
    BlockedTime,
    CrossListGroup,
    Instructor,
    InstructorPreferences,
    LockedAssignment,
    MeetingPattern,
    NoOverlapGroup,
    RoomPreferences,
    Room,
    ScheduleAssignment,
    ScheduleSolution,
    SectionPreferences,
    Section,
    SoftLock,
    Timeslot,
    db,
)


def parse_hhmm(value: Any) -> dt_time:
    if value is None:
        raise ValueError("Time value cannot be null")
    value_str = str(value).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(value_str, fmt).time()
        except ValueError:
            pass
    raise ValueError(f"Invalid time format: {value_str!r}")


def replace_scheduling_data(payload: Dict[str, Any]) -> None:
    sections_payload = payload.get("sections", [])
    if not isinstance(sections_payload, list):
        raise ValueError("Request body must include a 'sections' array.")

    instructors_payload = payload.get("instructors", [])
    rooms_payload = payload.get("rooms", [])
    timeslots_payload = payload.get("timeslots", [])
    meeting_patterns_payload = payload.get("meeting_patterns", [])
    crosslist_groups_payload = payload.get("crosslist_groups", [])
    no_overlap_groups_payload = payload.get("no_overlap_groups", [])
    blocked_times_payload = payload.get("blocked_times", [])
    locked_assignments_payload = payload.get("locked_assignments", [])
    soft_locks_payload = payload.get("soft_locks", [])

    for key, value in [
        ("instructors", instructors_payload),
        ("rooms", rooms_payload),
        ("timeslots", timeslots_payload),
        ("meeting_patterns", meeting_patterns_payload),
        ("crosslist_groups", crosslist_groups_payload),
        ("no_overlap_groups", no_overlap_groups_payload),
        ("blocked_times", blocked_times_payload),
        ("locked_assignments", locked_assignments_payload),
        ("soft_locks", soft_locks_payload),
    ]:
        if not isinstance(value, list):
            raise ValueError(f"Request body field '{key}' must be an array.")

    # Wipe existing data first (order matters because of foreign keys)
    ScheduleAssignment.query.delete()
    ScheduleSolution.query.delete()

    SoftLock.query.delete()
    LockedAssignment.query.delete()
    SectionPreferences.query.delete()
    Section.query.delete()

    InstructorPreferences.query.delete()
    Instructor.query.delete()

    RoomPreferences.query.delete()
    Room.query.delete()

    Timeslot.query.delete()
    MeetingPattern.query.delete()
    CrossListGroup.query.delete()
    NoOverlapGroup.query.delete()
    BlockedTime.query.delete()

    for inst in instructors_payload:
        inst_id = inst.get("id")
        if not inst_id:
            continue

        instructor = Instructor(
            id=inst_id,
            name=inst.get("name") or inst_id,
            rank_type=inst.get("rank_type") or "NTT",
        )
        db.session.add(instructor)

        pref = inst.get("preferences") or {}
        instructor_preferences = InstructorPreferences(
            instructor_id=inst_id,
            preferred_times=[],
            preferred_days=pref.get("preferred_days", []),
            preferred_patterns=pref.get("preferred_patterns", []),
            unavailable_times=inst.get("unavailable_times", []),
            max_teaching_days=pref.get("max_teaching_days"),
        )
        db.session.add(instructor_preferences)

    for room in rooms_payload:
        room_id = room.get("id")
        if not room_id:
            continue
        db.session.add(
            Room(
                id=room_id,
                building=room.get("building") or "",
                room_number=str(room_id),
                capacity=int(room.get("capacity", 0)),
                room_type="standard",
                has_av=False,
                is_accessible=True,
                features=room.get("features", []),
            )
        )

    for slot in timeslots_payload:
        slot_id = slot.get("id")
        if not slot_id:
            continue
        db.session.add(
            Timeslot(
                id=slot_id,
                days=slot.get("day") or slot.get("days") or "",
                start_time=parse_hhmm(slot.get("start_time")),
                end_time=parse_hhmm(slot.get("end_time")),
                slot_type=slot.get("slot_type") or "standard",
            )
        )

    for pattern in meeting_patterns_payload:
        pattern_id = pattern.get("id")
        if not pattern_id:
            continue
        db.session.add(
            MeetingPattern(
                id=pattern_id,
                slots_required=int(pattern.get("slots_required", 0)),
                allowed_days=pattern.get("allowed_days", []),
                compatible_timeslot_sets=pattern.get("compatible_timeslot_sets", []),
            )
        )

    for group in crosslist_groups_payload:
        group_id = group.get("id")
        if not group_id:
            continue
        db.session.add(
            CrossListGroup(
                id=group_id,
                member_section_ids=group.get("member_section_ids", []),
                require_same_room=bool(group.get("require_same_room", False)),
            )
        )

    for group in no_overlap_groups_payload:
        group_id = group.get("id")
        if not group_id:
            continue
        db.session.add(
            NoOverlapGroup(
                id=group_id,
                member_section_ids=group.get("member_section_ids", []),
                reason=group.get("reason") or "",
            )
        )

    for blocked in blocked_times_payload:
        blocked_scope = blocked.get("scope")
        if not blocked_scope:
            continue
        db.session.add(
            BlockedTime(
                scope=blocked_scope,
                timeslot_ids=blocked.get("timeslot_ids", []),
                reason=blocked.get("reason") or "",
            )
        )

    for item in sections_payload:
        section_id = item.get("id")
        if not section_id:
            continue
        db.session.add(
            Section(
                id=section_id,
                course_id=item.get("course_id"),
                section_code=item.get("section_code"),
                instructor_id=item.get("instructor_id"),
                expected_enrollment=item.get("expected_enrollment"),
                enrollment_cap=item.get("enrollment_cap"),
                section_type=item.get("section_type") or "lecture",
                allowed_meeting_patterns=item.get("allowed_meeting_patterns", []),
                room_requirements=item.get("room_requirements", []),
                crosslist_group_id=item.get("crosslist_group_id"),
                tags=item.get("tags", []),
            )
        )

    for lock in locked_assignments_payload:
        section_id = lock.get("section_id")
        if not section_id:
            continue
        db.session.add(
            LockedAssignment(
                section_id=section_id,
                fixed_timeslot_set=lock.get("fixed_timeslot_set"),
                fixed_room=lock.get("fixed_room"),
            )
        )

    for soft in soft_locks_payload:
        section_id = soft.get("section_id")
        if not section_id:
            continue
        db.session.add(
            SoftLock(
                section_id=section_id,
                preferred_timeslot_set=soft.get("preferred_timeslot_set"),
                preferred_room=soft.get("preferred_room"),
                weight=float(soft.get("weight", 1.0)),
            )
        )

    db.session.commit()
