/**
 * Auth Context — real server sessions.
 * The browser keeps only an opaque session token; the user's role and purok always come from the server.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { api, setStoredToken, getStoredToken, AUTH_EXPIRED_EVENT, type RegisterStarted } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: Parameters<typeof api.register>[0]) => Promise<RegisterStarted>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      if (!getStoredToken()) {
        setUserState(null);
        return;
      }
      setUserState(await api.getMe());
    } catch {
      setStoredToken(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    // The API client fires this when the server rejects the session (expired, deactivated, password changed).
    const onExpired = () => setUserState(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [refreshUser]);

  const login = async (identifier: string, password: string) => {
    const res = await api.login(identifier, password);
    setStoredToken(res.token);
    setUserState(res.user);
  };

  const register = async (payload: Parameters<typeof api.register>[0]) => {
    return api.register(payload);
  };

  const logout = async () => {
    try {
      if (getStoredToken()) await api.logout();
    } catch {
      /* the session is cleared locally either way */
    }
    setStoredToken(null);
    setUserState(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser, setUser: setUserState }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
