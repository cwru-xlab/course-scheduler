"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@heroui/button";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import { editorInfoLegendClass } from "@/components/scheduler/editors/editorToolbarStyles";

export type IslandTone = "success" | "warn" | "error" | "info" | "neutral";

export type IslandAction = {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: "primary" | "secondary" | "flat" | "warning";
};

export type IslandFlashInput = {
  tone: IslandTone;
  message: string;
  /** Defaults: success 2000, warn/error 4500, else 2500 */
  durationMs?: number;
  action?: IslandAction;
};

export type IslandStickyInput = {
  id: string;
  tone: IslandTone;
  message: ReactNode;
  /** Higher wins when multiple stickies are active. */
  priority?: number;
  action?: IslandAction;
  secondaryAction?: IslandAction;
  icon?: "warn" | "upload" | "refresh" | "loader";
};

type IslandFlashState = IslandFlashInput & { key: number };

type IslandContextValue = {
  flash: (input: IslandFlashInput) => void;
  clearFlash: () => void;
  setSticky: (input: IslandStickyInput) => void;
  clearSticky: (id: string) => void;
  setIdleContent: (content: ReactNode | null) => void;
};

const IslandContext = createContext<IslandContextValue | null>(null);

const ISLAND_COLLAPSED_KEY = "wsom-island-collapsed";

const DEFAULT_FLASH_MS: Record<IslandTone, number> = {
  success: 2000,
  warn: 4500,
  error: 4500,
  info: 2500,
  neutral: 2500,
};

function toneIslandClass(tone: IslandTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200/90 bg-emerald-50/95 text-emerald-900";
    case "warn":
      return "border-amber-200/90 bg-amber-50/95 text-amber-950";
    case "error":
      return "border-rose-200/90 bg-rose-50/95 text-rose-900";
    case "info":
      return "border-sky-200/90 bg-sky-50/95 text-sky-950";
    default:
      return "border-slate-200/80 bg-white/95 text-slate-800";
  }
}

function StickyIcon({ icon }: { icon: IslandStickyInput["icon"] }) {
  if (icon === "upload") {
    return <CloudUpload className="size-3.5 shrink-0 animate-pulse" aria-hidden />;
  }
  if (icon === "refresh") {
    return <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />;
  }
  if (icon === "loader") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />;
  }
  if (icon === "warn") {
    return <AlertTriangle className="size-3.5 shrink-0" aria-hidden />;
  }
  return null;
}

function ActionButton({
  action,
  tone,
  compact = false,
}: {
  action: IslandAction;
  tone: IslandTone;
  compact?: boolean;
}) {
  const color =
    action.variant === "warning"
      ? "warning"
      : action.variant === "primary"
        ? "primary"
        : action.variant === "flat"
          ? "default"
          : tone === "warn"
            ? "warning"
            : tone === "error"
              ? "danger"
              : "primary";

  const useFlat = compact || action.variant === "flat" || action.variant === "secondary";

  return (
    <Button
      size="sm"
      color={color}
      variant={useFlat ? "flat" : "solid"}
      className={clsx(
        "h-7 min-h-7 px-2.5 text-[11px] font-semibold",
        compact &&
          tone === "warn" &&
          "border border-amber-300/80 bg-amber-100/60 text-amber-950 data-[hover=true]:bg-amber-200/70",
      )}
      isLoading={action.isLoading}
      isDisabled={action.isDisabled}
      onPress={action.onPress}
    >
      {action.label}
    </Button>
  );
}

export function useIslandNotify(): IslandContextValue {
  const ctx = useContext(IslandContext);
  if (!ctx) {
    throw new Error("useIslandNotify must be used within StatusBarProvider");
  }
  return ctx;
}

