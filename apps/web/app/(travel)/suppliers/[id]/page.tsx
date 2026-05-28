import type { JSX } from "react";
import { notFound } from "next/navigation";
import {
  getSupplierById,
  getNetRates,
  getAvailabilityWindows,
  calculateMarginPct,
  type NetRate,
  type AvailabilityWindow,
  type SupplierType,
} from "@/lib/travel/supplier-margin";

export const dynamic = "force-dynamic";

const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  tour_operator: "Tour Operator",
  boutique_hotel: "Boutique Hotel",
  local_guide: "Local Guide",
  transport: "Transport",
  restaurant: "Restaurant",
  activity: "Activity",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  params: { id: string };
}

export default async function SupplierDetailPage({
  params,
}: Props): Promise<JSX.Element> {
  let supplier = null;
  let netRates: NetRate[] = [];
  let availability: AvailabilityWindow[] = [];

  try {
    supplier = await getSupplierById(params.id);
    if (!supplier) return notFound();
    [netRates, availability] = await Promise.all([
      getNetRates(params.id),
      getAvailabilityWindows(params.id),
    ]);
  } catch {
    if (!supplier) return notFound();
  }

  const totalMarginRevenue = netRates.reduce(
    (acc, r) => acc + (r.public_rate - r.net_rate),
    0,
  );
  const avgMarginPct =
    netRates.length > 0
      ? netRates.reduce(
          (acc, r) => acc + calculateMarginPct(r.net_rate, r.public_rate),
          0,
        ) / netRates.length
      : 0;

  const currency = supplier.currency || "USD";

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
      }}
    >
      <nav style={{ marginBottom: "1.5rem" }}>
        <a
          href="/suppliers"
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Supplier Registry
        </a>
      </nav>

      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
            {supplier.name}
          </h1>
          <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 12,
                background: "#eff6ff",
                color: "#1d4ed8",
              }}
            >
              {SUPPLIER_TYPE_LABELS[supplier.type] ?? supplier.type}
            </span>
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              📍 {supplier.location}
            </span>
            {!supplier.is_active && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: "#fef2f2",
                  color: "#b91c1c",
                }}
              >
                Inactive
              </span>
            )}
          </div>
          {supplier.description && (
            <p style={{ marginTop: 10, fontSize: 14, opacity: 0.7, maxWidth: 600 }}>
              {supplier.description}
            </p>
          )}
        </div>

        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "1rem 1.5rem",
            minWidth: 180,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Avg Margin
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: avgMarginPct >= 20 ? "#15803d" : "#374151" }}>
            {avgMarginPct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            across {netRates.length} service{netRates.length !== 1 ? "s" : ""}
          </div>
        </div>
      </header>

      {(supplier.contact_email || supplier.contact_phone || supplier.website_url) && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 0.75rem" }}>
            Contact
          </h2>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: 14 }}>
            {supplier.contact_email && (
              <a
                href={`mailto:${supplier.contact_email}`}
                style={{ color: "#2563eb", textDecoration: "none" }}
              >
                ✉️ {supplier.contact_email}
              </a>
            )}
            {supplier.contact_phone && (
              <span style={{ color: "#374151" }}>📞 {supplier.contact_phone}</span>
            )}
            {supplier.website_url && (
              <a
                href={supplier.website_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2563eb", textDecoration: "none" }}
              >
                🌐 Website
              </a>
            )}
          </div>
        </section>
      )}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 0.75rem" }}>
          Net Rates & Margins
        </h2>
        {netRates.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>No net rates on file.</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    {["Service", "Public Rate", "Net Rate", "Margin", "Valid From", "Valid Until"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "9px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "#6b7280",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {netRates.map((rate) => {
                    const marginPct = calculateMarginPct(rate.net_rate, rate.public_rate);
                    const rateColor =
                      marginPct >= 30 ? "#15803d" : marginPct >= 15 ? "#b45309" : "#6b7280";
                    return (
                      <tr key={rate.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                          {rate.service_name}
                          {rate.description && (
                            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                              {rate.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {rate.currency} {rate.public_rate.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {rate.currency} {rate.net_rate.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: rateColor }}>
                          {marginPct.toFixed(1)}%
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                          {rate.valid_from
                            ? new Date(rate.valid_from).toLocaleDateString("en-US", { dateStyle: "medium" })
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                          {rate.valid_until
                            ? new Date(rate.valid_until).toLocaleDateString("en-US", { dateStyle: "medium" })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {netRates.length > 0 && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: "#f0fdf4",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#15803d",
                  display: "flex",
                  gap: "1.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  <strong>Avg margin:</strong> {avgMarginPct.toFixed(1)}%
                </span>
                <span>
                  <strong>Total margin revenue:</strong> {currency}{" "}
                  {totalMarginRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 0.75rem" }}>
          Availability Windows
        </h2>
        {availability.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            No upcoming availability windows on file.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {availability.map((win) => (
              <div
                key={win.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.875rem 1rem",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {new Date(win.start_date).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  {" — "}
                  {new Date(win.end_date).toLocaleDateString("en-US", { dateStyle: "medium" })}
                </div>
                {win.days_of_week && win.days_of_week.length > 0 && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Days:{" "}
                    {win.days_of_week.map((d) => DAY_NAMES[d] ?? d).join(", ")}
                  </div>
                )}
                {win.max_capacity != null && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    Capacity: {win.max_capacity}
                  </div>
                )}
                {win.notes && (
                  <div style={{ fontSize: 12, color: "#374151", marginTop: 6, opacity: 0.8 }}>
                    {win.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
