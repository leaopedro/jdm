import type { StoreProductListQuery, StoreProductSummary } from '@jdm/shared/store';
import { useCallback, useEffect, useState } from 'react';

import { listStoreProducts } from '~/api/store';

type UseStoreProductsResult = {
  items: StoreProductSummary[];
  nextCursor: string | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
};

export function useStoreProducts(
  query: Partial<StoreProductListQuery> = {},
): UseStoreProductsResult {
  const [items, setItems] = useState<StoreProductSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await listStoreProducts(query);
      setItems(response.items);
      setNextCursor(response.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, nextCursor, loading, error, refresh };
}
