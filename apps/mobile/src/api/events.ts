import {
  type EventDetail,
  eventDetailSchema,
  type EventListQuery,
  type EventListResponse,
  eventListResponseSchema,
} from '@jdm/shared/events';

import { request } from './client';

const buildQueryString = (q: Partial<EventListQuery>): string => {
  const params = new URLSearchParams();
  if (q.window) params.set('window', q.window);
  if (q.type) params.set('type', q.type);
  if (q.stateCode) params.set('stateCode', q.stateCode);
  if (q.city) params.set('city', q.city);
  if (q.cursor) params.set('cursor', q.cursor);
  if (q.limit) params.set('limit', String(q.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
};

export const listEvents = (q: Partial<EventListQuery> = {}): Promise<EventListResponse> =>
  request(`/events${buildQueryString(q)}`, eventListResponseSchema);

export const getEvent = (slug: string): Promise<EventDetail> =>
  request(`/events/${encodeURIComponent(slug)}`, eventDetailSchema);
