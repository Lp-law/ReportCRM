import type {
  ExpensesDataSnapshotFinal,
  FinancialExpenseAttachment,
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
  InsurerRuleset,
} from '../types';
import { calculateSheetTotals } from '../utils/financialExpensesCalculator';

export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export type ValidationScope = 'SHEET' | 'LINE_ITEM' | 'ATTACHMENT';

export interface ValidationIssue {
  code: string;
  severity: Severity;
  scope: ValidationScope;
  entityId?: string;
  messageHe: string;
}

export interface DecisionLog {
  evaluatedAt: string;
  insurerId?: string;
  rulesetId?: string;
  rulesetVersion?: string;
  checks: {
    sumsValid: boolean;
    attachmentsOk: boolean;
    requiredFieldsOk: boolean;
    infoOnlyConsistent: boolean;
  };
  blockingIssueCodes: string[];
  warningIssueCodes: string[];
}

export interface ValidationResult {
  issues: ValidationIssue[];
  decisionLog: DecisionLog;
}

const isFutureDate = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
};

const buildIssue = (
  params: Omit<ValidationIssue, 'messageHe'> & { messageHe?: string },
): ValidationIssue => {
  const { messageHe, ...rest } = params;
  if (messageHe) return { ...rest, messageHe };

  // Fallback minimal messages per code
  const defaultMessages: Record<string, string> = {
    MISSING_PROVIDER: 'שם ספק הוצאה חסר בשורה.',
    MISSING_DESCRIPTION: 'תיאור שורה חסר.',
    INVALID_DATE_FUTURE: 'תאריך שורה בעתיד – נא לוודא.',
    INVALID_QUANTITY: 'כמות בשורה חייבת להיות גדולה מ-0.',
    INVALID_UNIT_PRICE: 'מחיר יחידה לא יכול להיות שלילי.',
    INVALID_VAT_RATE: 'שיעור מע״מ לא יכול להיות שלילי.',
    NEGATIVE_AMOUNT: 'סכומי השורה לא יכולים להיות שליליים.',
    MISSING_ATTACHMENT_REQUIRED: 'נדרש נספח לשורה זו לפי מדיניות המבטחת.',
    SHEET_STATUS_INVALID_FOR_READY: 'סטטוס הגיליון אינו מתאים למעבר ל-READY_FOR_REPORT.',
    SHEET_STATUS_INVALID_FOR_ATTACH: 'סטטוס הגיליון אינו מאפשר הצמדה לדוח.',
    SHEET_STATUS_INVALID_FOR_SEND: 'סטטוס הגיליון אינו מאפשר שליחה.',
    SUMS_INCONSISTENT: 'סכומי הגיליון אינם עקביים עם החישוב.',
    INFO_ONLY_INCONSISTENT: 'גיליון מסומן "לידיעה בלבד" אך סכום לבקשה אינו 0.',
    SNAPSHOT_HASH_MISMATCH: 'ה-Hash של ההעתק הסופי אינו תואם את הגיליון העדכני.',
  };

  return {
    ...rest,
    messageHe: defaultMessages[rest.code] || 'שגיאה בבדיקת הגיליון.',
  };
};

const buildDecisionLog = (
  sheet: FinancialExpenseSheet,
  ruleset: InsurerRuleset | undefined,
  issues: ValidationIssue[],
): DecisionLog => {
  const blocking = issues.filter((i) => i.severity === 'ERROR').map((i) => i.code);
  const warnings = issues.filter((i) => i.severity === 'WARNING').map((i) => i.code);

  const sumsValid = !issues.some((i) => i.code === 'SUMS_INCONSISTENT');
  const attachmentsOk = !issues.some(
    (i) => i.code === 'MISSING_ATTACHMENT_REQUIRED' && i.severity === 'ERROR',
  );
  const requiredFieldsOk = !issues.some((i) =>
    ['MISSING_PROVIDER', 'MISSING_DESCRIPTION'].includes(i.code),
  );
  const infoOnlyConsistent = !issues.some((i) => i.code === 'INFO_ONLY_INCONSISTENT');

  return {
    evaluatedAt: new Date().toISOString(),
    insurerId: sheet.insurerId || undefined,
    rulesetId: ruleset?.insurerId,
    rulesetVersion: ruleset?.rulesetVersion,
    checks: {
      sumsValid,
      attachmentsOk,
      requiredFieldsOk,
      infoOnlyConsistent,
    },
    blockingIssueCodes: blocking,
    warningIssueCodes: warnings,
  };
};

