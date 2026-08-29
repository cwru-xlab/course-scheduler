"use client";

import { formatCalendarSectionHoverLines } from "./calendarEvents";

type OrphanSection = {
  id: string;
  department?: string | null;
  course_id: string | number;
  section_code: string;
  section_number?: string;
  instructor_id: string;
  instructorName: string;
};

type OrphanSectionsModalProps = {
  sections: OrphanSection[];
  onKeep: (sectionIds: string[]) => void;
  onRemove: (sectionIds: string[]) => void;
};

export function OrphanSectionsModal({
  sections,
  onKeep,
  onRemove,
}: OrphanSectionsModalProps) {
  if (!sections.length) return null;

  const allIds = sections.map((s) => s.id);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[min(80vh,520px)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orphan-sections-title"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 id="orphan-sections-title" className="text-lg font-black text-slate-900">
            Sections removed from editor
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            These sections still appear on the calendar. Choose whether to keep or remove each
            placement.
          </p>
        </div>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {sections.map((section) => {
            const { title, instructor } = formatCalendarSectionHoverLines(
              section,
              section.instructorName,
            );
            return (
              <li
                key={section.id}
                className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5"
              >
                <div className="text-sm font-bold text-slate-900">{title}</div>
                <div className="text-xs text-slate-500">{instructor}</div>
                <div className="text-[10px] text-slate-400">ID: {section.id}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => onKeep([section.id])}
                  >
                    Keep on calendar
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-100"
                    onClick={() => onRemove([section.id])}
                  >
                    Remove placement
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            onClick={() => onKeep(allIds)}
          >
            Keep all
          </button>
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700"
            onClick={() => onRemove(allIds)}
          >
            Remove all
          </button>
        </div>
      </div>
    </div>
  );
}
