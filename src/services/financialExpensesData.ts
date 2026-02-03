import type {
  ExpensesDataSnapshotFinal,
  FinancialExpenseAttachment,
  FinancialExpenseAuditEntityType,
  FinancialExpenseAuditLogEntry,
  FinancialExpenseLineItem,
  FinancialExpenseLineItemKind,
  FinancialExpenseSheet,
  FinancialExpenseSheetArchivedReason,
  FinancialExpenseSheetStatus,
  FinancialPaymentEvent,
  InsurerRuleset,
  LidorFinancialSheetListItem,
  LidorFinancialCounts,
  LidorFinancialKpis,
  LidorFinancialExceptionSummary,
  FinancialExceptionAnnotation,
  FinancialExceptionStatusValue,
  ReportData,
} from '../types';
import { normalizeOdakanitNo } from '../utils/normalizeOdakanitNo';
import { calculateSheetTotals } from '../utils/financialExpensesCalculator';

const STORE_KEY = 'financial_expenses_store_v1';

interface FinancialExpensesStore {
  sheets: Record<string, FinancialExpenseSheet>;
  lineItems: Record<string, FinancialExpenseLineItem>;
  attachments: Record<string, FinancialExpenseAttachment>;
  auditEvents: Record<string, FinancialExpenseAuditLogEntry>;
  insurerRulesets: Record<string, InsurerRuleset>;
  exceptionAnnotations: Record<string, FinancialExceptionAnnotation>;
  payments: Record<string, FinancialPaymentEvent>;
}

const emptyStore = (): FinancialExpensesStore => ({
  sheets: {},
  lineItems: {},
  attachments: {},
  auditEvents: {},
  insurerRulesets: {},
  exceptionAnnotations: {},
  payments: {},
});

const loadStore = (): FinancialExpensesStore => {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    return {
      sheets: parsed.sheets || {},
      lineItems: parsed.lineItems || {},
      attachments: parsed.attachments || {},
      auditEvents: parsed.auditEvents || {},
      insurerRulesets: parsed.insurerRulesets || {},
      exceptionAnnotations: parsed.exceptionAnnotations || {},
      payments: parsed.payments || {},
    } as FinancialExpensesStore;
  } catch (error) {
    console.error('Failed to load financial expenses store', error);
    return emptyStore();
  }
};

const saveStore = (store: FinancialExpensesStore) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to persist financial expenses store', error);
  }
};

const computeSimpleHash = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + input.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const computeSheetVersionHash = (
  sheet: FinancialExpenseSheet,
  lineItems: FinancialExpenseLineItem[],
  attachments: FinancialExpenseAttachment[],
): string => {
  const payload = {
    sheet,
    lineItems: lineItems.map((li) => ({
      id: li.id,
      sheetId: li.sheetId,
      kind: li.kind,
      expenseType: li.expenseType,
      providerName: li.providerName,
      description: li.description,
      date: li.date,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      vatRate: li.vatRate,
      isIncludedInRequestedAmount: li.isIncludedInRequestedAmount,
      lineNetAmount: li.lineNetAmount,
      lineVatAmount: li.lineVatAmount,
      lineTotalAmount: li.lineTotalAmount,
      attachmentId: li.attachmentId,
    })),
    attachments: attachments.map((att) => ({
      id: att.id,
      sheetId: att.sheetId,
      fileKey: att.fileKey,
      originalFileName: att.originalFileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      linkedLineItemId: att.linkedLineItemId,
    })),
  };
  return computeSimpleHash(JSON.stringify(payload));
};

const nowIso = () => new Date().toISOString();

const generateId = (prefix: string) => {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
};

const collectSheetRelations = (store: FinancialExpensesStore, sheetId: string) => {
  const lineItems = Object.values(store.lineItems).filter((li) => li.sheetId === sheetId);
  const attachments = Object.values(store.attachments).filter((att) => att.sheetId === sheetId);
  return { lineItems, attachments };
};

// ---------------------------------------------------------------------------
// Payment events – aggregate "already paid" per case based on real payments
// ---------------------------------------------------------------------------

export interface CreateFinancialPaymentEventInput {
  caseId: string;
  sheetId?: string | null;
  amount: number;
  paidAt: string;
  reference?: string | null;
  note?: string | null;
}

export const listFinancialPaymentEventsForCase = (
  caseId: string,
): FinancialPaymentEvent[] => {
  const store = loadStore();
  const normalizedCaseId = normalizeOdakanitNo(caseId);
  return Object.values(store.payments)
    .filter(
      (p) =>
        !p.isDeleted &&
        normalizeOdakanitNo(p.caseId) === normalizedCaseId,
    )
    .sort((a, b) => {
      const at = new Date(a.paidAt).getTime();
      const bt = new Date(b.paidAt).getTime();
      return at - bt;
    });
};

