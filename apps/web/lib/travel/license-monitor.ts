import type { Pool } from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): Pool {
  if (_pool) return _pool as Pool;
  const { Pool: PgPool } = eval("require")("pg") as { Pool: new (cfg: Record<string, unknown>) => Pool };
  _pool = new PgPool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 });
  return _pool as Pool;
}

export interface SellerOfTravelLicense {
  readonly id: string;
  readonly state: string;
  readonly license_number: string;
  readonly expiry_date: string;
  readonly days_until_expiry: number;
  readonly status: "active" | "expiring_soon" | "expired";
  readonly bond_amount_usd: number | null;
  readonly trust_account_required: boolean;
}

export interface AccreditationStatus {
  readonly id: string;
  readonly type: "IATA" | "ARC";
  readonly accreditation_number: string;
  readonly expiry_date: string;
  readonly days_until_expiry: number;
  readonly status: "active" | "expiring_soon" | "expired";
}

export interface TrustAccountStatus {
  readonly id: string;
  readonly state: string;
  readonly required_balance_usd: number;
  readonly current_balance_usd: number;
  readonly compliant: boolean;
  readonly shortfall_usd: number;
}

export interface DisclosureAcknowledgmentRate {
  readonly booking_cohort: string;
  readonly total_bookings: number;
  readonly acknowledged_count: number;
  readonly acknowledgment_rate: number;
  readonly pending_count: number;
}

export interface ComplianceDashboardData {
  readonly licenses: SellerOfTravelLicense[];
  readonly accreditations: AccreditationStatus[];
  readonly trustAccounts: TrustAccountStatus[];
  readonly disclosureRates: DisclosureAcknowledgmentRate[];
  readonly fetchedAt: string;
}

export interface ExpiringLicense {
  readonly id: string;
  readonly state: string;
  readonly license_number: string;
  readonly expiry_date: string;
  readonly days_until_expiry: number;
  readonly agent_user_id: string;
  readonly agent_email: string;
}

export async function fetchLicenses(): Promise<SellerOfTravelLicense[]> {
  const pool = getPool();
  const result = await (pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
    `SELECT
       id,
       state,
       license_number,
       expiry_date::text,
       (expiry_date - CURRENT_DATE)::int AS days_until_expiry,
       bond_amount_usd,
       trust_account_required,
       CASE
         WHEN expiry_date < CURRENT_DATE THEN 'expired'
         WHEN expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'expiring_soon'
         ELSE 'active'
       END AS status
     FROM travel_seller_of_travel_licenses
     ORDER BY expiry_date ASC`,
    [],
  );
  return result.rows as SellerOfTravelLicense[];
}

export async function fetchAccreditations(): Promise<AccreditationStatus[]> {
  const pool = getPool();
  const result = await (pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
    `SELECT
       id,
       type,
       accreditation_number,
       expiry_date::text,
       (expiry_date - CURRENT_DATE)::int AS days_until_expiry,
       CASE
         WHEN expiry_date < CURRENT_DATE THEN 'expired'
         WHEN expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'expiring_soon'
         ELSE 'active'
       END AS status
     FROM travel_accreditations
     ORDER BY expiry_date ASC`,
    [],
  );
  return result.rows as AccreditationStatus[];
}

export async function fetchTrustAccountStatus(): Promise<TrustAccountStatus[]> {
  const pool = getPool();
  const result = await (pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
    `SELECT
       id,
       state,
       required_balance_usd,
       current_balance_usd,
       (current_balance_usd >= required_balance_usd) AS compliant,
       GREATEST(0, required_balance_usd - current_balance_usd) AS shortfall_usd
     FROM travel_trust_accounts
     ORDER BY state ASC`,
    [],
  );
  return result.rows as TrustAccountStatus[];
}

export async function fetchDisclosureAcknowledgmentRates(): Promise<DisclosureAcknowledgmentRate[]> {
  const pool = getPool();
  const result = await (pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
    `SELECT
       booking_cohort,
       COUNT(*)::int AS total_bookings,
       COUNT(*) FILTER (WHERE disclosure_acknowledged_at IS NOT NULL)::int AS acknowledged_count,
       ROUND(
         100.0 * COUNT(*) FILTER (WHERE disclosure_acknowledged_at IS NOT NULL)
         / NULLIF(COUNT(*), 0), 1
       ) AS acknowledgment_rate,
       COUNT(*) FILTER (WHERE disclosure_acknowledged_at IS NULL)::int AS pending_count
     FROM travel_bookings
     GROUP BY booking_cohort
     ORDER BY booking_cohort DESC
     LIMIT 12`,
    [],
  );
  return result.rows as DisclosureAcknowledgmentRate[];
}

export async function fetchExpiringLicenses(withinDays: number): Promise<ExpiringLicense[]> {
  const pool = getPool();
  const result = await (pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }).query(
    `SELECT
       l.id,
       l.state,
       l.license_number,
       l.expiry_date::text,
       (l.expiry_date - CURRENT_DATE)::int AS days_until_expiry,
       l.agent_user_id,
       u.email AS agent_email
     FROM travel_seller_of_travel_licenses l
     JOIN users u ON u.id = l.agent_user_id
     WHERE l.expiry_date >= CURRENT_DATE
       AND l.expiry_date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
     ORDER BY l.expiry_date ASC`,
    [withinDays],
  );
  return result.rows as ExpiringLicense[];
}

export async function fetchComplianceDashboard(): Promise<ComplianceDashboardData> {
  const [licenses, accreditations, trustAccounts, disclosureRates] = await Promise.all([
    fetchLicenses(),
    fetchAccreditations(),
    fetchTrustAccountStatus(),
    fetchDisclosureAcknowledgmentRates(),
  ]);
  return { licenses, accreditations, trustAccounts, disclosureRates, fetchedAt: new Date().toISOString() };
}
