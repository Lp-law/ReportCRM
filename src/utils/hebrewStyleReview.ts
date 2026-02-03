import { HebrewStyleIssue, HebrewStyleCategory, HebrewStyleSeverity } from '../types';

const SLANG_TRIGGERS: Record<string, string> = {
  'בגדול': 'במהות',
  'כאילו': 'למעשה',
  'ממש': 'במידה רבה',
  'די': 'במידה מסוימת',
  'סבבה': 'מקובל עלינו',
  'האמת': 'למעשה',
  'וואלה': 'יש לציין כי',
};

const FACT_OPINION_TRIGGERS: Record<string, string> = {
  'שקרן': 'עולה חשש כי גרסתו אינה מדויקת',
  'שקרנית': 'עולה חשש כי גרסתה אינה מדויקת',
  'סחטן': 'עולה חשש כי מטרת ההליך היא הפקת טובת הנאה בלתי מוצדקת',
  'ממציא': 'לטענתנו קיימים פערים בין גרסתו לבין החומר העובדתי',
  'ממציאה': 'לטענתנו קיימים פערים בין גרסתה לבין החומר העובדתי',
};

const PLACEHOLDER_PATTERNS = ['[DATE]', '__________', '__', '{plaintiff}', '{insured}'];

const TERM_GROUPS: string[][] = [
  ['התובע', 'התובעת'],
  ['המבוטח', 'המבוטחת', 'הנתבע', 'הנתבעת'],
  ['המבטחת', 'חברת הביטוח'],
];

const SPELLING_FIXES: Record<string, string> = {
  'מישפט': 'משפט',
  'ליפני': 'לפני',
  'ליפוף': 'ליפוף', // placeholder example; keep mapping simple and unambiguous
  'באיזור': 'באזור',
};

const simpleSentenceSplit = (text: string): string[] =>
  text
    .split(/[\.\!\?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const makeIssue = (params: {
  sectionKey: string;
  severity: HebrewStyleSeverity;
  category: HebrewStyleCategory;
  excerpt: string;
  message: string;
  suggestion?: string;
}): HebrewStyleIssue => ({
  id: `heb-style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sectionKey: params.sectionKey,
  severity: params.severity,
  category: params.category,
  excerpt: params.excerpt,
  message: params.message,
  suggestion: params.suggestion,
});

export const reviewHebrewStyle = (
  content: Record<string, string>,
): HebrewStyleIssue[] => {
  const issues: HebrewStyleIssue[] = [];

  // TERMS_INCONSISTENCY – לבדוק טרמינולוגיה בכל הדו"ח
  const fullText = Object.values(content || {})
    .filter(Boolean)
    .join('\n');
  if (fullText) {
    TERM_GROUPS.forEach((group) => {
      const counts: Record<string, number> = {};
      group.forEach((term) => {
        const re = new RegExp(term, 'g');
        const matchCount = (fullText.match(re) || []).length;
        if (matchCount > 0) counts[term] = matchCount;
      });
      const termsUsed = Object.keys(counts);
      if (termsUsed.length > 1) {
        const dominant = termsUsed.reduce((best, term) =>
          counts[term] > (counts[best] || 0) ? term : best,
        termsUsed[0]);
        issues.push(
          makeIssue({
            sectionKey: 'Update',
            severity: 'INFO',
            category: 'TERMS_INCONSISTENCY',
            excerpt: termsUsed.join(' / '),
            message:
              'זוהתה אי־אחידות בשימוש במונחים (לדוגמה צורות זכר/נקבה שונות). מומלץ לבחור מונח אחד ולהיצמד אליו לאורך הדו"ח.',
            suggestion: `מומלץ להשתמש בעקביות במונח: "${dominant}".`,
          }),
        );
      }
    });
  }

  // בדיקות ברמת משפט בתוך כל סעיף
  Object.entries(content || {}).forEach(([sectionKey, value]) => {
    if (!value || typeof value !== 'string') return;
    const sentences = simpleSentenceSplit(value);

    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      // SLANG
      Object.entries(SLANG_TRIGGERS).forEach(([slang, replacement]) => {
        if (trimmed.includes(slang)) {
          issues.push(
            makeIssue({
              sectionKey,
              severity: 'INFO',
              category: 'SLANG',
              excerpt: trimmed,
              message: 'נמצא ביטוי בשפה דיבורית. מומלץ להחליף בניסוח משפטי רשמי.',
              suggestion: trimmed.replace(slang, replacement),
            }),
          );
        }
      });

      // TOO_LONG_SENTENCE – לפי אורך תווים / מילים
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (trimmed.length > 200 || wordCount > 40) {
        issues.push(
          makeIssue({
            sectionKey,
            severity: 'INFO',
            category: 'TOO_LONG_SENTENCE',
            excerpt: trimmed.slice(0, 160) + (trimmed.length > 160 ? '…' : ''),
            message:
              'המשפט ארוך מאוד. מומלץ לפצל אותו לשניים או יותר משפטים קצרים וברורים.',
            suggestion:
              'מומלץ לזהות נקודות עצירה טבעיות במשפט ולפצל בהתאם לשני משפטים קצרים.',
          }),
        );
      }

      // FACT_OPINION – ניסוחים שיפוטיים / רגשיים
      Object.entries(FACT_OPINION_TRIGGERS).forEach(([trigger, suggestionText]) => {
        if (trimmed.includes(trigger)) {
          issues.push(
            makeIssue({
              sectionKey,
              severity: 'WARNING',
              category: 'FACT_OPINION',
              excerpt: trimmed,
              message:
                'נראה כי יש ערבוב בין עובדה לדעה וניסוח שיפוטי מדי. מומלץ לנסח כהערכה זהירה.',
              suggestion: suggestionText,
            }),
          );
        }
      });

      // PLACEHOLDER_LEFT – placeholders שלא הוחלפו
      PLACEHOLDER_PATTERNS.forEach((ph) => {
        if (trimmed.includes(ph)) {
          issues.push(
            makeIssue({
              sectionKey,
              severity: 'WARNING',
              category: 'PLACEHOLDER_LEFT',
              excerpt: trimmed,
              message:
                'נראה כי נשאר פלייסהולדר/שדה למילוי שלא עודכן (למשל תאריך, שם צד). מומלץ להשלים את המידע או למחוק את הפלייסהולדר.',
              suggestion: undefined,
            }),
          );
        }
      });

      // SPELLING_BASIC – זוגות טעויות בסיסיות
      Object.entries(SPELLING_FIXES).forEach(([wrong, correct]) => {
        if (trimmed.includes(wrong)) {
          issues.push(
            makeIssue({
              sectionKey,
              severity: 'INFO',
              category: 'SPELLING_BASIC',
              excerpt: trimmed,
              message: 'נראה כי קיימת טעות כתיב בסיסית שניתן לתקן בקלות.',
              suggestion: trimmed.replace(wrong, correct),
            }),
          );
        }
      });
    });
  });

  return issues;
};


