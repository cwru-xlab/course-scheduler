import type { EditorColumnSpec } from "./useEditorColumnVisibility";

const allVisible = (specs: Omit<EditorColumnSpec, "defaultVisible">[]): EditorColumnSpec[] =>
  specs.map((s) => ({ ...s, defaultVisible: true }));

export const SECTION_COLUMN_SPECS: EditorColumnSpec[] = [
  { id: "id", label: "ID", defaultVisible: true, weight: 4 },
  { id: "dept", label: "SUBJ", defaultVisible: true, weight: 6 },
  { id: "course", label: "Course", defaultVisible: true, weight: 8 },
  { id: "code", label: "Code", defaultVisible: true, weight: 4 },
  { id: "section_number", label: "Section Number", defaultVisible: true, weight: 6 },
  { id: "state", label: "State", defaultVisible: true, weight: 5 },
  { id: "instructor", label: "Instructor", defaultVisible: true, weight: 14 },
  { id: "enroll", label: "Expected Enrollment", defaultVisible: true, weight: 6 },
  { id: "cap", label: "Cap", defaultVisible: true, weight: 4 },
  { id: "patterns", label: "Patterns", defaultVisible: true, weight: 14 },
  { id: "assigned", label: "Assigned", defaultVisible: true, weight: 10 },
  { id: "room_req", label: "Room Req", defaultVisible: false, weight: 9 },
  { id: "crosslist", label: "Crosslist", defaultVisible: true, weight: 9 },
  { id: "tags", label: "Tags", defaultVisible: false, weight: 6 },
];

export const INSTRUCTOR_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 8 },
  { id: "name", label: "Name", weight: 14 },
  { id: "rank", label: "Rank", weight: 10 },
  { id: "unavailable", label: "Unavailable", weight: 22 },
  { id: "pref_days", label: "Pref. Days", weight: 14 },
  { id: "pref_patterns", label: "Pref. Patterns", weight: 20 },
  { id: "max_days", label: "Max Days", weight: 8 },
]);

export const ROOM_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 8 },
  { id: "building", label: "Building", weight: 18 },
  { id: "room_number", label: "Room #", weight: 12 },
  { id: "capacity", label: "Capacity", weight: 10 },
  { id: "features", label: "Features", weight: 38 },
]);

export const TIMESLOT_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 10 },
  { id: "days", label: "Days", weight: 22 },
  { id: "start", label: "Start", weight: 18 },
  { id: "end", label: "End", weight: 18 },
  { id: "block", label: "Block", weight: 14 },
]);

export const CROSSLIST_GROUP_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 12 },
  { id: "members", label: "Member Sections", weight: 58 },
]);

export const NO_OVERLAP_GROUP_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 10 },
  { id: "members", label: "Member Sections", weight: 50 },
  { id: "reason", label: "Reason", weight: 18 },
]);

export const BLOCKED_TIME_COLUMN_SPECS = allVisible([
  { id: "scope", label: "Scope", weight: 10 },
  { id: "days", label: "Days", weight: 16 },
  { id: "start", label: "Start", weight: 10 },
  { id: "end", label: "End", weight: 10 },
  { id: "professor", label: "Professor", weight: 14 },
  { id: "room", label: "Room", weight: 14 },
  { id: "reason", label: "Reason", weight: 14 },
]);


