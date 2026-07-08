"use client";

import { useMemo } from "react";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import { InstructorsEditor } from "@/components/scheduler/editors/InstructorsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function InstructorsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

  const meetingPatternOptions = useMemo(
    () =>
      data?.meeting_patterns.map((p) => ({
        key: p.id,
        label: `${p.id} (${p.allowed_days.join("/")})`,
      })) ?? [],
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

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <EditorPageHeader
        current="instructors"
        title="Instructors"
        subtitle="Add/edit instructors and preferences. Changes auto-save after you stop editing."
        data={data}
      />

      <InstructorsEditor
        instructors={data.instructors}
        meetingPatternOptions={meetingPatternOptions}
        timeslotOptions={timeslotOptions}
        onUpdate={(instructors) => updateField("instructors", instructors)}
      />
    </div>
  );
}
