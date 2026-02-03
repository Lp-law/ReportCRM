import type { PersonalSnippet } from '../types';

const PERSONAL_SNIPPETS_NAMESPACE = 'personal_snippets';

export const PERSONAL_SNIPPETS_KEY = (userId: string) =>
  `${PERSONAL_SNIPPETS_NAMESPACE}:${userId}`;

const safeParseSnippets = (raw: string | null, userId: string): PersonalSnippet[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = new Date().toISOString();
    return (parsed as any[]).map((rawSnip, index) => {
      const s = rawSnip || {};
      const id =
        typeof s.id === 'string' && s.id
          ? s.id
          : `ps-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
      const title =
        typeof s.title === 'string' && s.title.trim()
          ? s.title
          : 'Untitled snippet';
      const body =
        typeof s.body === 'string'
          ? s.body
          : '';
      const createdAt =
        typeof s.createdAt === 'string' && s.createdAt
          ? s.createdAt
          : now;
      const updatedAt =
        typeof s.updatedAt === 'string' && s.updatedAt
          ? s.updatedAt
          : createdAt;
      const createdByUserId =
        typeof s.createdByUserId === 'string' && s.createdByUserId
          ? s.createdByUserId
          : userId;
      const usageCount =
        typeof s.usageCount === 'number' && Number.isFinite(s.usageCount) && s.usageCount >= 0
          ? s.usageCount
          : 0;
      const lastUsedAt =
        typeof s.lastUsedAt === 'string' && s.lastUsedAt.trim()
          ? s.lastUsedAt
          : null;
      const sectionKey =
        typeof s.sectionKey === 'string' && s.sectionKey
          ? s.sectionKey
          : undefined;
      const tags =
        Array.isArray(s.tags)
          ? s.tags
              .filter((t: unknown) => typeof t === 'string' && t.trim())
              .map((t: string) => t.trim())
          : undefined;

      const sanitized: PersonalSnippet = {
        id,
        title,
        body,
        sectionKey,
        tags,
        createdByUserId,
        createdAt,
        updatedAt,
        usageCount,
        lastUsedAt,
      };

      return sanitized;
    });
  } catch {
    return [];
  }
};

export const loadPersonalSnippets = (userId: string): PersonalSnippet[] => {
  if (typeof window === 'undefined') return [];
  if (!userId) return [];
  const raw = window.localStorage.getItem(PERSONAL_SNIPPETS_KEY(userId));
  return safeParseSnippets(raw, userId);
};

export const savePersonalSnippets = (userId: string, snippets: PersonalSnippet[]): void => {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  try {
    window.localStorage.setItem(PERSONAL_SNIPPETS_KEY(userId), JSON.stringify(snippets));
  } catch {
    // Ignore quota / serialization errors – personal snippets are non‑critical.
  }
};

type PersonalSnippetUpsertInput = {
  id?: string;
  title: string;
  body: string;
  sectionKey?: string;
  tags?: string[];
};

export const upsertPersonalSnippet = (
  userId: string,
  input: PersonalSnippetUpsertInput,
): PersonalSnippet[] => {
  const now = new Date().toISOString();
  const existing = loadPersonalSnippets(userId);

  let next: PersonalSnippet[];

  if (input.id) {
    next = existing.map((snip) =>
      snip.id === input.id
        ? {
            ...snip,
            title: input.title,
            body: input.body,
            sectionKey: input.sectionKey,
            tags: input.tags,
            updatedAt: now,
          }
        : snip,
    );
  } else {
    const id = `ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newSnippet: PersonalSnippet = {
      id,
      title: input.title,
      body: input.body,
      sectionKey: input.sectionKey,
      tags: input.tags,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      lastUsedAt: null,
    };
    next = [...existing, newSnippet];
  }

  savePersonalSnippets(userId, next);
  return next;
};

export const deletePersonalSnippet = (userId: string, id: string): PersonalSnippet[] => {
  const existing = loadPersonalSnippets(userId);
  const next = existing.filter((snip) => snip.id !== id);
  savePersonalSnippets(userId, next);
  return next;
};

export const recordPersonalSnippetUsage = (
  userId: string,
  id: string,
): PersonalSnippet[] => {
  const existing = loadPersonalSnippets(userId);
  const now = new Date().toISOString();
  const next = existing.map((snip) =>
    snip.id === id
      ? {
          ...snip,
          usageCount: (snip.usageCount || 0) + 1,
          lastUsedAt: now,
        }
      : snip,
  );
  savePersonalSnippets(userId, next);
  return next;
};