/** @deprecated Prefer useIslandNotify().setIdleContent — kept for calendar idle meta. */
export function useSetStatusBarContent() {
  const ctx = useContext(IslandContext);
  return ctx?.setIdleContent ?? (() => {});
}

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [idleContent, setIdleContentState] = useState<ReactNode>(null);
  const [flash, setFlash] = useState<IslandFlashState | null>(null);
  const [stickies, setStickies] = useState<Record<string, IslandStickyInput>>({});
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashKeyRef = useRef(0);

  const clearFlash = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlash(null);
  }, []);

  const flashFn = useCallback((input: IslandFlashInput) => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    flashKeyRef.current += 1;
    const key = flashKeyRef.current;
    const durationMs = input.durationMs ?? DEFAULT_FLASH_MS[input.tone];
    setFlash({ ...input, key });
    flashTimerRef.current = setTimeout(() => {
      setFlash((prev) => (prev?.key === key ? null : prev));
      flashTimerRef.current = null;
    }, durationMs);
  }, []);

  const setSticky = useCallback((input: IslandStickyInput) => {
    setStickies((prev) => ({ ...prev, [input.id]: input }));
  }, []);

  const clearSticky = useCallback((id: string) => {
    setStickies((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setIdleContent = useCallback((content: ReactNode | null) => {
    setIdleContentState(content);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const value = useMemo<IslandContextValue>(
    () => ({
      flash: flashFn,
      clearFlash,
      setSticky,
      clearSticky,
      setIdleContent,
    }),
    [flashFn, clearFlash, setSticky, clearSticky, setIdleContent],
  );

  const activeSticky = useMemo(() => {
    const list = Object.values(stickies);
    if (list.length === 0) return null;
    return list.reduce((best, item) =>
      (item.priority ?? 0) > (best.priority ?? 0) ? item : best,
    );
  }, [stickies]);

  return (
    <IslandContext.Provider value={value}>
      <GlobalStatusBar
        idleContent={idleContent}
        flash={flash}
        sticky={activeSticky}
        onDismissFlash={clearFlash}
      />
      {children}
    </IslandContext.Provider>
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

function DefaultIdle() {
  const { autoSaveEnabled, autoRefreshEnabled } = useSchedulingData();
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 text-center">
      <div className={clsx(editorInfoLegendClass, "justify-center")}>
        <span className="inline-flex items-center gap-1.5">
          <LegendDot className="bg-emerald-500" />
          Your recent saves
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LegendDot className="bg-blue-500" />
          Server updates
        </span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-slate-600">Auto-save</span>{" "}
        {autoSaveEnabled ? "on" : "off"}
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-medium text-slate-600">Auto-refresh</span>{" "}
        {autoRefreshEnabled ? "on" : "off"}
      </p>
    </div>
  );
}

function readPreferCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(ISLAND_COLLAPSED_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function GlobalStatusBar({
  idleContent,
  flash,
  sticky,
  onDismissFlash,
}: {
  idleContent: ReactNode;
  flash: IslandFlashState | null;
  sticky: IslandStickyInput | null;
  onDismissFlash: () => void;
}) {
  const [preferCollapsed, setPreferCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Sticky briefly expands when it appears, then folds if preferCollapsed.
  const [stickyPeek, setStickyPeek] = useState(false);
  const stickyPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStickyIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPreferCollapsed(readPreferCollapsed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const stickyId = sticky?.id ?? null;
    if (stickyId && stickyId !== prevStickyIdRef.current) {
      setStickyPeek(true);
      if (stickyPeekTimerRef.current) clearTimeout(stickyPeekTimerRef.current);
      stickyPeekTimerRef.current = setTimeout(() => {
        setStickyPeek(false);
        stickyPeekTimerRef.current = null;
      }, 3500);
    }
    if (!stickyId) {
      setStickyPeek(false);
      if (stickyPeekTimerRef.current) {
        clearTimeout(stickyPeekTimerRef.current);
        stickyPeekTimerRef.current = null;
      }
    }
    prevStickyIdRef.current = stickyId;
  }, [sticky?.id]);

  useEffect(() => {
    return () => {
      if (stickyPeekTimerRef.current) clearTimeout(stickyPeekTimerRef.current);
    };
  }, []);

  const setCollapsedPreference = useCallback((collapsed: boolean) => {
    setPreferCollapsed(collapsed);
    try {
      window.localStorage.setItem(ISLAND_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Flash / sticky peek temporarily expand even when the user prefers collapsed.
  const temporarilyOpen = Boolean(flash) || stickyPeek;
  const expanded = !preferCollapsed || temporarilyOpen;

  const mode = flash ? "flash" : sticky && (expanded || stickyPeek) ? "sticky" : "idle";
  const tone: IslandTone = flash
    ? flash.tone
    : sticky && !expanded
      ? sticky.tone
      : mode === "sticky"
        ? sticky!.tone
        : "neutral";

  if (!hydrated) {
    return null;
  }

  const showFlash = mode === "flash" && flash;
  const showSticky = mode === "sticky" && sticky;
  const showIdle = mode === "idle" && expanded;
  const flashHasAction = Boolean(showFlash && flash.action);

  return (
    <div className="pointer-events-none fixed top-16 inset-x-0 z-40 flex justify-center px-4 pt-1.5 sm:px-6 lg:px-8">
      <div
        className={clsx(
          "pointer-events-auto overflow-hidden border shadow-md backdrop-blur-md transition-[background-color,border-color,border-radius,padding,max-width] duration-200 ease-out",
          toneIslandClass(tone),
          expanded
            ? clsx(
                "flex w-fit max-w-[min(720px,94vw)] rounded-2xl px-3.5 py-2 text-xs",
                flashHasAction ? "flex-col items-center gap-2" : "items-center justify-center gap-2",
              )
            : "inline-flex h-7 max-w-none items-center gap-1.5 rounded-full px-2.5",
          showIdle && "flex-col gap-1",
          showSticky && "flex-wrap items-center justify-center",
        )}
      >
        {!expanded ? (
          <button
            type="button"
            className="inline-flex h-full items-center gap-1.5"
            onClick={() => setCollapsedPreference(false)}
            aria-expanded={false}
            aria-label={sticky ? "Expand status — attention needed" : "Expand status"}
          >
            {sticky ? (
              <StickyIcon icon={sticky.icon ?? "warn"} />
            ) : (
              <>
                <LegendDot className="bg-emerald-500" />
                <LegendDot className="bg-blue-500" />
              </>
            )}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </button>
        ) : null}

        {showFlash ? (
          <div
            role="status"
            aria-live="polite"
            className={clsx(
              "relative min-w-0",
              flash!.action
                ? "flex flex-col items-center gap-2 px-6"
                : "flex items-center justify-center gap-2",
            )}
          >
            <span className="min-w-0 text-center text-sm font-medium leading-snug">
              {flash!.message}
            </span>
            {flash!.action ? (
              <div className="flex justify-center">
                <ActionButton action={flash!.action} tone={flash!.tone} compact />
              </div>
            ) : null}
            <button
              type="button"
              className={clsx(
                "shrink-0 rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100",
                flash!.action ? "absolute right-0 top-0" : "",
              )}
              onClick={onDismissFlash}
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        {showSticky ? (
          <>
            <StickyIcon icon={sticky!.icon} />
            <div className="min-w-0 text-center text-sm font-medium leading-snug">
              {sticky!.message}
            </div>
            {sticky!.secondaryAction ? (
              <ActionButton action={sticky!.secondaryAction} tone={sticky!.tone} />
            ) : null}
            {sticky!.action ? (
              <ActionButton action={sticky!.action} tone={sticky!.tone} />
            ) : null}
            <button
              type="button"
              className="shrink-0 rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
              onClick={() => {
                setStickyPeek(false);
                setCollapsedPreference(true);
              }}
              aria-label="Collapse status"
              aria-expanded
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </button>
          </>
        ) : null}

        {showIdle ? (
          <div className="relative flex min-w-0 flex-col items-center gap-1 pr-6">
            {idleContent ?? <DefaultIdle />}
            <button
              type="button"
              className="absolute right-0 top-0 rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
              onClick={() => setCollapsedPreference(true)}
              aria-label="Collapse status"
              aria-expanded
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
