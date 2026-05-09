import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  STORE_BUILD_ENABLED,
  canAccessStoreRoutes,
  isStoreAvailable,
  isStoreDisabledError,
} from './runtime';

import { listStoreProductTypes } from '~/api/store';

type StoreRuntimeContextValue = {
  canAccessStore: boolean;
  runtimeStoreEnabled: boolean | null;
  refresh: () => Promise<void>;
};

const StoreRuntimeContext = createContext<StoreRuntimeContextValue | null>(null);

export function StoreRuntimeProvider({ children }: { children: ReactNode }) {
  const [runtimeStoreEnabled, setRuntimeStoreEnabled] = useState<boolean | null>(
    STORE_BUILD_ENABLED ? null : false,
  );

  const refresh = useCallback(async () => {
    if (!STORE_BUILD_ENABLED) {
      setRuntimeStoreEnabled(false);
      return;
    }

    try {
      await listStoreProductTypes();
      setRuntimeStoreEnabled(true);
    } catch (error: unknown) {
      if (isStoreDisabledError(error)) {
        setRuntimeStoreEnabled(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<StoreRuntimeContextValue>(
    () => ({
      canAccessStore: canAccessStoreRoutes(runtimeStoreEnabled),
      runtimeStoreEnabled,
      refresh,
    }),
    [refresh, runtimeStoreEnabled],
  );

  return <StoreRuntimeContext.Provider value={value}>{children}</StoreRuntimeContext.Provider>;
}

export function useStoreRuntime(): StoreRuntimeContextValue {
  const value = useContext(StoreRuntimeContext);
  if (!value) {
    throw new Error('useStoreRuntime must be used within StoreRuntimeProvider');
  }
  return value;
}

export function useStoreAvailability(): boolean {
  const { runtimeStoreEnabled } = useStoreRuntime();
  return isStoreAvailable(runtimeStoreEnabled);
}
