import Decimal from 'decimal.js-light';
import type {
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
} from '../types';

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

const toDecimal = (value: number | string | null | undefined): Decimal =>
  new Decimal(value ?? 0);

const roundMoney = (d: Decimal): number =>
  d.toDecimalPlaces(2).toNumber();

export const calculateLineNet = (
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
): number => {
  const q = toDecimal(quantity);
  const p = toDecimal(unitPrice);
  return roundMoney(q.mul(p));
};

export const calculateLineVat = (
  net: number | null | undefined,
  vatRate: number | null | undefined,
): number => {
  const n = toDecimal(net);
  const rate = toDecimal(vatRate).div(100);
  return roundMoney(n.mul(rate));
};

export const calculateLineTotal = (
  net: number | null | undefined,
  vat: number | null | undefined,
): number => {
  const n = toDecimal(net);
  const v = toDecimal(vat);
  return roundMoney(n.add(v));
};

const getLineTotalDecimal = (line: FinancialExpenseLineItem): Decimal => {
  if (line.lineTotalAmount != null) {
    return toDecimal(line.lineTotalAmount);
  }
  const net = line.lineNetAmount != null
    ? line.lineNetAmount
    : calculateLineNet(line.quantity ?? 0, line.unitPrice ?? 0);
  const vat = line.lineVatAmount != null
    ? line.lineVatAmount
    : calculateLineVat(net, line.vatRate ?? 0);
  return toDecimal(calculateLineTotal(net, vat));
};

export interface SheetTotals {
  grossExpensesTotal: number;
  includedExpensesTotal: number;
  vatTotal: number;
  adjustmentsTotal: number;
  amountBeforeInfoOnly: number;
  amountToRequest: number;
  infoOnlyApplied: boolean;
}

export const calculateSheetTotals = (
  sheet: FinancialExpenseSheet,
  lineItems: FinancialExpenseLineItem[],
): SheetTotals => {
  const gross = lineItems.reduce((acc, line) => {
    return acc.add(getLineTotalDecimal(line));
  }, new Decimal(0));

  const included = lineItems.reduce((acc, line) => {
    if (line.isIncludedInRequestedAmount === false) return acc;
    return acc.add(getLineTotalDecimal(line));
  }, new Decimal(0));

  const vatTotal = lineItems.reduce((acc, line) => {
    if (line.lineVatAmount == null) return acc;
    return acc.add(toDecimal(line.lineVatAmount));
  }, new Decimal(0));

  const adjustmentLines = lineItems.filter(
    (line) =>
      (line.kind === 'ADJUSTMENT' || line.kind === 'COMPENSATION') &&
      line.isIncludedInRequestedAmount === false,
  );

  const adjustmentsFromLines = adjustmentLines.reduce((acc, line) => {
    return acc.add(getLineTotalDecimal(line));
  }, new Decimal(0));

  const deductible = toDecimal(sheet.deductibleAmount ?? 0);
  const alreadyPaid = toDecimal(sheet.alreadyPaidAmount ?? 0);

  const adjustmentsTotalDecimal = deductible
    .add(alreadyPaid)
    .add(adjustmentsFromLines);

  const beforeInfoOnly = included.sub(adjustmentsTotalDecimal);

  const infoOnlyApplied = Boolean(sheet.infoOnly);

  // decimal.js-light בגרסה הנוכחית לא מספקת Decimal.max כ‑static method,
  // ולכן נחשב את המקסימום ידנית כדי להימנע מקריסה בכניסה לעורך.
  const amountToRequestDecimal = infoOnlyApplied
    ? new Decimal(0)
    : beforeInfoOnly.greaterThan(0)
      ? beforeInfoOnly
      : new Decimal(0);

  return {
    grossExpensesTotal: roundMoney(gross),
    includedExpensesTotal: roundMoney(included),
    vatTotal: roundMoney(vatTotal),
    adjustmentsTotal: roundMoney(adjustmentsTotalDecimal),
    amountBeforeInfoOnly: roundMoney(beforeInfoOnly),
    amountToRequest: roundMoney(amountToRequestDecimal),
    infoOnlyApplied,
  };
};


