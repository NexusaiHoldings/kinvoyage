/**
 * Stripe webhook handler for travel-domain events (F1-005).
 *
 * Handles checkout.session.completed for the $500 planning fee.
 * Signature verification uses HMAC-SHA256 with timing-safe compare
 * (same algorithm as @nexus/billing-and-subscriptions — inlined here
 * to avoid cross-domain lego dependency).
 *
 * On successful payment: marks booking deposit_paid, generates booking
 * reference, and emits travel.pnr_approval_requested so the agent runtime
 * can queue the GDS PNR creation for human approval.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { markDepositPaid } from "@/lib/travel/booking-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOLERANCE_SECONDS = 300;

function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  if (!sigHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const chunk of sigHeader.split(",")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).trim()] = chunk.slice(eq + 1).trim();
  }
  const { t: timestamp, v1: sigV1 } = parts;
  if (!timestamp || !sigV1) return false;
  const tsInt = parseInt(timestamp, 10);
  if (!Number.isFinite(tsInt)) return false;
  if (Math.abs(Date.now() / 1000 - tsInt) > TOLERANCE_SECONDS) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const sigBuf = Buffer.from(sigV1, "hex");
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse("failed to read body", { status: 400 });
  }

  const sigHeader = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_TRAVEL_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
    return new NextResponse("signature verification failed", { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }

  const eventType = (event.type as string) ?? "";
  const eventId = (event.id as string) ?? "";

  // Only handle travel-domain checkout completions
  if (eventType !== "checkout.session.completed") {
    return NextResponse.json({ received: true, action: "skipped", event_type: eventType });
  }

  const sessionObj =
    ((event.data as Record<string, unknown>)?.object as Record<string, unknown>) ?? {};
  const metadata = (sessionObj.metadata as Record<string, unknown>) ?? {};

  // Only process sessions tagged as travel planning fees
  if (metadata.domain !== "travel" || metadata.fee_type !== "planning_fee") {
    return NextResponse.json({ received: true, action: "skipped", reason: "not_travel_planning_fee" });
  }

  const stripeSessionId = sessionObj.id as string | undefined;
  if (!stripeSessionId) {
    return new NextResponse("missing session id", { status: 400 });
  }

  const db = buildDb();
  const events = buildEventBus();

  try {
    await markDepositPaid(db, events, stripeSessionId);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.stripe.travel_deposit_failed",
        stripe_event_id: eventId,
        stripe_session_id: stripeSessionId,
        error: String(err),
        ts: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    action: "deposit_marked_paid",
    stripe_session_id: stripeSessionId,
    ts: new Date().toISOString(),
  });
}
