"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { EditableCheckbox } from "../EditableCheckbox";

import type { CrossListGroup, NoOverlapGroup, BlockedTime, LockedAssignment, SoftLock } from "@/lib/scheduling/types";

// CrossList Groups Editor
type CrossListGroupsEditorProps = {
  groups: CrossListGroup[];
  onUpdate: (groups: CrossListGroup[]) => void;
};

const createEmptyCrossListGroup = (): CrossListGroup => ({
  id: `CLG-NEW-${Date.now()}`,
  member_section_ids: [],
  require_same_room: true,
});

export const CrossListGroupsEditor = ({ groups, onUpdate }: CrossListGroupsEditorProps) => {
  const updateGroup = (index: number, field: keyof CrossListGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => onUpdate([...groups, createEmptyCrossListGroup()]);
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Cross-List Groups ({groups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Member Sections</th>
              <th className="pb-2 pr-3">Same Room</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, idx) => (
              <tr key={`${group.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={group.id} onChange={(v) => updateGroup(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={group.member_section_ids} onChange={(v) => updateGroup(idx, "member_section_ids", v)} placeholder="section IDs" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCheckbox value={group.require_same_room} onChange={(v) => updateGroup(idx, "require_same_room", v)} />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteGroup(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No cross-list groups.</div>}
      </CardBody>
    </Card>
  );
};

// No-Overlap Groups Editor
type NoOverlapGroupsEditorProps = {
  groups: NoOverlapGroup[];
  onUpdate: (groups: NoOverlapGroup[]) => void;
};

const createEmptyNoOverlapGroup = (): NoOverlapGroup => ({
  id: `NOG-NEW-${Date.now()}`,
  member_section_ids: [],
  reason: "",
});

export const NoOverlapGroupsEditor = ({ groups, onUpdate }: NoOverlapGroupsEditorProps) => {
  const updateGroup = (index: number, field: keyof NoOverlapGroup, value: unknown) => {
    const newGroups = [...groups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    onUpdate(newGroups);
  };

  const addGroup = () => onUpdate([...groups, createEmptyNoOverlapGroup()]);
  const deleteGroup = (index: number) => onUpdate(groups.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">No-Overlap Groups ({groups.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addGroup}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Member Sections</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, idx) => (
              <tr key={`${group.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={group.id} onChange={(v) => updateGroup(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={group.member_section_ids} onChange={(v) => updateGroup(idx, "member_section_ids", v)} placeholder="section IDs" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={group.reason} onChange={(v) => updateGroup(idx, "reason", v)} placeholder="reason" />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteGroup(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="py-4 text-center text-default-400">No no-overlap groups.</div>}
      </CardBody>
    </Card>
  );
};

// Blocked Times Editor
type BlockedTimesEditorProps = {
  blockedTimes: BlockedTime[];
  onUpdate: (blockedTimes: BlockedTime[]) => void;
};

const SCOPE_OPTIONS = [
  { key: "global", label: "Global" },
  { key: "instructor", label: "Instructor" },
  { key: "room", label: "Room" },
  { key: "program", label: "Program" },
];

const createEmptyBlockedTime = (): BlockedTime => ({
  scope: "global",
  timeslot_ids: [],
  reason: "",
});

export const BlockedTimesEditor = ({ blockedTimes, onUpdate }: BlockedTimesEditorProps) => {
  const updateBlockedTime = (index: number, field: keyof BlockedTime, value: unknown) => {
    const newBlockedTimes = [...blockedTimes];
    newBlockedTimes[index] = { ...newBlockedTimes[index], [field]: value };
    onUpdate(newBlockedTimes);
  };

  const addBlockedTime = () => onUpdate([...blockedTimes, createEmptyBlockedTime()]);
  const deleteBlockedTime = (index: number) => onUpdate(blockedTimes.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Blocked Times ({blockedTimes.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addBlockedTime}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Scope</th>
              <th className="pb-2 pr-3">Timeslot IDs</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {blockedTimes.map((blocked, idx) => (
              <tr key={idx} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <select
                    value={blocked.scope}
                    onChange={(e) => updateBlockedTime(idx, "scope", e.target.value)}
                    className="rounded border border-default-200 bg-transparent px-2 py-1 text-sm"
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={blocked.timeslot_ids} onChange={(v) => updateBlockedTime(idx, "timeslot_ids", v)} placeholder="timeslot IDs" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={blocked.reason} onChange={(v) => updateBlockedTime(idx, "reason", v)} placeholder="reason" />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteBlockedTime(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {blockedTimes.length === 0 && <div className="py-4 text-center text-default-400">No blocked times.</div>}
      </CardBody>
    </Card>
  );
};

// Locked Assignments Editor
type LockedAssignmentsEditorProps = {
  lockedAssignments: LockedAssignment[];
  onUpdate: (lockedAssignments: LockedAssignment[]) => void;
};

const createEmptyLockedAssignment = (): LockedAssignment => ({
  section_id: "",
  fixed_timeslot_set: [],
  fixed_room: undefined,
});

export const LockedAssignmentsEditor = ({ lockedAssignments, onUpdate }: LockedAssignmentsEditorProps) => {
  const updateLock = (index: number, field: keyof LockedAssignment, value: unknown) => {
    const newLocks = [...lockedAssignments];
    newLocks[index] = { ...newLocks[index], [field]: value };
    onUpdate(newLocks);
  };

  const addLock = () => onUpdate([...lockedAssignments, createEmptyLockedAssignment()]);
  const deleteLock = (index: number) => onUpdate(lockedAssignments.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Locked Assignments (Hard) ({lockedAssignments.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addLock}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Section ID</th>
              <th className="pb-2 pr-3">Fixed Timeslots</th>
              <th className="pb-2 pr-3">Fixed Room</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {lockedAssignments.map((lock, idx) => (
              <tr key={idx} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={lock.section_id} onChange={(v) => updateLock(idx, "section_id", v)} placeholder="section ID" />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={lock.fixed_timeslot_set ?? []} onChange={(v) => updateLock(idx, "fixed_timeslot_set", v.length > 0 ? v : undefined)} placeholder="timeslot IDs" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={lock.fixed_room ?? ""} onChange={(v) => updateLock(idx, "fixed_room", v || undefined)} placeholder="room ID" />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteLock(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lockedAssignments.length === 0 && <div className="py-4 text-center text-default-400">No locked assignments.</div>}
      </CardBody>
    </Card>
  );
};

// Soft Locks Editor
type SoftLocksEditorProps = {
  softLocks: SoftLock[];
  onUpdate: (softLocks: SoftLock[]) => void;
};

const createEmptySoftLock = (): SoftLock => ({
  section_id: "",
  preferred_timeslot_set: [],
  preferred_room: undefined,
  weight: 50,
});

export const SoftLocksEditor = ({ softLocks, onUpdate }: SoftLocksEditorProps) => {
  const updateLock = (index: number, field: keyof SoftLock, value: unknown) => {
    const newLocks = [...softLocks];
    newLocks[index] = { ...newLocks[index], [field]: value };
    onUpdate(newLocks);
  };

  const addLock = () => onUpdate([...softLocks, createEmptySoftLock()]);
  const deleteLock = (index: number) => onUpdate(softLocks.filter((_, i) => i !== index));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Soft Locks (Preferences) ({softLocks.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addLock}>+ Add</Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">Section ID</th>
              <th className="pb-2 pr-3">Preferred Timeslots</th>
              <th className="pb-2 pr-3">Preferred Room</th>
              <th className="pb-2 pr-3">Weight</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {softLocks.map((lock, idx) => (
              <tr key={idx} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={lock.section_id} onChange={(v) => updateLock(idx, "section_id", v)} placeholder="section ID" />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={lock.preferred_timeslot_set ?? []} onChange={(v) => updateLock(idx, "preferred_timeslot_set", v.length > 0 ? v : undefined)} placeholder="timeslot IDs" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={lock.preferred_room ?? ""} onChange={(v) => updateLock(idx, "preferred_room", v || undefined)} placeholder="room ID" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={lock.weight} onChange={(v) => updateLock(idx, "weight", v)} />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteLock(idx)}>✕</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {softLocks.length === 0 && <div className="py-4 text-center text-default-400">No soft locks.</div>}
      </CardBody>
    </Card>
  );
};
