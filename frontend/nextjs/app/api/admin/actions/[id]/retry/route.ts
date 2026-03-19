import { NextRequest, NextResponse } from "next/server";
import { getAction, updateAction } from "../../../../../../lib/actions-repo";
import { verifyAdminRequest } from "../../../../../../lib/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const body = await request.json();
  const auth = await verifyAdminRequest(body, "retry-action");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const action = await getAction(id);
  if (!action) {
    return NextResponse.json({ ok: false, error: "Action not found" }, { status: 404 });
  }

  if (action.status !== "failed") {
    return NextResponse.json(
      { ok: false, error: "Only failed actions can be retried" },
      { status: 400 }
    );
  }

  const retried = await updateAction(id, {
    status: "queued",
    error: undefined,
    originTxHash: undefined,
    originBlockHash: undefined,
    originEvents: undefined,
    afterBalance: undefined
  });

  return NextResponse.json({ ok: true, action: retried });
}
