import type {
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
} from '../types';
import {
  calculateLineNet,
  calculateLineTotal,
  calculateLineVat,
  calculateSheetTotals,
  type SheetTotals,
} from './financialExpensesCalculator';

const formatDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatAmount = (value: number | null | undefined): string => {
  const num = value ?? 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getLineTotal = (line: FinancialExpenseLineItem): number => {
  if (line.lineTotalAmount != null) return line.lineTotalAmount;

  const net =
    line.lineNetAmount != null
      ? line.lineNetAmount
      : calculateLineNet(line.quantity ?? 0, line.unitPrice ?? 0);

  const vat =
    line.lineVatAmount != null
      ? line.lineVatAmount
      : calculateLineVat(net, line.vatRate ?? 0);

  return calculateLineTotal(net, vat);
};

export interface ExpensesRenderOptions {
  isNewLine?: (line: FinancialExpenseLineItem) => boolean;
  isHistoricalLine?: (line: FinancialExpenseLineItem) => boolean;
  newExpensesTotal?: number;
}

export const renderExpensesTableText = (
  sheet: FinancialExpenseSheet,
  lineItems: FinancialExpenseLineItem[],
  opts?: ExpensesRenderOptions,
): { text: string; totals: SheetTotals } => {
  const totals = calculateSheetTotals(sheet, lineItems);

  const headerLines: string[] = [
    `Expenses Table – Case ${sheet.caseId}`,
    '',
    `Deductible: ₪${formatAmount(sheet.deductibleAmount ?? 0)}`,
    `Payments already made: ₪${formatAmount(sheet.alreadyPaidAmount ?? 0)}`,
    `Amount to request: ₪${formatAmount(totals.amountToRequest)}`,
    '',
    'Expenses:',
  ];

  const expenseLines: string[] = [];
  const adjustmentLines: string[] = [];
  let computedNewTotal = 0;

  lineItems.forEach((line) => {
    const date = formatDate(line.date || null);
    const provider = line.providerName || '';
    const description = line.description || '';
    const kindLabel =
      line.kind === 'EXPENSE'
        ? 'Expense'
        : line.kind === 'COMPENSATION'
          ? line.compensationSource === 'COURT'
            ? 'Compensation pursuant to a judgment'
            : 'Compensation pursuant to a settlement'
          : 'Adjustment';

    const isNew = opts?.isNewLine?.(line) ?? false;
    const isHistorical = opts?.isHistoricalLine?.(line) ?? false;

    const total = formatAmount(getLineTotal(line));
    const vatPart =
      line.vatRate != null
        ? `, VAT ${line.vatRate}%`
        : '';
    const includedPart =
      line.isIncludedInRequestedAmount === false
        ? ' (not included in request)'
        : '';

    const labelPrefix = isNew ? '[חדש] ' : isHistorical ? '[היסטוריה] ' : '';

    const base = `• ${date || '-'} – ${labelPrefix}${description}${
      provider ? ` (${provider})` : ''
    } – ₪${total} (${kindLabel}${vatPart})${includedPart}`;

    if (line.kind === 'EXPENSE') {
      const totalNum = getLineTotal(line);
      if (isNew) {
        computedNewTotal += totalNum;
      }
      expenseLines.push(base);
    } else {
      adjustmentLines.push(base);
    }
  });

  if (!expenseLines.length) {
    expenseLines.push('• No expense items.');
  }

  const newTotal =
    opts && typeof opts.newExpensesTotal === 'number'
      ? opts.newExpensesTotal
      : computedNewTotal;

  const bodyLines: string[] = [
    ...headerLines,
    ...expenseLines,
    '',
    'Adjustments and compensations:',
    ...(adjustmentLines.length ? adjustmentLines : ['• No adjustments or compensations.']),
    '',
    ...(newTotal > 0
      ? [`Current report expenses only: ₪${formatAmount(newTotal)}`]
      : []),
    `Total gross expenses: ₪${formatAmount(totals.grossExpensesTotal)}`,
    `Total deductions (Deductible + Payments already made + adjustments): ₪${formatAmount(totals.adjustmentsTotal)}`,
    `Amount to request: ₪${formatAmount(totals.amountToRequest)}`,
  ];

  return {
    text: bodyLines.join('\n'),
    totals,
  };
};

export const renderExpensesTableHtml = (
  sheet: FinancialExpenseSheet,
  lineItems: FinancialExpenseLineItem[],
  opts?: ExpensesRenderOptions,
): { html: string; totals: SheetTotals } => {
  const totals = calculateSheetTotals(sheet, lineItems);
  const noPaymentRequested = totals.amountToRequest <= 0;

  const rows: string[] = [];

  const addRow = (
    label: string,
    amount: number | null | undefined,
    rowOpts?: { isSummary?: boolean; isTotal?: boolean; rowClass?: string },
  ) => {
    const clsBase = rowOpts?.isTotal
      ? 'total-balance-row'
      : rowOpts?.isSummary
        ? 'summary-row'
        : '';
    const extraCls = rowOpts?.rowClass ?? '';
    const cls = `${clsBase} ${extraCls}`.trim();
    rows.push(
      `<tr class="${cls}"><td>${escapeHtml(
        label,
      )}</td><td class="amount-cell">₪${formatAmount(amount ?? 0)}</td></tr>`,
    );
  };

  // Aggregate: total expenses so far (included expenses)
  const includedLines = lineItems.filter((l) => l.kind === 'EXPENSE');
  let computedNewTotal = 0;
  const includedTotal = includedLines.reduce((acc, line) => {
    const total = getLineTotal(line);
    const isNew = opts?.isNewLine?.(line) ?? false;
    const isHistorical = opts?.isHistoricalLine?.(line) ?? false;
    if (isNew) {
      computedNewTotal += total;
    }
    const provider = line.providerName ? ` (${line.providerName})` : '';
    const baseLabel = line.description
      ? `${line.description}${provider}`
      : provider || 'Expense';
    const labelPrefix = isNew ? 'חדש – ' : isHistorical ? 'היסטוריה – ' : '';
    const label = `${labelPrefix}${baseLabel}`;
    const rowClass = isNew
      ? 'expense-row-new'
      : isHistorical
        ? 'expense-row-history'
        : '';
    addRow(label, total, { rowClass });
    return acc + total;
  }, 0);
  const deductible = sheet.deductibleAmount ?? 0;
  const deductibleExceedsExpenses = includedTotal > 0 && deductible > includedTotal;

  const compensationLines = lineItems.filter((l) => l.kind === 'COMPENSATION');
  compensationLines.forEach((line) => {
    const baseLabel =
      line.compensationSource === 'COURT'
        ? 'Court-awarded compensation'
        : 'Settlement compensation';
    addRow(baseLabel, getLineTotal(line));
  });

  addRow('Total expenses so far', includedTotal, { isSummary: true });
  const newTotal =
    opts && typeof opts.newExpensesTotal === 'number'
      ? opts.newExpensesTotal
      : computedNewTotal;
  if (newTotal > 0) {
    addRow('Current report expenses only', newTotal, { isSummary: true });
  }
  addRow('Deductible', deductible, { isSummary: true });
  addRow('Payments already made', sheet.alreadyPaidAmount ?? 0, { isSummary: true });
  addRow(
    noPaymentRequested ? 'Total Balance Due (no payment requested)' : 'Total Balance Due',
    totals.amountToRequest,
    { isTotal: true },
  );

  const tableHtml = [
    '<div class="expenses-table-wrapper">',
    '<table class="expenses-table">',
    '<thead>',
    '<tr><th>Expenses</th><th class="amount-cell">Amount (₪)</th></tr>',
    '</thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
    '</div>',
  ].join('');

  const hasSettlementComp = lineItems.some(
    (l) => l.kind === 'COMPENSATION' && l.compensationSource !== 'COURT',
  );
  const hasJudgmentComp = lineItems.some(
    (l) => l.kind === 'COMPENSATION' && l.compensationSource === 'COURT',
  );

  const formattedAmountToRequest = `₪${formatAmount(totals.amountToRequest)}`;

  let note: string;

  if (hasJudgmentComp) {
    note =
      '<p class="expenses-payment-note">Pursuant to the judgment rendered in this matter, we kindly request that the Insurer arrange payment of the total amount set out in the attached Expenses Table, in order to bring this claim to a conclusion.<br/><br/><strong>Payment is required within 30 days of receipt of this report.</strong></p>';
  } else if (hasSettlementComp) {
    if (noPaymentRequested) {
      note =
        '<p class="expenses-payment-note">Although a settlement has been agreed in principle, the total expenses and compensation fall within the applicable deductible. Accordingly, no payment is required from the Insurer in respect of this claim.</p>';
    } else {
      note = `<p class="expenses-payment-note">Should the Insurer approve the settlement, we would be obliged if the Insurer could arrange payment of ${formattedAmountToRequest} to the Broker’s bank account in order to bring this claim to a conclusion. This amount represents an all-inclusive settlement, covering both the agreed compensation and the associated expenses. In the event that the settlement is not approved, no payment is required at this stage.</p>`;
    }
  } else {
    // Fallback: original generic wording, updated to ₪
    note = noPaymentRequested
      ? '<p class="expenses-payment-note">Given that the deductible exceeds the total expenses incurred in this matter, the Insurer is not required to make any payment in respect of this claim.</p>'
      : `<p class="expenses-payment-note">Accordingly, we would appreciate it if the Insurer could transfer the amount of ${formattedAmountToRequest} to the Broker’s bank account.</p>`;
  }

  const currencyFootnote =
    '<p class="expenses-payment-note">All amounts are stated in New Israeli Shekels (₪).</p>';

  return {
    html: tableHtml + note + currencyFootnote,
    totals,
  };
};

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');



