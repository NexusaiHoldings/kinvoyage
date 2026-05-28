import { Pool } from "pg";

export type ItineraryStatus = "pending_review" | "approved" | "rejected";
export type BookingStatus = "pending_signoff" | "confirmed" | "rejected";
export type InvoiceStatus = "pending" | "approved" | "paid" | "overdue";
export type EscalationSeverity = "low" | "medium" | "high" | "critical";
export type EscalationStatus = "open" | "in_progress" | "resolved";

export interface ItineraryQueueItem { id: string; traveler_name: string; destination: string; travel_dates: string; total_value: number; currency: string; status: ItineraryStatus; ai_notes: string | null; created_at: string; }
export interface BookingQueueItem { id: string; pnr: string | null; traveler_name: string; itinerary_id: string | null; carrier: string; route: string; booking_value: number; currency: string; status: BookingStatus; gds_response: string | null; agent_note: string | null; created_at: string; reviewed_at: string | null; }
export interface SupplierInvoice { id: string; supplier_name: string; invoice_ref: string; amount: number; currency: string; status: InvoiceStatus; due_date: string; created_at: string; }
export interface EscalationItem { id: string; traveler_name: string; thread_id: string | null; reason: string; severity: EscalationSeverity; status: EscalationStatus; created_at: string; }
export interface AgentDashboardData { itineraryQueue: ItineraryQueueItem[]; bookingQueue: BookingQueueItem[]; supplierInvoices: SupplierInvoice[]; escalationInbox: EscalationItem[]; }

let _pool: Pool | null = null;
function getPool(): Pool { if (!_pool) { _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }); } return _pool; }

export async function getItineraryQueue(): Promise<ItineraryQueueItem[]> {
  const { rows } = await getPool().query<ItineraryQueueItem>(
    `SELECT id, traveler_name, destination, travel_dates,
            total_value, currency, status, ai_notes, created_at
     FROM travel_itineraries
     WHERE status = 'pending_review'
     ORDER BY created_at ASC
     LIMIT 50`,
  );
  return rows;
}
export async function getBookingQueue(): Promise<BookingQueueItem[]> {
  const { rows } = await getPool().query<BookingQueueItem>(
    `SELECT id, pnr, traveler_name, itinerary_id, carrier, route,
            booking_value, currency, status, gds_response, agent_note,
            created_at, reviewed_at
     FROM travel_bookings
     WHERE status = 'pending_signoff'
     ORDER BY created_at ASC
     LIMIT 50`,
  );
  return rows;
}
export async function getSupplierInvoices(): Promise<SupplierInvoice[]> {
  const { rows } = await getPool().query<SupplierInvoice>(
    `SELECT id, supplier_name, invoice_ref, amount, currency, status, due_date, created_at
     FROM travel_supplier_invoices
     WHERE status IN ('pending', 'overdue')
     ORDER BY due_date ASC
     LIMIT 50`,
  );
  return rows;
}
export async function getEscalationInbox(): Promise<EscalationItem[]> {
  const { rows } = await getPool().query<EscalationItem>(
    `SELECT id, traveler_name, thread_id, reason, severity, status, created_at
     FROM travel_escalations
     WHERE status IN ('open', 'in_progress')
     ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       created_at ASC
     LIMIT 50`,
  );
  return rows;
}
export async function getDashboardData(): Promise<AgentDashboardData> {
  const [itineraryQueue, bookingQueue, supplierInvoices, escalationInbox] =
    await Promise.all([
      getItineraryQueue(),
      getBookingQueue(),
      getSupplierInvoices(),
      getEscalationInbox(),
    ]);
  return { itineraryQueue, bookingQueue, supplierInvoices, escalationInbox };
}
export async function getBookingById(id: string): Promise<BookingQueueItem | null> {
  const { rows } = await getPool().query<BookingQueueItem>(
    `SELECT id, pnr, traveler_name, itinerary_id, carrier, route,
            booking_value, currency, status, gds_response, agent_note,
            created_at, reviewed_at
     FROM travel_bookings
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
export async function approveBooking(id: string, agentNote: string): Promise<void> {
  await getPool().query(
    `UPDATE travel_bookings
     SET status = 'confirmed', agent_note = $2, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending_signoff'`,
    [id, agentNote],
  );
}
export async function rejectBooking(id: string, agentNote: string): Promise<void> {
  await getPool().query(
    `UPDATE travel_bookings
     SET status = 'rejected', agent_note = $2, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending_signoff'`,
    [id, agentNote],
  );
}
export async function approveItinerary(id: string, agentNote: string): Promise<void> {
  await getPool().query(
    `UPDATE travel_itineraries
     SET status = 'approved', agent_note = $2, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending_review'`,
    [id, agentNote],
  );
}
export async function rejectItinerary(id: string, agentNote: string): Promise<void> {
  await getPool().query(
    `UPDATE travel_itineraries
     SET status = 'rejected', agent_note = $2, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending_review'`,
    [id, agentNote],
  );
}
