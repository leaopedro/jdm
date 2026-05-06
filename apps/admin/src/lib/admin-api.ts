import {
  adminEventDetailSchema,
  adminEventListResponseSchema,
  adminExtraSchema,
  adminFinanceByEventResponseSchema,
  adminFinancePaymentMixResponseSchema,
  adminFinanceSummarySchema,
  adminFinanceTrendResponseSchema,
  adminGrantTicketResponseSchema,
  adminUserCreatedSchema,
  adminUserDetailSchema,
  adminUserSearchResponseSchema,
  adminUserStatusUpdatedSchema,
  type AdminCreateUserBody,
  type AdminEventCreate,
  type AdminEventUpdate,
  type AdminExtraCreate,
  type AdminExtraUpdate,
  type AdminFinanceByEventResponse,
  type AdminFinancePaymentMixResponse,
  type AdminFinanceQuery,
  type AdminFinanceSummary,
  type AdminFinanceTrendResponse,
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
import { publicProfileSchema } from '@jdm/shared/profile';
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

export const createAdminUser = (input: AdminCreateUserBody) =>
  apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminUserCreatedSchema,
  });

export const disableAdminUser = (id: string) =>
  apiFetch(`/admin/users/${id}/disable`, {
    method: 'POST',
    schema: adminUserStatusUpdatedSchema,
  });

export const enableAdminUser = (id: string) =>
  apiFetch(`/admin/users/${id}/enable`, {
    method: 'POST',
    schema: adminUserStatusUpdatedSchema,
  });

export const getMe = () => apiFetch('/me', { schema: publicProfileSchema });

export const grantTicket = (input: AdminGrantTicket) =>
  apiFetch('/admin/tickets/grant', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminGrantTicketResponseSchema,
  });

// ── Admin finance ────────────────────────────────────────────────────

export const financeQs = (q?: AdminFinanceQuery) => {
  if (!q) return '';
  const sp = new URLSearchParams();
  if (q.from) sp.set('from', q.from);
  if (q.to) sp.set('to', q.to);
  if (q.eventIds) q.eventIds.forEach((id) => sp.append('eventIds', id));
  if (q.search) sp.set('search', q.search);
  if (q.city) sp.set('city', q.city);
  if (q.stateCode) sp.set('stateCode', q.stateCode);
  if (q.provider) sp.set('provider', q.provider);
  if (q.method) sp.set('method', q.method);
  if (q.statuses) q.statuses.forEach((s) => sp.append('statuses', s));
  const str = sp.toString();
  return str ? `?${str}` : '';
};

export const getFinanceSummary = (q?: AdminFinanceQuery): Promise<AdminFinanceSummary> =>
  apiFetch(`/admin/finance/summary${financeQs(q)}`, { schema: adminFinanceSummarySchema });

export const getFinanceByEvent = (q?: AdminFinanceQuery): Promise<AdminFinanceByEventResponse> =>
  apiFetch(`/admin/finance/by-event${financeQs(q)}`, {
    schema: adminFinanceByEventResponseSchema,
  });

export const getFinanceTrends = (q?: AdminFinanceQuery): Promise<AdminFinanceTrendResponse> =>
  apiFetch(`/admin/finance/trends${financeQs(q)}`, { schema: adminFinanceTrendResponseSchema });

export const getFinancePaymentMix = (
  q?: AdminFinanceQuery,
): Promise<AdminFinancePaymentMixResponse> =>
  apiFetch(`/admin/finance/payment-mix${financeQs(q)}`, {
    schema: adminFinancePaymentMixResponseSchema,
  });

export const getFinanceExportUrl = (q?: AdminFinanceQuery) =>
  `/admin/finance/export${financeQs(q)}`;
