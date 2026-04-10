import { escapeRegex } from './regexUtils.js';

/**
 * Very similar in spirit to the English protectFacts/restoreFacts utilities,
 * but tuned for Hebrew legal text. The goal is to aggressively protect any
 * factual tokens (numbers, amounts, dates, percentages, IDs, English names)
 * so that the LLM can safely rewrite wording without touching facts.
 */
export const protectHebrewFacts = (text) => {
  if (!text) {
    return { protectedText: text, map: {} };
  }

  let protectedText = text;
  const map = {};
  let counter = 0;

  const makeKey = (prefix) => `__${prefix}_${++counter}__`;

  const applyPattern = (pattern, prefix) => {
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
  // Note: \b doesn't work with Hebrew. Use lookbehind/lookahead for word boundaries.
  const numWord =
    '(?:אפס|אחד|אחת|שתיים|שניים|שלושה|שלושים|שלוש|ארבעה|ארבעים|ארבע|חמישה|חמישים|חמש|שישה|שישים|שש|שבעה|שבעים|שבע|שמונים|שמונה|תשעים|תשעה|תשע|עשרים|עשרה|עשר|אחת עשרה|אחת-עשרה|שתים עשרה|שתים-עשרה|שלוש עשרה|שלוש-עשרה|ארבע עשרה|ארבע-עשרה|חמש עשרה|חמש-עשרה|שש עשרה|שש-עשרה|שבע עשרה|שבע-עשרה|שמונה עשרה|שמונה-עשרה|תשע עשרה|תשע-עשרה|מאתיים|מאה|שלוש מאות|ארבע מאות|חמש מאות|שש מאות|שבע מאות|שמונה מאות|תשע מאות|אלפיים|אלפים|אלף|מיליארד|מיליון)';
  const numWordPattern = new RegExp(
    `(?:^|(?<=\\s))${numWord}(?:\\s+ו?${numWord})*(?:\\s+(?:אחוז(?:ים)?|שקל(?:ים)?|₪|אלף|אלפיים|אלפים|מיליון|מיליארד))?`,
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
  applyPattern(/(?:^|(?<=\s))[א-ת][.'״׳]\s*[א-ת][.'״׳]/g, 'NAME');

  // 9) Contextual Hebrew names after strong role words, e.g. "התובעת שרה לוי", "מר משה כהן"
  // Exclude common verbs/nouns that follow role words but aren't names.
  const hebrewNonNameWords = new Set([
    'טוענת', 'טוען', 'הגישה', 'הגיש', 'פנתה', 'פנה', 'ביקשה', 'ביקש',
    'קיבלה', 'קיבל', 'שילם', 'שילמה', 'נפגעה', 'נפגע', 'סבלה', 'סבל',
    'עברה', 'עבר', 'טופלה', 'טופל', 'אושפזה', 'אושפז', 'נותחה', 'נותח',
    'נולדה', 'נולד', 'התגוררה', 'התגורר', 'העידה', 'העיד',
    'לנכות', 'בשיעור', 'בסך', 'בגין', 'בגלל', 'לפיצוי', 'לפיצויים',
  ]);
  const contextNamePattern =
    /(?:^|(?<=\s))(התובעת|התובע|הנתבע|הנתבעת|המבוטח|המבוטחת|העד|המומחה|הרופא|הגב׳|הגב'|מר|גב׳|גב'|Mr|Mrs)\s+([א-ת]{2,12})\s+([א-ת]{2,12})/g;
  protectedText = protectedText.replace(contextNamePattern, (match, role, word1, word2) => {
    if (/^__\w+_\d+__$/.test(match)) return match;
    // Skip if the first word after the role is a common verb/noun
    if (hebrewNonNameWords.has(word1)) return match;
    const name = `${word1} ${word2}`;
    const key = makeKey('NAME');
    if (!map[key]) {
      map[key] = name;
    }
    return `${role} ${key}`;
  });

  return { protectedText, map };
};

export const restoreHebrewFacts = (text, map) => {
  if (!text || !map || !Object.keys(map).length) {
    return { restoredText: text, missingPlaceholders: [] };
  }

  let restored = text;
  const missing = [];

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
