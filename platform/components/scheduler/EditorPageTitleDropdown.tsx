"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";

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

export function EditorPageTitleDropdown({ current, title }: EditorPageTitleDropdownProps) {
  return (
    <Dropdown placement="bottom-start">
      <DropdownTrigger>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg transition-colors hover:text-weatherhead-primary"
          aria-label="Open editor page selector"
        >
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
          <ChevronDown className="size-5 text-slate-500" />
        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label="Editor pages">
        {EDITOR_PAGES.map((page) => (
          <DropdownItem key={page.key} textValue={page.label}>
            <Link
              href={page.href}
              className={`block w-full ${
                page.key === current ? "font-bold text-weatherhead-primary" : "text-slate-700"
              }`}
            >
              {page.label}
            </Link>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

