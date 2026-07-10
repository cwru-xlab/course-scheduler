"use client";

import { useMemo } from "react";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import {
  CrossListGroupsEditor,
  NoOverlapGroupsEditor,
  BlockedTimesEditor,
  LockedAssignmentsEditor,
  SoftLocksEditor,
} from "@/components/scheduler/editors/ConstraintsEditors";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function ConstraintsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

  const sectionOptions = useMemo(
    () =>
      data?.sections.map((s) => ({ key: s.id, label: `${s.id} (${s.course_id})` })) ??
      [],
    [data],
  );
  const timeslotOptions = useMemo(
    () =>
      data?.timeslots.map((t) => ({
        key: t.id,
        label: `${t.day} ${t.start_time}-${t.end_time}`,
      })) ?? [],
    [data],
  );
  const roomOptions = useMemo(
    () =>
      data?.rooms.map((r) => ({
        key: r.id,
        label: `${r.id} (${r.building}, cap: ${r.capacity})`,
      })) ?? [],
    [data],
  );
  const instructorOptions = useMemo(
    () =>
      data?.instructors.map((i) => ({
        key: i.id,
        label: `${i.name || i.id} (${i.rank_type})`,
      })) ?? [],
    [data],
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <EditorPageHeader
        current="constraints"
        title="Constraints"
        subtitle="Cross-lists, no-overlap groups, blocked times, and locks."
        data={data}
      />

      <div className="space-y-6">
        <CrossListGroupsEditor
          groups={data.crosslist_groups}
          sectionOptions={sectionOptions}
          onUpdate={(groups) => updateField("crosslist_groups", groups)}
        />
        <NoOverlapGroupsEditor
          groups={data.no_overlap_groups}
          sectionOptions={sectionOptions}
          onUpdate={(groups) => updateField("no_overlap_groups", groups)}
        />
        <BlockedTimesEditor
          blockedTimes={data.blocked_times}
          instructorOptions={instructorOptions}
          roomOptions={roomOptions}
          onUpdate={(blocked) => updateField("blocked_times", blocked)}
        />
        <LockedAssignmentsEditor
          lockedAssignments={data.locked_assignments}
          sectionOptions={sectionOptions}
          timeslotOptions={timeslotOptions}
          roomOptions={roomOptions}
          onUpdate={(locks) => updateField("locked_assignments", locks)}
        />
        <SoftLocksEditor
          softLocks={data.soft_locks}
          sectionOptions={sectionOptions}
          timeslotOptions={timeslotOptions}
          roomOptions={roomOptions}
          onUpdate={(locks) => updateField("soft_locks", locks)}
        />
      </div>
    </div>
  );
}
