import { escapeRegex } from './regexUtils.ts';

export type HebrewFactPlaceholderMap = Record<string, string>;

export type HebrewRewriteMode = 'SAFE_POLISH' | 'REWRITE';

interface ProtectResult {
  protectedText: string;
  map: HebrewFactPlaceholderMap;
}

interface RestoreResult {
  restoredText: string;
  missingPlaceholders: string[];
}

/**
 * Very similar in spirit to the English protectFacts/restoreFacts utilities,
 * but tuned for Hebrew legal text. The goal is to aggressively protect any
 * factual tokens (numbers, amounts, dates, percentages, IDs, English names)
 * so that the LLM can safely rewrite wording without touching facts.
 */
export const protectHebrewFacts = (text: string): ProtectResult => {
  if (!text) {
    return { protectedText: text, map: {} };
  }

  let protectedText = text;
  const map: HebrewFactPlaceholderMap = {};
  let counter = 0;

  const makeKey = (prefix: string) => `__${prefix}_${++counter}__`;

  const applyPattern = (pattern: RegExp, prefix: string) => {
    protectedText = protectedText.replace(pattern, (match) => {
      // Avoid re-wrapping an existing placeholder
      if (/^__\w+_\d+__$/.test(match)) return match;
      const key = makeKey(prefix);
      if (!map[key]) {
        map[key] = match;
      }
      return key;
    });
  };

  // 1) Money amounts (₪, $, €, £ and common currency codes around numbers)
  applyPattern(/(?:₪|\$|€|£)\s*\d[\d,\.]*/g, 'MONEY');
  applyPattern(/\b\d[\d,\.]*\s*(?:₪|ש"ח|NIS|ILS|USD|EUR|GBP)\b/gi, 'MONEY');
  applyPattern(/\b(?:USD|NIS|ILS|EUR|GBP)\s*\d[\d,\.]*/gi, 'MONEY');

  // 2) Percentages
  applyPattern(/\d[\d,\.]*\s*%/g, 'PCT');

  // 3) Dates – numeric (e.g. 01/02/2020, 1.2.20, 2020-01-02)
  applyPattern(/\b\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}\b/g, 'DATE');
  applyPattern(/\b\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}\b/g, 'DATE');

  // 4) Case/policy/claim identifiers (Hebrew+English prefixes)
  applyPattern(
    /\b(?:תיק\s*מס'?\.?|מספר\s*תיק|Claim|Case|Policy|File)\s*[:#]?\s*[A-Za-z0-9\/\-]+/gi,
    'ID',
  );

  // 5) Plain numbers (fallback – AFTER money/percent/date)
  applyPattern(/\b\d{1,3}(?:[,\.\s]\d{3})*(?:[,\.\s]\d+)?\b/g, 'NUM');

  // 6) Numbers written in Hebrew words (conservative list)
  const numWord =
    '(?:אפס|אחד|שתיים|שניים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת עשרה|אחת-עשרה|שתים עשרה|שתים-עשרה|שתים-עשר|שלוש עשרה|שלוש-עשרה|ארבע עשרה|ארבע-עשרה|חמש עשרה|חמש-עשרה|שש עשרה|שש-עשרה|שבע עשרה|שבע-עשרה|שמונה עשרה|שמונה-עשרה|תשע עשרה|תשע-עשרה|עשרים|עשרים ואחת|עשרים ואחד|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים|מאה|מאתיים|שלוש מאות|ארבע מאות|חמש מאות|שש מאות|שבע מאות|שמונה מאות|תשע מאות|אלף|אלפים|מיליון|מיליארד)';
  const numWordPattern = new RegExp(
    `\\b${numWord}(?:\\s+ו?${numWord})*(?:\\s+(?:אחוז(?:ים)?|שקל(?:ים)?|₪|אלף|אלפים|מיליון|מיליארד))?`,
    'g',
  );
  applyPattern(numWordPattern, 'NUMWORD');

  // 7) Simple English proper names: "John Doe", "Lior Perry"
  applyPattern(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, 'NAME');

  // 8) Hebrew names with professional titles: "ד\"ר כהן", "עו\"ד לוי", "פרופ' ישראלי"
  applyPattern(
    /\b(?:ד\"ר|ד"ר|עו\"ד|עו"ד|פרופ'?|פרופ׳)\s+[א-ת]{2,}(?:\s+[א-ת]{2,})?/g,
    'NAME',
  );

  // 8) Hebrew initials as names: "א. ב.", "א׳ ב׳"
  applyPattern(/\b[א-ת]['״׳\.]\s*[א-ת]['״׳\.]/g, 'NAME');

  // 9) Contextual Hebrew names after strong role words, e.g. "התובעת שרה לוי"
  const contextNamePattern =
    /\b(התובעת|התובע|הנתבע|הנתבעת|המבוטח|המבוטחת|העד|המומחה|הרופא|הגב׳|הגב'|מר|מר\.|גב׳|גב'|Mr|Mrs)\s+[א-ת]{2,12}\s+[א-ת]{2,12}/g;
  protectedText = protectedText.replace(contextNamePattern, (match) => {
    if (/^__\w+_\d+__$/.test(match)) return match;
    const key = makeKey('NAME');
    if (!map[key]) {
      map[key] = match;
    }
    return key;
  });

  return { protectedText, map };
};

export const restoreHebrewFacts = (
  text: string,
  map: HebrewFactPlaceholderMap,
): RestoreResult => {
  if (!text || !map || !Object.keys(map).length) {
    return { restoredText: text, missingPlaceholders: [] };
  }

  let restored = text;
  const missing: string[] = [];

  for (const [placeholder, original] of Object.entries(map)) {
    if (!restored.includes(placeholder)) {
      missing.push(placeholder);
      continue;
    }
    const re = new RegExp(escapeRegex(placeholder), 'g');
    restored = restored.replace(re, original);
  }

  return { restoredText: restored, missingPlaceholders: missing };
};


