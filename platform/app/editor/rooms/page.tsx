"use client";

import { useState } from "react";
import { Button } from "@heroui/button";

import { RoomsEditor } from "@/components/scheduler/editors/RoomsEditor";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function RoomsPage() {
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
            Rooms
          </h1>
          <p className="text-slate-500 mt-1">Add/edit rooms and features.</p>
        </div>
        <Button
          className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
          onPress={updateBackend}
          isLoading={updateStatus === "loading"}
        >
          Update Backend
        </Button>
      </div>

      <RoomsEditor
        rooms={data.rooms}
        onUpdate={(rooms) => updateField("rooms", rooms)}
      />
    </div>
  );
}

