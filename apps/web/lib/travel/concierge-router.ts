'use server';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentCategory =
  | 'faq'
  | 'simple_modification'
  | 'visa_inquiry'
  | 'safety_advisory'
  | 'complaint'
  | 'accessibility_need'
  | 'unknown';

export interface RouteDecision {
  destination: 'ai' | 'human';
  intent: IntentCategory;
  confidence: number;
  reason: string;
}

export interface BookingContext {
  bookingId: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  status?: string;
  travelerName?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProcessMessageResult {
  reply: string;
  routedTo: 'ai' | 'human';
  intent: IntentCategory;
  reason: string;
}

// ─── Classification constants ─────────────────────────────────────────────────

type ClassifiableIntent = Exclude<IntentCategory, 'unknown'>;

const INTENT_PATTERNS: Record<ClassifiableIntent, RegExp[]> = {
  complaint: [
    /\bcomplaint\b/i, /\bunhappy\b/i, /disappoint/i, /\brefund\b/i,
    /compensation/i, /\bterrible\b/i, /unacceptable/i, /\bawful\b/i,
    /\bworst\b/i, /outraged/i, /disgusted/i,
  ],
  safety_advisory: [
    /\bsafety\b/i, /\badvisory\b/i, /travel.*warn/i, /\bdanger/i,
    /\brisks?\b/i, /travel.*alert/i, /\bemergency\b/i, /evacuation/i,
    /natural.*disaster/i, /civil.*unrest/i,
  ],
  visa_inquiry: [
    /\bvisa\b/i, /\bpassport\b/i, /entry.*require/i, /\bcustoms\b/i,
    /\bimmigration\b/i, /border.*cross/i, /work.*permit/i,
    /transit.*require/i, /e-?ta\b/i,
  ],
  accessibility_need: [
    /wheelchair/i, /disabilit/i, /\baccessib/i, /special.*assist/i,
    /\bdeaf\b/i, /\bblind\b/i, /impair/i, /\bmobilit/i,
    /hearing.*aid/i, /visual.*impair/i,
  ],
  simple_modification: [
    /change.*seat/i, /seat.*change/i, /update.*contact/i,
    /modify.*meal/i, /meal.*prefer/i, /add.*bag/i, /extra.*bag/i,
    /change.*name/i, /correct.*name/i, /\bupgrade\b/i, /select.*seat/i,
    /add.*meal/i, /change.*flight/i, /reschedule/i,
  ],
  faq: [
    /how.*do/i, /\bwhat.*is\b/i, /when.*does/i, /\bcan i\b/i,
    /is.*possible/i, /\btell me\b/i, /check.*in/i, /\bbaggage\b/i,
    /\bprice\b/i, /\bcost\b/i, /\bpolicy\b/i, /\ballowed\b/i,
    /\bcancel/i, /\bhow long/i, /departure.*time/i, /arrival.*time/i,
    /lounge.*access/i, /frequent.*flyer/i,
  ],
};

const HUMAN_REQUIRED: ReadonlySet<IntentCategory> = new Set<IntentCategory>([
  'visa_inquiry',
  'safety_advisory',
  'complaint',
  'accessibility_need',
]);

const HUMAN_HANDOFF_MESSAGES: Partial<Record<IntentCategory, string>> = {
  visa_inquiry:
    "I'm connecting you with a specialist human agent for visa and entry requirements. They have access to the most current regulations and will be with you shortly.",
  safety_advisory:
    "For safety and travel advisories, a human agent needs to review the latest government guidance for your destination. Connecting you now — please hold.",
  complaint:
    "I'm sorry to hear you're having a difficult experience. I'm transferring you to a dedicated human agent who has the authority to investigate and resolve this for you.",
  accessibility_need:
    "I'm connecting you with a human agent trained in accessibility services who can coordinate the specific assistance you need directly with the service providers.",
};

const HUMAN_REASONS: Partial<Record<IntentCategory, string>> = {
  visa_inquiry: 'Visa and entry requirements carry legal liability — a verified human agent will assist.',
  safety_advisory: 'Safety advisories require human judgment to ensure your wellbeing.',
  complaint: 'Complaints require human empathy and authority to investigate and resolve.',
  accessibility_need: 'Accessibility needs require direct coordination with service providers.',
};

// ─── Private helpers ──────────────────────────────────────────────────────────

function classifyIntent(message: string): IntentCategory {
  const priority: ClassifiableIntent[] = [
    'complaint',
    'safety_advisory',
    'visa_inquiry',
    'accessibility_need',
    'simple_modification',
    'faq',
  ];
  for (const intent of priority) {
    if (INTENT_PATTERNS[intent].some((p) => p.test(message))) {
      return intent;
    }
  }
  return 'unknown';
}

function routeMessage(message: string): RouteDecision {
  const intent = classifyIntent(message);
  if (HUMAN_REQUIRED.has(intent)) {
    return {
      destination: 'human',
      intent,
      confidence: 0.92,
      reason: HUMAN_REASONS[intent] ?? 'This request requires a human agent per our liability policy.',
    };
  }
  return {
    destination: 'ai',
    intent,
    confidence: intent === 'unknown' ? 0.5 : 0.88,
    reason:
      intent === 'faq'
        ? 'FAQ answered from booking knowledge base.'
        : intent === 'simple_modification'
          ? 'Simple modification processed by AI workflow.'
          : 'AI will attempt to assist; will escalate if unable to help.',
  };
}

function buildSystemPrompt(ctx: BookingContext): string {
  const lines: string[] = [
    'You are a helpful travel concierge AI assistant.',
    `Booking reference: ${ctx.bookingId}`,
  ];
  if (ctx.travelerName) lines.push(`Traveler: ${ctx.travelerName}`);
  if (ctx.destination) lines.push(`Destination: ${ctx.destination}`);
  if (ctx.departureDate) lines.push(`Departure: ${ctx.departureDate}`);
  if (ctx.returnDate) lines.push(`Return: ${ctx.returnDate}`);
  if (ctx.status) lines.push(`Booking status: ${ctx.status}`);
  lines.push(
    '',
    'Handle FAQ questions and simple modification requests. For modifications, confirm what you will change and ask the traveler to confirm before proceeding.',
    'Keep responses under 120 words. Be warm, professional, and clear.',
  );
  return lines.join('\n');
}

function generateFallbackReply(message: string): string {
  if (/check.?in/i.test(message)) {
    return 'Check-in typically opens 24 hours before departure. Please confirm with your airline for specific times.';
  }
  if (/baggage|luggage/i.test(message)) {
    return 'Standard baggage allowance is listed in your booking confirmation. Would you like me to look into adding extra baggage for your trip?';
  }
  if (/seat/i.test(message)) {
    return "I can help you with seat selection. Could you let me know your preferred seat type — window, aisle, or extra legroom?";
  }
  if (/meal/i.test(message)) {
    return "I can update your meal preference. Options typically include standard, vegetarian, vegan, kosher, or halal. Which would you prefer?";
  }
  return "Thank you for your message. I'm reviewing your booking and will provide a response shortly. Is there anything specific about your itinerary I can help clarify?";
}

async function callAnthropicApi(
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return generateFallbackReply(userMessage);
  }
  const requestMessages = [
    ...history,
    { role: 'user' as const, content: userMessage },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: systemPrompt,
      messages: requestMessages,
    }),
  });
  if (!res.ok) {
    return generateFallbackReply(userMessage);
  }
  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  return data.content.find((b) => b.type === 'text')?.text ?? generateFallbackReply(userMessage);
}

