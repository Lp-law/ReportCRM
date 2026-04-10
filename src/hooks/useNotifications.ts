import { useState, useEffect } from 'react';

const STORAGE_KEY = 'lp_notifications';

export interface NotificationEntry {
  id: string;
  message: string;
  createdAt: string;
  type?: string;
  reportId?: string;
  read?: boolean;
}

const loadNotifications = (): NotificationEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (n: NotificationEntry) =>
            n &&
            typeof n.id === 'string' &&
            typeof n.message === 'string' &&
            typeof n.createdAt === 'string',
        )
      : [];
  } catch {
    return [];
  }
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationEntry[]>(loadNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dailySummaryOptIn, setDailySummaryOptIn] = useState(false);

  // Persist notifications to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Failed to persist notifications', error);
    }
  }, [notifications]);

  const addNotification = (message: string, extra?: Partial<NotificationEntry>) => {
    const entry: NotificationEntry = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      createdAt: new Date().toISOString(),
      ...extra,
    };
    setNotifications((prev) => [entry, ...prev]);
    return entry;
  };

  const markRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const clearAll = () => setNotifications([]);

  return {
    notifications,
    setNotifications,
    showNotifications,
    setShowNotifications,
    dailySummaryOptIn,
    setDailySummaryOptIn,
    addNotification,
    markRead,
    clearAll,
  };
};
