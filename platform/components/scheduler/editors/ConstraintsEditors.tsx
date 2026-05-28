"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { CrossListGroup, NoOverlapGroup, BlockedTime, LockedAssignment, SoftLock } from "@/lib/scheduling/types";
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

  const updateGroup = (index: number, field: keyof CrossListGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => onUpdate([...groups, createEmptyCrossListGroup(groups)]);
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => {
        if (!query) return true;
        const searchable = [group.id, ...group.member_section_ids]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [groups, searchQuery]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Cross-List Groups ({groups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search cross-list groups..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Member Sections</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(({ group, index: idx }) => (
              <tr
                key={`${group.id}-${idx}`}
                id={`note-constraints-crosslist-groups-${encodeURIComponent(String(group.id))}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableCell value={group.id} onChange={(v) => updateGroup(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={group.member_section_ids}
                    options={sectionOptions}
                    onChange={(v) => updateGroup(idx, "member_section_ids", v)}
                    placeholder="Select sections"
                  />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="constraints-crosslist-groups"
                    rowId={String(group.id)}
                    title={`Cross-List Group Notes - ${group.id}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteGroup(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No cross-list groups.</div>}
        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-4 text-center text-default-400">No cross-list groups match your search.</div>
        )}
      </CardBody>
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

  const updateGroup = (index: number, field: keyof NoOverlapGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => onUpdate([...groups, createEmptyNoOverlapGroup(groups)]);
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => {
        if (!query) return true;
        const searchable = [group.id, ...group.member_section_ids, group.reason]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [groups, searchQuery]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">No-Overlap Groups ({groups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search no-overlap groups..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Member Sections</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(({ group, index: idx }) => (
              <tr
                key={`${group.id}-${idx}`}
                id={`note-constraints-no-overlap-groups-${encodeURIComponent(String(group.id))}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableCell value={group.id} onChange={(v) => updateGroup(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={group.member_section_ids}
                    options={sectionOptions}
                    onChange={(v) => updateGroup(idx, "member_section_ids", v)}
                    placeholder="Select sections"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={group.reason} onChange={(v) => updateGroup(idx, "reason", v)} placeholder="reason" />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="constraints-no-overlap-groups"
                    rowId={String(group.id)}
                    title={`No-Overlap Group Notes - ${group.id}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteGroup(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No no-overlap groups.</div>}
        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-4 text-center text-default-400">No no-overlap groups match your search.</div>
        )}
      </CardBody>
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

  const updateBlockedTime = (index: number, field: keyof BlockedTime, value: unknown) => {
    const newBlockedTimes = [...blockedTimes];
    newBlockedTimes[index] = { ...newBlockedTimes[index], [field]: value };
    onUpdate(newBlockedTimes);
  };

  const addBlockedTime = () => onUpdate([...blockedTimes, createEmptyBlockedTime()]);
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

  const filteredBlockedTimes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return blockedTimes
      .map((blocked, index) => ({ blocked, index }))
      .filter(({ blocked }) => {
        if (!query) return true;
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
  }, [blockedTimes, searchQuery]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Blocked Times ({blockedTimes.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addBlockedTime}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search blocked times..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Scope</th>
              <th className="pb-2 pr-3">Days</th>
              <th className="pb-2 pr-3">Start</th>
              <th className="pb-2 pr-3">End</th>
              <th className="pb-2 pr-3">Professor</th>
              <th className="pb-2 pr-3">Room</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredBlockedTimes.map(({ blocked, index: idx }) => (
              <tr
                key={idx}
                id={`note-constraints-blocked-times-${encodeURIComponent(`${blocked.scope}-${blocked.reason || "row"}-${idx}`)}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
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
                        instructor_id:
                          nextScope === "instructor" ? current.instructor_id : undefined,
                        room_id: nextScope === "room" ? current.room_id : undefined,
                      };
                      onUpdate(newBlockedTimes);
                    }}
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={blockedDaysToSelection(blocked.days)}
                    options={BLOCKED_DAY_OPTIONS}
                    onChange={(v) => updateBlockedTime(idx, "days", v.join(","))}
                    placeholder="Select days"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={normalizeBlockedTimeValue(blocked.start_time)}
                    options={BLOCKED_TIME_OPTIONS}
                    onChange={(v) => updateBlockedTime(idx, "start_time", v)}
                    placeholder="Select start"
                    isSearchable
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={normalizeBlockedTimeValue(blocked.end_time)}
                    options={BLOCKED_TIME_OPTIONS}
                    onChange={(v) => updateBlockedTime(idx, "end_time", v)}
                    placeholder="Select end"
                    isSearchable
                  />
                </td>
                <td className="py-2 pr-3">
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
                </td>
                <td className="py-2 pr-3">
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
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={blocked.reason} onChange={(v) => updateBlockedTime(idx, "reason", v)} placeholder="reason" />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="constraints-blocked-times"
                    rowId={`${blocked.scope}-${blocked.reason || "row"}-${idx}`}
                    title={`Blocked Time Notes - Row ${idx + 1}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteBlockedTime(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {blockedTimes.length === 0 && <div className="py-4 text-center text-default-400">No blocked times.</div>}
        {blockedTimes.length > 0 && filteredBlockedTimes.length === 0 && (
          <div className="py-4 text-center text-default-400">No blocked times match your search.</div>
        )}
      </CardBody>
    </Card>
  );
};

// Locked Assignments Editor
type LockedAssignmentsEditorProps = {
  lockedAssignments: LockedAssignment[];
  sectionOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onUpdate: (lockedAssignments: LockedAssignment[]) => void;
};

const createEmptyLockedAssignment = (): LockedAssignment => ({
  section_id: "",
  fixed_timeslot_set: [],
  fixed_room: undefined,
});

export const LockedAssignmentsEditor = ({ 
  lockedAssignments, 
  sectionOptions, 
  timeslotOptions, 
  roomOptions, 
  onUpdate 
}: LockedAssignmentsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const updateLock = (index: number, field: keyof LockedAssignment, value: unknown) => {
    const newLocks = [...lockedAssignments];
    newLocks[index] = { ...newLocks[index], [field]: value };
    onUpdate(newLocks);
  };

  const addLock = () => onUpdate([...lockedAssignments, createEmptyLockedAssignment()]);
  const deleteLock = (index: number) => onUpdate(lockedAssignments.filter((_, i) => i !== index));

  const roomOptionsWithNone = [
    { key: "__none__", label: "(None)" },
    ...roomOptions,
  ];

  const filteredLocks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return lockedAssignments
      .map((lock, index) => ({ lock, index }))
      .filter(({ lock }) => {
        if (!query) return true;
        const searchable = [lock.section_id, ...(lock.fixed_timeslot_set ?? []), lock.fixed_room ?? ""]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [lockedAssignments, searchQuery]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Locked Assignments (Hard) ({lockedAssignments.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addLock}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search locked assignments..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Section</th>
              <th className="pb-2 pr-3">Fixed Timeslots</th>
              <th className="pb-2 pr-3">Fixed Room</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLocks.map(({ lock, index: idx }) => (
              <tr
                key={idx}
                id={`note-constraints-locked-assignments-${encodeURIComponent(`${lock.section_id || "row"}-${idx}`)}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={lock.section_id}
                    options={sectionOptions}
                    onChange={(v) => updateLock(idx, "section_id", v)}
                    placeholder="Select section"
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={lock.fixed_timeslot_set ?? []}
                    options={timeslotOptions}
                    onChange={(v) => updateLock(idx, "fixed_timeslot_set", v.length > 0 ? v : undefined)}
                    placeholder="Select timeslots"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={lock.fixed_room ?? "__none__"}
                    options={roomOptionsWithNone}
                    onChange={(v) => updateLock(idx, "fixed_room", v === "__none__" ? undefined : v)}
                    placeholder="Select room"
                  />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="constraints-locked-assignments"
                    rowId={`${lock.section_id || "row"}-${idx}`}
                    title={`Locked Assignment Notes - ${lock.section_id || `Row ${idx + 1}`}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteLock(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lockedAssignments.length === 0 && <div className="py-4 text-center text-default-400">No locked assignments.</div>}
        {lockedAssignments.length > 0 && filteredLocks.length === 0 && (
          <div className="py-4 text-center text-default-400">No locked assignments match your search.</div>
        )}
      </CardBody>
    </Card>
  );
};

// Soft Locks Editor
type SoftLocksEditorProps = {
  softLocks: SoftLock[];
  sectionOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onUpdate: (softLocks: SoftLock[]) => void;
};

const createEmptySoftLock = (): SoftLock => ({
  section_id: "",
  preferred_timeslot_set: [],
  preferred_room: undefined,
  weight: 50,
});

export const SoftLocksEditor = ({ 
  softLocks, 
  sectionOptions, 
  timeslotOptions, 
  roomOptions, 
  onUpdate 
}: SoftLocksEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const updateLock = (index: number, field: keyof SoftLock, value: unknown) => {
    const newLocks = [...softLocks];
    newLocks[index] = { ...newLocks[index], [field]: value };
    onUpdate(newLocks);
  };

  const addLock = () => onUpdate([...softLocks, createEmptySoftLock()]);
  const deleteLock = (index: number) => onUpdate(softLocks.filter((_, i) => i !== index));

  const roomOptionsWithNone = [
    { key: "__none__", label: "(None)" },
    ...roomOptions,
  ];

  const filteredLocks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return softLocks
      .map((lock, index) => ({ lock, index }))
      .filter(({ lock }) => {
        if (!query) return true;
        const searchable = [
          lock.section_id,
          ...(lock.preferred_timeslot_set ?? []),
          lock.preferred_room ?? "",
          lock.weight,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [searchQuery, softLocks]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Soft Locks (Preferences) ({softLocks.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addLock}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search soft locks..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Section</th>
              <th className="pb-2 pr-3">Preferred Timeslots</th>
              <th className="pb-2 pr-3">Preferred Room</th>
              <th className="pb-2 pr-3">Weight</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLocks.map(({ lock, index: idx }) => (
              <tr
                key={idx}
                id={`note-constraints-soft-locks-${encodeURIComponent(`${lock.section_id || "row"}-${idx}`)}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={lock.section_id}
                    options={sectionOptions}
                    onChange={(v) => updateLock(idx, "section_id", v)}
                    placeholder="Select section"
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={lock.preferred_timeslot_set ?? []}
                    options={timeslotOptions}
                    onChange={(v) => updateLock(idx, "preferred_timeslot_set", v.length > 0 ? v : undefined)}
                    placeholder="Select timeslots"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={lock.preferred_room ?? "__none__"}
                    options={roomOptionsWithNone}
                    onChange={(v) => updateLock(idx, "preferred_room", v === "__none__" ? undefined : v)}
                    placeholder="Select room"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={lock.weight} onChange={(v) => updateLock(idx, "weight", v)} />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="constraints-soft-locks"
                    rowId={`${lock.section_id || "row"}-${idx}`}
                    title={`Soft Lock Notes - ${lock.section_id || `Row ${idx + 1}`}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteLock(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {softLocks.length === 0 && <div className="py-4 text-center text-default-400">No soft locks.</div>}
        {softLocks.length > 0 && filteredLocks.length === 0 && (
          <div className="py-4 text-center text-default-400">No soft locks match your search.</div>
        )}
      </CardBody>
    </Card>
  );
};
