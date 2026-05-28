/**
 * Travelers list page — server component.
 * Lists all traveler records (non-purged) with masked PII.
 * PII fields (passport_number, payment_reference) are NOT shown in list view.
 */

import Link from "next/link";
import type { JSX } from "react";

interface TravelerRow {
  id: string;
  booking_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  nationality: string | null;
  created_at: string;
  purged_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_pool) return _pool;
  const { Pool: PgPool } = eval("require")("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

async function listTravelers(): Promise<TravelerRow[]> {
  try {
    const pool = getPool();
    const result = await pool.query<TravelerRow>(
      `SELECT
         id,
         booking_id,
         first_name,
         last_name,
         email,
         nationality,
         created_at,
         purged_at
       FROM travel_travelers
       WHERE purged_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return result.rows as TravelerRow[];
  } catch {
    return [];
  }
}

export const metadata = {
  title: "Travelers | Travel Management",
  description: "Manage traveler profiles and PII vault",
};

export default async function TravelersPage(): Promise<JSX.Element> {
  const travelers = await listTravelers();

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Travelers
          </h1>
          <p style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
            PII Vault — passport and payment data is encrypted at rest (AES-256-GCM)
          </p>
        </div>
        <span
          style={{
            fontSize: 12,
            background: "#fef3c7",
            color: "#92400e",
            padding: "0.3rem 0.7rem",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          Sensitive data — authorized access only
        </span>
      </header>

      {travelers.length === 0 ? (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            background: "rgba(0,0,0,0.03)",
            borderRadius: 8,
            fontSize: 14,
            opacity: 0.6,
          }}
        >
          No traveler records found.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid rgba(0,0,0,0.1)",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Nationality</th>
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Booking ID</th>
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Added</th>
                <th style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {travelers.map((t) => (
                <tr
                  key={t.id}
                  style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
                >
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {t.first_name || t.last_name
                      ? `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim()
                      : <em style={{ opacity: 0.5 }}>—</em>}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", opacity: 0.8 }}>
                    {t.email ?? <em style={{ opacity: 0.5 }}>—</em>}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {t.nationality ?? <em style={{ opacity: 0.5 }}>—</em>}
                  </td>
                  <td
                    style={{
                      padding: "0.75rem 1rem",
                      fontFamily: "monospace",
                      fontSize: 12,
                      opacity: 0.7,
                    }}
                  >
                    {t.booking_id
                      ? t.booking_id.slice(0, 8) + "…"
                      : <em style={{ opacity: 0.5 }}>—</em>}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: 12, opacity: 0.7 }}>
                    {new Date(t.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <Link
                      href={`/travelers/${t.id}`}
                      style={{
                        color: "#2563eb",
                        textDecoration: "none",
                        fontWeight: 500,
                        fontSize: 13,
                      }}
                    >
                      View profile →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
