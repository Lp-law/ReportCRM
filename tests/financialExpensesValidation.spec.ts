import { describe, it, expect } from 'vitest';
import type {
  FinancialExpenseAttachment,
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
  InsurerRuleset,
} from '../src/types';
import {
  evaluateRuleset,
  validateForReadyForReport,
} from '../src/services/financialExpensesValidation';

const baseSheet = (overrides: Partial<FinancialExpenseSheet> = {}): FinancialExpenseSheet => {
  const now = new Date().toISOString();
  return {
    id: 'sheet1',
    caseId: 'case1',
    insurerId: 'ins1',
    insurerName: 'Insurer',
    periodStart: null,
    periodEnd: null,
    periodLabel: null,
    versionIndex: 1,
    status: 'READY_FOR_REPORT',
    archivedReason: null,
    currency: 'ILS',
    deductibleAmount: 0,
    alreadyPaidAmount: 0,
    infoOnly: false,
    attachedToReportId: null,
    attachedAt: null,
    createdByUserId: 'u1',
    createdAt: now,
    updatedAt: now,
    readyAt: now,
    sheetVersionNumber: 1,
    sheetVersionHash: 'hash1',
    insurerRulesetId: 'r1',
    insurerRulesetVersion: 'v1',
    ...overrides,
  };
};

const makeLine = (overrides: Partial<FinancialExpenseLineItem>): FinancialExpenseLineItem => {
  const now = new Date().toISOString();
  return {
    id: overrides.id || 'line1',
    sheetId: overrides.sheetId || 'sheet1',
    kind: overrides.kind || 'EXPENSE',
    expenseType: overrides.expenseType ?? null,
    providerName: overrides.providerName ?? 'Provider',
    providerId: overrides.providerId ?? null,
    description: overrides.description ?? 'Desc',
    date: overrides.date ?? now,
    quantity: overrides.quantity ?? 1,
    unitPrice: overrides.unitPrice ?? 100,
    vatRate: overrides.vatRate ?? 17,
    isIncludedInRequestedAmount: overrides.isIncludedInRequestedAmount ?? true,
    lineNetAmount: overrides.lineNetAmount ?? 100,
    lineVatAmount: overrides.lineVatAmount ?? 17,
    lineTotalAmount: overrides.lineTotalAmount ?? 117,
    attachmentId: overrides.attachmentId ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
};

const makeAttachment = (
  overrides: Partial<FinancialExpenseAttachment>,
): FinancialExpenseAttachment => {
  const now = new Date().toISOString();
  return {
    id: overrides.id || 'att1',
    sheetId: overrides.sheetId || 'sheet1',
    fileKey: overrides.fileKey || 'file-key',
    originalFileName: overrides.originalFileName || 'file.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    sizeBytes: overrides.sizeBytes ?? 1234,
    uploadedByUserId: overrides.uploadedByUserId || 'u1',
    uploadedAt: overrides.uploadedAt || now,
    linkedLineItemId: overrides.linkedLineItemId ?? null,
  };
};

const strictRuleset: InsurerRuleset = {
  insurerId: 'ins1',
  policyFamily: 'STRICT',
  requiredAttachmentTypes: [],
  requireAttachmentPerLine: true,
  requireAttachmentForExpenseTypes: [],
  amountThresholdRequiringAttachment: null,
  infoOnlyTextVariant: null,
  notesInternal: null,
  rulesetVersion: 'v1',
  updatedAt: new Date().toISOString(),
};

const flexibleRuleset: InsurerRuleset = {
  ...strictRuleset,
  policyFamily: 'FLEXIBLE',
};

const partialRuleset: InsurerRuleset = {
  ...strictRuleset,
  policyFamily: 'PARTIAL',
  requireAttachmentForExpenseTypes: ['EXPERT'],
  amountThresholdRequiringAttachment: 1000,
};

describe('evaluateRuleset', () => {
  it('STRICT without attachment => ERROR blocking READY', () => {
    const sheet = baseSheet();
    const lines = [makeLine({ id: 'l1', attachmentId: null })];
    const attachments: FinancialExpenseAttachment[] = [];

    const issues = evaluateRuleset(sheet, lines, attachments, strictRuleset);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('MISSING_ATTACHMENT_REQUIRED');
    expect(issues.some((i) => i.severity === 'ERROR')).toBe(true);
  });

  it('FLEXIBLE without attachment => WARNING not blocking', () => {
    const sheet = baseSheet();
    const lines = [makeLine({ id: 'l1', attachmentId: null })];
    const attachments: FinancialExpenseAttachment[] = [];

    const issues = evaluateRuleset(sheet, lines, attachments, flexibleRuleset);
    expect(issues.some((i) => i.code === 'MISSING_ATTACHMENT_REQUIRED')).toBe(true);
    expect(issues.every((i) => i.severity !== 'ERROR')).toBe(true);
  });

  it('PARTIAL with threshold', () => {
    const sheet = baseSheet();
    const lowLine = makeLine({
      id: 'l1',
      lineTotalAmount: 500,
      expenseType: 'EXPERT',
    });
    const highLine = makeLine({
      id: 'l2',
      lineTotalAmount: 1500,
      expenseType: 'OTHER',
    });
    const issues = evaluateRuleset(sheet, [lowLine, highLine], [], partialRuleset);
    const lowIssue = issues.find((i) => i.entityId === 'l1');
    const highIssue = issues.find((i) => i.entityId === 'l2');
    expect(lowIssue).toBeTruthy();
    expect(highIssue).toBeTruthy();
  });

  it('INFO_ONLY still enforces attachments under STRICT', () => {
    const sheet = baseSheet({ infoOnly: true });
    const lines = [makeLine({ id: 'l1', attachmentId: null })];
    const issues = evaluateRuleset(sheet, lines, [], strictRuleset);
    expect(issues.some((i) => i.code === 'MISSING_ATTACHMENT_REQUIRED')).toBe(true);
  });
});

describe('validateForReadyForReport', () => {
  it('future date produces WARNING', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sheet = baseSheet();
    const lines = [makeLine({ id: 'l1', date: future })];

    const result = validateForReadyForReport({
      sheet,
      lineItems: lines,
      attachments: [],
      ruleset: strictRuleset,
    });

    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('INVALID_DATE_FUTURE');
    expect(result.decisionLog.warningIssueCodes).toContain('INVALID_DATE_FUTURE');
  });
});


