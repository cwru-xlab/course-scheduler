"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import {
  editorInfoStripClass,
  editorInfoLegendClass,
  editorInfoMetaClass,
} from "@/components/scheduler/editors/editorToolbarStyles";

const StatusBarContext = createContext<{
  override: ReactNode;
  set: (content: ReactNode | null) => void;
}>({ override: null, set: () => {} });

export function useSetStatusBarContent() {
  const { set } = useContext(StatusBarContext);
  return set;
}

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<ReactNode>(null);
  const versionRef = useRef(0);
  const [version, setVersion] = useState(0);

  const set = useCallback((content: ReactNode | null) => {
    setOverride(content);
    versionRef.current += 1;
    setVersion(versionRef.current);
  }, []);

  return (
    <StatusBarContext.Provider value={{ override, set }}>
      {children}
    </StatusBarContext.Provider>
  );
}

function LegendDot({ className }: { className: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      aria-hidden
    />
  );
}

export function GlobalStatusBar() {
  const { autoSaveEnabled, autoRefreshEnabled } = useSchedulingData();
  const { override } = useContext(StatusBarContext);

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 w-fit mx-auto">
      <div className={editorInfoStripClass}>
        {override ?? (
          <>
            <div className={editorInfoLegendClass}>
              <span className="inline-flex items-center gap-1.5">
                <LegendDot className="bg-emerald-500" />
                Your recent saves
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LegendDot className="bg-blue-500" />
                Server updates
              </span>
            </div>
            <p className={editorInfoMetaClass}>
              <span className="font-medium text-slate-600">Auto-save</span>{" "}
              {autoSaveEnabled ? "on" : "off"}
              <span className="mx-2 text-slate-300">·</span>
              <span className="font-medium text-slate-600">Auto-refresh</span>{" "}
              {autoRefreshEnabled ? "on" : "off"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
