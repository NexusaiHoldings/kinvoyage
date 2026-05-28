/**
 * Travel booking engine — core business logic for booking confirmation
 * and $500 non-refundable planning fee deposit collection (F1-005).
 *
 * GDS PNR creation requires human approval per liability_assessor gate.
 * Autonomous PNR write mutations are blocked (autonomous_operation_score 25/100).
 */

import { createHash, randomUUID } from "node:crypto";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

export interface EventBus {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export interface Itinerary {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  departure_date: string;
  return_date: string;
  total_price_cents: number;
  status: string;
  created_at: string;
}

export type BookingStatus =
  | "pending_payment"
  | "deposit_paid"
  | "pnr_requested"
  | "confirmed"
  | "cancelled"
  | "failed";

export interface Booking {
  id: string;
  itinerary_id: string;
  user_id: string;
  status: BookingStatus;
  booking_reference: string | null;
  stripe_session_id: string | null;
  deposit_paid_at: string | null;
  pnr: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
  bookingId: string;
}

export interface SyncResult {
  processed: number;
  updated: number;
  errors: number;
}

const PLANNING_FEE_CENTS = 50_000; // $500 USD
const STRIPE_API = "https://api.stripe.com/v1";
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function flattenForm(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        const k = `${fullKey}[${idx}]`;
        if (typeof item === "object" && item !== null) {
          Object.assign(out, flattenForm(item as Record<string, unknown>, k));
        } else {
          out[k] = String(item);
        }
      });
    } else if (typeof value === "object") {
      Object.assign(out, flattenForm(value as Record<string, unknown>, fullKey));
    } else {
      out[fullKey] = String(value);
    }
  }
  return out;
}

