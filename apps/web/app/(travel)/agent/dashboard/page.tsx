import type { JSX } from "react";
import Link from "next/link";
import {
  getDashboardData,
  type ItineraryQueueItem,
  type BookingQueueItem,
  type SupplierInvoice,
  type EscalationItem,
} from "@/lib/travel/agent-queue";

export const metadata = { title: "Agent Operations Dashboard" };

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#6b7280",
};

function fmt(val: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
}

function ItineraryRow({ item }: { item: ItineraryQueueItem }): JSX.Element {
  return (
    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <td style={td}>{item.traveler_name}</td>
      <td style={td}>{item.destination}</td>
      <td style={td}>{item.travel_dates}</td>
      <td style={{ ...td, textAlign: "right" }}>{fmt(item.total_value, item.currency)}</td>
      <td style={td}>
        <span style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>
          Pending review
        </span>
      </td>
      <td style={td}>{item.ai_notes ?? "—"}</td>
    </tr>
  );
}

function BookingRow({ item }: { item: BookingQueueItem }): JSX.Element {
  return (
    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <td style={td}>
        <Link href={`/agent/bookings/${item.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
          {item.pnr ?? item.id.slice(0, 8)}
        </Link>
      </td>
      <td style={td}>{item.traveler_name}</td>
      <td style={td}>{item.carrier}</td>
      <td style={td}>{item.route}</td>
      <td style={{ ...td, textAlign: "right" }}>{fmt(item.booking_value, item.currency)}</td>
      <td style={td}>
        <span style={{ fontSize: 12, color: "#1e40af", background: "#dbeafe", padding: "2px 8px", borderRadius: 4 }}>
          Awaiting sign-off
        </span>
      </td>
    </tr>
  );
}

function InvoiceRow({ item }: { item: SupplierInvoice }): JSX.Element {
  const isOverdue = item.status === "overdue";
  return (
    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <td style={td}>{item.supplier_name}</td>
      <td style={td}>{item.invoice_ref}</td>
      <td style={{ ...td, textAlign: "right" }}>{fmt(item.amount, item.currency)}</td>
      <td style={td}>
        <span style={{ fontSize: 12, color: isOverdue ? "#dc2626" : "#92400e", background: isOverdue ? "#fee2e2" : "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>
          {item.status}
        </span>
      </td>
      <td style={td}>{new Date(item.due_date).toLocaleDateString("en-US")}</td>
    </tr>
  );
}

function EscalationRow({ item }: { item: EscalationItem }): JSX.Element {
  const color = SEVERITY_COLOR[item.severity] ?? "#6b7280";
  return (
    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <td style={td}>{item.traveler_name}</td>
      <td style={td}>{item.reason}</td>
      <td style={td}>
        <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}18`, padding: "2px 8px", borderRadius: 4 }}>
          {item.severity}
        </span>
      </td>
      <td style={td}>
        <span style={{ fontSize: 12, color: "#374151" }}>{item.status}</span>
      </td>
      <td style={td}>{new Date(item.created_at).toLocaleString("en-US")}</td>
    </tr>
  );
}

const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14, color: "#374151", verticalAlign: "middle" };
const th: React.CSSProperties = { padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", textAlign: "left", borderBottom: "2px solid rgba(0,0,0,0.08)", background: "#f9fafb" };
const section: React.CSSProperties = { marginBottom: 40 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 12 };
const badge: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", marginLeft: 8, borderRadius: 11, background: "#e5e7eb", fontSize: 12, fontWeight: 600, color: "#374151" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const emptyRow = (cols: number, msg: string) => (
  <tr><td colSpan={cols} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "24px 12px" }}>{msg}</td></tr>
);

export default async function AgentDashboardPage(): Promise<JSX.Element> {
  let data = { itineraryQueue: [] as ItineraryQueueItem[], bookingQueue: [] as BookingQueueItem[], supplierInvoices: [] as SupplierInvoice[], escalationInbox: [] as EscalationItem[] };
  try {
    data = await getDashboardData();
  } catch {
    // DB unavailable — render empty state so the page still loads
  }

  const { itineraryQueue, bookingQueue, supplierInvoices, escalationInbox } = data;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "32px 24px", color: "#111827" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Agent Operations Dashboard</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 6 }}>
          Human-in-the-loop review queues · liability-critical decisions require agent sign-off
        </p>
      </div>

      {/* Itinerary Review Queue */}
      <div style={section}>
        <h2 style={sectionTitle}>
          Itinerary Review Queue
          <span style={badge}>{itineraryQueue.length}</span>
        </h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Traveler</th>
              <th style={th}>Destination</th>
              <th style={th}>Travel Dates</th>
              <th style={{ ...th, textAlign: "right" }}>Value</th>
              <th style={th}>Status</th>
              <th style={th}>AI Notes</th>
            </tr>
          </thead>
          <tbody>
            {itineraryQueue.length === 0
              ? emptyRow(6, "No itineraries awaiting review")
              : itineraryQueue.map((it) => <ItineraryRow key={it.id} item={it} />)}
          </tbody>
        </table>
      </div>

      {/* Booking Confirmation Queue */}
      <div style={section}>
        <h2 style={sectionTitle}>
          Booking Confirmation Queue
          <span style={badge}>{bookingQueue.length}</span>
        </h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>PNR / ID</th>
              <th style={th}>Traveler</th>
              <th style={th}>Carrier</th>
              <th style={th}>Route</th>
              <th style={{ ...th, textAlign: "right" }}>Value</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookingQueue.length === 0
              ? emptyRow(6, "No bookings awaiting sign-off")
              : bookingQueue.map((bk) => <BookingRow key={bk.id} item={bk} />)}
          </tbody>
        </table>
      </div>

      {/* Supplier Invoicing Status */}
      <div style={section}>
        <h2 style={sectionTitle}>
          Supplier Invoicing
          <span style={badge}>{supplierInvoices.length}</span>
        </h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Supplier</th>
              <th style={th}>Invoice Ref</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
              <th style={th}>Status</th>
              <th style={th}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {supplierInvoices.length === 0
              ? emptyRow(5, "No invoices pending")
              : supplierInvoices.map((inv) => <InvoiceRow key={inv.id} item={inv} />)}
          </tbody>
        </table>
      </div>

      {/* Human Escalation Inbox */}
      <div style={section}>
        <h2 style={sectionTitle}>
          Escalation Inbox
          <span style={{ ...badge, background: escalationInbox.length > 0 ? "#fee2e2" : "#e5e7eb", color: escalationInbox.length > 0 ? "#dc2626" : "#374151" }}>
            {escalationInbox.length}
          </span>
        </h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Traveler</th>
              <th style={th}>Reason</th>
              <th style={th}>Severity</th>
              <th style={th}>Status</th>
              <th style={th}>Raised At</th>
            </tr>
          </thead>
          <tbody>
            {escalationInbox.length === 0
              ? emptyRow(5, "No open escalations")
              : escalationInbox.map((esc) => <EscalationRow key={esc.id} item={esc} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
