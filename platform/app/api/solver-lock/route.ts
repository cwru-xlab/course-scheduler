import { NextResponse } from "next/server";

import { readSolverLock } from "@/lib/solver-lock";

export async function GET() {
  return NextResponse.json(readSolverLock(), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
