from datetime import datetime, time
from typing import Dict, List, Optional

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    BigInteger,
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

# Initialize Flask-SQLAlchemy - this provides db.Model that all models inherit from
db = SQLAlchemy()

# ============================================================================
# ASSOCIATION TABLES
# ============================================================================
# These tables link two models in a many-to-many relationship.
# They only store foreign keys - no other data.
# Example: A course can be core for multiple majors, and a major can have multiple core courses.
# Links courses to majors (for core course requirements)
# Many courses can be core for many majors
course_major_association = Table(
    "course_major",
    db.Model.metadata,  # Links to the database metadata
    Column("course_id", String, ForeignKey("courses.id"), primary_key=True),  # FK to Course
    Column("major_id", String, ForeignKey("majors.id"), primary_key=True),    # FK to Major
)

# Links courses that cannot conflict with each other
# Both columns are FKs to Course (self-referential many-to-many)
course_non_conflict_association = Table(
    "course_non_conflict",
    db.Model.metadata,
    Column("course_id", String, ForeignKey("courses.id"), primary_key=True),
    Column("non_conflict_course_id", String, ForeignKey("courses.id"), primary_key=True),
)


class Course(db.Model):
    """
    Course model representing academic courses.
    
    Key concepts:
    - db.Model: Inherits from Flask-SQLAlchemy's base model class
    - __tablename__: Name of the database table (plural form)
    - Column(): Defines a database column
      * primary_key=True: Unique identifier for the row
      * nullable=False: Field is required (cannot be NULL)
      * default: Default value if not provided
    """
    __tablename__ = "courses"

    # Primary key: unique identifier (String type, not auto-incrementing)
    id = Column(String, primary_key=True)
    title = Column(String(256), nullable=False)  # Max 256 characters, required
    department = Column(String(64), nullable=False)  # Department name, required
    is_core = Column(Boolean, default=False, nullable=False)  # Is this a core course?
    is_new = Column(Boolean, default=False, nullable=False)  # Is this a new course?

    # ========================================================================
    # RELATIONSHIPS
    # ========================================================================
    # Relationships create Python object links (not stored in database).
    # Use these to navigate between related objects.
    # Example: course.sections returns all Section objects for this course
    
    # One-to-many: One course has many sections
    # back_populates: Creates bidirectional relationship (Section.course also exists)
    sections = relationship("Section", back_populates="course")
    
    # Many-to-many: One course can be core for many majors
    # secondary: Uses the association table defined above
    core_majors = relationship(
        "Major",
        secondary=course_major_association,
        back_populates="core_courses",
    )
    
    # Self-referential many-to-many: Courses that cannot conflict
    # primaryjoin/secondaryjoin: Needed because both FKs point to same table
    non_conflict_courses = relationship(
        "Course",
        secondary=course_non_conflict_association,
        primaryjoin="Course.id == course_non_conflict.c.course_id",
        secondaryjoin="Course.id == course_non_conflict.c.non_conflict_course_id",
        backref="conflicts_with",  # Creates reverse relationship automatically
    )

    def to_dict(self):
        """
        Convert model instance to dictionary (for JSON serialization).
        Useful for API responses - converts SQLAlchemy objects to plain Python dicts.
        """
        return {
            "id": self.id,
            "title": self.title,
            "department": self.department,
            "is_core": self.is_core,
            "is_new": self.is_new,
        }


class Major(db.Model):
    """
    Major model representing academic majors/programs.
    
    Many-to-many relationship with Course through course_major_association table.
    """
    __tablename__ = "majors"

    id = Column(String, primary_key=True)
    title = Column(String(128), nullable=False)

    # Many-to-many: One major has many core courses
    core_courses = relationship(
        "Course",
        secondary=course_major_association,  # Uses the association table
        back_populates="core_majors",  # Bidirectional with Course.core_majors
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
        }


class Instructor(db.Model):
    """
    Instructor/Professor model.
    
    One-to-many with Section (one instructor teaches many sections).
    One-to-one with InstructorPreferences (uselist=False means single object, not list).
    """
    __tablename__ = "instructors"

    id = Column(String, primary_key=True)
    name = Column(String(128), nullable=False)
    rank_type = Column(String(32), nullable=False)  # e.g., "Adjunct", "Full-time", etc.

    # One-to-many: One instructor teaches many sections
    sections = relationship("Section", back_populates="instructor")
    
    # One-to-one: Each instructor has one preferences record
    # uselist=False: Returns single object instead of list
    preferences = relationship("InstructorPreferences", back_populates="instructor", uselist=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "rank_type": self.rank_type,
            "preferences": self.preferences.to_dict() if self.preferences else {},
        }


