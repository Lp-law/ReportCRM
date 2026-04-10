import { useState, useEffect } from 'react';
import type { ExpenseFavorite } from '../types';

export const useExpenses = () => {
  const [worksheetSessions, setWorksheetSessions] = useState<{ reportId: string }[]>([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [favoriteProviders, setFavoriteProviders] = useState<Record<string, ExpenseFavorite[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('favoriteProviders');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Persist favorites
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('favoriteProviders', JSON.stringify(favoriteProviders));
    } catch (error) {
      console.error('Failed to persist favorite providers', error);
    }
  }, [favoriteProviders]);

  const saveFavoriteProvider = (category: string, fav: ExpenseFavorite) => {
    setFavoriteProviders((prev) => {
      const list = prev[category] || [];
      const exists = list.some((f) => f.provider === fav.provider);
      if (exists) return prev;
      return { ...prev, [category]: [...list, fav] };
    });
  };

  const deleteFavoriteProvider = (category: string, provider: string) => {
    setFavoriteProviders((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((f) => f.provider !== provider),
    }));
  };

  return {
    worksheetSessions,
    setWorksheetSessions,
    activeWorksheetId,
    setActiveWorksheetId,
    favoriteProviders,
    setFavoriteProviders,
    saveFavoriteProvider,
    deleteFavoriteProvider,
  };
};