export const createFinancialPaymentEvent = (
  input: CreateFinancialPaymentEventInput,
): FinancialPaymentEvent => {
  let store = loadStore();
  const id = generateId('fpay');
  const now = nowIso();
  const event: FinancialPaymentEvent = {
    id,
    caseId: normalizeOdakanitNo(input.caseId),
    sheetId: input.sheetId ?? null,
    amount: input.amount,
    paidAt: input.paidAt,
    reference: input.reference ?? null,
    note: input.note ?? null,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  store = {
    ...store,
    payments: {
      ...store.payments,
      [id]: event,
    },
  };
  saveStore(store);
  return event;
};

export const softDeleteFinancialPaymentEvent = (
  id: string,
): FinancialPaymentEvent | null => {
  let store = loadStore();
  const existing = store.payments[id];
  if (!existing) return null;
  const updated: FinancialPaymentEvent = {
    ...existing,
    isDeleted: true,
    updatedAt: nowIso(),
  };
  store = {
    ...store,
    payments: {
      ...store.payments,
      [id]: updated,
    },
  };
  saveStore(store);
  return updated;
};

export const computePaidToDateForCase = (
  caseId: string,
  asOfIso?: string | null,
  fallback?: number | null,
): number => {
  const store = loadStore();
  const normalizedCase = normalizeOdakanitNo(caseId);
  if (!normalizedCase) return fallback ?? 0;

  const asOfTime = asOfIso ? new Date(asOfIso).getTime() : Date.now();
  if (Number.isNaN(asOfTime)) return fallback ?? 0;

  let sum = 0;
  let hasAnyForCase = false;

  Object.values(store.payments).forEach((p) => {
    if (p.isDeleted) return;
    if (normalizeOdakanitNo(p.caseId) !== normalizedCase) return;
    hasAnyForCase = true;
    const t = new Date(p.paidAt).getTime();
    if (Number.isNaN(t) || t > asOfTime) return;
    const amount = Number(p.amount) || 0;
    if (amount <= 0) return;
    sum += amount;
  });

  if (!hasAnyForCase) {
    return fallback ?? 0;
  }

  return sum;
};

export const getInsurerRulesetById = (insurerId: string): InsurerRuleset | null => {
  const store = loadStore();
  return store.insurerRulesets[insurerId] || null;
};

export const listFinancialExpenseSheets = (): FinancialExpenseSheet[] => {
  const store = loadStore();
  return Object.values(store.sheets).sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt).getTime();
    const tb = new Date(b.updatedAt || b.createdAt).getTime();
    return tb - ta;
  });
};

export const getFinancialExpenseSheetWithRelations = (
  sheetId: string,
): { sheet: FinancialExpenseSheet; lineItems: FinancialExpenseLineItem[]; attachments: FinancialExpenseAttachment[] } | null => {
  const store = loadStore();
  const sheet = store.sheets[sheetId];
  if (!sheet) return null;
  const { lineItems, attachments } = collectSheetRelations(store, sheetId);
  return { sheet, lineItems, attachments };
};

const updateSheetVersion = (
  store: FinancialExpensesStore,
  sheetId: string,
): FinancialExpensesStore => {
  const sheet = store.sheets[sheetId];
  if (!sheet) return store;
  const { lineItems, attachments } = collectSheetRelations(store, sheetId);
  const nextSheet: FinancialExpenseSheet = {
    ...sheet,
    sheetVersionNumber: sheet.sheetVersionNumber + 1,
    sheetVersionHash: computeSheetVersionHash(sheet, lineItems, attachments),
    updatedAt: nowIso(),
  };
  return {
    ...store,
    sheets: {
      ...store.sheets,
      [sheetId]: nextSheet,
    },
  };
};

const appendAuditEvent = (
  store: FinancialExpensesStore,
  sheetId: string,
  actorUserId: string,
  actorRole: string,
  eventType: string,
  entityType: FinancialExpenseAuditEntityType,
  entityId?: string | null,
  diffJson?: unknown,
): FinancialExpensesStore => {
  const sheet = store.sheets[sheetId];
  if (!sheet) return store;

  const eventId = generateId('fae');
  const entry: FinancialExpenseAuditLogEntry = {
    id: eventId,
    sheetId,
    actorUserId,
    actorRole,
    eventType,
    eventAt: nowIso(),
    entityType,
    entityId: entityId ?? null,
    diffJson,
    sheetVersionNumberAtEvent: sheet.sheetVersionNumber,
    sheetVersionHashAtEvent: sheet.sheetVersionHash,
  };

  return {
    ...store,
    auditEvents: {
      ...store.auditEvents,
      [eventId]: entry,
    },
  };
};

// ---------------------------------------------------------------------------
// Public API – minimal operations for PR1.1 (no UI, no network yet)
// ---------------------------------------------------------------------------

export interface CreateFinancialExpenseSheetInput {
  caseId: string;
  insurerId?: string | null;
  insurerName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
  versionIndex: number;
  currency?: string | null;
  deductibleAmount?: number | null;
  alreadyPaidAmount?: number | null;
  infoOnly?: boolean;
  createdByUserId: string;
  insurerRulesetId?: string | null;
  insurerRulesetVersion?: string | null;
}

