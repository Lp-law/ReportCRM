export type AdminPriorityReasonKey =
  | 'EXTERNAL_REQUIRES_HEBREW'
  | 'HEBREW_REOPENED_EXTERNAL'
  | 'HEBREW_SUBMITTED'
  | 'HEBREW_CHANGES_REQUESTED'
  | 'INTERNAL_CRITICAL_ISSUE'
  | 'WAITING_FOR_INVOICES'
  | 'RESEND_ELIGIBLE'
  | 'AGING_OVER_7_DAYS'
  | 'AGING_OVER_3_DAYS';

export type AdminPriorityReasonDef = {
  code: AdminPriorityReasonKey;
  labelHe: string;
  weight: number;
};

export const ADMIN_PRIORITY_REASONS: Record<AdminPriorityReasonKey, AdminPriorityReasonDef> = {
  EXTERNAL_REQUIRES_HEBREW: {
    code: 'EXTERNAL_REQUIRES_HEBREW',
    labelHe: 'משוב מבטחת דורש תיקון עברית',
    weight: 100,
  },
  HEBREW_REOPENED_EXTERNAL: {
    code: 'HEBREW_REOPENED_EXTERNAL',
    labelHe: 'עברית נפתחה מחדש בעקבות מבטחת',
    weight: 80,
  },
  HEBREW_SUBMITTED: {
    code: 'HEBREW_SUBMITTED',
    labelHe: 'ממתין לאישור עברית',
    weight: 60,
  },
  HEBREW_CHANGES_REQUESTED: {
    code: 'HEBREW_CHANGES_REQUESTED',
    labelHe: 'תיקונים בעברית מתבקשים',
    weight: 50,
  },
  INTERNAL_CRITICAL_ISSUE: {
    code: 'INTERNAL_CRITICAL_ISSUE',
    labelHe: 'Issue פנימי קריטי פתוח',
    weight: 40,
  },
  WAITING_FOR_INVOICES: {
    code: 'WAITING_FOR_INVOICES',
    labelHe: 'ממתין לחשבוניות',
    weight: 30,
  },
  RESEND_ELIGIBLE: {
    code: 'RESEND_ELIGIBLE',
    labelHe: 'מוכן לשליחה מחדש',
    weight: 20,
  },
  AGING_OVER_7_DAYS: {
    code: 'AGING_OVER_7_DAYS',
    labelHe: 'לא עודכן מעל 7 ימים',
    weight: 20,
  },
  AGING_OVER_3_DAYS: {
    code: 'AGING_OVER_3_DAYS',
    labelHe: 'לא עודכן זמן רב',
    weight: 10,
  },
};