class InstructorPreferences(db.Model):
    """
    Instructor preferences for scheduling.
    
    One-to-one relationship with Instructor (one preferences record per instructor).
    ForeignKey: Links to instructors table, ensures referential integrity.
    unique=True: Ensures each instructor has only one preferences record.
    """
    __tablename__ = "instructor_preferences"

    # Auto-incrementing integer primary key (common pattern for join tables)
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # ForeignKey: Creates a database foreign key constraint
    # unique=True: Ensures one-to-one relationship (one preferences per instructor)
    instructor_id = Column(String, ForeignKey("instructors.id"), nullable=False, unique=True)
    
    # JSON columns: Store Python lists/dicts as JSON strings in database
    # SQLAlchemy automatically serializes/deserializes
    preferred_times = Column(JSON, nullable=False)  # List[str] - preferred timeslot IDs
    preferred_days = Column(JSON, nullable=False)  # List[str] - preferred days
    preferred_patterns = Column(JSON, nullable=False)  # List[str] - preferred meeting patterns
    unavailable_times = Column(JSON, nullable=False)  # List[str] - unavailable timeslot IDs
    max_teaching_days = Column(Integer, nullable=True)  # Max days per week for adjuncts

    # One-to-one relationship back to Instructor
    instructor = relationship("Instructor", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "preferred_times": self.preferred_times or [],
            "preferred_days": self.preferred_days or [],
            "preferred_patterns": self.preferred_patterns or [],
            "unavailable_times": self.unavailable_times or [],
            "max_teaching_days": self.max_teaching_days,
        }


class MajorPreferences(db.Model):
    """
    Non-course-specific preferences at the major/program level.
    """
    __tablename__ = "major_preferences"
    id = Column(Integer, primary_key=True, autoincrement=True)
    major_id = Column(String, ForeignKey("majors.id"), nullable=False, unique=True)
    
    # no core conflicts: If true, core courses for this major cannot be scheduled at the same time
    no_core_conflicts = Column(Boolean, default=False)
    strict_core_scheduling = Column(Boolean, default=True)
    
    # Relationship back to the Major model
    major = relationship("Major", backref=db.backref("preferences", uselist=False))

    def to_dict(self):
        return {
            "major_id": self.major_id,
            "no_core_conflicts": self.no_core_conflicts, #Was not exported in the previous version
            "strict_core_scheduling": self.strict_core_scheduling
        }


class Room(db.Model):
    """
    Room model representing physical classrooms.
    
    One-to-many with Section (one room can host many sections at different times).
    One-to-one with RoomPreferences.
    """
    __tablename__ = "rooms"

    id = Column(String, primary_key=True)
    building = Column(String(64), nullable=False)
    room_number = Column(String(16), nullable=False)
    capacity = Column(Integer, nullable=False)  # Integer: numeric type
    room_type = Column(String(32), nullable=False)  # e.g., "lecture", "seminar", "lab"
    has_av = Column(Boolean, default=False, nullable=False)  # Has audio/visual equipment
    is_accessible = Column(Boolean, default=True, nullable=False)  # Accessibility flag
    features = Column(JSON, nullable=False)  # List[str] - additional features stored as JSON

    # One-to-many: One room can have many sections (at different times)
    sections = relationship("Section", back_populates="room")
    
    # One-to-one: Each room has one preferences record
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
    """
    Room-specific preferences/requirements.
    
    One-to-one with Room (one preferences record per room).
    nullable=True: Field is optional (can be NULL in database).
    """
    __tablename__ = "room_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False, unique=True)
    need_projector = Column(Boolean, default=False, nullable=False)
    need_lab = Column(Boolean, default=False, nullable=False)
    can_be_outside_weatherhead = Column(Boolean, default=False, nullable=False)
    other_requirements = Column(JSON, nullable=True)  # Dict for additional requirements (optional)

    # One-to-one relationship back to Room
    room = relationship("Room", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "need_projector": self.need_projector,
            "need_lab": self.need_lab,
            "can_be_outside_weatherhead": self.can_be_outside_weatherhead,
            "other_requirements": self.other_requirements or {},
        }


