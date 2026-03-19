import { randomUUID } from "crypto";
import { queryOne, run } from "./db";

const nonceTtlMs = 5 * 60 * 1000;

type NonceRow = {
  nonce: string;
  requester: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
};

export async function issueNonce(requester: string) {
  const now = Date.now();
  await run(`DELETE FROM request_nonces WHERE expires_at <= ? OR used_at IS NOT NULL`, [now]);

  const record = {
    nonce: randomUUID(),
    requester: requester.toLowerCase(),
    created_at: now,
    expires_at: now + nonceTtlMs
  };

  await run(
    `INSERT INTO request_nonces (nonce, requester, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [record.nonce, record.requester, record.created_at, record.expires_at]
  );

  return {
    nonce: record.nonce,
    requester: record.requester,
    createdAt: record.created_at,
    expiresAt: record.expires_at
  };
}

export async function consumeNonce(requester: string, nonce: string) {
  const now = Date.now();
  const row = await queryOne<NonceRow>(
    `SELECT * FROM request_nonces
     WHERE nonce = ? AND requester = ? AND used_at IS NULL AND expires_at > ?`,
    [nonce, requester.toLowerCase(), now]
  );

  if (!row) return null;

  await run(`UPDATE request_nonces SET used_at = ? WHERE nonce = ?`, [now, nonce]);
  return {
    nonce: row.nonce,
    requester: row.requester,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: now
  };
}
