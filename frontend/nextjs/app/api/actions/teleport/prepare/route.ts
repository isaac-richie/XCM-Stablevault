import { NextRequest, NextResponse } from "next/server";
import { runRepoScript, parseVerifyOutput } from "../../../../../lib/relayer-service";
import { buildTeleportMessage, isLikelySs58 } from "../../../../../lib/xcm-message";

type PrepareBody = {
  requester?: string;
  beneficiary: string;
  amount: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PrepareBody;

    if (!body.beneficiary || !body.amount) {
      return NextResponse.json(
        { ok: false, error: "Missing beneficiary or amount" },
        { status: 400 }
      );
    }

    if (!isLikelySs58(body.beneficiary)) {
      return NextResponse.json(
        { ok: false, error: "Beneficiary is not a valid SS58-like address" },
        { status: 400 }
      );
    }

    if (!/^\d+(\.\d{1,10})?$/.test(body.amount)) {
      return NextResponse.json(
        { ok: false, error: "Amount must be a positive PAS value with up to 10 decimals" },
        { status: 400 }
      );
    }

    let built;
    try {
      built = await buildTeleportMessage({
        amount: body.amount,
        beneficiary: body.beneficiary
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("Invalid decoded address length") || message.includes("Decoding")) {
        return NextResponse.json(
          { ok: false, error: "Recipient is not a valid SS58 address" },
          { status: 400 }
        );
      }
      throw error;
    }

    let beforeBalance: string | null = null;

    try {
      const beforeVerify = await runRepoScript("xcm:verify-people", {
        BENEFICIARY_SS58: body.beneficiary
      });
      const beforePayload = parseVerifyOutput(beforeVerify.stdout);
      beforeBalance = beforePayload.account?.free || "0";
    } catch (error) {
      console.error("[teleport/prepare] failed to fetch destination pre-balance", error);
    }

    return NextResponse.json({
      ok: true,
      payload: {
        ...built,
        beforeBalance
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to prepare teleport" },
      { status: 500 }
    );
  }
}
