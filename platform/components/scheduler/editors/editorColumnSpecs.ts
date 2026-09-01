import type { EditorColumnPreset, EditorColumnSpec } from "./useEditorColumnVisibility";

const allVisible = (specs: Omit<EditorColumnSpec, "defaultVisible">[]): EditorColumnSpec[] =>
  specs.map((s) => ({ ...s, defaultVisible: true }));

export const SECTION_COLUMN_SPECS: EditorColumnSpec[] = [
  { id: "id", label: "ID", defaultVisible: true, weight: 4, pinned: "left", minWidthPx: 72 },
  { id: "dept", label: "SUBJ", defaultVisible: true, weight: 6, pinned: "left", minWidthPx: 72 },
  { id: "course", label: "Course", defaultVisible: true, weight: 8, pinned: "left", minWidthPx: 120 },
  { id: "code", label: "Code", defaultVisible: true, weight: 4, pinned: "left", minWidthPx: 64 },
  {
    id: "section_number",
    label: "Section Number",
    defaultVisible: false,
    weight: 6,
    minWidthPx: 88,
  },
  { id: "state", label: "State", defaultVisible: true, weight: 5, minWidthPx: 88 },
  { id: "term", label: "Term", defaultVisible: false, weight: 6, minWidthPx: 100 },
  { id: "instructor", label: "Instructor", defaultVisible: true, weight: 14, minWidthPx: 160 },
  { id: "enroll", label: "Expected Enrollment", defaultVisible: true, weight: 6, minWidthPx: 88 },
  { id: "cap", label: "Cap", defaultVisible: true, weight: 4, minWidthPx: 56 },
  { id: "patterns", label: "Patterns", defaultVisible: false, weight: 14, minWidthPx: 180 },
  { id: "assigned", label: "Assigned", defaultVisible: false, weight: 10, minWidthPx: 140 },
  { id: "room_req", label: "Room Req", defaultVisible: false, weight: 9, minWidthPx: 120 },
  { id: "crosslist", label: "Crosslist", defaultVisible: false, weight: 9, minWidthPx: 120 },
  { id: "tags", label: "Tags", defaultVisible: false, weight: 6, minWidthPx: 100 },
];

/** Sections column picker presets (Essentials matches defaultVisible). */
export const SECTION_COLUMN_PRESETS: EditorColumnPreset[] = [
  {
    id: "essentials",
    label: "Essentials",
    columnIds: ["id", "dept", "course", "code", "state", "instructor", "enroll", "cap"],
  },
  {
    id: "scheduling",
    label: "Scheduling",
    columnIds: [
      "id",
      "dept",
      "course",
      "code",
      "section_number",
      "state",
      "term",
      "instructor",
      "enroll",
      "cap",
      "patterns",
      "assigned",
      "crosslist",
    ],
  },
  {
    id: "all",
    label: "All",
    columnIds: SECTION_COLUMN_SPECS.map((s) => s.id),
  },
];

export const INSTRUCTOR_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 8, pinned: "left", minWidthPx: 88 },
  { id: "name", label: "Name", weight: 14, pinned: "left", minWidthPx: 140 },
  { id: "rank", label: "Rank", weight: 10, minWidthPx: 100 },
  { id: "unavailable", label: "Unavailable", weight: 22, minWidthPx: 180 },
  { id: "pref_days", label: "Pref. Days", weight: 14, minWidthPx: 120 },
  { id: "pref_patterns", label: "Pref. Patterns", weight: 20, minWidthPx: 160 },
  { id: "max_days", label: "Max Days", weight: 8, minWidthPx: 80 },
]);

export const ROOM_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 8, pinned: "left", minWidthPx: 88 },
  { id: "building", label: "Building", weight: 18, pinned: "left", minWidthPx: 140 },
  { id: "room_number", label: "Room #", weight: 12, minWidthPx: 88 },
  { id: "capacity", label: "Capacity", weight: 10, minWidthPx: 88 },
  { id: "features", label: "Features", weight: 38, minWidthPx: 120 },
]);

export const TIMESLOT_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 10, pinned: "left", minWidthPx: 88 },
  { id: "days", label: "Days", weight: 22, minWidthPx: 120 },
  { id: "start", label: "Start", weight: 18, minWidthPx: 88 },
  { id: "end", label: "End", weight: 18, minWidthPx: 88 },
  { id: "block", label: "Block", weight: 14, minWidthPx: 88 },
]);

export const CROSSLIST_GROUP_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 12, pinned: "left", minWidthPx: 100 },
  { id: "members", label: "Member Sections", weight: 58, minWidthPx: 240 },
]);

export const NO_OVERLAP_GROUP_COLUMN_SPECS = allVisible([
  { id: "id", label: "ID", weight: 10, pinned: "left", minWidthPx: 100 },
  { id: "members", label: "Member Sections", weight: 50, minWidthPx: 220 },
  { id: "reason", label: "Reason", weight: 18, minWidthPx: 140 },
]);

export const BLOCKED_TIME_COLUMN_SPECS = allVisible([
  { id: "scope", label: "Scope", weight: 10, pinned: "left", minWidthPx: 88 },
  { id: "days", label: "Days", weight: 16, minWidthPx: 100 },
  { id: "start", label: "Start", weight: 10, minWidthPx: 80 },
  { id: "end", label: "End", weight: 10, minWidthPx: 80 },
  { id: "professor", label: "Professor", weight: 14, minWidthPx: 140 },
  { id: "room", label: "Room", weight: 14, minWidthPx: 120 },
  { id: "reason", label: "Reason", weight: 14, minWidthPx: 120 },
]);