async function stripePost(
  endpoint: string,
  formData: Record<string, unknown>,
  secretKey: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = new URLSearchParams(flattenForm(formData)).toString();
  const apiVersion = process.env.STRIPE_API_VERSION ?? "2024-06-20";
  const resp = await fetch(`${STRIPE_API}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": apiVersion,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

export function generateBookingReference(): string {
  let ref = "TRV-";
  for (let i = 0; i < 8; i++) {
    ref += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  }
  return ref;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getItinerary(db: Db, id: string): Promise<Itinerary | null> {
  const rows = await db.query<Itinerary>(
    "SELECT id, user_id, title, destination, " +
      "departure_date::text, return_date::text, total_price_cents, status, created_at::text " +
      "FROM travel_itineraries WHERE id = $1::uuid",
    id,
  );
  return rows[0] ?? null;
}

export async function getBookingByItineraryId(
  db: Db,
  itineraryId: string,
  userId: string,
): Promise<Booking | null> {
  const rows = await db.query<Booking>(
    "SELECT id, itinerary_id, user_id, status, booking_reference, stripe_session_id, " +
      "deposit_paid_at::text, pnr, created_at::text, updated_at::text " +
      "FROM travel_bookings WHERE itinerary_id = $1::uuid AND user_id = $2::uuid " +
      "ORDER BY created_at DESC LIMIT 1",
    itineraryId,
    userId,
  );
  return rows[0] ?? null;
}

export async function getBookingByStripeSession(
  db: Db,
  stripeSessionId: string,
): Promise<Booking | null> {
  const rows = await db.query<Booking>(
    "SELECT id, itinerary_id, user_id, status, booking_reference, stripe_session_id, " +
      "deposit_paid_at::text, pnr, created_at::text, updated_at::text " +
      "FROM travel_bookings WHERE stripe_session_id = $1",
    stripeSessionId,
  );
  return rows[0] ?? null;
}

export async function createPlanningFeeCheckout(
  db: Db,
  events: EventBus,
  params: {
    itineraryId: string;
    userId: string;
    userEmail: string;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<CheckoutResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const resp = await stripePost(
    "checkout/sessions",
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: PLANNING_FEE_CENTS,
            product_data: {
              name: "Travel Planning Fee",
              description: "Non-refundable $500 planning fee — itinerary confirmation",
            },
          },
          quantity: 1,
        },
      ],
      customer_email: params.userEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        domain: "travel",
        fee_type: "planning_fee",
        itinerary_id: params.itineraryId,
        user_id: params.userId,
      },
    },
    secretKey,
  );

  if (resp.status >= 400) {
    throw new Error(`Stripe error ${resp.status}: ${JSON.stringify(resp.body)}`);
  }
  const sessionId = resp.body.id as string | undefined;
  const sessionUrl = resp.body.url as string | undefined;
  if (!sessionId || !sessionUrl) throw new Error("Stripe returned invalid checkout session");

  const bookingId = randomUUID();
  await db.execute(
    "INSERT INTO travel_bookings " +
      "(id, itinerary_id, user_id, status, stripe_session_id, created_at, updated_at) " +
      "VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending_payment', $4, NOW(), NOW()) " +
      "ON CONFLICT (itinerary_id, user_id) DO UPDATE " +
      "SET stripe_session_id = EXCLUDED.stripe_session_id, status = 'pending_payment', updated_at = NOW()",
    bookingId,
    params.itineraryId,
    params.userId,
    sessionId,
  );

  await events.publish("travel.planning_fee_checkout_created", {
    booking_id: bookingId,
    itinerary_id: params.itineraryId,
    user_id: params.userId,
    stripe_session_id: sessionId,
    amount_cents: PLANNING_FEE_CENTS,
  });

  return { sessionId, url: sessionUrl, bookingId };
}

export async function markDepositPaid(
  db: Db,
  events: EventBus,
  stripeSessionId: string,
): Promise<void> {
  const bookingRef = generateBookingReference();
  await db.execute(
    "UPDATE travel_bookings " +
      "SET status = 'deposit_paid', booking_reference = $2, deposit_paid_at = NOW(), updated_at = NOW() " +
      "WHERE stripe_session_id = $1 AND status = 'pending_payment'",
    stripeSessionId,
    bookingRef,
  );
  const rows = await db.query<{ id: string; itinerary_id: string; user_id: string }>(
    "SELECT id, itinerary_id, user_id FROM travel_bookings WHERE stripe_session_id = $1",
    stripeSessionId,
  );
  if (rows.length === 0) return;
  const { id: bookingId, itinerary_id: itineraryId, user_id: userId } = rows[0];
  await events.publish("travel.deposit_paid", {
    booking_id: bookingId,
    itinerary_id: itineraryId,
    user_id: userId,
    booking_reference: bookingRef,
    stripe_session_id: stripeSessionId,
  });
  // GDS PNR write requires human agent approval — liability_assessor gate for high-value mutations
  await events.publish("travel.pnr_approval_requested", {
    booking_id: bookingId,
    itinerary_id: itineraryId,
    user_id: userId,
    booking_reference: bookingRef,
    requires_human_approval: true,
  });
}

export async function syncBookingStatuses(
  db: Db,
  events: EventBus,
): Promise<SyncResult> {
  const result: SyncResult = { processed: 0, updated: 0, errors: 0 };
  const pending = await db.query<{
    id: string;
    itinerary_id: string;
    user_id: string;
    booking_reference: string;
  }>(
    "SELECT id, itinerary_id, user_id, booking_reference FROM travel_bookings " +
      "WHERE status = 'pnr_requested' AND updated_at < NOW() - INTERVAL '5 minutes'",
  );
  for (const booking of pending) {
    result.processed++;
    try {
      const approvals = await db.query<{ status: string; pnr: string | null }>(
        "SELECT status, pnr FROM travel_pnr_approvals " +
          "WHERE booking_id = $1::uuid ORDER BY created_at DESC LIMIT 1",
        booking.id,
      );
      if (approvals.length === 0) continue;
      const { status: approvalStatus, pnr } = approvals[0];
      if (approvalStatus === "approved" && pnr) {
        await db.execute(
          "UPDATE travel_bookings SET status = 'confirmed', pnr = $2, updated_at = NOW() " +
            "WHERE id = $1::uuid",
          booking.id,
          pnr,
        );
        await events.publish("travel.booking_confirmed", {
          booking_id: booking.id,
          itinerary_id: booking.itinerary_id,
          user_id: booking.user_id,
          booking_reference: booking.booking_reference,
          pnr,
        });
        result.updated++;
      } else if (approvalStatus === "rejected") {
        await db.execute(
          "UPDATE travel_bookings SET status = 'failed', updated_at = NOW() WHERE id = $1::uuid",
          booking.id,
        );
        await events.publish("travel.booking_failed", {
          booking_id: booking.id,
          itinerary_id: booking.itinerary_id,
          user_id: booking.user_id,
          booking_reference: booking.booking_reference,
          reason: "pnr_rejected",
        });
        result.updated++;
      }
    } catch (syncErr) {
      result.errors++;
      console.error(
        JSON.stringify({
          event: "booking_sync_error",
          booking_id: booking.id,
          error: String(syncErr),
        }),
      );
    }
  }
  return result;
}
