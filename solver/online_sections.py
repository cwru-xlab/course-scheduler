"""Online section detection and sentinel room ID (section_number 800–899)."""

from __future__ import annotations

from typing import Any

# Never add this ID to the physical rooms table or input_data.rooms.
ONLINE_ROOM_SENTINEL = "__ONLINE__"


def is_online_section(section: dict[str, Any] | Any) -> bool:
    """True when registrar section_number is in 800–899 (matches platform rule)."""
    if not isinstance(section, dict):
        section = section.to_dict() if hasattr(section, "to_dict") else {}
    raw = str(section.get("section_number", "") or "").strip()
    if not raw or not raw.isdigit():
        return False
    number = int(raw)
    return 800 <= number <= 899


def is_solver_online_room_id(room_id: str | None) -> bool:
    return str(room_id or "").strip() == ONLINE_ROOM_SENTINEL
