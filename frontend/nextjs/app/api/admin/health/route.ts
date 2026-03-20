import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { getActionSourceStats, getQueueStats } from "../../../../lib/admin-stats";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const auth = await verifyAdminRequest(body, "health-query");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    queue: await getQueueStats(),
    sources: await getActionSourceStats()
  });
}
