import React, { useEffect, useMemo, useState } from 'react';
import type {
  User,
  ReportData,
  LidorFinancialSheetListItem,
  LidorFinancialCounts,
  LidorFinancialKpis,
} from '../../../types';
import { financialExpensesClient } from '../../../services/financialExpensesClient';
import { logError } from '../../../utils/logging';
import type { SheetWithRelations } from '../../../services/financialExpensesClient';
import FinanceExpenseSheetEditor from '../../../components/finance/FinanceExpenseSheetEditor';

const tabs: { id: 'READY' | 'ATTACHED' | 'SENT' | 'EXCEPTIONS'; label: string }[] = [
  { id: 'READY', label: 'מוכן לדיווח' },
  { id: 'ATTACHED', label: 'שובץ בדוח' },
  { id: 'SENT', label: 'נשלח' },
  { id: 'EXCEPTIONS', label: 'חריגות' },
];

const statusHe: Record<string, string> = {
  DRAFT: 'טיוטה',
  READY_FOR_REPORT: 'מוכן לדיווח',
  ATTACHED_TO_REPORT: 'שובץ בדוח',
  ARCHIVED: 'ארכיון',
};

interface FinancialControlProps {
  user: User;
  reports: ReportData[];
  onOpenReport: (reportId: string) => void;
}

