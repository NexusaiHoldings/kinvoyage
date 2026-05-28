/**
 * Vercel cron handler — syncs travel booking statuses from GDS approval records.
 *
 * Scheduled to run every 5 minutes (configure in vercel.json crons).
 * Protected by CRON_SECRET header to prevent unauthorized invocation.
 *
 * Flow: polls travel_bookings WHERE status='pnr_requested', checks
 * travel_pnr_approvals for human agent decisions, updates status to
 * 'confirmed' or 'failed' accordingly.
 */

import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { syncBookingStatuses } from "@/lib/travel/booking-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const db = buildDb();
  const events = buildEventBus();

  let result: { processed: number; updated: number; errors: number };
  try {
    result = await syncBookingStatuses(db, events);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.booking_sync_failed",
        error: String(err),
        ts: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ error: "sync failed", detail: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    updated: result.updated,
    errors: result.errors,
    ts: new Date().toISOString(),
  });
}
