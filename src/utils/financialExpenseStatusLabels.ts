/**
 * תוויות סטטוס אחידות בעברית למודול הפיננסי.
 * מקור אמת יחיד – הרשימה, המסנן והעורך משתמשים באותה פונקציה.
 */
import type { FinancialExpenseSheet } from '../types';
import type { ReportData } from '../types';

const STATUS_LABELS: Record<FinancialExpenseSheet['status'], string> = {
  DRAFT: 'טיוטה',
  READY_FOR_REPORT: 'נשלח לעו״ד',
  ATTACHED_TO_REPORT: 'שובץ בדיווח',
  ARCHIVED: 'ארכיון',
};

/**
 * מחזיר תווית סטטוס בעברית לגיליון הוצאות.
 * אם יש דיווח מקושר, עשויה להחזיר תווית מקומית (למשל "שולם") במקום סטטוס הגיליון.
 */
export function getFinancialExpenseStatusLabelHe(
  sheet: FinancialExpenseSheet,
  linkedReport?: ReportData | null,
): string {
  if (linkedReport) {
    if (linkedReport.status === 'SENT') {
      if (linkedReport.isPaid) return 'שולם';
      return 'נשלח לחברת הביטוח';
    }
    const lawyerLabels: Record<string, string> = {
      TASK_ASSIGNED: 'ממתין לעו״ד',
      WAITING_FOR_INVOICES: 'ממתין לחשבוניות',
      PENDING_REVIEW: 'ממתין לסקירה',
      READY_TO_SEND: 'מוכן לשליחה לחברת הביטוח',
      SENT: 'נשלח לחברת הביטוח',
    };
    const l = lawyerLabels[linkedReport.status];
    if (l) return l;
  }
  return STATUS_LABELS[sheet.status];
}

/**
 * תווית סטטוס גולמית (ללא הקשר דיווח) – למסננים ורשימות.
 */
export function getFinancialExpenseStatusLabelHeRaw(
  status: FinancialExpenseSheet['status'],
): string {
  return STATUS_LABELS[status];
}

/** כל הסטטוסים עם תוויות – לשימוש ב־select מסנן */
export const FINANCIAL_STATUS_OPTIONS: { value: FinancialExpenseSheet['status']; label: string }[] = [
  { value: 'DRAFT', label: 'טיוטה' },
  { value: 'READY_FOR_REPORT', label: 'נשלח לעו״ד' },
  { value: 'ATTACHED_TO_REPORT', label: 'שובץ בדיווח' },
  { value: 'ARCHIVED', label: 'ארכיון' },
];
