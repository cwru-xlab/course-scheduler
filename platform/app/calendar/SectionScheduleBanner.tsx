"use client";

import type { TimeslotDto } from "./calendarTypes";
import {
  describeSectionsSchedule,
  type CalendarAssignmentLike,
  type SectionScheduleMember,
  type SectionScheduleRoom,
} from "./sectionScheduleSummary";

type SectionScheduleBannerProps = {
  members: SectionScheduleMember[];
  assignmentsBySection: Record<string, CalendarAssignmentLike | undefined>;
  solverTimeslotIdsBySection: Record<string, string[]>;
  timeslotById: Map<string, TimeslotDto>;
  rooms: SectionScheduleRoom[];
  assignedMeetingPatternId?: string | null;
  className?: string;
  showAssignedPattern?: boolean;
};

export function SectionScheduleBanner({
  members,
  assignmentsBySection,
  solverTimeslotIdsBySection,
  timeslotById,
  rooms,
  assignedMeetingPatternId,
  className,
  showAssignedPattern = true,
}: SectionScheduleBannerProps) {
  const schedule = describeSectionsSchedule({
    members,
    assignmentsBySection,
    solverTimeslotIdsBySection,
    timeslotById,
    rooms,
    assignedMeetingPatternId,
  });

  return (
    <div
      className={
        className ??
        "shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
      }
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Schedule
      </div>
      {!schedule.isScheduled ? (
        <p className="text-slate-500">Not scheduled yet.</p>
      ) : (
        <div className="space-y-1">
          {schedule.dayLabels.length > 0 && (
            <p>
              <span className="font-semibold text-slate-600">Days: </span>
              {schedule.dayLabels.join(", ")}
            </p>
          )}
          <p>
            <span className="font-semibold text-slate-600">Time: </span>
            {schedule.slotLines.join(" · ")}
          </p>
          {schedule.roomLabel && (
            <p>
              <span className="font-semibold text-slate-600">
                {schedule.isOnline ? "Location: " : "Room: "}
              </span>
              {schedule.roomLabel}
            </p>
          )}
        </div>
      )}
      {showAssignedPattern && (
        <p className="mt-2 border-t border-slate-200 pt-2 text-slate-600">
          <span className="font-semibold text-slate-600">Assigned meeting pattern: </span>
          {schedule.assignedMeetingPatternId || "None"}
        </p>
      )}
    </div>
  );
}