export const createFinancialExpenseSheet = (
  input: CreateFinancialExpenseSheetInput,
): FinancialExpenseSheet => {
  const store = loadStore();
  const id = generateId('fes');
  const timestamp = nowIso();
  const sheet: FinancialExpenseSheet = {
    id,
    caseId: input.caseId,
    insurerId: input.insurerId ?? null,
    insurerName: input.insurerName ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    periodLabel: input.periodLabel ?? null,
    versionIndex: input.versionIndex,
    status: 'DRAFT',
    archivedReason: null as FinancialExpenseSheetArchivedReason,
    currency: input.currency || 'ILS',
    deductibleAmount: input.deductibleAmount ?? null,
    alreadyPaidAmount: input.alreadyPaidAmount ?? null,
    infoOnly: Boolean(input.infoOnly),
    attachedToReportId: null,
    attachedAt: null,
    createdByUserId: input.createdByUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
    readyAt: null,
    sheetVersionNumber: 1,
    sheetVersionHash: '', // will be recomputed below
    insurerRulesetId: input.insurerRulesetId ?? null,
    insurerRulesetVersion: input.insurerRulesetVersion ?? null,
  };

  let nextStore: FinancialExpensesStore = {
    ...store,
    sheets: {
      ...store.sheets,
      [id]: sheet,
    },
  };

  nextStore = updateSheetVersion(nextStore, id);
  nextStore = appendAuditEvent(
    nextStore,
    id,
    input.createdByUserId,
    'FINANCE',
    'SHEET_CREATED',
    'SHEET',
    id,
    {
      caseId: input.caseId,
      insurerId: input.insurerId ?? null,
      insurerName: input.insurerName ?? null,
    },
  );

  saveStore(nextStore);
  return nextStore.sheets[id];
};

export const deleteFinancialExpenseSheet = (sheetId: string): FinancialExpensesStore => {
  let store = loadStore();
  const existing = store.sheets[sheetId];
  if (!existing) {
    console.warn('deleteFinancialExpenseSheet: sheet not found', sheetId);
    return store;
  }

  const nextSheets = { ...store.sheets };
  delete nextSheets[sheetId];

  const nextLineItems: typeof store.lineItems = {};
  Object.values(store.lineItems).forEach((li) => {
    if (li.sheetId !== sheetId) {
      nextLineItems[li.id] = li;
    }
  });

  const nextAttachments: typeof store.attachments = {};
  Object.values(store.attachments).forEach((att) => {
    if (att.sheetId !== sheetId) {
      nextAttachments[att.id] = att;
    }
  });

  store = {
    ...store,
    sheets: nextSheets,
    lineItems: nextLineItems,
    attachments: nextAttachments,
  };

  saveStore(store);
  return store;
};

export interface UpdateFinancialExpenseSheetMetaInput {
  sheetId: string;
  actorUserId: string;
  actorRole: string;
  patch: Partial<Pick<FinancialExpenseSheet,
    'insurerId' |
    'insurerName' |
    'periodStart' |
    'periodEnd' |
    'periodLabel' |
    'currency' |
    'deductibleAmount' |
    'alreadyPaidAmount' |
    'infoOnly'
  >>;
}

export const updateFinancialExpenseSheetMeta = (
  input: UpdateFinancialExpenseSheetMetaInput,
): FinancialExpenseSheet | null => {
  let store = loadStore();
  const existing = store.sheets[input.sheetId];
  if (!existing) {
    console.warn('updateFinancialExpenseSheetMeta: sheet not found', input.sheetId);
    return null;
  }

  const nextSheet: FinancialExpenseSheet = {
    ...existing,
    ...input.patch,
    updatedAt: nowIso(),
  };

  store = {
    ...store,
    sheets: {
      ...store.sheets,
      [input.sheetId]: nextSheet,
    },
  };

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  (Object.keys(input.patch) as Array<keyof typeof input.patch>).forEach((key) => {
    const before = (existing as any)[key];
    const after = (nextSheet as any)[key];
    if (before !== after) {
      diff[key as string] = { before, after };
    }
  });

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'SHEET_META_UPDATED',
    'SHEET',
    input.sheetId,
    Object.keys(diff).length ? diff : undefined,
  );

  saveStore(store);
  return store.sheets[input.sheetId];
};

export interface CreateFinancialExpenseLineItemInput {
  sheetId: string;
  kind: FinancialExpenseLineItemKind;
  expenseType?: string | null;
  providerName?: string | null;
  providerId?: string | null;
  description: string;
  date?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  vatRate?: number | null;
  isIncludedInRequestedAmount?: boolean;
  lineNetAmount?: number | null;
  lineVatAmount?: number | null;
  lineTotalAmount?: number | null;
  attachmentId?: string | null;
  actorUserId: string;
  actorRole: string;
}

export const addFinancialExpenseLineItem = (
  input: CreateFinancialExpenseLineItemInput,
): FinancialExpenseLineItem | null => {
  let store = loadStore();
  if (!store.sheets[input.sheetId]) {
    console.warn('addFinancialExpenseLineItem: sheet not found', input.sheetId);
    return null;
  }
  const id = generateId('fli');
  const timestamp = nowIso();
  const item: FinancialExpenseLineItem = {
    id,
    sheetId: input.sheetId,
    kind: input.kind,
    expenseType: input.expenseType ?? null,
    providerName: input.providerName ?? null,
    providerId: input.providerId ?? null,
    description: input.description,
    date: input.date ?? null,
    quantity: input.quantity ?? null,
    unitPrice: input.unitPrice ?? null,
    vatRate: input.vatRate ?? null,
    isIncludedInRequestedAmount: input.isIncludedInRequestedAmount ?? true,
    lineNetAmount: input.lineNetAmount ?? null,
    lineVatAmount: input.lineVatAmount ?? null,
    lineTotalAmount: input.lineTotalAmount ?? null,
    attachmentId: input.attachmentId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store = {
    ...store,
    lineItems: {
      ...store.lineItems,
      [id]: item,
    },
  };

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'LINE_ITEM_CREATED',
    'LINE_ITEM',
    id,
    {
      kind: input.kind,
      description: input.description,
      amount: input.lineTotalAmount ?? null,
    },
  );

  saveStore(store);
  return item;
};