// ---------------------------------------------------------------------------
// Line-level basic validation
// ---------------------------------------------------------------------------

const validateLineBasics = (line: FinancialExpenseLineItem): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (line.kind === 'EXPENSE' && !line.providerName) {
    issues.push(
      buildIssue({
        code: 'MISSING_PROVIDER',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  if (!line.description) {
    issues.push(
      buildIssue({
        code: 'MISSING_DESCRIPTION',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  if (isFutureDate(line.date)) {
    issues.push(
      buildIssue({
        code: 'INVALID_DATE_FUTURE',
        severity: 'WARNING',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  if (line.quantity != null && line.quantity <= 0) {
    issues.push(
      buildIssue({
        code: 'INVALID_QUANTITY',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  if (line.unitPrice != null && line.unitPrice < 0) {
    issues.push(
      buildIssue({
        code: 'INVALID_UNIT_PRICE',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  if (line.vatRate != null && line.vatRate < 0) {
    issues.push(
      buildIssue({
        code: 'INVALID_VAT_RATE',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  const amounts = [
    line.lineNetAmount,
    line.lineVatAmount,
    line.lineTotalAmount,
  ].filter((v) => v != null) as number[];

  if (amounts.some((v) => v < 0)) {
    issues.push(
      buildIssue({
        code: 'NEGATIVE_AMOUNT',
        severity: 'ERROR',
        scope: 'LINE_ITEM',
        entityId: line.id,
      }),
    );
  }

  return issues;
};

// ---------------------------------------------------------------------------
// Ruleset evaluation
// ---------------------------------------------------------------------------

export const evaluateRuleset = (
  sheet: FinancialExpenseSheet,
  lineItems: FinancialExpenseLineItem[],
  attachments: FinancialExpenseAttachment[],
  ruleset?: InsurerRuleset,
): ValidationIssue[] => {
  if (!ruleset) return [];
  const issues: ValidationIssue[] = [];
  const attachmentsById: Record<string, FinancialExpenseAttachment> = {};
  attachments.forEach((att) => {
    attachmentsById[att.id] = att;
  });

  const threshold = ruleset.amountThresholdRequiringAttachment ?? null;

  lineItems.forEach((line) => {
    const included = line.isIncludedInRequestedAmount !== false;
    const hasAttachment = Boolean(line.attachmentId && attachmentsById[line.attachmentId]);
    const total = line.lineTotalAmount ?? 0;

    // Determine if this line logically requires an attachment under the ruleset
    let requiresAttachment = false;

    if (ruleset.policyFamily === 'STRICT') {
      if (included && line.kind === 'EXPENSE') {
        if (!threshold || total >= threshold) {
          requiresAttachment = true;
        }
      }
    } else if (ruleset.policyFamily === 'PARTIAL') {
      const typeMatch =
        !!line.expenseType &&
        ruleset.requireAttachmentForExpenseTypes.includes(line.expenseType);
      const overThreshold = !!threshold && total >= threshold;
      if (included && (typeMatch || overThreshold)) {
        requiresAttachment = true;
      }
    } else if (ruleset.policyFamily === 'FLEXIBLE') {
      if (included && line.kind === 'EXPENSE') {
        if (!threshold || total >= threshold) {
          requiresAttachment = true;
        }
      }
    }

    if (requiresAttachment && !hasAttachment) {
      const severity: Severity =
        ruleset.policyFamily === 'FLEXIBLE' ? 'WARNING' : 'ERROR';
      issues.push(
        buildIssue({
          code: 'MISSING_ATTACHMENT_REQUIRED',
          severity,
          scope: 'LINE_ITEM',
          entityId: line.id,
          messageHe:
            severity === 'ERROR'
              ? 'נדרש נספח לשורה זו לפי מדיניות המבטחת.'
              : 'מומלץ לצרף נספח לשורה זו לפי מדיניות המבטחת.',
        }),
      );
    }
  });

  // Placeholder for requiredAttachmentTypes – אין לנו כרגע טיפוס נספח לפי סוג
  if (ruleset.requiredAttachmentTypes.length > 0) {
    issues.push(
      buildIssue({
        code: 'ATTACHMENT_TYPES_NOT_ENFORCED',
        severity: 'INFO',
        scope: 'SHEET',
        messageHe:
          'מדיניות המבטחת כוללת דרישות לסוגי נספחים, אך הן אינן נאכפות עדיין במערכת.',
      }),
    );
  }

  // INFO_ONLY: גם אם infoOnly=true, הכללים של המבטחת עדיין תקפים (חוסם STRICT/PARTIAL)
  if (sheet.infoOnly && issues.length && ruleset.policyFamily !== 'FLEXIBLE') {
    // לא מוסיפים קוד חדש – עצם קיום MISSING_ATTACHMENT_REQUIRED הוא כבר חוסם
  }

  return issues;
};

// ---------------------------------------------------------------------------
// High-level validation modes
// ---------------------------------------------------------------------------

interface ValidateContext {
  sheet: FinancialExpenseSheet;
  lineItems: FinancialExpenseLineItem[];
  attachments: FinancialExpenseAttachment[];
  ruleset?: InsurerRuleset;
  snapshot?: ExpensesDataSnapshotFinal;
}

const validateCommon = (ctx: ValidateContext): ValidationResult => {
  const { sheet, lineItems, attachments, ruleset } = ctx;
  const issues: ValidationIssue[] = [];

  // Line-level basics
  lineItems.forEach((line) => {
    issues.push(...validateLineBasics(line));
  });

  // Sheet-level sums & INFO_ONLY consistency
  const totals = calculateSheetTotals(sheet, lineItems);
  if (sheet.infoOnly && totals.amountToRequest !== 0) {
    issues.push(
      buildIssue({
        code: 'INFO_ONLY_INCONSISTENT',
        severity: 'ERROR',
        scope: 'SHEET',
      }),
    );
  }

  // We currently rely only on calculator outcomes – no stored totals to cross-check
  // Placeholder for future "SUMS_INCONSISTENT" if נשמור totals נפרדים בגיליון.

  // Ruleset
  issues.push(...evaluateRuleset(sheet, lineItems, attachments, ruleset));

  const decisionLog = buildDecisionLog(sheet, ruleset, issues);
  return { issues, decisionLog };
};

export const validateForDraft = (ctx: ValidateContext): ValidationResult => {
  // Draft – מחזירים כל הבעיות, האחריות על הקורא להחליט אם לחסום
  return validateCommon(ctx);
};

export const validateForReadyForReport = (
  ctx: ValidateContext,
): ValidationResult => {
  const result = validateCommon(ctx);
  const { sheet } = ctx;

  if (sheet.status !== 'READY_FOR_REPORT') {
    result.issues.push(
      buildIssue({
        code: 'SHEET_STATUS_INVALID_FOR_READY',
        severity: 'ERROR',
        scope: 'SHEET',
      }),
    );
  }

  const decisionLog = buildDecisionLog(sheet, ctx.ruleset, result.issues);
  return { ...result, decisionLog };
};

export const validateForAttachToReport = (
  ctx: ValidateContext,
): ValidationResult => {
  const result = validateCommon(ctx);
  const { sheet } = ctx;

  if (sheet.status !== 'READY_FOR_REPORT' && sheet.status !== 'ATTACHED_TO_REPORT') {
    result.issues.push(
      buildIssue({
        code: 'SHEET_STATUS_INVALID_FOR_ATTACH',
        severity: 'ERROR',
        scope: 'SHEET',
      }),
    );
  }

  const decisionLog = buildDecisionLog(sheet, ctx.ruleset, result.issues);
  return { ...result, decisionLog };
};

export const validateForSend = (ctx: ValidateContext): ValidationResult => {
  const result = validateCommon(ctx);
  const { sheet, snapshot } = ctx;

  if (sheet.status !== 'ATTACHED_TO_REPORT') {
    result.issues.push(
      buildIssue({
        code: 'SHEET_STATUS_INVALID_FOR_SEND',
        severity: 'ERROR',
        scope: 'SHEET',
      }),
    );
  }

  if (snapshot) {
    if (snapshot.sheetVersionHash !== sheet.sheetVersionHash) {
      result.issues.push(
        buildIssue({
          code: 'SNAPSHOT_HASH_MISMATCH',
          severity: 'ERROR',
          scope: 'SHEET',
        }),
      );
    }
  }

  const decisionLog = buildDecisionLog(sheet, ctx.ruleset, result.issues);
  return { ...result, decisionLog };
};


