import { NextResponse } from "next/server";
import { getAction } from "../../../../lib/actions-repo";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const action = await getAction(id);

  if (!action) {
    return NextResponse.json({ ok: false, error: "Action not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, action });
}
