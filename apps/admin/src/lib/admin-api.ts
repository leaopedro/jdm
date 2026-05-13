import {
  adminEventDetailSchema,
  adminEventListResponseSchema,
  adminExtraSchema,
  adminProductTypeListResponseSchema,
  adminProductTypeSchema,
  adminFinanceByEventResponseSchema,
  adminFinanceByProductResponseSchema,
  adminFinancePaymentMixResponseSchema,
  adminFinanceSummarySchema,
  adminFinanceTrendResponseSchema,
  adminGrantTicketResponseSchema,
  adminStoreCollectionDetailSchema,
  adminStoreCollectionListResponseSchema,
  adminStoreCollectionSchema,
  adminStoreInventoryListResponseSchema,
  adminStoreOrderDetailSchema,
  adminStoreOrderListResponseSchema,
  adminStoreProductDetailSchema,
  adminStoreProductListResponseSchema,
  adminStoreProductLookupResponseSchema,
  adminStoreProductPhotoSchema,
  adminStoreVariantSchema,
  adminUserCreatedSchema,
  adminUserDetailSchema,
  adminUserSearchResponseSchema,
  adminUserStatusUpdatedSchema,
  type AdminCreateUserBody,
  type AdminEventCreate,
  type AdminEventUpdate,
  type AdminExtraCreate,
  type AdminExtraUpdate,
  type AdminProductTypeCreate,
  type AdminProductTypeUpdate,
  type AdminFinanceByEventResponse,
  type AdminFinancePaymentMixResponse,
  type AdminFinanceQuery,
  type AdminFinanceSummary,
  type AdminFinanceTrendResponse,
  type AdminGrantTicket,
  type AdminStoreCollectionCreate,
  type AdminStoreInventoryFilter,
  type AdminStoreInventoryListResponse,
  type AdminStoreOrderDetail,
  type AdminStoreOrderListResponse,
  type AdminStoreOrderQuery,
  type AdminStoreProductLookupResponse,
  type AdminStoreCollectionUpdate,
  type AdminStoreProductCreate,
  type AdminStoreProductPhotoCreate,
  type AdminStoreProductUpdate,
  type AdminStoreVariantCreate,
  type AdminStoreVariantUpdate,
  type AdminTierCreate,
  type AdminTierUpdate,
  adminTicketTierSchema,
} from '@jdm/shared/admin';
import {
  checkInEventsResponseSchema,
  extraClaimRequestSchema,
  extraClaimResponseSchema,
  pickupVoucherClaimRequestSchema,
  pickupVoucherClaimResponseSchema,
  ticketCheckInRequestSchema,
  ticketCheckInResponseSchema,
  type ExtraClaimRequest,
  type ExtraClaimResponse,
  type PickupVoucherClaimRequest,
  type PickupVoucherClaimResponse,
  type TicketCheckInRequest,
  type TicketCheckInResponse,
} from '@jdm/shared/check-in';
import { publicProfileSchema } from '@jdm/shared/profile';
import {
  storeSettingsSchema,
  type AdminStoreFulfillmentUpdate,
  type StoreSettings,
  type StoreSettingsUpdate,
} from '@jdm/shared/store';
import {
  adminSupportTicketDetailSchema,
  adminSupportTicketListResponseSchema,
  type AdminSupportTicketDetail,
  type AdminSupportTicketListResponse,
  type SupportTicketInternalStatus,
} from '@jdm/shared/support';
import { z } from 'zod';

import {
  broadcastDryRunResponseSchema,
  broadcastListResponseSchema,
  broadcastSummarySchema,
  createBroadcastRequestSchema,
  updateBroadcastRequestSchema,
  type BroadcastDryRunRequest,
  type BroadcastDryRunResponse,
  type BroadcastListResponse,
  type BroadcastSummary,
  type CreateBroadcastRequest,
  type UpdateBroadcastRequest,
} from '../../../../packages/shared/src/broadcasts';

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

