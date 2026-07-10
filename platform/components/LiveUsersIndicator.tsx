"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import clsx from "clsx";
import { Users } from "lucide-react";

import { useAuth } from "@/lib/auth-client";

type LiveUser = {
  networkId: string;
  name: string;
  status: "active" | "idle";
};

type ActivityEvent = {
  id: string;
  networkId: string;
  actorName: string;
  message: string;
  createdAt: string;
};

const HEARTBEAT_MS = 20_000;
const POLL_MS = 15_000;

function StatusDot({ status }: { status: LiveUser["status"] }) {
  return (
    <span
      className={clsx(
        "inline-block size-2 shrink-0 rounded-full ring-2 ring-white",
        status === "active" ? "bg-emerald-500" : "bg-amber-400",
      )}
      aria-hidden
    />
  );
}

function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayActivityMessage(event: ActivityEvent, currentNetworkId: string): string {
  if (event.networkId !== currentNetworkId) return event.message;
  const suffix = event.message.startsWith(event.actorName)
    ? event.message.slice(event.actorName.length)
    : event.message;
  return `You${suffix}`;
}

export function LiveUsersIndicator() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<LiveUser[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [open, setOpen] = useState(false);
  const lastActivityAtRef = useRef(Date.now());
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  const sendHeartbeat = useCallback(async (opts?: { leaving?: boolean }) => {
    if (!user) return;
    try {
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastActivityAt: lastActivityAtRef.current,
          tabVisible: typeof document !== "undefined" ? !document.hidden : true,
          leaving: opts?.leaving ?? false,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { users?: LiveUser[] };
      if (Array.isArray(payload.users)) {
        setUsers(payload.users);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/presence", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { users?: LiveUser[] };
      if (Array.isArray(payload.users)) {
        setUsers(payload.users);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  const fetchActivity = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { events?: ActivityEvent[] };
      if (Array.isArray(payload.events)) {
        setActivity(payload.events);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUsers([]);
      setActivity([]);
      return;
    }

    const onActivity = () => touchActivity();
    const events: Array<keyof WindowEventMap> = [
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const onVisibility = () => {
      void sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);

    void sendHeartbeat();
    void fetchActivity();
    const heartbeatId = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_MS);
    const pollId = window.setInterval(() => {
      void fetchUsers();
      void fetchActivity();
    }, POLL_MS);

    const onLeave = () => {
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaving: true }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", onLeave);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      window.clearInterval(heartbeatId);
      window.clearInterval(pollId);
      void sendHeartbeat({ leaving: true });
    };
  }, [fetchActivity, fetchUsers, sendHeartbeat, touchActivity, user]);

  const keepOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  if (loading || !user) return null;

  const count = users.length;

  return (
    <div onMouseEnter={keepOpen} onMouseLeave={scheduleClose}>
      <Popover isOpen={open} onOpenChange={setOpen} placement="bottom-end" showArrow offset={8}>
        <PopoverTrigger>
          <button
            type="button"
            className="relative flex items-center justify-center rounded-lg size-10 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label={`${count} user${count === 1 ? "" : "s"} online`}
          >
            <Users className="size-5" aria-hidden />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-weatherhead-primary px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Live now</p>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="inline-flex items-center gap-1">
                <StatusDot status="active" /> Active
              </span>
              <span className="mx-1.5">·</span>
              <span className="inline-flex items-center gap-1">
                <StatusDot status="idle" /> Idle / tab in background
              </span>
            </p>
          </div>
          <ul className="max-h-40 overflow-y-auto py-2 border-b border-slate-100">
            {count === 0 ? (
              <li className="px-4 py-2 text-xs text-slate-500">No other sessions detected.</li>
            ) : (
              users.map((entry) => (
                <li
                  key={entry.networkId}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-800"
                >
                  <StatusDot status={entry.status} />
                  <span className="truncate font-medium">
                    {entry.name}
                    {entry.networkId === user.networkId ? (
                      <span className="text-slate-400 font-normal"> (you)</span>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Recent activity</p>
            <p className="text-xs text-slate-500 mt-0.5">Last 24 hours</p>
          </div>
          <ul className="max-h-48 overflow-y-auto pb-2">
            {activity.length === 0 ? (
              <li className="px-4 py-2 text-xs text-slate-500">No recent edits yet.</li>
            ) : (
              activity.map((entry) => (
                <li key={entry.id} className="px-4 py-2 text-xs text-slate-700">
                  <span className="block leading-snug">
                    {displayActivityMessage(entry, user.networkId)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {formatActivityTime(entry.createdAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
