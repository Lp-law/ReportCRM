import React, { useEffect, useMemo, useState } from 'react';
import type {
  FinancialExpenseAttachment,
  FinancialExpenseLineItem,
  FinancialExpenseSheet,
  FinancialPaymentEvent,
  ReportData,
  User,
} from '../../types';
import { calculateSheetTotals, type SheetTotals } from '../../utils/financialExpensesCalculator';
import {
  validateForDraft,
  type ValidationIssue,
} from '../../services/financialExpensesValidation';
import { financialExpensesClient, type SheetWithRelations } from '../../services/financialExpensesClient';
import { renderExpensesTableHtml } from '../../utils/expensesTableText';
import ConfirmDialog from '../ui/ConfirmDialog';
import { normalizeOdakanitNo } from '../../utils/normalizeOdakanitNo';
import {
  getFinancialExpenseStatusLabelHe,
  getFinancialExpenseStatusLabelHeRaw,
} from '../../utils/financialExpenseStatusLabels';
import { getOfficialSheetIdForCase } from '../../services/financialExpensesData';

interface PaymentEventsPanelProps {
  user: User;
  sheet: FinancialExpenseSheet;
  paymentEvents: FinancialPaymentEvent[];
  onChangeEvents: (next: FinancialPaymentEvent[]) => void;
}

