"use client";

import { useMemo } from "react";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import { MeetingPatternsEditor } from "@/components/scheduler/editors/MeetingPatternsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function MeetingPatternsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

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
        current="meeting-patterns"
        title="Meeting Patterns"
        subtitle="Define allowed days and compatible timeslot sets. Changes auto-save after you stop editing."
        data={data}
      />

      <MeetingPatternsEditor
        meetingPatterns={data.meeting_patterns}
        timeslotOptions={timeslotOptions}
        onUpdate={(patterns) => updateField("meeting_patterns", patterns)}
      />
    </div>
  );
}
