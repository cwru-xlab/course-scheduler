"use client";

import clsx from "clsx";
import Link from "next/link";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import { appNavLinkClass, appToolbarShellClass } from "@/lib/ui/appChromeStyles";

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
    <nav aria-label="Editor pages" className={appToolbarShellClass}>
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
            className={`${appNavLinkClass(isActive)} whitespace-nowrap`}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
