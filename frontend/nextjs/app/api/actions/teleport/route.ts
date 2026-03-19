import { randomUUID } from "crypto";
import { Contract, JsonRpcProvider, parseUnits } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { vaultAbi } from "../../../../lib/abis";
import { buildAiRecommendation } from "../../../../lib/ai-engine";
import { linkAiDecisionToAction } from "../../../../lib/ai-decisions-repo";
import { appConfig } from "../../../../lib/config";
import { verifyTeleportTypedData } from "../../../../lib/eip712";
import {
  insertAction,
  TeleportAction,
} from "../../../../lib/actions-repo";
import { consumeNonce } from "../../../../lib/nonces-repo";
import { checkAndConsumeRateLimit, checkPendingQuota } from "../../../../lib/request-guards";
import { parseVerifyOutput, runRepoScript } from "../../../../lib/relayer-service";

const provider = new JsonRpcProvider(
  appConfig.rpcUrl,
  { chainId: appConfig.chainId, name: appConfig.chainName },
  { staticNetwork: true }
);
const vault = new Contract(appConfig.vaultAddress, vaultAbi, provider);

type RequestBody = {
  requester: string;
  beneficiary: string;
  amount: string;
  timestamp: number;
  nonce: string;
  signature: string;
  aiInitiated?: boolean;
  aiDecisionId?: string;
};

function isLikelySs58(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{20,}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.requester || !body.beneficiary || !body.amount || !body.signature || !body.nonce) {
      return NextResponse.json(
        { ok: false, error: "Missing requester, beneficiary, amount, nonce, or signature" },
        { status: 400 }
      );
    }

    if (!isLikelySs58(body.beneficiary)) {
      return NextResponse.json({ ok: false, error: "Beneficiary is not a valid SS58-like address" }, { status: 400 });
    }

    const ageMs = Math.abs(Date.now() - Number(body.timestamp));
    if (ageMs > 5 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: "Signed request expired" }, { status: 400 });
    }

    const signer = verifyTeleportTypedData(body);
    if (signer.toLowerCase() !== body.requester.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Signature does not match requester" }, { status: 401 });
    }

    const nonceRecord = await consumeNonce(body.requester, body.nonce);
    if (!nonceRecord) {
      return NextResponse.json({ ok: false, error: "Nonce invalid, used, or expired" }, { status: 409 });
    }

    const pendingQuota = await checkPendingQuota(body.requester);
    if (!pendingQuota.ok) {
      return NextResponse.json({ ok: false, error: pendingQuota.error }, { status: 429 });
    }

    const rateLimit = await checkAndConsumeRateLimit(body.requester);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, error: rateLimit.error, retryAfterMs: rateLimit.retryAfterMs },
        { status: 429 }
      );
    }

    if (!/^\d+(\.\d{1,10})?$/.test(body.amount)) {
      return NextResponse.json({ ok: false, error: "Amount must be a positive PAS value with up to 10 decimals" }, { status: 400 });
    }

    const vaultBalance = (await vault.balanceOf(body.requester)) as bigint;
    if (vaultBalance <= 0n) {
      return NextResponse.json(
        {
          ok: false,
          error: "Requester has no vault position. Deposit collateral before requesting teleport."
        },
        { status: 400 }
      );
    }

    const amountPlanck = parseUnits(body.amount, 10).toString();
    if (BigInt(amountPlanck) <= 0n) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than zero" }, { status: 400 });
    }

    if (body.aiInitiated) {
      const [nativeBalance, vaultSupply, vaultCollateral, owner, aiOperator, paused] =
        await Promise.all([
          provider.getBalance(body.requester),
          vault.totalSupply(),
          vault.totalCollateral(),
          vault.owner(),
          vault.aiOperator(),
          vault.paused()
        ]);

      const recommendation = await buildAiRecommendation({
        requester: body.requester,
        state: {
          nativeBalance,
          wpasBalance: null,
          vaultShares: vaultBalance,
          vaultSupply,
          vaultCollateral,
          mockUsdSupply: null,
          mockUsdBalance: null,
          stableDebt: null,
          maxMintable: null,
          pendingRewards: null,
          projectedYearlyRewards: null,
          rewardRateBps: null,
          collateralFactorBps: null,
          allowance: null,
          stableAllowance: null,
          collateralToken: appConfig.wpasAddress,
          owner,
          aiOperator,
          paused
        }
      });

      const aiAmountPlanck = parseUnits(recommendation.suggestedAmountPas, 10).toString();
      if (
        !recommendation.autoQueueEligible ||
        recommendation.action !== "teleport" ||
        body.beneficiary !== recommendation.beneficiary ||
        amountPlanck !== aiAmountPlanck
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: recommendation.autoQueueReason || "AI recommendation is not eligible for auto-queue."
          },
          { status: 400 }
        );
      }

      if (!body.aiDecisionId) {
        return NextResponse.json(
          { ok: false, error: "AI decision reference is required for auto-queued actions." },
          { status: 400 }
        );
      }
    }

    const beforeVerify = await runRepoScript("xcm:verify-people", {
      BENEFICIARY_SS58: body.beneficiary
    });
    const beforePayload = parseVerifyOutput(beforeVerify.stdout);
    const beforeBalance = beforePayload.account?.free || "0";

    const now = new Date().toISOString();
    const action: TeleportAction = {
      id: randomUUID(),
      requester: body.requester,
      source: body.aiInitiated ? "ai" : "user",
      beneficiary: body.beneficiary,
      amountPlanck,
      amountDisplay: body.amount,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      signature: body.signature,
      beforeBalance
    };

    await insertAction(action);

    if (body.aiInitiated && body.aiDecisionId) {
      await linkAiDecisionToAction(body.aiDecisionId, action.id);
    }

    return NextResponse.json({
      ok: true,
      action
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected action processing failure"
      },
      { status: 500 }
    );
  }
}
