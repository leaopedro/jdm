import type { PublicUser } from '@jdm/shared/auth';
import type { LoginInput, SignupInput } from '@jdm/shared/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearTokens, loadTokens, saveTokens, type StoredTokens } from './storage';

import { loginRequest, logoutRequest, meRequest, refreshRequest, signupRequest } from '~/api/auth';
import { registerTokenProvider } from '~/api/client';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

type AuthState = {
  status: AuthStatus;
  user: PublicUser | null;
  tokens: StoredTokens | null;
};

type AuthContextValue = AuthState & {
  signup: (input: SignupInput) => Promise<PublicUser>;
  login: (input: LoginInput) => Promise<PublicUser>;
  setSession: (tokens: StoredTokens, user: PublicUser) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, tokens: null });

  const applySession = useCallback(async (tokens: StoredTokens, user: PublicUser) => {
    await saveTokens(tokens);
    setState({ status: 'authenticated', tokens, user });
  }, []);

  useEffect(() => {
    const boot = async () => {
      const stored = await loadTokens();
      if (!stored) {
        setState({ status: 'unauthenticated', user: null, tokens: null });
        return;
      }
      try {
        const user = await meRequest(stored.accessToken);
        setState({ status: 'authenticated', user, tokens: stored });
      } catch {
        try {
          const refreshed = await refreshRequest(stored.refreshToken);
          await applySession(
            { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken },
            refreshed.user,
          );
        } catch {
          await clearTokens();
          setState({ status: 'unauthenticated', user: null, tokens: null });
        }
      }
    };
    void boot();
  }, [applySession]);

  const signup: AuthContextValue['signup'] = useCallback(
    async (input) => {
      const res = await signupRequest(input);
      await applySession(
        { accessToken: res.accessToken, refreshToken: res.refreshToken },
        res.user,
      );
      return res.user;
    },
    [applySession],
  );

  const login: AuthContextValue['login'] = useCallback(
    async (input) => {
      const res = await loginRequest(input);
      await applySession(
        { accessToken: res.accessToken, refreshToken: res.refreshToken },
        res.user,
      );
      return res.user;
    },
    [applySession],
  );

  const logout: AuthContextValue['logout'] = useCallback(async () => {
    const current = state.tokens;
    if (current) {
      try {
        await logoutRequest(current.refreshToken);
      } catch {
        // local clear proceeds regardless
      }
    }
    await clearTokens();
    setState({ status: 'unauthenticated', user: null, tokens: null });
  }, [state.tokens]);

  useEffect(() => {
    registerTokenProvider({
      getAccessToken: () => state.tokens?.accessToken ?? null,
      refresh: async () => {
        if (!state.tokens) throw new Error('no refresh token');
        const refreshed = await refreshRequest(state.tokens.refreshToken);
        await applySession(
          { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken },
          refreshed.user,
        );
        return refreshed.accessToken;
      },
      onSignOut: async () => {
        await clearTokens();
        setState({ status: 'unauthenticated', user: null, tokens: null });
      },
    });
  }, [state.tokens, applySession]);

  const refreshUser: AuthContextValue['refreshUser'] = useCallback(async () => {
    if (!state.tokens) return;
    try {
      const user = await meRequest(state.tokens.accessToken);
      setState((prev) => ({ ...prev, user }));
    } catch {
      // interceptor handles refresh; leave state alone
    }
  }, [state.tokens]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signup, login, setSession: applySession, logout, refreshUser }),
    [state, signup, login, applySession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth used outside AuthProvider');
  return ctx;
};
