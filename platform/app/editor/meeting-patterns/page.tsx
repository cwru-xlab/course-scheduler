"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";

import { MeetingPatternsEditor } from "@/components/scheduler/editors/MeetingPatternsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function MeetingPatternsPage() {
  const { data, isLoading, error, updateField, reloadFromBackend } =
    useSchedulingData();
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const timeslotOptions = useMemo(
    () => data?.timeslots.map((t) => ({ key: t.id, label: `${t.day} ${t.start_time}-${t.end_time}` })) ?? [],
    [data],
  );

  const updateBackend = async () => {
    if (!data) return;
    setUpdateStatus("loading");
    try {
      const response = await fetch("/api/update-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.status === "error") {
        setUpdateStatus("error");
        return;
      }
      await reloadFromBackend();
      setUpdateStatus("success");
    } catch {
      setUpdateStatus("error");
    } finally {
      setTimeout(() => setUpdateStatus("idle"), 3000);
    }
  };

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-slate-500">No data.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Meeting Patterns
          </h1>
          <p className="text-slate-500 mt-1">
            Define allowed days and compatible timeslot sets.
          </p>
        </div>
        <Button
          className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
          onPress={updateBackend}
          isLoading={updateStatus === "loading"}
        >
          Update Backend
        </Button>
      </div>

      <MeetingPatternsEditor
        meetingPatterns={data.meeting_patterns}
        timeslotOptions={timeslotOptions}
        onUpdate={(patterns) => updateField("meeting_patterns", patterns)}
      />
    </div>
  );
}

