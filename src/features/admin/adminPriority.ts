import { ReportData } from '../../types';
import {
  hasAnyOpenExternalIssue,
  hasOpenExternalIssueRequiringHebrew,
  hasAnyOpenInternalIssue,
} from './adminQueues';
import { ADMIN_PRIORITY_REASONS, AdminPriorityReasonKey } from './adminPriorityReasons';

export type AdminAttentionReason = {
  code: string;
  labelHe: string;
};

export type AdminAttentionItem = {
  report: ReportData;
  score: number;
  reasons: AdminAttentionReason[];
};

const getUpdatedTimestamp = (report: ReportData): number => {
  const ts = report.updatedAt || report.sentAt || report.reportDate;
  return ts ? new Date(ts).getTime() : 0;
};

const hasCriticalInternalIssue = (report: ReportData): boolean => {
  const issues = report.reportReview?.issues ?? [];
  return issues.some(
    (issue) =>
      (issue.origin ?? 'INTERNAL') === 'INTERNAL' &&
      issue.status !== 'DONE' &&
      issue.severity === 'CRITICAL',
  );
};

export const scoreReportForAdminAttention = (
  report: ReportData,
  canTranslate: (report: ReportData | null | undefined) => boolean,
): { score: number; reasons: AdminAttentionReason[] } => {
  if (report.deletedAt) {
    return { score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: AdminAttentionReason[] = [];

  const addReason = (key: AdminPriorityReasonKey) => {
    const reason = ADMIN_PRIORITY_REASONS[key];
    if (!reason) return;
    if (reasons.some((r) => r.code === reason.code)) return;
    score += reason.weight;
    reasons.push({ code: reason.code, labelHe: reason.labelHe });
  };

  // A) EXTERNAL issue open requiring Hebrew
  if (hasOpenExternalIssueRequiringHebrew(report)) {
    addReason('EXTERNAL_REQUIRES_HEBREW');
  }

  // B) Hebrew reopened due to external feedback
  if (report.hebrewWorkflowStatus === 'HEBREW_REOPENED_EXTERNAL') {
    addReason('HEBREW_REOPENED_EXTERNAL');
  }

  // C) Hebrew submitted for review
  if (report.hebrewWorkflowStatus === 'HEBREW_SUBMITTED') {
    addReason('HEBREW_SUBMITTED');
  }

  // D) Hebrew changes requested
  if (report.hebrewWorkflowStatus === 'HEBREW_CHANGES_REQUESTED') {
    addReason('HEBREW_CHANGES_REQUESTED');
  }

  // E) Waiting for invoices
  if (report.status === 'WAITING_FOR_INVOICES') {
    addReason('WAITING_FOR_INVOICES');
  }

  // F) Open INTERNAL critical issues
  if (hasAnyOpenInternalIssue(report) && hasCriticalInternalIssue(report)) {
    addReason('INTERNAL_CRITICAL_ISSUE');
  }

  // G) Resend eligible
  const isResendEligible =
    report.status === 'SENT' &&
    canTranslate(report) &&
    !hasOpenExternalIssueRequiringHebrew(report);

  if (isResendEligible) {
    addReason('RESEND_ELIGIBLE');
  }

  // H) Aging
  const now = Date.now();
  const ts = getUpdatedTimestamp(report);
  if (ts) {
    const ageMs = now - ts;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (ageMs >= sevenDaysMs) {
      addReason('AGING_OVER_7_DAYS');
    } else if (ageMs >= threeDaysMs) {
      addReason('AGING_OVER_3_DAYS');
    }
  }

  return { score, reasons };
};

export const getAdminAttentionItems = (
  reports: ReportData[],
  canTranslate: (report: ReportData | null | undefined) => boolean,
  limit = 5,
): AdminAttentionItem[] => {
  const scored: AdminAttentionItem[] = reports.map((report) => {
    const { score, reasons } = scoreReportForAdminAttention(report, canTranslate);
    return { report, score, reasons };
  });

  return getAdminAttentionItemsFromScored(scored, limit);
};

export const getAdminAttentionItemsFromScored = (
  scored: AdminAttentionItem[],
  limit = 5,
): AdminAttentionItem[] => {
  const withScore = scored.filter((item) => item.score > 0);

  withScore.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const ta = getUpdatedTimestamp(a.report);
    const tb = getUpdatedTimestamp(b.report);
    return tb - ta;
  });

  return withScore.slice(0, limit);
};