class Timeslot(db.Model):
    """
    Timeslot model representing time periods.
    
    One-to-many with Section (one timeslot can have many sections).
    Time type: Stores time-of-day (HH:MM:SS), not datetime.
    """
    __tablename__ = "timeslots"

    id = Column(String, primary_key=True)
    days = Column(String(16), nullable=False)  # e.g., "MWF", "TR", "M"
    start_time = Column(Time, nullable=False)  # Time type: stores time-of-day (HH:MM:SS)
    end_time = Column(Time, nullable=False)    # Time type: stores time-of-day (HH:MM:SS)
    slot_type = Column(String(32), nullable=False)  # e.g., "standard", "evening", "lab"

    # One-to-many: One timeslot can have many sections (different courses)
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
    """
    Meeting pattern model for recurring meeting schedules.
    
    Defines patterns like "MWF 9:00-10:00" or "TR 2:00-3:30".
    Stores complex nested data structures in JSON columns.
    """
    __tablename__ = "meeting_patterns"

    id = Column(String, primary_key=True)
    slots_required = Column(Integer, nullable=False)  # Number of timeslots needed
    allowed_days = Column(JSON, nullable=False)  # List[str] - e.g., ["M", "W", "F"]
    compatible_timeslot_sets = Column(JSON, nullable=False)  # List[List[str]] - nested list of timeslot IDs

    def to_dict(self):
        return {
            "id": self.id,
            "slots_required": self.slots_required,
            "allowed_days": self.allowed_days or [],
            "compatible_timeslot_sets": self.compatible_timeslot_sets or [],
        }


class DepartmentPreferences(db.Model):
    """
    Department-level preferences for scheduling.
    
    One record per department (unique=True ensures this).
    Controls collision rules and virtual class options.
    """
    __tablename__ = "department_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    department = Column(String(64), nullable=False, unique=True)  # One record per department
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
    """
    Section model representing course sections.
    
    Central model - links courses, instructors, rooms, and timeslots.
    Has multiple foreign keys to establish relationships.
    nullable=True: Field is optional (can be NULL).
    """
    __tablename__ = "sections"

    id = Column(String, primary_key=True)
    
    # Foreign keys: Links to other tables
    # ForeignKey("table.column"): Creates database foreign key constraint
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    section_code = Column(String(16), nullable=False)
    section_number = Column(String(16), nullable=False, default="")
    instructor_id = Column(String, ForeignKey("instructors.id"), nullable=False)
    
    # Assigned values (nullable because assignment happens during scheduling)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=True)  # Assigned room
    timeslot_id = Column(String, ForeignKey("timeslots.id"), nullable=True)  # First assigned timeslot (legacy FK)
    timeslot_ids = Column(JSON, nullable=False, default=list)  # List[str] - all meeting timeslot IDs
    
    # Cross-listing: Self-referential foreign key (section can reference another section)
    # remote_side: Needed for self-referential relationships
    crosslisting_id = Column(String, ForeignKey("sections.id"), nullable=True)
    
    # Multi-section cross-listing group
    crosslist_group_id = Column(String, ForeignKey("crosslist_groups.id"), nullable=True)
    
    section_type = Column(String(32), nullable=False)  # e.g., "lecture", "lab", "seminar"
    expected_enrollment = Column(Integer, nullable=False)
    enrollment_cap = Column(Integer, nullable=False)
    is_crosslisted = Column(Boolean, default=False, nullable=False)
    
    # Historical data (optional)
    last_year_time = Column(String, nullable=True)  # Previous year's timeslot reference
    last_year_room = Column(String, nullable=True)  # Previous year's room reference
    previous_meeting_pattern = Column(String, nullable=True)  # Most recent assigned pattern ID
    
    # JSON columns: Store lists/dicts as JSON strings
    allowed_meeting_patterns = Column(JSON, nullable=False)  # List[str] - pattern IDs
    room_requirements = Column(JSON, nullable=False)  # List[str] - required room features
    tags = Column(JSON, nullable=False)  # List[str] - additional tags/metadata
    # Denormalized for scheduling UI / exports (editable independently of Course.department)
    department = Column(String(128), nullable=False, default="")
    # active = schedule & calendar; archived = excluded from solver & calendar
    state = Column(String(16), nullable=False, default="active")
    # full | half_any | first_half | second_half
    semester_length = Column(String(32), nullable=False, default="full")
    # first_half | second_half when semester_length is half_any and resolved
    assigned_half = Column(String(16), nullable=True)

    # ========================================================================
    # RELATIONSHIPS
    # ========================================================================
    # Many-to-one: Many sections belong to one course
    course = relationship("Course", back_populates="sections")
    
    # Many-to-one: Many sections taught by one instructor
    instructor = relationship("Instructor", back_populates="sections")
    
    # Many-to-one: Many sections can use one room (at different times)
    room = relationship("Room", back_populates="sections")
    
    # Many-to-one: Many sections can use one timeslot
    timeslot = relationship("Timeslot", back_populates="sections")
    
    # Self-referential: Section can reference another section (cross-listing)
    # remote_side: Specifies which side is the "many" side
    crosslisting = relationship("Section", remote_side=[id])
    
    # One-to-one: Each section has one preferences record
    preferences = relationship("SectionPreferences", back_populates="section", uselist=False)
    
    # Many-to-one: Many sections can belong to one cross-list group
    crosslist_group = relationship("CrossListGroup", back_populates="sections")

    def to_dict(self):
        return {
            "id": self.id,
            "course_id": self.course_id,
            "section_code": self.section_code,
            "section_number": self.section_number or "",
            "instructor_id": self.instructor_id,
            "room_id": self.room_id,
            "timeslot_id": self.timeslot_id,
            "timeslot_ids": self.timeslot_ids or (
                [self.timeslot_id] if self.timeslot_id else []
            ),
            "crosslisting_id": self.crosslisting_id,
            "crosslist_group_id": self.crosslist_group_id,
            "section_type": self.section_type,
            "expected_enrollment": self.expected_enrollment,
            "enrollment_cap": self.enrollment_cap,
            "is_crosslisted": self.is_crosslisted,
            "last_year_time": self.last_year_time,
            "last_year_room": self.last_year_room,
            "previous_meeting_pattern": self.previous_meeting_pattern,
            "allowed_meeting_patterns": self.allowed_meeting_patterns or [],
            "room_requirements": self.room_requirements or [],
            "tags": self.tags or [],
            "department": self.department or "",
            "state": self.state or "active",
            "semester_length": self.semester_length or "full",
            "assigned_half": self.assigned_half,
        }