const PaymentEventsPanel: React.FC<PaymentEventsPanelProps> = ({
  user,
  sheet,
  paymentEvents,
  onChangeEvents,
}) => {
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceInput, setReferenceInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      // סכום לא תקין – לא נוסיף אירוע
      setError('סכום התשלום חייב להיות גדול מאפס.');
      return;
    }
    if (!dateInput) {
      setError('יש לבחור תאריך תשלום תקין.');
      return;
    }

    const parsed = new Date(dateInput);
    const paidTime = parsed.getTime();
    if (Number.isNaN(paidTime)) {
      setError('תאריך התשלום אינו תקין.');
      return;
    }
    const now = Date.now();
    if (paidTime > now) {
      setError('תאריך תשלום לא יכול להיות עתידי.');
      return;
    }

    setError(null);

    setSaving(true);
    try {
      const paidAtIso = new Date(dateInput).toISOString();
      const created = await financialExpensesClient.createPaymentEvent(user, {
        caseId: sheet.caseId,
        sheetId: sheet.id,
        amount,
        paidAt: paidAtIso,
        reference: referenceInput || null,
        note: noteInput || null,
      });
      onChangeEvents([...paymentEvents, created]);
      setAmountInput('');
      setReferenceInput('');
      setNoteInput('');
      setError(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await financialExpensesClient.softDeletePaymentEvent(id);
    onChangeEvents(paymentEvents.filter((p) => p.id !== id));
  };

  const visibleEvents = paymentEvents.filter((p) => !p.isDeleted).sort((a, b) => {
    const at = new Date(a.paidAt).getTime();
    const bt = new Date(b.paidAt).getTime();
    return bt - at;
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            סכום התשלום (₪)
          </label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-xs"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            min={0}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            תאריך תשלום
          </label>
          <input
            type="date"
            className="w-full border rounded px-2 py-1 text-xs"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            אסמכתא (מס׳ צ׳ק / הפקדה)
          </label>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-xs"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            הערה פנימית (אופציונלי)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 border rounded px-2 py-1 text-xs"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
            <button
              type="button"
              className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={handleAdd}
              disabled={saving}
            >
              הוסף תשלום
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="text-[11px] text-red-600 px-1">
          {error}
        </div>
      )}

      <div className="border-t border-slate-200 pt-2">
        {visibleEvents.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            טרם נרשמו תשלומים לתיק זה. ניתן להוסיף תשלום חדש באמצעות הטופס למעלה.
          </p>
        ) : (
          <div className="space-y-1">
            {visibleEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded border border-slate-200 bg-white px-2 py-1"
              >
                <span className="font-medium text-slate-800">
                  ₪{ev.amount.toLocaleString('he-IL')}
                </span>
                <span className="text-slate-600">
                  בתאריך{' '}
                  {new Date(ev.paidAt).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>
                {ev.reference && (
                  <span className="text-slate-600">אסמכתא: {ev.reference}</span>
                )}
                {ev.note && <span className="text-slate-600">הערה: {ev.note}</span>}
                <button
                  type="button"
                  className="ml-auto text-xs text-red-600 hover:underline"
                  onClick={() => handleDelete(ev.id)}
                >
                  מחיקה
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface Props {
  user: User;
  sheetWithRelations: SheetWithRelations;
  onSheetUpdated: (next: SheetWithRelations) => void;
  onBack: () => void;
  onNotifyLawyer?: (options: { caseId: string; sheetId: string; lawyerId?: string }) => void;
  linkedReportForLawyer?: ReportData | null;
}

type LineDraft = FinancialExpenseLineItem;

const FinanceExpenseSheetEditor: React.FC<Props> = ({
  user,
  sheetWithRelations,
  onSheetUpdated,
  onBack,
  onNotifyLawyer,
  linkedReportForLawyer,
}) => {
  const [sheet, setSheet] = useState<FinancialExpenseSheet>(sheetWithRelations.sheet);
  const [lines, setLines] = useState<LineDraft[]>(sheetWithRelations.lineItems);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [attachments, setAttachments] = useState<FinancialExpenseAttachment[]>(sheetWithRelations.attachments);
  const [issuesDialogOpen, setIssuesDialogOpen] = useState(false);
  const [issuesDialogMessage, setIssuesDialogMessage] = useState('');
  const [globalProviderSuggestions, setGlobalProviderSuggestions] = useState<string[]>([]);
  const [globalDescriptionSuggestions, setGlobalDescriptionSuggestions] = useState<string[]>([]);
  const [selectedLawyerId, setSelectedLawyerId] = useState<string | 'AUTO'>('AUTO');
  const [caseHistory, setCaseHistory] = useState<{
    id: string;
    versionIndex: number;
    status: FinancialExpenseSheet['status'];
    createdAt: string;
    updatedAt: string;
    deductibleAmount: number;
    alreadyPaidAmount: number;
    amountToRequest: number;
  }[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<FinancialPaymentEvent[]>([]);
  const [historicalExpenseLines, setHistoricalExpenseLines] = useState<LineDraft[]>([]);
  const [cumulativeTotals, setCumulativeTotals] = useState<SheetTotals | null>(null);
  const [adminEditReason, setAdminEditReason] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const isLockedByPaid = linkedReportForLawyer?.isPaid === true;
  const isReadOnly = isLockedByPaid && user.role !== 'ADMIN';
  const isAdminEditingPaid = isLockedByPaid && user.role === 'ADMIN';

  const paidToDate = useMemo(() => {
    return financialExpensesClient.getPaidToDateForSheet(sheet);
  }, [sheet, paymentEvents]);

  const effectiveSheet = useMemo(
    () => ({
      ...sheet,
      alreadyPaidAmount: paidToDate,
    }),
    [sheet, paidToDate],
  );

  useEffect(() => {
    setSheet(sheetWithRelations.sheet);
    setLines(sheetWithRelations.lineItems);
    setAttachments(sheetWithRelations.attachments);
    setIsDirty(false);

    const loadPaymentsAndHistory = async () => {
      try {
        const currentCaseId = sheetWithRelations.sheet.caseId;
        const normalizedCase = normalizeOdakanitNo(currentCaseId);
        if (!normalizedCase) {
          setCaseHistory([]);
          setPaymentEvents([]);
          return;
        }

        const payments = await financialExpensesClient.listPaymentsForCase(currentCaseId);
        setPaymentEvents(payments);

        const allSheets = await financialExpensesClient.listSheets();
        const related = allSheets
          .filter((s) => s.id !== sheetWithRelations.sheet.id)
          .filter((s) => normalizeOdakanitNo(s.caseId) === normalizedCase);

        if (!related.length) {
          setCaseHistory([]);
          setHistoricalExpenseLines([]);
          return;
        }

        related.sort((a, b) => {
          const at = new Date(a.updatedAt || a.createdAt).getTime();
          const bt = new Date(b.updatedAt || b.createdAt).getTime();
          return bt - at;
        });

        const top = related.slice(0, 3);
        const historyEntries: {
          id: string;
          versionIndex: number;
          status: FinancialExpenseSheet['status'];
          createdAt: string;
          updatedAt: string;
          deductibleAmount: number;
          alreadyPaidAmount: number;
          amountToRequest: number;
        }[] = [];
        const historicalLines: LineDraft[] = [];

        for (const item of top) {
          const relations = await financialExpensesClient.getSheet(item.id);
          if (!relations) continue;
          const paidForSheet = financialExpensesClient.getPaidToDateForSheet(
            relations.sheet,
          );
          const totals = calculateSheetTotals(
            { ...relations.sheet, alreadyPaidAmount: paidForSheet },
            relations.lineItems,
          );
          const prevExpenses = relations.lineItems.filter(
            (line) => line.kind === 'EXPENSE',
          ) as LineDraft[];
          historicalLines.push(...prevExpenses);
          historyEntries.push({
            id: relations.sheet.id,
            versionIndex: relations.sheet.versionIndex,
            status: relations.sheet.status,
            createdAt: relations.sheet.createdAt,
            updatedAt: relations.sheet.updatedAt,
            deductibleAmount: relations.sheet.deductibleAmount ?? 0,
            alreadyPaidAmount: paidForSheet,
            amountToRequest: totals.amountToRequest,
          });
        }

        historyEntries.sort((a, b) => {
          const at = new Date(a.updatedAt || a.createdAt).getTime();
          const bt = new Date(b.updatedAt || b.createdAt).getTime();
          return bt - at;
        });

        setCaseHistory(historyEntries);
        setHistoricalExpenseLines(historicalLines);

        const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
          sheetWithRelations.sheet.id,
          new Date().toISOString(),
        );
        if (snapshot) {
          const totalsSnapshot = calculateSheetTotals(
            snapshot.effectiveSheet,
            snapshot.allLines,
          );
          setCumulativeTotals(totalsSnapshot);
        } else {
          setCumulativeTotals(null);
        }
      } catch {
        // אם טעינת ההיסטוריה נכשלה – לא נשבור את המסך, רק לא נציג היסטוריה.
        setCaseHistory([]);
        setPaymentEvents([]);
        setHistoricalExpenseLines([]);
        setCumulativeTotals(null);
      }
    };

    void loadPaymentsAndHistory();
  }, [sheetWithRelations]);

  const totals = useMemo(
    () => calculateSheetTotals(effectiveSheet, lines),
    [effectiveSheet, lines],
  );

  const linesWithIssues = useMemo(() => {
    const map = new Set<string>();
    issues.forEach((issue) => {
      if (issue.scope === 'LINE_ITEM' && issue.entityId) {
        map.add(issue.entityId);
      }
    });
    return map;
  }, [issues]);

  const runValidation = () => {
    const result = validateForDraft({
      sheet,
      lineItems: lines,
      attachments,
      ruleset: undefined,
    });
    setIssues(result.issues);
  };

  useEffect(() => {
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, lines]);

  // --- Persisted suggestions (across all cases) for Iris ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawProviders = window.localStorage.getItem('financeProviderSuggestions');
      const rawDescriptions = window.localStorage.getItem('financeDescriptionSuggestions');
      if (rawProviders) {
        const parsed = JSON.parse(rawProviders);
        if (Array.isArray(parsed)) {
          setGlobalProviderSuggestions(parsed.filter((v) => typeof v === 'string'));
        }
      }
      if (rawDescriptions) {
        const parsed = JSON.parse(rawDescriptions);
        if (Array.isArray(parsed)) {
          setGlobalDescriptionSuggestions(parsed.filter((v) => typeof v === 'string'));
        }
      }
    } catch {
      // ignore corrupted localStorage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const providerSet = new Set<string>(globalProviderSuggestions);
    let providersChanged = false;
    lines.forEach((line) => {
      const name = (line.providerName || '').trim();
      if (name && !providerSet.has(name)) {
        providerSet.add(name);
        providersChanged = true;
      }
    });

    if (providersChanged) {
      const next = Array.from(providerSet).sort((a, b) => a.localeCompare(b, 'he-IL'));
      setGlobalProviderSuggestions(next);
      try {
        window.localStorage.setItem('financeProviderSuggestions', JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    }

    const descSet = new Set<string>(globalDescriptionSuggestions);
    let descChanged = false;
    lines.forEach((line) => {
      const value = (line.description || '').trim();
      if (value && !descSet.has(value)) {
        descSet.add(value);
        descChanged = true;
      }
    });

    if (descChanged) {
      const next = Array.from(descSet).sort((a, b) => a.localeCompare(b, 'he-IL'));
      setGlobalDescriptionSuggestions(next);
      try {
        window.localStorage.setItem('financeDescriptionSuggestions', JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const handleMetaChange = (patch: Partial<FinancialExpenseSheet>) => {
    if (isReadOnly) return;
    setIsDirty(true);
    setSheet((prev) => ({ ...prev, ...patch }));
  };

  const handleLineChange = (index: number, patch: Partial<LineDraft>) => {
    if (isReadOnly) return;
    setIsDirty(true);
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch, sheetId: sheet.id };
      return next;
    });
  };

  const handleAddLine = () => {
    if (isReadOnly) return;
    setIsDirty(true);
    const newLine: LineDraft = {
      id: `tmp-${Date.now()}`,
      sheetId: sheet.id,
      kind: 'EXPENSE',
      expenseType: null,
      providerName: '',
      providerId: null,
      description: '',
      date: new Date().toISOString().slice(0, 10),
      quantity: 1,
      unitPrice: 0,
      vatRate: 18,
      isIncludedInRequestedAmount: true,
      lineNetAmount: null,
      lineVatAmount: null,
      lineTotalAmount: null,
      attachmentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLines((prev) => [...prev, newLine]);
  };

  const handleDeleteLine = (index: number) => {
    if (isReadOnly) return;
    setIsDirty(true);
    const target = lines[index];
    if (!target) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
    if (!target.id.startsWith('tmp-')) {
      // Persist deletion immediately
      void financialExpensesClient.deleteLineItem(user, sheet.id, target.id);
    }
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (isReadOnly) return;
    const files = Array.from(fileList);
    if (!files.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const created = await financialExpensesClient.addAttachment(user, sheet.id, {
        fileKey: dataUrl,
        originalFileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      if (created) {
        setIsDirty(true);
        setAttachments((prev) => [...prev, created]);
      }
    }
  };

  const handleAttachmentUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const { files } = e.target;
    if (!files || !files.length) return;

    await uploadFiles(files);

    // reset input
    e.target.value = '';
  };

  const handleAttachmentDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { files } = e.dataTransfer;
    if (!files || !files.length) return;

    await uploadFiles(files);
  };

  const handleLinkAttachment = async (line: LineDraft, attachmentId: string | null) => {
    if (isReadOnly) return;
    setIsDirty(true);
    const targetAttachmentId = attachmentId || '';
    try {
      const updated = await financialExpensesClient.linkAttachmentToLineItem(
        user,
        sheet.id,
        targetAttachmentId,
        attachmentId ? line.id : null,
      );

      // תמיד נעדכן את ה־state המקומי בצורה אופטימית כדי שאיריס תראה מיד את הקישור,
      // גם אם הקריאה ל‑backend נכשלת (למשל בגלל נתוני ביניים).
      setAttachments((prev) =>
        prev.map((att) => {
          if (updated && att.id === updated.id) {
            return updated;
          }
          if (!updated && att.id === targetAttachmentId) {
            return { ...att, linkedLineItemId: attachmentId ? line.id : null };
          }
          return att;
        }),
      );
      setLines((prev) =>
        prev.map((l) =>
          l.id === line.id
            ? { ...l, attachmentId: attachmentId || null }
            : l.id === line.attachmentId && !attachmentId
              ? { ...l, attachmentId: null }
              : l,
        ),
      );

      // הצגת אישור ברור על שיוך / הסרה של נספח
      if (attachmentId) {
        setSaveMessage('נספח / חשבונית שויך בהצלחה לשורה זו.');
      } else {
        setSaveMessage('שיוך הנספח לשורה זו הוסר.');
      }
    } catch (err) {
      console.error('Failed to link attachment to line item', err);
    }
  };

  const handleSaveDraft = async () => {
    if (isReadOnly) return;

    if (isAdminEditingPaid) {
      const reason = adminEditReason.trim();
      if (!reason) {
        setSaveMessage('נדרשת סיבת השינוי (חובה כאשר עורכים הוצאה שסומנה כשולמה).');
        return;
      }
      financialExpensesClient.recordAdminEditAfterPaid(user, sheet.id, reason);
    }

    const requiresConfirm =
      (user.role === 'SUB_ADMIN' || user.role === 'ADMIN') &&
      !isAdminEditingPaid &&
      (sheet.status === 'READY_FOR_REPORT' ||
        sheet.status === 'ATTACHED_TO_REPORT' ||
        sheet.status === 'ARCHIVED');

    if (requiresConfirm) {
      const ok = window.confirm(
        'הטבלה נמצאת כבר במצב מתקדם (מוכן לדיווח / שובץ בדוח / ארכיון).\nשינוי הנתונים עלול להשפיע על דרישה כספית שכבר שובצה בדוח.\n\nלהמשיך בעריכה ושמירה?',
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Persist meta
      const nextSheet = await financialExpensesClient.updateSheetMeta(user, sheet.id, {
        insurerName: sheet.insurerName,
        periodLabel: sheet.periodLabel,
        deductibleAmount: sheet.deductibleAmount ?? 0,
        alreadyPaidAmount: sheet.alreadyPaidAmount ?? 0,
        infoOnly: sheet.infoOnly,
      });

      // Persist lines – add new ones and update existing
      // (deletions כבר טופלו onDeleteLine)
      const persistedLines: FinancialExpenseLineItem[] = [];
      // Update / create
      for (const line of lines) {
        if (line.id.startsWith('tmp-')) {
          const created = await financialExpensesClient.addLineItem(user, sheet.id, {
            kind: line.kind,
            expenseType: line.expenseType,
            providerName: line.providerName,
            providerId: line.providerId,
            description: line.description,
            date: line.date,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            isIncludedInRequestedAmount: line.isIncludedInRequestedAmount,
            lineNetAmount: line.lineNetAmount,
            lineVatAmount: line.lineVatAmount,
            lineTotalAmount: line.lineTotalAmount,
            attachmentId: line.attachmentId,
          });
          if (created) {
            persistedLines.push(created);
          }
        } else {
          const updated = await financialExpensesClient.updateLineItem(
            user,
            sheet.id,
            line.id,
            {
              kind: line.kind,
              expenseType: line.expenseType,
              providerName: line.providerName,
              providerId: line.providerId,
              description: line.description,
              date: line.date,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              isIncludedInRequestedAmount: line.isIncludedInRequestedAmount,
              lineNetAmount: line.lineNetAmount,
              lineVatAmount: line.lineVatAmount,
              lineTotalAmount: line.lineTotalAmount,
              attachmentId: line.attachmentId,
            },
          );
          if (updated) {
            persistedLines.push(updated);
          }
        }
      }

      const refreshed =
        (await financialExpensesClient.getSheet(sheet.id)) ||
        ({ sheet: nextSheet || sheet, lineItems: persistedLines, attachments: [] } as SheetWithRelations);

      onSheetUpdated(refreshed);
      setIsDirty(false);
      setSaveMessage('הטיוטה נשמרה בהצלחה.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackClick = () => {
    if (isDirty) {
      const ok = window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?');
      if (!ok) return;
    }
    onBack();
  };

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const isOfficialSheet =
    getOfficialSheetIdForCase(sheet.caseId) === sheet.id;
  const statusLabelHe = getFinancialExpenseStatusLabelHe(
    sheet,
    linkedReportForLawyer,
  );

  const handleMarkReadyAndNotify = async () => {
    setSaving(true);
    try {
      const ruleset = await financialExpensesClient.getRulesetForSheet(sheet);
      // משתמשים ב-validateForDraft כדי לא לחסום לפי סטטוס,
      // אלא רק על בסיס תוכן (ספק, תיאור, סכומים וכו').
      const result = validateForDraft({
        sheet,
        lineItems: lines,
        attachments,
        ruleset,
      });

      // Treat missing attachments as warning only – לא חוסם שליחה לעו״ד
      const normalizedIssues = result.issues.map((issue) =>
        issue.code === 'MISSING_ATTACHMENT_REQUIRED' && issue.severity === 'ERROR'
          ? { ...issue, severity: 'WARNING' }
          : issue,
      );
      setIssues(normalizedIssues);

      const blockingIssues = normalizedIssues.filter(
        (i) => i.severity === 'ERROR' && i.code !== 'MISSING_ATTACHMENT_REQUIRED',
      );

      if (blockingIssues.length) {
        const msg = blockingIssues
          .map((i) => `• ${i.messageHe}`)
          .join('\n');
        setIssuesDialogMessage(msg);
        setIssuesDialogOpen(true);
        setSaveMessage('לא ניתן לסמן את הגיליון כמוכן – יש שגיאות שיש לתקן.');
        return;
      }

      const updatedSheet = await financialExpensesClient.recordReadyAttempt(user, {
        sheetId: sheet.id,
        success: true,
        decisionLog: result.decisionLog,
      });

      if (updatedSheet) {
        setSheet(updatedSheet);
        const refreshed =
          (await financialExpensesClient.getSheet(updatedSheet.id)) ||
          ({ sheet: updatedSheet, lineItems: lines, attachments } as SheetWithRelations);
        onSheetUpdated(refreshed);
        if (onNotifyLawyer) {
          onNotifyLawyer({
            caseId: updatedSheet.caseId,
            sheetId: updatedSheet.id,
            lawyerId: selectedLawyerId === 'AUTO' ? undefined : selectedLawyerId,
          });
        }
        const lawyerName =
          selectedLawyerId === 'AUTO'
            ? linkedReportForLawyer?.ownerName || 'העו״ד המטפלת בתיק'
            : linkedReportForLawyer?.ownerName || 'העו״ד שנבחרה';
        setSaveMessage(
          `הגיליון סומן כמוכן לדיווח ונשלחה הודעה אל ${lawyerName} עבור תיק ${updatedSheet.caseId}.`,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
      sheet.id,
      new Date().toISOString(),
    );
    if (!snapshot) return;
    const { effectiveSheet: eff, allLines, opts } = snapshot;
    const { html } = renderExpensesTableHtml(eff, allLines, opts);
    setPreviewHtml(html);
  };

  const hasLineIssue = (lineId: string) => linesWithIssues.has(lineId);

  const providerSuggestions = useMemo(() => {
    const names = new Set<string>(globalProviderSuggestions);
    lines.forEach((line) => {
      if (line.providerName) {
        names.add(line.providerName);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'he-IL'));
  }, [lines, globalProviderSuggestions]);

  const descriptionSuggestions = useMemo(() => {
    const values = new Set<string>(globalDescriptionSuggestions);
    lines.forEach((line) => {
      if (line.description) {
        values.add(line.description);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'he-IL'));
  }, [lines, globalDescriptionSuggestions]);

  const handleExportJson = () => {
    const payload = {
      sheet,
      lineItems: lines,
      attachments,
      totals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${sheet.caseId || sheet.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = [
      'LineId',
      'Date',
      'Provider',
      'Description',
      'Quantity',
      'UnitPrice',
      'VatRate',
      'IncludedInRequest',
      'LineTotal',
    ];
    const rows = lines.map((line) => [
      line.id,
      line.date || '',
      (line.providerName || '').replace(/"/g, '""'),
      (line.description || '').replace(/"/g, '""'),
      line.quantity ?? '',
      line.unitPrice ?? '',
      line.vatRate ?? '',
      line.isIncludedInRequestedAmount !== false ? 'YES' : 'NO',
      line.lineTotalAmount ?? '',
    ]);

    const csv = [
      header.join(','),
      ...rows.map((cols) =>
        cols
          .map((value) => {
            const str = String(value ?? '');
            return /[",\n]/.test(str) ? `"${str}"` : str;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${sheet.caseId || sheet.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const candidateLawyers = useMemo(() => {
    if (!linkedReportForLawyer) return [];
    return [
      {
        id: linkedReportForLawyer.createdBy,
        name: linkedReportForLawyer.ownerName || 'עו"ד בתיק',
      },
    ];
  }, [linkedReportForLawyer]);

  return (
    <div className="flex flex-col gap-4">
      {isLockedByPaid && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {isReadOnly ? (
            <div>
              <strong>הדיווח סומן כשולם ולכן הגיליון נעול לעריכה.</strong>
              <p className="mt-1 text-amber-800">
                רק ADMIN יכול לתקן עם הערה.
              </p>
            </div>
          ) : (
            <div>
              <strong>עריכת הוצאה שסומנה כשולמה (ADMIN).</strong>
              <p className="mt-2 text-amber-800">חובה להזין סיבת השינוי לפני שמירה.</p>
              <input
                type="text"
                className="mt-2 w-full max-w-md border border-amber-300 rounded px-3 py-1.5 text-sm"
                placeholder="סיבת השינוי (חובה)"
                value={adminEditReason}
                onChange={(e) => setAdminEditReason(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            טבלת הוצאות לתיק: <span className="font-mono">{sheet.caseId}</span>
            {isOfficialSheet ? (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                רשמי
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                היסטורי
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            סטטוס: <span className="font-medium">{statusLabelHe}</span>
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end items-center">
          {candidateLawyers.length > 0 && (
            <div className="text-xs text-gray-700">
              <label className="block mb-1 font-medium">
                לבחור למי לשלוח את הדיווח הכספי
              </label>
              <select
                className="border rounded px-2 py-1 text-xs bg-white"
                value={selectedLawyerId}
                onChange={(e) =>
                  setSelectedLawyerId(
                    (e.target.value || 'AUTO') as typeof selectedLawyerId,
                  )
                }
              >
                <option value="AUTO">בחירה אוטומטית לפי הדו"ח האחרון בתיק</option>
                {candidateLawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={handleBackClick}
          >
            חזרה לרשימה
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={handlePreview}
          >
            תצוגה מקדימה
          </button>
          {!isReadOnly && (
            <button
              type="button"
              className="px-4 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={handleMarkReadyAndNotify}
              disabled={saving}
            >
              סיימתי – שלח לעו״ד
            </button>
          )}
          <button
            type="button"
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSaveDraft}
            disabled={saving || isReadOnly}
          >
            {saving
              ? 'שומר…'
              : isDirty
              ? 'שמור טיוטה (יש שינויים)'
              : 'נשמר ✓'}
          </button>
          {user.role === 'ADMIN' && (
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleExportJson}
            >
              יצוא JSON
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={handleExportCsv}
          >
            יצוא ל‑Excel (CSV)
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {saveMessage}
        </div>
      )}

      {previewHtml && (
        <div className="mt-2 rounded border border-gray-300 bg-white px-3 py-3 text-sm text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-gray-800">Expenses Table – Preview</span>
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setPreviewHtml(null)}
            >
              סגור
            </button>
          </div>
          <div
            className="overflow-x-auto text-base"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border rounded-lg p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            מבטחת
          </label>
          <input
            className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            value={sheet.insurerName || ''}
            onChange={(e) => handleMetaChange({ insurerName: e.target.value })}
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            תקופה / תיאור
          </label>
          <input
            className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            value={sheet.periodLabel || ''}
            onChange={(e) => handleMetaChange({ periodLabel: e.target.value })}
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            השתתפות עצמית
          </label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            value={sheet.deductibleAmount ?? 0}
            onChange={(e) => {
              const value = Number(e.target.value);
              const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
              handleMetaChange({ deductibleAmount: safe });
            }}
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            שולם ע״י המבטחת
          </label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm bg-gray-50"
            value={paidToDate}
            readOnly
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            id="infoOnly"
            type="checkbox"
            checked={sheet.infoOnly}
            onChange={(e) => handleMetaChange({ infoOnly: e.target.checked })}
            disabled={isReadOnly}
          />
          <label htmlFor="infoOnly" className="text-sm text-gray-800">
            דיווח לידיעה בלבד (ללא בקשה לתשלום)
          </label>
        </div>
      </div>

      {/* Totals summary – current sheet only */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-gray-700 px-1">
          <span className="font-semibold">
            סיכום לדיווח הנוכחי בלבד (שורות הגיליון הזה)
          </span>
          <span className="text-gray-500">
            הטבלה הרשמית בדו״ח / PDF היא מצטברת לכל ההיסטוריה בתיק.
          </span>
        </div>
        <div className="flex flex-wrap gap-4 items-center bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
          <div>
            <div className="text-gray-600">סך הוצאות בדיווח זה</div>
            <div className="font-semibold">
              {totals.grossExpensesTotal.toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div>
            <div className="text-gray-600">קיזוזים בדיווח זה (השתתפות עצמית + שולם + התאמות)</div>
            <div className="font-semibold">
              {totals.adjustmentsTotal.toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div>
            <div className="text-gray-600">סכום להזמנה בדיווח זה (לפני סעיפים לידיעה בלבד)</div>
            <div className="font-semibold">
              {totals.amountBeforeInfoOnly.toLocaleString('he-IL')} ₪
            </div>
          </div>
          <div>
            <div className="text-gray-600">סכום להזמנה בדיווח זה</div>
            <div className="font-semibold text-blue-700">
              {totals.amountToRequest.toLocaleString('he-IL')} ₪
            </div>
          </div>
          {totals.infoOnlyApplied && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              לידיעה בלבד (ללא בקשה לתשלום)
            </span>
          )}
        </div>
        <div className="px-1 text-[11px] text-gray-500">
          שימי לב: המספרים בסרגל זה מחושבים רק לפי שורות הגיליון הנוכחי. הפלט הרשמי
          (Expenses Table) שישובץ בדו״ח וב-PDF כולל גם הוצאות היסטוריות וכל התשלומים שנרשמו
          לתיק.
        </div>
      </div>

      {cumulativeTotals && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-700 px-1">
            <span className="font-semibold">סיכום מצטבר לתיק (היסטוריה + דיווח נוכחי)</span>
          </div>
          <div className="flex flex-wrap gap-4 items-center bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm">
            <div>
              <div className="text-slate-600">סה״כ הוצאות מצטבר בתיק</div>
              <div className="font-semibold">
                {cumulativeTotals.grossExpensesTotal.toLocaleString('he-IL')} ₪
              </div>
            </div>
            <div>
              <div className="text-slate-600">קיזוזים מצטברים (השתתפות עצמית + שולם + התאמות)</div>
              <div className="font-semibold">
                {cumulativeTotals.adjustmentsTotal.toLocaleString('he-IL')} ₪
              </div>
            </div>
            <div>
              <div className="text-slate-600">שולם עד כה בתיק</div>
              <div className="font-semibold">
                {paidToDate.toLocaleString('he-IL')} ₪
              </div>
            </div>
            <div>
              <div className="text-slate-600">יתרה לתשלום / לבקשה (מצטבר)</div>
              <div className="font-semibold text-indigo-700">
                {cumulativeTotals.amountToRequest.toLocaleString('he-IL')} ₪
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick help */}
      <div className="mt-2 text-xs text-gray-500 bg-white border border-dashed border-gray-300 rounded-md p-2">
        <span className="font-semibold mr-1">עזרה קצרה:</span>
        מלאי שורה לכל הוצאה (ספק, תיאור, תאריך, כמות, מחיר ומע״מ). הסרגל הכחול מסכם את
        הגיליון הנוכחי בלבד, בעוד הטבלה המצורפת לדו״ח מציגה תמונת מצב מצטברת לכל ההוצאות
        והתשלומים בתיק.
      </div>

      {/* Attachments */}
      <div
        className="bg-white border rounded-lg p-4 shadow-sm flex flex-col gap-2 text-sm"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleAttachmentDrop}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium text-gray-900">נספחים</div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-blue-700 hover:text-blue-800">
            <span className="px-2 py-1 border border-blue-400 rounded bg-blue-50">
              צרף נספח
            </span>
            <input
              type="file"
              className="hidden"
              multiple
              onChange={handleAttachmentUpload}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          ניתן לבחור קבצים מהמחשב או לגרור ולשחרר אותם לאזור זה.
        </p>
        {attachments.length === 0 ? (
          <div className="text-gray-500 text-xs">לא הועלו נספחים לגיליון זה.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {attachments.map((att) => (
              <li key={att.id} className="py-1 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-gray-900 text-xs">{att.originalFileName}</span>
                  <span className="text-gray-500 text-[11px]">
                    גודל: {att.sizeBytes != null ? `${(att.sizeBytes / 1024).toFixed(1)} KB` : 'לא ידוע'} · הועלה{' '}
                    {att.uploadedAt
                      ? new Date(att.uploadedAt).toLocaleString('he-IL', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-blue-700 hover:underline"
                  onClick={() => {
                    if (att.fileKey.startsWith('data:')) {
                      window.open(att.fileKey, '_blank');
                    }
                  }}
                >
                  צפייה / הורדה
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <div className="font-semibold text-red-800 mb-1">בעיות שזוהו בגיליון:</div>
          <ul className="list-disc pr-5 space-y-0.5">
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.scope}-${issue.entityId || 'sheet'}`}>
                <span className="font-mono text-xs text-gray-500 ml-1">
                  [{issue.severity}]
                </span>
                <span className="text-red-900"> {issue.messageHe}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lines table */}
      <div className="bg-white border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 border-b text-right">סוג</th>
              <th className="px-2 py-1 border-b text-right">ספק</th>
              <th className="px-2 py-1 border-b text-right">תיאור</th>
              <th className="px-2 py-1 border-b text-right">תאריך</th>
              <th className="px-2 py-1 border-b text-right">כמות</th>
              <th className="px-2 py-1 border-b text-right">מחיר יחידה</th>
              <th className="px-2 py-1 border-b text-right">מע״מ %</th>
              <th className="px-2 py-1 border-b text-right">נכלל בבקשה</th>
              <th className="px-2 py-1 border-b text-right">סה״כ שורה</th>
              <th className="px-2 py-1 border-b text-right">נספח</th>
              <th className="px-2 py-1 border-b" />
            </tr>
          </thead>
          <tbody>
            {historicalExpenseLines.length > 0 && (
              <tr>
                <td
                  className="px-2 py-1 border-b text-xs text-slate-600 bg-slate-50"
                  colSpan={9}
                >
                  הוצאות קודמות (לקריאה בלבד) – מסוכמות מגיליונות קודמים בתיק זה.
                </td>
              </tr>
            )}
            {historicalExpenseLines.map((line, index) => {
              if (line.kind !== 'EXPENSE') return null;
              const lineTotal =
                line.lineTotalAmount ??
                ((line.quantity ?? 0) * (line.unitPrice ?? 0) *
                  (1 + (line.vatRate ?? 0) / 100));

              return (
                <tr
                  key={`hist-${line.id}-${index}`}
                  className="bg-slate-50 text-slate-700"
                >
                  <td className="px-2 py-1 border-b text-[11px] text-slate-500">
                    היסטוריה
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {line.providerName || ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {line.description || ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs whitespace-nowrap">
                    {line.date || ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {line.quantity ?? ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {line.unitPrice ?? ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {line.vatRate ?? ''}
                  </td>
                  <td className="px-2 py-1 border-b text-xs">
                    {Number.isFinite(lineTotal)
                      ? lineTotal.toLocaleString('he-IL')
                      : ''}
                  </td>
                  <td className="px-2 py-1 border-b text-[11px] text-slate-400">
                    מדיווח קודם
                  </td>
                </tr>
              );
            })}

            {lines.map((line, index) => {
              const hasIssue = hasLineIssue(line.id);
              const linkedAttachment = attachments.find(
                (att) => att.id === line.attachmentId,
              );
              const isCompensation = line.kind === 'COMPENSATION';
              const isNewExpense = line.kind === 'EXPENSE';
              const kindValue =
                line.kind === 'COMPENSATION'
                  ? line.compensationSource === 'COURT'
                    ? 'COMPENSATION_COURT'
                    : 'COMPENSATION_SETTLEMENT'
                  : line.kind;

              return (
                <tr
                  key={line.id}
                  className={`${hasIssue ? 'bg-red-50 text-gray-900' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                    isNewExpense ? 'border-l-4 border-emerald-300 bg-emerald-50/60 text-gray-900' : ''
                  }`}
                >
                  <td className="px-2 py-1 border-b">
                    <select
                      className="border rounded px-1 py-0.5 text-xs"
                      value={kindValue}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'EXPENSE') {
                          handleLineChange(index, {
                            kind: 'EXPENSE',
                            compensationSource: null,
                            // בשורת הוצאה חוזרת – השאר שדות רלוונטיים לעריכה
                          });
                        } else if (value === 'ADJUSTMENT') {
                          handleLineChange(index, {
                            kind: 'ADJUSTMENT',
                            compensationSource: null,
                            // התאמות אינן דורשות שינוי שדות ספק/מע״מ
                          });
                        } else if (value === 'COMPENSATION_SETTLEMENT') {
                          handleLineChange(index, {
                            kind: 'COMPENSATION',
                            compensationSource: 'SETTLEMENT',
                            // עבור פיצויים – ננקה שדות שאינם רלוונטיים
                            providerName: '',
                            expenseType: null,
                            vatRate: 0,
                            quantity: 1,
                          });
                        } else if (value === 'COMPENSATION_COURT') {
                          handleLineChange(index, {
                            kind: 'COMPENSATION',
                            compensationSource: 'COURT',
                            providerName: '',
                            expenseType: null,
                            vatRate: 0,
                            quantity: 1,
                          });
                        }
                      }}
                    >
                      <option value="EXPENSE">Expense</option>
                      <option value="COMPENSATION_SETTLEMENT">Compensation pursuant to a settlement</option>
                      <option value="COMPENSATION_COURT">Compensation pursuant to a judgment</option>
                      <option value="ADJUSTMENT">Adjustment</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 border-b">
                    {isCompensation ? (
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        לא רלוונטי בפיצוי
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        {isNewExpense && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] px-2 py-[1px]">
                            חדש
                          </span>
                        )}
                        <input
                          list="provider-suggestions"
                          className="border rounded px-1 py-0.5 w-32 text-xs"
                          placeholder="בחר ספק"
                          value={line.providerName || ''}
                          onChange={(e) =>
                            handleLineChange(index, { providerName: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1 border-b">
                    <input
                      className="border rounded px-1 py-0.5 w-64 text-xs"
                      list="description-suggestions"
                      value={line.description}
                      onChange={(e) =>
                        handleLineChange(index, { description: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-1 border-b">
                    <input
                      type="date"
                      className="border rounded px-1 py-0.5 text-xs"
                      value={line.date || ''}
                      onChange={(e) =>
                        handleLineChange(index, { date: e.target.value || null })
                      }
                    />
                  </td>
                  <td className="px-2 py-1 border-b">
                    <input
                      type="number"
                      className="border rounded px-1 py-0.5 w-20 text-xs disabled:bg-gray-100 disabled:text-gray-400"
                      value={line.quantity ?? 1}
                      disabled={isCompensation}
                      onChange={(e) => {
                        if (isCompensation) return;
                        const value = Number(e.target.value);
                        const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
                        handleLineChange(index, { quantity: safe });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 border-b">
                    <input
                      type="number"
                      className="border rounded px-1 py-0.5 w-24 text-xs"
                      value={line.unitPrice ?? 0}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
                        handleLineChange(index, { unitPrice: safe });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 border-b">
                    <input
                      type="number"
                      className="border rounded px-1 py-0.5 w-16 text-xs disabled:bg-gray-100 disabled:text-gray-400"
                      value={line.vatRate ?? 0}
                      disabled={isCompensation}
                      onChange={(e) => {
                        if (isCompensation) return;
                        const value = Number(e.target.value);
                        const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
                        handleLineChange(index, { vatRate: safe });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 border-b text-center">
                    <input
                      type="checkbox"
                      checked={line.isIncludedInRequestedAmount !== false}
                      onChange={(e) =>
                        handleLineChange(index, {
                          isIncludedInRequestedAmount: e.target.checked,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1 border-b text-left font-mono text-xs">
                    {line.lineTotalAmount != null
                      ? line.lineTotalAmount.toLocaleString('he-IL')
                      : ''}
                  </td>
                  <td className="px-2 py-1 border-b text-right">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        className="border rounded px-1 py-0.5 text-xs max-w-[190px]"
                        value={line.attachmentId || ''}
                        title={
                          linkedAttachment
                            ? `נספח משויך: ${linkedAttachment.originalFileName}`
                            : 'בחר נספח לשורה זו'
                        }
                        onChange={(e) =>
                          void handleLinkAttachment(
                            line,
                            e.target.value ? e.target.value : null,
                          )
                        }
                      >
                        <option value="">
                          {attachments.length
                            ? 'בחר נספח לשורה זו…'
                            : 'אין נספחים זמינים'}
                        </option>
                        {attachments.map((att) => (
                          <option key={att.id} value={att.id}>
                            {att.originalFileName}
                          </option>
                        ))}
                      </select>
                      {line.attachmentId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold whitespace-nowrap">
                          <span className="text-emerald-600">✓</span>
                          <span>נספח משויך</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 whitespace-nowrap">
                          אין נספח
                        </span>
                      )}
                    </div>
                    {linkedAttachment && (
                      <div className="mt-0.5 text-[11px] text-gray-700 text-left">
                        <span className="text-gray-500">קובץ:</span>{' '}
                        <span className="font-mono break-all">{linkedAttachment.originalFileName}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1 border-b text-center">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                      onClick={() => handleDeleteLine(index)}
                      disabled={isReadOnly}
                    >
                      מחק
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="provider-suggestions">
          {providerSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id="description-suggestions">
          {descriptionSuggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <div className="p-2">
          <button
            type="button"
            className="px-3 py-1 text-xs rounded border border-dashed border-gray-400 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAddLine}
            disabled={isReadOnly}
          >
            הוסף שורה
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-slate-800">תשלומים שהתקבלו</span>
          <span className="text-slate-700">
            סה״כ שולם עד כה בתיק: ₪{paidToDate.toLocaleString('he-IL')}
          </span>
        </div>
        <PaymentEventsPanel
          user={user}
          sheet={sheet}
          paymentEvents={paymentEvents}
          onChangeEvents={setPaymentEvents}
        />
      </div>

      {caseHistory.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-slate-800">היסטוריה פיננסית לתיק</span>
            <span className="text-slate-500">
              מוצגים עד {caseHistory.length} גליונות קודמים לתיק זה
            </span>
          </div>
          <div className="space-y-2">
            {caseHistory.map((h) => (
              <div
                key={h.id}
                className="rounded border border-slate-200 bg-white px-2 py-1 flex flex-wrap gap-x-4 gap-y-1 items-baseline"
              >
                <span className="font-semibold text-slate-800">
                  גיליון #{h.versionIndex || 1}
                </span>
                <span className="text-slate-600">
                  סטטוס: {getFinancialExpenseStatusLabelHeRaw(h.status)}
                </span>
                <span className="text-slate-500">
                  עודכן:{' '}
                  {new Date(h.updatedAt || h.createdAt).toLocaleString('he-IL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="text-slate-700">
                  השתתפות עצמית: ₪{h.deductibleAmount.toLocaleString('he-IL')}
                </span>
                <span className="text-slate-700">
                  שולם עד כה: ₪{h.alreadyPaidAmount.toLocaleString('he-IL')}
                </span>
                <span className="text-slate-700">
                  סכום לבקשה: ₪{h.amountToRequest.toLocaleString('he-IL')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={issuesDialogOpen}
        title="לא ניתן לשלוח לעורכת הדין"
        message={issuesDialogMessage ? `יש לתקן את השגיאות הבאות לפני השליחה:\n\n${issuesDialogMessage}` : 'יש שגיאות בגיליון שיש לתקן לפני השליחה.'}
        confirmText="הבנתי"
        cancelText="סגור"
        onConfirm={() => setIssuesDialogOpen(false)}
        onCancel={() => setIssuesDialogOpen(false)}
      />
    </div>
  );
};

export default FinanceExpenseSheetEditor;


