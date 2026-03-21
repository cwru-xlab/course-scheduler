"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Rocket } from "lucide-react";

import { SectionsEditor } from "@/components/scheduler/editors/SectionsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function SectionsPage() {
  const { data, isLoading, error, updateField, reloadFromBackend } =
    useSchedulingData();
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const instructorOptions = useMemo(
    () => data?.instructors.map((i) => ({ key: i.id, label: i.id })) ?? [],
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
            Sections
          </h1>
          <p className="text-slate-500 mt-1">
            Add/edit sections, then sync to backend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
            onPress={updateBackend}
            isLoading={updateStatus === "loading"}
          >
            Update Backend
          </Button>
          <Button
            variant="flat"
            className="font-bold"
            startContent={<Rocket className="size-4" />}
          >
            Run Solver
          </Button>
        </div>
      </div>

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