export const unpublishAdminEvent = (id: string) =>
  apiFetch(`/admin/events/${id}/unpublish`, {
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

// ── Admin store: product types ─────────────────────────────────────

export const listAdminProductTypes = () =>
  apiFetch('/admin/store/product-types', {
    schema: adminProductTypeListResponseSchema,
  });

export const createAdminProductType = (input: AdminProductTypeCreate) =>
  apiFetch('/admin/store/product-types', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminProductTypeSchema,
  });

export const updateAdminProductType = (id: string, input: AdminProductTypeUpdate) =>
  apiFetch(`/admin/store/product-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminProductTypeSchema,
  });

export const deleteAdminProductType = (id: string) =>
  apiFetch(`/admin/store/product-types/${id}`, {
    method: 'DELETE',
    schema: adminProductTypeSchema, // 204
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

export const claimPickupVoucher = (
  input: PickupVoucherClaimRequest,
): Promise<PickupVoucherClaimResponse> =>
  apiFetch('/admin/store/pickup/voucher/claim', {
    method: 'POST',
    body: JSON.stringify(pickupVoucherClaimRequestSchema.parse(input)),
    schema: pickupVoucherClaimResponseSchema,
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

export const getFinanceByProduct = (q?: AdminFinanceQuery) =>
  apiFetch(`/admin/finance/by-product${financeQs(q)}`, {
    schema: adminFinanceByProductResponseSchema,
  });

export const getFinanceExportUrl = (q?: AdminFinanceQuery) =>
  `/admin/finance/export${financeQs(q)}`;

// ── Admin store collections ───────────────────────────────────────────

export const listAdminCollections = () =>
  apiFetch('/admin/store/collections', { schema: adminStoreCollectionListResponseSchema });

export const getAdminCollection = (id: string) =>
  apiFetch(`/admin/store/collections/${id}`, { schema: adminStoreCollectionDetailSchema });

export const createAdminCollection = (input: AdminStoreCollectionCreate) =>
  apiFetch('/admin/store/collections', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminStoreCollectionSchema,
  });

export const updateAdminCollection = (id: string, input: AdminStoreCollectionUpdate) =>
  apiFetch(`/admin/store/collections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminStoreCollectionSchema,
  });

export const deleteAdminCollection = (id: string) =>
  apiFetch(`/admin/store/collections/${id}`, {
    method: 'DELETE',
    schema: z.unknown(),
  });

export const reorderAdminCollections = (ids: string[]) =>
  apiFetch('/admin/store/collections/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
    schema: z.unknown(),
  });

export const setAdminCollectionProducts = (id: string, productIds: string[]) =>
  apiFetch(`/admin/store/collections/${id}/products`, {
    method: 'PUT',
    body: JSON.stringify({ productIds }),
    schema: adminStoreCollectionDetailSchema,
  });

export const lookupAdminStoreProducts = (): Promise<AdminStoreProductLookupResponse> =>
  apiFetch('/admin/store/products/lookup', { schema: adminStoreProductLookupResponseSchema });

export const getAdminStoreSettings = (): Promise<StoreSettings> =>
  apiFetch('/admin/store/settings', { schema: storeSettingsSchema });

export const updateAdminStoreSettings = (input: StoreSettingsUpdate): Promise<StoreSettings> =>
  apiFetch('/admin/store/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
    schema: storeSettingsSchema,
  });

// ── Admin broadcasts ───────────────────────────────────────────────

export const listAdminBroadcasts = (): Promise<BroadcastListResponse> =>
  apiFetch('/admin/broadcasts', {
    schema: broadcastListResponseSchema,
  });

export const getAdminBroadcast = (id: string): Promise<BroadcastSummary> =>
  apiFetch(`/admin/broadcasts/${id}`, {
    schema: broadcastSummarySchema,
  });

export const createAdminBroadcast = (input: CreateBroadcastRequest): Promise<BroadcastSummary> =>
  apiFetch('/admin/broadcasts', {
    method: 'POST',
    body: JSON.stringify(createBroadcastRequestSchema.parse(input)),
    schema: broadcastSummarySchema,
  });

export const updateAdminBroadcast = (
  id: string,
  input: UpdateBroadcastRequest,
): Promise<BroadcastSummary> =>
  apiFetch(`/admin/broadcasts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updateBroadcastRequestSchema.parse(input)),
    schema: broadcastSummarySchema,
  });

export const cancelAdminBroadcast = (id: string): Promise<BroadcastSummary> =>
  apiFetch(`/admin/broadcasts/${id}/cancel`, {
    method: 'POST',
    schema: broadcastSummarySchema,
  });

export const dryRunAdminBroadcast = (
  input: BroadcastDryRunRequest,
): Promise<BroadcastDryRunResponse> =>
  apiFetch('/admin/broadcasts/dry-run', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: broadcastDryRunResponseSchema,
  });
// ── Admin store: products / variants / photos ────────────────────────

export const listAdminStoreProducts = () =>
  apiFetch('/admin/store/products', { schema: adminStoreProductListResponseSchema });

export const getAdminStoreProduct = (id: string) =>
  apiFetch(`/admin/store/products/${id}`, { schema: adminStoreProductDetailSchema });

export const createAdminStoreProduct = (input: AdminStoreProductCreate) =>
  apiFetch('/admin/store/products', {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminStoreProductDetailSchema,
  });

export const updateAdminStoreProduct = (id: string, input: AdminStoreProductUpdate) =>
  apiFetch(`/admin/store/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminStoreProductDetailSchema,
  });

