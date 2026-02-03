import { dedupeCaseInsensitive, normalizeTopicKey, sanitizeTopicLabel } from './fileNameTopics';

const TOPIC_COMBOS_KEY = (userId?: string) =>
  `topicCombos:${userId || 'default'}`;

const INSURER_DEFAULT_TOPICS_KEY = (userId?: string) =>
  `insurerDefaultTopics:${userId || 'default'}`;

export type TopicCombo = string[];

type TopicComboStorage = TopicCombo[];

type InsurerDefaultsStorage = Record<string, string[]>;

const safeParseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

// ---- Recent topic combinations (MRU) ----

export const loadUserTopicCombos = (userId?: string): TopicComboStorage => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(TOPIC_COMBOS_KEY(userId));
  const parsed = safeParseJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  const combos = parsed
    .filter((c) => Array.isArray(c))
    .map((c) =>
      (c as string[])
        .map((t) => sanitizeTopicLabel(t))
        .filter(Boolean),
    )
    .filter((c) => c.length > 0);
  return combos;
};

export const saveUserTopicCombos = (
  userId: string | undefined,
  combos: TopicComboStorage,
): void => {
  if (typeof window === 'undefined') return;
  const cleaned = combos
    .map((combo) =>
      dedupeCaseInsensitive(combo.map((t) => sanitizeTopicLabel(t))).filter(
        Boolean,
      ),
    )
    .filter((combo) => combo.length > 0);
  try {
    window.localStorage.setItem(TOPIC_COMBOS_KEY(userId), JSON.stringify(cleaned));
  } catch {
    // ignore
  }
};

const normalizeComboKey = (combo: string[]): string => {
  const keys = combo
    .map((t) => normalizeTopicKey(t))
    .filter(Boolean)
    .sort();
  return keys.join('|');
};

export const upsertTopicComboMRU = (
  existing: TopicComboStorage,
  combo: TopicCombo,
  max = 6,
): TopicComboStorage => {
  const cleanedCombo = dedupeCaseInsensitive(
    combo.map((t) => sanitizeTopicLabel(t)),
  ).filter(Boolean);
  if (!cleanedCombo.length) return existing;

  const key = normalizeComboKey(cleanedCombo);
  const result: TopicComboStorage = [];
  const seen = new Set<string>();

  // Insert new combo first
  result.push(cleanedCombo);
  seen.add(key);

  // Add existing combos, skipping duplicates by normalized key
  for (const comboItem of existing) {
    const comboKey = normalizeComboKey(comboItem);
    if (seen.has(comboKey)) continue;
    result.push(
      dedupeCaseInsensitive(
        comboItem.map((t) => sanitizeTopicLabel(t)),
      ).filter(Boolean),
    );
    seen.add(comboKey);
    if (result.length >= max) break;
  }

  return result.slice(0, max);
};

// ---- Per-insurer default topics ----

const normalizeInsurerKey = (insurerName?: string): string =>
  (insurerName || '').trim().toLowerCase();

export const loadInsurerDefaultTopicsMap = (
  userId?: string,
): InsurerDefaultsStorage => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(INSURER_DEFAULT_TOPICS_KEY(userId));
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  const map: InsurerDefaultsStorage = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const topics = dedupeCaseInsensitive(
      (value as string[]).map((t) => sanitizeTopicLabel(t)),
    )
      .filter(Boolean)
      .slice(0, 8); // cap default topics per insurer
    if (topics.length) {
      map[key] = topics;
    }
  }
  return map;
};

export const saveInsurerDefaultTopicsMap = (
  userId: string | undefined,
  map: InsurerDefaultsStorage,
): void => {
  if (typeof window === 'undefined') return;
  const cleaned: InsurerDefaultsStorage = {};
  for (const [key, value] of Object.entries(map)) {
    const topics = dedupeCaseInsensitive(
      (value || []).map((t) => sanitizeTopicLabel(t)),
    )
      .filter(Boolean)
      .slice(0, 8);
    if (topics.length) {
      cleaned[key] = topics;
    }
  }
  try {
    window.localStorage.setItem(
      INSURER_DEFAULT_TOPICS_KEY(userId),
      JSON.stringify(cleaned),
    );
  } catch {
    // ignore
  }
};

export const getInsurerDefaultTopics = (
  userId: string | undefined,
  insurerName: string | undefined,
): string[] => {
  const map = loadInsurerDefaultTopicsMap(userId);
  const key = normalizeInsurerKey(insurerName);
  return map[key] || [];
};

export const setInsurerDefaultTopics = (
  userId: string | undefined,
  insurerName: string | undefined,
  topics: string[],
): void => {
  if (!insurerName) return;
  const key = normalizeInsurerKey(insurerName);
  const map = loadInsurerDefaultTopicsMap(userId);
  const cleaned = dedupeCaseInsensitive(
    topics.map((t) => sanitizeTopicLabel(t)),
  )
    .filter(Boolean)
    .slice(0, 8);
  if (!cleaned.length) {
    delete map[key];
  } else {
    map[key] = cleaned;
  }
  saveInsurerDefaultTopicsMap(userId, map);
};

export const clearInsurerDefaultTopics = (
  userId: string | undefined,
  insurerName: string | undefined,
): void => {
  if (!insurerName) return;
  const key = normalizeInsurerKey(insurerName);
  const map = loadInsurerDefaultTopicsMap(userId);
  if (map[key]) {
    delete map[key];
    saveInsurerDefaultTopicsMap(userId, map);
  }
};