const FinancialControl: React.FC<FinancialControlProps> = ({ user, reports, onOpenReport }) => {
  const [activeTab, setActiveTab] = useState<'READY' | 'ATTACHED' | 'SENT' | 'EXCEPTIONS'>('READY');
  const [insurerFilter, setInsurerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [items, setItems] = useState<LidorFinancialSheetListItem[]>([]);
  const [counts, setCounts] = useState<LidorFinancialCounts | null>(null);
  const [kpis, setKpis] = useState<LidorFinancialKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<LidorFinancialSheetListItem | null>(null);
  const [editSheet, setEditSheet] = useState<SheetWithRelations | null>(null);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    sheet: any;
    lineItems: any[];
    attachments: any[];
    audit: any[];
    exceptionStatus: 'IN_PROGRESS' | 'RESOLVED' | null;
  } | null>(null);
  const [showFullAudit, setShowFullAudit] = useState(false);
  const [showHistoricalDecisions, setShowHistoricalDecisions] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const activeCount = useMemo(() => {
    if (!counts) return 0;
    switch (activeTab) {
      case 'READY':
        return counts.readyCount;
      case 'ATTACHED':
        return counts.attachedCount;
      case 'SENT':
        return counts.sentCount;
      case 'EXCEPTIONS':
        return counts.exceptionsCount;
      default:
        return 0;
    }
  }, [counts, activeTab]);

  const formatDuration = (hours: number | null | undefined): string => {
    if (hours == null) return '—';
    if (hours < 24) {
      return `${hours.toFixed(1)} שעות`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (remHours < 1) {
      return `${days} ימים`;
    }
    return `${days} ימים ${remHours.toFixed(1)} שעות`;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextCounts, nextKpis] = await Promise.all([
          financialExpensesClient.getLidorCounts(user, reports),
          financialExpensesClient.getLidorKpis(user, reports),
        ]);
        if (!cancelled) {
          setCounts(nextCounts);
          setKpis(nextKpis);
        }

        const params: any = {};
        // Tab -> status
        if (activeTab === 'READY') {
          params.status = 'READY_FOR_REPORT';
        } else if (activeTab === 'ATTACHED') {
          params.status = 'ATTACHED_TO_REPORT';
        }
        // Filters
        if (insurerFilter.trim()) params.insurerName = insurerFilter.trim();
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (searchTerm.trim()) params.caseIdOrSearch = searchTerm.trim();
        if (statusFilter) {
          params.status = statusFilter;
        }

        const list = await financialExpensesClient.listSheetsForLidor(user, params, reports);
        let filtered = list;
        if (activeTab === 'SENT') {
          filtered = list.filter((i) => i.sentAt);
        } else if (activeTab === 'EXCEPTIONS') {
          filtered = list.filter(
            (i) =>
              i.expensesOutOfSync ||
              (i.blockingIssueCodesLatest && i.blockingIssueCodesLatest.length > 0),
          );
        }
        if (!cancelled) {
          setItems(filtered);
          setSelectedSheet(null);
          setDetails(null);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('אירעה שגיאה בעת טעינת הנתונים. נסה/י שוב מאוחר יותר.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, reports, activeTab, insurerFilter, statusFilter, dateFrom, dateTo, searchTerm, reloadToken]);

  const handleSelectSheet = async (sheet: LidorFinancialSheetListItem) => {
    setSelectedSheet(sheet);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      const base = await financialExpensesClient.getSheet(sheet.sheetId);
      const audit = await financialExpensesClient.getSheetAuditForLidor(user, sheet.sheetId, 200);
      const exceptionStatus = await financialExpensesClient.getExceptionStatusForSheet(
        user,
        sheet.sheetId,
      );
      setDetails(
        base
          ? {
              sheet: base.sheet,
              lineItems: base.lineItems,
              attachments: base.attachments,
              audit,
              exceptionStatus,
            }
          : { sheet: null, lineItems: [], attachments: [], audit, exceptionStatus },
      );
    } catch (e) {
      console.error(e);
      setDetailsError('אירעה שגיאה בעת טעינת פרטי הגיליון.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenForEdit = () => {
    if (!details || !details.sheet) return;
    const base: SheetWithRelations = {
      sheet: details.sheet,
      lineItems: details.lineItems,
      attachments: details.attachments,
    };
    setEditSheet(base);
  };

  const handleExitEditMode = () => {
    setEditSheet(null);
    setReloadToken((prev) => prev + 1);
  };

  if (editSheet) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-4" dir="rtl">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">עריכת טבלת הוצאות (לידור)</h2>
            <p className="text-sm text-slate-600 mt-1">
              שינוי זה יישמר בהיסטוריית הגיליון ויופיע כעריכה שבוצעה על ידי משתמש מנהלי.
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-700 hover:bg-slate-100"
            onClick={handleExitEditMode}
          >
            חזרה למסך הבקרה
          </button>
        </header>
        <FinanceExpenseSheetEditor
          user={user}
          sheetWithRelations={editSheet}
          onSheetUpdated={(next) => {
            setEditSheet(next);
          }}
          onBack={handleExitEditMode}
        />
      </div>
    );
  }

  const handleChangeExceptionStatus = async (
    value: 'IN_PROGRESS' | 'RESOLVED',
  ) => {
    if (!selectedSheet || !details) return;
    try {
      await financialExpensesClient.setExceptionStatusForSheet(user, selectedSheet.sheetId, value);
      setDetails({ ...details, exceptionStatus: value });
    } catch (e) {
      logError('Failed to update financial exception status', e);
      setDetailsError('אירעה שגיאה בעת עדכון סטטוס החריגה.');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-4" dir="rtl">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">בקרה פיננסית</h2>
          <p className="text-sm text-slate-600 mt-1">
            מבט-על תפעולי על גיליונות הוצאות, סטטוסי דיווח וחריגות הדורשות תשומת לב.
          </p>
          {kpis && (
            <p className="mt-1 text-xs text-slate-500">
              סה״כ חריגות פעילות:{' '}
              {kpis.exceptions.divergenceOld.count +
                kpis.exceptions.missingAttachments.count +
                kpis.exceptions.repeatedBlocks.count}
            </p>
          )}
        </div>
      </header>

      {/* KPI cards */}
      {kpis && (
        <section className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-slate-500 mb-1">זמן ממוצע מטיוטה למוכן</p>
            <p className="text-sm font-semibold text-slate-900">
              {formatDuration(kpis.sla.draftToReadyAvgHours)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-slate-500 mb-1">זמן ממוצע ממוכן לשיבוץ</p>
            <p className="text-sm font-semibold text-slate-900">
              {formatDuration(kpis.sla.readyToAttachedAvgHours)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-slate-500 mb-1">זמן ממוצע משיבוץ לשליחה</p>
            <p className="text-sm font-semibold text-slate-900">
              {formatDuration(kpis.sla.attachedToSentAvgHours)}
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p className="text-slate-600 mb-1">סה״כ סכום מבוקש</p>
            <p className="text-sm font-semibold text-blue-800">
              {kpis.volumes.totalAmountRequested.toLocaleString('he-IL')} ₪
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {kpis.volumes.totalSheets || 0} גיליונות ·{' '}
              {kpis.volumes.totalSentReports || 0} דוחות שנשלחו
            </p>
          </div>
        </section>
      )}

      {/* Attention / exceptions */}
      {kpis && (
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">דורש תשומת לב</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition disabled:opacity-40 disabled:hover:bg-amber-50"
              disabled={kpis.exceptions.divergenceOld.count === 0}
              onClick={() => setActiveTab('EXCEPTIONS')}
            >
              <span>דפי הוצאות לא מסונכרנים ישנים</span>
              <span className="font-semibold">
                ({kpis.exceptions.divergenceOld.count})
              </span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition disabled:opacity-40 disabled:hover:bg-rose-50"
              disabled={kpis.exceptions.missingAttachments.count === 0}
              onClick={() => setActiveTab('EXCEPTIONS')}
            >
              <span>חסרי נספחים נדרשים</span>
              <span className="font-semibold">
                ({kpis.exceptions.missingAttachments.count})
              </span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 transition disabled:opacity-40 disabled:hover:bg-purple-50"
              disabled={kpis.exceptions.repeatedBlocks.count === 0}
              onClick={() => setActiveTab('EXCEPTIONS')}
            >
              <span>גיליונות עם חסימות חוזרות</span>
              <span className="font-semibold">
                ({kpis.exceptions.repeatedBlocks.count})
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${
              activeTab === tab.id
                ? 'bg-lpBlue text-white border-lpBlue'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>{tab.label}</span>
            {counts && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                {tab.id === 'READY' && counts.readyCount}
                {tab.id === 'ATTACHED' && counts.attachedCount}
                {tab.id === 'SENT' && counts.sentCount}
                {tab.id === 'EXCEPTIONS' && counts.exceptionsCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-sm">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">מבטחת</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5"
            placeholder="סינון לפי שם מבטחת"
            value={insurerFilter}
            onChange={(e) => setInsurerFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">סטטוס</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">הכל</option>
            <option value="DRAFT">טיוטה</option>
            <option value="READY_FOR_REPORT">מוכן לדיווח</option>
            <option value="ATTACHED_TO_REPORT">שובץ בדוח</option>
            <option value="ARCHIVED">ארכיון</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">טווח תאריכים</label>
          <div className="flex gap-2">
            <input
              type="date"
              className="w-1/2 border border-slate-200 rounded-lg px-2 py-1.5"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input
              type="date"
              className="w-1/2 border border-slate-200 rounded-lg px-2 py-1.5"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">חיפוש לפי תיק / ID</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5"
            placeholder='הקלד/י מספר תיק, עודכנית או מזהה דו"ח'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table or states */}
      {loading && (
        <div className="mt-6 text-sm text-slate-500 text-center">טוען נתונים…</div>
      )}
      {error && !loading && (
        <div className="mt-6 text-sm text-red-600 text-center">{error}</div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="mt-6 border border-dashed border-slate-300 rounded-xl py-10 flex flex-col items-center justify-center text-center text-sm text-slate-500">
          <p className="mb-1">אין נתונים להצגה</p>
          <p className="text-xs text-slate-400">
            נסה/י לשנות את המסננים או לבחור טאב אחר.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-right">תיק</th>
                <th className="px-3 py-2 text-right">מבטחת</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
                <th className="px-3 py-2 text-right">דיווח #</th>
                <th className="px-3 py-2 text-right">עודכן לאחרונה</th>
                <th className="px-3 py-2 text-right">סכום להזמנה</th>
                <th
                  className="px-3 py-2 text-right"
                  title="אם כן – הגיליון למידע בלבד ואינו יוצר סכום לתשלום"
                >
                  INFO_ONLY
                </th>
                <th
                  className="px-3 py-2 text-right"
                  title="מצב חריגות בין גיליון ההוצאות לדוח וולידציות המבטחת"
                >
                  חריגה
                </th>
                <th className="px-3 py-2 text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const hasMissingAttachments =
                  item.blockingIssueCodesLatest?.includes('MISSING_ATTACHMENT_REQUIRED');
                const hasDivergence = item.expensesOutOfSync;
                const hasOtherBlock = (item.blockingIssueCodesLatest || []).some(
                  (c) => c !== 'MISSING_ATTACHMENT_REQUIRED',
                );
                let exceptionLabel = '';
                if (hasDivergence) exceptionLabel = 'לא מסונכרן';
                else if (hasMissingAttachments) exceptionLabel = 'חסר נספח';
                else if (hasOtherBlock) exceptionLabel = 'נחסם';

                return (
                  <tr key={item.sheetId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-800">
                      {item.caseId}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800">
                      {item.insurerName || '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800 text-xs">
                      {statusHe[item.status] || item.status}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800 text-xs">
                      דיווח #{item.versionIndex}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 text-xs">
                      {new Date(item.updatedAt).toLocaleString('he-IL', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-700 font-semibold text-xs">
                      {item.amountToRequest.toLocaleString('he-IL')} ₪
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-700">
                      {item.infoOnly ? 'כן' : 'לא'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {exceptionLabel ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          {exceptionLabel}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left text-xs space-x-2 space-x-reverse">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                        onClick={() => handleSelectSheet(item)}
                      >
                        צפייה
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(item.sheetId).catch(() => {
                              // ignore
                            });
                          } else {
                            window.prompt('מזהה גיליון:', item.sheetId);
                          }
                        }}
                      >
                        העתק מזהה
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down */}
      {selectedSheet && (
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-900">
              פרטי גיליון – {selectedSheet.caseId} ({selectedSheet.sheetId})
            </h3>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(selectedSheet.sheetId).catch(() => {});
                  } else {
                    window.prompt('מזהה גיליון:', selectedSheet.sheetId);
                  }
                }}
              >
                העתק מזהה גיליון
              </button>
              {details?.sheet?.attachedToReportId && (
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    const id = details.sheet.attachedToReportId;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(id).catch(() => {});
                    } else {
                      window.prompt('מזהה דוח:', id);
                    }
                  }}
                >
                  העתק מזהה דוח
                </button>
              )}
              <button
                type="button"
                className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?financialSheetId=${encodeURIComponent(
                    selectedSheet.sheetId,
                  )}`;
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(url).catch(() => {});
                  } else {
                    window.prompt('קישור ישיר לגיליון:', url);
                  }
                }}
              >
                העתק קישור ישיר
              </button>
            </div>
          </div>
          {detailsLoading && (
            <p className="text-xs text-slate-500">טוען פרטים…</p>
          )}
          {detailsError && (
            <p className="text-xs text-red-600">{detailsError}</p>
          )}
          {!detailsLoading && details && details.sheet && (
            <div className="space-y-3 text-xs text-slate-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <span className="font-semibold">תיק:</span>{' '}
                  <span className="font-mono">{details.sheet.caseId}</span>
                </div>
                <div>
                  <span className="font-semibold">מבטחת:</span>{' '}
                  <span>{details.sheet.insurerName || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold">סטטוס:</span>{' '}
                  <span>{statusHe[details.sheet.status] || details.sheet.status}</span>
                </div>
                <div>
                  <span className="font-semibold">דיווח #:</span>{' '}
                  <span>{details.sheet.versionIndex}</span>
                </div>
                <div>
                  <span className="font-semibold">עודכן:</span>{' '}
                  <span>
                    {new Date(details.sheet.updatedAt).toLocaleString('he-IL', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">מוכן לדיווח:</span>{' '}
                  <span>{details.sheet.readyAt || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold">שובץ בדוח:</span>{' '}
                  <span>{details.sheet.attachedAt || '—'}</span>
                </div>
              </div>

              {/* Exception visual status */}
              <div className="mt-3">
                <h4 className="font-semibold text-slate-900 mb-1 text-xs">
                  סטטוס חריגה (סימון ויזואלי בלבד)
                </h4>
                <p className="text-[11px] text-slate-500 mb-1">
                  הסימון לא משנה את סטטוס הגיליון או החישובים, ומשמש רק למעקב פנימי של לידור.
                </p>
                <div className="inline-flex rounded-full bg-slate-100 p-1 text-[11px] font-semibold text-slate-700">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full transition ${
                      !details.exceptionStatus
                        ? 'bg-white shadow-sm text-slate-900'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    onClick={() => handleChangeExceptionStatus('IN_PROGRESS')}
                  >
                    בטיפול
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full transition ${
                      details.exceptionStatus === 'RESOLVED'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    onClick={() => handleChangeExceptionStatus('RESOLVED')}
                  >
                    טופל
                  </button>
                </div>
              </div>

              {/* Decision log summary */}
              {details.audit && details.audit.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold text-slate-900">Decision Logs</h4>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={showHistoricalDecisions}
                        onChange={(e) => setShowHistoricalDecisions(e.target.checked)}
                      />
                      <span>הצג Decision Logs היסטוריים</span>
                    </label>
                  </div>
                  {(() => {
                    const decisionEvents = details.audit
                      .filter((e: any) => e.diffJson && e.diffJson.decisionLog)
                      .sort(
                        (a: any, b: any) =>
                          new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime(),
                      );
                    if (!decisionEvents.length) {
                      return (
                        <p className="text-slate-500 text-[11px]">
                          אין החלטות וולידציה מתועדות.
                        </p>
                      );
                    }
                    const toRender = showHistoricalDecisions
                      ? decisionEvents
                      : [decisionEvents[0]];
                    return (
                      <div className="space-y-2 text-[11px]">
                        {toRender.map((ev: any, idx: number) => {
                          const decision = (ev.diffJson as any).decisionLog;
                          return (
                            <div
                              key={ev.id}
                              className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white/60"
                            >
                              {showHistoricalDecisions && (
                                <div className="flex items-center justify-between mb-0.5 text-[10px] text-slate-500">
                                  <span>
                                    {new Date(ev.eventAt).toLocaleString('he-IL', {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })}
                                  </span>
                                  <span>#{idx + 1}</span>
                                </div>
                              )}
                              <div className="space-y-1">
                                <div>
                                  <span
                                    className="font-semibold"
                                    title="סט כללי המבטחת החלים על גיליון זה"
                                  >
                                    Ruleset:
                                  </span>{' '}
                                  <span>
                                    {decision.rulesetId || '—'} (גרסה{' '}
                                    {decision.rulesetVersion || '-'})
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  <div>
                                    <span
                                      className={
                                        decision.checks.requiredFieldsOk
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }
                                    >
                                      {decision.checks.requiredFieldsOk ? '✔️' : '❌'}
                                    </span>{' '}
                                    <span>כל שדות החובה מולאו</span>
                                  </div>
                                  <div>
                                    <span
                                      className={
                                        decision.checks.sumsValid
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }
                                    >
                                      {decision.checks.sumsValid ? '✔️' : '❌'}
                                    </span>{' '}
                                    <span>הסכומים תקינים</span>
                                  </div>
                                  <div>
                                    <span
                                      className={
                                        decision.checks.attachmentsOk
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }
                                    >
                                      {decision.checks.attachmentsOk ? '✔️' : '⚠️'}
                                    </span>{' '}
                                    <span>נספחים מולאו לפי דרישות המבטחת</span>
                                  </div>
                                  <div>
                                    <span
                                      className={
                                        decision.checks.infoOnlyConsistent
                                          ? 'text-green-600'
                                          : 'text-red-600'
                                      }
                                    >
                                      {decision.checks.infoOnlyConsistent ? '✔️' : '❌'}
                                    </span>{' '}
                                    <span>התאמת INFO_ONLY</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="font-semibold">שגיאות חוסמות:</span>{' '}
                                  <span>
                                    {(
                                      decision.blockingIssueCodes ||
                                      decision.blockingIssueCodesLatest ||
                                      []
                                    ).join(', ') || 'אין'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Audit log summary */}
              {details.audit && details.audit.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold text-slate-900">Audit Log</h4>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={showFullAudit}
                        onChange={(e) => setShowFullAudit(e.target.checked)}
                      />
                      <span>הצג Audit Log מלא</span>
                    </label>
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-slate-700">
                    {(showFullAudit ? details.audit : details.audit.slice(0, 10)).map(
                      (e: any) => (
                        <li key={e.id}>
                          <span className="font-mono text-slate-500 mr-1">
                            {new Date(e.eventAt).toLocaleString('he-IL', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          · <span className="font-semibold">{e.eventType}</span> ·{' '}
                          <span className="text-slate-500">{e.actorRole}</span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

              {/* Linked report */}
              {details.sheet.attachedToReportId && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded border border-slate-300 text-xs text-slate-700 hover:bg-slate-100"
                    onClick={() => onOpenReport(details.sheet.attachedToReportId)}
                  >
                    פתח דוח משויך
                  </button>
                  <button
                    type="button"
                    className="ml-2 px-3 py-1.5 rounded border border-blue-500 text-xs text-blue-700 hover:bg-blue-50"
                    onClick={handleOpenForEdit}
                  >
                    ערוך טבלת הוצאות
                  </button>
                </div>
              )}
              {!details.sheet.attachedToReportId && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded border border-blue-500 text-xs text-blue-700 hover:bg-blue-50"
                    onClick={handleOpenForEdit}
                  >
                    ערוך טבלת הוצאות
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinancialControl;


