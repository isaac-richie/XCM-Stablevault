import { randomUUID } from "crypto";
import { queryAll, run } from "./db";
import { AiRecommendation } from "./ai-engine";

export type AiDecisionRecord = AiRecommendation & {
  id: string;
  requester: string;
  createdAt: string;
  linkedActionId?: string;
};

type AiDecisionRow = {
  id: string;
  requester: string;
  score: number | string;
  posture: AiRecommendation["posture"];
  action: AiRecommendation["action"];
  beneficiary: string;
  suggested_amount_pas: string;
  pending_actions: number | string;
  failed_actions: number | string;
  explanation: string;
  reasons_json: string;
  constraints_json: string;
  queue_pressure?: string | null;
  execution_readiness?: string | null;
  relayer_health?: string | null;
  vault_utilization?: string | null;
  auto_queue_eligible?: boolean | number | string | null;
  auto_queue_reason?: string | null;
  linked_action_id?: string | null;
  created_at: string;
};

function mapRow(row: AiDecisionRow): AiDecisionRecord {
  return {
    id: row.id,
    requester: row.requester,
    score: Number(row.score),
    posture: row.posture,
    action: row.action,
    beneficiary: row.beneficiary,
    suggestedAmountPas: row.suggested_amount_pas,
    pendingActions: Number(row.pending_actions),
    failedActions: Number(row.failed_actions),
    explanation: row.explanation,
    reasons: JSON.parse(row.reasons_json),
    constraints: JSON.parse(row.constraints_json),
    queuePressure: (row.queue_pressure as AiRecommendation["queuePressure"]) || "low",
    executionReadiness:
      (row.execution_readiness as AiRecommendation["executionReadiness"]) || "ready",
    relayerHealth: (row.relayer_health as AiRecommendation["relayerHealth"]) || "healthy",
    vaultUtilization: row.vault_utilization || "0%",
    autoQueueEligible: Boolean(row.auto_queue_eligible),
    autoQueueReason: row.auto_queue_reason || "Stored decision predates auto-queue metadata.",
    linkedActionId: row.linked_action_id || undefined,
    createdAt: row.created_at
  };
}

export async function insertAiDecision(requester: string, recommendation: AiRecommendation) {
  const record: AiDecisionRecord = {
    id: randomUUID(),
    requester: requester.toLowerCase(),
    createdAt: new Date().toISOString(),
    linkedActionId: undefined,
    ...recommendation
  };

  await run(
    `INSERT INTO ai_decisions (
      id, requester, score, posture, action, beneficiary, suggested_amount_pas,
      pending_actions, failed_actions, explanation, reasons_json, constraints_json,
      queue_pressure, execution_readiness, relayer_health, vault_utilization,
      auto_queue_eligible, auto_queue_reason, linked_action_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.requester,
      record.score,
      record.posture,
      record.action,
      record.beneficiary,
      record.suggestedAmountPas,
      record.pendingActions,
      record.failedActions,
      record.explanation,
      JSON.stringify(record.reasons),
      JSON.stringify(record.constraints),
      record.queuePressure,
      record.executionReadiness,
      record.relayerHealth,
      record.vaultUtilization,
      record.autoQueueEligible ? 1 : 0,
      record.autoQueueReason,
      record.linkedActionId || null,
      record.createdAt
    ]
  );

  return record;
}

export async function listAiDecisions(requester: string, limit = 10) {
  const rows = await queryAll<AiDecisionRow>(
    `SELECT * FROM ai_decisions
     WHERE lower(requester) = lower(?)
     ORDER BY created_at DESC
     LIMIT ?`,
    [requester.toLowerCase(), limit]
  );

  return rows.map(mapRow);
}

export async function listRecentAiDecisions(limit = 20) {
  const rows = await queryAll<AiDecisionRow>(
    `SELECT * FROM ai_decisions
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map(mapRow);
}

export async function linkAiDecisionToAction(aiDecisionId: string, actionId: string) {
  await run(`UPDATE ai_decisions SET linked_action_id = ? WHERE id = ?`, [actionId, aiDecisionId]);
}
