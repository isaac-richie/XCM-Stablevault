import { formatEther } from "ethers";
import { countActions } from "./actions-repo";
import { appConfig } from "./config";
import { DashboardState } from "./frontend-types";

export type AiAction = "hold" | "deposit-more" | "teleport" | "review-risk";
export type AiPosture = "idle" | "healthy" | "watch" | "guarded";

export type AiRecommendation = {
  score: number;
  posture: AiPosture;
  action: AiAction;
  beneficiary: string;
  suggestedAmountPas: string;
  pendingActions: number;
  failedActions: number;
  explanation: string;
  reasons: string[];
  constraints: string[];
  queuePressure: "low" | "moderate" | "high";
  executionReadiness: "ready" | "attention" | "blocked";
  relayerHealth: "healthy" | "degraded" | "offline";
  vaultUtilization: string;
  autoQueueEligible: boolean;
  autoQueueReason: string;
};

export type AiInputs = {
  requester: string;
  state: DashboardState;
};

// These values are intentionally simple environment-driven controls so the AI engine
// stays deterministic and easy to tune without changing code or retraining anything.
const AI_MIN_POSITION_PAS = Number(process.env.AI_MIN_POSITION_PAS || "5");
const AI_MAX_TELEPORT_PAS = Number(process.env.AI_MAX_TELEPORT_PAS || "25");
const AI_TARGET_BUFFER_PAS = Number(process.env.AI_TARGET_BUFFER_PAS || "2");