export interface UpdateFinancialExpenseLineItemInput {
  sheetId: string;
  lineItemId: string;
  actorUserId: string;
  actorRole: string;
  patch: Partial<
    Pick<FinancialExpenseLineItem,
      'kind' |
      'expenseType' |
      'providerName' |
      'providerId' |
      'description' |
      'date' |
      'quantity' |
      'unitPrice' |
      'vatRate' |
      'isIncludedInRequestedAmount' |
      'lineNetAmount' |
      'lineVatAmount' |
      'lineTotalAmount' |
      'attachmentId'
    >
  >;
}

export const updateFinancialExpenseLineItem = (
  input: UpdateFinancialExpenseLineItemInput,
): FinancialExpenseLineItem | null => {
  let store = loadStore();
  const existing = store.lineItems[input.lineItemId];
  if (!existing || existing.sheetId !== input.sheetId) {
    console.warn('updateFinancialExpenseLineItem: line item not found', input.lineItemId);
    return null;
  }

  const nextItem: FinancialExpenseLineItem = {
    ...existing,
    ...input.patch,
    updatedAt: nowIso(),
  };

  store = {
    ...store,
    lineItems: {
      ...store.lineItems,
      [input.lineItemId]: nextItem,
    },
  };

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  (Object.keys(input.patch) as Array<keyof typeof input.patch>).forEach((key) => {
    const before = (existing as any)[key];
    const after = (nextItem as any)[key];
    if (before !== after) {
      diff[key as string] = { before, after };
    }
  });

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'LINE_ITEM_UPDATED',
    'LINE_ITEM',
    input.lineItemId,
    Object.keys(diff).length ? diff : undefined,
  );

  saveStore(store);
  return store.lineItems[input.lineItemId];
};

export interface DeleteFinancialExpenseLineItemInput {
  sheetId: string;
  lineItemId: string;
  actorUserId: string;
  actorRole: string;
}

export const deleteFinancialExpenseLineItem = (
  input: DeleteFinancialExpenseLineItemInput,
): boolean => {
  let store = loadStore();
  const existing = store.lineItems[input.lineItemId];
  if (!existing || existing.sheetId !== input.sheetId) {
    console.warn('deleteFinancialExpenseLineItem: line item not found', input.lineItemId);
    return false;
  }

  const { [input.lineItemId]: removed, ...restLineItems } = store.lineItems;

  store = {
    ...store,
    lineItems: restLineItems,
  };

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'LINE_ITEM_DELETED',
    'LINE_ITEM',
    input.lineItemId,
    {
      deleted: removed,
    },
  );

  saveStore(store);
  return true;
};

export interface CreateFinancialExpenseAttachmentInput {
  sheetId: string;
  fileKey: string;
  originalFileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId: string;
  linkedLineItemId?: string | null;
}

export const addFinancialExpenseAttachment = (
  input: CreateFinancialExpenseAttachmentInput,
): FinancialExpenseAttachment | null => {
  let store = loadStore();
  if (!store.sheets[input.sheetId]) {
    console.warn('addFinancialExpenseAttachment: sheet not found', input.sheetId);
    return null;
  }
  const id = generateId('fat');
  const timestamp = nowIso();
  const attachment: FinancialExpenseAttachment = {
    id,
    sheetId: input.sheetId,
    fileKey: input.fileKey,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? null,
    uploadedByUserId: input.uploadedByUserId,
    uploadedAt: timestamp,
    linkedLineItemId: input.linkedLineItemId ?? null,
  };

  store = {
    ...store,
    attachments: {
      ...store.attachments,
      [id]: attachment,
    },
  };

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.uploadedByUserId,
    'FINANCE',
    'ATTACHMENT_ADDED',
    'ATTACHMENT',
    id,
    {
      fileKey: input.fileKey,
      originalFileName: input.originalFileName,
    },
  );

  saveStore(store);
  return attachment;
};

export interface LinkAttachmentToLineItemInput {
  sheetId: string;
  attachmentId: string;
  lineItemId: string | null;
  actorUserId: string;
  actorRole: string;
}

