"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorSearchFilterBar } from "./EditorSearchFilterBar";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
import { useStableRowWrappers } from "./useStableRowWrappers";
import {
  applyEditorColumnFilters,
  type EditorColumnFilterDef,
  type EditorFiltersState,
} from "./editorFilters";
import { sortDefsFromFilterDefs } from "./editorSort";
import { TIMESLOT_TIME_OPTIONS } from "./timeslotEditorConstants";
import { EditorRowActions } from "./EditorRowActions";
import { useEditorActions } from "./EditorActionProvider";
import { editorRowKey } from "./editorRowHighlight";
import {
  BlockedTimeEditModal,
  CrossListGroupEditModal,
  NoOverlapGroupEditModal,
} from "./modals/ConstraintEditModals";
import {
  BLOCKED_TIME_COLUMN_SPECS,
  CROSSLIST_GROUP_COLUMN_SPECS,
  NO_OVERLAP_GROUP_COLUMN_SPECS,
} from "./editorColumnSpecs";

import { ReadOnlyIdCell } from "./ReadOnlyIdCell";
import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { CrossListGroup, NoOverlapGroup, BlockedTime } from "@/lib/scheduling/types";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";

// CrossList Groups Editor
type CrossListGroupsEditorProps = {
  groups: CrossListGroup[];
  sectionOptions: { key: string; label: string }[];
  onUpdate: (groups: CrossListGroup[]) => void;
};

const createEmptyCrossListGroup = (existing: CrossListGroup[]): CrossListGroup => ({
  id: nextIntegerId(existing.map((g) => g.id)),
  member_section_ids: [],
});