export const createAdminStoreVariant = (productId: string, input: AdminStoreVariantCreate) =>
  apiFetch(`/admin/store/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminStoreVariantSchema,
  });

export const updateAdminStoreVariant = (variantId: string, input: AdminStoreVariantUpdate) =>
  apiFetch(`/admin/store/variants/${variantId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminStoreVariantSchema,
  });

export const deleteAdminStoreVariant = (variantId: string) =>
  apiFetch(`/admin/store/variants/${variantId}`, {
    method: 'DELETE',
    schema: adminStoreVariantSchema, // 200 on soft-disable, 204 on hard-delete
  });

export const createAdminStoreProductPhoto = (
  productId: string,
  input: AdminStoreProductPhotoCreate,
) =>
  apiFetch(`/admin/store/products/${productId}/photos`, {
    method: 'POST',
    body: JSON.stringify(input),
    schema: adminStoreProductPhotoSchema,
  });

export const deleteAdminStoreProductPhoto = (productId: string, photoId: string) =>
  apiFetch(`/admin/store/products/${productId}/photos/${photoId}`, {
    method: 'DELETE',
    schema: adminStoreProductPhotoSchema,
  });

export const listAdminStoreInventory = (
  filter: AdminStoreInventoryFilter = 'all',
): Promise<AdminStoreInventoryListResponse> => {
  const qs = filter === 'all' ? '' : `?status=${filter}`;
  return apiFetch(`/admin/store/inventory${qs}`, {
    schema: adminStoreInventoryListResponseSchema,
  });
};

export const listAdminStoreOrders = (
  query: AdminStoreOrderQuery = {},
): Promise<AdminStoreOrderListResponse> => {
  const params = new URLSearchParams();
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.kind && query.kind !== 'all') params.set('kind', query.kind);
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return apiFetch(`/admin/store/orders${qs ? `?${qs}` : ''}`, {
    schema: adminStoreOrderListResponseSchema,
  });
};

export const getAdminStoreOrder = (id: string): Promise<AdminStoreOrderDetail> =>
  apiFetch(`/admin/store/orders/${id}`, { schema: adminStoreOrderDetailSchema });

export const updateAdminStoreOrderFulfillment = (
  id: string,
  input: AdminStoreFulfillmentUpdate,
): Promise<AdminStoreOrderDetail> =>
  apiFetch(`/admin/store/orders/${id}/fulfillment`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    schema: adminStoreOrderDetailSchema,
  });

// ── Admin support tickets ─────────────────────────────────────────

export const listAdminSupportTickets = (opts?: {
  status?: 'open' | 'closed';
  cursor?: string;
}): Promise<AdminSupportTicketListResponse> => {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const qs = params.toString();
  return apiFetch(`/admin/support${qs ? '?' + qs : ''}`, {
    schema: adminSupportTicketListResponseSchema,
  });
};

export const getAdminSupportTicket = (id: string): Promise<AdminSupportTicketDetail> =>
  apiFetch(`/admin/support/${id}`, { schema: adminSupportTicketDetailSchema });

export const closeAdminSupportTicket = (id: string): Promise<AdminSupportTicketDetail> =>
  apiFetch(`/admin/support/${id}/close`, {
    method: 'PATCH',
    schema: adminSupportTicketDetailSchema,
  });

export const updateAdminSupportTicketInternalStatus = (
  id: string,
  internalStatus: SupportTicketInternalStatus,
): Promise<AdminSupportTicketDetail> =>
  apiFetch(`/admin/support/${id}/internal-status`, {
    method: 'PATCH',
    body: JSON.stringify({ internalStatus }),
    schema: adminSupportTicketDetailSchema,
  });
