import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { runRepoScript } from "../../../../lib/relayer-service";

function parseBalanceOutput(stdout: string) {
  const start = stdout.indexOf("{");
  if (start === -1) {
    throw new Error("Relayer balance output did not contain JSON");
  }
  return JSON.parse(stdout.slice(start));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const auth = await verifyAdminRequest(body, "relayer-status");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { stdout } = await runRepoScript("xcm:relayer-balance", {});
    const payload = parseBalanceOutput(stdout);
    const free = BigInt(payload.free || "0");
    const existentialDeposit = BigInt(payload.existentialDeposit || "0");
    const warningThreshold = existentialDeposit * 20n;

    return NextResponse.json({
      ok: true,
      relayer: {
        ...payload,
        status:
          free <= existentialDeposit
            ? "critical"
            : free <= warningThreshold
              ? "low"
              : "healthy",
        warningThreshold: warningThreshold.toString(),
        connected: true
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: true,
      relayer: {
        connected: false,
        status: "offline",
        error: error?.stderr || error?.stdout || error?.message || "Unable to query relayer"
      }
    });
  }
}
