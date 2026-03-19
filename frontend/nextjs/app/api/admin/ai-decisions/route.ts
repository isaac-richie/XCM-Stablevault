import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { listRecentAiDecisions } from "../../../../lib/ai-decisions-repo";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const auth = await verifyAdminRequest(body, "ai-decisions-query");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const limit = Number(body.limit || "12");
  const decisions = await listRecentAiDecisions(limit);

  return NextResponse.json({
    ok: true,
    decisions
  });
}