function toPas(value: bigint | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(formatEther(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPas(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export async function buildAiRecommendation(input: AiInputs): Promise<AiRecommendation> {
  const positionPas = toPas(input.state.vaultShares);
  const walletPas = toPas(input.state.nativeBalance);
  const vaultTvlPas = toPas(input.state.vaultCollateral);
  const allowancePas = toPas(input.state.allowance);
  const utilization = vaultTvlPas > 0 ? positionPas / vaultTvlPas : 0;

  // The recommendation combines user position data with recent action history
  // so it stays helpful without taking custody away from the user.
  const [pendingActions, failedActions, settledActions] = await Promise.all([
    countActions({ requester: input.requester, status: "queued" }).then(async (queued) => {
      const processing = await countActions({ requester: input.requester, status: "processing" });
      const dispatched = await countActions({ requester: input.requester, status: "dispatched" });
      return queued + processing + dispatched;
    }),
    countActions({ requester: input.requester, status: "failed" }),
    countActions({ requester: input.requester, status: "settled" })
  ]);

  const queuePressure =
    pendingActions >= 2 ? "high" : pendingActions === 1 ? "moderate" : "low";
  const relayerHealth: AiRecommendation["relayerHealth"] = "healthy";

  const reasons: string[] = [];
  const constraints: string[] = [
    `Destination beneficiary defaults to ${appConfig.peopleBeneficiary}`,
    `Teleport size capped at ${AI_MAX_TELEPORT_PAS} PAS`,
    "Keep enough PAS in wallet for gas after teleporting"
  ];

  let score = 72;
  let posture: AiPosture = "healthy";
  let action: AiAction = "hold";
  let suggestedAmount = 0;
  let executionReadiness: "ready" | "attention" | "blocked" = "ready";

  // The scoring model starts optimistic and subtracts confidence as constraints appear.
  // This makes the recommendation easy to explain in the UI and in admin review.
  if (input.state.paused) {
    score = 18;
    posture = "guarded";
    action = "review-risk";
    executionReadiness = "blocked";
    reasons.push("Vault is paused, so automation should not dispatch new capital moves.");
  }

  if (positionPas <= 0) {
    score = clamp(score - 45, 5, 100);
    posture = posture === "guarded" ? posture : "idle";
    action = "deposit-more";
    reasons.push("No active vault position was detected for this wallet.");
  } else if (positionPas < AI_MIN_POSITION_PAS) {
    score = clamp(score - 24, 5, 100);
    posture = posture === "guarded" ? posture : "watch";
    action = "deposit-more";
    reasons.push(`Vault position is below the AI operating threshold of ${AI_MIN_POSITION_PAS} PAS.`);
  } else {
    reasons.push(`Vault position is ${formatPas(positionPas)} PAS, which is large enough for strategy analysis.`);
  }

  if (walletPas < AI_TARGET_BUFFER_PAS) {
    score = clamp(score - 10, 5, 100);
    executionReadiness = executionReadiness === "blocked" ? "blocked" : "attention";
    reasons.push(`Wallet gas buffer is thin at ${formatPas(walletPas)} PAS.`);
    constraints.push(`Keep at least ${AI_TARGET_BUFFER_PAS} PAS available for gas and wraps.`);
  }

  if (allowancePas <= 0 && positionPas > 0) {
    score = clamp(score - 8, 5, 100);
    executionReadiness = executionReadiness === "blocked" ? "blocked" : "attention";
    reasons.push("WPAS allowance is not currently staged for new vault deposits.");
  }

  if (pendingActions > 0) {
    score = clamp(score - 20, 5, 100);
    posture = "watch";
    action = "hold";
    executionReadiness = executionReadiness === "blocked" ? "blocked" : "attention";
    reasons.push(`There ${pendingActions === 1 ? "is" : "are"} ${pendingActions} in-flight cross-chain action${pendingActions === 1 ? "" : "s"}.`);
  }

  if (failedActions > 0) {
    score = clamp(score - 12 * failedActions, 5, 100);
    posture = "guarded";
    action = "review-risk";
    executionReadiness = "blocked";
    reasons.push(`${failedActions} failed action${failedActions === 1 ? "" : "s"} need operator review.`);
  }

  if (queuePressure === "moderate") {
    score = clamp(score - 6, 5, 100);
    executionReadiness = executionReadiness === "blocked" ? "blocked" : "attention";
    reasons.push("A recent bridge action is still settling, so the next move should stay measured.");
  } else if (queuePressure === "high") {
    score = clamp(score - 16, 5, 100);
    posture = "guarded";
    action = "hold";
    executionReadiness = executionReadiness === "blocked" ? "blocked" : "attention";
    reasons.push("Multiple bridge actions are already in flight, so AI is pausing new transfers until the wallet history clears.");
  }

  if (utilization >= 0.4) {
    reasons.push(`This wallet represents ${formatPas(utilization * 100)}% of vault collateral, so AI will route conservatively.`);
    constraints.push("Large vault concentration should be rebalanced in smaller steps.");
    score = clamp(score - 6, 5, 100);
  } else if (utilization > 0) {
    reasons.push(`Vault utilization footprint is ${formatPas(utilization * 100)}% of protocol collateral.`);
  }

  if (settledActions > 0 && failedActions === 0) {
    score = clamp(score + Math.min(6, settledActions * 2), 5, 100);
    reasons.push(`Recent settled actions (${settledActions}) improve routing confidence for this wallet.`);
  }

  if (
    !input.state.paused &&
    positionPas >= AI_MIN_POSITION_PAS &&
    pendingActions === 0 &&
    failedActions === 0 &&
    queuePressure !== "high"
  ) {
    suggestedAmount = clamp(Math.max(positionPas * 0.12, 1), 1, AI_MAX_TELEPORT_PAS);
    action = "teleport";
    posture = positionPas >= AI_MAX_TELEPORT_PAS ? "healthy" : "watch";
    reasons.push(`AI recommends teleporting ${formatPas(suggestedAmount)} PAS to keep liquidity mobile across chains.`);
  }

  if (vaultTvlPas < AI_MIN_POSITION_PAS) {
    constraints.push("Protocol TVL is still low, so AI should stay conservative with routing size.");
  }

  const explanation =
    action === "teleport"
      ? `Recommendation: send ${formatPas(suggestedAmount)} PAS to the approved People Paseo beneficiary.`
      : action === "deposit-more"
        ? "Recommendation: add more collateral before attempting AI-managed routing."
        : action === "review-risk"
        ? "Recommendation: hold and review wallet posture before sending a new cross-chain transfer."
        : "Recommendation: hold current position and wait for the next state change.";

  const autoQueueEligible = false;

  const autoQueueReason = executionReadiness === "blocked"
    ? "AI is advisory only. Review wallet posture before sending the next bridge action."
    : "AI prepares the next move, but the connected wallet remains the final executor.";

  return {
    score,
    posture,
    action,
    beneficiary: appConfig.peopleBeneficiary,
    suggestedAmountPas: formatPas(suggestedAmount),
    pendingActions,
    failedActions,
    explanation,
    reasons,
    constraints,
    queuePressure,
    executionReadiness,
    relayerHealth,
    vaultUtilization: `${formatPas(utilization * 100)}%`,
    autoQueueEligible,
    autoQueueReason
  };
}
