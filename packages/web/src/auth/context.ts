import { createContext, useContext } from 'react';
import type { User } from '../api.js';

export interface Auth {
  user: User;
  setUser(user: User): void;
  signOut(): Promise<void>;
  // Opens the sign-in dialog over the current page.
  openSignIn(): void;
}

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth outside the signed-in app');
  return auth;
}
