"use client";

import { useState } from "react";
import { Button } from "@heroui/button";

import { RoomsEditor } from "@/components/scheduler/editors/RoomsEditor";
import { SpreadsheetImportExportButtons } from "@/components/scheduler/SpreadsheetImportExportButtons";
import { SolverActionButton } from "@/components/scheduler/SolverActionButton";
import { EditorPageTitleDropdown } from "@/components/scheduler/EditorPageTitleDropdown";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

export default function RoomsPage() {
  const { data, isLoading, error, updateField, reloadFromBackend } =
    useSchedulingData();
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [updateWarnings, setUpdateWarnings] = useState<string[]>([]);

  const updateBackend = async () => {
    if (!data) return;
    setUpdateStatus("loading");
    setUpdateWarnings([]);
    try {
      const response = await fetch("/api/update-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await response.json()) as {
        status?: string;
        warnings?: string[];
      };
      if (!response.ok || result.status === "error") {
        setUpdateStatus("error");
        return;
      }
      setUpdateWarnings(Array.isArray(result.warnings) ? result.warnings : []);
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
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <EditorPageTitleDropdown current="rooms" title="Rooms" />
          <p className="text-slate-500 mt-1">Add/edit rooms and features.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
            onPress={updateBackend}
            isLoading={updateStatus === "loading"}
          >
            Update Backend
          </Button>
          <SpreadsheetImportExportButtons data={data} />
          <SolverActionButton data={data} />
        </div>
        {updateStatus === "success" && (
          <div className="w-full space-y-2">
            <p className="text-sm text-emerald-600 font-semibold">
              Backend updated successfully. Changes are stored in solver tables.
            </p>
            {updateWarnings.map((warning) => (
              <p key={warning} className="text-sm text-amber-700 font-semibold">
                Warning: {warning}
              </p>
            ))}
          </div>
        )}
        {updateStatus === "error" && (
          <p className="w-full text-sm text-red-600 font-semibold">
            Backend update failed. Verify solver service is running on port 5001.
          </p>
        )}
      </div>

      <RoomsEditor
        rooms={data.rooms}
        onUpdate={(rooms) => updateField("rooms", rooms)}
      />
    </div>
  );
}

