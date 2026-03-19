export type DashboardState = {
  nativeBalance: bigint | null;
  wpasBalance: bigint | null;
  vaultShares: bigint | null;
  vaultSupply: bigint | null;
  vaultCollateral: bigint | null;
  mockUsdSupply: bigint | null;
  mockUsdBalance: bigint | null;
  stableDebt: bigint | null;
  maxMintable: bigint | null;
  pendingRewards: bigint | null;
  projectedYearlyRewards: bigint | null;
  rewardRateBps: bigint | null;
  collateralFactorBps: bigint | null;
  allowance: bigint | null;
  stableAllowance: bigint | null;
  collateralToken: string | null;
  owner: string | null;
  aiOperator: string | null;
  paused: boolean | null;
};

export type LogBox = {
  title: string;
  body: string;
  kind: "idle" | "success" | "error";
};

export type ToastState = {
  id: string;
  title: string;
  body: string;
  kind: "success" | "error";
};

export type UserAction = {
  requester?: string;
  source?: "user" | "ai";
  aiDecisionId?: string;
  id: string;
  beneficiary: string;
  amountDisplay: string;
  status: string;
  createdAt: string;
  originTxHash?: string;
  afterBalance?: string;
  error?: string;
};

export type AiRecommendationView = {
  score: number;
  posture: "idle" | "healthy" | "watch" | "guarded";
  action: "hold" | "deposit-more" | "teleport" | "review-risk";
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

export type AiDecisionHistoryItem = AiRecommendationView & {
  id: string;
  requester: string;
  createdAt: string;
  linkedActionId?: string;
};

export type AiExplanationState = {
  source: "openai" | "fallback";
  body: string;
} | null;
