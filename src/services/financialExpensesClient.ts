import type {
  FinancialExpenseAttachment,
  FinancialExpenseAuditLogEntry,
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
  FinancialPaymentEvent,
  InsurerRuleset,
  ReportData,
  User,
  LidorFinancialKpis,
  FinancialExceptionStatusValue,
  FinancialExceptionAnnotation,
} from '../types';
import {
  addFinancialExpenseAttachment,
  addFinancialExpenseLineItem,
  createFinancialExpenseSheet,
  createFinancialPaymentEvent,
  deleteFinancialExpenseLineItem,
  getFinancialExpenseSheetWithRelations,
  getInsurerRulesetById,
  getOfficialSheetIdForCase,
  listFinancialExpenseSheets,
  recordAdminEditAfterPaid,
  recordSheetDeletionByAdmin as recordSheetDeletionByAdminData,
  listFinancialPaymentEventsForCase,
  linkAttachmentToLineItem,
  queryFinancialSheetsForLidor,
  getLidorFinancialCounts,
  getAuditEventsForSheet,
  getLidorFinancialKpis,
  addExceptionStatusAnnotation,
  getLatestExceptionStatusForSheet,
  computePaidToDateForCase,
  recordSheetReadyAttempt,
  revertSheetToDraft,
  softDeleteFinancialPaymentEvent,
  updateFinancialExpenseLineItem,
  updateFinancialExpenseSheetMeta,
  deleteFinancialExpenseSheet,
  type CreateFinancialExpenseAttachmentInput,
  type CreateFinancialExpenseLineItemInput,
  type CreateFinancialExpenseSheetInput,
  type CreateFinancialPaymentEventInput,
  type SheetReadyAttemptInput,
  type LinkAttachmentToLineItemInput,
  type UpdateFinancialExpenseLineItemInput,
  type UpdateFinancialExpenseSheetMetaInput,
  type LidorSheetsQueryParams,
} from './financialExpensesData';
import { normalizeOdakanitNo } from '../utils/normalizeOdakanitNo';
import type { ExpensesRenderOptions } from '../utils/expensesTableText';

const SNAPSHOT_CACHE_TTL_MS = 5000;
const snapshotCache = new Map<
  string,
  { ts: number; value: {
    effectiveSheet: FinancialExpenseSheet;
    currentLines: FinancialExpenseLineItem[];
    historicalLines: FinancialExpenseLineItem[];
    allLines: FinancialExpenseLineItem[];
    opts: ExpensesRenderOptions;
  } | null }
>();

export interface SheetWithRelations {
  sheet: FinancialExpenseSheet;
  lineItems: FinancialExpenseLineItem[];
  attachments: FinancialExpenseAttachment[];
}

const asActor = (user: User) => ({
  actorUserId: user.id,
  actorRole: user.role,
});

