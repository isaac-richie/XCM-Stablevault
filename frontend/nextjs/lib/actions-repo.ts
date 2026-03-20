import { queryAll, queryOne, run } from "./db";

export type ActionStatus =
  | "queued"
  | "processing"
  | "dispatched"
  | "settled"
  | "failed";

export type ActionSource = "user" | "ai";

export type TeleportAction = {
  id: string;
  requester: string;
  source: ActionSource;
  aiDecisionId?: string;
  beneficiary: string;
  amountPlanck: string;
  amountDisplay: string;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
  signature: string;
  originTxHash?: string;
  originBlockHash?: string;
  originEvents?: string[];
  beforeBalance?: string;
  afterBalance?: string;
  error?: string;
};

type ActionRow = {
  id: string;
  requester: string;
  source: ActionSource;
  ai_decision_id: string | null;
  beneficiary: string;
  amount_planck: string;
  amount_display: string;
  status: ActionStatus;
  created_at: string;
  updated_at: string;
  signature: string;
  origin_tx_hash: string | null;
  origin_block_hash: string | null;
  origin_events_json: string | null;
  before_balance: string | null;
  after_balance: string | null;
  error: string | null;
};

function mapRow(row: ActionRow): TeleportAction {
  return {
    id: row.id,
    requester: row.requester,
    source: row.source,
    aiDecisionId: row.ai_decision_id || undefined,
    beneficiary: row.beneficiary,
    amountPlanck: row.amount_planck,
    amountDisplay: row.amount_display,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signature: row.signature,
    originTxHash: row.origin_tx_hash || undefined,
    originBlockHash: row.origin_block_hash || undefined,
    originEvents: row.origin_events_json ? JSON.parse(row.origin_events_json) : undefined,
    beforeBalance: row.before_balance || undefined,
    afterBalance: row.after_balance || undefined,
    error: row.error || undefined
  };
}

export async function listActions(options?: {
  requester?: string;
  status?: string;
  source?: string;
  limit?: number;
  offset?: number;
}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options?.requester) {
    clauses.push(`lower(requester) = lower(?)`);
    params.push(options.requester);
  }

  if (options?.status) {
    clauses.push(`status = ?`);
    params.push(options.status);
  }

  if (options?.source) {
    clauses.push(`source = ?`);
    params.push(options.source);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const rows = await queryAll<ActionRow>(
    `SELECT * FROM teleport_actions
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return rows.map(mapRow);
}

export async function countActions(options?: { requester?: string; status?: string; source?: string }) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options?.requester) {
    clauses.push(`lower(requester) = lower(?)`);
    params.push(options.requester);
  }

  if (options?.status) {
    clauses.push(`status = ?`);
    params.push(options.status);
  }

  if (options?.source) {
    clauses.push(`source = ?`);
    params.push(options.source);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const row = await queryOne<{ count: number | string }>(
    `SELECT COUNT(*) as count FROM teleport_actions ${where}`,
    params
  );
  return Number(row?.count || 0);
}

export async function getAction(id: string) {
  const row = await queryOne<ActionRow>(`SELECT * FROM teleport_actions WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function insertAction(action: TeleportAction) {
  await run(
    `INSERT INTO teleport_actions (
      id, requester, source, ai_decision_id, beneficiary, amount_planck, amount_display, status,
      created_at, updated_at, signature, origin_tx_hash, origin_block_hash,
      origin_events_json, before_balance, after_balance, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.requester,
      action.source,
      action.aiDecisionId || null,
      action.beneficiary,
      action.amountPlanck,
      action.amountDisplay,
      action.status,
      action.createdAt,
      action.updatedAt,
      action.signature,
      action.originTxHash || null,
      action.originBlockHash || null,
      action.originEvents ? JSON.stringify(action.originEvents) : null,
      action.beforeBalance || null,
      action.afterBalance || null,
      action.error || null
    ]
  );
  return action;
}

export async function updateAction(id: string, patch: Partial<TeleportAction>) {
  const current = await getAction(id);
  if (!current) return null;

  const next: TeleportAction = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  await run(
    `UPDATE teleport_actions SET
      requester = ?, source = ?, ai_decision_id = ?, beneficiary = ?, amount_planck = ?, amount_display = ?,
      status = ?, created_at = ?, updated_at = ?, signature = ?, origin_tx_hash = ?,
      origin_block_hash = ?, origin_events_json = ?, before_balance = ?, after_balance = ?,
      error = ?
    WHERE id = ?`,
    [
      next.requester,
      next.source,
      next.aiDecisionId || null,
      next.beneficiary,
      next.amountPlanck,
      next.amountDisplay,
      next.status,
      next.createdAt,
      next.updatedAt,
      next.signature,
      next.originTxHash || null,
      next.originBlockHash || null,
      next.originEvents ? JSON.stringify(next.originEvents) : null,
      next.beforeBalance || null,
      next.afterBalance || null,
      next.error || null,
      id
    ]
  );

  return next;
}
