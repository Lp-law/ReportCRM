export const adminHe = {
  title: 'לוח בקרה – ניהול דיווחים',
  subtitle: 'תמונת מצב יומית של דיווחים בעברית, משוב מבטחת ושליחות חוזרות',

  actions: {
    openNewReport: 'פתיחת דיווח חדש',
    allReports: 'כל הדוחות',
    clearFilter: 'נקה סינון',
  },

  kpis: {
    hebrewPending: 'ממתינים לאישור עברית',
    insurerFeedbackOpen: 'משוב מבטחת פתוח',
    resendReady: 'מוכנים לשליחה מחדש',
    missingPolicyAppendix: 'נספח פוליסה חסר',
    sentLast7Days: 'נשלחו ב־7 הימים האחרונים',
  },

  queues: {
    hebrewReview: {
      title: 'תור – ביקורת עברית',
      subtitle: 'דוחות שהוגשו לבדיקה או חזרו עם בקשות תיקון',
      empty: 'אין כרגע דוחות הממתינים לביקורת עברית.',
    },
    insurerFeedback: {
      title: 'תור – משוב מבטחת',
      subtitle: 'דוחות שנפתחו מחדש בעקבות הערות מחברת הביטוח',
      empty: 'אין כרגע דוחות עם משוב פתוח מהמבטחת.',
    },
    resend: {
      title: 'תור – מוכנים לשליחה מחדש',
      subtitle: 'דוחות מאושרים לתרגום וללא חסם משוב חיצוני',
      empty: 'אין כרגע דוחות זמינים לשליחה מחדש.',
    },
  },

  table: {
    title: 'טבלת דוחות',
    filterLabel: 'מסנן נוכחי:',
    filterAll: 'כל הדוחות',
    filterHebrew: 'ביקורת עברית',
    filterFeedback: 'משוב מבטחת',
    filterResend: 'שליחה מחדש',
    filterMissingPolicy: 'נספח פוליסה חסר',

    columns: {
      id: 'מספר תיק / מזהה',
      status: 'סטטוס דיווח',
      hebrewStatus: 'סטטוס עברית / ביקורת',
      insurer: 'מבטחת',
      insured: 'מבוטח',
      plaintiff: 'תובעת',
      updatedAt: 'עודכן לאחרונה',
    },

    empty: 'לא נמצאו דוחות לתצוגה בהתאם לסינון הנוכחי.',
  },

  queueItem: {
    openReport: 'פתח דיווח',
    noDate: 'ללא תאריך',
  },

  attention: {
    title: 'דורש תשומת לב עכשיו',
    subtitle: 'הפריטים הדחופים ביותר לפי משוב, עברית וזמן',
    empty: 'אין פריטים דחופים כרגע 🎉',
    openReport: 'פתח דיווח',
    reasons: 'סיבות:',
    jumpToReview: 'קפוץ לביקורת עברית',
    jumpToExternal: 'קפוץ למשוב מבטחת',
    markExternalDone: 'סמן משוב מבטחת כטופל',
    confirmMarkExternalDone: 'האם לסמן את כל משוב המבטחת בדוח זה כטופל?',
    reopenHebrew: 'פתח מחדש עברית (משוב מבטחת)',
    confirmReopenHebrew: 'האם לפתוח מחדש את העברית בדוח זה בעקבות משוב מבטחת?',
    markExternalDoneTitle: 'סגירת משוב מבטחת',
    reopenHebrewTitle: 'פתיחה מחדש של עברית',
  },
  dialog: {
    confirmTitle: 'אישור פעולה',
    cancel: 'ביטול',
    confirm: 'אישור',
  },

  insights: {
    title: 'תמונת מצב – מה יוצר דחיפות',
    subtitle: 'ספירה לפי סיבות התיעדוף בדוחות עם ניקוד (>0)',
    empty: 'אין כרגע דוחות עם תיעדוף פעיל.',
    column: {
      reason: 'סיבה',
      count: 'כמות',
      share: 'אחוז',
    },
    hint: 'זהו מדד עזר לתיעדוף, לא תחליף לניהול מקצועי.',
  },

  toast: {
    reportNotFound: 'הדוח לא נמצא או נמחק. הפעולה בוטלה.',
    actionCompleted: 'הפעולה בוצעה בהצלחה.',
    actionCancelled: 'הפעולה בוטלה.',
  },
};


