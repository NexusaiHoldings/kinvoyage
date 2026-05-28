import type { JSX } from "react";
import {
  listSuppliers,
  getSupplierMarginSummaries,
  type Supplier,
  type SupplierMarginSummary,
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

function MarginBadge({ pct }: { pct: number }): JSX.Element {
  const color =
    pct >= 30
      ? "#15803d"
      : pct >= 15
        ? "#b45309"
        : "#6b7280";
  const bg =
    pct >= 30
      ? "#dcfce7"
      : pct >= 15
        ? "#fef3c7"
        : "#f3f4f6";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
      }}
    >
      {pct.toFixed(1)}% margin
    </span>
  );
}

export default async function SuppliersPage(): Promise<JSX.Element> {
  let suppliers: Supplier[] = [];
  let marginSummaries: SupplierMarginSummary[] = [];

  try {
    [suppliers, marginSummaries] = await Promise.all([
      listSuppliers({ activeOnly: true }),
      getSupplierMarginSummaries(),
    ]);
  } catch {
    // Tables may not exist in preview environments — render empty state
  }

  const marginBySupplier = new Map<string, SupplierMarginSummary>(
    marginSummaries.map((s) => [s.supplier_id, s]),
  );

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Supplier Registry
        </h1>
        <p style={{ marginTop: 6, opacity: 0.6, fontSize: 14 }}>
          Curated niche suppliers — tour operators, boutique hotels, and local
          guides with net rates and margin tracking.
        </p>
      </header>

      {suppliers.length === 0 ? (
        <div
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: 12,
            border: "1px dashed #d1d5db",
          }}
        >
          <p style={{ opacity: 0.6, fontSize: 15 }}>
            No suppliers found. Add your first niche supplier to begin building
            your competitive registry.
          </p>
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
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["Supplier", "Type", "Location", "Services", "Avg Margin", "Best Margin", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontWeight: 600,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
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
              {suppliers.map((supplier) => {
                const margin = marginBySupplier.get(supplier.id);
                return (
                  <tr
                    key={supplier.id}
                    style={{ borderBottom: "1px solid #e5e7eb" }}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 500 }}>
                      {supplier.name}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#6b7280" }}>
                      {SUPPLIER_TYPE_LABELS[supplier.type] ?? supplier.type}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#6b7280" }}>
                      {supplier.location}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {margin ? margin.total_services : "—"}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {margin && margin.avg_margin_pct > 0 ? (
                        <MarginBadge pct={margin.avg_margin_pct} />
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {margin && margin.best_margin_pct > 0 ? (
                        <span style={{ fontSize: 13, color: "#374151" }}>
                          <MarginBadge pct={margin.best_margin_pct} />
                          {margin.best_margin_service && (
                            <span style={{ marginLeft: 6, opacity: 0.6 }}>
                              {margin.best_margin_service}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <a
                        href={`/suppliers/${supplier.id}`}
                        style={{
                          fontSize: 13,
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
