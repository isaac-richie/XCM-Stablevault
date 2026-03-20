import { Contract, JsonRpcProvider } from "ethers";
import { NextRequest, NextResponse } from "next/server";
import { mockUsdAbi, vaultAbi, wpasAbi } from "../../../../lib/abis";
import { buildAiRecommendation } from "../../../../lib/ai-engine";
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
    return NextResponse.json(
      { ok: false, error: error?.message || "AI recommendation failed" },
      { status: 500 }
    );
  }
}
