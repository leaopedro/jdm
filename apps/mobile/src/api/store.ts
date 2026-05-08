import {
  storeCollectionListResponseSchema,
  storeProductDetailResponseSchema,
  storeProductListQuerySchema,
  storeProductListResponseSchema,
  storeProductTypeListResponseSchema,
  type StoreCollectionListResponse,
  type StoreProductDetailResponse,
  type StoreProductListQuery,
  type StoreProductListResponse,
  type StoreProductTypeListResponse,
} from '@jdm/shared/store';

import { request } from './client';

const buildQueryString = (query: Partial<StoreProductListQuery>): string => {
  const parsed = storeProductListQuerySchema.partial().parse(query);
  const params = new URLSearchParams();

  if (parsed.q) params.set('q', parsed.q);
  if (parsed.collectionSlug) params.set('collectionSlug', parsed.collectionSlug);
  if (parsed.productTypeSlug) params.set('productTypeSlug', parsed.productTypeSlug);
  if (parsed.inStock !== undefined) params.set('inStock', String(parsed.inStock));
  if (parsed.sort) params.set('sort', parsed.sort);
  if (parsed.cursor) params.set('cursor', parsed.cursor);
  if (parsed.limit !== undefined) params.set('limit', String(parsed.limit));

  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const listStoreProductTypes = (): Promise<StoreProductTypeListResponse> =>
  request('/store/product-types', storeProductTypeListResponseSchema);

export const listStoreCollections = (): Promise<StoreCollectionListResponse> =>
  request('/store/collections', storeCollectionListResponseSchema);

export const listStoreProducts = (
  query: Partial<StoreProductListQuery> = {},
): Promise<StoreProductListResponse> =>
  request(`/store/products${buildQueryString(query)}`, storeProductListResponseSchema);

export const getStoreProduct = (slug: string): Promise<StoreProductDetailResponse> =>
  request(`/store/products/${encodeURIComponent(slug)}`, storeProductDetailResponseSchema);
