"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { MultiSelect } from "../../MultiSelect";
import type {
  BlockedTime,
  CrossListGroup,
  LockedAssignment,
  NoOverlapGroup,
  SoftLock,
} from "@/lib/scheduling/types";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";

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

const BLOCKED_TIME_OPTIONS = (() => {
  const options: { key: string; label: string }[] = [];
  for (
    let minutes = SCHEDULING_WINDOW_START_HOUR * 60;
    minutes <= SCHEDULING_WINDOW_END_HOUR * 60;
    minutes += 5
  ) {
    const h24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hh = h24.toString().padStart(2, "0");
    const mm = mins.toString().padStart(2, "0");
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    options.push({ key: `${hh}:${mm}`, label: `${h12}:${mm} ${suffix}` });
  }
  return options;
})();

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
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
};

type ModalFooterProps = {
  mode?: "create" | "edit";
  onClose: () => void;
  onSave: () => void;
};

function ModalFooter({ mode = "edit", onClose, onSave }: ModalFooterProps) {
  return (
    <>
      <Button variant="flat" onPress={onClose}>
        Cancel
      </Button>
      <Button color="primary" className="font-bold" onPress={onSave}>
        {mode === "create" ? "Add" : "Save changes"}
      </Button>
    </>
  );
}

type CrossListGroupEditModalProps = {
  isOpen: boolean;
  group: CrossListGroup;
  mode?: "create" | "edit";
  sectionOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (group: CrossListGroup) => void;
};

export function CrossListGroupEditModal({
  isOpen,
  group,
  mode = "edit",
  sectionOptions,
  onClose,
  onSave,
}: CrossListGroupEditModalProps) {
  const [draft, setDraft] = useState(group);
  useEffect(() => {
    if (isOpen) setDraft(group);
  }, [isOpen, group]);

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={
        mode === "create" ? "Add cross-list group" : `Edit cross-list group — ${group.id}`
      }
      onClose={onClose}
      footer={
        <ModalFooter
          mode={mode}
          onClose={onClose}
          onSave={() => {
            onSave(draft);
            onClose();
          }}
        />
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Group ID</span>
        <input
          className="rounded-lg border border-slate-200 px-3 py-2"
          value={draft.id}
          onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Member sections</span>
        <MultiSelect
          value={draft.member_section_ids}
          options={sectionOptions}
          onChange={(v) => setDraft((d) => ({ ...d, member_section_ids: v }))}
          placeholder="Select sections"
          showSearch
        />
      </label>
    </EditorModalShell>
  );
}

type NoOverlapGroupEditModalProps = {
  isOpen: boolean;
  group: NoOverlapGroup;
  mode?: "create" | "edit";
  sectionOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (group: NoOverlapGroup) => void;
};

export function NoOverlapGroupEditModal({
  isOpen,
  group,
  mode = "edit",
  sectionOptions,
  onClose,
  onSave,
}: NoOverlapGroupEditModalProps) {
  const [draft, setDraft] = useState(group);
  useEffect(() => {
    if (isOpen) setDraft(group);
  }, [isOpen, group]);

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={
        mode === "create" ? "Add no-overlap group" : `Edit no-overlap group — ${group.id}`
      }
      onClose={onClose}
      footer={
        <ModalFooter
          mode={mode}
          onClose={onClose}
          onSave={() => {
            onSave(draft);
            onClose();
          }}
        />
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Group ID</span>
        <input
          className="rounded-lg border border-slate-200 px-3 py-2"
          value={draft.id}
          onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Member sections</span>
        <MultiSelect
          value={draft.member_section_ids}
          options={sectionOptions}
          onChange={(v) => setDraft((d) => ({ ...d, member_section_ids: v }))}
          placeholder="Select sections"
          showSearch
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Reason</span>
        <input
          className="rounded-lg border border-slate-200 px-3 py-2"
          value={draft.reason}
          onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
        />
      </label>
    </EditorModalShell>
  );
}

type BlockedTimeEditModalProps = {
  isOpen: boolean;
  blocked: BlockedTime;
  mode?: "create" | "edit";
  instructorOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (blocked: BlockedTime) => void;
};

