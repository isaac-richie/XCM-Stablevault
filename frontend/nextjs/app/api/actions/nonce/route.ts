import { NextRequest, NextResponse } from "next/server";
import { issueNonce } from "../../../../lib/nonces-repo";

export async function GET(request: NextRequest) {
  try {
    const requester = request.nextUrl.searchParams.get("requester");
    if (!requester) {
      return NextResponse.json({ ok: false, error: "Missing requester" }, { status: 400 });
    }

    const record = await issueNonce(requester);
    return NextResponse.json({
      ok: true,
      nonce: record.nonce,
      expiresAt: record.expiresAt
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to issue nonce" },
      { status: 500 }
    );
  }
}