export const CrossListGroupsEditor = ({ groups, sectionOptions, onUpdate }: CrossListGroupsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("constraints-crosslist-groups", CROSSLIST_GROUP_COLUMN_SPECS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<CrossListGroup | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

  const updateGroup = (index: number, field: keyof CrossListGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => setAddDraft(createEmptyCrossListGroup(groups));
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  type CrossListRow = { group: CrossListGroup; index: number };

  const crossListFilterDefs = useMemo(
    (): EditorColumnFilterDef<CrossListRow>[] => [
      {
        columnId: "id",
        label: "ID",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        getValue: ({ group }) => group.id,
      },
      {
        columnId: "members",
        label: "Member Sections",
        control: { kind: "multiSelect", showSearch: true },
        options: sectionOptions,
        arrayValue: true,
        getValue: ({ group }) => group.member_section_ids,
      },
    ],
    [sectionOptions],
  );

  const crossListSortDefs = useMemo(
    () => sortDefsFromFilterDefs(crossListFilterDefs),
    [crossListFilterDefs],
  );

  const buildCrossListRow = useCallback(
    (group: CrossListGroup, index: number): CrossListRow => ({ group, index }),
    [],
  );
  const pickCrossListBase = useCallback((row: CrossListRow) => row.group, []);
  const crossListRows = useStableRowWrappers(
    groups,
    buildCrossListRow,
    pickCrossListBase,
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rows = crossListRows;
    if (query) {
      rows = rows.filter(({ group }) => {
        const searchable = [group.id, ...group.member_section_ids]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }
    return applyEditorColumnFilters(rows, columnFilters, crossListFilterDefs);
  }, [crossListRows, searchQuery, columnFilters, crossListFilterDefs]);

  const renderCrossListCell = (
    columnId: string,
    { group, index: idx }: { group: CrossListGroup; index: number },
  ) => {
    switch (columnId) {
      case "id":
        return <ReadOnlyIdCell value={group.id} />;
      case "members":
        return (
          <MultiSelect
            value={group.member_section_ids}
            options={sectionOptions}
            onChange={(v) => updateGroup(idx, "member_section_ids", v)}
            placeholder="Select sections"
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Cross-List Groups ({filteredGroups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="w-full min-w-0 overflow-hidden text-sm">
        <EditorSearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search cross-list groups..."
          filterBar={
            <div className="flex flex-wrap items-center gap-2">
              <EditorColumnFilters
                defs={crossListFilterDefs}
                rows={crossListRows}
                filters={columnFilters}
                onChange={setColumnFilters}
              />
              <EditorColumnPicker
                specs={columnVisibility.specs}
                visibleIds={columnVisibility.visibleIds}
                onToggle={columnVisibility.toggleColumn}
                onShowAll={columnVisibility.showAllColumns}
                onHideAll={columnVisibility.hideAllColumns}
              />
            </div>
          }
        />
        <EditorConfigurableTable
          editorKey="constraints-crosslist-groups"
          columnSpecs={CROSSLIST_GROUP_COLUMN_SPECS}
          visibility={columnVisibility}
          rows={filteredGroups}
          sortDefs={crossListSortDefs}
          getRowKey={({ group, index }) => `${group.id}-${index}`}
          getRowId={({ group }) =>
            `note-constraints-crosslist-groups-${encodeURIComponent(String(group.id))}`
          }
          getRowClassName={({ group }) =>
            getRowHighlightClass(
              "border-t border-default-200",
              "constraints-crosslist-groups",
              String(group.id),
            )
          }
          renderCell={renderCrossListCell}
          renderActions={({ group, index: idx }) => (
            <EditorRowActions
              notes={
                <RowNotesButton
                  scope="constraints-crosslist-groups"
                  rowId={String(group.id)}
                  title={`Cross-List Group Notes - ${group.id}`}
                />
              }
              rowLabel={`cross-list group ${group.id}`}
              onEdit={() => setEditIndex(idx)}
              onDelete={() => deleteGroup(idx)}
            />
          )}
        />
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No cross-list groups.</div>}
        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-4 text-center text-default-400">
            No cross-list groups match your search or filters.
          </div>
        )}
      </CardBody>
      {editIndex !== null && groups[editIndex] ? (
        <CrossListGroupEditModal
          isOpen
          group={groups[editIndex]}
          sectionOptions={sectionOptions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...groups];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
      {addDraft ? (
        <CrossListGroupEditModal
          isOpen
          mode="create"
          group={addDraft}
          sectionOptions={sectionOptions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(groups, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("constraints-crosslist-groups", String(created.id)),
              message: `Successfully added cross-list group ${created.id}.`,
            });
          }}
        />
      ) : null}
    </Card>
  );
};

// No-Overlap Groups Editor
type NoOverlapGroupsEditorProps = {
  groups: NoOverlapGroup[];
  sectionOptions: { key: string; label: string }[];
  onUpdate: (groups: NoOverlapGroup[]) => void;
};

const createEmptyNoOverlapGroup = (existing: NoOverlapGroup[]): NoOverlapGroup => ({
  id: nextIntegerId(existing.map((g) => g.id)),
  member_section_ids: [],
  reason: "",
});

export const NoOverlapGroupsEditor = ({ groups, sectionOptions, onUpdate }: NoOverlapGroupsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("constraints-no-overlap-groups", NO_OVERLAP_GROUP_COLUMN_SPECS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<NoOverlapGroup | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

  const updateGroup = (index: number, field: keyof NoOverlapGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => setAddDraft(createEmptyNoOverlapGroup(groups));
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  type NoOverlapRow = { group: NoOverlapGroup; index: number };

  const noOverlapFilterDefs = useMemo(
    (): EditorColumnFilterDef<NoOverlapRow>[] => [
      {
        columnId: "id",
        label: "ID",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        getValue: ({ group }) => group.id,
      },
      {
        columnId: "members",
        label: "Member Sections",
        control: { kind: "multiSelect", showSearch: true },
        options: sectionOptions,
        arrayValue: true,
        getValue: ({ group }) => group.member_section_ids,
      },
      {
        columnId: "reason",
        label: "Reason",
        control: { kind: "multiSearch", textMatch: "contains" },
        getValue: ({ group }) => group.reason,
      },
    ],
    [sectionOptions],
  );

  const noOverlapSortDefs = useMemo(
    () => sortDefsFromFilterDefs(noOverlapFilterDefs),
    [noOverlapFilterDefs],
  );

  const buildNoOverlapRow = useCallback(
    (group: NoOverlapGroup, index: number): NoOverlapRow => ({ group, index }),
    [],
  );
  const pickNoOverlapBase = useCallback((row: NoOverlapRow) => row.group, []);
  const noOverlapRows = useStableRowWrappers(
    groups,
    buildNoOverlapRow,
    pickNoOverlapBase,
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rows = noOverlapRows;
    if (query) {
      rows = rows.filter(({ group }) => {
        const searchable = [group.id, ...group.member_section_ids, group.reason]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }
    return applyEditorColumnFilters(rows, columnFilters, noOverlapFilterDefs);
  }, [noOverlapRows, searchQuery, columnFilters, noOverlapFilterDefs]);

  const renderNoOverlapCell = (
    columnId: string,
    { group, index: idx }: { group: NoOverlapGroup; index: number },
  ) => {
    switch (columnId) {
      case "id":
        return <ReadOnlyIdCell value={group.id} />;
      case "members":
        return (
          <MultiSelect
            value={group.member_section_ids}
            options={sectionOptions}
            onChange={(v) => updateGroup(idx, "member_section_ids", v)}
            placeholder="Select sections"
          />
        );
      case "reason":
        return (
          <EditableCell
            value={group.reason}
            onChange={(v) => updateGroup(idx, "reason", v)}
            placeholder="reason"
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">No-Overlap Groups ({filteredGroups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="w-full min-w-0 overflow-hidden text-sm">
        <EditorSearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search no-overlap groups..."
          filterBar={
            <div className="flex flex-wrap items-center gap-2">
              <EditorColumnFilters
                defs={noOverlapFilterDefs}
                rows={noOverlapRows}
                filters={columnFilters}
                onChange={setColumnFilters}
              />
              <EditorColumnPicker
                specs={columnVisibility.specs}
                visibleIds={columnVisibility.visibleIds}
                onToggle={columnVisibility.toggleColumn}
                onShowAll={columnVisibility.showAllColumns}
                onHideAll={columnVisibility.hideAllColumns}
              />
            </div>
          }
        />
        <EditorConfigurableTable
          editorKey="constraints-no-overlap-groups"
          columnSpecs={NO_OVERLAP_GROUP_COLUMN_SPECS}
          visibility={columnVisibility}
          rows={filteredGroups}
          sortDefs={noOverlapSortDefs}
          getRowKey={({ group, index }) => `${group.id}-${index}`}
          getRowId={({ group }) =>
            `note-constraints-no-overlap-groups-${encodeURIComponent(String(group.id))}`
          }
          getRowClassName={({ group }) =>
            getRowHighlightClass(
              "border-t border-default-200",
              "constraints-no-overlap-groups",
              String(group.id),
            )
          }
          renderCell={renderNoOverlapCell}
          renderActions={({ group, index: idx }) => (
            <EditorRowActions
              notes={
                <RowNotesButton
                  scope="constraints-no-overlap-groups"
                  rowId={String(group.id)}
                  title={`No-Overlap Group Notes - ${group.id}`}
                />
              }
              rowLabel={`no-overlap group ${group.id}`}
              onEdit={() => setEditIndex(idx)}
              onDelete={() => deleteGroup(idx)}
            />
          )}
        />
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No no-overlap groups.</div>}
        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-4 text-center text-default-400">
            No no-overlap groups match your search or filters.
          </div>
        )}
      </CardBody>
      {editIndex !== null && groups[editIndex] ? (
        <NoOverlapGroupEditModal
          isOpen
          group={groups[editIndex]}
          sectionOptions={sectionOptions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...groups];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
      {addDraft ? (
        <NoOverlapGroupEditModal
          isOpen
          mode="create"
          group={addDraft}
          sectionOptions={sectionOptions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(groups, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("constraints-no-overlap-groups", String(created.id)),
              message: `Successfully added no-overlap group ${created.id}.`,
            });
          }}
        />
      ) : null}
    </Card>
  );
};

// Blocked Times Editor
type BlockedTimesEditorProps = {
  blockedTimes: BlockedTime[];
  instructorOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onUpdate: (blockedTimes: BlockedTime[]) => void;
};

const SCOPE_OPTIONS = [
  { key: "global", label: "Global" },
  { key: "instructor", label: "Instructor" },
  { key: "room", label: "Room" },
  { key: "program", label: "Program" },
];

const BLOCKED_DAY_OPTIONS = [
  { key: "Monday", label: "Monday" },
  { key: "Tuesday", label: "Tuesday" },
  { key: "Wednesday", label: "Wednesday" },
  { key: "Thursday", label: "Thursday" },
  { key: "Friday", label: "Friday" },
];

const BLOCKED_TIME_MIN_HOUR = SCHEDULING_WINDOW_START_HOUR;
const BLOCKED_TIME_MAX_HOUR = SCHEDULING_WINDOW_END_HOUR;

const BLOCKED_TIME_OPTIONS = (() => {
  const options: { key: string; label: string }[] = [];
  for (
    let minutes = BLOCKED_TIME_MIN_HOUR * 60;
    minutes <= BLOCKED_TIME_MAX_HOUR * 60;
    minutes += 5
  ) {
    const h24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hh = h24.toString().padStart(2, "0");
    const mm = mins.toString().padStart(2, "0");
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    options.push({
      key: `${hh}:${mm}`,
      label: `${h12}:${mm} ${suffix}`,
    });
  }
  return options;
})();

const createEmptyBlockedTime = (): BlockedTime => ({
  scope: "global",
  days: "",
  start_time: "",
  end_time: "",
  instructor_id: undefined,
  room_id: undefined,
  reason: "",
});

export const BlockedTimesEditor = ({
  blockedTimes,
  instructorOptions,
  roomOptions,
  onUpdate,
}: BlockedTimesEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("constraints-blocked-times", BLOCKED_TIME_COLUMN_SPECS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<BlockedTime | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

  const updateBlockedTime = (index: number, field: keyof BlockedTime, value: unknown) => {
    const newBlockedTimes = [...blockedTimes];
    newBlockedTimes[index] = { ...newBlockedTimes[index], [field]: value };
    onUpdate(newBlockedTimes);
  };

  const addBlockedTime = () => setAddDraft(createEmptyBlockedTime());
  const deleteBlockedTime = (index: number) => onUpdate(blockedTimes.filter((_, i) => i !== index));
  const instructorOptionsWithNone = [{ key: "__none__", label: "(Any instructor)" }, ...instructorOptions];
  const roomOptionsWithNone = [{ key: "__none__", label: "(Any room)" }, ...roomOptions];

  const blockedDaysToSelection = (days: string | null | undefined): string[] =>
    (days ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

  const normalizeBlockedTimeValue = (value: string | null | undefined): string => {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return "";
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  type BlockedTimeRow = { blocked: BlockedTime; index: number };

  const blockedTimeFilterDefs = useMemo(
    (): EditorColumnFilterDef<BlockedTimeRow>[] => [
      {
        columnId: "scope",
        label: "Scope",
        control: { kind: "multiSelect" },
        options: SCOPE_OPTIONS,
        getValue: ({ blocked }) => blocked.scope,
      },
      {
        columnId: "days",
        label: "Days",
        control: { kind: "multiSelect" },
        options: BLOCKED_DAY_OPTIONS,
        arrayValue: true,
        getValue: ({ blocked }) => blockedDaysToSelection(blocked.days),
      },
      {
        columnId: "start",
        label: "Start",
        control: { kind: "timeCompare" },
        options: TIMESLOT_TIME_OPTIONS,
        getValue: ({ blocked }) => normalizeBlockedTimeValue(blocked.start_time),
      },
      {
        columnId: "end",
        label: "End",
        control: { kind: "timeCompare" },
        options: TIMESLOT_TIME_OPTIONS,
        getValue: ({ blocked }) => normalizeBlockedTimeValue(blocked.end_time),
      },
      {
        columnId: "professor",
        label: "Professor",
        control: { kind: "multiSelect", showSearch: true },
        options: instructorOptionsWithNone,
        getValue: ({ blocked }) => blocked.instructor_id ?? "__none__",
      },
      {
        columnId: "room",
        label: "Room",
        control: { kind: "multiSelect", showSearch: true },
        options: roomOptionsWithNone,
        getValue: ({ blocked }) => blocked.room_id ?? "__none__",
      },
      {
        columnId: "reason",
        label: "Reason",
        control: { kind: "multiSearch", textMatch: "contains" },
        getValue: ({ blocked }) => blocked.reason,
      },
    ],
    [instructorOptions, roomOptions],
  );

  const blockedTimeSortDefs = useMemo(
    () => sortDefsFromFilterDefs(blockedTimeFilterDefs),
    [blockedTimeFilterDefs],
  );

  const buildBlockedTimeRow = useCallback(
    (blocked: BlockedTime, index: number): BlockedTimeRow => ({ blocked, index }),
    [],
  );
  const pickBlockedTimeBase = useCallback((row: BlockedTimeRow) => row.blocked, []);
  const blockedTimeRows = useStableRowWrappers(
    blockedTimes,
    buildBlockedTimeRow,
    pickBlockedTimeBase,
  );

  const filteredBlockedTimes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rows = blockedTimeRows;
    if (query) {
      rows = rows.filter(({ blocked }) => {
        const searchable = [
          blocked.scope,
          blocked.days,
          blocked.start_time,
          blocked.end_time,
          blocked.instructor_id ?? "",
          blocked.room_id ?? "",
          ...(blocked.timeslot_ids ?? []),
          blocked.reason,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }
    return applyEditorColumnFilters(rows, columnFilters, blockedTimeFilterDefs);
  }, [blockedTimeRows, searchQuery, columnFilters, blockedTimeFilterDefs]);

  const renderBlockedTimeCell = (
    columnId: string,
    { blocked, index: idx }: { blocked: BlockedTime; index: number },
  ) => {
    switch (columnId) {
      case "scope":
        return (
          <EditableSelectCell
            value={blocked.scope}
            options={SCOPE_OPTIONS}
            onChange={(v) => {
              const nextScope = v as BlockedTime["scope"];
              const newBlockedTimes = [...blockedTimes];
              const current = newBlockedTimes[idx];
              if (!current) return;
              newBlockedTimes[idx] = {
                ...current,
                scope: nextScope,
                instructor_id: nextScope === "instructor" ? current.instructor_id : undefined,
                room_id: nextScope === "room" ? current.room_id : undefined,
              };
              onUpdate(newBlockedTimes);
            }}
          />
        );
      case "days":
        return (
          <MultiSelect
            value={blockedDaysToSelection(blocked.days)}
            options={BLOCKED_DAY_OPTIONS}
            onChange={(v) => updateBlockedTime(idx, "days", v.join(","))}
            placeholder="Select days"
          />
        );
      case "start":
        return (
          <EditableSelectCell
            value={normalizeBlockedTimeValue(blocked.start_time)}
            options={BLOCKED_TIME_OPTIONS}
            onChange={(v) => updateBlockedTime(idx, "start_time", v)}
            placeholder="Select start"
            isSearchable
          />
        );
      case "end":
        return (
          <EditableSelectCell
            value={normalizeBlockedTimeValue(blocked.end_time)}
            options={BLOCKED_TIME_OPTIONS}
            onChange={(v) => updateBlockedTime(idx, "end_time", v)}
            placeholder="Select end"
            isSearchable
          />
        );
      case "professor":
        return (
          <EditableSelectCell
            value={blocked.instructor_id ?? "__none__"}
            options={instructorOptionsWithNone}
            onChange={(v) =>
              updateBlockedTime(
                idx,
                "instructor_id",
                blocked.scope === "instructor" && v !== "__none__" ? v : undefined,
              )
            }
            placeholder={blocked.scope === "instructor" ? "Select professor" : "N/A"}
            isDisabled={blocked.scope !== "instructor"}
            isSearchable
          />
        );
      case "room":
        return (
          <EditableSelectCell
            value={blocked.room_id ?? "__none__"}
            options={roomOptionsWithNone}
            onChange={(v) =>
              updateBlockedTime(
                idx,
                "room_id",
                blocked.scope === "room" && v !== "__none__" ? v : undefined,
              )
            }
            placeholder={blocked.scope === "room" ? "Select room" : "N/A"}
            isDisabled={blocked.scope !== "room"}
            isSearchable
          />
        );
      case "reason":
        return (
          <EditableCell
            value={blocked.reason}
            onChange={(v) => updateBlockedTime(idx, "reason", v)}
            placeholder="reason"
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Blocked Times ({filteredBlockedTimes.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addBlockedTime}>+ Add</Button>
      </CardHeader>
      <CardBody className="w-full min-w-0 overflow-hidden text-sm">
        <EditorSearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search blocked times..."
          filterBar={
            <div className="flex flex-wrap items-center gap-2">
              <EditorColumnFilters
                defs={blockedTimeFilterDefs}
                rows={blockedTimeRows}
                filters={columnFilters}
                onChange={setColumnFilters}
              />
              <EditorColumnPicker
                specs={columnVisibility.specs}
                visibleIds={columnVisibility.visibleIds}
                onToggle={columnVisibility.toggleColumn}
                onShowAll={columnVisibility.showAllColumns}
                onHideAll={columnVisibility.hideAllColumns}
              />
            </div>
          }
        />
        <EditorConfigurableTable
          editorKey="constraints-blocked-times"
          columnSpecs={BLOCKED_TIME_COLUMN_SPECS}
          visibility={columnVisibility}
          rows={filteredBlockedTimes}
          sortDefs={blockedTimeSortDefs}
          getRowKey={(_, index) => String(index)}
          getRowId={({ blocked }, idx) =>
            `note-constraints-blocked-times-${encodeURIComponent(`${blocked.scope}-${blocked.reason || "row"}-${idx}`)}`
          }
          getRowClassName={({ index: rowIndex }) =>
            getRowHighlightClass(
              "border-t border-default-200",
              "constraints-blocked-times",
              String(rowIndex),
            )
          }
          renderCell={renderBlockedTimeCell}
          renderActions={({ blocked }, idx) => (
            <EditorRowActions
              notes={
                <RowNotesButton
                  scope="constraints-blocked-times"
                  rowId={`${blocked.scope}-${blocked.reason || "row"}-${idx}`}
                  title={`Blocked Time Notes - Row ${idx + 1}`}
                />
              }
              rowLabel={`blocked time row ${idx + 1} (${blocked.scope})`}
              onEdit={() => setEditIndex(idx)}
              onDelete={() => deleteBlockedTime(idx)}
            />
          )}
        />
        {blockedTimes.length === 0 && <div className="py-4 text-center text-default-400">No blocked times.</div>}
        {blockedTimes.length > 0 && filteredBlockedTimes.length === 0 && (
          <div className="py-4 text-center text-default-400">
            No blocked times match your search or filters.
          </div>
        )}
      </CardBody>
      {editIndex !== null && blockedTimes[editIndex] ? (
        <BlockedTimeEditModal
          isOpen
          blocked={blockedTimes[editIndex]}
          instructorOptions={instructorOptions}
          roomOptions={roomOptions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...blockedTimes];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
      {addDraft ? (
        <BlockedTimeEditModal
          isOpen
          mode="create"
          blocked={addDraft}
          instructorOptions={instructorOptions}
          roomOptions={roomOptions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            const newIndex = blockedTimes.length;
            onUpdate([...blockedTimes, created]);
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("constraints-blocked-times", String(newIndex)),
              message: "Successfully added blocked time.",
            });
          }}
        />
      ) : null}
    </Card>
  );
};


