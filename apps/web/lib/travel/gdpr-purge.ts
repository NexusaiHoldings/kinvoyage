/**
 * GDPR purge helpers for traveler PII.
 *
 * Provides two levels of erasure:
 *   purgeTravelerPii   — nullifies encrypted fields, retains booking metadata
 *   purgeTravelerRecord — hard-deletes the entire row
 *
 * Uses the same pg pool pattern as apps/web/lib/db.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
} {
  if (_pool) return _pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Pool: PgPool } = eval("require")("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
    };
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

/**
 * Nullifies all encrypted PII fields for a traveler record, sets purged_at timestamp.
 * Retains booking metadata (booking_id, created_at, id) for audit purposes.
 */
export async function purgeTravelerPii(travelerId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE travel_travelers
     SET
       passport_number_encrypted = NULL,
       payment_reference_encrypted = NULL,
       first_name = NULL,
       last_name = NULL,
       email = NULL,
       phone = NULL,
       date_of_birth = NULL,
       nationality = NULL,
       passport_expiry = NULL,
       dietary_requirements = NULL,
       accessibility_needs = NULL,
       emergency_contact_name = NULL,
       emergency_contact_phone = NULL,
       emergency_contact_relationship = NULL,
       purged_at = NOW(),
       updated_at = NOW()
     WHERE id = $1
       AND purged_at IS NULL`,
    [travelerId]
  );
}

/**
 * Hard-deletes a traveler record. Use only when required by a GDPR erasure
 * request AND no legal-hold obligation prevents deletion.
 */
export async function purgeTravelerRecord(travelerId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM travel_travelers WHERE id = $1`,
    [travelerId]
  );
}

/**
 * Logs a scheduled purge request in travel_gdpr_purge_log.
 * A cron job (apps/web/app/api/cron/booking-sync/route.ts) executes
 * pending purges when their scheduled_at timestamp is reached.
 */
export async function schedulePurge(
  travelerId: string,
  reason: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO travel_gdpr_purge_log
       (id, traveler_id, reason, scheduled_at, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, NOW() + INTERVAL '30 days', NOW())
     ON CONFLICT (traveler_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           scheduled_at = EXCLUDED.scheduled_at,
           created_at = EXCLUDED.created_at`,
    [travelerId, reason]
  );
}
