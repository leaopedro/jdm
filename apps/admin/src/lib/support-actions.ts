'use server';
import { revalidatePath } from 'next/cache';

import { closeAdminSupportTicket } from './admin-api';

export async function closeSupportTicketAction(ticketId: string): Promise<void> {
  await closeAdminSupportTicket(ticketId);
  revalidatePath('/support');
  revalidatePath(`/support/${ticketId}`);
}
