/**
 * Regulatory Disclosure Automation — F1-002
 *
 * Generates jurisdiction-specific Seller of Travel disclosures (CA, FL, HI, WA),
 * DOT Aviation Consumer Protection text, and EU Package Travel Directive bundling
 * notices. Stores acknowledgment records and enforces disclosure gate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  connect: () => Promise<{
    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
    release: () => void;
  }>;
} {
  if (_pool) return _pool;
  const { Pool: PgPool } = eval("require")("pg") as {
    Pool: new (cfg: Record<string, unknown>) => typeof _pool;
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

export type DisclosureJurisdiction = "CA" | "FL" | "HI" | "WA" | "DOT" | "EU";

export interface DisclosureRequirement {
  jurisdiction: DisclosureJurisdiction;
  title: string;
  text: string;
}

export interface DisclosureRecord {
  id: string;
  bookingId: string;
  jurisdiction: DisclosureJurisdiction;
  disclosureText: string;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  createdAt: Date;
}

export interface BookingDisclosureStatus {
  bookingId: string;
  allAcknowledged: boolean;
  pendingJurisdictions: DisclosureJurisdiction[];
  disclosures: DisclosureRecord[];
}

export interface PendingDeadlineDisclosure {
  bookingId: string;
  jurisdiction: DisclosureJurisdiction;
  createdAt: Date;
  hoursElapsed: number;
  hoursRemaining: number;
}

type DisclosureRow = {
  id: string;
  booking_id: string;
  jurisdiction: string;
  disclosure_text: string;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  created_at: Date;
};

type DeadlineRow = {
  booking_id: string;
  jurisdiction: string;
  created_at: Date;
  hours_elapsed: number;
};

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

const SELLER_OF_TRAVEL_STATES = new Set(["CA", "FL", "HI", "WA"]);

function mapRow(row: DisclosureRow): DisclosureRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    jurisdiction: row.jurisdiction as DisclosureJurisdiction,
    disclosureText: row.disclosure_text,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    createdAt: row.created_at,
  };
}

export function generateSellerOfTravelDisclosure(
  jurisdiction: "CA" | "FL" | "HI" | "WA",
): DisclosureRequirement {
  const texts: Record<"CA" | "FL" | "HI" | "WA", { title: string; text: string }> = {
    CA: {
      title: "California Seller of Travel Disclosure",
      text: "This travel agency is registered as a Seller of Travel in the State of California under the California Seller of Travel Law (Bus. & Prof. Code § 17550 et seq.). Registration does not constitute approval by the State of California. California law requires certain sellers of travel to maintain a trust account or bond to protect consumer funds. You have the right to a refund of funds deposited if your trip is cancelled or substantially changed by the seller. For questions, contact the California Attorney General's Office of Consumer Affairs.",
    },
    FL: {
      title: "Florida Seller of Travel Disclosure",
      text: "This travel agency is registered as a Seller of Travel in the State of Florida pursuant to Fla. Stat. § 559.926. Florida law requires all sellers of travel to register with the Florida Department of Agriculture and Consumer Services. Registration does not constitute endorsement, approval, or recommendation by the State of Florida. Consumers may verify registration and file complaints at the FDACS website (1-800-HELP-FLA).",
    },
    HI: {
      title: "Hawaii Seller of Travel Disclosure",
      text: "This travel agency is registered as a Seller of Travel in the State of Hawaii pursuant to Hawaii Revised Statutes Chapter 468L. Hawaii law requires sellers of travel to be registered and to maintain a client trust account or bond to protect consumer payments. This disclosure is required by Hawaii state law. Consumers may contact the Hawaii Department of Commerce and Consumer Affairs (DCCA) for information about their rights and to verify registration.",
    },
    WA: {
      title: "Washington Seller of Travel Disclosure",
      text: "This travel agency is registered under the Washington Seller of Travel Act (RCW 19.138). Washington state law requires travel agents and tour operators selling travel services to Washington residents to register with the Washington State Department of Licensing. Consumers may contact the Department of Licensing at (360) 664-6626 for information about registered sellers and consumer protections under RCW 19.138.100.",
    },
  };
  return { jurisdiction, ...texts[jurisdiction] };
}
export function generateDOTDisclosure(): DisclosureRequirement {
  return {
    jurisdiction: "DOT",
    title: "DOT Aviation Consumer Protection Disclosure",
    text: "NOTICE: Pursuant to U.S. Department of Transportation regulations (14 C.F.R. Part 399), the following information is provided: (1) All fees for optional services, including checked baggage fees, are disclosed at the time of booking. (2) Fare rules including cancellation and change policies are disclosed before purchase completion. (3) In the event of a significant delay (3+ hours domestic, 6+ hours international) or flight cancellation, you may be entitled to a full refund of unused ticket value. (4) Tarmac delay protections apply: carriers must provide food/water after 2 hours on the tarmac and allow deplaning after 3 hours domestic / 4 hours international. (5) Passengers with disabilities are entitled to assistance as required by 14 C.F.R. Part 382. (6) Overbooking: if you are involuntarily denied boarding, you may be entitled to denied boarding compensation. For full consumer protections, visit transportation.gov/airconsumer or call 1-202-366-2220.",
  };
}
export function generateEUPackageTravelDisclosure(): DisclosureRequirement {
  return {
    jurisdiction: "EU",
    title: "EU Package Travel Directive Bundling Notice",
    text: "NOTICE PURSUANT TO EU DIRECTIVE 2015/2302 ON PACKAGE TRAVEL AND LINKED TRAVEL ARRANGEMENTS: Your booking may constitute a package travel arrangement under EU law. If so, you benefit from all EU rights applicable to packages, including: (1) Full organizer responsibility for proper performance of all travel services included in the package. (2) Insolvency protection — your payments are protected and repatriation is guaranteed if the organizer becomes insolvent. (3) The right to transfer your booking to another person under reasonable notice. (4) A price reduction or compensation if any of the travel services are not performed in accordance with the contract, unless caused by unavoidable extraordinary circumstances. (5) The right to terminate the package travel contract without paying a termination fee before the start of the package if exceptional circumstances occur at the destination that significantly affect performance of the package. This notice is provided pursuant to Article 5 of Directive (EU) 2015/2302 as implemented in applicable national law.",
  };
}
export function determineRequiredDisclosures(params: {
  destinationState: string | null;
  customerResidenceState: string | null;
  includesAirTransport: boolean;
  destinationCountry: string | null;
  customerResidenceCountry: string | null;
}): DisclosureRequirement[] {
  const requirements: DisclosureRequirement[] = [];
  const added = new Set<string>();

  const addSeller = (state: string) => {
    const upper = state.toUpperCase();
    if (SELLER_OF_TRAVEL_STATES.has(upper) && !added.has(upper)) {
      requirements.push(generateSellerOfTravelDisclosure(upper as "CA" | "FL" | "HI" | "WA"));
      added.add(upper);
    }
  };

  if (params.customerResidenceState) addSeller(params.customerResidenceState);
  if (params.destinationState) addSeller(params.destinationState);

  if (params.includesAirTransport) {
    requirements.push(generateDOTDisclosure());
  }

  const destCC = params.destinationCountry?.toUpperCase();
  const resCC = params.customerResidenceCountry?.toUpperCase();
  if ((destCC && EU_COUNTRY_CODES.has(destCC)) || (resCC && EU_COUNTRY_CODES.has(resCC))) {
    requirements.push(generateEUPackageTravelDisclosure());
  }

  return requirements;
}
export async function ensureDisclosureSchema(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS travel_disclosure_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL,
        jurisdiction VARCHAR(10) NOT NULL,
        disclosure_text TEXT NOT NULL,
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by_user_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (booking_id, jurisdiction)
      )`,
    );
  } finally {
    client.release();
  }
}
export async function upsertDisclosureRecords(
  bookingId: string,
  requirements: DisclosureRequirement[],
): Promise<DisclosureRecord[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const records: DisclosureRecord[] = [];
    for (const req of requirements) {
      const result = await client.query<DisclosureRow>(
        `INSERT INTO travel_disclosure_records (booking_id, jurisdiction, disclosure_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (booking_id, jurisdiction)
         DO UPDATE SET disclosure_text = EXCLUDED.disclosure_text
         RETURNING *`,
        [bookingId, req.jurisdiction, req.text],
      );
      if (result.rows[0]) records.push(mapRow(result.rows[0]));
    }
    return records;
  } finally {
    client.release();
  }
}
export async function acknowledgeDisclosure(
  bookingId: string,
  jurisdiction: DisclosureJurisdiction,
  userId: string,
): Promise<DisclosureRecord | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<DisclosureRow>(
      `UPDATE travel_disclosure_records
       SET acknowledged_at = NOW(), acknowledged_by_user_id = $3
       WHERE booking_id = $1 AND jurisdiction = $2 AND acknowledged_at IS NULL
       RETURNING *`,
      [bookingId, jurisdiction, userId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}
export async function acknowledgeAllDisclosures(
  bookingId: string,
  userId: string,
): Promise<DisclosureRecord[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<DisclosureRow>(
      `UPDATE travel_disclosure_records
       SET acknowledged_at = NOW(), acknowledged_by_user_id = $2
       WHERE booking_id = $1 AND acknowledged_at IS NULL
       RETURNING *`,
      [bookingId, userId],
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}
export async function getBookingDisclosureStatus(
  bookingId: string,
): Promise<BookingDisclosureStatus> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<DisclosureRow>(
      `SELECT * FROM travel_disclosure_records WHERE booking_id = $1 ORDER BY created_at`,
      [bookingId],
    );
    const disclosures = result.rows.map(mapRow);
    const pendingJurisdictions = disclosures
      .filter((d) => !d.acknowledgedAt)
      .map((d) => d.jurisdiction);
    return {
      bookingId,
      allAcknowledged: disclosures.length > 0 && pendingJurisdictions.length === 0,
      pendingJurisdictions,
      disclosures,
    };
  } finally {
    client.release();
  }
}
export async function isDisclosureGatePassed(bookingId: string): Promise<boolean> {
  const status = await getBookingDisclosureStatus(bookingId);
  return status.allAcknowledged;
}
export async function getDisclosuresApproachingDeadline(
  warningThresholdHours = 24,
  deadlineHours = 72,
): Promise<PendingDeadlineDisclosure[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const windowStart = deadlineHours;
    const windowEnd = deadlineHours - warningThresholdHours;
    const result = await client.query<DeadlineRow>(
      `SELECT
         booking_id,
         jurisdiction,
         created_at,
         EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_elapsed
       FROM travel_disclosure_records
       WHERE acknowledged_at IS NULL
         AND created_at BETWEEN NOW() - ($1 || ' hours')::INTERVAL
                             AND NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY created_at`,
      [windowStart, windowEnd],
    );
    return result.rows.map((row) => ({
      bookingId: row.booking_id,
      jurisdiction: row.jurisdiction as DisclosureJurisdiction,
      createdAt: row.created_at,
      hoursElapsed: Math.round(Number(row.hours_elapsed) * 10) / 10,
      hoursRemaining: Math.max(0, Math.round((deadlineHours - Number(row.hours_elapsed)) * 10) / 10),
    }));
  } finally {
    client.release();
  }
}
export async function getOverdueDisclosures(deadlineHours = 72): Promise<PendingDeadlineDisclosure[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query<DeadlineRow>(
      `SELECT
         booking_id,
         jurisdiction,
         created_at,
         EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_elapsed
       FROM travel_disclosure_records
       WHERE acknowledged_at IS NULL
         AND created_at < NOW() - ($1 || ' hours')::INTERVAL
       ORDER BY created_at`,
      [deadlineHours],
    );
    return result.rows.map((row) => ({
      bookingId: row.booking_id,
      jurisdiction: row.jurisdiction as DisclosureJurisdiction,
      createdAt: row.created_at,
      hoursElapsed: Math.round(Number(row.hours_elapsed) * 10) / 10,
      hoursRemaining: 0,
    }));
  } finally {
    client.release();
  }
}
