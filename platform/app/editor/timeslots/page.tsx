"use client";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import { TimeslotsEditor } from "@/components/scheduler/editors/TimeslotsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function TimeslotsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <EditorPageHeader
        current="timeslots"
        title="Timeslots"
        subtitle="Define days and time ranges."
        data={data}
      />

      <TimeslotsEditor
        timeslots={data.timeslots}
        onUpdate={(timeslots) => updateField("timeslots", timeslots)}
      />
    </div>
  );
}
