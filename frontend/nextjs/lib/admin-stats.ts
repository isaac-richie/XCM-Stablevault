import { queryAll, queryOne, run } from "./db";

export async function recordWorkerHeartbeat(input: {
  workerName: string;
  lastActionId?: string | null;
  lastActionStatus?: string | null;
  lastError?: string | null;
}) {
  await run(
    `INSERT INTO worker_status (
      worker_name, last_heartbeat_at, last_action_id, last_action_status, last_error
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(worker_name) DO UPDATE SET
      last_heartbeat_at = excluded.last_heartbeat_at,
      last_action_id = excluded.last_action_id,
      last_action_status = excluded.last_action_status,
      last_error = excluded.last_error`,
    [
      input.workerName,
      Date.now(),
      input.lastActionId || null,
      input.lastActionStatus || null,
      input.lastError || null
    ]
  );
}

export async function getWorkerStatus(workerName = "stablevault-worker") {
  const row = await queryOne<{
    worker_name: string;
    last_heartbeat_at: number | string;
    last_action_id: string | null;
    last_action_status: string | null;
    last_error: string | null;
  }>(
    `SELECT worker_name, last_heartbeat_at, last_action_id, last_action_status, last_error
     FROM worker_status
     WHERE worker_name = ?`,
    [workerName]
  );

  return row
    ? {
        workerName: row.worker_name,
        lastHeartbeatAt: Number(row.last_heartbeat_at),
        lastActionId: row.last_action_id,
        lastActionStatus: row.last_action_status,
        lastError: row.last_error
      }
    : null;
}

export async function getQueueStats() {
  const rows = await queryAll<Array<{ status: string; count: number | string }>[number]>(
    `SELECT status, COUNT(*) as count
     FROM teleport_actions
     GROUP BY status`
  );

  const stats = {
    queued: 0,
    processing: 0,
    dispatched: 0,
    settled: 0,
    failed: 0,
    total: 0
  };

  for (const row of rows) {
    const count = Number(row.count);
    if (row.status in stats) {
      stats[row.status as keyof typeof stats] = count;
    }
    stats.total += count;
  }

  return stats;
}

export async function getActionSourceStats() {
  const rows = await queryAll<Array<{
    source: string | null;
    status: string;
    count: number | string;
  }>[number]>(
    `SELECT source, status, COUNT(*) as count
     FROM teleport_actions
     GROUP BY source, status`
  );

  const stats = {
    userTotal: 0,
    aiTotal: 0,
    userPending: 0,
    aiPending: 0,
    userFailed: 0,
    aiFailed: 0,
    aiSettled: 0
  };

  for (const row of rows) {
    const count = Number(row.count);
    const source = row.source === "ai" ? "ai" : "user";
    const isPending = ["queued", "processing", "dispatched"].includes(row.status);

    if (source === "ai") {
      stats.aiTotal += count;
      if (isPending) stats.aiPending += count;
      if (row.status === "failed") stats.aiFailed += count;
      if (row.status === "settled") stats.aiSettled += count;
    } else {
      stats.userTotal += count;
      if (isPending) stats.userPending += count;
      if (row.status === "failed") stats.userFailed += count;
    }
  }

  return stats;
}
