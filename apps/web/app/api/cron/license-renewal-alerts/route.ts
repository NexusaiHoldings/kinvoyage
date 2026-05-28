import { NextResponse } from "next/server";
import { fetchExpiringLicenses } from "@/lib/travel/license-monitor";
import { handleSendNotification } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import type { ExpiringLicense } from "@/lib/travel/license-monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ALERT_THRESHOLDS = [60, 30, 7] as const;

function buildEmailHtml(license: ExpiringLicense, daysLeft: number): string {
  const urgency = daysLeft <= 7 ? "URGENT: " : daysLeft <= 30 ? "Action Required: " : "Reminder: ";
  return `
<h2>${urgency}Seller of Travel License Renewal — ${license.state}</h2>
<p>Your Seller of Travel license for <strong>${license.state}</strong> (License #${license.license_number}) expires in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> on ${new Date(license.expiry_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
<p>Please initiate the renewal process immediately to avoid a lapse in your operating authority. License lapses may result in fines, inability to sell travel in ${license.state}, and potential booking cancellations.</p>
<p>Log in to the compliance dashboard to review all license statuses and renewal requirements.</p>
<hr />
<p style="color:#6b7280;font-size:0.8em;">This is an automated alert from the Compliance License Tracker. Alerts are sent at 60, 30, and 7 days before expiry.</p>
  `.trim();
}

function _cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

type AlertResult = {
  license_id: string;
  state: string;
  days_until_expiry: number;
  agent_email: string;
  outcome: "sent" | "skipped" | "error";
  reason?: string;
};

export async function GET(request: Request): Promise<NextResponse> {
  if (!_cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const notificationsConfig = {
    default_channels: ["email"],
    resend_from_email: process.env.RESEND_FROM_EMAIL ?? "",
  };

  const ctx = { db: buildDb(), events: buildEventBus() };

  let allExpiring: ExpiringLicense[];
  try {
    allExpiring = await fetchExpiringLicenses(ALERT_THRESHOLDS[0]);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch expiring licenses", detail: String((err as Error).message) },
      { status: 502 },
    );
  }

  const results: AlertResult[] = [];

  for (const license of allExpiring) {
    const daysLeft = license.days_until_expiry;

    const matchedThreshold = ALERT_THRESHOLDS.find((t) => {
      return daysLeft <= t && daysLeft > (t === 60 ? 30 : t === 30 ? 7 : 0);
    }) ?? (daysLeft <= 7 ? 7 : null);

    if (matchedThreshold === null) {
      results.push({
        license_id: license.id,
        state: license.state,
        days_until_expiry: daysLeft,
        agent_email: license.agent_email,
        outcome: "skipped",
        reason: "no_threshold_match",
      });
      continue;
    }

    if (!license.agent_email) {
      results.push({
        license_id: license.id,
        state: license.state,
        days_until_expiry: daysLeft,
        agent_email: "",
        outcome: "skipped",
        reason: "no_agent_email",
      });
      continue;
    }

    try {
      const notifResult = await handleSendNotification({
        body: {
          user_id: license.agent_user_id,
          template_name: "license_renewal_alert",
          category: "transactional",
          to_email: license.agent_email,
          variables: {
            state: license.state,
            license_number: license.license_number,
            days_left: String(daysLeft),
            expiry_date: license.expiry_date,
          },
          html_template: buildEmailHtml(license, daysLeft),
        },
        config: notificationsConfig,
        ctx,
      });

      if (notifResult.status >= 400) {
        results.push({
          license_id: license.id,
          state: license.state,
          days_until_expiry: daysLeft,
          agent_email: license.agent_email,
          outcome: "error",
          reason: typeof notifResult.body === "string" ? notifResult.body : JSON.stringify(notifResult.body),
        });
      } else {
        results.push({
          license_id: license.id,
          state: license.state,
          days_until_expiry: daysLeft,
          agent_email: license.agent_email,
          outcome: "sent",
        });
      }
    } catch (err) {
      results.push({
        license_id: license.id,
        state: license.state,
        days_until_expiry: daysLeft,
        agent_email: license.agent_email,
        outcome: "error",
        reason: String((err as Error).message).slice(0, 300),
      });
    }
  }

  const sent = results.filter((r) => r.outcome === "sent").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const errors = results.filter((r) => r.outcome === "error").length;

  return NextResponse.json({ processed: results.length, sent, skipped, errors, results });
}
