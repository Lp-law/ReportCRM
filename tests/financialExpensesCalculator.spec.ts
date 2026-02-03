import { describe, it, expect } from 'vitest';
import type { FinancialExpenseSheet, FinancialExpenseLineItem } from '../src/types';
import {
  calculateLineNet,
  calculateLineVat,
  calculateLineTotal,
  calculateSheetTotals,
} from '../src/utils/financialExpensesCalculator';

const baseSheet: FinancialExpenseSheet = {
  id: 'sheet1',
  caseId: 'case1',
  insurerId: null,
  insurerName: null,
  periodStart: null,
  periodEnd: null,
  periodLabel: null,
  versionIndex: 1,
  status: 'DRAFT',
  archivedReason: null,
  currency: 'ILS',
  deductibleAmount: 0,
  alreadyPaidAmount: 0,
  infoOnly: false,
  attachedToReportId: null,
  attachedAt: null,
  createdByUserId: 'u1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  readyAt: null,
  sheetVersionNumber: 1,
  sheetVersionHash: '',
  insurerRulesetId: null,
  insurerRulesetVersion: null,
};

const makeLine = (overrides: Partial<FinancialExpenseLineItem>): FinancialExpenseLineItem => ({
  id: overrides.id || 'line1',
  sheetId: overrides.sheetId || 'sheet1',
  kind: overrides.kind || 'EXPENSE',
  expenseType: overrides.expenseType ?? null,
  providerName: overrides.providerName ?? 'Provider',
  providerId: overrides.providerId ?? null,
  description: overrides.description ?? 'Desc',
  date: overrides.date ?? null,
  quantity: overrides.quantity ?? 1,
  unitPrice: overrides.unitPrice ?? 100,
  vatRate: overrides.vatRate ?? 17,
  isIncludedInRequestedAmount: overrides.isIncludedInRequestedAmount ?? true,
  lineNetAmount: overrides.lineNetAmount ?? null,
  lineVatAmount: overrides.lineVatAmount ?? null,
  lineTotalAmount: overrides.lineTotalAmount ?? null,
  attachmentId: overrides.attachmentId ?? null,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe('financialExpensesCalculator - line level', () => {
  it('calculates line net, vat and total with rounding', () => {
    const net = calculateLineNet(3, 33.3333);
    const vat = calculateLineVat(net, 17);
    const total = calculateLineTotal(net, vat);

    expect(net).toBeCloseTo(99.999, 2);
    expect(vat).toBeCloseTo(17.0, 2);
    expect(total).toBeCloseTo(117.0, 2);
  });
});

describe('financialExpensesCalculator - sheet level', () => {
  it('handles multiple lines and rounding correctly', () => {
    const sheet = { ...baseSheet };
    const lines: FinancialExpenseLineItem[] = [
      makeLine({ id: 'l1', quantity: 1, unitPrice: 100, vatRate: 17 }),
      makeLine({ id: 'l2', quantity: 2, unitPrice: 50.005, vatRate: 17 }),
    ];

    const totals = calculateSheetTotals(sheet, lines);
    expect(totals.grossExpensesTotal).toBeGreaterThan(0);
    expect(totals.amountToRequest).toBeGreaterThan(0);
  });

  it('deductible > includedExpenses leads to amountToRequest = 0', () => {
    const sheet: FinancialExpenseSheet = {
      ...baseSheet,
      deductibleAmount: 1000,
      alreadyPaidAmount: 0,
    };
    const lines: FinancialExpenseLineItem[] = [
      makeLine({ id: 'l1', quantity: 1, unitPrice: 100, vatRate: 0 }),
    ];

    const totals = calculateSheetTotals(sheet, lines);
    expect(totals.amountToRequest).toBe(0);
  });

  it('infoOnly true forces amountToRequest = 0', () => {
    const sheet: FinancialExpenseSheet = {
      ...baseSheet,
      infoOnly: true,
    };
    const lines: FinancialExpenseLineItem[] = [
      makeLine({ id: 'l1', quantity: 1, unitPrice: 100, vatRate: 0 }),
    ];

    const totals = calculateSheetTotals(sheet, lines);
    expect(totals.amountToRequest).toBe(0);
    expect(totals.infoOnlyApplied).toBe(true);
  });

  it('excluded lines do not enter includedExpensesTotal', () => {
    const sheet: FinancialExpenseSheet = {
      ...baseSheet,
      deductibleAmount: 0,
      alreadyPaidAmount: 0,
    };
    const lines: FinancialExpenseLineItem[] = [
      makeLine({ id: 'l1', quantity: 1, unitPrice: 100, isIncludedInRequestedAmount: true }),
      makeLine({ id: 'l2', quantity: 1, unitPrice: 200, isIncludedInRequestedAmount: false }),
    ];

    const totals = calculateSheetTotals(sheet, lines);
    expect(totals.includedExpensesTotal).toBeLessThan(totals.grossExpensesTotal);
  });
});


