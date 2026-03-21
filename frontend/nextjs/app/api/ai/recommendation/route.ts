import { Contract, JsonRpcProvider } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { mockUsdAbi, vaultAbi, wpasAbi } from "../../../../lib/abis";
import { AiRecommendation, buildAiRecommendation } from "../../../../lib/ai-engine";
import { insertAiDecision } from "../../../../lib/ai-decisions-repo";
import { appConfig } from "../../../../lib/config";
import { DashboardState } from "../../../../lib/frontend-types";

const provider = new JsonRpcProvider(
  appConfig.rpcUrl,
  { chainId: appConfig.chainId, name: appConfig.chainName },
  { staticNetwork: true }
);
const vault = new Contract(appConfig.vaultAddress, vaultAbi, provider);
const wpas = new Contract(appConfig.wpasAddress, wpasAbi, provider);
const mockUsd = new Contract(appConfig.mockUsdAddress, mockUsdAbi, provider);

function fallbackRecommendation(): AiRecommendation {
  return {
    score: 50,
    posture: "watch",
    action: "hold",
    beneficiary: appConfig.peopleBeneficiary,
    suggestedAmountPas: "0",
    pendingActions: 0,
    failedActions: 0,
    explanation: "Live recommendation is running in fallback mode. Review your wallet position and retry once connectivity stabilizes.",
    reasons: ["Live AI inputs are temporarily degraded."],
    constraints: ["Keep enough PAS for gas and confirm destination details manually."],
    queuePressure: "low",
    executionReadiness: "attention",
    relayerHealth: "healthy",
    vaultUtilization: "--",
    autoQueueEligible: false,
    autoQueueReason: "AI is advisory only while fallback mode is active."
  } as const;
}

export async function GET(request: NextRequest) {
  const requester = request.nextUrl.searchParams.get("requester");
  if (!requester) {
    return NextResponse.json({ ok: false, error: "Missing requester" }, { status: 400 });
  }

  try {
    const [
      nativeBalance,
      wpasBalance,
      vaultShares,
      vaultSupply,
      vaultCollateral,
      mockUsdSupply,
      allowance,
      owner,
      aiOperator,
      paused
    ] = await Promise.all([
      provider.getBalance(requester),
      wpas.balanceOf(requester),
      vault.balanceOf(requester),
      vault.totalSupply(),
      vault.totalCollateral(),
      mockUsd.totalSupply(),
      wpas.allowance(requester, appConfig.vaultAddress),
      vault.owner(),
      vault.aiOperator(),
      vault.paused()
    ]);

    const state: DashboardState = {
      nativeBalance,
      wpasBalance,
      vaultShares,
      vaultSupply,
      vaultCollateral,
      mockUsdSupply,
      mockUsdBalance: null,
      stableDebt: null,
      maxMintable: null,
      pendingRewards: null,
      projectedYearlyRewards: null,
      rewardRateBps: null,
      collateralFactorBps: null,
      allowance,
      stableAllowance: null,
      collateralToken: appConfig.wpasAddress,
      owner,
      aiOperator,
      paused
    };

    const recommendation = await buildAiRecommendation({ requester, state });

    try {
      await insertAiDecision(requester, recommendation);
    } catch (error) {
      console.error("[ai/recommendation] failed to persist AI decision", error);
    }

    return NextResponse.json({ ok: true, recommendation });
  } catch (error: any) {
    console.error("[ai/recommendation] failed to build recommendation", error);
    return NextResponse.json({ ok: true, recommendation: fallbackRecommendation(), degraded: true });
  }
}
