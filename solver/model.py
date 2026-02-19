from datetime import datetime, time
from typing import Dict, List, Optional

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
    Time,
)
from sqlalchemy.orm import relationship

db = SQLAlchemy()

# Association tables for many-to-many relationships
course_major_association = Table(
    "course_major",
    db.Model.metadata,
    Column("course_id", String, ForeignKey("courses.id"), primary_key=True),
    Column("major_id", String, ForeignKey("majors.id"), primary_key=True),
)

course_non_conflict_association = Table(
    "course_non_conflict",
    db.Model.metadata,
    Column("course_id", String, ForeignKey("courses.id"), primary_key=True),
    Column("non_conflict_course_id", String, ForeignKey("courses.id"), primary_key=True),
)


class Course(db.Model):
    """Course model representing academic courses."""
    __tablename__ = "courses"

    id = Column(String, primary_key=True)
    title = Column(String(256), nullable=False)
    department = Column(String(64), nullable=False)
    is_core = Column(Boolean, default=False, nullable=False)
    is_new = Column(Boolean, default=False, nullable=False)

    # Relationships
    sections = relationship("Section", back_populates="course")
    core_majors = relationship(
        "Major",
        secondary=course_major_association,
        back_populates="core_courses",
    )
    non_conflict_courses = relationship(
        "Course",
        secondary=course_non_conflict_association,
        primaryjoin="Course.id == course_non_conflict.c.course_id",
        secondaryjoin="Course.id == course_non_conflict.c.non_conflict_course_id",
        backref="conflicts_with",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "department": self.department,
            "is_core": self.is_core,
            "is_new": self.is_new,
        }


class Major(db.Model):
    """Major model representing academic majors/programs."""
    __tablename__ = "majors"

    id = Column(String, primary_key=True)
    title = Column(String(128), nullable=False)

    # Relationships
    core_courses = relationship(
        "Course",
        secondary=course_major_association,
        back_populates="core_majors",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
        }


class Instructor(db.Model):
    """Instructor/Professor model."""
    __tablename__ = "instructors"

    id = Column(String, primary_key=True)
    name = Column(String(128), nullable=False)
    rank_type = Column(String(32), nullable=False)  # e.g., "Adjunct", "Full-time", etc.

    # Relationships
    sections = relationship("Section", back_populates="instructor")
    preferences = relationship("InstructorPreferences", back_populates="instructor", uselist=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "rank_type": self.rank_type,
            "preferences": self.preferences.to_dict() if self.preferences else {},
        }


class InstructorPreferences(db.Model):
    """Instructor preferences for scheduling."""
    __tablename__ = "instructor_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instructor_id = Column(String, ForeignKey("instructors.id"), nullable=False, unique=True)
    preferred_times = Column(JSON, nullable=False)  # List[str] - preferred timeslot IDs
    preferred_days = Column(JSON, nullable=False)  # List[str] - preferred days
    preferred_patterns = Column(JSON, nullable=False)  # List[str] - preferred meeting patterns
    unavailable_times = Column(JSON, nullable=False)  # List[str] - unavailable timeslot IDs
    max_teaching_days = Column(Integer, nullable=True)  # Max days per week for adjuncts

    # Relationships
    instructor = relationship("Instructor", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "preferred_times": self.preferred_times or [],
            "preferred_days": self.preferred_days or [],
            "preferred_patterns": self.preferred_patterns or [],
            "unavailable_times": self.unavailable_times or [],
            "max_teaching_days": self.max_teaching_days,
        }


class Room(db.Model):
    """Room model representing physical classrooms."""
    __tablename__ = "rooms"

    id = Column(String, primary_key=True)
    building = Column(String(64), nullable=False)
    room_number = Column(String(16), nullable=False)
    capacity = Column(Integer, nullable=False)
    room_type = Column(String(32), nullable=False)  # e.g., "lecture", "seminar", "lab"
    has_av = Column(Boolean, default=False, nullable=False)
    is_accessible = Column(Boolean, default=True, nullable=False)
    features = Column(JSON, nullable=False)  # List[str] - additional features

    # Relationships
    sections = relationship("Section", back_populates="room")
    preferences = relationship("RoomPreferences", back_populates="room", uselist=False)

    def to_dict(self):
        return {
            "id": self.id,
            "building": self.building,
            "room_number": self.room_number,
            "capacity": self.capacity,
            "room_type": self.room_type,
            "has_av": self.has_av,
            "is_accessible": self.is_accessible,
            "features": self.features or [],
        }


class RoomPreferences(db.Model):
    """Room-specific preferences/requirements."""
    __tablename__ = "room_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False, unique=True)
    need_projector = Column(Boolean, default=False, nullable=False)
    need_lab = Column(Boolean, default=False, nullable=False)
    can_be_outside_weatherhead = Column(Boolean, default=False, nullable=False)
    other_requirements = Column(JSON, nullable=True)  # Dict for additional requirements

    # Relationships
    room = relationship("Room", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "need_projector": self.need_projector,
            "need_lab": self.need_lab,
            "can_be_outside_weatherhead": self.can_be_outside_weatherhead,
            "other_requirements": self.other_requirements or {},
        }


