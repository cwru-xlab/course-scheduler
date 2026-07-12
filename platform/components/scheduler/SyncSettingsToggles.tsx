"use client";

import clsx from "clsx";
import { CloudUpload, RefreshCw } from "lucide-react";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

type SyncSettingsTogglesProps = {
  layout?: "stacked";
  className?: string;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon: typeof CloudUpload;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-slate-200",
        )}
      >
        <span
          className={clsx(
            "inline-block size-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function SyncSettingsToggles({ className }: SyncSettingsTogglesProps) {
  const {
    autoSaveEnabled,
    setAutoSaveEnabled,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
  } = useSchedulingData();

  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-slate-50/80 p-2", className)}>
      <ToggleRow
        label="Auto-save"
        description={
          autoSaveEnabled
            ? "Edits publish to the server automatically after you stop typing."
            : "Edits stay local until you click Save."
        }
        checked={autoSaveEnabled}
        onChange={setAutoSaveEnabled}
        icon={CloudUpload}
      />
      <ToggleRow
        label="Auto-refresh"
        description={
          autoRefreshEnabled
            ? "Updates from other users load automatically when you have no unsaved edits."
            : "You will be prompted when another user saves changes."
        }
        checked={autoRefreshEnabled}
        onChange={setAutoRefreshEnabled}
        icon={RefreshCw}
      />
    </div>
  );
}
