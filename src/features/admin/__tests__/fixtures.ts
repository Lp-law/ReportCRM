import type { ReportData, ReportReviewIssue, ReportReview } from '../../../types';

export const makeIssue = (
  overrides: Partial<ReportReviewIssue> = {},
): ReportReviewIssue => {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'issue-1',
    createdAt: overrides.createdAt ?? now,
    createdByUserId: overrides.createdByUserId ?? 'u1',
    sectionKey: overrides.sectionKey,
    severity: overrides.severity ?? 'NORMAL',
    type: overrides.type ?? 'OTHER',
    title: overrides.title ?? 't',
    instruction: overrides.instruction ?? 'i',
    status: overrides.status ?? 'OPEN',
    doneAt: overrides.doneAt,
    origin: overrides.origin ?? 'INTERNAL',
    externalRefId: overrides.externalRefId,
    externalAction: overrides.externalAction,
  };
};

export const makeReportReview = (
  overrides: Partial<ReportReview> = {},
): ReportReview => ({
  status: overrides.status ?? 'DRAFT',
  submittedAt: overrides.submittedAt,
  submittedByUserId: overrides.submittedByUserId,
  reviewedAt: overrides.reviewedAt,
  reviewedByUserId: overrides.reviewedByUserId,
  issues: overrides.issues ?? [],
});

export const makeBaseReport = (overrides: Partial<ReportData> = {}): ReportData => {
  const now = new Date().toISOString();

  const base: ReportData = {
    id: 'report-1',
    createdBy: 'user-1',
    ownerName: 'Owner',
    reportDate: now,
    status: 'DRAFT',
    recipientId: 'recipient-1',
    insurerName: 'מבטחת',
    lineSlipNo: 'LS-1',
    marketRef: 'MR-1',
    insuredName: 'מבוטח',
    plaintiffName: 'תובע',
    plaintiffTitle: 'Plaintiff',
    reportHistory: [],
    selectedTimeline: '',
    filenameTag: '',
    selectedSections: [],
    content: {},
    translatedContent: {},
    expensesItems: [],
    invoiceFiles: [],
    isWaitingForInvoices: false,
    isTranslated: false,
    attachPolicyAsAppendix: false,
    reportReview: undefined,
    hebrewWorkflowStatus: undefined,
    sentAt: undefined,
    updatedAt: now,
    deletedAt: undefined,
    policyFile: undefined,
  };

  return {
    ...base,
    ...overrides,
    reportReview: overrides.reportReview ?? base.reportReview,
  };
};

