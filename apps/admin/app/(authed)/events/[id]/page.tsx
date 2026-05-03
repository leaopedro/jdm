import { notFound } from 'next/navigation';

import { EventForm } from './event-form';
import { ExtrasList } from './extras-list';
import { TierList } from './tier-list';

import { StatusBadge } from '~/components/status-badge';
import { getAdminEvent, listExtras } from '~/lib/admin-api';
import { ApiError } from '~/lib/api';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let event;
  try {
    event = await getAdminEvent(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const { items: extras } = await listExtras(id);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-sm text-[color:var(--color-muted)]">{event.slug}</p>
        </div>
        <StatusBadge status={event.status} />
      </header>
      <EventForm event={event} />
      <TierList eventId={event.id} tiers={event.tiers} />
      <ExtrasList eventId={event.id} extras={extras} />
    </section>
  );
}
