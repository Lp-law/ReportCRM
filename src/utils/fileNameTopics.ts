import { INVALID_FILENAME_CHARS } from './reportFileName';

const FILE_NAME_TOPICS_STORAGE_KEY = (userId?: string) =>
  `fileNameTopics:${userId || 'default'}`;

// Default topics available for filename "topics" segment
export const DEFAULT_FILE_NAME_TOPICS: string[] = [
  'Update',
  'Expenses',
  'New Lawsuit',
  'New Third Party Notice',
  'New Letter of Demand',
  'Risk Assessment',
  'Strategy',
  'Recommendation',
  'Request for Settlement Approval',
  'Judgment',
  'Request to Reopen a Claim',
  'Dismissal for Inaction',
];

/**
 * Sanitize a human-entered topic label so it can be safely used inside a filename.
 * - Trims
 * - Removes invalid filename characters
 * - Collapses whitespace
 */
export const sanitizeTopicLabel = (topic: string): string => {
  const raw = (topic || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
};

export const normalizeTopicKey = (topic: string): string =>
  sanitizeTopicLabel(topic).trim().toLowerCase();

export const dedupeCaseInsensitive = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = sanitizeTopicLabel(item);
    const key = normalizeTopicKey(value);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

export const loadUserFileNameTopics = (userId?: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FILE_NAME_TOPICS_STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeCaseInsensitive(
      parsed
        .map((v) => (typeof v === 'string' ? v : ''))
        .map(sanitizeTopicLabel),
    );
  } catch {
    return [];
  }
};

export const saveUserFileNameTopics = (
  userId: string | undefined,
  topics: string[],
): void => {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = dedupeCaseInsensitive(
      topics.map(sanitizeTopicLabel),
    ).filter(Boolean);
    window.localStorage.setItem(
      FILE_NAME_TOPICS_STORAGE_KEY(userId),
      JSON.stringify(cleaned),
    );
  } catch {
    // ignore storage failures
  }
};

/**
 * Insert or move a topic to the front of an MRU list, enforcing a maximum length.
 */
export const upsertTopicMRU = (
  existing: string[],
  topic: string,
  max = 15,
): string[] => {
  const cleanedTopic = sanitizeTopicLabel(topic);
  const key = normalizeTopicKey(cleanedTopic);
  if (!key) return dedupeCaseInsensitive(existing).slice(0, max);

  const without = (existing || []).filter(
    (t) => normalizeTopicKey(t) !== key,
  );
  const next = [cleanedTopic, ...without];
  return dedupeCaseInsensitive(next).slice(0, max);
};


