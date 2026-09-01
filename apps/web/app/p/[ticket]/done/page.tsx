import { redirect } from 'next/navigation';

import type { TicketDetail } from '@/lib/types';
import { DoneView } from './done-view';

async function fetchTicket(id: string): Promise<TicketDetail | null> {
  const base = process.env.INTERNAL_API_URL || 'http://api:8000';
  try {
    const res = await fetch(`${base}/api/tickets/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as TicketDetail;
  } catch {
    return null;
  }
}

export default async function DonePage({
  params,
}: {
  params: { ticket: string };
}) {
  const ticket = await fetchTicket(params.ticket);
  if (!ticket) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card-padded max-w-md text-center">
          <h1 className="font-display text-xl font-bold">Visit not found</h1>
        </div>
      </main>
    );
  }
  // If the doctor hasn't marked complete yet, send the patient back to the
  // queue view rather than letting them rate a not-yet-finished visit.
  if (ticket.status !== 'done') {
    redirect(`/p/${ticket.id}`);
  }
  return <DoneView ticket={ticket} />;
}
