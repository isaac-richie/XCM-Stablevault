import { NextRequest, NextResponse } from "next/server";
import { countActions, listActions } from "../../../lib/actions-repo";

export async function GET(request: NextRequest) {
  const requester = request.nextUrl.searchParams.get("requester")?.toLowerCase();
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const source = request.nextUrl.searchParams.get("source") || undefined;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");
  const offset = Number(request.nextUrl.searchParams.get("offset") || "0");

  try {
    const filtered = await listActions({ requester, status, source, limit, offset });
    const total = await countActions({ requester, status, source });
    return NextResponse.json({ ok: true, actions: filtered, total, limit, offset });
  } catch (error) {
    console.error("[actions] failed to load actions", error);
    return NextResponse.json({ ok: true, actions: [], total: 0, limit, offset, degraded: true });
  }
}
