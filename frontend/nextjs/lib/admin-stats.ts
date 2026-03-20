import { queryAll } from "./db";

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
