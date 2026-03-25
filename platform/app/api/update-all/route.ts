import { NextRequest, NextResponse } from "next/server";

import type { SchedulingInput } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SchedulingInput> | null;

    if (!body) {
      return NextResponse.json(
        {
          status: "error",
          errors: [
            {
              code: "invalid_request",
              message: "Request body must include scheduling data.",
            },
          ],
        },
        { status: 400 },
      );
    }

    const {
      sections = [],
      instructors = [],
      rooms = [],
      timeslots = [],
      meeting_patterns = [],
      crosslist_groups = [],
      no_overlap_groups = [],
      blocked_times = [],
      locked_assignments = [],
      soft_locks = [],
    } = body;

    // Helper to call solver endpoints and normalize error responses
    const callSolver = async (path: string, payload: unknown) => {
      const response = await fetch(`${SOLVER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        data = { raw };
      }

      if (!response.ok || data.status === "error") {
        const normalizedErrors = Array.isArray(data?.errors)
          ? data.errors
          : [
              {
                code: "update_failed",
                message:
                  typeof data.raw === "string" && data.raw.length > 0
                    ? `Backend failed during ${path} update. ${data.raw.slice(0, 240)}`
                    : `Backend failed during ${path} update.`,
              },
            ];
        const errors = normalizedErrors.map((err) => {
          const message =
            typeof err?.message === "string"
              ? `[${path}] ${err.message}`
              : `[${path}] Backend update failed.`;
          return {
            code: typeof err?.code === "string" ? err.code : "update_failed",
            message,
          };
        });

        return {
          ok: false as const,
          status: response.status || 500,
          errors,
        };
      }

      return { ok: true as const };
    };

    // 1) Sections
    {
      const result = await callSolver("/update-sections", { sections });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    // 2) Instructors
    {
      const payload = instructors.map((inst) => ({
        id: inst.id,
        name: inst.name || inst.id,
        rank_type: inst.rank_type,
        preferences: {
          preferred_times: [], // Not modeled on the frontend; keep empty.
          preferred_days: inst.preferences?.preferred_days ?? [],
          preferred_patterns: inst.preferences?.preferred_patterns ?? [],
          unavailable_times: inst.unavailable_times ?? [],
          max_teaching_days: inst.preferences?.max_teaching_days,
        },
      }));

      const result = await callSolver("/update-instructors", {
        instructors: payload,
      });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    // 3) Rooms
    {
      const payload = rooms.map((room) => ({
        id: room.id,
        building: room.building,
        // Backend requires room_number and room_type; derive sensible defaults.
        room_number: room.room_number || room.id,
        capacity: room.capacity,
        room_type: "lecture",
        has_av: false,
        is_accessible: true,
        features: room.features ?? [],
        preferences: {
          need_projector: false,
          need_lab: false,
          can_be_outside_weatherhead: false,
          other_requirements: {},
        },
      }));

      const result = await callSolver("/update-rooms", { rooms: payload });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    // 4) Timeslots
    {
      const payload = timeslots.map((slot) => ({
        id: slot.id,
        days: slot.day ?? slot.days,
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_type: slot.slot_type ?? "standard",
      }));

      const result = await callSolver("/update-timeslots", {
        timeslots: payload,
      });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    // 5) Meeting patterns
    {
      const payload = meeting_patterns.map((p) => ({
        id: p.id,
        slots_required: p.slots_required,
        allowed_days: p.allowed_days ?? [],
        compatible_timeslot_sets: p.compatible_timeslot_sets ?? [],
      }));

      const result = await callSolver("/update-meeting-patterns", {
        meeting_patterns: payload,
      });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    // 6) Constraints (cross-lists, no-overlap, blocked, locks, soft locks)
    {
      const result = await callSolver("/update-constraints", {
        crosslist_groups,
        no_overlap_groups,
        blocked_times,
        locked_assignments,
        soft_locks,
      });
      if (!result.ok) {
        return NextResponse.json(
          { status: "error", errors: result.errors },
          { status: result.status },
        );
      }
    }

    return NextResponse.json(
      {
        status: "ok",
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "network_error", message }],
      },
      { status: 502 },
    );
  }
}

