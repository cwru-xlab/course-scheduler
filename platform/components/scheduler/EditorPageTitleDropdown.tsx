"use client";

import Link from "next/link";
import clsx from "clsx";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

type EditorPageTitleDropdownProps = {
  current: "sections" | "instructors" | "rooms" | "timeslots" | "meeting-patterns" | "constraints";
  title: string;
};

const EDITOR_PAGES: Array<{ key: EditorPageTitleDropdownProps["current"]; label: string; href: string }> = [
  { key: "sections", label: "Sections", href: "/editor/sections" },
  { key: "instructors", label: "Instructors", href: "/editor/instructors" },
  { key: "rooms", label: "Rooms", href: "/editor/rooms" },
  { key: "timeslots", label: "Timeslots", href: "/editor/timeslots" },
  { key: "meeting-patterns", label: "Meeting Patterns", href: "/editor/meeting-patterns" },
  { key: "constraints", label: "Constraints", href: "/editor/constraints" },
];

export function EditorPageTitleDropdown({ current, title: _title }: EditorPageTitleDropdownProps) {
  const { confirmLeaveIfUnsaved } = useSchedulingData();

  return (
    <nav
      aria-label="Editor pages"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
    >
      {EDITOR_PAGES.map((page) => {
        const isActive = page.key === current;
        return (
          <Link
            key={page.key}
            href={page.href}
            onClick={(event) => {
              if (isActive) {
                event.preventDefault();
                return;
              }
              if (!confirmLeaveIfUnsaved()) event.preventDefault();
            }}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors",
              isActive
                ? "bg-weatherhead-primary/10 text-weatherhead-primary"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