// ─── Server actions (exported) ────────────────────────────────────────────────

export async function processConciergeMessage(
  bookingContext: BookingContext,
  userMessage: string,
  history: HistoryMessage[],
): Promise<ProcessMessageResult> {
  const decision = routeMessage(userMessage);

  if (decision.destination === 'human') {
    const handoff =
      HUMAN_HANDOFF_MESSAGES[decision.intent] ??
      "I'm transferring you to a human agent who can best assist with your request. They'll be with you shortly.";
    return {
      reply: handoff,
      routedTo: 'human',
      intent: decision.intent,
      reason: decision.reason,
    };
  }

  const systemPrompt = buildSystemPrompt(bookingContext);
  const aiReply = await callAnthropicApi(systemPrompt, history, userMessage);

  return {
    reply: aiReply,
    routedTo: 'ai',
    intent: decision.intent,
    reason: decision.reason,
  };
}

export async function getBookingContext(bookingId: string): Promise<BookingContext> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { bookingId };
  try {
    const { Pool } = (await import(/* webpackIgnore: true */ 'pg')) as typeof import('pg');
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    const { rows } = await pool.query<{
      status: string | null;
      destination: string | null;
      departure_date: string | null;
      return_date: string | null;
      traveler_name: string | null;
    }>(
      `SELECT b.status,
              i.destination,
              b.departure_date::text,
              b.return_date::text,
              t.full_name AS traveler_name
       FROM bookings b
       LEFT JOIN itineraries i ON i.booking_id = b.id
       LEFT JOIN travelers t ON t.booking_id = b.id AND t.is_primary = true
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId],
    );
    await pool.end();
    if (rows.length === 0) return { bookingId };
    const row = rows[0];
    return {
      bookingId,
      destination: row.destination ?? undefined,
      departureDate: row.departure_date ?? undefined,
      returnDate: row.return_date ?? undefined,
      status: row.status ?? undefined,
      travelerName: row.traveler_name ?? undefined,
    };
  } catch {
    return { bookingId };
  }
}
