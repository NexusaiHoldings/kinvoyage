/**
 * AI Multi-Stop Itinerary Generator.
 *
 * RAG pipeline:
 *   1. Retrieve curated destination content from the DB (vector similarity
 *      when pgvector is enabled; keyword fallback otherwise).
 *   2. Cross-reference real-time pricing from GDS feeds.
 *   3. Send assembled context to Claude Sonnet for structured itinerary
 *      generation with margin-optimised supplier selections.
 *   4. Persist the draft itinerary with status=pending_review — a human
 *      agent must approve before the customer sees it (autonomous_operation_score
 *      25/100 per feasibility_analysis).
 *
 * DB access: raw SQL via pg Pool (same pattern as apps/web/lib/db.ts).
 */

import { randomUUID } from "crypto";
import { gdsClient, type GDSFlight, type GDSHotel } from "./gds-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItineraryStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "generating";

export interface ItineraryRequest {
  niche: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  milestoneEventType?: string;
  budget?: number;
  currency?: string;
  originCityCode?: string;
}

export interface StopDetail {
  day: number;
  cityCode: string;
  cityName: string;
  country: string;
  arrivalDate: string;
  departureDate: string;
  activities: string[];
  highlights: string[];
  bestHotel: GDSHotel | null;
  departureFlight: GDSFlight | null;
  estimatedCost: number;
  supplierNotes: string;
}

