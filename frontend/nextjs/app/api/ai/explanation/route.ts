import { NextRequest, NextResponse } from "next/server";
import { buildAiRecommendation } from "../../../../lib/ai-engine";
import { listActions } from "../../../../lib/actions-repo";
import { appConfig } from "../../../../lib/config";
import { DashboardState } from "../../../../lib/frontend-types";
import { generateVaultExplanation, isOpenAiConfigured } from "../../../../lib/openai";
import { Contract, JsonRpcProvider } from "ethers";
import { mockUsdAbi, vaultAbi, wpasAbi } from "../../../../lib/abis";

const provider = new JsonRpcProvider(
  appConfig.rpcUrl,
  { chainId: appConfig.chainId, name: appConfig.chainName },
  { staticNetwork: true }
);
const vault = new Contract(appConfig.vaultAddress, vaultAbi, provider);
const wpas = new Contract(appConfig.wpasAddress, wpasAbi, provider);
const mockUsd = new Contract(appConfig.mockUsdAddress, mockUsdAbi, provider);

function fallbackExplanation(recommendation: Awaited<ReturnType<typeof buildAiRecommendation>>) {
  return `${recommendation.explanation} Primary reasons: ${recommendation.reasons.join(" ")} Safety constraints: ${recommendation.constraints.join(" ")}`;
}

async function buildRecommendationWithBestEffortState(requester: string) {
  const actions = await listActions({ requester, limit: 5 });

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

    return {
      recommendation: await buildAiRecommendation({ requester, state }),
      actions,
      degraded: false as const
    };
  } catch {
    const emptyState: DashboardState = {
      nativeBalance: null,
      wpasBalance: null,
      vaultShares: null,
      vaultSupply: null,
      vaultCollateral: null,
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
      collateralToken: null,
      owner: null,
      aiOperator: null,
      paused: null
    };

    return {
      recommendation: await buildAiRecommendation({ requester, state: emptyState }),
      actions,
      degraded: true as const
    };
  }
}

export async function GET(request: NextRequest) {
  const requester = request.nextUrl.searchParams.get("requester");
  if (!requester) {
    return NextResponse.json({ ok: false, error: "Missing requester" }, { status: 400 });
  }

  try {
    const { recommendation, actions, degraded } = await buildRecommendationWithBestEffortState(requester);

    if (!isOpenAiConfigured()) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        degraded,
        explanation: fallbackExplanation(recommendation)
      });
    }

    try {
      const explanation = await generateVaultExplanation({
        account: requester,
        recommendation,
        actions: actions.map((action) => ({
          status: action.status,
          amountDisplay: action.amountDisplay,
          beneficiary: action.beneficiary,
          createdAt: action.createdAt,
          error: action.error
        }))
      });

      return NextResponse.json({ ok: true, source: "openai", degraded, explanation });
    } catch {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        degraded,
        explanation: fallbackExplanation(recommendation)
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: true,
        source: "fallback",
        degraded: true,
        explanation: "Recommendation service is in fallback mode right now. Review your position, keep a gas buffer, and retry once the network stabilizes.",
        error: error?.message || "AI explanation failed"
      },
      { status: 200 }
    );
  }
}