export const linkAttachmentToLineItem = (
  input: LinkAttachmentToLineItemInput,
): FinancialExpenseAttachment | null => {
  let store = loadStore();
  const attachment = store.attachments[input.attachmentId];
  if (!attachment || attachment.sheetId !== input.sheetId) {
    console.warn('linkAttachmentToLineItem: attachment not found', input.attachmentId);
    return null;
  }

  const prevLinked = attachment.linkedLineItemId ?? null;

  // Update linkedLineItemId on attachment
  const nextAttachment: FinancialExpenseAttachment = {
    ...attachment,
    linkedLineItemId: input.lineItemId,
  };

  store = {
    ...store,
    attachments: {
      ...store.attachments,
      [input.attachmentId]: nextAttachment,
    },
  };

  // Keep lineItem.attachmentId in sync
  if (input.lineItemId) {
    const line = store.lineItems[input.lineItemId];
    if (line) {
      store = {
        ...store,
        lineItems: {
          ...store.lineItems,
          [input.lineItemId]: {
            ...line,
            attachmentId: input.attachmentId,
            updatedAt: nowIso(),
          },
        },
      };
    }
  } else if (prevLinked) {
    const prevLine = store.lineItems[prevLinked];
    if (prevLine && prevLine.attachmentId === input.attachmentId) {
      store = {
        ...store,
        lineItems: {
          ...store.lineItems,
          [prevLinked]: {
            ...prevLine,
            attachmentId: null,
            updatedAt: nowIso(),
          },
        },
      };
    }
  }

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'ATTACHMENT_LINKED',
    'ATTACHMENT',
    input.attachmentId,
    {
      before: prevLinked,
      after: input.lineItemId,
    },
  );

  saveStore(store);
  return store.attachments[input.attachmentId];
};

export interface SheetReadyAttemptInput {
  sheetId: string;
  actorUserId: string;
  actorRole: string;
  success: boolean;
  decisionLog: {
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
  };
}

export const recordSheetReadyAttempt = (
  input: SheetReadyAttemptInput,
): FinancialExpenseSheet | null => {
  let store = loadStore();
  const sheet = store.sheets[input.sheetId];
  if (!sheet) {
    console.warn('recordSheetReadyAttempt: sheet not found', input.sheetId);
    return null;
  }

  let nextSheet = sheet;
  if (input.success) {
    const now = nowIso();
    nextSheet = {
      ...sheet,
      status: 'READY_FOR_REPORT',
      readyAt: now,
      updatedAt: now,
      insurerRulesetId: input.decisionLog.rulesetId ?? sheet.insurerRulesetId ?? null,
      insurerRulesetVersion:
        input.decisionLog.rulesetVersion ?? sheet.insurerRulesetVersion ?? null,
    };
    store = {
      ...store,
      sheets: {
        ...store.sheets,
        [input.sheetId]: nextSheet,
      },
    };
    store = updateSheetVersion(store, input.sheetId);
  }

  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'SHEET_READY_ATTEMPT',
    'SHEET',
    input.sheetId,
    {
      success: input.success,
      decisionLog: input.decisionLog,
    },
  );

  saveStore(store);
  return store.sheets[input.sheetId];
};

export interface RevertSheetToDraftInput {
  sheetId: string;
  actorUserId: string;
  actorRole: string;
}

export const revertSheetToDraft = (
  input: RevertSheetToDraftInput,
): FinancialExpenseSheet | null => {
  let store = loadStore();
  const sheet = store.sheets[input.sheetId];
  if (!sheet || sheet.status !== 'READY_FOR_REPORT') {
    return sheet || null;
  }

  const now = nowIso();
  const nextSheet: FinancialExpenseSheet = {
    ...sheet,
    status: 'DRAFT',
    readyAt: null,
    updatedAt: now,
  };

  store = {
    ...store,
    sheets: {
      ...store.sheets,
      [input.sheetId]: nextSheet,
    },
  };

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'SHEET_REVERTED_TO_DRAFT',
    'SHEET',
    input.sheetId,
    {
      from: 'READY_FOR_REPORT',
      to: 'DRAFT',
    },
  );

  saveStore(store);
  return store.sheets[input.sheetId];
};

// ---------------------------------------------------------------------------
// Lidor (SUB_ADMIN) read-only queries
// ---------------------------------------------------------------------------

export interface LidorSheetsQueryParams {
  status?: FinancialExpenseSheetStatus;
  insurerId?: string;
  insurerName?: string;
  caseIdOrSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  hasMissingAttachments?: boolean;
  isInfoOnly?: boolean;
  minAmountToRequest?: number;
  maxAmountToRequest?: number;
}

