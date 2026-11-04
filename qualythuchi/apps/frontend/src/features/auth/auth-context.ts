import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AuthStore } from './auth-store';

export const AuthContext = createContext<AuthStore | null>(null);

export function useAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error('AuthProvider is required.');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...state, login: store.login, loginWithProvider: store.loginWithProvider, logout: store.logout, refresh: store.refresh };
}
