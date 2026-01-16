import { NextResponse } from "next/server";

import { mockSchedulingInput } from "@/lib/scheduling/mockData";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    data: mockSchedulingInput,
  });
}