export function BlockedTimeEditModal({
  isOpen,
  blocked,
  mode = "edit",
  instructorOptions,
  roomOptions,
  onClose,
  onSave,
}: BlockedTimeEditModalProps) {
  const [draft, setDraft] = useState(blocked);
  useEffect(() => {
    if (isOpen) setDraft(blocked);
  }, [isOpen, blocked]);

  const instructorOptionsWithNone = [
    { key: "__none__", label: "(Any instructor)" },
    ...instructorOptions,
  ];
  const roomOptionsWithNone = [{ key: "__none__", label: "(Any room)" }, ...roomOptions];

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={mode === "create" ? "Add blocked time" : "Edit blocked time"}
      onClose={onClose}
      footer={
        <ModalFooter
          mode={mode}
          onClose={onClose}
          onSave={() => {
            onSave(draft);
            onClose();
          }}
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Scope</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.scope}
            onChange={(e) => {
              const scope = e.target.value as BlockedTime["scope"];
              setDraft((d) => ({
                ...d,
                scope,
                instructor_id: scope === "instructor" ? d.instructor_id : undefined,
                room_id: scope === "room" ? d.room_id : undefined,
              }));
            }}
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Days</span>
          <MultiSelect
            value={blockedDaysToSelection(draft.days)}
            options={BLOCKED_DAY_OPTIONS}
            onChange={(v) => setDraft((d) => ({ ...d, days: v.join(",") }))}
            placeholder="Select days"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Start</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={normalizeBlockedTimeValue(draft.start_time)}
            onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
          >
            <option value="">Select start</option>
            {BLOCKED_TIME_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">End</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={normalizeBlockedTimeValue(draft.end_time)}
            onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
          >
            <option value="">Select end</option>
            {BLOCKED_TIME_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Professor</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.instructor_id ?? "__none__"}
            disabled={draft.scope !== "instructor"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                instructor_id: e.target.value === "__none__" ? undefined : e.target.value,
              }))
            }
          >
            {instructorOptionsWithNone.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Room</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.room_id ?? "__none__"}
            disabled={draft.scope !== "room"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                room_id: e.target.value === "__none__" ? undefined : e.target.value,
              }))
            }
          >
            {roomOptionsWithNone.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Reason</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.reason}
            onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          />
        </label>
      </div>
    </EditorModalShell>
  );
}

type LockedAssignmentEditModalProps = {
  isOpen: boolean;
  lock: LockedAssignment;
  mode?: "create" | "edit";
  sectionOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (lock: LockedAssignment) => void;
};

export function LockedAssignmentEditModal({
  isOpen,
  lock,
  mode = "edit",
  sectionOptions,
  timeslotOptions,
  roomOptions,
  onClose,
  onSave,
}: LockedAssignmentEditModalProps) {
  const [draft, setDraft] = useState(lock);
  useEffect(() => {
    if (isOpen) setDraft(lock);
  }, [isOpen, lock]);

  const roomOptionsWithNone = [{ key: "__none__", label: "(None)" }, ...roomOptions];

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={
        mode === "create"
          ? "Add locked assignment"
          : `Edit locked assignment — ${lock.section_id || "row"}`
      }
      onClose={onClose}
      footer={
        <ModalFooter
          mode={mode}
          onClose={onClose}
          onSave={() => {
            onSave(draft);
            onClose();
          }}
        />
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Section</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2"
          value={draft.section_id}
          onChange={(e) => setDraft((d) => ({ ...d, section_id: e.target.value }))}
        >
          <option value="">Select section</option>
          {sectionOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Fixed timeslots</span>
        <MultiSelect
          value={draft.fixed_timeslot_set ?? []}
          options={timeslotOptions}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              fixed_timeslot_set: v.length > 0 ? v : undefined,
            }))
          }
          placeholder="Select timeslots"
          showSearch
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">Fixed room</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2"
          value={draft.fixed_room ?? "__none__"}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              fixed_room: e.target.value === "__none__" ? undefined : e.target.value,
            }))
          }
        >
          {roomOptionsWithNone.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </EditorModalShell>
  );
}

type SoftLockEditModalProps = {
  isOpen: boolean;
  lock: SoftLock;
  mode?: "create" | "edit";
  sectionOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  roomOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (lock: SoftLock) => void;
};

export function SoftLockEditModal({
  isOpen,
  lock,
  mode = "edit",
  sectionOptions,
  timeslotOptions,
  roomOptions,
  onClose,
  onSave,
}: SoftLockEditModalProps) {
  const [draft, setDraft] = useState(lock);
  useEffect(() => {
    if (isOpen) setDraft(lock);
  }, [isOpen, lock]);

  const roomOptionsWithNone = [{ key: "__none__", label: "(None)" }, ...roomOptions];

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={
        mode === "create" ? "Add soft lock" : `Edit soft lock — ${lock.section_id || "row"}`
      }
      onClose={onClose}
      footer={
        <ModalFooter
          mode={mode}
          onClose={onClose}
          onSave={() => {
            onSave(draft);
            onClose();
          }}
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Section</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.section_id}
            onChange={(e) => setDraft((d) => ({ ...d, section_id: e.target.value }))}
          >
            <option value="">Select section</option>
            {sectionOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Preferred timeslots</span>
          <MultiSelect
            value={draft.preferred_timeslot_set ?? []}
            options={timeslotOptions}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                preferred_timeslot_set: v.length > 0 ? v : undefined,
              }))
            }
            placeholder="Select timeslots"
            showSearch
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Preferred room</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.preferred_room ?? "__none__"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                preferred_room: e.target.value === "__none__" ? undefined : e.target.value,
              }))
            }
          >
            {roomOptionsWithNone.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Weight</span>
          <input
            type="number"
            min={0}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.weight}
            onChange={(e) =>
              setDraft((d) => ({ ...d, weight: Number(e.target.value) || 0 }))
            }
          />
        </label>
      </div>
    </EditorModalShell>
  );
}
