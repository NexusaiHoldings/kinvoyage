import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { z } from "zod";

const ClassificationSchema = z.enum([
  "faq_answerable",
  "modification_request",
  "visa_inquiry",
  "safety_advisory",
  "complaint",
  "accessibility_need",
]);

const ArgsSchema = z
  .object({
    message: z.string().min(1, "message is required"),
    channel: z.string().optional(),
    locale: z.string().optional(),
    traveler_profile: z
      .object({
        accessibility_notes: z.array(z.string()).optional(),
        vip_status: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

type Classification = z.infer<typeof ClassificationSchema>;
type Args = z.infer<typeof ArgsSchema>;

interface Rule {
  classification: Classification;
  keywords: string[];
  escalate: boolean;
}

const RULES: Rule[] = [
  {
    classification: "visa_inquiry",
    keywords: [
      "visa",
      "passport",
      "travel document",
      "entry requirement",
      "immigration",
      "evisa",
      "embassy",
    ],
    escalate: true,
  },
  {
    classification: "safety_advisory",
    keywords: [
      "safety",
      "danger",
      "emergency",
      "evacuate",
      "evacuation",
      "alert",
      "incident",
      "threat",
      "violence",
    ],
    escalate: true,
  },
  {
    classification: "complaint",
    keywords: [
      "complain",
      "complaint",
      "unacceptable",
      "refund",
      "dissatisfied",
      "angry",
      "issue",
      "frustrated",
      "escalate",
    ],
    escalate: true,
  },
  {
    classification: "accessibility_need",
    keywords: [
      "wheelchair",
      "accessible",
      "disability",
      "hearing",
      "visual",
      "mobility",
      "assistance",
      "service animal",
      "special needs",
    ],
    escalate: true,
  },
  {
    classification: "modification_request",
    keywords: [
      "change",
      "modify",
      "update",
      "adjust",
      "reschedule",
      "add night",
      "remove night",
      "swap",
      "change flight",
      "change hotel",
      "upgrade",
      "downgrade",
    ],
    escalate: false,
  },
];

const FALLBACK_CLASSIFICATION: Classification = "faq_answerable";

const NEEDS_ESCALATION: ReadonlySet<Classification> = new Set(
  RULES.filter((rule) => rule.escalate).map((rule) => rule.classification),
);

const sanitizeText = (input: string): string =>
  input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const calculateConfidence = (matchedKeywordCount: number, totalKeywords: number): number => {
  if (matchedKeywordCount === 0 || totalKeywords === 0) {
    return 0.4;
  }
  const base = Math.min(1, matchedKeywordCount / totalKeywords);
  return Number((0.4 + 0.5 * base).toFixed(2));
};

const buildRationale = (classification: Classification, matchedKeywords: string[]): string => {
  if (matchedKeywords.length === 0) {
    return `Defaulted to '${classification}' based on absence of higher-risk indicators.`;
  }
  return `Classified as '${classification}' after matching keywords: ${matchedKeywords
    .map((keyword) => `"${keyword}"`)
    .join(", ")}.`;
};

export const handleClassifyConciergeIntent = async (
  _ctx: HandlerContext,
  rawArgs: Record<string, unknown>,
): Promise<HandlerResult> => {
  const parsedArgs = ArgsSchema.safeParse(rawArgs);
  if (!parsedArgs.success) {
    return {
      status: 400,
      body: {
        type: "invalid_arguments",
        message: "Invalid arguments supplied to classify_concierge_intent.",
        details: parsedArgs.error.flatten() as Record<string, unknown>,
      },
    };
  }

  const { message, channel, locale } = parsedArgs.data;
  const normalizedMessage = sanitizeText(message);

  let selectedRule: Rule | undefined;
  let matchedKeywords: string[] = [];

  for (const rule of RULES) {
    const hits = rule.keywords.filter((keyword) => normalizedMessage.includes(keyword));
    if (hits.length > 0) {
      if (!selectedRule || hits.length > matchedKeywords.length) {
        selectedRule = rule;
        matchedKeywords = hits;
      }
    }
  }

  const classification = selectedRule?.classification ?? FALLBACK_CLASSIFICATION;
  const confidence = selectedRule
    ? calculateConfidence(matchedKeywords.length, selectedRule.keywords.length)
    : 0.35;
  const needsEscalation = NEEDS_ESCALATION.has(classification);
  const rationale = buildRationale(classification, matchedKeywords);

  return {
    status: 200,
    body: {
      classification,
      confidence,
      needs_escalation: needsEscalation,
      rationale,
      channel: channel ?? null,
      locale: locale ?? null,
      matched_keywords: matchedKeywords,
    },
  };
};

