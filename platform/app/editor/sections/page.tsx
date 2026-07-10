"use client";

import { useMemo } from "react";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import { SectionsEditor } from "@/components/scheduler/editors/SectionsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function SectionsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

  const instructorOptions = useMemo(
    () =>
      data?.instructors.map((i) => ({
        key: i.id,
        label: i.name ? `${i.name} (${i.id})` : i.id,
      })) ?? [],
    [data],
  );
  const meetingPatternOptions = useMemo(
    () =>
      data?.meeting_patterns.map((p) => ({
        key: p.id,
        label: `${p.id} (${p.allowed_days.join("/")})`,
      })) ?? [],
    [data],
  );
  const crosslistGroupOptions = useMemo(
    () => data?.crosslist_groups.map((g) => ({ key: g.id, label: g.id })) ?? [],
    [data],
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <EditorPageHeader
        current="sections"
        title="Sections"
        subtitle="Add/edit sections."
        data={data}
      />

      <SectionsEditor
        sections={data.sections}
        instructorOptions={instructorOptions}
        meetingPatternOptions={meetingPatternOptions}
        crosslistGroupOptions={crosslistGroupOptions}
        onUpdate={(sections) => updateField("sections", sections)}
      />
    </div>
  );
}
