import { randomUUID } from "crypto";
import { JsonRpcProvider, parseUnits } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "../../../../../lib/config";
import { insertAction, TeleportAction } from "../../../../../lib/actions-repo";
import { parseVerifyOutput, runRepoScript } from "../../../../../lib/relayer-service";
import { isLikelySs58 } from "../../../../../lib/xcm-message";

const provider = new JsonRpcProvider(
  appConfig.rpcUrl,
  { chainId: appConfig.chainId, name: appConfig.chainName },
  { staticNetwork: true }
);

const XCM_PRECOMPILE_ADDRESS = "0x00000000000000000000000000000000000a0000";

type RecordBody = {
  requester: string;
  beneficiary: string;
  amount: string;
  txHash: string;
  beforeBalance?: string | null;
  aiDecisionId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RecordBody;

    if (!body.requester || !body.beneficiary || !body.amount || !body.txHash) {
      return NextResponse.json(
        { ok: false, error: "Missing requester, beneficiary, amount, or tx hash" },
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

    const [tx, receipt] = await Promise.all([
      provider.getTransaction(body.txHash),
      provider.getTransactionReceipt(body.txHash)
    ]);

    if (!tx || !receipt || receipt.status !== 1) {
      return NextResponse.json(
        { ok: false, error: "Teleport transaction was not found or did not succeed" },
        { status: 400 }
      );
    }

    if ((tx.from || "").toLowerCase() !== body.requester.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Transaction sender does not match requester" },
        { status: 401 }
      );
    }

    if ((tx.to || "").toLowerCase() !== XCM_PRECOMPILE_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Transaction was not sent through the XCM precompile" },
        { status: 400 }
      );
    }

    let afterBalance: string | undefined;
    let settled = false;
    const beforeBalance = body.beforeBalance || undefined;

    try {
      const afterVerify = await runRepoScript("xcm:verify-people", {
        BENEFICIARY_SS58: body.beneficiary
      });
      const afterPayload = parseVerifyOutput(afterVerify.stdout);
      afterBalance = afterPayload.account?.free || "0";
      if (beforeBalance != null && afterBalance != null) {
        settled = BigInt(afterBalance) > BigInt(beforeBalance);
      }
    } catch (error) {
      console.error("[teleport/record] failed to verify destination balance", error);
    }

    const now = new Date().toISOString();
    const action: TeleportAction = {
      id: randomUUID(),
      requester: body.requester,
      source: "user",
      aiDecisionId: body.aiDecisionId,
      beneficiary: body.beneficiary,
      amountPlanck: parseUnits(body.amount, 10).toString(),
      amountDisplay: body.amount,
      status: settled ? "settled" : "dispatched",
      createdAt: now,
      updatedAt: now,
      signature: "direct-wallet",
      originTxHash: body.txHash,
      originBlockHash: receipt.blockHash || undefined,
      beforeBalance,
      afterBalance
    };

    await insertAction(action);

    return NextResponse.json({ ok: true, action });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to record teleport" },
      { status: 500 }
    );
  }
}
