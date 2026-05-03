import {
  adminEventDetailSchema,
  adminEventListResponseSchema,
  adminExtraSchema,
  adminGrantTicketResponseSchema,
  adminUserDetailSchema,
  adminUserSearchResponseSchema,
  type AdminEventCreate,
  type AdminEventUpdate,
  type AdminExtraCreate,
  type AdminExtraUpdate,
  type AdminGrantTicket,
  type AdminTierCreate,
  type AdminTierUpdate,
  adminTicketTierSchema,
} from '@jdm/shared/admin';
import {
  checkInEventsResponseSchema,
  extraClaimRequestSchema,
  extraClaimResponseSchema,
  ticketCheckInRequestSchema,
  ticketCheckInResponseSchema,
  type ExtraClaimRequest,
  type ExtraClaimResponse,
  type TicketCheckInRequest,
  type TicketCheckInResponse,
} from '@jdm/shared/check-in';
import { z } from 'zod';

import { apiFetch } from './api';

export const listAdminEvents = () =>
  apiFetch('/admin/events', { schema: adminEventListResponseSchema });

export const getAdminEvent = (id: string) =>
  apiFetch(`/admin/events/${id}`, { schema: adminEventDetailSchema });

export const createAdminEvent = (input: AdminEventCreate) =>
  apiFetch('/admin/events', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminEventDetailSchema,
  });

export const updateAdminEvent = (id: string, input: AdminEventUpdate) =>
  apiFetch(`/admin/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminEventDetailSchema,
  });

export const publishAdminEvent = (id: string) =>
  apiFetch(`/admin/events/${id}/publish`, {
    method: 'POST',
    schema: adminEventDetailSchema,
  });

export const cancelAdminEvent = (id: string) =>
  apiFetch(`/admin/events/${id}/cancel`, {
    method: 'POST',
    schema: adminEventDetailSchema,
  });

export const createTier = (eventId: string, input: AdminTierCreate) =>
  apiFetch(`/admin/events/${eventId}/tiers`, {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminTicketTierSchema,
  });

export const updateTier = (eventId: string, tierId: string, input: AdminTierUpdate) =>
  apiFetch(`/admin/events/${eventId}/tiers/${tierId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminTicketTierSchema,
  });

export const deleteTier = (eventId: string, tierId: string) =>
  apiFetch(`/admin/events/${eventId}/tiers/${tierId}`, {
    method: 'DELETE',
    schema: adminTicketTierSchema, // returns 204; apiFetch returns undefined
  });

export const listExtras = (eventId: string) =>
  apiFetch(`/admin/events/${eventId}/extras`, {
    schema: z.object({ items: z.array(adminExtraSchema) }),
  });

export const createExtra = (eventId: string, input: AdminExtraCreate) =>
  apiFetch(`/admin/events/${eventId}/extras`, {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminExtraSchema,
  });

export const updateExtra = (extraId: string, input: AdminExtraUpdate) =>
  apiFetch(`/admin/extras/${extraId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminExtraSchema,
  });

export const deleteExtra = (extraId: string) =>
  apiFetch(`/admin/extras/${extraId}`, {
    method: 'DELETE',
    schema: adminExtraSchema,
  });

export const listCheckInEvents = () =>
  apiFetch('/admin/check-in/events', { schema: checkInEventsResponseSchema });

export const checkInTicket = (input: TicketCheckInRequest): Promise<TicketCheckInResponse> =>
  apiFetch('/admin/tickets/check-in', {
    method: 'POST',
    body: JSON.stringify(ticketCheckInRequestSchema.parse(input)),
    schema: ticketCheckInResponseSchema,
  });

export const claimExtraItem = (input: ExtraClaimRequest): Promise<ExtraClaimResponse> =>
  apiFetch('/admin/extras/claim', {
    method: 'POST',
    body: JSON.stringify(extraClaimRequestSchema.parse(input)),
    schema: extraClaimResponseSchema,
  });

// ── Admin users ────────────────────────────────────────────────────

export const searchAdminUsers = (params?: { q?: string; cursor?: string; limit?: number }) => {
  const sp = new URLSearchParams();
  if (params?.q) sp.set('q', params.q);
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return apiFetch(`/admin/users${qs ? `?${qs}` : ''}`, {
    schema: adminUserSearchResponseSchema,
  });
};

export const getAdminUser = (id: string) =>
  apiFetch(`/admin/users/${id}`, { schema: adminUserDetailSchema });

export const grantTicket = (input: AdminGrantTicket) =>
  apiFetch('/admin/tickets/grant', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminGrantTicketResponseSchema,
  });
