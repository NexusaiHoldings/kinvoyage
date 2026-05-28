// Niche Supplier Registry — margin tracking and net rate management

export type SupplierType =
  | "tour_operator"
  | "boutique_hotel"
  | "local_guide"
  | "transport"
  | "restaurant"
  | "activity";

export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  location: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NetRate {
  id: string;
  supplier_id: string;
  service_name: string;
  description: string | null;
  public_rate: number;
  net_rate: number;
  currency: string;
  valid_from: string | null;
  valid_until: string | null;
}

export interface AvailabilityWindow {
  id: string;
  supplier_id: string;
  start_date: string;
  end_date: string;
  days_of_week: number[];
  max_capacity: number | null;
  notes: string | null;
}

export interface SupplierMarginSummary {
  supplier_id: string;
  supplier_name: string;
  supplier_type: SupplierType;
  location: string;
  avg_margin_pct: number;
  best_margin_pct: number;
  best_margin_service: string | null;
  total_services: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_pool) return _pool;
  // eval("require") bypasses webpack bundling — pg uses Node built-ins unavailable in edge runtime
  const { Pool: PgPool } = eval("require")("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

export function calculateMarginPct(netRate: number, publicRate: number): number {
  if (publicRate <= 0) return 0;
  return Math.round(((publicRate - netRate) / publicRate) * 10000) / 100;
}

export async function listSuppliers(filters?: {
  type?: SupplierType;
  location?: string;
  activeOnly?: boolean;
}): Promise<Supplier[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.activeOnly !== false) {
    conditions.push("is_active = true");
  }
  if (filters?.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }
  if (filters?.location) {
    params.push(`%${filters.location}%`);
    conditions.push(`location ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT id, name, type, location, description, contact_email, contact_phone,
           website_url, currency, is_active,
           created_at::text, updated_at::text
    FROM travel_suppliers
    ${where}
    ORDER BY name ASC
  `;
  const res = await pool.query(sql, params);
  return res.rows as Supplier[];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, name, type, location, description, contact_email, contact_phone,
            website_url, currency, is_active,
            created_at::text, updated_at::text
     FROM travel_suppliers WHERE id = $1`,
    [id],
  );
  return (res.rows[0] as Supplier) ?? null;
}

export async function getNetRates(supplierId: string): Promise<NetRate[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, supplier_id, service_name, description,
            public_rate::float, net_rate::float, currency,
            valid_from::text, valid_until::text
     FROM travel_supplier_net_rates
     WHERE supplier_id = $1
     ORDER BY service_name ASC`,
    [supplierId],
  );
  return res.rows as NetRate[];
}

export async function getAvailabilityWindows(
  supplierId: string,
): Promise<AvailabilityWindow[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, supplier_id,
            start_date::text, end_date::text,
            days_of_week, max_capacity, notes
     FROM travel_supplier_availability
     WHERE supplier_id = $1
       AND end_date >= CURRENT_DATE
     ORDER BY start_date ASC`,
    [supplierId],
  );
  return res.rows as AvailabilityWindow[];
}

export async function getSupplierMarginSummaries(filters?: {
  type?: SupplierType;
}): Promise<SupplierMarginSummary[]> {
  const pool = getPool();
  const params: unknown[] = [];
  let typeFilter = "";
  if (filters?.type) {
    params.push(filters.type);
    typeFilter = `AND s.type = $${params.length}`;
  }

  const sql = `
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      s.type AS supplier_type,
      s.location,
      COALESCE(
        ROUND(
          AVG(
            CASE WHEN r.public_rate > 0
              THEN ((r.public_rate - r.net_rate) / r.public_rate) * 100
              ELSE 0
            END
          )::numeric, 2
        ), 0
      )::float AS avg_margin_pct,
      COALESCE(
        ROUND(
          MAX(
            CASE WHEN r.public_rate > 0
              THEN ((r.public_rate - r.net_rate) / r.public_rate) * 100
              ELSE 0
            END
          )::numeric, 2
        ), 0
      )::float AS best_margin_pct,
      (
        SELECT r2.service_name
        FROM travel_supplier_net_rates r2
        WHERE r2.supplier_id = s.id AND r2.public_rate > 0
        ORDER BY ((r2.public_rate - r2.net_rate) / r2.public_rate) DESC
        LIMIT 1
      ) AS best_margin_service,
      COUNT(r.id)::int AS total_services
    FROM travel_suppliers s
    LEFT JOIN travel_supplier_net_rates r ON r.supplier_id = s.id
    WHERE s.is_active = true ${typeFilter}
    GROUP BY s.id, s.name, s.type, s.location
    ORDER BY avg_margin_pct DESC
  `;

  const res = await pool.query(sql, params);
  return (res.rows as Record<string, unknown>[]).map((row) => ({
    supplier_id: String(row.supplier_id),
    supplier_name: String(row.supplier_name),
    supplier_type: row.supplier_type as SupplierType,
    location: String(row.location),
    avg_margin_pct: Number(row.avg_margin_pct ?? 0),
    best_margin_pct: Number(row.best_margin_pct ?? 0),
    best_margin_service: row.best_margin_service != null ? String(row.best_margin_service) : null,
    total_services: Number(row.total_services ?? 0),
  }));
}

export async function getMarginOptimizedSuppliers(options?: {
  serviceType?: SupplierType;
  date?: string;
  limit?: number;
}): Promise<SupplierMarginSummary[]> {
  const summaries = await getSupplierMarginSummaries({ type: options?.serviceType });
  const cap = options?.limit ?? 10;
  return summaries.slice(0, cap);
}
