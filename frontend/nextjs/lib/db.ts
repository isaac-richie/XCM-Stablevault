import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { Pool, PoolClient, QueryResultRow } from "pg";

const dataDir = path.join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });

const DB_CLIENT = process.env.DB_CLIENT || "sqlite";
const isPostgres = DB_CLIENT === "postgres";

let sqlite: Database.Database | null = null;
let pool: Pool | null = null;
let initialized = false;

export type SqlValue = string | number | null;

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: SqlValue[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

export type DbExecutor = {
  queryAll<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
};

function toPgPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function ensureInit() {
  if (initialized) return;

  if (isPostgres) {
    const connectionString = process.env.DATABASE_URL;
    const useSsl =
      process.env.DATABASE_SSLMODE === "require" ||
      process.env.DATABASE_REQUIRE_SSL === "true" ||
      connectionString?.includes("supabase.co") ||
      connectionString?.includes("pooler.supabase.com");

    pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    });
  } else {
    const dbPath = path.join(dataDir, "stablevault.db");
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
  }

  await applySchema();
  initialized = true;
}

async function applySchema() {
  if (isPostgres) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS teleport_actions (
        id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        ai_decision_id TEXT,
        beneficiary TEXT NOT NULL,
        amount_planck TEXT NOT NULL,
        amount_display TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        signature TEXT NOT NULL,
        origin_tx_hash TEXT,
        origin_block_hash TEXT,
        origin_events_json TEXT,
        before_balance TEXT,
        after_balance TEXT,
        error TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS request_nonces (
        nonce TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at BIGINT
      )`,
      `CREATE TABLE IF NOT EXISTS request_rate_limits (
        requester TEXT PRIMARY KEY,
        window_start BIGINT NOT NULL,
        request_count INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS worker_status (
        worker_name TEXT PRIMARY KEY,
        last_heartbeat_at BIGINT NOT NULL,
        last_action_id TEXT,
        last_action_status TEXT,
        last_error TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS ai_decisions (
        id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        score INTEGER NOT NULL,
        posture TEXT NOT NULL,
        action TEXT NOT NULL,
        beneficiary TEXT NOT NULL,
        suggested_amount_pas TEXT NOT NULL,
        pending_actions INTEGER NOT NULL,
        failed_actions INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        reasons_json TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        queue_pressure TEXT,
        execution_readiness TEXT,
        relayer_health TEXT,
        vault_utilization TEXT,
        auto_queue_eligible INTEGER,
        auto_queue_reason TEXT,
        linked_action_id TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_teleport_actions_requester_created_at
        ON teleport_actions (requester, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_request_nonces_requester_expires_at
        ON request_nonces (requester, expires_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_decisions_requester_created_at
        ON ai_decisions (requester, created_at DESC)`
    ];

    for (const statement of statements) {
      await pool!.query(statement);
    }

    const alterStatements = [
      `ALTER TABLE teleport_actions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'`,
      `ALTER TABLE teleport_actions ADD COLUMN IF NOT EXISTS ai_decision_id TEXT`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS queue_pressure TEXT`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS execution_readiness TEXT`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS relayer_health TEXT`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS vault_utilization TEXT`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS auto_queue_eligible INTEGER`,
      `ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS auto_queue_reason TEXT`
      ,`ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS linked_action_id TEXT`
    ];

    for (const statement of alterStatements) {
      await pool!.query(statement);
    }
    return;
  }

  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS teleport_actions (
      id TEXT PRIMARY KEY,
      requester TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user',
      ai_decision_id TEXT,
      beneficiary TEXT NOT NULL,
      amount_planck TEXT NOT NULL,
      amount_display TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      signature TEXT NOT NULL,
      origin_tx_hash TEXT,
      origin_block_hash TEXT,
      origin_events_json TEXT,
      before_balance TEXT,
      after_balance TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS request_nonces (
      nonce TEXT PRIMARY KEY,
      requester TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS request_rate_limits (
      requester TEXT PRIMARY KEY,
      window_start BIGINT NOT NULL,
      request_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_status (
      worker_name TEXT PRIMARY KEY,
      last_heartbeat_at BIGINT NOT NULL,
      last_action_id TEXT,
      last_action_status TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_decisions (
      id TEXT PRIMARY KEY,
      requester TEXT NOT NULL,
      score INTEGER NOT NULL,
      posture TEXT NOT NULL,
      action TEXT NOT NULL,
      beneficiary TEXT NOT NULL,
      suggested_amount_pas TEXT NOT NULL,
      pending_actions INTEGER NOT NULL,
      failed_actions INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      queue_pressure TEXT,
      execution_readiness TEXT,
      relayer_health TEXT,
      vault_utilization TEXT,
      auto_queue_eligible INTEGER,
      auto_queue_reason TEXT,
      linked_action_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_teleport_actions_requester_created_at
      ON teleport_actions (requester, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_request_nonces_requester_expires_at
      ON request_nonces (requester, expires_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_decisions_requester_created_at
      ON ai_decisions (requester, created_at DESC);
  `);

  const sqliteAlterStatements = [
    `ALTER TABLE teleport_actions ADD COLUMN source TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE teleport_actions ADD COLUMN ai_decision_id TEXT`,
    `ALTER TABLE ai_decisions ADD COLUMN queue_pressure TEXT`,
    `ALTER TABLE ai_decisions ADD COLUMN execution_readiness TEXT`,
    `ALTER TABLE ai_decisions ADD COLUMN relayer_health TEXT`,
    `ALTER TABLE ai_decisions ADD COLUMN vault_utilization TEXT`,
    `ALTER TABLE ai_decisions ADD COLUMN auto_queue_eligible INTEGER`,
    `ALTER TABLE ai_decisions ADD COLUMN auto_queue_reason TEXT`
    ,`ALTER TABLE ai_decisions ADD COLUMN linked_action_id TEXT`
  ];

  for (const statement of sqliteAlterStatements) {
    try {
      sqlite!.exec(statement);
    } catch (error: any) {
      if (!String(error?.message || "").includes("duplicate column name")) {
        throw error;
      }
    }
  }
}

function createExecutor(queryable: Queryable): DbExecutor {
  return {
    async queryAll<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const result = await queryable.query<T & QueryResultRow>(sql, params);
      return result.rows as T[];
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      const rows = await this.queryAll<T>(sql, params);
      return rows[0];
    },
    async run(sql: string, params: SqlValue[] = []) {
      const result = await queryable.query(sql, params);
      return { changes: result.rowCount || 0 };
    }
  };
}

async function getPgExecutor(client?: PoolClient): Promise<DbExecutor> {
  await ensureInit();
  const queryable: Queryable = {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params: SqlValue[] = []) {
      const executor = client ?? pool!;
      const result = await executor.query<T>(toPgPlaceholders(text), params);
      return { rows: result.rows, rowCount: result.rowCount };
    }
  };
  return createExecutor(queryable);
}

async function getSqliteExecutor(): Promise<DbExecutor> {
  await ensureInit();
  return {
    async queryAll<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      return sqlite!.prepare(sql).all(...params) as T[];
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
      return sqlite!.prepare(sql).get(...params) as T | undefined;
    },
    async run(sql: string, params: SqlValue[] = []) {
      const result = sqlite!.prepare(sql).run(...params);
      return { changes: result.changes };
    }
  };
}

export async function getDbExecutor(client?: PoolClient): Promise<DbExecutor> {
  if (isPostgres) {
    return getPgExecutor(client);
  }
  return getSqliteExecutor();
}

export async function queryAll<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
  const executor = await getDbExecutor();
  return executor.queryAll<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []) {
  const executor = await getDbExecutor();
  return executor.queryOne<T>(sql, params);
}

export async function run(sql: string, params: SqlValue[] = []) {
  const executor = await getDbExecutor();
  return executor.run(sql, params);
}

export async function transaction<T>(fn: (executor: DbExecutor) => Promise<T>) {
  await ensureInit();

  if (isPostgres) {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      const executor = await getPgExecutor(client);
      const result = await fn(executor);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const executor = await getSqliteExecutor();
  return fn(executor);
}

export function getDbClient() {
  return DB_CLIENT;
}
