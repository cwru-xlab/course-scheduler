"use client";

import { useState } from "react";
import { Button } from "@heroui/button";

import { TimeslotsEditor } from "@/components/scheduler/editors/TimeslotsEditor";
import { SolverActionButton } from "@/components/scheduler/SolverActionButton";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function TimeslotsPage() {
  const { data, isLoading, error, updateField, reloadFromBackend } =
    useSchedulingData();
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

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
            Timeslots
          </h1>
          <p className="text-slate-500 mt-1">Define days and time ranges.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
            onPress={updateBackend}
            isLoading={updateStatus === "loading"}
          >
            Update Backend
          </Button>
          <SolverActionButton data={data} />
        </div>
        {updateStatus === "success" && (
          <p className="w-full text-sm text-emerald-600 font-semibold">
            Backend updated successfully. Changes are stored in solver tables.
          </p>
        )}
        {updateStatus === "error" && (
          <p className="w-full text-sm text-red-600 font-semibold">
            Backend update failed. Verify solver service is running on port 5001.
          </p>
        )}
      </div>

      <TimeslotsEditor
        timeslots={data.timeslots}
        onUpdate={(timeslots) => updateField("timeslots", timeslots)}
      />
    </div>
  );
}

