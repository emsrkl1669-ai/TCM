import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function resolveSqlHost(): string | undefined {
  const envHost = process.env.SQL_HOST;
  if (envHost) {
    if (!envHost.startsWith('/') || fs.existsSync(path.join(envHost, '.s.PGSQL.5432'))) {
      return envHost;
    }
  }
  const cloudSqlRoot = '/app/cloudsql';
  if (fs.existsSync(cloudSqlRoot)) {
    try {
      const dirs = fs.readdirSync(cloudSqlRoot);
      for (const d of dirs) {
        const candidate = path.join(cloudSqlRoot, d);
        if (fs.existsSync(path.join(candidate, '.s.PGSQL.5432'))) {
          return candidate;
        }
      }
    } catch {
      // Ignore directory scan errors
    }
  }
  return envHost;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const host = resolveSqlHost();
    global._postgresPool = new Pool({
      host,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 3000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

let pgAvailableCache: { ok: boolean; checkedAt: number } | null = null;
const PG_RECHECK_MS = 60_000;

export function markPostgresUnavailable(): void {
  pgAvailableCache = { ok: false, checkedAt: Date.now() };
}

export function isPostgresConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; cause?: unknown };
  const msg = String(err.message || '');
  const code = String(err.code || '');
  if (
    code === 'ENOENT' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    msg.includes('ENOENT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('connection timeout') ||
    msg.includes('Failed to initialize clinic database')
  ) {
    return true;
  }
  if (err.cause && err.cause !== error) {
    return isPostgresConnectionError(err.cause);
  }
  return false;
}

export async function isPostgresReady(): Promise<boolean> {
  const now = Date.now();
  if (pgAvailableCache && now - pgAvailableCache.checkedAt < PG_RECHECK_MS) {
    return pgAvailableCache.ok;
  }

  const host = resolveSqlHost();
  if (!host || (host.startsWith('/') && !fs.existsSync(path.join(host, '.s.PGSQL.5432')))) {
    pgAvailableCache = { ok: false, checkedAt: now };
    return false;
  }

  try {
    await pool.query('SELECT 1');
    pgAvailableCache = { ok: true, checkedAt: now };
    return true;
  } catch {
    pgAvailableCache = { ok: false, checkedAt: now };
    return false;
  }
}

export const db = drizzle(pool, { schema });
export { pool };