export const queryFinancialSheetsForLidor = (
  params: LidorSheetsQueryParams,
  reports: ReportData[],
): LidorFinancialSheetListItem[] => {
  const store = loadStore();
  const sheets = Object.values(store.sheets);

  const reportById = new Map<string, ReportData>();
  reports.forEach((r) => {
    reportById.set(r.id, r);
  });

  const items: LidorFinancialSheetListItem[] = sheets.map((sheet) => {
    const { lineItems } = collectSheetRelations(store, sheet.id);
    const totals = calculateSheetTotals(sheet, lineItems);

    const attachedReport = sheet.attachedToReportId
      ? reportById.get(sheet.attachedToReportId)
      : undefined;

    // Find latest decisionLog blocking issue codes from audit events
    const auditEntries = Object.values(store.auditEvents).filter(
      (e) => e.sheetId === sheet.id && e.diffJson && (e as any).diffJson.decisionLog,
    );
    auditEntries.sort(
      (a, b) =>
        new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
    );
    const latestDecision =
      (auditEntries[0] as any)?.diffJson?.decisionLog || null;

    const blockingIssueCodesLatest: string[] | undefined =
      latestDecision?.blockingIssueCodes &&
      Array.isArray(latestDecision.blockingIssueCodes)
        ? latestDecision.blockingIssueCodes
        : undefined;

    const expensesOutOfSync =
      attachedReport?.expensesSheetId === sheet.id
        ? Boolean(attachedReport.expensesOutOfSync)
        : false;

    return {
      sheetId: sheet.id,
      caseId: sheet.caseId,
      insurerName: sheet.insurerName ?? null,
      status: sheet.status,
      versionIndex: sheet.versionIndex,
      updatedAt: sheet.updatedAt,
      readyAt: sheet.readyAt ?? null,
      attachedAt: sheet.attachedAt ?? null,
      sentAt: attachedReport?.sentAt || null,
      amountToRequest: totals.amountToRequest,
      infoOnly: sheet.infoOnly,
      expensesOutOfSync,
      blockingIssueCodesLatest,
    };
  });

  const dateInRange = (iso: string | undefined | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    if (params.dateFrom && t < new Date(params.dateFrom).getTime()) return false;
    if (params.dateTo && t > new Date(params.dateTo).getTime()) return false;
    return true;
  };

  return items
    .filter((item) => {
      if (params.status && item.status !== params.status) return false;
      if (params.insurerId && store.sheets[item.sheetId]?.insurerId !== params.insurerId)
        return false;
      if (
        params.insurerName &&
        !(item.insurerName || '')
          .toLowerCase()
          .includes(params.insurerName.toLowerCase())
      ) {
        return false;
      }
      if (params.caseIdOrSearch) {
        const term = params.caseIdOrSearch.toLowerCase();
        const haystack = `${item.caseId} ${item.insurerName || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (params.isInfoOnly != null && item.infoOnly !== params.isInfoOnly) {
        return false;
      }
      if (params.minAmountToRequest != null && item.amountToRequest < params.minAmountToRequest) {
        return false;
      }
      if (params.maxAmountToRequest != null && item.amountToRequest > params.maxAmountToRequest) {
        return false;
      }
      if (params.dateFrom || params.dateTo) {
        // Simple heuristic: use updatedAt
        if (!dateInRange(item.updatedAt)) return false;
      }
      if (params.hasMissingAttachments) {
        // Heuristic: יש בעיות חסר נספחים אם בקודים אחרונים מופיע MISSING_ATTACHMENT_REQUIRED
        if (!item.blockingIssueCodesLatest?.includes('MISSING_ATTACHMENT_REQUIRED')) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

export const getLidorFinancialCounts = (
  reports: ReportData[],
): LidorFinancialCounts => {
  const store = loadStore();
  const sheets = Object.values(store.sheets);

  const reportById = new Map<string, ReportData>();
  reports.forEach((r) => {
    reportById.set(r.id, r);
  });

  let readyCount = 0;
  let attachedCount = 0;
  let sentCount = 0;
  let exceptionsCount = 0;

  sheets.forEach((sheet) => {
    if (sheet.status === 'READY_FOR_REPORT') readyCount += 1;
    if (sheet.status === 'ATTACHED_TO_REPORT') attachedCount += 1;

    const attachedReport = sheet.attachedToReportId
      ? reportById.get(sheet.attachedToReportId)
      : undefined;
    if (attachedReport?.status === 'SENT') {
      sentCount += 1;
    }

    const hasDivergence =
      attachedReport?.expensesSheetId === sheet.id &&
      attachedReport.expensesOutOfSync === true;

    const hasBlockingAudit = Object.values(store.auditEvents).some(
      (e) =>
        e.sheetId === sheet.id &&
        e.eventType === 'SHEET_READY_ATTEMPT' &&
        (e.diffJson as any)?.success === false,
    );

    if (hasDivergence || hasBlockingAudit) {
      exceptionsCount += 1;
    }
  });

  return { readyCount, attachedCount, sentCount, exceptionsCount };
};

const hoursBetween = (fromIso?: string | null, toIso?: string | null): number | null => {
  if (!fromIso || !toIso) return null;
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60);
};

const average = (values: number[]): number | null => {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const buildExceptionSummary = (
  items: { sheetId: string; caseId: string; reason: string; updatedAt?: string; amountToRequest?: number; failedAttempts?: number }[],
  limit: number = 5,
): LidorFinancialExceptionSummary => ({
  count: items.length,
  samples: items.slice(0, limit),
});

export interface AddExceptionStatusAnnotationInput {
  sheetId: string;
  value: FinancialExceptionStatusValue;
  actorUserId: string;
}

export const addExceptionStatusAnnotation = (
  input: AddExceptionStatusAnnotationInput,
): FinancialExceptionAnnotation => {
  let store = loadStore();
  const id = generateId('fexa');
  const createdAt = nowIso();
  const annotation: FinancialExceptionAnnotation = {
    id,
    sheetId: input.sheetId,
    noteType: 'EXCEPTION_STATUS',
    value: input.value,
    actorUserId: input.actorUserId,
    createdAt,
  };

  store = {
    ...store,
    exceptionAnnotations: {
      ...store.exceptionAnnotations,
      [id]: annotation,
    },
  };

  saveStore(store);
  return annotation;
};

export const getLatestExceptionStatusForSheet = (
  sheetId: string,
): FinancialExceptionStatusValue | null => {
  const store = loadStore();
  const all = Object.values(store.exceptionAnnotations).filter(
    (a) => a.sheetId === sheetId && a.noteType === 'EXCEPTION_STATUS',
  );
  if (!all.length) return null;
  all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return all[0].value;
};

export const getLidorFinancialKpis = (reports: ReportData[]): LidorFinancialKpis => {
  const store = loadStore();
  const sheets = Object.values(store.sheets);

  const reportById = new Map<string, ReportData>();
  reports.forEach((r) => {
    reportById.set(r.id, r);
  });

  const draftToReadyHours: number[] = [];
  const readyToAttachedHours: number[] = [];
  const attachedToSentHours: number[] = [];

  let totalAmountRequested = 0;
  let infoOnlyCount = 0;

  const divergenceOldItems: { sheetId: string; caseId: string; reason: string; updatedAt?: string }[] = [];
  const missingAttachmentsItems: { sheetId: string; caseId: string; reason: string; updatedAt?: string }[] = [];
  const highAmountItems: { sheetId: string; caseId: string; reason: string; updatedAt?: string; amountToRequest?: number }[] = [];
  const repeatedBlocksItems: { sheetId: string; caseId: string; reason: string; failedAttempts?: number; updatedAt?: string }[] = [];

  const divergenceOldThresholdDays = 3;
  const repeatedBlocksThreshold = 3;

  const now = Date.now();

  // Pre-load audit entries per sheet for performance
  const auditsBySheet = new Map<string, FinancialExpenseAuditLogEntry[]>();
  Object.values(store.auditEvents).forEach((e) => {
    const list = auditsBySheet.get(e.sheetId) || [];
    list.push(e);
    auditsBySheet.set(e.sheetId, list);
  });

  // First pass: compute totals, SLA arrays and gather decision logs
  const amountsForPercentile: number[] = [];

  sheets.forEach((sheet) => {
    const { lineItems } = collectSheetRelations(store, sheet.id);
    const totals = calculateSheetTotals(sheet, lineItems);

    totalAmountRequested += totals.amountToRequest;
    if (sheet.infoOnly) infoOnlyCount += 1;

    if (sheet.createdAt && sheet.readyAt) {
      const h = hoursBetween(sheet.createdAt, sheet.readyAt);
      if (h != null) draftToReadyHours.push(h);
    }
    if (sheet.readyAt && sheet.attachedAt) {
      const h = hoursBetween(sheet.readyAt, sheet.attachedAt);
      if (h != null) readyToAttachedHours.push(h);
    }

    const attachedReport = sheet.attachedToReportId
      ? reportById.get(sheet.attachedToReportId)
      : undefined;

    if (sheet.attachedAt && attachedReport?.sentAt) {
      const h = hoursBetween(sheet.attachedAt, attachedReport.sentAt);
      if (h != null) attachedToSentHours.push(h);
    }

    if (totals.amountToRequest > 0) {
      amountsForPercentile.push(totals.amountToRequest);
    }
  });

  // High amount threshold – percentile 95 (fallback לרף קבוע אם מעט נתונים)
  let highAmountThreshold = 0;
  if (amountsForPercentile.length >= 5) {
    const sorted = [...amountsForPercentile].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95) - 1;
    highAmountThreshold = sorted[Math.max(0, idx)];
  } else if (amountsForPercentile.length > 0) {
    highAmountThreshold = Math.max(...amountsForPercentile);
  }

  // Second pass – exceptions, using threshold and audit
  sheets.forEach((sheet) => {
    const { lineItems } = collectSheetRelations(store, sheet.id);
    const totals = calculateSheetTotals(sheet, lineItems);
    const attachedReport = sheet.attachedToReportId
      ? reportById.get(sheet.attachedToReportId)
      : undefined;

    const audits = auditsBySheet.get(sheet.id) || [];

    // Find latest decisionLog entry
    const decisionEvents = audits.filter(
      (e) => e.diffJson && (e as any).diffJson.decisionLog,
    );
    decisionEvents.sort(
      (a, b) =>
        new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
    );
    const latestDecision = (decisionEvents[0] as any)?.diffJson?.decisionLog || null;
    const blockingIssueCodes: string[] =
      latestDecision?.blockingIssueCodes && Array.isArray(latestDecision.blockingIssueCodes)
        ? latestDecision.blockingIssueCodes
        : [];

    // Divergence ישן
    const hasDivergence =
      attachedReport?.expensesSheetId === sheet.id &&
      attachedReport.expensesOutOfSync === true;
    if (hasDivergence) {
      const updatedTime = new Date(sheet.updatedAt || sheet.createdAt).getTime();
      if (!Number.isNaN(updatedTime)) {
        const ageDays = (now - updatedTime) / (1000 * 60 * 60 * 24);
        if (ageDays >= divergenceOldThresholdDays) {
          divergenceOldItems.push({
            sheetId: sheet.id,
            caseId: sheet.caseId,
            reason: 'DIVERGENCE_OLD',
            updatedAt: sheet.updatedAt,
          });
        }
      }
    }

    // חסרי נספחים – לפי codes וסטטוס
    const isReadyOrAttached =
      sheet.status === 'READY_FOR_REPORT' || sheet.status === 'ATTACHED_TO_REPORT';
    if (
      isReadyOrAttached &&
      blockingIssueCodes.includes('MISSING_ATTACHMENT_REQUIRED') &&
      totals.amountToRequest > 0
    ) {
      missingAttachmentsItems.push({
        sheetId: sheet.id,
        caseId: sheet.caseId,
        reason: 'MISSING_ATTACHMENTS',
        updatedAt: sheet.updatedAt,
      });
    }

    // סכומים חריגים – לפי amountToRequest גבוה מהסף
    if (highAmountThreshold > 0 && totals.amountToRequest >= highAmountThreshold) {
      highAmountItems.push({
        sheetId: sheet.id,
        caseId: sheet.caseId,
        reason: 'HIGH_AMOUNT',
        updatedAt: sheet.updatedAt,
        amountToRequest: totals.amountToRequest,
      });
    }

    // חסימות חוזרות – SHEET_READY_ATTEMPT כושלים
    const failedAttempts = audits.filter(
      (e) =>
        e.eventType === 'SHEET_READY_ATTEMPT' &&
        (e.diffJson as any)?.success === false,
    ).length;

    if (failedAttempts >= repeatedBlocksThreshold) {
      repeatedBlocksItems.push({
        sheetId: sheet.id,
        caseId: sheet.caseId,
        reason: 'REPEATED_BLOCKS',
        failedAttempts,
        updatedAt: sheet.updatedAt,
      });
    }
  });

  const totalSheets = sheets.length;
  const totalSentReports = sheets.filter((sheet) => {
    const attachedReport = sheet.attachedToReportId
      ? reportById.get(sheet.attachedToReportId)
      : undefined;
    return attachedReport?.status === 'SENT';
  }).length;

  const infoOnlyRatio =
    totalSheets > 0 ? Number((infoOnlyCount / totalSheets).toFixed(3)) : null;

  const sla = {
    draftToReadyAvgHours: average(draftToReadyHours),
    draftToReadyMedianHours: median(draftToReadyHours),
    readyToAttachedAvgHours: average(readyToAttachedHours),
    readyToAttachedMedianHours: median(readyToAttachedHours),
    attachedToSentAvgHours: average(attachedToSentHours),
    attachedToSentMedianHours: median(attachedToSentHours),
  };

  const volumes = {
    totalSheets,
    totalSentReports,
    totalAmountRequested,
    infoOnlyRatio,
  };

  const exceptions = {
    divergenceOld: buildExceptionSummary(divergenceOldItems),
    missingAttachments: buildExceptionSummary(missingAttachmentsItems),
    highAmounts: {
      threshold: highAmountThreshold,
      ...buildExceptionSummary(highAmountItems),
    },
    repeatedBlocks: {
      threshold: repeatedBlocksThreshold,
      ...buildExceptionSummary(repeatedBlocksItems),
    },
  };

  return {
    sla,
    volumes,
    exceptions,
  };
};

export const getAuditEventsForSheet = (
  sheetId: string,
  limit: number = 10,
): FinancialExpenseAuditLogEntry[] => {
  const store = loadStore();
  return Object.values(store.auditEvents)
    .filter((e) => e.sheetId === sheetId)
    .sort(
      (a, b) =>
        new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
    )
    .slice(0, limit);
};

export interface LinkSheetToReportInput {
  sheetId: string;
  reportId: string;
  actorUserId: string;
  actorRole: string;
  archivedReason?: FinancialExpenseSheetArchivedReason;
}

export const linkFinancialExpenseSheetToReport = (input: LinkSheetToReportInput): FinancialExpenseSheet | null => {
  let store = loadStore();
  const sheet = store.sheets[input.sheetId];
  if (!sheet) {
    console.warn('linkFinancialExpenseSheetToReport: sheet not found', input.sheetId);
    return null;
  }

  const nextSheet: FinancialExpenseSheet = {
    ...sheet,
    status: 'ATTACHED_TO_REPORT' as FinancialExpenseSheetStatus,
    archivedReason: input.archivedReason ?? 'USED_IN_REPORT',
    attachedToReportId: input.reportId,
    attachedAt: nowIso(),
    updatedAt: nowIso(),
  };

  store = {
    ...store,
    sheets: {
      ...store.sheets,
      [input.sheetId]: nextSheet,
    },
  };

  store = updateSheetVersion(store, input.sheetId);
  store = appendAuditEvent(
    store,
    input.sheetId,
    input.actorUserId,
    input.actorRole,
    'SHEET_ATTACHED_TO_REPORT',
    'REPORT',
    input.reportId,
    {
      attachedToReportId: input.reportId,
    },
  );

  saveStore(store);
  return nextSheet;
};

export const buildExpensesDataSnapshotFinal = (sheetId: string): ExpensesDataSnapshotFinal | null => {
  const store = loadStore();
  const sheet = store.sheets[sheetId];
  if (!sheet) return null;
  const { lineItems, attachments } = collectSheetRelations(store, sheetId);
  return {
    sheetId,
    sheetVersionNumber: sheet.sheetVersionNumber,
    sheetVersionHash: sheet.sheetVersionHash,
    insurerRulesetId: sheet.insurerRulesetId ?? null,
    insurerRulesetVersion: sheet.insurerRulesetVersion ?? null,
    sheet,
    lineItems,
    attachments,
  };
};


