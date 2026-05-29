/**
 * Disclosures index — booking-level disclosures listing.
 *
 * Hotfix 2026-05-28: previously /disclosures returned 404 because only the
 * dynamic [bookingId]/page.tsx existed. This index page lists recent
 * disclosure records so the nav link doesn't 404. Render-safe on missing
 * tables (try/catch around the DB query).
 */
import Link from "next/link";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

type DisclosureRow = {
  booking_id: string;
  customer_state: string | null;
  acknowledged: boolean;
  created_at: string;
};

async function fetchRecentDisclosures(): Promise<DisclosureRow[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await pool.query<DisclosureRow>(
        `SELECT booking_id::text, customer_state, acknowledged, created_at::text
           FROM travel_booking_disclosures
          ORDER BY created_at DESC
          LIMIT 50`,
      );
      return rows;
    } finally {
      await pool.end();
    }
  } catch {
    return [];
  }
}

export default async function DisclosuresIndexPage(): Promise<JSX.Element> {
  const rows = await fetchRecentDisclosures();
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Booking Disclosures
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
        Jurisdiction-specific regulatory disclosures generated for each booking
        (Seller of Travel, DOT, EU Package Travel). Open a specific booking to
        view its full disclosure record.
      </p>
      {rows.length === 0 ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "1.5rem",
            background: "#f9fafb",
            color: "#6b7280",
          }}
        >
          No disclosures yet. They appear here once bookings are created.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Booking</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Customer State</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Acknowledged</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.booking_id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <Link
                    href={`/disclosures/${r.booking_id}`}
                    style={{ color: "#2563eb", textDecoration: "underline" }}
                  >
                    {r.booking_id.slice(0, 8)}
                  </Link>
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>{r.customer_state ?? "—"}</td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  {r.acknowledged ? "Yes" : "No"}
                </td>
                <td style={{ padding: "0.5rem 0.75rem", color: "#6b7280" }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
