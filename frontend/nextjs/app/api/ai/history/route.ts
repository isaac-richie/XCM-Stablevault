import { NextRequest, NextResponse } from "next/server";
import { listAiDecisions } from "../../../../lib/ai-decisions-repo";

export async function GET(request: NextRequest) {
  const requester = request.nextUrl.searchParams.get("requester");
  const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

  if (!requester) {
    return NextResponse.json({ ok: false, error: "Missing requester" }, { status: 400 });
  }

  try {
    const decisions = await listAiDecisions(requester, limit);
    return NextResponse.json({ ok: true, decisions });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "AI history query failed" },
      { status: 500 }
    );
  }
}
