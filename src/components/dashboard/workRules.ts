import type { ReportData, ReportStatus } from '../../types';
import { t } from './i18n';
import { getCaseKey } from './caseKey';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const getNextStepLabelForStatus = (status: ReportStatus): string => {
  switch (status) {
    case 'TASK_ASSIGNED':
    case 'PENDING_REVIEW':
      return t('nextStepReview'); // הכנת טיוטת דיווח
    case 'WAITING_FOR_INVOICES':
      return t('nextStepWaitingInvoices'); // קבלת חשבוניות
    case 'READY_TO_SEND':
      return t('nextStepReadyToSend'); // שליחת דיווח
    case 'DRAFT':
      return t('nextStepDraft'); // המשך עריכת טיוטה
    case 'SENT':
      return ''; // אין שלב הבא לאחר שליחה
    default:
      return t('nextStepContinue'); // המשך טיפול
  }
};

const getReferenceTime = (report: ReportData): number | null => {
  const src = report.updatedAt || report.reportDate;
  if (!src) return null;
  const time = new Date(src).getTime();
  if (!Number.isFinite(time)) return null;
  return time;
};

export const getAlertLabelForReport = (report: ReportData): string | null => {
  const refTime = getReferenceTime(report);
  if (!refTime) return null;
  const daysOpen = (Date.now() - refTime) / MS_PER_DAY;
  if (daysOpen <= 3) return null;

  if (report.status === 'DRAFT') {
    return t('alertResponseDelay'); // עיכוב במענה
  }

  if (
    report.status === 'WAITING_FOR_INVOICES' ||
    report.status === 'READY_TO_SEND'
  ) {
    return t('alertTimeBreach'); // חריגה בזמן
  }

  return null;
};

export const hasImmediateAction = (report: ReportData): boolean => {
  if (report.status === 'TASK_ASSIGNED' || report.status === 'PENDING_REVIEW') {
    return true;
  }
  if (report.status === 'READY_TO_SEND') {
    return true;
  }
  return false;
};

export const isNewCaseReport = (report: ReportData, allReports: ReportData[]): boolean => {
  const key = getCaseKey(report);
  if (!key) return false;

  const sameCase = allReports.filter(
    (r) => !r.deletedAt && getCaseKey(r) === key,
  );

  if (sameCase.length <= 1) return true;

  let oldest = Number.POSITIVE_INFINITY;
  sameCase.forEach((r) => {
    if (!r.reportDate) return;
    const time = new Date(r.reportDate).getTime();
    if (Number.isFinite(time) && time < oldest) {
      oldest = time;
    }
  });

  if (!Number.isFinite(oldest)) return false;

  const ageMs = Date.now() - oldest;
  return ageMs < 14 * MS_PER_DAY;
};