class Timeslot(db.Model):
    """Timeslot model representing time periods."""
    __tablename__ = "timeslots"

    id = Column(String, primary_key=True)
    days = Column(String(16), nullable=False)  # e.g., "MWF", "TR", "M"
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    slot_type = Column(String(32), nullable=False)  # e.g., "standard", "evening", "lab"

    # Relationships
    sections = relationship("Section", back_populates="timeslot")

    def to_dict(self):
        return {
            "id": self.id,
            "days": self.days,
            "start_time": self.start_time.strftime("%H:%M") if isinstance(self.start_time, time) else str(self.start_time),
            "end_time": self.end_time.strftime("%H:%M") if isinstance(self.end_time, time) else str(self.end_time),
            "slot_type": self.slot_type,
        }


class MeetingPattern(db.Model):
    """Meeting pattern model for recurring meeting schedules."""
    __tablename__ = "meeting_patterns"

    id = Column(String, primary_key=True)
    slots_required = Column(Integer, nullable=False)
    allowed_days = Column(JSON, nullable=False)  # List[str]
    compatible_timeslot_sets = Column(JSON, nullable=False)  # List[List[str]]

    def to_dict(self):
        return {
            "id": self.id,
            "slots_required": self.slots_required,
            "allowed_days": self.allowed_days or [],
            "compatible_timeslot_sets": self.compatible_timeslot_sets or [],
        }


class DepartmentPreferences(db.Model):
    """Department-level preferences for scheduling."""
    __tablename__ = "department_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    department = Column(String(64), nullable=False, unique=True)
    collide_with_other_departments = Column(Boolean, default=True, nullable=False)
    collide_within_department = Column(Boolean, default=True, nullable=False)
    allow_virtual = Column(Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
            "department": self.department,
            "collide_with_other_departments": self.collide_with_other_departments,
            "collide_within_department": self.collide_within_department,
            "allow_virtual": self.allow_virtual,
        }


class Section(db.Model):
    """Section model representing course sections."""
    __tablename__ = "sections"

    id = Column(String, primary_key=True)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    section_code = Column(String(16), nullable=False)
    instructor_id = Column(String, ForeignKey("instructors.id"), nullable=False)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=True)  # Assigned room
    timeslot_id = Column(String, ForeignKey("timeslots.id"), nullable=True)  # Assigned timeslot
    crosslisting_id = Column(String, ForeignKey("sections.id"), nullable=True)  # Self-referential for cross-listing
    crosslist_group_id = Column(String, ForeignKey("crosslist_groups.id"), nullable=True)  # For multi-section cross-listing
    section_type = Column(String(32), nullable=False)  # e.g., "lecture", "lab", "seminar"
    expected_enrollment = Column(Integer, nullable=False)
    enrollment_cap = Column(Integer, nullable=False)
    is_crosslisted = Column(Boolean, default=False, nullable=False)
    last_year_time = Column(String, nullable=True)  # Previous year's timeslot reference
    last_year_room = Column(String, nullable=True)  # Previous year's room reference
    allowed_meeting_patterns = Column(JSON, nullable=False)  # List[str] - pattern IDs
    room_requirements = Column(JSON, nullable=False)  # List[str] - required room features
    tags = Column(JSON, nullable=False)  # List[str] - additional tags/metadata

    # Relationships
    course = relationship("Course", back_populates="sections")
    instructor = relationship("Instructor", back_populates="sections")
    room = relationship("Room", back_populates="sections")
    timeslot = relationship("Timeslot", back_populates="sections")
    crosslisting = relationship("Section", remote_side=[id])
    preferences = relationship("SectionPreferences", back_populates="section", uselist=False)
    crosslist_group = relationship("CrossListGroup", back_populates="sections")

    def to_dict(self):
        return {
            "id": self.id,
            "course_id": self.course_id,
            "section_code": self.section_code,
            "instructor_id": self.instructor_id,
            "room_id": self.room_id,
            "timeslot_id": self.timeslot_id,
            "crosslisting_id": self.crosslisting_id,
            "crosslist_group_id": self.crosslist_group_id,
            "section_type": self.section_type,
            "expected_enrollment": self.expected_enrollment,
            "enrollment_cap": self.enrollment_cap,
            "is_crosslisted": self.is_crosslisted,
            "last_year_time": self.last_year_time,
            "last_year_room": self.last_year_room,
            "allowed_meeting_patterns": self.allowed_meeting_patterns or [],
            "room_requirements": self.room_requirements or [],
            "tags": self.tags or [],
        }


