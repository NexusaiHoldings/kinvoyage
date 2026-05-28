/**
 * Itinerary Detail Page — server component.
 *
 * Displays a generated multi-stop itinerary with:
 *   - Human-in-the-loop status indicator (pending_review / approved / rejected)
 *   - Stop-by-stop breakdown with flights, hotels, activities
 *   - Pricing summary and supplier relationship notes
 *
 * Status pending_review: customer sees a "Your concierge is reviewing" state.
 * Status approved: full itinerary is revealed.
 * Status rejected: customer sees a gentle "we're refining" message.
 */

import { notFound } from "next/navigation";
import { getItinerary, type GeneratedItinerary, type StopDetail } from "@/lib/travel/itinerary-generator";

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Sub-components (server-renderable)
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: GeneratedItinerary["status"];
}): JSX.Element {
  const styles: Record<string, string> = {
    pending_review:
      "bg-amber-400/10 text-amber-400 border border-amber-400/30",
    approved: "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30",
    rejected: "bg-red-400/10 text-red-400 border border-red-400/30",
    generating:
      "bg-sky-400/10 text-sky-400 border border-sky-400/30",
  };
  const labels: Record<string, string> = {
    pending_review: "Under Concierge Review",
    approved: "Approved",
    rejected: "Refinement in Progress",
    generating: "Generating…",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${styles[status] ?? ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] ?? status}
    </span>
  );
}

function StopCard({ stop, index }: { stop: StopDetail; index: number }): JSX.Element {
  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <header className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-amber-400 mb-1">
            Stop {index + 1} · Days {stop.day}–{stop.day + Math.max(0, Math.round((new Date(stop.departureDate).getTime() - new Date(stop.arrivalDate).getTime()) / (1000 * 60 * 60 * 24)))}
          </p>
          <h3 className="text-xl font-light text-white">
            {stop.cityName}, {stop.country}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {stop.arrivalDate} → {stop.departureDate}
          </p>
        </div>
        <span className="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded">
          {stop.cityCode}
        </span>
      </header>

      {/* Activities */}
      <section className="mb-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">
          Curated Experiences
        </p>
        <ul className="space-y-1">
          {stop.activities.map((activity, ai) => (
            <li key={ai} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="mt-1 text-amber-400 shrink-0">◆</span>
              {activity}
            </li>
          ))}
        </ul>
      </section>

      {/* Hotel */}
      {stop.bestHotel && (
        <section className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">
            Accommodation
          </p>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-white">
                {stop.bestHotel.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {"★".repeat(stop.bestHotel.stars)} · {stop.bestHotel.supplierCode}
              </p>
              {stop.bestHotel.address && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {stop.bestHotel.address}
                </p>
              )}
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-sm font-semibold text-amber-300">
                ${stop.bestHotel.pricePerNight.toLocaleString()}/night
              </p>
              <p className="text-xs text-gray-500">
                ${stop.bestHotel.totalPrice.toLocaleString()} total
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Departure flight */}
      {stop.departureFlight && (
        <section className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">
            Onward Flight
          </p>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-mono text-white">
                {stop.departureFlight.flightNumber}
              </p>
              <p className="text-xs text-gray-400">
                {stop.departureFlight.origin} → {stop.departureFlight.destination}
                {" · "}
                {Math.floor(stop.departureFlight.durationMinutes / 60)}h{" "}
                {stop.departureFlight.durationMinutes % 60}m
              </p>
            </div>
            <p className="text-sm font-semibold text-amber-300">
              ${stop.departureFlight.price.toLocaleString()}
            </p>
          </div>
        </section>
      )}

      {/* Stop cost */}
      <div className="mt-4 flex justify-between items-center border-t border-gray-800 pt-3">
        <p className="text-xs text-gray-500">Estimated stop total</p>
        <p className="text-sm font-semibold text-white">
          ${stop.estimatedCost.toLocaleString()}
        </p>
      </div>

      {/* Supplier notes */}
      {stop.supplierNotes && (
        <p className="mt-2 text-xs text-gray-600 italic">{stop.supplierNotes}</p>
      )}
    </article>
  );
}