export const financialExpensesClient = {
  async listSheets(): Promise<FinancialExpenseSheet[]> {
    return listFinancialExpenseSheets();
  },

  async listPaymentsForCase(caseId: string): Promise<FinancialPaymentEvent[]> {
    return listFinancialPaymentEventsForCase(caseId);
  },

  getPaidToDateForSheet(sheet: FinancialExpenseSheet): number {
    const asOfIso = sheet.updatedAt || sheet.createdAt || new Date().toISOString();
    return computePaidToDateForCase(sheet.caseId, asOfIso, sheet.alreadyPaidAmount ?? 0);
  },

  async getLatestSheetForCase(caseId: string): Promise<SheetWithRelations | null> {
    const officialId = getOfficialSheetIdForCase(caseId);
    if (officialId) return getFinancialExpenseSheetWithRelations(officialId);
    return null;
  },

  /**
   * Detect whether a given caseId is already using the new financial model.
   * Rule: אם קיימים financial_expense_sheets עבור caseId → מודל חדש, אחרת ישן.
   */
  async isNewFinancialModel(caseId: string | undefined | null): Promise<boolean> {
    if (!caseId) return false;
    const sheets = await listFinancialExpenseSheets();
    const normalized = normalizeOdakanitNo(caseId);
    return sheets.some((s) => normalizeOdakanitNo(s.caseId) === normalized);
  },

  /**
   * Developer guard: detect mixed usage of legacy expenses fields together with the new model.
   * לא מציג הודעה למשתמש, רק לוג למפתחים.
   */
  logIfMixedModel(report: ReportData) {
    const usesNew = Boolean(report.expensesSheetId);
    if (!usesNew) return;
    const hasLegacy =
      (report.expensesItems && report.expensesItems.length > 0) ||
      !!report.expenseWorksheet ||
      !!report.expensesSum;
    if (hasLegacy) {
      // eslint-disable-next-line no-console
      console.error(
        '[FinancialExpenses] Mixed model detected for report',
        report.id,
        '– expensesSheetId is set but legacy expenses fields are also populated.',
      );
    }
  },

  async getSheet(sheetId: string): Promise<SheetWithRelations | null> {
    return getFinancialExpenseSheetWithRelations(sheetId);
  },

  async getRulesetForSheet(sheet: FinancialExpenseSheet): Promise<InsurerRuleset> {
    const key = sheet.insurerRulesetId || sheet.insurerId || 'default';
    const existing = key ? getInsurerRulesetById(key) : null;
    if (existing) return existing;

    const now = new Date().toISOString();
    return {
      insurerId: key || 'default',
      policyFamily: 'FLEXIBLE',
      requiredAttachmentTypes: [],
      requireAttachmentPerLine: false,
      requireAttachmentForExpenseTypes: [],
      amountThresholdRequiringAttachment: null,
      infoOnlyTextVariant: null,
      notesInternal: null,
      rulesetVersion: 'default',
      updatedAt: now,
    };
  },

  async createSheet(
    user: User,
    input: Omit<CreateFinancialExpenseSheetInput, 'createdByUserId'>,
  ): Promise<FinancialExpenseSheet> {
    const payload: CreateFinancialExpenseSheetInput = {
      ...input,
      createdByUserId: user.id,
    };
    return createFinancialExpenseSheet(payload);
  },

  async createPaymentEvent(
    _user: User,
    input: CreateFinancialPaymentEventInput,
  ): Promise<FinancialPaymentEvent> {
    // בשלב זה איננו שומרים מי הזין את התשלום בפועל – רק את פרטי התשלום עצמם.
    return createFinancialPaymentEvent(input);
  },

  async updateSheetMeta(
    user: User,
    sheetId: string,
    patch: UpdateFinancialExpenseSheetMetaInput['patch'],
  ): Promise<FinancialExpenseSheet | null> {
    const payload: UpdateFinancialExpenseSheetMetaInput = {
      sheetId,
      ...asActor(user),
      patch,
    };
    return updateFinancialExpenseSheetMeta(payload);
  },

  async addLineItem(
    user: User,
    sheetId: string,
    item: Omit<CreateFinancialExpenseLineItemInput, 'sheetId' | 'actorUserId' | 'actorRole'>,
  ): Promise<FinancialExpenseLineItem | null> {
    const payload: CreateFinancialExpenseLineItemInput = {
      ...item,
      sheetId,
      ...asActor(user),
    };
    return addFinancialExpenseLineItem(payload);
  },

  async updateLineItem(
    user: User,
    sheetId: string,
    lineItemId: string,
    patch: UpdateFinancialExpenseLineItemInput['patch'],
  ): Promise<FinancialExpenseLineItem | null> {
    const payload: UpdateFinancialExpenseLineItemInput = {
      sheetId,
      lineItemId,
      ...asActor(user),
      patch,
    };
    return updateFinancialExpenseLineItem(payload);
  },

  async deleteLineItem(
    user: User,
    sheetId: string,
    lineItemId: string,
  ): Promise<boolean> {
    const payload = {
      sheetId,
      lineItemId,
      ...asActor(user),
    };
    return deleteFinancialExpenseLineItem(payload);
  },

  async softDeletePaymentEvent(id: string): Promise<FinancialPaymentEvent | null> {
    return softDeleteFinancialPaymentEvent(id);
  },

  buildCumulativeExpensesSnapshot(
    sheetId: string,
    asOfIso?: string,
  ): {
    effectiveSheet: FinancialExpenseSheet;
    currentLines: FinancialExpenseLineItem[];
    historicalLines: FinancialExpenseLineItem[];
    allLines: FinancialExpenseLineItem[];
    opts: ExpensesRenderOptions;
  } | null {
    const cacheKey = `${sheetId}::${asOfIso || 'now'}`;
    const cached = snapshotCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.ts < SNAPSHOT_CACHE_TTL_MS) {
      return cached.value;
    }

    const relations = getFinancialExpenseSheetWithRelations(sheetId);
    if (!relations) {
      snapshotCache.set(cacheKey, { ts: now, value: null });
      return null;
    }

    const baseSheet = relations.sheet;
    const asOf =
      asOfIso || baseSheet.updatedAt || baseSheet.createdAt || new Date().toISOString();
    const paidToDate = computePaidToDateForCase(
      baseSheet.caseId,
      asOf,
      baseSheet.alreadyPaidAmount ?? 0,
    );
    const effectiveSheet: FinancialExpenseSheet = {
      ...baseSheet,
      alreadyPaidAmount: paidToDate,
    };

    const allSheets = listFinancialExpenseSheets();
    const normalizedCase = normalizeOdakanitNo(baseSheet.caseId);
    const asOfTime = new Date(asOf).getTime();

    const previousSheets = allSheets.filter((s) => {
      if (s.id === baseSheet.id) return false;
      if (normalizeOdakanitNo(s.caseId) !== normalizedCase) return false;
      const t = new Date(s.updatedAt || s.createdAt).getTime();
      if (Number.isNaN(t) || Number.isNaN(asOfTime)) return true;
      return t <= asOfTime;
    });

    const historicalLines: FinancialExpenseLineItem[] = [];

    previousSheets.forEach((s) => {
      const rel = getFinancialExpenseSheetWithRelations(s.id);
      if (!rel) return;
      rel.lineItems.forEach((li) => {
        if (li.kind === 'EXPENSE') {
          historicalLines.push(li);
        }
      });
    });

    const currentLines = relations.lineItems;
    const allLines = [...historicalLines, ...currentLines];

    // מיון יציב: לפי date, אחר כך לפי createdAt, ואז לפי sheetId+id
    const sortedAllLines = [...allLines].sort((a, b) => {
      const getTime = (line: FinancialExpenseLineItem): number => {
        const d = line.date ? new Date(line.date).getTime() : NaN;
        if (!Number.isNaN(d)) return d;
        const c = (line as any).createdAt ? new Date((line as any).createdAt).getTime() : NaN;
        if (!Number.isNaN(c)) return c;
        return 0;
      };
      const ta = getTime(a);
      const tb = getTime(b);
      if (ta !== tb) return ta - tb;
      const keyA = `${a.sheetId || ''}-${a.id}`;
      const keyB = `${b.sheetId || ''}-${b.id}`;
      return keyA.localeCompare(keyB);
    });

    const opts: ExpensesRenderOptions = {
      isNewLine: (line) => line.kind === 'EXPENSE' && line.sheetId === baseSheet.id,
      isHistoricalLine: (line) => line.kind === 'EXPENSE' && line.sheetId !== baseSheet.id,
    };

    const result = {
      effectiveSheet,
      currentLines,
      historicalLines,
      allLines: sortedAllLines,
      opts,
    };

    snapshotCache.set(cacheKey, { ts: now, value: result });
    return result;
  },

  async deleteSheet(sheetId: string): Promise<void> {
    deleteFinancialExpenseSheet(sheetId);
  },

  async addAttachment(
    user: User,
    sheetId: string,
    input: Omit<CreateFinancialExpenseAttachmentInput, 'sheetId' | 'uploadedByUserId'>,
  ): Promise<FinancialExpenseAttachment | null> {
    const payload: CreateFinancialExpenseAttachmentInput = {
      ...input,
      sheetId,
      uploadedByUserId: user.id,
    };
    return addFinancialExpenseAttachment(payload);
  },

  async linkAttachmentToLineItem(
    user: User,
    sheetId: string,
    attachmentId: string,
    lineItemId: string | null,
  ): Promise<FinancialExpenseAttachment | null> {
    const payload: LinkAttachmentToLineItemInput = {
      sheetId,
      attachmentId,
      lineItemId,
      ...asActor(user),
    };
    return linkAttachmentToLineItem(payload);
  },

  async recordReadyAttempt(
    user: User,
    input: Omit<SheetReadyAttemptInput, 'actorUserId' | 'actorRole'>,
  ): Promise<FinancialExpenseSheet | null> {
    const payload: SheetReadyAttemptInput = {
      ...input,
      actorUserId: user.id,
      actorRole: user.role,
    };
    return recordSheetReadyAttempt(payload);
  },

  async revertSheetToDraft(user: User, sheetId: string): Promise<FinancialExpenseSheet | null> {
    return revertSheetToDraft({
      sheetId,
      actorUserId: user.id,
      actorRole: user.role,
    });
  },

  recordAdminEditAfterPaid(user: User, sheetId: string, reason: string): void {
    recordAdminEditAfterPaid(sheetId, user.id, user.role, reason);
  },

  recordSheetDeletionByAdmin(user: User, sheetId: string, reason: string): void {
    recordSheetDeletionByAdminData(sheetId, user.id, user.role, reason);
  },

  async listSheetsForLidor(
    user: User,
    params: LidorSheetsQueryParams,
    reports: ReportData[],
  ) {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return queryFinancialSheetsForLidor(params, reports);
  },

  async getLidorCounts(user: User, reports: ReportData[]) {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return getLidorFinancialCounts(reports);
  },

  async getLidorKpis(user: User, reports: ReportData[]): Promise<LidorFinancialKpis> {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return getLidorFinancialKpis(reports);
  },

  async getExceptionStatusForSheet(
    user: User,
    sheetId: string,
  ): Promise<FinancialExceptionStatusValue | null> {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return getLatestExceptionStatusForSheet(sheetId);
  },

  async setExceptionStatusForSheet(
    user: User,
    sheetId: string,
    value: FinancialExceptionStatusValue,
  ): Promise<FinancialExceptionAnnotation> {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return addExceptionStatusAnnotation({
      sheetId,
      value,
      actorUserId: user.id,
    });
  },

  async getSheetAuditForLidor(
    user: User,
    sheetId: string,
    limit: number = 10,
  ): Promise<FinancialExpenseAuditLogEntry[]> {
    if (user.role !== 'ADMIN' && user.role !== 'SUB_ADMIN') {
      throw new Error('Access denied: only ADMIN or SUB_ADMIN can view financial control data.');
    }
    return getAuditEventsForSheet(sheetId, limit);
  },
};


