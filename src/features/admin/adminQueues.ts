import { ReportData, HebrewWorkflowStatus } from '../../types';

const getSortTimestamp = (report: ReportData): number => {
  const ts = report.updatedAt || report.sentAt || report.reportDate;
  return ts ? new Date(ts).getTime() : 0;
};

export const hasAnyOpenExternalIssue = (report: ReportData): boolean => {
  const issues = report.reportReview?.issues ?? [];
  return issues.some(
    (issue) =>
      (issue.origin ?? 'INTERNAL') === 'EXTERNAL' &&
      issue.status !== 'DONE',
  );
};

export const hasOpenExternalIssueRequiringHebrew = (report: ReportData): boolean => {
  const issues = report.reportReview?.issues ?? [];
  return issues.some(
    (issue) =>
      (issue.origin ?? 'INTERNAL') === 'EXTERNAL' &&
      issue.status !== 'DONE' &&
      issue.externalAction === 'REQUIRES_HEBREW',
  );
};

export const hasAnyOpenInternalIssue = (report: ReportData): boolean => {
  const issues = report.reportReview?.issues ?? [];
  return issues.some(
    (issue) =>
      (issue.origin ?? 'INTERNAL') === 'INTERNAL' &&
      issue.status !== 'DONE',
  );
};

const isHebrewPending = (report: ReportData): boolean => {
  const wf: HebrewWorkflowStatus | undefined = report.hebrewWorkflowStatus;
  const reviewStatus = report.reportReview?.status;

  if (wf === 'HEBREW_SUBMITTED' || wf === 'HEBREW_CHANGES_REQUESTED') {
    return true;
  }
  if (reviewStatus === 'SUBMITTED' || reviewStatus === 'CHANGES_REQUESTED') {
    return true;
  }
  return false;
};

export const getHebrewReviewQueue = (reports: ReportData[]): ReportData[] => {
  return reports
    .filter((r) => !r.deletedAt && isHebrewPending(r))
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};

export const getInsurerFeedbackQueue = (reports: ReportData[]): ReportData[] => {
  return reports
    .filter((r) => {
      if (r.deletedAt) return false;
      if (r.hebrewWorkflowStatus === 'HEBREW_REOPENED_EXTERNAL') return true;
      return hasAnyOpenExternalIssue(r);
    })
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};

export const getResendEligibleQueue = (
  reports: ReportData[],
  canTranslate: (report: ReportData) => boolean,
): ReportData[] => {
  return reports
    .filter((r) => {
      if (r.deletedAt) return false;
      if (r.status !== 'SENT') return false;
      if (!canTranslate(r)) return false;
      if (hasOpenExternalIssueRequiringHebrew(r)) return false;
      return true;
    })
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};

export const getMissingPolicyAppendixQueue = (reports: ReportData[]): ReportData[] => {
  return reports
    .filter((r) => {
      if (r.deletedAt) return false;
      const isFirstReport = !r.reportHistory || r.reportHistory.length === 0;
      const wantsAppendix = r.attachPolicyAsAppendix === true;
      const hasPolicyFile = !!r.policyFile;
      return isFirstReport && wantsAppendix && !hasPolicyFile;
    })
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};