function PendingReviewState({ title }: { title: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-amber-400/40 flex items-center justify-center">
        <span className="text-amber-400 text-xl">◎</span>
      </div>
      <h2 className="text-lg font-light text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto">
        Your dedicated travel concierge is reviewing every detail — supplier
        availability, pricing accuracy, and personalised touches. You&apos;ll
        receive an email once your itinerary is ready, typically within 2 hours.
      </p>
    </div>
  );
}

function RejectedState(): JSX.Element {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-8 text-center">
      <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto">
        Our concierge identified some adjustments to make your itinerary
        exceptional. We&apos;re refining the options and will reach out shortly.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { id: string };
}

export default async function ItineraryDetailPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const { id } = params;

  // Validate UUID format to prevent invalid DB queries
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  let itinerary: GeneratedItinerary | null = null;
  try {
    itinerary = await getItinerary(id);
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", msg: "itinerary fetch failed", id, error: String(err) })
    );
  }

  if (!itinerary) {
    notFound();
  }

  const durationDays = Math.round(
    (new Date(itinerary.endDate).getTime() -
      new Date(itinerary.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  ) + 1;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
              AI Itinerary
            </p>
            <span className="text-gray-700">·</span>
            <StatusBadge status={itinerary.status} />
          </div>

          <h1 className="text-3xl font-light tracking-tight text-white mb-3">
            {itinerary.title}
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-4">
            {itinerary.summary}
          </p>

          {/* Trip meta */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span>
              <span className="text-gray-400">{durationDays} days</span>
              {" · "}
              {itinerary.startDate} to {itinerary.endDate}
            </span>
            <span>
              <span className="text-gray-400">{itinerary.travelerCount}</span>{" "}
              traveler{itinerary.travelerCount !== 1 ? "s" : ""}
            </span>
            <span className="capitalize">
              <span className="text-gray-400">{itinerary.niche}</span> journey
            </span>
            {itinerary.milestoneEventType && (
              <span className="capitalize text-amber-400">
                {itinerary.milestoneEventType}
              </span>
            )}
          </div>
        </div>

        {/* Human-in-the-loop gate */}
        {itinerary.status === "pending_review" ? (
          <div className="space-y-6">
            <PendingReviewState title={itinerary.title} />
            {/* Show anonymised stop count so customer knows work is underway */}
            <p className="text-center text-xs text-gray-600">
              {itinerary.stops.length}-stop itinerary across{" "}
              {[...new Set(itinerary.stops.map((s) => s.country))].join(", ")}{" "}
              · Under concierge review
            </p>
          </div>
        ) : itinerary.status === "rejected" ? (
          <RejectedState />
        ) : (
          /* Approved or generating — show full itinerary */
          <div className="space-y-8">
            {/* Pricing summary */}
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
                    Total Estimated Cost
                  </p>
                  <p className="text-3xl font-light text-white">
                    ${itinerary.totalEstimatedPrice.toLocaleString()}
                    <span className="text-base text-gray-500 ml-1">
                      {itinerary.currency}
                    </span>
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    ~$
                    {Math.round(
                      itinerary.totalEstimatedPrice / itinerary.travelerCount
                    ).toLocaleString()}{" "}
                    per person
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Supplier Score</p>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-24 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${itinerary.marginScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-amber-400 font-mono">
                      {itinerary.marginScore}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Supplier relationships */}
              {itinerary.supplierRelationships.length > 0 && (
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                    Preferred Supplier Network
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {itinerary.supplierRelationships.map((supplier, si) => (
                      <span
                        key={si}
                        className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-300"
                      >
                        {supplier}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Stops */}
            <section>
              <p className="text-xs font-medium uppercase tracking-widest text-gray-400 mb-4">
                Your {itinerary.stops.length}-Stop Itinerary
              </p>
              <div className="space-y-4">
                {itinerary.stops.map((stop, si) => (
                  <StopCard key={si} stop={stop} index={si} />
                ))}
              </div>
            </section>

            {/* AI rationale */}
            {itinerary.aiRationale && (
              <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">
                  Curation Notes
                </p>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {itinerary.aiRationale}
                </p>
              </section>
            )}
          </div>
        )}

        {/* Back link */}
        <div className="mt-12 border-t border-gray-800 pt-8">
          <a
            href="/itinerary/new"
            className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
          >
            ← Build another itinerary
          </a>
        </div>
      </div>
    </main>
  );
}
