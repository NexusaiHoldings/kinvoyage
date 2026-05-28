/**
 * Booking confirmation page — customer reviews selected itinerary,
 * pays $500 non-refundable planning fee via Stripe Checkout, and
 * receives a booking reference (F1-005).
 *
 * GDS PNR creation is gated on agent approval (liability_assessor requirement).
 */

import { createHash } from "node:crypto";
import type { JSX } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import {
  getItinerary,
  getBookingByItineraryId,
  createPlanningFeeCheckout,
  type Booking,
  type Itinerary,
} from "@/lib/travel/booking-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: { itineraryId: string };
  searchParams: { payment?: string };
}

async function resolveSession(
  db: ReturnType<typeof buildDb>,
): Promise<{ userId: string; userEmail: string } | null> {
  const sessionToken = cookies().get("session_token")?.value ?? null;
  if (!sessionToken) return null;
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const rows = await db
    .query<{ user_id: string; email: string }>(
      "SELECT s.user_id, u.email FROM sessions s " +
        "JOIN users u ON s.user_id = u.id " +
        "WHERE s.token_hash = $1 AND s.expires_at > NOW() AND s.revoked_at IS NULL LIMIT 1",
      tokenHash,
    )
    .catch(() => [] as { user_id: string; email: string }[]);
  if (rows.length === 0) return null;
  return { userId: rows[0].user_id, userEmail: rows[0].email };
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function StatusBanner({ booking }: { booking: Booking | null }): JSX.Element {
  if (!booking) return <></>;
  if (booking.status === "confirmed") {
    return (
      <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 600, color: "#065f46", marginBottom: 4 }}>Booking Confirmed</p>
        <p style={{ color: "#065f46" }}>Reference: <strong>{booking.booking_reference}</strong></p>
        {booking.pnr && <p style={{ color: "#065f46" }}>GDS PNR: <strong>{booking.pnr}</strong></p>}
      </div>
    );
  }
  if (booking.status === "deposit_paid" || booking.status === "pnr_requested") {
    return (
      <div style={{ background: "#dbeafe", border: "1px solid #93c5fd", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>Payment Received</p>
        <p style={{ color: "#1e40af" }}>Reference: <strong>{booking.booking_reference}</strong></p>
        <p style={{ color: "#1e40af", marginTop: 8, fontSize: "0.875rem" }}>
          Your booking is under review. GDS reservation requires agent approval before
          confirmation — you will be notified once confirmed.
        </p>
      </div>
    );
  }
  if (booking.status === "failed") {
    return (
      <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 600, color: "#991b1b" }}>Booking Failed</p>
        <p style={{ color: "#991b1b", fontSize: "0.875rem" }}>
          We could not confirm your booking. Please contact support with reference{" "}
          <strong>{booking.booking_reference}</strong>.
        </p>
      </div>
    );
  }
  return <></>;
}

export default async function BookingConfirmPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const db = buildDb();
  const session = await resolveSession(db);
  if (!session) redirect("/");

  const { userId, userEmail } = session;
  const { itineraryId } = params;

  const [itinerary, booking] = await Promise.all([
    getItinerary(db, itineraryId),
    getBookingByItineraryId(db, itineraryId, userId),
  ]);

  if (!itinerary) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Itinerary Not Found</h1>
        <p>The requested itinerary does not exist or has been removed.</p>
      </main>
    );
  }

  if (itinerary.user_id !== userId) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Access Denied</h1>
        <p>You do not have permission to view this booking.</p>
      </main>
    );
  }

  const paymentParam = searchParams.payment ?? null;

  async function handleStartCheckout(_formData: FormData): Promise<void> {
    "use server";
    const actionDb = buildDb();
    const actionEvents = buildEventBus();
    const origin =
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";
    let checkoutUrl = `${origin}/booking/${itineraryId}/confirm?payment=error`;
    try {
      const result = await createPlanningFeeCheckout(actionDb, actionEvents, {
        itineraryId,
        userId,
        userEmail,
        successUrl: `${origin}/booking/${itineraryId}/confirm?payment=success`,
        cancelUrl: `${origin}/booking/${itineraryId}/confirm?payment=cancelled`,
      });
      checkoutUrl = result.url;
    } catch {
      // checkoutUrl stays as error URL
    }
    redirect(checkoutUrl);
  }

  const isComplete =
    booking?.status === "confirmed" ||
    booking?.status === "deposit_paid" ||
    booking?.status === "pnr_requested" ||
    booking?.status === "failed";

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Confirm Your Booking
      </h1>

      {/* Itinerary summary */}
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          {itinerary.title}
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1.25rem", margin: 0 }}>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Destination</dt>
          <dd style={{ margin: 0 }}>{itinerary.destination}</dd>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Departure</dt>
          <dd style={{ margin: 0 }}>{itinerary.departure_date}</dd>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Return</dt>
          <dd style={{ margin: 0 }}>{itinerary.return_date}</dd>
          <dt style={{ color: "#6b7280", fontWeight: 500 }}>Estimated Total</dt>
          <dd style={{ margin: 0 }}>{formatUsd(itinerary.total_price_cents)}</dd>
        </dl>
      </section>

      {/* Booking status banner (paid / confirmed / failed) */}
      <StatusBanner booking={booking} />

      {/* Payment pending notice */}
      {booking?.status === "pending_payment" && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ color: "#92400e" }}>
            A checkout session is already in progress. Complete your payment to confirm the
            booking, or start a new session below.
          </p>
        </div>
      )}

      {/* Payment error notice */}
      {paymentParam === "error" && !isComplete && (
        <p style={{ color: "#dc2626", marginBottom: "1rem", fontSize: "0.875rem" }}>
          There was a problem processing your payment. Please try again.
        </p>
      )}

      {/* Payment form — shown when no terminal booking status yet */}
      {!isComplete && (
        <section>
          <div
            style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1.25rem",
              marginBottom: "1rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Planning Fee — $500
            </h2>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
              A non-refundable $500 planning fee is required to reserve your itinerary and
              initiate the booking process. This fee is charged upfront as a deposit against
              your travel planning services.
            </p>
            <ul
              style={{
                paddingLeft: "1.25rem",
                color: "#6b7280",
                fontSize: "0.875rem",
                margin: 0,
              }}
            >
              <li>Non-refundable per booking terms</li>
              <li>Secure payment processed by Stripe</li>
              <li>GDS reservation subject to agent review before confirmation</li>
            </ul>
          </div>
          <form action={handleStartCheckout}>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "0.75rem 1.5rem",
                backgroundColor: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1rem",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Pay $500 Planning Fee
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
