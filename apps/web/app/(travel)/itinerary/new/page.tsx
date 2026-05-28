"use client";

/**
 * New Itinerary Page — AI Multi-Stop Itinerary Builder
 *
 * Customer submits: niche, dates, traveler count, milestone event type.
 * On submit, calls the server action which invokes the AI generator and
 * redirects to /itinerary/[id] once the draft is created.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TravelNiche =
  | "luxury"
  | "adventure"
  | "cultural"
  | "wellness"
  | "romance"
  | "food"
  | "family";

type MilestoneEventType =
  | "anniversary"
  | "honeymoon"
  | "birthday"
  | "retirement"
  | "graduation"
  | "bucket-list"
  | "";

interface FormState {
  niche: TravelNiche;
  startDate: string;
  endDate: string;
  travelerCount: number;
  milestoneEventType: MilestoneEventType;
  budget: string;
  originCityCode: string;
}

const NICHE_OPTIONS: { value: TravelNiche; label: string; icon: string }[] = [
  { value: "luxury", label: "Luxury & Ultra-Premium", icon: "✦" },
  { value: "adventure", label: "Adventure & Exploration", icon: "⛰" },
  { value: "cultural", label: "Cultural Immersion", icon: "🏛" },
  { value: "wellness", label: "Wellness & Retreat", icon: "◎" },
  { value: "romance", label: "Romantic Escape", icon: "♡" },
  { value: "food", label: "Culinary Journey", icon: "◈" },
  { value: "family", label: "Family Multi-Gen", icon: "◉" },
];

const MILESTONE_OPTIONS: { value: MilestoneEventType; label: string }[] = [
  { value: "", label: "No special occasion" },
  { value: "anniversary", label: "Anniversary" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "birthday", label: "Milestone Birthday" },
  { value: "retirement", label: "Retirement Celebration" },
  { value: "graduation", label: "Graduation" },
  { value: "bucket-list", label: "Bucket List Trip" },
];

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function minReturnDate(startDate: string): string {
  if (!startDate) return todayString();
  const d = new Date(startDate);
  d.setDate(d.getDate() + 10);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewItineraryPage(): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<FormState>({
    niche: "luxury",
    startDate: "",
    endDate: "",
    travelerCount: 2,
    milestoneEventType: "",
    budget: "",
    originCityCode: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(evt: FormEvent<HTMLFormElement>): Promise<void> {
    evt.preventDefault();
    setError(null);

    if (!form.startDate || !form.endDate) {
      setError("Please select travel dates.");
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError("Return date must be after departure date.");
      return;
    }
    const durationDays = Math.round(
      (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (durationDays < 10) {
      setError(
        "Our multi-stop itinerary builder is designed for trips of 10 days or more."
      );
      return;
    }

    setGenerating(true);

    startTransition(async () => {
      try {
        const resp = await fetch("/api/travel/itinerary/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niche: form.niche,
            startDate: form.startDate,
            endDate: form.endDate,
            travelerCount: form.travelerCount,
            milestoneEventType: form.milestoneEventType || undefined,
            budget: form.budget ? parseFloat(form.budget) : undefined,
            currency: "USD",
            originCityCode: form.originCityCode || undefined,
          }),
        });

        if (!resp.ok) {
          const data = (await resp.json()) as { error?: string };
          throw new Error(data.error ?? `Server error ${resp.status}`);
        }

        const data = (await resp.json()) as { id: string };
        router.push(`/itinerary/${data.id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred."
        );
        setGenerating(false);
      }
    });
  }

  const isLoading = isPending || generating;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400 mb-3">
            AI Itinerary Builder
          </p>
          <h1 className="text-3xl font-light tracking-tight text-white mb-3">
            Design Your Multi-Stop Journey
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Our AI cross-references live pricing from global supplier networks
            to craft a bespoke itinerary, reviewed by your dedicated travel
            concierge before delivery.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Travel Niche */}
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-4">
              Travel Style
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {NICHE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField("niche", opt.value)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                    form.niche === opt.value
                      ? "border-amber-400 bg-amber-400/10 text-amber-300"
                      : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  <span className="mr-2 text-base">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Dates */}
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-4">
              Travel Dates
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">
                  Departure
                </span>
                <input
                  type="date"
                  required
                  min={todayString()}
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">
                  Return (min 10 days)
                </span>
                <input
                  type="date"
                  required
                  min={minReturnDate(form.startDate)}
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </label>
            </div>
          </fieldset>

          {/* Travelers & Milestone */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2 block">
                Travelers
              </span>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={form.travelerCount}
                onChange={(e) =>
                  updateField("travelerCount", parseInt(e.target.value, 10))
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2 block">
                Occasion
              </span>
              <select
                value={form.milestoneEventType}
                onChange={(e) =>
                  updateField(
                    "milestoneEventType",
                    e.target.value as MilestoneEventType
                  )
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                {MILESTONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2 block">
                Budget (USD, optional)
              </span>
              <input
                type="number"
                min={5000}
                step={1000}
                placeholder="e.g. 50000"
                value={form.budget}
                onChange={(e) => updateField("budget", e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-amber-400 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-2 block">
                Origin Airport (IATA, optional)
              </span>
              <input
                type="text"
                maxLength={3}
                placeholder="e.g. JFK"
                value={form.originCityCode}
                onChange={(e) =>
                  updateField(
                    "originCityCode",
                    e.target.value.toUpperCase().trim()
                  )
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-amber-400 focus:outline-none font-mono"
              />
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-amber-400 px-6 py-4 text-sm font-semibold text-gray-950 transition-all hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-950 border-t-transparent" />
                Generating your itinerary…
              </span>
            ) : (
              "Build My Itinerary →"
            )}
          </button>

          <p className="text-center text-xs text-gray-600">
            Your itinerary will be reviewed by a concierge before you receive
            it. Typical turnaround: under 2 hours.
          </p>
        </form>
      </div>
    </main>
  );
}
