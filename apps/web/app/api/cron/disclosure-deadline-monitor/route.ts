/**
 * Vercel Cron — Disclosure Deadline Monitor (F1-002)
 *
 * Runs on a schedule (configured in vercel.json) to detect bookings whose
 * regulatory disclosure acknowledgment window is approaching or has expired.
 * Logs structured JSON summaries for downstream alerting and audit.
 *
 * 72-hour acknowledgment window:
 *   - Warning threshold: disclosures unacknowledged for ≥ 48 hours (24 h remaining)
 *   - Overdue: disclosures unacknowledged for ≥ 72 hours
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ensureDisclosureSchema,
  getDisclosuresApproachingDeadline,
  getOverdueDisclosures,
} from "@/lib/travel/disclosures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = new Date().toISOString();

  try {
    await ensureDisclosureSchema();
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "disclosure_deadline_monitor.schema_error",
        error: err instanceof Error ? err.message : String(err),
        startedAt,
      }),
    );
    return NextResponse.json(
      { error: "schema setup failed", startedAt },
      { status: 500 },
    );
  }

  const [approaching, overdue] = await Promise.all([
    getDisclosuresApproachingDeadline(24, 72),
    getOverdueDisclosures(72),
  ]);

  const approachingByBooking = approaching.reduce<Record<string, string[]>>(
    (acc, item) => {
      const key = item.bookingId;
      acc[key] = acc[key] ?? [];
      acc[key].push(item.jurisdiction);
      return acc;
    },
    {},
  );

  const overdueByBooking = overdue.reduce<Record<string, string[]>>(
    (acc, item) => {
      const key = item.bookingId;
      acc[key] = acc[key] ?? [];
      acc[key].push(item.jurisdiction);
      return acc;
    },
    {},
  );

  console.log(
    JSON.stringify({
      event: "disclosure_deadline_monitor.run",
      startedAt,
      completedAt: new Date().toISOString(),
      approaching: {
        count: approaching.length,
        bookingCount: Object.keys(approachingByBooking).length,
        byBooking: approachingByBooking,
      },
      overdue: {
        count: overdue.length,
        bookingCount: Object.keys(overdueByBooking).length,
        byBooking: overdueByBooking,
      },
    }),
  );

  if (overdue.length > 0) {
    for (const item of overdue) {
      console.log(
        JSON.stringify({
          event: "disclosure_deadline_monitor.overdue_disclosure",
          severity: "high",
          bookingId: item.bookingId,
          jurisdiction: item.jurisdiction,
          hoursElapsed: item.hoursElapsed,
          createdAt: item.createdAt,
        }),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    completedAt: new Date().toISOString(),
    approaching: {
      disclosureCount: approaching.length,
      bookingCount: Object.keys(approachingByBooking).length,
    },
    overdue: {
      disclosureCount: overdue.length,
      bookingCount: Object.keys(overdueByBooking).length,
    },
  });
}
