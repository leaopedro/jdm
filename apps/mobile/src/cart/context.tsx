import type { Cart, CartItemInput, EvictedCartItem, CartStockWarning } from '@jdm/shared/cart';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';

import * as cartApi from '~/api/cart';
import { useAuth } from '~/auth/context';

type CartState = {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  adding: boolean;
  stockWarnings: CartStockWarning[];
  evictedItems: EvictedCartItem[];
};

type CartAction =
  | { type: 'FETCH_START' }
  | {
      type: 'FETCH_OK';
      cart: Cart | null;
      stockWarnings: CartStockWarning[];
      evictedItems: EvictedCartItem[];
    }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'MUTATE_START' }
  | { type: 'MUTATE_OK'; cart: Cart }
  | { type: 'MUTATE_ERROR'; error: string }
  | { type: 'CLEAR_OK' }
  | { type: 'RESET' };

const initialState: CartState = {
  cart: null,
  loading: false,
  error: null,
  adding: false,
  stockWarnings: [],
  evictedItems: [],
};

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_OK':
      return {
        ...state,
        loading: false,
        cart: action.cart,
        stockWarnings: action.stockWarnings,
        evictedItems: action.evictedItems,
      };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'MUTATE_START':
      return { ...state, adding: true, error: null };
    case 'MUTATE_OK':
      return { ...state, adding: false, cart: action.cart, stockWarnings: [], evictedItems: [] };
    case 'MUTATE_ERROR':
      return { ...state, adding: false, error: action.error };
    case 'CLEAR_OK':
      return { ...initialState };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

type CartContextValue = CartState & {
  itemCount: number;
  refresh: () => Promise<void>;
  addItem: (item: CartItemInput) => Promise<boolean>;
  removeItem: (itemId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchCart = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const res = await cartApi.getCart();
      dispatch({
        type: 'FETCH_OK',
        cart: res.cart,
        stockWarnings: res.stockWarnings,
        evictedItems: res.evictedItems,
      });
    } catch {
      dispatch({ type: 'FETCH_ERROR', error: 'load' });
    }
  }, []);

  useEffect(() => {
    if (auth.status === 'authenticated') {
      void fetchCart();
    } else {
      dispatch({ type: 'RESET' });
    }
  }, [auth.status, fetchCart]);

  const addItem = useCallback(async (item: CartItemInput): Promise<boolean> => {
    dispatch({ type: 'MUTATE_START' });
    try {
      const res = await cartApi.upsertCartItem(item);
      dispatch({ type: 'MUTATE_OK', cart: res.cart });
      return true;
    } catch {
      dispatch({ type: 'MUTATE_ERROR', error: 'add' });
      return false;
    }
  }, []);

  const removeItem = useCallback(
    async (itemId: string): Promise<boolean> => {
      dispatch({ type: 'MUTATE_START' });
      try {
        await cartApi.removeCartItem(itemId);
        await fetchCart();
        return true;
      } catch {
        dispatch({ type: 'MUTATE_ERROR', error: 'remove' });
        return false;
      }
    },
    [fetchCart],
  );

  const clear = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'MUTATE_START' });
    try {
      await cartApi.clearCart();
      dispatch({ type: 'CLEAR_OK' });
      return true;
    } catch {
      dispatch({ type: 'MUTATE_ERROR', error: 'clear' });
      return false;
    }
  }, []);

  const itemCount = useMemo(() => {
    if (!state.cart) return 0;
    return state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
  }, [state.cart]);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      itemCount,
      refresh: fetchCart,
      addItem,
      removeItem,
      clear,
    }),
    [state, itemCount, fetchCart, addItem, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
