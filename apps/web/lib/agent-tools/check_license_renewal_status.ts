import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { z } from "zod";
import {
  fetchLicenses,
  fetchTrustAccountStatus,
  type SellerOfTravelLicense,
  type TrustAccountStatus,
} from "@/lib/travel/license-monitor";

const ArgsSchema = z
  .object({
    horizon_days: z.number().int().min(1).max(365).default(60),
    include_expired: z.boolean().default(false),
  })
  .passthrough();

type Args = z.infer<typeof ArgsSchema>;

type Priority = "critical" | "high" | "medium";

interface ComplianceAction {
  readonly type: string;
  readonly priority: Priority;
  readonly description: string;
  readonly due_date: string | null;
  readonly days_remaining: number | null;
  readonly state: string | null;
  readonly reference_id: string;
  readonly metadata: Record<string, unknown>;
}

function priorityForDays(daysRemaining: number): Priority {
  if (daysRemaining <= 0) return "critical";
  if (daysRemaining <= 14) return "critical";
  if (daysRemaining <= 30) return "high";
  return "medium";
}

function actionsFromLicenses(
  licenses: SellerOfTravelLicense[],
  horizonDays: number,
  includeExpired: boolean,
): ComplianceAction[] {
  return licenses
    .filter((lic) => {
      if (lic.days_until_expiry < 0) return includeExpired;
      return lic.days_until_expiry <= horizonDays;
    })
    .map((lic): ComplianceAction => {
      const isExpired = lic.days_until_expiry < 0;
      return {
        type: isExpired ? "license_expired" : "license_renewal_due",
        priority: priorityForDays(lic.days_until_expiry),
        description: isExpired
          ? `Seller-of-travel license ${lic.license_number} (${lic.state}) has EXPIRED ${Math.abs(lic.days_until_expiry)} day(s) ago. Immediate renewal required to continue operations.`
          : `Seller-of-travel license ${lic.license_number} (${lic.state}) expires in ${lic.days_until_expiry} day(s) on ${lic.expiry_date}. Initiate renewal process now.`,
        due_date: lic.expiry_date,
        days_remaining: lic.days_until_expiry,
        state: lic.state,
        reference_id: lic.id,
        metadata: {
          license_number: lic.license_number,
          bond_amount_usd: lic.bond_amount_usd,
          trust_account_required: lic.trust_account_required,
          status: lic.status,
        },
      };
    });
}

function actionsFromTrustAccounts(accounts: TrustAccountStatus[]): ComplianceAction[] {
  return accounts
    .filter((acct) => !acct.compliant)
    .map((acct): ComplianceAction => ({
      type: "trust_account_underfunded",
      priority: acct.shortfall_usd > 50_000 ? "critical" : "high",
      description: `Trust account for ${acct.state} is underfunded by $${acct.shortfall_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Current balance $${acct.current_balance_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is below required $${acct.required_balance_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      due_date: null,
      days_remaining: null,
      state: acct.state,
      reference_id: acct.id,
      metadata: {
        required_balance_usd: acct.required_balance_usd,
        current_balance_usd: acct.current_balance_usd,
        shortfall_usd: acct.shortfall_usd,
      },
    }));
}

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2 };

function sortActions(actions: ComplianceAction[]): ComplianceAction[] {
  return [...actions].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    if (a.days_remaining !== null && b.days_remaining !== null) {
      return a.days_remaining - b.days_remaining;
    }
    if (a.days_remaining !== null) return -1;
    if (b.days_remaining !== null) return 1;
    return 0;
  });
}

export async function handleCheckLicenseRenewalStatus(
  _ctx: HandlerContext,
  rawArgs: Record<string, unknown>,
): Promise<HandlerResult> {
  const parsed = ArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        type: "invalid_arguments",
        message: "Invalid arguments supplied to check_license_renewal_status.",
        details: parsed.error.flatten() as Record<string, unknown>,
      },
    };
  }

  const { horizon_days, include_expired } = parsed.data as Args;

  let licenses: SellerOfTravelLicense[];
  let trustAccounts: TrustAccountStatus[];

  try {
    [licenses, trustAccounts] = await Promise.all([
      fetchLicenses(),
      fetchTrustAccountStatus(),
    ]);
  } catch (err) {
    return {
      status: 503,
      body: {
        type: "db_error",
        message: `Failed to retrieve compliance data: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  const licenseActions = actionsFromLicenses(licenses, horizon_days, include_expired);
  const trustActions = actionsFromTrustAccounts(trustAccounts);
  const allActions = sortActions([...licenseActions, ...trustActions]);

  const criticalCount = allActions.filter((a) => a.priority === "critical").length;
  const highCount = allActions.filter((a) => a.priority === "high").length;
  const mediumCount = allActions.filter((a) => a.priority === "medium").length;

  const summaryParts: string[] = [];
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critical`);
  if (highCount > 0) summaryParts.push(`${highCount} high`);
  if (mediumCount > 0) summaryParts.push(`${mediumCount} medium`);

  const summary =
    allActions.length === 0
      ? `No compliance actions required within the next ${horizon_days} days. All licenses and trust accounts are in good standing.`
      : `${allActions.length} compliance action(s) identified: ${summaryParts.join(", ")} priority.`;

  return {
    status: 200,
    body: {
      tool: "check_license_renewal_status",
      horizon_days,
      include_expired,
      summary,
      actions: allActions,
      counts: {
        total: allActions.length,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        license_renewals: licenseActions.length,
        trust_account_issues: trustActions.length,
      },
      generated_at: new Date().toISOString(),
    },
  };
}
