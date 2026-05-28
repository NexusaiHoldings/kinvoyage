/**
 * Traveler detail page — server component.
 * Shows full traveler profile including decrypted PII fields (passport, payment ref).
 * Decryption happens server-side only; plaintext never reaches the browser.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import { decryptField, maskPassport } from "@/lib/travel/pii-encrypt";

interface TravelerRecord {
  id: string;
  booking_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number_encrypted: string | null;
  passport_expiry: string | null;
  payment_reference_encrypted: string | null;
  dietary_requirements: string | null;
  accessibility_needs: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  created_at: string;
  updated_at: string;
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

async function getTraveler(id: string): Promise<TravelerRecord | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       id, booking_id, first_name, last_name, email, phone,
       date_of_birth, nationality,
       passport_number_encrypted, passport_expiry,
       payment_reference_encrypted,
       dietary_requirements, accessibility_needs,
       emergency_contact_name, emergency_contact_phone,
       emergency_contact_relationship,
       created_at, updated_at, purged_at
     FROM travel_travelers
     WHERE id = $1`,
    [id]
  );
  const rows = result.rows as TravelerRecord[];
  return rows[0] ?? null;
}

function safeDecrypt(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decryptField(encrypted);
  } catch {
    return "[decryption error]";
  }
}

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: `Traveler Profile | Travel Management`,
    description: "Secure traveler profile — PII vault",
  };
}

export default async function TravelerDetailPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const traveler = await getTraveler(params.id);

  if (!traveler) {
    notFound();
  }

  const passportPlain = safeDecrypt(traveler.passport_number_encrypted);
  const paymentRef = safeDecrypt(traveler.payment_reference_encrypted);

  const fullName =
    [traveler.first_name, traveler.last_name].filter(Boolean).join(" ") ||
    "Unknown Traveler";

  const fieldStyle: React.CSSProperties = {
    marginBottom: "1rem",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    opacity: 0.5,
    marginBottom: 4,
    display: "block",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 400,
  };
  const sensitiveValueStyle: React.CSSProperties = {
    ...valueStyle,
    fontFamily: "monospace",
    background: "rgba(220,38,38,0.06)",
    padding: "0.3rem 0.6rem",
    borderRadius: 4,
    display: "inline-block",
    color: "#991b1b",
  };
  const sectionStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 8,
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#374151",
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid rgba(0,0,0,0.07)",
  };
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "1rem",
  };

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      <nav style={{ marginBottom: "1.5rem", fontSize: 13, opacity: 0.6 }}>
        <Link href="/travelers" style={{ color: "inherit", textDecoration: "none" }}>
          ← Travelers
        </Link>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{fullName}</h1>
        <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>
          ID: <code style={{ fontFamily: "monospace" }}>{traveler.id}</code>
          {traveler.booking_id && (
            <> · Booking: <code style={{ fontFamily: "monospace" }}>{traveler.booking_id}</code></>
          )}
        </p>
        {traveler.purged_at && (
          <div
            style={{
              marginTop: 8,
              padding: "0.4rem 0.8rem",
              background: "rgba(239,68,68,0.1)",
              color: "#b91c1c",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            ⚠ PII purged on{" "}
            {new Date(traveler.purged_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        )}
      </header>

      {/* Personal Information */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Personal Information</h2>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Email</span>
            <span style={valueStyle}>{traveler.email ?? "—"}</span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Phone</span>
            <span style={valueStyle}>{traveler.phone ?? "—"}</span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Date of Birth</span>
            <span style={valueStyle}>
              {traveler.date_of_birth
                ? new Date(traveler.date_of_birth).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Nationality</span>
            <span style={valueStyle}>{traveler.nationality ?? "—"}</span>
          </div>
        </div>
      </section>

      {/* Passport / Identity (encrypted at rest) */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>
          Passport / Identity
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              background: "#fef3c7",
              color: "#92400e",
              padding: "0.1rem 0.4rem",
              borderRadius: 4,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            AES-256-GCM encrypted
          </span>
        </h2>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Passport Number</span>
            {passportPlain ? (
              <span style={sensitiveValueStyle}>
                {maskPassport(passportPlain)}
              </span>
            ) : (
              <span style={{ ...valueStyle, opacity: 0.4 }}>—</span>
            )}
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Passport Expiry</span>
            <span style={valueStyle}>
              {traveler.passport_expiry
                ? new Date(traveler.passport_expiry).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Payment Reference</span>
            {paymentRef ? (
              <span style={sensitiveValueStyle}>{paymentRef}</span>
            ) : (
              <span style={{ ...valueStyle, opacity: 0.4 }}>—</span>
            )}
          </div>
        </div>
      </section>

      {/* Special Requirements */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Special Requirements</h2>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Dietary Requirements</span>
            <span style={valueStyle}>{traveler.dietary_requirements ?? "None recorded"}</span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Accessibility Needs</span>
            <span style={valueStyle}>{traveler.accessibility_needs ?? "None recorded"}</span>
          </div>
        </div>
      </section>

      {/* Emergency Contact */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Emergency Contact</h2>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Name</span>
            <span style={valueStyle}>{traveler.emergency_contact_name ?? "—"}</span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Phone</span>
            <span style={valueStyle}>{traveler.emergency_contact_phone ?? "—"}</span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Relationship</span>
            <span style={valueStyle}>{traveler.emergency_contact_relationship ?? "—"}</span>
          </div>
        </div>
      </section>

      {/* Record Metadata */}
      <section style={{ ...sectionStyle, background: "rgba(0,0,0,0.02)" }}>
        <h2 style={sectionTitleStyle}>Record Metadata</h2>
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Created</span>
            <span style={{ ...valueStyle, fontSize: 13, opacity: 0.7 }}>
              {new Date(traveler.created_at).toLocaleString("en-GB")}
            </span>
          </div>
          <div style={fieldStyle}>
            <span style={labelStyle}>Last Updated</span>
            <span style={{ ...valueStyle, fontSize: 13, opacity: 0.7 }}>
              {new Date(traveler.updated_at).toLocaleString("en-GB")}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
