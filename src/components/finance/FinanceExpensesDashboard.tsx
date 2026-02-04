import React, { useEffect, useMemo, useState } from 'react';
import type { FinancialExpenseSheet, ReportData, User } from '../../types';
import { financialExpensesClient } from '../../services/financialExpensesClient';
import { getOfficialSheetIdForCase } from '../../services/financialExpensesData';
import { calculateSheetTotals, type SheetTotals } from '../../utils/financialExpensesCalculator';
import {
  getFinancialExpenseStatusLabelHe,
  FINANCIAL_STATUS_OPTIONS,
} from '../../utils/financialExpenseStatusLabels';
import FinanceExpenseSheetEditor from './FinanceExpenseSheetEditor';
import { normalizeOdakanitNo } from '../../utils/normalizeOdakanitNo';

interface Props {
  user: User;
  reports: ReportData[];
  onLogout: () => void;
  onNotifyLawyer?: (options: { caseId: string; sheetId: string; lawyerId?: string }) => void;
  onMarkReportPaid?: (reportId: string) => void;
  onSheetDeleted?: (sheetId: string) => void;
  onOpenAssistant?: () => void;
  caseFolders?: Record<string, import('../../types').CaseFolder>;
}

type StatusFilter = 'ALL' | FinancialExpenseSheet['status'];

