import type { PublicUser } from '@jdm/shared/auth';
import type { LoginInput, SignupInput } from '@jdm/shared/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { clearTokens, loadTokens, saveTokens, type StoredTokens } from './storage';

import { loginRequest, logoutRequest, meAuthed, refreshRequest, signupRequest } from '~/api/auth';
import { registerTokenProvider } from '~/api/client';
import { usePushRegistration } from '~/notifications/use-push-registration';

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
  const tokensRef = useRef<StoredTokens | null>(null);

  const applySession = useCallback(async (tokens: StoredTokens, user: PublicUser) => {
    tokensRef.current = tokens;
    await saveTokens(tokens);
    setState({ status: 'authenticated', tokens, user });
  }, []);

  const signOut = useCallback(async () => {
    tokensRef.current = null;
    await clearTokens();
    setState({ status: 'unauthenticated', user: null, tokens: null });
  }, []);

  // Register provider once. Reads/writes go through tokensRef so the
  // closure never sees stale token state.
  useEffect(() => {
    registerTokenProvider({
      getAccessToken: () => tokensRef.current?.accessToken ?? null,
      refresh: async () => {
        const current = tokensRef.current;
        if (!current) throw new Error('no refresh token');
        const refreshed = await refreshRequest(current.refreshToken);
        await applySession(
          { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken },
          refreshed.user,
        );
        return refreshed.accessToken;
      },
      onSignOut: signOut,
    });
  }, [applySession, signOut]);

  useEffect(() => {
    const boot = async () => {
      const stored = await loadTokens();
      if (!stored) {
        setState({ status: 'unauthenticated', user: null, tokens: null });
        return;
      }
      tokensRef.current = stored;
      try {
        const user = await meAuthed();
        setState({
          status: 'authenticated',
          user,
          tokens: tokensRef.current ?? stored,
        });
      } catch {
        await signOut();
      }
    };
    void boot();
  }, [signOut]);

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
    const current = tokensRef.current;
    if (current) {
      try {
        await logoutRequest(current.refreshToken);
      } catch {
        // local clear proceeds regardless
      }
    }
    await signOut();
  }, [signOut]);

  const refreshUser: AuthContextValue['refreshUser'] = useCallback(async () => {
    if (!tokensRef.current) return;
    try {
      const user = await meAuthed();
      setState((prev) => ({ ...prev, user }));
    } catch {
      // authedRequest handles refresh + sign-out on failure
    }
  }, []);

  usePushRegistration({ isAuthenticated: state.status === 'authenticated' });

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
