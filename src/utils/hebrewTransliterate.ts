/**
 * Simple Hebrew-to-Latin transliteration for proper names.
 * No AI, no dictionary – character-by-character mapping only.
 * Example: שלום כהן → Shalom Cohen
 */
const HEBREW_TO_LATIN: Record<string, string> = {
  א: '',
  ב: 'b',
  ג: 'g',
  ד: 'd',
  ה: 'h',
  ו: 'o',
  ז: 'z',
  ח: 'ch',
  ט: 't',
  י: 'y',
  כ: 'k',
  ך: 'k',
  ל: 'l',
  מ: 'm',
  ם: 'm',
  נ: 'n',
  ן: 'n',
  ס: 's',
  ע: '',
  פ: 'p',
  ף: 'f',
  צ: 'ts',
  ץ: 'ts',
  ק: 'k',
  ר: 'r',
  ש: 'sh',
  ת: 't',
};

export function transliterateHebrew(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const result: string[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    const next = trimmed[i + 1];
    if (c === 'ש' && (next === '\u05C2' || next === 'ׂ')) {
      result.push('s');
      i++;
      continue;
    }
    if (c === 'ש') result.push('sh');
    else if (c in HEBREW_TO_LATIN) result.push(HEBREW_TO_LATIN[c]);
    else if (/[\u0590-\u05FF]/.test(c)) result.push(c);
    else result.push(c);
  }
  return result
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)([a-z])/g, (_, s, l) => s + l.toUpperCase())
    .trim();
}