const FinanceExpensesDashboard: React.FC<Props> = ({
  user,
  reports,
  onLogout,
  onNotifyLawyer,
  onMarkReportPaid,
  onSheetDeleted,
  onOpenAssistant,
  caseFolders,
}) => {
  const [sheets, setSheets] = useState<FinancialExpenseSheet[]>([]);
  const [deleteConfirmSheet, setDeleteConfirmSheet] = useState<{ sheet: FinancialExpenseSheet; reason: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [insurerFilter, setInsurerFilter] = useState('');
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [selectedSheetRelations, setSelectedSheetRelations] = useState<any | null>(null);
  const [totalsBySheetId, setTotalsBySheetId] = useState<Record<string, SheetTotals>>({});

  const loadSheets = async () => {
    setLoading(true);
    try {
      const all = await financialExpensesClient.listSheets();
      setSheets(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSheets();
  }, []);

  const latestReportBySheetId = useMemo(() => {
    const bySheet = new Map<string, ReportData>();
    reports.forEach((r) => {
      if (!r.expensesSheetId) return;
      const existing = bySheet.get(r.expensesSheetId);
      if (!existing) {
        bySheet.set(r.expensesSheetId, r);
        return;
      }
      const existingTime = existing.updatedAt
        ? new Date(existing.updatedAt).getTime() || 0
        : 0;
      const nextTime = r.updatedAt ? new Date(r.updatedAt).getTime() || 0 : 0;
      if (nextTime > existingTime) {
        bySheet.set(r.expensesSheetId, r);
      }
    });
    return bySheet;
  }, [reports]);

  const filteredSheets = useMemo(() => {
    const filtered = sheets.filter((sheet) => {
      if (statusFilter !== 'ALL' && sheet.status !== statusFilter) return false;
      const insurerTerm = insurerFilter.trim().toLowerCase();
      if (insurerTerm && !(sheet.insurerName || '').toLowerCase().includes(insurerTerm)) {
        return false;
      }
      return true;
    });
    // מיון: גיליון רשמי קודם, אחריו לפי זמן
    return [...filtered].sort((a, b) => {
      const officialA = getOfficialSheetIdForCase(a.caseId) === a.id ? 1 : 0;
      const officialB = getOfficialSheetIdForCase(b.caseId) === b.id ? 1 : 0;
      if (officialB !== officialA) return officialB - officialA;
      const ta = new Date(a.updatedAt || a.createdAt).getTime();
      const tb = new Date(b.updatedAt || b.createdAt).getTime();
      return tb - ta;
    });
  }, [sheets, statusFilter, insurerFilter]);

  // טוען סכומים לכל גיליון שמוצג ברשימה כדי למלא את עמודת "סכום להזמנה"
  useEffect(() => {
    const missingIds = filteredSheets
      .map((s) => s.id)
      .filter((id) => !totalsBySheetId[id]);
    if (!missingIds.length) return;

    missingIds.forEach((sheetId) => {
      void (async () => {
        try {
          const data = await financialExpensesClient.getSheet(sheetId);
          if (!data) return;
          const totals = calculateSheetTotals(data.sheet, data.lineItems);
          setTotalsBySheetId((prev) => ({
            ...prev,
            [sheetId]: totals,
          }));
        } catch {
          // אם טעינת הסכום נכשלת – נשאיר את התא ריק, ללא שבירת המסך
        }
      })();
    });
  }, [filteredSheets, totalsBySheetId]);

  const handleOpenSheet = async (sheetId: string) => {
    const data = await financialExpensesClient.getSheet(sheetId);
    if (!data) return;
    setSelectedSheetId(sheetId);
    setSelectedSheetRelations(data);
  };

  const handleCreateSheet = async () => {
    const caseIdInput = window.prompt('מספר תיק / עודכנית:') || '';
    const caseId = caseIdInput.trim();
    if (!caseId) return;

    // ננסה להסיק את שם המבטחת מתוך הדו"חות הקיימים בתיק (אותו odakanitNo)
    const normalizedCaseId = normalizeOdakanitNo(caseId);
    const matchingReports = reports.filter(
      (r) => normalizeOdakanitNo(r.odakanitNo || '') === normalizedCaseId,
    );

    let inferredInsurerName: string | null = null;
    if (matchingReports.length > 0) {
      const latest = matchingReports.reduce((prev, curr) => {
        const prevTime = prev.updatedAt
          ? new Date(prev.updatedAt).getTime() || 0
          : new Date(prev.reportDate || '').getTime() || 0;
        const currTime = curr.updatedAt
          ? new Date(curr.updatedAt).getTime() || 0
          : new Date(curr.reportDate || '').getTime() || 0;
        return currTime > prevTime ? curr : prev;
      });
      inferredInsurerName = latest.insurerName || null;
    }

    // Carry‑forward: ננסה למצוא גליונות קודמים לאותו caseId כדי להעתיק
    // deductibleAmount / alreadyPaidAmount ולחשב versionIndex תקין.
    let nextVersionIndex = 1;
    let carriedDeductible = 0;
    let carriedAlreadyPaid = 0;

    try {
      const allSheets = await financialExpensesClient.listSheets();
      const previousSheets = allSheets.filter(
        (s) => normalizeOdakanitNo(s.caseId) === normalizedCaseId,
      );

      if (previousSheets.length > 0) {
        // רשימת הגליונות כבר ממוינת בירידה לפי updatedAt/createdAt בשכבת הנתונים,
        // אבל נסדר שוב ליתר ביטחון לפי זמן.
        previousSheets.sort((a, b) => {
          const at = new Date(a.updatedAt || a.createdAt).getTime();
          const bt = new Date(b.updatedAt || b.createdAt).getTime();
          return bt - at;
        });

        const latestSheet = previousSheets[0];
        carriedDeductible = latestSheet.deductibleAmount ?? 0;
        carriedAlreadyPaid = latestSheet.alreadyPaidAmount ?? 0;

        const maxVersion = previousSheets.reduce(
          (max, sheet) => (sheet.versionIndex && sheet.versionIndex > max ? sheet.versionIndex : max),
          1,
        );
        nextVersionIndex = maxVersion + 1;
      }
    } catch {
      // אם לא הצלחנו לטעון היסטוריה – נישאר עם ברירת המחדל (1 ו‑0/0) בלי לחסום את איריס.
    }

    const sheet = await financialExpensesClient.createSheet(user, {
      caseId,
      insurerId: null,
      insurerName: inferredInsurerName,
      periodLabel: '',
      versionIndex: nextVersionIndex,
      currency: 'ILS',
      deductibleAmount: carriedDeductible,
      alreadyPaidAmount: carriedAlreadyPaid,
      infoOnly: false,
    });
    await loadSheets();
    await handleOpenSheet(sheet.id);
  };

  const handleSheetUpdated = (next: any) => {
    setSelectedSheetRelations(next);
    setSheets((prev) =>
      prev.map((s) => (s.id === next.sheet.id ? next.sheet : s)),
    );
    // עדכון סכום ההזמנה בדשבורד לאחר שאיריס שומרת שינויים בטופס
    try {
      const totals = calculateSheetTotals(next.sheet, next.lineItems);
      setTotalsBySheetId((prev) => ({
        ...prev,
        [next.sheet.id]: totals,
      }));
    } catch {
      // אם מסיבה כלשהי החישוב נכשל – לא נשבור את המסך, רק נשאיר את הערך הקודם
    }
  };

  const handleBackToList = () => {
    setSelectedSheetId(null);
    setSelectedSheetRelations(null);
  };

  if (selectedSheetId && selectedSheetRelations) {
    const linkedReport =
      latestReportBySheetId.get(selectedSheetRelations.sheet.id) || null;
    return (
<div className="w-full px-6 md:px-8 lg:px-10 xl:px-12 py-6">
          <FinanceExpenseSheetEditor
          user={user}
          sheetWithRelations={selectedSheetRelations}
          onSheetUpdated={handleSheetUpdated}
          onBack={handleBackToList}
          onNotifyLawyer={onNotifyLawyer}
          linkedReportForLawyer={linkedReport}
        />
      </div>
    );
  }

  return (
    <div className="w-full px-6 md:px-8 lg:px-10 xl:px-12 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">טבלאות הוצאות</h1>
          <p className="text-base text-gray-600 mt-1">
            ניהול גיליונות הוצאות לפי תיק ומבטחת עבור איריס (פיננסים).
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {onOpenAssistant && (
            <button
              type="button"
              className="px-3 py-1.5 text-base rounded border border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100"
              onClick={onOpenAssistant}
            >
              העוזר החכם
            </button>
          )}
          <button
            type="button"
            className="px-3 py-1.5 text-base rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={onLogout}
          >
            יציאה
          </button>
          <button
            type="button"
            className="px-4 py-1.5 text-base rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleCreateSheet}
          >
            צור טבלת הוצאות חדשה
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סינון לפי סטטוס
          </label>
          <select
            className="border rounded px-2 py-1 text-base"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value === 'ALL'
                  ? 'ALL'
                  : (e.target.value as FinancialExpenseSheet['status']),
              )
            }
          >
            <option value="ALL">הכל</option>
            {FINANCIAL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            מבטחת
          </label>
          <input
            className="border rounded px-2 py-1 text-base"
            placeholder="סינון לפי שם מבטחת…"
            value={insurerFilter}
            onChange={(e) => setInsurerFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-x-auto text-base">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 border-b text-right">תיק</th>
              <th className="px-3 py-2 border-b text-right">מבטחת</th>
              <th className="px-3 py-2 border-b text-right">גרסה</th>
              <th className="px-3 py-2 border-b text-right">סטטוס</th>
              <th className="px-3 py-2 border-b text-right">עודכן לאחרונה</th>
              <th className="px-3 py-2 border-b text-right">סכום להזמנה</th>
              <th className="px-3 py-2 border-b text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-gray-500">
                  טוען נתונים…
                </td>
              </tr>
            )}
            {!loading && filteredSheets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-gray-500">
                  אין טבלאות הוצאות תואמות לסינון.
                </td>
              </tr>
            )}
            {!loading &&
              filteredSheets.map((sheet) => {
                const linkedReport = latestReportBySheetId.get(sheet.id);
                const totals = totalsBySheetId[sheet.id];
                const lawyerStatusLabel = (() => {
                  if (!linkedReport) return '—';
                  if (linkedReport.status === 'TASK_ASSIGNED') {
                    return 'ממתין לעו״ד';
                  }
                  if (linkedReport.status === 'WAITING_FOR_INVOICES') {
                    return 'ממתין לחשבוניות';
                  }
                  if (linkedReport.status === 'READY_TO_SEND') {
                    return 'מוכן לשליחה לחברת הביטוח';
                  }
                  if (linkedReport.status === 'SENT') {
                    return 'נשלח לחברת הביטוח';
                  }
                  return 'טיוטה אצל עו״ד';
                })();

                const irisStatusLabel = getFinancialExpenseStatusLabelHe(
                  sheet,
                  linkedReport,
                );
                const isOfficialSheet =
                  getOfficialSheetIdForCase(sheet.caseId) === sheet.id;

                const caseStatusLabel = (() => {
                  const normalizedCase = normalizeOdakanitNo(sheet.caseId);
                  const folder = caseFolders?.[normalizedCase];
                  if (folder && folder.closedAt) {
                    return 'סגור';
                  }
                  if (!folder) {
                    const hasReports = reports.some(
                      (r) => normalizeOdakanitNo(r.odakanitNo) === normalizedCase,
                    );
                    if (!hasReports) {
                      return 'תיק לא נמצא';
                    }
                  }
                  return 'פעיל';
                })();

                return (
                  <tr key={sheet.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b font-mono text-sm text-gray-800">
                      <div className="flex flex-col items-start gap-0.5">
                        <span>{sheet.caseId}</span>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 border border-gray-200">
                          {caseStatusLabel === 'סגור'
                            ? 'התיק סגור'
                            : caseStatusLabel === 'תיק לא נמצא'
                            ? 'תיק לא נמצא'
                            : 'תיק פעיל'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b text-gray-800">
                      {sheet.insurerName || '—'}
                    </td>
                    <td className="px-3 py-2 border-b text-gray-800">
                      דיווח כספי #{sheet.versionIndex}
                    </td>
                    <td className="px-3 py-2 border-b">
                      <div className="flex flex-wrap items-center gap-1">
                        {isOfficialSheet ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                            רשמי
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            היסטורי
                          </span>
                        )}
                        <span className="inline-flex px-2 py-0.5 rounded-full text-sm bg-gray-100 text-gray-700 border border-gray-200">
                          {irisStatusLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b text-gray-700">
                      {sheet.updatedAt
                        ? new Date(sheet.updatedAt).toLocaleString('he-IL', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 border-b text-blue-700 font-semibold">
                      {totals
                        ? `${totals.amountToRequest.toLocaleString('he-IL')} ₪`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 border-b text-left">
                      <div className="flex items-center gap-2 justify-start">
                        <button
                          type="button"
                          className="px-3 py-1 text-sm rounded border border-blue-500 text-blue-700 hover:bg-blue-50"
                          onClick={() => void handleOpenSheet(sheet.id)}
                        >
                          פתח
                        </button>
                        {linkedReport && linkedReport.status === 'SENT' && !linkedReport.isPaid && onMarkReportPaid && (
                          <button
                            type="button"
                            className="px-3 py-1 text-sm rounded border border-green-500 text-green-700 hover:bg-green-50"
                            onClick={() => onMarkReportPaid(linkedReport.id)}
                          >
                            שולם
                          </button>
                        )}
                        {(() => {
                          const isLinkedToReport = reports.some((r) => r.expensesSheetId === sheet.id);
                          const linkedReportForDelete = reports.find((r) => r.expensesSheetId === sheet.id);
                          const isLinkedToPaidReport = Boolean(linkedReportForDelete?.isPaid);
                          const canDeleteNormally = !isLinkedToReport || !isLinkedToPaidReport;
                          const canDeleteAsAdmin = isLinkedToPaidReport && user.role === 'ADMIN';
                          const showDelete = canDeleteNormally || canDeleteAsAdmin;

                          if (!showDelete) {
                            return (
                              <span className="text-xs text-gray-500 max-w-[180px]">
                                לא ניתן למחוק גיליון שמשויך לדיווח ששולם.
                              </span>
                            );
                          }

                          const handleDeleteClick = () => {
                            if (canDeleteAsAdmin) {
                              setDeleteConfirmSheet({ sheet, reason: '' });
                            } else {
                              const ok = window.confirm('למחוק את טבלת ההוצאות הזו? לא ניתן לבטל.');
                              if (!ok) return;
                              void (async () => {
                                await financialExpensesClient.deleteSheet(sheet.id);
                                onSheetDeleted?.(sheet.id);
                                await loadSheets();
                              })();
                            }
                          };

                          return (
                            <button
                              type="button"
                              className="px-2 py-1 text-sm rounded border border-red-400 text-red-600 hover:bg-red-50"
                              onClick={handleDeleteClick}
                            >
                              🗑
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {deleteConfirmSheet && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">מחיקת גיליון משויך לדיווח ששולם</h3>
            <p className="text-sm text-gray-700 mb-4">חובה להזין סיבת המחיקה (תיעוד).</p>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm mb-4"
              placeholder="סיבת המחיקה"
              value={deleteConfirmSheet.reason}
              onChange={(e) =>
                setDeleteConfirmSheet((prev) => (prev ? { ...prev, reason: e.target.value } : null))
              }
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-gray-300 text-gray-700"
                onClick={() => setDeleteConfirmSheet(null)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-red-600 text-white disabled:opacity-50"
                disabled={!deleteConfirmSheet.reason.trim()}
                onClick={() => {
                  if (!deleteConfirmSheet.reason.trim()) return;
                  financialExpensesClient.recordSheetDeletionByAdmin(
                    user,
                    deleteConfirmSheet.sheet.id,
                    deleteConfirmSheet.reason.trim(),
                  );
                  void (async () => {
                    await financialExpensesClient.deleteSheet(deleteConfirmSheet.sheet.id);
                    onSheetDeleted?.(deleteConfirmSheet.sheet.id);
                    setDeleteConfirmSheet(null);
                    await loadSheets();
                  })();
                }}
              >
                מחק עם תיעוד
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceExpensesDashboard;