class SectionPreferences(db.Model):
    """Section-specific preferences (class preferences)."""
    __tablename__ = "section_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False, unique=True)
    cannot_collide_with = Column(JSON, nullable=False)  # List[str] - section IDs that cannot conflict
    preferred_time = Column(String, nullable=True)  # Preferred timeslot ID
    allowed_times = Column(JSON, nullable=True)  # Dict[str, float] - timeslot_id: weight
    allowed_rooms = Column(JSON, nullable=True)  # List[str] - allowed room IDs (or "virtual")
    general_info = Column(Text, nullable=True)  # Additional notes/info

    # Relationships
    section = relationship("Section", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "cannot_collide_with": self.cannot_collide_with or [],
            "preferred_time": self.preferred_time,
            "allowed_times": self.allowed_times or {},
            "allowed_rooms": self.allowed_rooms or [],
            "general_info": self.general_info,
        }


class CrossListGroup(db.Model):
    """Cross-list group for sections that must be scheduled together."""
    __tablename__ = "crosslist_groups"

    id = Column(String, primary_key=True)
    member_section_ids = Column(JSON, nullable=False)  # List[str]
    require_same_room = Column(Boolean, nullable=False, default=False)

    # Relationships
    sections = relationship("Section", back_populates="crosslist_group")

    def to_dict(self):
        return {
            "id": self.id,
            "member_section_ids": self.member_section_ids or [],
            "require_same_room": self.require_same_room,
        }


class NoOverlapGroup(db.Model):
    """Group of sections that cannot overlap in time."""
    __tablename__ = "no_overlap_groups"

    id = Column(String, primary_key=True)
    member_section_ids = Column(JSON, nullable=False)  # List[str]
    reason = Column(String(256), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "member_section_ids": self.member_section_ids or [],
            "reason": self.reason,
        }


class BlockedTime(db.Model):
    """Blocked time periods that cannot be used."""
    __tablename__ = "blocked_times"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scope = Column(String(32), nullable=False)  # e.g., "global", "department", "room"
    timeslot_ids = Column(JSON, nullable=False)  # List[str]
    reason = Column(Text, nullable=False)

    def to_dict(self):
        return {
            "scope": self.scope,
            "timeslot_ids": self.timeslot_ids or [],
            "reason": self.reason,
        }


class LockedAssignment(db.Model):
    """Hard-locked assignments that must be respected."""
    __tablename__ = "locked_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    fixed_timeslot_set = Column(JSON, nullable=True)  # Optional[List[str]]
    fixed_room = Column(String, ForeignKey("rooms.id"), nullable=True)

    # Relationships
    section = relationship("Section", backref="locked_assignments")
    room = relationship("Room", backref="locked_assignments")

    def to_dict(self):
        return {
            "section_id": self.section_id,
            "fixed_timeslot_set": self.fixed_timeslot_set,
            "fixed_room": self.fixed_room,
        }


class SoftLock(db.Model):
    """Soft-locked preferences with weights."""
    __tablename__ = "soft_locks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    preferred_timeslot_set = Column(JSON, nullable=True)  # Optional[List[str]]
    preferred_room = Column(String, ForeignKey("rooms.id"), nullable=True)
    weight = Column(Float, nullable=False)  # Higher = stronger preference

    # Relationships
    section = relationship("Section", backref="soft_locks")
    room = relationship("Room", backref="soft_locks")

    def to_dict(self):
        return {
            "section_id": self.section_id,
            "preferred_timeslot_set": self.preferred_timeslot_set,
            "preferred_room": self.preferred_room,
            "weight": self.weight,
        }


class ValidationError(db.Model):
    """Validation error model."""
    __tablename__ = "validation_errors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(64), nullable=False)
    message = Column(Text, nullable=False)

    def to_dict(self):
        return {
            "code": self.code,
            "message": self.message,
        }


class ScheduleAssignment(db.Model):
    """Final schedule assignment result."""
    __tablename__ = "schedule_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    meeting_pattern_id = Column(String, ForeignKey("meeting_patterns.id"), nullable=False)
    timeslot_ids = Column(JSON, nullable=False)  # List[str]
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)

    # Relationships
    section = relationship("Section", backref="schedule_assignments")
    meeting_pattern = relationship("MeetingPattern", backref="schedule_assignments")
    room = relationship("Room", backref="schedule_assignments")

    def to_dict(self):
        return {
            "section_id": self.section_id,
            "meeting_pattern_id": self.meeting_pattern_id,
            "timeslot_ids": self.timeslot_ids or [],
            "room_id": self.room_id,
        }


class ScheduleSolution(db.Model):
    """Complete schedule solution."""
    __tablename__ = "schedule_solutions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    total_score = Column(Float, nullable=False)
    penalty_breakdown = Column(JSON, nullable=False)  # Dict[str, float]
    explanations = Column(JSON, nullable=False)  # List[str]
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    assignments_rel = relationship("ScheduleAssignment", backref="solution")

    def to_dict(self):
        return {
            "assignments": [a.to_dict() for a in self.assignments_rel],
            "total_score": self.total_score,
            "penalty_breakdown": self.penalty_breakdown or {},
            "explanations": self.explanations or [],
        }
