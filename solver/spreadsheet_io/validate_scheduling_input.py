"""Structural validation for scheduling input — finds bad references before solve."""

from __future__ import annotations

from typing import Any, Dict, List, Set

from online_sections import ONLINE_ROOM_SENTINEL, is_online_section


def _err(
    code: str,
    message: str,
    *,
    sheet: str | None = None,
    row_id: str | None = None,
    field: str | None = None,
) -> dict:
    payload: Dict[str, Any] = {"code": code, "message": message}
    if sheet:
        payload["sheet"] = sheet
    if row_id:
        payload["row_id"] = row_id
    if field:
        payload["field"] = field
    return payload


def _ids(items: List[dict], key: str = "id") -> Set[str]:
    result: Set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        value = item.get(key)
        if value is not None and str(value).strip():
            result.add(str(value).strip())
    return result


def validate_scheduling_input(data: dict) -> List[dict]:
    """Return human-readable structural issues (empty list = no blockers found)."""
    errors: List[dict] = []

    sections = [s for s in data.get("sections", []) if isinstance(s, dict)]
    instructors = [i for i in data.get("instructors", []) if isinstance(i, dict)]
    rooms = [r for r in data.get("rooms", []) if isinstance(r, dict)]
    timeslots = [t for t in data.get("timeslots", []) if isinstance(t, dict)]
    meeting_patterns = [m for m in data.get("meeting_patterns", []) if isinstance(m, dict)]
    crosslist_groups = [g for g in data.get("crosslist_groups", []) if isinstance(g, dict)]
    no_overlap_groups = [g for g in data.get("no_overlap_groups", []) if isinstance(g, dict)]
    blocked_times = [b for b in data.get("blocked_times", []) if isinstance(b, dict)]
    locked_assignments = [l for l in data.get("locked_assignments", []) if isinstance(l, dict)]
    soft_locks = [l for l in data.get("soft_locks", []) if isinstance(l, dict)]

    section_ids = _ids(sections)
    sections_by_id = {
        str(section.get("id", "")).strip(): section
        for section in sections
        if str(section.get("id", "")).strip()
    }
    instructor_ids = _ids(instructors)
    room_ids = _ids(rooms)
    timeslot_ids = _ids(timeslots)
    pattern_ids = _ids(meeting_patterns)
    crosslist_ids = _ids(crosslist_groups)
    no_overlap_ids = _ids(no_overlap_groups)

    def check_dupes(items: List[dict], sheet: str) -> None:
        seen: Set[str] = set()
        for item in items:
            item_id = str(item.get("id", "")).strip()
            if not item_id:
                continue
            if item_id in seen:
                errors.append(
                    _err(
                        "duplicate_id",
                        f"Duplicate {sheet} id '{item_id}'.",
                        sheet=sheet,
                        row_id=item_id,
                        field="id",
                    )
                )
            seen.add(item_id)

    check_dupes(sections, "Sections")
    check_dupes(instructors, "Instructors")
    check_dupes(rooms, "Rooms")
    check_dupes(timeslots, "Timeslots")
    check_dupes(meeting_patterns, "MeetingPatterns")

    if ONLINE_ROOM_SENTINEL in room_ids:
        errors.append(
            _err(
                "reserved_room_id",
                f"Rooms must not use the reserved online sentinel id '{ONLINE_ROOM_SENTINEL}'.",
                sheet="Rooms",
                row_id=ONLINE_ROOM_SENTINEL,
                field="id",
            )
        )

    if not sections:
        errors.append(
            _err(
                "missing_data",
                "Sections sheet produced no rows. The spreadsheet must include at least one section.",
                sheet="Sections",
            )
        )

    pattern_timeslots: Dict[str, Set[str]] = {}
    for pattern in meeting_patterns:
        pattern_id = str(pattern.get("id", "")).strip()
        if not pattern_id:
            continue
        nested_sets = pattern.get("compatible_timeslot_sets") or []
        all_ts: Set[str] = set()
        if isinstance(nested_sets, list):
            for slot_set in nested_sets:
                if not isinstance(slot_set, list):
                    continue
                for ts_id in slot_set:
                    ts = str(ts_id).strip()
                    if not ts:
                        continue
                    all_ts.add(ts)
                    if ts not in timeslot_ids:
                        errors.append(
                            _err(
                                "unknown_timeslot",
                                f"MeetingPatterns row '{pattern_id}' references unknown timeslot '{ts}' in compatible_timeslot_sets.",
                                sheet="MeetingPatterns",
                                row_id=pattern_id,
                                field="compatible_timeslot_sets",
                            )
                        )
        pattern_timeslots[pattern_id] = all_ts
        if not all_ts:
            errors.append(
                _err(
                    "empty_pattern_timeslots",
                    f"MeetingPatterns row '{pattern_id}' has no valid compatible_timeslot_sets.",
                    sheet="MeetingPatterns",
                    row_id=pattern_id,
                    field="compatible_timeslot_sets",
                )
            )

    for section in sections:
        section_id = str(section.get("id", "")).strip()
        if not section_id:
            continue

        instructor_id = str(section.get("instructor_id", "")).strip()
        if instructor_id and instructor_id not in instructor_ids:
            errors.append(
                _err(
                    "unknown_instructor",
                    f"Sections row '{section_id}' references unknown instructor_id '{instructor_id}'.",
                    sheet="Sections",
                    row_id=section_id,
                    field="instructor_id",
                )
            )

        allowed_patterns = section.get("allowed_meeting_patterns") or []
        if not isinstance(allowed_patterns, list) or len(allowed_patterns) == 0:
            errors.append(
                _err(
                    "missing_meeting_patterns",
                    f"Sections row '{section_id}' has no allowed_meeting_patterns.",
                    sheet="Sections",
                    row_id=section_id,
                    field="allowed_meeting_patterns",
                )
            )
        else:
            for pattern_id in allowed_patterns:
                pid = str(pattern_id).strip()
                if pid and pid not in pattern_ids:
                    errors.append(
                        _err(
                            "unknown_meeting_pattern",
                            f"Sections row '{section_id}' references unknown meeting pattern '{pid}'.",
                            sheet="Sections",
                            row_id=section_id,
                            field="allowed_meeting_patterns",
                        )
                    )

        crosslist_id = section.get("crosslist_group_id")
        if crosslist_id:
            cid = str(crosslist_id).strip()
            if cid and cid not in crosslist_ids:
                errors.append(
                    _err(
                        "unknown_crosslist_group",
                        f"Sections row '{section_id}' references unknown crosslist_group_id '{cid}'.",
                        sheet="Sections",
                        row_id=section_id,
                        field="crosslist_group_id",
                    )
                )

    for group in crosslist_groups:
        group_id = str(group.get("id", "")).strip()
        members = [
            str(m).strip()
            for m in (group.get("member_section_ids") or [])
            if str(m).strip()
        ]
        if len(members) < 2:
            errors.append(
                _err(
                    "invalid_crosslist_group",
                    f"CrosslistGroups row '{group_id}' needs at least 2 member_section_ids (found {len(members)}).",
                    sheet="CrosslistGroups",
                    row_id=group_id or None,
                    field="member_section_ids",
                )
            )
        for member in members:
            if member not in section_ids:
                errors.append(
                    _err(
                        "unknown_section",
                        f"CrosslistGroups row '{group_id}' references unknown section '{member}'.",
                        sheet="CrosslistGroups",
                        row_id=group_id or None,
                        field="member_section_ids",
                    )
                )

    for group in no_overlap_groups:
        group_id = str(group.get("id", "")).strip()
        members = [
            str(m).strip()
            for m in (group.get("member_section_ids") or [])
            if str(m).strip()
        ]
        if len(members) < 2:
            errors.append(
                _err(
                    "invalid_no_overlap_group",
                    f"NoOverlapGroups row '{group_id}' needs at least 2 member_section_ids (found {len(members)}).",
                    sheet="NoOverlapGroups",
                    row_id=group_id or None,
                    field="member_section_ids",
                )
            )
        for member in members:
            if member not in section_ids:
                errors.append(
                    _err(
                        "unknown_section",
                        f"NoOverlapGroups row '{group_id}' references unknown section '{member}'.",
                        sheet="NoOverlapGroups",
                        row_id=group_id or None,
                        field="member_section_ids",
                    )
                )

    for lock in locked_assignments:
        section_id = str(lock.get("section_id", "")).strip()
        if section_id and section_id not in section_ids:
            errors.append(
                _err(
                    "unknown_section",
                    f"LockedAssignments references unknown section '{section_id}'.",
                    sheet="LockedAssignments",
                    row_id=section_id,
                    field="section_id",
                )
            )
        fixed_room = lock.get("fixed_room")
        section = sections_by_id.get(section_id)
        if section and is_online_section(section):
            if fixed_room and str(fixed_room).strip() not in ("", ONLINE_ROOM_SENTINEL):
                errors.append(
                    _err(
                        "online_fixed_room",
                        f"LockedAssignments for online section '{section_id}' must not set fixed_room (online sections are time-only).",
                        sheet="LockedAssignments",
                        row_id=section_id or None,
                        field="fixed_room",
                    )
                )
        elif fixed_room and str(fixed_room).strip() == ONLINE_ROOM_SENTINEL:
            errors.append(
                _err(
                    "invalid_fixed_room",
                    f"LockedAssignments for section '{section_id}' cannot use the online sentinel as fixed_room.",
                    sheet="LockedAssignments",
                    row_id=section_id or None,
                    field="fixed_room",
                )
            )
        elif fixed_room and str(fixed_room).strip() not in room_ids:
            errors.append(
                _err(
                    "unknown_room",
                    f"LockedAssignments for section '{section_id}' references unknown room '{fixed_room}'.",
                    sheet="LockedAssignments",
                    row_id=section_id or None,
                    field="fixed_room",
                )
            )
        fixed_set = lock.get("fixed_timeslot_set") or []
        if isinstance(fixed_set, list):
            for ts_id in fixed_set:
                ts = str(ts_id).strip()
                if ts and ts not in timeslot_ids:
                    errors.append(
                        _err(
                            "unknown_timeslot",
                            f"LockedAssignments for section '{section_id}' references unknown timeslot '{ts}'.",
                            sheet="LockedAssignments",
                            row_id=section_id or None,
                            field="fixed_timeslot_set",
                        )
                    )

    for lock in soft_locks:
        section_id = str(lock.get("section_id", "")).strip()
        if section_id and section_id not in section_ids:
            errors.append(
                _err(
                    "unknown_section",
                    f"SoftLocks references unknown section '{section_id}'.",
                    sheet="SoftLocks",
                    row_id=section_id,
                    field="section_id",
                )
            )
        preferred_room = lock.get("preferred_room")
        section = sections_by_id.get(section_id)
        if section and is_online_section(section):
            if preferred_room and str(preferred_room).strip() not in ("", ONLINE_ROOM_SENTINEL):
                errors.append(
                    _err(
                        "online_preferred_room",
                        f"SoftLocks for online section '{section_id}' must not set preferred_room.",
                        sheet="SoftLocks",
                        row_id=section_id or None,
                        field="preferred_room",
                    )
                )
        elif preferred_room and str(preferred_room).strip() == ONLINE_ROOM_SENTINEL:
            errors.append(
                _err(
                    "invalid_preferred_room",
                    f"SoftLocks for section '{section_id}' cannot use the online sentinel as preferred_room.",
                    sheet="SoftLocks",
                    row_id=section_id or None,
                    field="preferred_room",
                )
            )
        elif preferred_room and str(preferred_room).strip() not in room_ids:
            errors.append(
                _err(
                    "unknown_room",
                    f"SoftLocks for section '{section_id}' references unknown room '{preferred_room}'.",
                    sheet="SoftLocks",
                    row_id=section_id or None,
                    field="preferred_room",
                )
            )

    for blocked in blocked_times:
        instructor_id = blocked.get("instructor_id")
        if instructor_id:
            iid = str(instructor_id).strip()
            if iid and iid not in instructor_ids:
                errors.append(
                    _err(
                        "unknown_instructor",
                        f"BlockedTimes references unknown instructor_id '{iid}'.",
                        sheet="BlockedTimes",
                        row_id=iid,
                        field="instructor_id",
                    )
                )
        for ts_id in blocked.get("timeslot_ids") or []:
            ts = str(ts_id).strip()
            if ts and ts not in timeslot_ids:
                errors.append(
                    _err(
                        "unknown_timeslot",
                        f"BlockedTimes references unknown timeslot '{ts}'.",
                        sheet="BlockedTimes",
                        field="timeslot_ids",
                    )
                )

    return errors

