import type { JSX } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getBookingById,
  approveBooking,
  rejectBooking,
} from "@/lib/travel/agent-queue";

export const metadata = { title: "Booking Review" };

interface PageProps {
  params: { id: string };
}

async function handleApprove(formData: FormData): Promise<never> {
  "use server";
  const id = formData.get("id") as string;
  const note = (formData.get("agent_note") as string | null) ?? "";
  await approveBooking(id, note);
  redirect(`/agent/bookings/${id}?action=approved`);
}

async function handleReject(formData: FormData): Promise<never> {
  "use server";
  const id = formData.get("id") as string;
  const note = (formData.get("agent_note") as string | null) ?? "";
  await rejectBooking(id, note);
  redirect(`/agent/bookings/${id}?action=rejected`);
}

const field: React.CSSProperties = { marginBottom: 16 };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
const value: React.CSSProperties = { fontSize: 15, color: "#111827" };

function DetailRow({ name, children }: { name: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={field}>
      <div style={label}>{name}</div>
      <div style={value}>{children}</div>
    </div>
  );
}

export default async function BookingDetailPage({ params }: PageProps): Promise<JSX.Element> {
  let booking = null;
  try {
    booking = await getBookingById(params.id);
  } catch {
    // DB unavailable — treat as not found
  }

  if (!booking) {
    notFound();
  }

  const isPending = booking.status === "pending_signoff";
  const statusColor = booking.status === "confirmed" ? "#16a34a" : booking.status === "rejected" ? "#dc2626" : "#d97706";
  const statusBg = booking.status === "confirmed" ? "#dcfce7" : booking.status === "rejected" ? "#fee2e2" : "#fef3c7";

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 800, margin: "0 auto", padding: "32px 24px", color: "#111827" }}>
      {/* Back navigation */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/agent/dashboard" style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>
          ← Back to Dashboard
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Booking {booking.pnr ?? booking.id.slice(0, 8)}
        </h1>
        <span style={{ fontSize: 13, fontWeight: 600, color: statusColor, background: statusBg, padding: "4px 12px", borderRadius: 6 }}>
          {booking.status}
        </span>
      </div>

      {/* Booking Details Card */}
      <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", padding: "24px 28px", marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 20px", color: "#374151" }}>Booking Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
          <DetailRow name="Traveler">{booking.traveler_name}</DetailRow>
          <DetailRow name="PNR">{booking.pnr ?? "Not yet assigned"}</DetailRow>
          <DetailRow name="Carrier">{booking.carrier}</DetailRow>
          <DetailRow name="Route">{booking.route}</DetailRow>
          <DetailRow name="Value">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: booking.currency }).format(booking.booking_value)}
          </DetailRow>
          <DetailRow name="Itinerary ID">
            {booking.itinerary_id ?? "—"}
          </DetailRow>
          <DetailRow name="Created">
            {new Date(booking.created_at).toLocaleString("en-US")}
          </DetailRow>
          {booking.reviewed_at && (
            <DetailRow name="Reviewed">
              {new Date(booking.reviewed_at).toLocaleString("en-US")}
            </DetailRow>
          )}
        </div>
        {booking.gds_response && (
          <div style={{ marginTop: 16 }}>
            <div style={label}>GDS Response</div>
            <pre style={{ fontSize: 13, background: "#f3f4f6", padding: "12px 16px", borderRadius: 6, overflow: "auto", margin: 0, color: "#374151" }}>
              {booking.gds_response}
            </pre>
          </div>
        )}
        {booking.agent_note && (
          <div style={{ marginTop: 16 }}>
            <div style={label}>Agent Note</div>
            <div style={{ ...value, color: "#374151", background: "#f9fafb", padding: "10px 14px", borderRadius: 6, fontSize: 14 }}>
              {booking.agent_note}
            </div>
          </div>
        )}
      </div>

      {/* Approval Gate — only shown when pending sign-off */}
      {isPending && (
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", padding: "24px 28px", border: "2px solid #fbbf24" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", color: "#374151" }}>
            Human-in-the-Loop Gate
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 20px" }}>
            This GDS PNR write requires agent sign-off before confirmation. Review the details above, then approve or reject below.
          </p>

          {/* Shared note textarea — used by both forms via JS-free hidden input pattern */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="agent_note_input" style={label}>Agent Note (optional)</label>
            <textarea
              id="agent_note_input"
              name="agent_note_input"
              rows={3}
              placeholder="Add a note for the record…"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {/* Approve form */}
            <form action={handleApprove} style={{ flex: 1 }}>
              <input type="hidden" name="id" value={booking.id} />
              <input type="hidden" name="agent_note" value="" />
              <button
                type="submit"
                style={{ width: "100%", padding: "12px 0", background: "#16a34a", color: "#fff", fontWeight: 600, fontSize: 15, border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                ✓ Approve Booking
              </button>
            </form>

            {/* Reject form */}
            <form action={handleReject} style={{ flex: 1 }}>
              <input type="hidden" name="id" value={booking.id} />
              <input type="hidden" name="agent_note" value="" />
              <button
                type="submit"
                style={{ width: "100%", padding: "12px 0", background: "#dc2626", color: "#fff", fontWeight: 600, fontSize: 15, border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                ✗ Reject Booking
              </button>
            </form>
          </div>
        </div>
      )}

      {!isPending && (
        <div style={{ background: "#f9fafb", borderRadius: 10, padding: "16px 20px", fontSize: 14, color: "#6b7280", textAlign: "center" }}>
          This booking has already been {booking.status}. No further action required.
        </div>
      )}
    </div>
  );
}