class SectionPreferences(db.Model):
    """
    Section-specific preferences (class preferences).
    
    One-to-one with Section (one preferences record per section).
    Text type: For longer text fields (unlike String which has length limit).
    """
    __tablename__ = "section_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False, unique=True)
    
    # JSON columns can store complex data structures
    cannot_collide_with = Column(JSON, nullable=False)  # List[str] - section IDs that cannot conflict
    preferred_time = Column(String, nullable=True)  # Preferred timeslot ID (optional)
    allowed_times = Column(JSON, nullable=True)  # Dict[str, float] - timeslot_id: weight mapping
    allowed_rooms = Column(JSON, nullable=True)  # List[str] - allowed room IDs (or "virtual")
    # Text type: For longer text fields (no length limit like String)
    general_info = Column(Text, nullable=True)  # Additional notes/info (optional)

    # One-to-one relationship back to Section
    section = relationship("Section", back_populates="preferences", uselist=False)

    def to_dict(self):
        return {
            "section_id": self.section_id,
            "cannot_collide_with": self.cannot_collide_with or [],
            "preferred_time": self.preferred_time,
            "allowed_times": self.allowed_times or {},
            "allowed_rooms": self.allowed_rooms or [],
            "general_info": self.general_info,
        }


class CrossListGroup(db.Model):
    """
    Cross-list group for sections that must be scheduled together.
    
    Groups multiple sections that share the same meeting time/room.
    One-to-many with Section (one group has many sections).
    """
    __tablename__ = "crosslist_groups"

    id = Column(String, primary_key=True)
    member_section_ids = Column(JSON, nullable=False)  # List[str] - section IDs in this group

    # One-to-many: One group contains many sections
    sections = relationship("Section", back_populates="crosslist_group")

    def to_dict(self):
        return {
            "id": self.id,
            "member_section_ids": self.member_section_ids or [],
        }


class NoOverlapGroup(db.Model):
    """
    Group of sections that cannot overlap in time.
    
    Constraint group: Ensures sections in this group don't conflict.
    No direct relationship - uses JSON list of section IDs.
    """
    __tablename__ = "no_overlap_groups"

    id = Column(String, primary_key=True)
    member_section_ids = Column(JSON, nullable=False)  # List[str] - section IDs that cannot overlap
    reason = Column(String(256), nullable=False)  # Why these sections cannot overlap

    def to_dict(self):
        return {
            "id": self.id,
            "member_section_ids": self.member_section_ids or [],
            "reason": self.reason,
        }


