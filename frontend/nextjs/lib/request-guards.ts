import { queryOne, run } from "./db";

const WINDOW_MS = Number(process.env.ACTION_RATE_WINDOW_MS || "300000");
const MAX_REQUESTS_PER_WINDOW = Number(process.env.ACTION_RATE_MAX_REQUESTS || "3");
const MAX_PENDING_ACTIONS = Number(process.env.ACTION_RATE_MAX_PENDING || "2");

export function getGuardConfig() {
  return {
    windowMs: WINDOW_MS,
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    maxPendingActions: MAX_PENDING_ACTIONS
  };
}

export async function checkAndConsumeRateLimit(requester: string) {
  const key = requester.toLowerCase();
  const now = Date.now();
  const row = await queryOne<{
    requester: string;
    window_start: number;
    request_count: number;
  }>(
    `SELECT requester, window_start, request_count
     FROM request_rate_limits
     WHERE requester = ?`,
    [key]
  );

  if (!row || now - Number(row.window_start) >= WINDOW_MS) {
    await run(
      `INSERT INTO request_rate_limits (requester, window_start, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(requester) DO UPDATE SET window_start = excluded.window_start, request_count = 1`,
      [key, now]
    );
    return { ok: true as const, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (Number(row.request_count) >= MAX_REQUESTS_PER_WINDOW) {
    return {
      ok: false as const,
      retryAfterMs: WINDOW_MS - (now - Number(row.window_start)),
      error: `Rate limit exceeded. Try again in ${Math.ceil(
        (WINDOW_MS - (now - Number(row.window_start))) / 1000
      )}s.`
    };
  }

  await run(
    `UPDATE request_rate_limits SET request_count = request_count + 1 WHERE requester = ?`,
    [key]
  );

  return {
    ok: true as const,
    remaining: MAX_REQUESTS_PER_WINDOW - (Number(row.request_count) + 1)
  };
}

export async function checkPendingQuota(requester: string) {
  const key = requester.toLowerCase();
  const row = await queryOne<{ count: number | string }>(
    `SELECT COUNT(*) as count
     FROM teleport_actions
     WHERE lower(requester) = lower(?)
       AND status IN ('queued', 'processing', 'dispatched')`,
    [key]
  );

  if (Number(row?.count || 0) >= MAX_PENDING_ACTIONS) {
    return {
      ok: false as const,
      error: `Too many in-flight cross-chain requests. Wait for an existing request to settle before submitting another.`
    };
  }

  return { ok: true as const, count: Number(row?.count || 0) };
}
