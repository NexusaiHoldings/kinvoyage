/**
 * Regulatory Disclosure Gate Page — F1-002
 *
 * Displays jurisdiction-specific disclosure requirements for a booking
 * (CA/FL/HI/WA Seller of Travel, DOT Aviation Consumer Protection, EU Package
 * Travel Directive) and collects per-jurisdiction acknowledgments before the
 * booking can be confirmed.
 */

import type { JSX } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { handleSession } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import {
  getBookingDisclosureStatus,
  acknowledgeDisclosure,
  acknowledgeAllDisclosures,
  determineRequiredDisclosures,
  upsertDisclosureRecords,
  ensureDisclosureSchema,
  type DisclosureJurisdiction,
  type DisclosureRecord,
  type BookingDisclosureStatus,
} from "@/lib/travel/disclosures";

interface PageProps {
  params: { bookingId: string };
  searchParams: {
    destinationState?: string;
    residenceState?: string;
    hasAir?: string;
    destCountry?: string;
    residenceCountry?: string;
  };
}

async function getSessionUser(): Promise<{ userId: string; email: string } | null> {
  const cookieStore = cookies();
  const token =
    cookieStore.get("session_token")?.value ??
    cookieStore.get("auth_token")?.value;
  if (!token) return null;

  const result = await handleSession({
    authorizationHeader: `Bearer ${token}`,
    ctx: { db: buildDb(), events: buildEventBus() },
  });

  if (result.status !== 200) return null;
  const body = result.body as { user_id?: string; email?: string };
  if (!body.user_id) return null;
  return { userId: body.user_id, email: body.email ?? "" };
}

async function handleAcknowledgeOne(formData: FormData): Promise<void> {
  "use server";
  const bookingId = formData.get("bookingId") as string | null;
  const jurisdiction = formData.get("jurisdiction") as DisclosureJurisdiction | null;
  const userId = formData.get("userId") as string | null;
  if (!bookingId || !jurisdiction || !userId) return;
  await acknowledgeDisclosure(bookingId, jurisdiction, userId);
  revalidatePath(`/disclosures/${bookingId}`);
}

async function handleAcknowledgeAll(formData: FormData): Promise<void> {
  "use server";
  const bookingId = formData.get("bookingId") as string | null;
  const userId = formData.get("userId") as string | null;
  if (!bookingId || !userId) return;
  await acknowledgeAllDisclosures(bookingId, userId);
  revalidatePath(`/disclosures/${bookingId}`);
}

function DisclosureCard({
  record,
  bookingId,
  userId,
}: {
  record: DisclosureRecord;
  bookingId: string;
  userId: string;
}): JSX.Element {
  const acknowledged = record.acknowledgedAt !== null;
  return (
    <div
      style={{
        border: `2px solid ${acknowledged ? "#16a34a" : "#dc2626"}`,
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "16px",
        backgroundColor: acknowledged ? "#f0fdf4" : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600 }}>
          {record.disclosureText.split(".")[0].substring(0, 60).trim()}
        </h3>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: 600,
            backgroundColor: acknowledged ? "#16a34a" : "#dc2626",
            color: "#fff",
            flexShrink: 0,
            marginLeft: "12px",
          }}
        >
          {record.jurisdiction}
        </span>
      </div>

      <p
        style={{
          fontSize: "13px",
          lineHeight: "1.6",
          color: "#374151",
          backgroundColor: "#f9fafb",
          padding: "12px",
          borderRadius: "4px",
          maxHeight: "160px",
          overflowY: "auto",
          margin: "8px 0 12px 0",
        }}
      >
        {record.disclosureText}
      </p>

      {acknowledged ? (
        <p style={{ color: "#16a34a", fontSize: "13px", margin: 0, fontWeight: 500 }}>
          Acknowledged on {new Date(record.acknowledgedAt!).toLocaleString()}
        </p>
      ) : (
        <form action={handleAcknowledgeOne}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jurisdiction" value={record.jurisdiction} />
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            I have read and acknowledge this disclosure
          </button>
        </form>
      )}
    </div>
  );
}

export default async function DisclosuresPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/api/auth/login");
  }

  const { bookingId } = params;

  try {
    await ensureDisclosureSchema();
  } catch {
    // Table may already exist; continue
  }

  // If query params provided, create/refresh disclosure records
  const hasQueryParams =
    searchParams.destinationState ??
    searchParams.residenceState ??
    searchParams.hasAir ??
    searchParams.destCountry ??
    searchParams.residenceCountry;

  if (hasQueryParams) {
    const requirements = determineRequiredDisclosures({
      destinationState: searchParams.destinationState ?? null,
      customerResidenceState: searchParams.residenceState ?? null,
      includesAirTransport: searchParams.hasAir === "true",
      destinationCountry: searchParams.destCountry ?? null,
      customerResidenceCountry: searchParams.residenceCountry ?? null,
    });
    if (requirements.length > 0) {
      await upsertDisclosureRecords(bookingId, requirements);
    }
  }

  const status: BookingDisclosureStatus = await getBookingDisclosureStatus(bookingId);

  const acknowledgedCount = status.disclosures.filter((d) => d.acknowledgedAt !== null).length;
  const totalCount = status.disclosures.length;
  const pendingCount = status.pendingJurisdictions.length;

  return (
    <main style={{ maxWidth: "720px", margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
        Regulatory Disclosures
      </h1>
      <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "24px" }}>
        Booking ID: {bookingId}
      </p>

      {totalCount === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#6b7280" }}>
          No regulatory disclosures are required for this booking.
        </div>
      ) : status.allAcknowledged ? (
        <div style={{ padding: "24px", backgroundColor: "#f0fdf4", border: "2px solid #16a34a", borderRadius: "8px", marginBottom: "24px" }}>
          <h2 style={{ color: "#15803d", margin: "0 0 8px 0", fontSize: "18px" }}>
            All disclosures acknowledged
          </h2>
          <p style={{ color: "#166534", margin: 0, fontSize: "14px" }}>
            {acknowledgedCount} of {totalCount} required disclosures have been acknowledged.
            This booking may proceed to confirmation.
          </p>
        </div>
      ) : (
        <div style={{ padding: "16px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", marginBottom: "24px" }}>
          <p style={{ margin: 0, color: "#dc2626", fontSize: "14px", fontWeight: 500 }}>
            {pendingCount} of {totalCount} disclosure{pendingCount !== 1 ? "s" : ""} require acknowledgment before this booking can be confirmed.
          </p>
        </div>
      )}

      {status.disclosures.map((record) => (
        <DisclosureCard
          key={record.id}
          record={record}
          bookingId={bookingId}
          userId={user.userId}
        />
      ))}

      {pendingCount > 1 && (
        <form action={handleAcknowledgeAll} style={{ marginTop: "24px" }}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="userId" value={user.userId} />
          <button
            type="submit"
            style={{
              width: "100%",
              backgroundColor: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Acknowledge all {pendingCount} remaining disclosures
          </button>
        </form>
      )}
    </main>
  );
}
