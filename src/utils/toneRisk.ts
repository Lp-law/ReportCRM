// TODO: Legacy heuristic Tone & Risk analyzer. Not used in current production
// flow; kept for reference only. Consider removing or wiring to tests in future.
import { ToneRiskIssue, ToneRiskKind, ToneRiskSeverity } from '../types';

const ABSOLUTE_TRIGGERS = [
  'בוודאות',
  'אין ספק',
  'אין כל ספק',
  'אין אחריות',
  'ברור כי',
  'ברור ש',
  'חד משמעית',
  'ללא כל',
  'מוכח ש',
  'מוכח כי',
];

const AGGRESSIVE_TRIGGERS = [
  'נדרש',
  'נדרשת',
  'חובה',
  'ללא דיחוי',
  'עליכם',
  'עליך',
  'אנו דורשים',
  'אנו מחייבים',
];

const FACT_OPINION_TRIGGERS = [
  'ברור שהתובע משקר',
  'ברור שהנתבע משקר',
  'משקר',
  'שקרן',
  'ממציא',
  'בדה מליבו',
];

const NON_PROFESSIONAL_TRIGGERS = [
  'כאילו',
  'ממש',
  'סבבה',
  'יאללה',
  'לא משהו',
  'בא לנו',
  'כזה',
  'stuff',
];

const HIGH_RISK_WORDS = ['חשיפה גבוהה', 'סיכון משמעותי', 'סיכון גבוה', 'חוות דעת שלילית'];
const LOW_RISK_WORDS = ['סיכון נמוך', 'סיכון זניח', 'סיכויי הגנה טובים', 'סיכויי הגנה מצוינים'];

const HIGH_RECOMMEND_WORDS = ['פשרה גבוהה', 'תשלום משמעותי', 'סגירת התיק בפשרה גבוהה'];
const LOW_RECOMMEND_WORDS = ['ללא תשלום', 'אין צורך בתשלום', 'להמשיך בניהול ההליך'];

const simpleSentenceSplit = (text: string): string[] => {
  return text
    .split(/[\.\!\?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const findTriggerInSentence = (sentence: string, triggers: string[]): string | null => {
  for (const t of triggers) {
    if (sentence.includes(t)) return t;
  }
  return null;
};

const makeIssue = (params: {
  sectionKey: string;
  severity: ToneRiskSeverity;
  kind: ToneRiskKind;
  excerpt: string;
  message: string;
  suggestion?: string;
}): ToneRiskIssue => ({
  id: `tone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sectionKey: params.sectionKey,
  severity: params.severity,
  kind: params.kind,
  excerpt: params.excerpt,
  message: params.message,
  suggestion: params.suggestion,
});

export const analyzeToneRisk = (content: Record<string, string>): ToneRiskIssue[] => {
  const issues: ToneRiskIssue[] = [];

  const hasHighRiskInUpdate = HIGH_RISK_WORDS.some((w) =>
    (content['Update'] || '').includes(w),
  );
  const hasLowRiskInRisk = LOW_RISK_WORDS.some((w) =>
    (content['Risk Assessment'] || '').includes(w),
  );

  const hasHighRec = HIGH_RECOMMEND_WORDS.some((w) =>
    (content['Recommendations'] || '').includes(w),
  );
  const hasLowRisk = LOW_RISK_WORDS.some((w) =>
    (content['Risk Assessment'] || '').includes(w),
  );

  Object.entries(content).forEach(([sectionKey, value]) => {
    if (!value || typeof value !== 'string') {
      return;
    }
    const sentences = simpleSentenceSplit(value);

    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      const absTrigger = findTriggerInSentence(trimmed, ABSOLUTE_TRIGGERS);
      if (absTrigger) {
        issues.push(
          makeIssue({
            sectionKey,
            severity: 'WARNING',
            kind: 'ABSOLUTE_LANGUAGE',
            excerpt: trimmed,
            message:
              'נמצא ניסוח מוחלט (ללא הסתייגות). בדיווחי ביטוח (ובמיוחד ללוידס) מומלץ להשתמש בניסוח זהיר והסתברותי.',
            suggestion: trimmed.replace(
              absTrigger,
              'להערכתנו ובשלב זה נראה כי',
            ),
          }),
        );
      }

      const aggrTrigger = findTriggerInSentence(trimmed, AGGRESSIVE_TRIGGERS);
      if (aggrTrigger) {
        issues.push(
          makeIssue({
            sectionKey,
            severity: 'INFO',
            kind: 'AGGRESSIVE_TONE',
            excerpt: trimmed,
            message:
              'הטון במשפט זה עלול להיתפס כתקיף או דרישתי מדי. מומלץ להשתמש בניסוח מקצועי ומרוכך.',
            suggestion: trimmed.replace(
              aggrTrigger,
              'נבקש מן המבטחת לשקול',
            ),
          }),
        );
      }

      const factOpinionTrigger = findTriggerInSentence(
        trimmed,
        FACT_OPINION_TRIGGERS,
      );
      if (factOpinionTrigger) {
        issues.push(
          makeIssue({
            sectionKey,
            severity: 'WARNING',
            kind: 'FACT_OPINION_MIX',
            excerpt: trimmed,
            message:
              'נראה כי מוצגת פרשנות או עמדה כסוג של עובדה. מומלץ להציג זאת כהערכה או טענה ולא כנתון מוכח.',
            suggestion: trimmed.replace(
              factOpinionTrigger,
              'עולה חשש כי',
            ),
          }),
        );
      }

      const nonProfTrigger = findTriggerInSentence(
        trimmed,
        NON_PROFESSIONAL_TRIGGERS,
      );
      if (nonProfTrigger) {
        issues.push(
          makeIssue({
            sectionKey,
            severity: 'INFO',
            kind: 'NON_PROFESSIONAL_HEBREW',
            excerpt: trimmed,
            message:
              'נמצא ביטוי שאינו מתאים ללשון משפטית רשמית. מומלץ לנסח מחדש בניסוח מקצועי וענייני.',
            suggestion: undefined,
          }),
        );
      }
    });
  });

  if (hasHighRiskInUpdate && hasLowRiskInRisk) {
    issues.push(
      makeIssue({
        sectionKey: 'Risk Assessment',
        severity: 'WARNING',
        kind: 'INCONSISTENCY',
        excerpt: 'Update מתאר סיכון/חשיפה גבוהה, בעוד Risk Assessment מציין סיכון נמוך.',
        message:
          'ייתכן חוסר עקביות בין תיאור ההתפתחויות לבין הערכת הסיכון. מומלץ לוודא שהערכת הסיכון משקפת את המצב המתואר.',
        suggestion:
          'מומלץ לרכך את הערכת הסיכון או להסביר מדוע למרות ההתפתחויות הסיכון עדיין נמוך.',
      }),
    );
  }

  if (hasHighRec && hasLowRisk) {
    issues.push(
      makeIssue({
        sectionKey: 'Recommendations',
        severity: 'INFO',
        kind: 'INCONSISTENCY',
        excerpt:
          'המלצה על פשרה/תשלום משמעותי לצד הערכת סיכון נמוכה מאוד ב-Risk Assessment.',
        message:
          'ייתכן פער בין רמת הסיכון לבין ההמלצה הכספית. מומלץ לוודא שההמלצה מנומקת לאור רמת הסיכון.',
        suggestion:
          'ניתן להוסיף הסבר מדוע ממליצים על פשרה אף שהסיכון המשפטי מוערך כנמוך.',
      }),
    );
  }

  return issues;
};


