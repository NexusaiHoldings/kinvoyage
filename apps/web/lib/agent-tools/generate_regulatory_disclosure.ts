/**
 * Agent tool handler: generate_regulatory_disclosure
 *
 * Confirm-gated mutation. Determines jurisdiction-specific disclosure requirements
 * for a booking by combining @nexus/legal-and-compliance base text with
 * travel-specific rules from disclosures.ts, then writes the package to
 * travel_disclosure_records for customer acknowledgment.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import {
  determineRequiredDisclosures,
  ensureDisclosureSchema,
  upsertDisclosureRecords,
  getBookingDisclosureStatus,
} from "@/lib/travel/disclosures";

type Args = Record<string, unknown>;

interface GenerateRegulatoryDisclosureArgs {
  booking_id?: string;
  destination_state?: string | null;
  customer_residence_state?: string | null;
  includes_air_transport?: boolean;
  destination_country?: string | null;
  customer_residence_country?: string | null;
}

export async function handleGenerateRegulatoryDisclosure(
  ctx: HandlerContext,
  args: Args
): Promise<HandlerResult> {
  const {
    booking_id,
    destination_state = null,
    customer_residence_state = null,
    includes_air_transport = false,
    destination_country = null,
    customer_residence_country = null,
  } = args as GenerateRegulatoryDisclosureArgs;

  if (!booking_id || typeof booking_id !== "string" || booking_id.trim() === "") {
    return {
      status: 400,
      body: "booking_id is required to generate regulatory disclosures.",
    };
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(booking_id)) {
    return {
      status: 400,
      body: "booking_id must be a valid UUID.",
    };
  }

  // Verify the booking exists via ctx.db
  let bookingExists = false;
  try {
    const rows = await ctx.db.query<{ id: string }>(
      `SELECT id FROM bookings WHERE id = $1 LIMIT 1`,
      booking_id
    );
    bookingExists = Array.isArray(rows) && rows.length > 0;
  } catch {
    // Table may not yet exist in dev; proceed with disclosure generation
    bookingExists = true;
  }

  if (!bookingExists) {
    return {
      status: 404,
      body: `Booking ${booking_id} not found. Cannot generate regulatory disclosures for a non-existent booking.`,
    };
  }

  // Determine which jurisdictions apply to this booking
  const requirements = determineRequiredDisclosures({
    destinationState: destination_state ?? null,
    customerResidenceState: customer_residence_state ?? null,
    includesAirTransport: Boolean(includes_air_transport),
    destinationCountry: destination_country ?? null,
    customerResidenceCountry: customer_residence_country ?? null,
  });

  if (requirements.length === 0) {
    return {
      status: 200,
      body: {
        tool: "generate_regulatory_disclosure",
        booking_id,
        message: "No jurisdiction-specific disclosure requirements apply to this booking.",
        jurisdictions: [],
        disclosures: [],
        pending_acknowledgment_count: 0,
      },
    };
  }

  // Ensure the disclosure schema table exists
  try {
    await ensureDisclosureSchema();
  } catch (err) {
    return {
      status: 503,
      body: `Failed to ensure disclosure schema: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Write disclosure records for this booking
  let records;
  try {
    records = await upsertDisclosureRecords(booking_id, requirements);
  } catch (err) {
    return {
      status: 502,
      body: `Failed to persist disclosure records: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Fetch the full acknowledgment status for the booking
  let disclosureStatus;
  try {
    disclosureStatus = await getBookingDisclosureStatus(booking_id);
  } catch (err) {
    return {
      status: 502,
      body: `Failed to retrieve disclosure status: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const pendingCount = disclosureStatus.pendingJurisdictions.length;

  return {
    status: 200,
    body: {
      tool: "generate_regulatory_disclosure",
      booking_id,
      message: `Regulatory disclosure package generated for ${requirements.length} jurisdiction(s). ${pendingCount} disclosure(s) pending customer acknowledgment.`,
      jurisdictions: requirements.map((r) => r.jurisdiction),
      disclosures: records.map((rec) => ({
        id: rec.id,
        jurisdiction: rec.jurisdiction,
        title: requirements.find((r) => r.jurisdiction === rec.jurisdiction)?.title ?? rec.jurisdiction,
        disclosure_text: rec.disclosureText,
        acknowledged: rec.acknowledgedAt !== null,
        acknowledged_at: rec.acknowledgedAt ?? null,
      })),
      pending_acknowledgment_count: pendingCount,
      pending_jurisdictions: disclosureStatus.pendingJurisdictions,
      all_acknowledged: disclosureStatus.allAcknowledged,
    },
  };
}