export interface GeneratedItinerary {
  id: string;
  title: string;
  summary: string;
  niche: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  milestoneEventType: string | null;
  stops: StopDetail[];
  totalEstimatedPrice: number;
  currency: string;
  marginScore: number;
  supplierRelationships: string[];
  aiRationale: string;
  status: ItineraryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DestinationContent {
  cityCode: string;
  cityName: string;
  country: string;
  region: string;
  niches: string[];
  highlights: string[];
  bestMonths: string[];
  typicalDurationDays: number;
  premiumSuppliers: string[];
  marginTier: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// DB helpers (pg Pool via eval("require") — same pattern as db.ts)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_pool) return _pool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = eval("require")("pg") as {
    Pool: new (cfg: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

// ---------------------------------------------------------------------------
// Curated destination content (RAG seed data / fallback)
// ---------------------------------------------------------------------------

const DESTINATION_LIBRARY: DestinationContent[] = [
  {
    cityCode: "KYT",
    cityName: "Kyoto",
    country: "Japan",
    region: "Asia",
    niches: ["cultural", "luxury", "wellness"],
    highlights: [
      "Fushimi Inari shrine",
      "Arashiyama bamboo grove",
      "kaiseki dining",
      "ryokan stays",
    ],
    bestMonths: ["March", "April", "October", "November"],
    typicalDurationDays: 3,
    premiumSuppliers: ["Aman Kyoto", "The Ritz-Carlton Kyoto"],
    marginTier: "high",
  },
  {
    cityCode: "NRT",
    cityName: "Tokyo",
    country: "Japan",
    region: "Asia",
    niches: ["cultural", "adventure", "luxury"],
    highlights: [
      "Tsukiji market",
      "teamLab Borderless",
      "Shinjuku nightlife",
      "omakase sushi",
    ],
    bestMonths: ["March", "April", "October", "November"],
    typicalDurationDays: 4,
    premiumSuppliers: ["Aman Tokyo", "Park Hyatt Tokyo"],
    marginTier: "high",
  },
  {
    cityCode: "FCO",
    cityName: "Rome",
    country: "Italy",
    region: "Europe",
    niches: ["cultural", "luxury", "food"],
    highlights: [
      "Colosseum VIP access",
      "Vatican private tour",
      "truffle dinner",
      "Pantheon at dawn",
    ],
    bestMonths: ["April", "May", "September", "October"],
    typicalDurationDays: 3,
    premiumSuppliers: ["Hotel de Russie", "J.K. Place Roma"],
    marginTier: "high",
  },
  {
    cityCode: "CDG",
    cityName: "Paris",
    country: "France",
    region: "Europe",
    niches: ["luxury", "romance", "cultural"],
    highlights: [
      "Louvre after-hours",
      "Michelin dining",
      "Seine river cruise",
      "Versailles private access",
    ],
    bestMonths: ["April", "May", "June", "September"],
    typicalDurationDays: 3,
    premiumSuppliers: ["Le Meurice", "Four Seasons George V"],
    marginTier: "high",
  },
  {
    cityCode: "MLE",
    cityName: "Malé",
    country: "Maldives",
    region: "Indian Ocean",
    niches: ["luxury", "wellness", "romance"],
    highlights: [
      "overwater bungalow",
      "private reef snorkeling",
      "underwater dining",
      "sunset dolphin cruise",
    ],
    bestMonths: ["November", "December", "January", "February", "March"],
    typicalDurationDays: 4,
    premiumSuppliers: ["Soneva Fushi", "Six Senses Laamu", "One&Only Reethi Rah"],
    marginTier: "high",
  },
  {
    cityCode: "GRU",
    cityName: "São Paulo",
    country: "Brazil",
    region: "South America",
    niches: ["cultural", "food", "adventure"],
    highlights: [
      "Vila Madalena street art",
      "Ibirapuera Park",
      "Liberdade district",
      "fine dining scene",
    ],
    bestMonths: ["April", "May", "September", "October"],
    typicalDurationDays: 2,
    premiumSuppliers: ["Rosewood São Paulo", "Fasano Hotel"],
    marginTier: "medium",
  },
  {
    cityCode: "CPT",
    cityName: "Cape Town",
    country: "South Africa",
    region: "Africa",
    niches: ["adventure", "cultural", "luxury"],
    highlights: [
      "Table Mountain cable car",
      "Cape Winelands tour",
      "Boulders Beach penguins",
      "Cape Point drive",
    ],
    bestMonths: ["November", "December", "January", "February"],
    typicalDurationDays: 3,
    premiumSuppliers: ["Ellerman House", "Belmond Mount Nelson"],
    marginTier: "high",
  },
  {
    cityCode: "DXB",
    cityName: "Dubai",
    country: "UAE",
    region: "Middle East",
    niches: ["luxury", "adventure", "shopping"],
    highlights: [
      "Burj Khalifa top floor",
      "desert safari",
      "dhow dinner cruise",
      "Gold Souk",
    ],
    bestMonths: ["October", "November", "December", "February", "March"],
    typicalDurationDays: 3,
    premiumSuppliers: ["Burj Al Arab", "Atlantis The Royal"],
    marginTier: "high",
  },
];

// ---------------------------------------------------------------------------
// RAG: destination retrieval
// ---------------------------------------------------------------------------

async function retrieveDestinationContent(
  niche: string,
  durationDays: number
): Promise<DestinationContent[]> {
  // Try DB-backed vector search first
  try {
    const rows = await dbQuery<{
      city_code: string;
      city_name: string;
      country: string;
      region: string;
      niches: string[];
      highlights: string[];
      best_months: string[];
      typical_duration_days: number;
      premium_suppliers: string[];
      margin_tier: string;
    }>(
      `SELECT city_code, city_name, country, region, niches, highlights,
              best_months, typical_duration_days, premium_suppliers, margin_tier
       FROM travel_destination_content
       WHERE $1 = ANY(niches)
       ORDER BY margin_tier DESC, typical_duration_days ASC
       LIMIT 12`,
      [niche.toLowerCase()]
    );

    if (rows.length > 0) {
      return rows.map((r) => ({
        cityCode: r.city_code,
        cityName: r.city_name,
        country: r.country,
        region: r.region,
        niches: r.niches,
        highlights: r.highlights,
        bestMonths: r.best_months,
        typicalDurationDays: r.typical_duration_days,
        premiumSuppliers: r.premium_suppliers,
        marginTier: r.margin_tier as "high" | "medium" | "low",
      }));
    }
  } catch {
    // DB not available or table not yet migrated — fall through to seed data
  }

  // Fallback: filter curated library by niche
  const normalised = niche.toLowerCase();
  const matches = DESTINATION_LIBRARY.filter(
    (d) =>
      d.niches.some((n) => n.includes(normalised) || normalised.includes(n)) ||
      d.marginTier === "high"
  );

  // Return enough destinations to fill the trip duration
  const maxStops = Math.max(3, Math.ceil(durationDays / 3));
  return matches.slice(0, maxStops + 2); // extra 2 for AI to select from
}

// ---------------------------------------------------------------------------
// Itinerary persistence
// ---------------------------------------------------------------------------

async function saveItinerary(itinerary: GeneratedItinerary): Promise<string> {
  const stopsJson = JSON.stringify(itinerary.stops);
  const suppliersJson = JSON.stringify(itinerary.supplierRelationships);

  try {
    await dbQuery(
      `INSERT INTO travel_itineraries (
         id, title, summary, niche, start_date, end_date, traveler_count,
         milestone_event_type, stops, total_estimated_price, currency,
         margin_score, supplier_relationships, ai_rationale,
         status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12,
         $13::jsonb, $14, $15, $16, $17
       )`,
      [
        itinerary.id,
        itinerary.title,
        itinerary.summary,
        itinerary.niche,
        itinerary.startDate,
        itinerary.endDate,
        itinerary.travelerCount,
        itinerary.milestoneEventType,
        stopsJson,
        itinerary.totalEstimatedPrice,
        itinerary.currency,
        itinerary.marginScore,
        suppliersJson,
        itinerary.aiRationale,
        itinerary.status,
        itinerary.createdAt,
        itinerary.updatedAt,
      ]
    );
  } catch (err) {
    // Log but don't fail — allows UI to display AI output even if DB is unavailable
    console.error(
      JSON.stringify({
        level: "error",
        msg: "itinerary save failed",
        id: itinerary.id,
        error: String(err),
      })
    );
  }

  return itinerary.id;
}

export async function getItinerary(
  id: string
): Promise<GeneratedItinerary | null> {
  const rows = await dbQuery<{
    id: string;
    title: string;
    summary: string;
    niche: string;
    start_date: string;
    end_date: string;
    traveler_count: number;
    milestone_event_type: string | null;
    stops: StopDetail[];
    total_estimated_price: number;
    currency: string;
    margin_score: number;
    supplier_relationships: string[];
    ai_rationale: string;
    status: ItineraryStatus;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, title, summary, niche, start_date, end_date, traveler_count,
            milestone_event_type, stops, total_estimated_price, currency,
            margin_score, supplier_relationships, ai_rationale,
            status, created_at, updated_at
     FROM travel_itineraries
     WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    niche: row.niche,
    startDate: row.start_date,
    endDate: row.end_date,
    travelerCount: row.traveler_count,
    milestoneEventType: row.milestone_event_type,
    stops: row.stops,
    totalEstimatedPrice: row.total_estimated_price,
    currency: row.currency,
    marginScore: row.margin_score,
    supplierRelationships: row.supplier_relationships,
    aiRationale: row.ai_rationale,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listItineraries(
  limit = 20,
  offset = 0
): Promise<GeneratedItinerary[]> {
  const rows = await dbQuery<{
    id: string;
    title: string;
    summary: string;
    niche: string;
    start_date: string;
    end_date: string;
    traveler_count: number;
    milestone_event_type: string | null;
    stops: StopDetail[];
    total_estimated_price: number;
    currency: string;
    margin_score: number;
    supplier_relationships: string[];
    ai_rationale: string;
    status: ItineraryStatus;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, title, summary, niche, start_date, end_date, traveler_count,
            milestone_event_type, stops, total_estimated_price, currency,
            margin_score, supplier_relationships, ai_rationale,
            status, created_at, updated_at
     FROM travel_itineraries
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    niche: row.niche,
    startDate: row.start_date,
    endDate: row.end_date,
    travelerCount: row.traveler_count,
    milestoneEventType: row.milestone_event_type,
    stops: row.stops,
    totalEstimatedPrice: row.total_estimated_price,
    currency: row.currency,
    marginScore: row.margin_score,
    supplierRelationships: row.supplier_relationships,
    aiRationale: row.ai_rationale,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Claude AI itinerary generation
// ---------------------------------------------------------------------------

function buildItineraryPrompt(
  request: ItineraryRequest,
  destinations: DestinationContent[],
  gdsPricing: { flights: GDSFlight[]; hotels: GDSHotel[] }
): string {
  const durationDays =
    Math.round(
      (new Date(request.endDate).getTime() -
        new Date(request.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  const destinationContext = destinations
    .map(
      (d) =>
        `- ${d.cityName}, ${d.country} (${d.cityCode}): ${d.niches.join(", ")} | Highlights: ${d.highlights.slice(0, 3).join("; ")} | Premium suppliers: ${d.premiumSuppliers.join(", ")} | Margin tier: ${d.marginTier}`
    )
    .join("\n");

  const hotelContext =
    gdsPricing.hotels.length > 0
      ? gdsPricing.hotels
          .slice(0, 10)
          .map(
            (h) =>
              `  ${h.name} (${h.cityCode}): $${h.pricePerNight}/night, ${h.stars} stars, supplier: ${h.supplierCode}`
          )
          .join("\n")
      : "  (No live GDS hotel data — use curated supplier recommendations)";

  const flightContext =
    gdsPricing.flights.length > 0
      ? gdsPricing.flights
          .slice(0, 10)
          .map(
            (f) =>
              `  ${f.flightNumber} ${f.origin}→${f.destination}: $${f.price} ${f.currency}, ${f.cabinClass}, ${f.durationMinutes}min`
          )
          .join("\n")
      : "  (No live GDS flight data — use estimated pricing)";

  return `You are an expert luxury travel curator creating a multi-stop itinerary for an affluent leisure traveler.

TRIP DETAILS:
- Travel niche: ${request.niche}
- Dates: ${request.startDate} to ${request.endDate} (${durationDays} days)
- Travelers: ${request.travelerCount}
- Milestone event: ${request.milestoneEventType ?? "none"}
- Budget: ${request.budget ? `$${request.budget} ${request.currency ?? "USD"}` : "premium (no hard limit)"}
- Origin: ${request.originCityCode ?? "flexible"}

CURATED DESTINATION CONTENT (RAG retrieved):
${destinationContext}

LIVE GDS PRICING DATA:
Hotels:
${hotelContext}

Flights:
${flightContext}

INSTRUCTIONS:
1. Design a ${durationDays}-day multi-stop itinerary with 3-5 destination stops
2. Select destinations from the curated list that match the niche and optimize for high margin tier
3. For each stop, specify: city, arrival/departure dates, 3-4 curated activities, best hotel from GDS data (or top supplier recommendation), and departure flight
4. Calculate realistic total cost including flights + hotels + activities estimate
5. Assign a marginScore 0-100 (higher = more profit to agency from supplier commissions)
6. Identify supplier relationship opportunities

Respond ONLY with a valid JSON object matching this exact structure:
{
  "title": "string — compelling itinerary title",
  "summary": "string — 2-3 sentence overview for the customer",
  "stops": [
    {
      "day": 1,
      "cityCode": "IATA code",
      "cityName": "string",
      "country": "string",
      "arrivalDate": "YYYY-MM-DD",
      "departureDate": "YYYY-MM-DD",
      "activities": ["activity 1", "activity 2", "activity 3"],
      "highlights": ["highlight 1", "highlight 2"],
      "bestHotelName": "string or null",
      "bestHotelNightly": 0,
      "departureFlightNumber": "string or null",
      "departureFlightCost": 0,
      "estimatedCost": 0,
      "supplierNotes": "string"
    }
  ],
  "totalEstimatedPrice": 0,
  "currency": "USD",
  "marginScore": 0,
  "supplierRelationships": ["supplier 1", "supplier 2"],
  "aiRationale": "string — 2-3 sentences explaining selection reasoning"
}`;
}

interface AIItineraryStop {
  day: number;
  cityCode: string;
  cityName: string;
  country: string;
  arrivalDate: string;
  departureDate: string;
  activities: string[];
  highlights: string[];
  bestHotelName: string | null;
  bestHotelNightly: number;
  departureFlightNumber: string | null;
  departureFlightCost: number;
  estimatedCost: number;
  supplierNotes: string;
}

interface AIItineraryResponse {
  title: string;
  summary: string;
  stops: AIItineraryStop[];
  totalEstimatedPrice: number;
  currency: string;
  marginScore: number;
  supplierRelationships: string[];
  aiRationale: string;
}

function assembleStops(
  aiStops: AIItineraryStop[],
  gdsPricing: { flights: GDSFlight[]; hotels: GDSHotel[] }
): StopDetail[] {
  return aiStops.map((aiStop) => {
    const bestHotel =
      gdsPricing.hotels.find(
        (h) =>
          h.cityCode === aiStop.cityCode &&
          (aiStop.bestHotelName === null ||
            h.name
              .toLowerCase()
              .includes((aiStop.bestHotelName ?? "").toLowerCase()))
      ) ?? null;

    const departureFlight =
      gdsPricing.flights.find(
        (f) =>
          f.origin === aiStop.cityCode &&
          (aiStop.departureFlightNumber === null ||
            f.flightNumber === aiStop.departureFlightNumber)
      ) ?? null;

    return {
      day: aiStop.day,
      cityCode: aiStop.cityCode,
      cityName: aiStop.cityName,
      country: aiStop.country,
      arrivalDate: aiStop.arrivalDate,
      departureDate: aiStop.departureDate,
      activities: aiStop.activities,
      highlights: aiStop.highlights,
      bestHotel,
      departureFlight,
      estimatedCost: aiStop.estimatedCost,
      supplierNotes: aiStop.supplierNotes,
    };
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateItinerary(
  request: ItineraryRequest
): Promise<GeneratedItinerary> {
  const now = new Date().toISOString();
  const id = randomUUID();

  const durationDays =
    Math.round(
      (new Date(request.endDate).getTime() -
        new Date(request.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  // Step 1: RAG — retrieve destination content
  const destinations = await retrieveDestinationContent(
    request.niche,
    durationDays
  );

  // Step 2: GDS pricing — fetch flights + hotels for candidate stops
  const candidateStops = destinations.slice(0, 5).map((d, idx) => ({
    cityCode: d.cityCode,
    arrivalDate: new Date(
      new Date(request.startDate).getTime() +
        idx * d.typicalDurationDays * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0],
    departureDate: new Date(
      new Date(request.startDate).getTime() +
        (idx + 1) * d.typicalDurationDays * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0],
  }));

  const gdsPricing = await gdsClient
    .getMultiStopPricing(candidateStops, request.travelerCount)
    .catch(() => ({
      flights: [] as GDSFlight[],
      hotels: [] as GDSHotel[],
      searchTimestamp: now,
      currency: "USD",
    }));

  // Step 3: Claude generation via Anthropic Messages REST API (no SDK dependency)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not configured — cannot generate itinerary"
    );
  }

  const prompt = buildItineraryPrompt(request, destinations, gdsPricing);

  const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });

  if (!claudeResp.ok) {
    const errBody = await claudeResp.text();
    throw new Error(
      `Anthropic API error (${claudeResp.status}): ${errBody.slice(0, 300)}`
    );
  }

  const claudeData = (await claudeResp.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText =
    claudeData.content[0]?.type === "text" ? claudeData.content[0].text : "";

  // Parse JSON — strip any markdown fencing Claude may add
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude returned non-JSON response: ${rawText.slice(0, 200)}`);
  }

  let aiResponse: AIItineraryResponse;
  try {
    aiResponse = JSON.parse(jsonMatch[0]) as AIItineraryResponse;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude JSON response: ${String(err)}\nRaw: ${rawText.slice(0, 500)}`
    );
  }

  // Step 4: Assemble final itinerary object
  const stops = assembleStops(aiResponse.stops, gdsPricing);

  const itinerary: GeneratedItinerary = {
    id,
    title: aiResponse.title,
    summary: aiResponse.summary,
    niche: request.niche,
    startDate: request.startDate,
    endDate: request.endDate,
    travelerCount: request.travelerCount,
    milestoneEventType: request.milestoneEventType ?? null,
    stops,
    totalEstimatedPrice: aiResponse.totalEstimatedPrice,
    currency: aiResponse.currency ?? "USD",
    marginScore: Math.min(100, Math.max(0, aiResponse.marginScore)),
    supplierRelationships: aiResponse.supplierRelationships,
    aiRationale: aiResponse.aiRationale,
    status: "pending_review",
    createdAt: now,
    updatedAt: now,
  };

  // Step 5: Persist (non-blocking failure)
  await saveItinerary(itinerary);

  console.info(
    JSON.stringify({
      level: "info",
      msg: "itinerary generated",
      id,
      stops: stops.length,
      totalPrice: itinerary.totalEstimatedPrice,
      marginScore: itinerary.marginScore,
      status: itinerary.status,
    })
  );

  return itinerary;
}