class BlockedTime(db.Model):
    """
    Blocked time periods that cannot be used.
    
    Defines timeslots that are unavailable (e.g., holidays, maintenance).
    scope: Determines applicability (global, department-specific, room-specific).
    """
    __tablename__ = "blocked_times"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scope = Column(String(32), nullable=False)  # e.g., "global", "department", "room"
    # Legacy support: explicit timeslot IDs can still be supplied.
    timeslot_ids = Column(JSON, nullable=False)  # List[str] - blocked timeslot IDs
    # Preferred shape: block a day/time range and resolve overlapping timeslots.
    days = Column(String(32), nullable=True)  # e.g., "MWF" or "M,W,F"
    start_time = Column(String(16), nullable=True)  # e.g., "10:00"
    end_time = Column(String(16), nullable=True)  # e.g., "10:50"
    instructor_id = Column(String, nullable=True)
    room_id = Column(String, nullable=True)
    reason = Column(Text, nullable=False)  # Why these times are blocked

    def to_dict(self):
        return {
            "scope": self.scope,
            "timeslot_ids": self.timeslot_ids or [],
            "days": self.days,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "instructor_id": self.instructor_id,
            "room_id": self.room_id,
            "reason": self.reason,
        }


class LockedAssignment(db.Model):
    """
    Hard-locked assignments that must be respected.
    
    Defines fixed assignments that cannot be changed by the scheduler.
    backref: Creates reverse relationship automatically (Section.locked_assignments exists).
    """
    __tablename__ = "locked_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    fixed_timeslot_set = Column(JSON, nullable=True)  # Optional[List[str]] - fixed timeslots
    fixed_room = Column(String, ForeignKey("rooms.id"), nullable=True)  # Fixed room (optional)

    # backref: Automatically creates reverse relationship
    # Section.locked_assignments will exist without defining it in Section class
    section = relationship("Section", backref="locked_assignments")
    room = relationship("Room", backref="locked_assignments")

    def to_dict(self):
        return {
            "section_id": self.section_id,
            "fixed_timeslot_set": self.fixed_timeslot_set,
            "fixed_room": self.fixed_room,
        }


class SoftLock(db.Model):
    """
    Soft-locked preferences with weights.
    
    Preferred assignments (not required like LockedAssignment).
    weight: Higher values = stronger preference (used in optimization).
    Float type: For decimal numbers (e.g., 1.5, 2.0).
    """
    __tablename__ = "soft_locks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    preferred_timeslot_set = Column(JSON, nullable=True)  # Optional[List[str]] - preferred timeslots
    preferred_room = Column(String, ForeignKey("rooms.id"), nullable=True)  # Preferred room (optional)
    weight = Column(Float, nullable=False)  # Higher = stronger preference (used in scoring)

    # backref: Creates reverse relationships automatically
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
    """
    Validation error model.
    
    Stores validation errors that occur during scheduling.
    Used for error reporting and debugging.
    """
    __tablename__ = "validation_errors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(64), nullable=False)  # Error code (e.g., "no_feasible_options")
    message = Column(Text, nullable=False)  # Human-readable error message

    def to_dict(self):
        return {
            "code": self.code,
            "message": self.message,
        }


class ScheduleAssignment(db.Model):
    """
    Final schedule assignment result.
    
    Stores the output of the scheduling algorithm.
    One assignment per section, linking section to room and timeslots.
    """
    __tablename__ = "schedule_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    solution_id = Column(Integer, ForeignKey("schedule_solutions.id"), nullable=True)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    meeting_pattern_id = Column(String, ForeignKey("meeting_patterns.id"), nullable=False)
    timeslot_ids = Column(JSON, nullable=False)  # List[str] - assigned timeslot IDs
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)  # Assigned room

    # Relationships to related models
    solution = relationship("ScheduleSolution", back_populates="assignments_rel")
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
    """
    Complete schedule solution.
    
    Contains all assignments for a complete schedule plus metadata.
    DateTime type: Stores full date and time (unlike Time which is just time-of-day).
    default=datetime.utcnow: Automatically sets timestamp when record is created.
    """
    __tablename__ = "schedule_solutions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    total_score = Column(Float, nullable=False)  # Overall quality score (lower is better)
    penalty_breakdown = Column(JSON, nullable=False)  # Dict[str, float] - breakdown of penalties
    explanations = Column(JSON, nullable=False)  # List[str] - human-readable explanations
    created_at = Column(DateTime, default=datetime.utcnow)  # Timestamp of when solution was created

    # One-to-many: One solution contains many assignments
    assignments_rel = relationship("ScheduleAssignment", back_populates="solution")

    def to_dict(self):
        return {
            "assignments": [a.to_dict() for a in self.assignments_rel],
            "total_score": self.total_score,
            "penalty_breakdown": self.penalty_breakdown or {},
            "explanations": self.explanations or [],
        }


