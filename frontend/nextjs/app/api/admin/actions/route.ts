import { NextRequest, NextResponse } from "next/server";
import { countActions, listActions } from "../../../../lib/actions-repo";
import { verifyAdminRequest } from "../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const auth = await verifyAdminRequest(body, "actions-query");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const status = body.status || undefined;
  const source = body.source || undefined;
  const limit = Number(body.limit || 20);
  const offset = Number(body.offset || 0);

  return NextResponse.json({
    ok: true,
    actions: await listActions({ status, source, limit, offset }),
    total: await countActions({ status, source }),
    limit,
    offset
  });
}
