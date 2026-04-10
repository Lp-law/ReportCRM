import { useState, useEffect } from 'react';
import type { User } from '../types';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authCheckDone, setAuthCheckDone] = useState(false);

  // Rehydrate auth from server session on load (cookie)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setCurrentUser(data.user);
      })
      .catch(() => { /* not authenticated */ })
      .finally(() => {
        if (!cancelled) setAuthCheckDone(true);
      });
    return () => { cancelled = true; };
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Login failed');
    }
    const data = await res.json();
    setCurrentUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setCurrentUser(null);
  };

  return {
    currentUser,
    setCurrentUser,
    authCheckDone,
    login,
    logout,
    isAdminUser: currentUser?.role === 'ADMIN',
    isHebrewUi: Boolean(currentUser),
  };
};