class AppAccessUser(db.Model):
    """
    Allowlisted CWRU caseIDs permitted to use the web app.

    access_tier:
      - active: dean's-office users; can manage other active users in-app
      - developer: eng access; seed/SQL only (not creatable from the app UI)
    """

    __tablename__ = "app_access_users"

    network_id = Column(String(64), primary_key=True)
    access_tier = Column(String(16), nullable=False)  # 'active' | 'developer'
    display_name = Column(String(256), nullable=True)
    added_by = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "network_id": self.network_id,
            "access_tier": self.access_tier,
            "display_name": self.display_name,
            "added_by": self.added_by,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }


# ============================================================================
# CROSS-USER SYNC STATE (shared across Vercel / Next.js replicas via solver DB)
# ============================================================================


class SharedScheduleRow(db.Model):
    """Singleton row holding the latest published schedule snapshot for all users."""

    __tablename__ = "shared_schedule_state"

    id = Column(Integer, primary_key=True)  # always 1
    revision = Column(Integer, nullable=False, default=0)
    ran_by = Column(String(256), nullable=True)
    ran_at = Column(BigInteger, nullable=True)  # epoch ms
    snapshot = Column(JSON, nullable=True)

    def to_meta_dict(self):
        return {
            "revision": self.revision or 0,
            "ranBy": self.ran_by,
            "ranAt": self.ran_at,
        }

    def to_full_dict(self):
        return {
            **self.to_meta_dict(),
            "snapshot": self.snapshot,
        }


class ActivityEventRow(db.Model):
    """Recent collaboration activity events (TTL pruned by the API)."""

    __tablename__ = "activity_events"

    id = Column(String(64), primary_key=True)
    network_id = Column(String(64), nullable=False)
    actor_name = Column(String(256), nullable=False)
    kind = Column(String(64), nullable=False)
    message = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        created = self.created_at
        return {
            "id": self.id,
            "networkId": self.network_id,
            "actorName": self.actor_name,
            "kind": self.kind,
            "message": self.message,
            "createdAt": (created.isoformat() + "Z") if created else None,
        }


class SchedulingDataRevisionRow(db.Model):
    """Singleton: who last wrote scheduling input data (for cross-user refresh prompts)."""

    __tablename__ = "scheduling_data_revision"

    id = Column(Integer, primary_key=True)  # always 1
    last_modified_by_network_id = Column(String(64), nullable=False)
    last_modified_by_name = Column(String(256), nullable=False)
    last_modified_at = Column(String(64), nullable=False)  # ISO-8601 string

    def to_dict(self):
        return {
            "lastModifiedByNetworkId": self.last_modified_by_network_id,
            "lastModifiedByName": self.last_modified_by_name,
            "lastModifiedAt": self.last_modified_at,
        }


class SolverSessionLockRow(db.Model):
    """
    Singleton distributed solver busy-lock so multiple Next.js replicas cannot
    start overlapping CP-SAT runs. expires_at allows recovery after crashes.
    """

    __tablename__ = "solver_session_lock"

    id = Column(Integer, primary_key=True)  # always 1
    locked = Column(Boolean, nullable=False, default=False)
    run_id = Column(String(64), nullable=True)
    progress = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="idle")
    started_by = Column(String(256), nullable=True)
    started_by_network_id = Column(String(64), nullable=True)
    started_at = Column(BigInteger, nullable=True)  # epoch ms
    error = Column(Text, nullable=True)
    expires_at = Column(BigInteger, nullable=True)  # epoch ms
    cancel_requested = Column(Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "sessionId": "default",
            "locked": bool(self.locked),
            "runId": self.run_id,
            "progress": int(self.progress or 0),
            "status": self.status or "idle",
            "startedBy": self.started_by,
            "startedByNetworkId": self.started_by_network_id,
            "startedAt": self.started_at,
            "error": self.error,
            "expiresAt": self.expires_at,
            "cancelRequested": bool(self.cancel_requested),
        }
