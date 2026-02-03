import { ReportData } from '../../types';
import {
  getHebrewReviewQueue,
  getInsurerFeedbackQueue,
  getResendEligibleQueue,
  getMissingPolicyAppendixQueue,
} from './adminQueues';

export interface AdminKpis {
  hebrewPending: number;
  insurerFeedbackOpen: number;
  resendReady: number;
  missingPolicyAppendix: number;
  sentLast7Days: number;
}

const getTimestamp = (report: ReportData): number => {
  const ts = report.sentAt || report.updatedAt || report.reportDate;
  return ts ? new Date(ts).getTime() : 0;
};

export const computeAdminKpis = (
  reports: ReportData[],
  canTranslate: (report: ReportData) => boolean,
): AdminKpis => {
  const baseReports = reports.filter((r) => !r.deletedAt);

  const hebrewPending = getHebrewReviewQueue(baseReports).length;
  const insurerFeedbackOpen = getInsurerFeedbackQueue(baseReports).length;
  const resendReady = getResendEligibleQueue(baseReports, canTranslate).length;
  const missingPolicyAppendix = getMissingPolicyAppendixQueue(baseReports).length;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const sentLast7Days = baseReports.filter((r) => {
    if (r.status !== 'SENT') return false;
    const ts = getTimestamp(r);
    if (!ts) return false;
    return now - ts <= sevenDaysMs;
  }).length;

  return {
    hebrewPending,
    insurerFeedbackOpen,
    resendReady,
    missingPolicyAppendix,
    sentLast7Days,
  };
};


