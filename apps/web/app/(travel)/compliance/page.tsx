import { fetchComplianceDashboard } from "@/lib/travel/license-monitor";
import type {
  SellerOfTravelLicense,
  AccreditationStatus,
  TrustAccountStatus,
  DisclosureAcknowledgmentRate,
} from "@/lib/travel/license-monitor";

export const dynamic = "force-dynamic";

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: "active" | "expiring_soon" | "expired"): string {
  if (status === "expired") return "Expired";
  if (status === "expiring_soon") return "Expiring Soon";
  return "Active";
}

function statusColor(status: "active" | "expiring_soon" | "expired"): string {
  if (status === "expired") return "#dc2626";
  if (status === "expiring_soon") return "#d97706";
  return "#16a34a";
}

function LicenseTable({ licenses }: { readonly licenses: SellerOfTravelLicense[] }) {
  if (licenses.length === 0) {
    return <p style={{ color: "#6b7280", fontStyle: "italic" }}>No licenses on record.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ background: "#f3f4f6" }}>
          <th style={thStyle}>State</th>
          <th style={thStyle}>License #</th>
          <th style={thStyle}>Expiry Date</th>
          <th style={thStyle}>Days Left</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Bond (USD)</th>
          <th style={thStyle}>Trust Acct</th>
        </tr>
      </thead>
      <tbody>
        {licenses.map((lic) => (
          <tr key={lic.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
            <td style={tdStyle}>{lic.state}</td>
            <td style={tdStyle}>{lic.license_number}</td>
            <td style={tdStyle}>{fmtDate(lic.expiry_date)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{lic.days_until_expiry}</td>
            <td style={{ ...tdStyle, color: statusColor(lic.status), fontWeight: 600 }}>
              {statusLabel(lic.status)}
            </td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              {lic.bond_amount_usd != null ? `$${lic.bond_amount_usd.toLocaleString()}` : "—"}
            </td>
            <td style={{ ...tdStyle, textAlign: "center" }}>
              {lic.trust_account_required ? "Required" : "No"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccreditationTable({ accreditations }: { readonly accreditations: AccreditationStatus[] }) {
  if (accreditations.length === 0) {
    return <p style={{ color: "#6b7280", fontStyle: "italic" }}>No accreditations on record.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ background: "#f3f4f6" }}>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Accreditation #</th>
          <th style={thStyle}>Expiry Date</th>
          <th style={thStyle}>Days Left</th>
          <th style={thStyle}>Status</th>
        </tr>
      </thead>
      <tbody>
        {accreditations.map((acc) => (
          <tr key={acc.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
            <td style={tdStyle}>{acc.type}</td>
            <td style={tdStyle}>{acc.accreditation_number}</td>
            <td style={tdStyle}>{fmtDate(acc.expiry_date)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{acc.days_until_expiry}</td>
            <td style={{ ...tdStyle, color: statusColor(acc.status), fontWeight: 600 }}>
              {statusLabel(acc.status)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrustAccountTable({ trustAccounts }: { readonly trustAccounts: TrustAccountStatus[] }) {
  if (trustAccounts.length === 0) {
    return <p style={{ color: "#6b7280", fontStyle: "italic" }}>No trust accounts on record.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ background: "#f3f4f6" }}>
          <th style={thStyle}>State</th>
          <th style={thStyle}>Required Balance</th>
          <th style={thStyle}>Current Balance</th>
          <th style={thStyle}>Shortfall</th>
          <th style={thStyle}>Compliant</th>
        </tr>
      </thead>
      <tbody>
        {trustAccounts.map((ta) => (
          <tr key={ta.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
            <td style={tdStyle}>{ta.state}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>${ta.required_balance_usd.toLocaleString()}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>${ta.current_balance_usd.toLocaleString()}</td>
            <td style={{ ...tdStyle, textAlign: "right", color: ta.shortfall_usd > 0 ? "#dc2626" : "inherit" }}>
              {ta.shortfall_usd > 0 ? `$${ta.shortfall_usd.toLocaleString()}` : "—"}
            </td>
            <td style={{ ...tdStyle, textAlign: "center", color: ta.compliant ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
              {ta.compliant ? "Yes" : "No"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DisclosureTable({ disclosureRates }: { readonly disclosureRates: DisclosureAcknowledgmentRate[] }) {
  if (disclosureRates.length === 0) {
    return <p style={{ color: "#6b7280", fontStyle: "italic" }}>No disclosure data available.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
      <thead>
        <tr style={{ background: "#f3f4f6" }}>
          <th style={thStyle}>Booking Cohort</th>
          <th style={thStyle}>Total Bookings</th>
          <th style={thStyle}>Acknowledged</th>
          <th style={thStyle}>Pending</th>
          <th style={thStyle}>Ack. Rate</th>
        </tr>
      </thead>
      <tbody>
        {disclosureRates.map((dr) => (
          <tr key={dr.booking_cohort} style={{ borderBottom: "1px solid #e5e7eb" }}>
            <td style={tdStyle}>{dr.booking_cohort}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{dr.total_bookings}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{dr.acknowledged_count}</td>
            <td style={{ ...tdStyle, textAlign: "right", color: dr.pending_count > 0 ? "#d97706" : "inherit" }}>
              {dr.pending_count}
            </td>
            <td style={{
              ...tdStyle,
              textAlign: "right",
              fontWeight: 600,
              color: dr.acknowledgment_rate >= 95 ? "#16a34a" : dr.acknowledgment_rate >= 80 ? "#d97706" : "#dc2626",
            }}>
              {dr.acknowledgment_rate}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  borderBottom: "2px solid #d1d5db",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#1f2937",
};

const sectionStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "24px",
  marginBottom: "24px",
  overflowX: "auto",
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: "0 0 16px 0",
  fontSize: "1rem",
  fontWeight: 700,
  color: "#111827",
};

export default async function CompliancePage() {
  let data;
  try {
    data = await fetchComplianceDashboard();
  } catch (err) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
          Compliance License Tracker
        </h1>
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "16px", color: "#dc2626" }}>
          Unable to load compliance data. Database may be unavailable.
        </div>
      </main>
    );
  }

  const expiredLicenses = data.licenses.filter((l) => l.status === "expired").length;
  const expiringSoonLicenses = data.licenses.filter((l) => l.status === "expiring_soon").length;
  const nonCompliantAccounts = data.trustAccounts.filter((ta) => !ta.compliant).length;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
        Compliance License Tracker
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "24px" }}>
        Last updated: {new Date(data.fetchedAt).toLocaleString("en-US")}
      </p>

      {(expiredLicenses > 0 || expiringSoonLicenses > 0 || nonCompliantAccounts > 0) && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "16px", marginBottom: "24px" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>Attention Required</p>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px", color: "#78350f", fontSize: "0.875rem" }}>
            {expiredLicenses > 0 && <li>{expiredLicenses} license(s) have expired</li>}
            {expiringSoonLicenses > 0 && <li>{expiringSoonLicenses} license(s) expire within 60 days</li>}
            {nonCompliantAccounts > 0 && <li>{nonCompliantAccounts} trust account(s) below required balance</li>}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Seller of Travel Licenses — State-by-State</h2>
        <LicenseTable licenses={data.licenses} />
      </div>

      <div style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>IATA / ARC Accreditation Status</h2>
        <AccreditationTable accreditations={data.accreditations} />
      </div>

      <div style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Trust Account Balances</h2>
        <TrustAccountTable trustAccounts={data.trustAccounts} />
      </div>

      <div style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Disclosure Acknowledgment Rates by Booking Cohort</h2>
        <DisclosureTable disclosureRates={data.disclosureRates} />
      </div>
    </main>
  );
}
