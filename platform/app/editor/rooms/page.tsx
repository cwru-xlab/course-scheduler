"use client";

import { EditorPageHeader } from "@/components/scheduler/EditorPageHeader";
import { RoomsEditor } from "@/components/scheduler/editors/RoomsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function RoomsPage() {
  const { data, isLoading, error, updateField } = useSchedulingData();

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="w-full min-w-0 space-y-6">
      <EditorPageHeader
        current="rooms"
        title="Rooms"
        subtitle="Add/edit rooms and features. Changes auto-save after you stop editing."
        data={data}
      />

      <RoomsEditor
        rooms={data.rooms}
        onUpdate={(rooms) => updateField("rooms", rooms)}
      />
    </div>
  );
}
