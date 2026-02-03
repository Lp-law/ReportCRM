import React, { useEffect, useMemo, useState } from 'react';
import { Bell, HelpCircle, LogOut, Plus, Trash2 } from 'lucide-react';
import type { ReportData, ReportStatus, User, CaseFolder } from '../../types';
import { financialExpensesClient } from '../../services/financialExpensesClient';
import { calculateSheetTotals, type SheetTotals } from '../../utils/financialExpensesCalculator';
import DashboardStats from './DashboardStats';
import SearchAndFilters, { DashboardSortBy } from './SearchAndFilters';
import ActionList from './ActionList';
import EmptyState from './EmptyState';
import { getCaseKey } from './caseKey';
import { hasImmediateAction, getAlertLabelForReport, isNewCaseReport } from './workRules';

type NotificationEntry = {
  id: string;
  message: string;
  createdAt: string;
  reportId?: string;
  severity?: 'info' | 'warning' | 'error';
  targetUserId?: string;
};

type StatusBucket = 'ACTION_REQUIRED' | 'WAITING_ON_OTHERS' | 'IN_PROGRESS' | 'SENT_COMPLETED';
type StatFilterId = 'ACTIVE' | 'ACTION' | 'WAITING' | 'DRAFTS' | 'FINANCE' | null;

interface CaseRowSummary {
  odakanitNo: string;
  insuredName?: string;
  plaintiffName?: string;
  insurerName?: string;
  latestUpdatedAt?: string | null;
  latestReportTitle?: string;
  latestReportNumber?: number;
  nextReportNumber?: number;
  hasOpenWork: boolean;
  hasUrgentWork: boolean;
}
type Density = 'COMFORTABLE' | 'COMPACT';

import { t } from './i18n';
import { buildReportSubject } from '../../utils/reportFileName';
import FinanceReportBadge from './FinanceReportBadge';

const BRAND_NAME = t('brandName');
const BRAND_SUBTITLE = t('brandSubtitle');

const STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT: t('statusDraft'),
  TASK_ASSIGNED: t('statusActionRequired'),
  WAITING_FOR_INVOICES: t('statusWaitingInvoices'),
  PENDING_REVIEW: t('statusPendingReview'),
  APPROVED: t('statusApproved'),
  READY_TO_SEND: t('statusReadyToSend'),
  SENT: t('statusSent'),
};

interface LawyerDashboardProps {
  user: User;
  reports: ReportData[];
  caseFolders: Record<string, CaseFolder>;
  notifications: NotificationEntry[];
  showNotifications: boolean;
  setShowNotifications: (value: boolean) => void;
  onClearNotifications: () => void;
  dailySummaryOptIn: boolean;
  setDailySummaryOptIn: (value: boolean) => void;
  archiveAfterMs: number;
  onSelectReport: (id: string) => void;
  onNewReport: () => void;
  onOpenCaseFolder: (odakanitNo: string) => void;
  onLogout: () => void;
  deleteReportById?: (id: string) => void;
}

const classifyStatus = (status: ReportStatus): StatusBucket => {
  if (status === 'TASK_ASSIGNED' || status === 'PENDING_REVIEW') {
    return 'ACTION_REQUIRED';
  }
  if (status === 'WAITING_FOR_INVOICES') {
    return 'WAITING_ON_OTHERS';
  }
  if (status === 'READY_TO_SEND') {
    return 'IN_PROGRESS';
  }
  if (status === 'SENT') {
    return 'SENT_COMPLETED';
  }
  // Default: DRAFT and any others
  return 'IN_PROGRESS';
};

const PIN_STORAGE_KEY = (userId: string) => `lp_pins:${userId}`;
const DENSITY_STORAGE_KEY = (userId: string) => `lp_dashboard_density:${userId}`;
const CURRENT_REPORT_KEY = 'lp_current_report';
const PIN_MIGRATION_KEY = (userId: string) => `lp_pins_migrated:${userId}`;

export const LawyerDashboard: React.FC<LawyerDashboardProps> = ({
  user,
  reports,
  caseFolders,
  notifications,
  showNotifications,
  setShowNotifications,
  onClearNotifications,
  dailySummaryOptIn,
  setDailySummaryOptIn,
  archiveAfterMs,
  onSelectReport,
  onNewReport,
  onOpenCaseFolder,
  onLogout,
  deleteReportById,
}) => {
  // Minimal dashboard mode – מציג רק את הבלוקים המרכזיים (עומס, תיקים לפי עודכנית, כרטיסים, דיווחים מאיריס)
  const minimalDashboard = true;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'ALL'>('ALL');
  const [onlyMyCases, setOnlyMyCases] = useState(true);
  const [selectedStatFilter, setSelectedStatFilter] = useState<StatFilterId>(null);
  const [sortBy, setSortBy] = useState<DashboardSortBy>('UPDATED');
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY(user.id));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });
  const [density, setDensity] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'COMFORTABLE';
    try {
      const raw = window.localStorage.getItem(DENSITY_STORAGE_KEY(user.id));
      return raw === 'COMPACT' ? 'COMPACT' : 'COMFORTABLE';
    } catch {
      return 'COMFORTABLE';
    }
  });

  const now = Date.now();
  const archiveThreshold = archiveAfterMs ?? Number.MAX_SAFE_INTEGER;
  const [focusMode, setFocusMode] = useState(false);
  const [financeTotalsBySheetId, setFinanceTotalsBySheetId] = useState<
    Record<string, SheetTotals>
  >({});

  const filteredNotifications = useMemo(() => {
    // 1) Only notifications that מיועדים למשתמש הנוכחי (כמו לפני כן)
    const base = notifications.filter(
      (note) => !note.targetUserId || note.targetUserId === user.id,
    );

    // 2) מסננים החוצה התראות שמקושרות לדו"ח שכבר נשלח (SENT) – המשימה הושלמה.
    //    זה רלוונטי במיוחד להתראות פיננסיות מאיריס: אחרי שעורכת הדין הוציאה דו"ח
    //    ושלחה אותו לליאור / לחברת הביטוח, אין צורך להשאיר את הפעמון דולק.
    return base.filter((note) => {
      if (!note.reportId) return true;
      const linked = reports.find((r) => r.id === note.reportId);
      if (!linked) return true;
      if (linked.status === 'SENT') return false;
      return true;
    });
  }, [notifications, user.id, reports]);

  // ספירה ייעודית להתראות פיננסיות מאיריס (כאלה שמקושרות לדו"ח עם expensesSheetId
  // ושאינן במצב SENT). רק הן ישפיעו על הבדג' האדום ליד הפעמון.
  const financeNotificationCount = useMemo(() => {
    return filteredNotifications.filter((note) => {
      if (!note.reportId) return false;
      const linked = reports.find((r) => r.id === note.reportId);
      if (!linked) return false;
      if (!linked.expensesSheetId) return false;
      if (linked.status === 'SENT') return false;
      return true;
    }).length;
  }, [filteredNotifications, reports]);

  const {
    mine,
    buckets,
    filteredReports,
  } = useMemo(() => {
    const base = reports.filter((r) => {
      if (r.deletedAt) return false;
      const odakanitKey = (r.odakanitNo || '').trim();
      if (!odakanitKey) return true;
      const folder = caseFolders[odakanitKey];
      // Hide closed cases from the main dashboard views by default.
      if (folder && folder.closedAt) return false;
      return true;
    });
    const mineReports = base.filter((r) => r.createdBy === user.id);

    const reportsToUse = onlyMyCases ? mineReports : base;

    const filteredByStatus =
      statusFilter === 'ALL'
        ? reportsToUse
        : reportsToUse.filter((r) => r.status === statusFilter);

    const filteredByFinance =
      selectedStatFilter === 'FINANCE'
        ? filteredByStatus.filter((r) => !!r.expensesSheetId)
        : filteredByStatus;

    const filteredBySearch = (() => {
      const term = searchQuery.trim().toLowerCase();
      if (!term) return filteredByFinance;
      return filteredByFinance.filter((r) => {
        const haystack = [
          r.odakanitNo,
          r.insuredName,
          r.plaintiffName,
          r.insurerName,
          r.marketRef,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      });
    })();

    const filteredForFocus = focusMode
      ? filteredBySearch.filter((r) => hasImmediateAction(r) || !!getAlertLabelForReport(r))
      : filteredBySearch;

    const bucketMap: Record<StatusBucket, ReportData[]> = {
      ACTION_REQUIRED: [],
      WAITING_ON_OTHERS: [],
      IN_PROGRESS: [],
      SENT_COMPLETED: [],
    };

    filteredForFocus.forEach((r) => {
      const bucket = classifyStatus(r.status);
      bucketMap[bucket].push(r);
    });

    return {
      mine: mineReports,
      buckets: bucketMap,
      filteredReports: filteredForFocus,
    };
  }, [reports, caseFolders, user.id, searchQuery, statusFilter, onlyMyCases, focusMode, now, archiveThreshold, selectedStatFilter]);

  const globalStats = useMemo(() => {
    const caseKeys = new Set<string>();
    let actionRequiredCount = 0;
    let draftsInWorkCount = 0;
    let readyToSendCount = 0;
    let financeTasksCount = 0;

    mine.forEach((r) => {
      if (r.status !== 'SENT') {
        draftsInWorkCount += 1;
        caseKeys.add(getCaseKey(r));
      }

      const bucket = classifyStatus(r.status);
      if (bucket === 'ACTION_REQUIRED') actionRequiredCount += 1;

      if (r.status === 'READY_TO_SEND') {
        readyToSendCount += 1;
      }

      if (r.expensesSheetId && r.status !== 'SENT') {
        financeTasksCount += 1;
      }
    });

    return {
      activeCasesCount: caseKeys.size,
      actionRequiredCount,
      draftsInWorkCount,
      readyToSendCount,
      financeTasksCount,
    };
  }, [mine]);

  const {
    activeCasesCount,
    actionRequiredCount,
    draftsInWorkCount,
    readyToSendCount,
    financeTasksCount,
  } = globalStats;

  const waitingForInvoicesCount = useMemo(
    () =>
      mine.filter((r) => r.status === 'WAITING_FOR_INVOICES').length,
    [mine],
  );

  const financeReports = mine.filter(
    (r) => !!r.expensesSheetId && r.status !== 'SENT',
  );

  // טוען סכומי "סכום להזמנה" לדיווחים הכספיים בטבלת איריס
  useEffect(() => {
    const sheetIds = Array.from(
      new Set(
        financeReports
          .map((r) => r.expensesSheetId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const missingIds = sheetIds.filter((id) => !financeTotalsBySheetId[id]);
    if (!missingIds.length) return;

    missingIds.forEach((sheetId) => {
      void (async () => {
        try {
          const data = await financialExpensesClient.getSheet(sheetId);
          if (!data) return;
          const totals = calculateSheetTotals(data.sheet, data.lineItems);
          setFinanceTotalsBySheetId((prev) => ({
            ...prev,
            [sheetId]: totals,
          }));
        } catch {
          // לא מציג שגיאה למשתמש – העמודה פשוט תישאר ריקה
        }
      })();
    });
  }, [financeReports, financeTotalsBySheetId]);

  const caseRows: CaseRowSummary[] = useMemo(() => {
    const map = new Map<string, CaseRowSummary>();

    const getPrimaryTitle = (report: ReportData): string => {
      const subject = buildReportSubject(report);
      if (!subject) return '';
      const parts = subject.split(' - ');
      if (parts.length <= 2) {
        return subject;
      }
      // החלק האחרון הוא "Report N" – נשתמש באיבר שלפניו ככותרת העיקרית
      return parts[parts.length - 2] || subject;
    };

    mine.forEach((r) => {
      if (!r.odakanitNo) return;
      const key = r.odakanitNo.trim();
      if (!key) return;

      const existing = map.get(key) || {
        odakanitNo: key,
        insuredName: r.insuredName || undefined,
        plaintiffName: r.plaintiffName || undefined,
        insurerName: r.insurerName || undefined,
        latestUpdatedAt: null as string | null,
        latestReportTitle: undefined,
        latestReportNumber: undefined,
        nextReportNumber: undefined,
        hasOpenWork: false,
        hasUrgentWork: false,
      };

      const updatedSource = r.updatedAt || r.reportDate;
      const nextTime = updatedSource ? new Date(updatedSource).getTime() || 0 : 0;
      const prevTime = existing.latestUpdatedAt
        ? new Date(existing.latestUpdatedAt).getTime() || 0
        : 0;

      if (nextTime >= prevTime) {
        existing.latestUpdatedAt = updatedSource || existing.latestUpdatedAt || null;
        existing.insuredName = r.insuredName || existing.insuredName;
        existing.plaintiffName = r.plaintiffName || existing.plaintiffName;
        existing.insurerName = r.insurerName || existing.insurerName;
        existing.latestReportTitle = getPrimaryTitle(r);
      }

      const isOpenStatus = r.status !== 'SENT' && !r.deletedAt;
      if (isOpenStatus) {
        existing.hasOpenWork = true;
      }

      if (
        r.status === 'TASK_ASSIGNED' ||
        r.status === 'WAITING_FOR_INVOICES' ||
        r.status === 'PENDING_REVIEW' ||
        r.status === 'READY_TO_SEND'
      ) {
        existing.hasUrgentWork = true;
      }

      map.set(key, existing);
    });

    // אחרי שאספנו את פרטי התיק, נחשב לכל תיק:
    // 1) מספר הדיווח האחרון שנשלח בפועל (REPORT NO)
    // 2) מספר הדיווח הבא (NEXT REPORT) – אחד יותר מהאחרון שנשלח.
    const rows = Array.from(map.values()).map((row) => {
      const key = row.odakanitNo.trim();
      const numbers: number[] = [];

      const folder = caseFolders[key];
      if (folder?.sentReports?.length) {
        folder.sentReports.forEach((sr) => {
          if (typeof sr.reportNo === 'number' && sr.reportNo > 0) {
            numbers.push(sr.reportNo);
          }
        });
      }

      reports.forEach((r) => {
        if ((r.odakanitNo || '').trim() !== key) return;
        if (r.status !== 'SENT') return;
        if (typeof r.reportNumber === 'number' && r.reportNumber > 0) {
          numbers.push(r.reportNumber);
        } else {
          const fallback = (r.reportHistory?.length || 0) + 1;
          numbers.push(fallback);
        }
      });

      const last = numbers.length ? Math.max(...numbers) : 0;
      return {
        ...row,
        latestReportNumber: last || undefined,
        nextReportNumber: (last || 0) + 1,
      };
    });

    // Include all cases where the lawyer has ever worked, even if all reports are SENT.
    // This ensures cases don't "disappear" from the Odakanit list after final submission,
    // so the lawyer can still see history and new finance updates (e.g. Iris's tables).
    return rows.sort((a, b) => {
      const at = a.latestUpdatedAt ? new Date(a.latestUpdatedAt).getTime() || 0 : 0;
      const bt = b.latestUpdatedAt ? new Date(b.latestUpdatedAt).getTime() || 0 : 0;
      return bt - at;
    });
  }, [mine]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const handleOpenReport = (report: ReportData) => {
    onSelectReport(report.id);
  };

  const handleChangeStatFilter = (id: StatFilterId) => {
    const next = selectedStatFilter === id ? null : id;
    setSelectedStatFilter(next);
    switch (next) {
      case 'ACTION':
        setStatusFilter('TASK_ASSIGNED');
        break;
      case 'WAITING':
        setStatusFilter('WAITING_FOR_INVOICES');
        break;
      case 'DRAFTS':
        // כרטיסיית "טיוטות / מוכן לשליחה" מציגה טיוטות המוכנות לשליחה לליאור
        setStatusFilter('READY_TO_SEND');
        break;
      case 'FINANCE':
        // כרטיסיית "דיווחים כספיים מאיריס" מסננת לפי טבלאות הוצאות, בלי לסנן לפי סטטוס
        setStatusFilter('ALL');
        break;
      case 'ACTIVE':
        setStatusFilter('ALL');
        break;
      default:
        setStatusFilter('ALL');
        break;
    }
  };

  const hasActiveFilters =
    statusFilter !== 'ALL' || !!searchQuery.trim() || !onlyMyCases;

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setOnlyMyCases(true);
    setSelectedStatFilter(null);
  };

  const handleChangeSortBy = (value: DashboardSortBy) => {
    setSortBy(value);
  };

  const persistPinned = (next: string[]) => {
    setPinnedIds(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY(user.id), JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  };

  const togglePin = (reportId: string) => {
    setPinnedIds((prev) => {
      const set = new Set(prev);
      if (set.has(reportId)) {
        set.delete(reportId);
      } else {
        set.add(reportId);
      }
      const next = Array.from(set);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PIN_STORAGE_KEY(user.id), JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const handleDensityChange = (value: Density) => {
    setDensity(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DENSITY_STORAGE_KEY(user.id), value);
      } catch {
        // ignore
      }
    }
  };

  const isNewCase = (report: ReportData): boolean =>
    isNewCaseReport(report, reports);

  const handleDeleteReport = (report: ReportData) => {
    if (!deleteReportById) return;
    if (!window.confirm(t('deleteDraftConfirm'))) return;
    deleteReportById(report.id);
  };

  const sortReports = (items: ReportData[]): ReportData[] => {
    const list = [...items];
    return list.sort((a, b) => {
      const aKey = getCaseKey(a);
      const bKey = getCaseKey(b);
      const aPinned = pinnedSet.has(aKey);
      const bPinned = pinnedSet.has(bKey);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const getUpdatedTime = (r: ReportData) => {
        const updatedSource = r.updatedAt || r.reportDate;
        return updatedSource ? new Date(updatedSource).getTime() || 0 : 0;
      };
      const getReportDateTime = (r: ReportData) =>
        r.reportDate ? new Date(r.reportDate).getTime() || 0 : 0;

      if (sortBy === 'INSURED') {
        const aName = (r: ReportData) =>
          (r.insuredName || r.plaintiffName || '').toLowerCase();
        const aLabel = aName(a);
        const bLabel = aName(b);
        if (aLabel < bLabel) return -1;
        if (aLabel > bLabel) return 1;
        return 0;
      }

      const aTime =
        sortBy === 'REPORT_DATE' ? getReportDateTime(a) : getUpdatedTime(a);
      const bTime =
        sortBy === 'REPORT_DATE' ? getReportDateTime(b) : getUpdatedTime(b);

      return bTime - aTime;
    });
  };

  useEffect(() => {
    if (!showNotifications) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showNotifications, setShowNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!reports.length) return;
    const flagKey = PIN_MIGRATION_KEY(user.id);
    const alreadyMigrated = window.localStorage.getItem(flagKey) === '1';
    if (alreadyMigrated) return;

    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY(user.id));
      if (!raw) {
        window.localStorage.setItem(flagKey, '1');
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.setItem(flagKey, '1');
        return;
      }

      const nextKeys: string[] = [];
      const ensurePush = (key: string) => {
        if (!key) return;
        if (!nextKeys.includes(key)) nextKeys.push(key);
      };

      parsed.forEach((val: unknown) => {
        if (typeof val !== 'string') return;
        const v = val.trim();
        if (!v) return;
        const lower = v.toLowerCase();
        const looksNew =
          lower.startsWith('odakanit:') ||
          lower.startsWith('umr:') ||
          lower.startsWith('line:') ||
          lower.startsWith('cert:') ||
          lower.startsWith('insured:') ||
          lower.startsWith('plaintiff:') ||
          lower.startsWith('id:');
        if (looksNew) {
          ensurePush(v);
          return;
        }

        const match = reports.find((r) => {
          const key = getCaseKey(r);
          if (key === v) return true;
          return (
            r.id === v ||
            (r.odakanitNo && r.odakanitNo === v) ||
            (r.marketRef && r.marketRef === v)
          );
        });

        if (match) {
          ensurePush(getCaseKey(match));
        } else {
          // best-effort: treat as odakanit number-style identifier
          ensurePush(`odakanit:${v}`);
        }
      });

      setPinnedIds(nextKeys);
      window.localStorage.setItem(PIN_STORAGE_KEY(user.id), JSON.stringify(nextKeys));
      window.localStorage.setItem(flagKey, '1');
    } catch {
      window.localStorage.setItem(PIN_MIGRATION_KEY(user.id), '1');
    }
  }, [reports, user.id]);

  const resumeReport = useMemo(() => {
    if (!mine.length) return null;
    if (typeof window !== 'undefined') {
      try {
        const lastId = window.localStorage.getItem(CURRENT_REPORT_KEY);
        const fromStorage = lastId
          ? mine.find((r) => r.id === lastId && !r.deletedAt)
          : null;
        if (fromStorage) return fromStorage;
      } catch {
        // ignore
      }
    }
    const sorted = [...mine].sort((a, b) => {
      const getUpdated = (r: ReportData) => {
        const src = r.updatedAt || r.reportDate;
        return src ? new Date(src).getTime() || 0 : 0;
      };
      const aTime = getUpdated(a);
      const bTime = getUpdated(b);
      return bTime - aTime;
    });
    return sorted[0] || null;
  }, [mine]);

  const renderNotifications = () => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
        aria-label={t('openNotificationsAria')}
        title={t('openNotificationsTitle')}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {financeNotificationCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {financeNotificationCount}
          </span>
        )}
      </button>
      {showNotifications && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white text-xs shadow-xl z-50">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-semibold text-gray-800">{t('notificationTitle')}</span>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              <input
                type="checkbox"
                checked={dailySummaryOptIn}
                onChange={(e) => setDailySummaryOptIn(e.target.checked)}
                className="h-3 w-3 rounded border-gray-300 text-lpBlue focus:ring-lpBlue"
              />
              {t('dailySummary')}
            </label>
          </div>
          <div className="max-h-64 overflow-auto divide-y">
            {filteredNotifications.length === 0 && (
              <div className="p-4 text-center text-gray-400">
                {t('noNotifications')}
              </div>
            )}
            {filteredNotifications.map((note) => (
              <div key={note.id} className="p-3 space-y-1">
                <p className="font-medium text-gray-800">{note.message}</p>
                <p className="text-[10px] text-gray-400">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
                {note.reportId && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-blue-700 hover:underline"
                    onClick={() => {
                      onSelectReport(note.reportId);
                      setShowNotifications(false);
                    }}
                  >
                    פתח דו"ח קשור
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="px-3 py-2 text-right">
            <button
              type="button"
              onClick={onClearNotifications}
              className="text-[11px] font-medium text-red-500 hover:underline"
            >
              {t('clearAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const [caseSearch, setCaseSearch] = useState('');
  const [caseSearchOpen, setCaseSearchOpen] = useState(false);
  const [caseSearchActiveIndex, setCaseSearchActiveIndex] = useState<number>(-1);
  const caseSuggestions = useMemo(() => {
    const term = caseSearch.trim();
    if (!term) return [] as Array<{ odakanitNo: string; insuredName?: string; plaintiffName?: string }>;
    const lower = term.toLowerCase();
    const all = Object.values(caseFolders);
    const startsWith = all.filter((f) => f.odakanitNo.toLowerCase().startsWith(lower));
    const includes = all.filter(
      (f) =>
        !f.odakanitNo.toLowerCase().startsWith(lower) &&
        f.odakanitNo.toLowerCase().includes(lower),
    );
    const merged = [...startsWith, ...includes].slice(0, 8);
    return merged.map((f) => ({
      odakanitNo: f.odakanitNo,
      insuredName: f.insuredName,
      plaintiffName: f.plaintiffName,
    }));
  }, [caseSearch, caseFolders]);

  useEffect(() => {
    if (!caseSearch.trim()) {
      setCaseSearchOpen(false);
      setCaseSearchActiveIndex(-1);
      return;
    }
    if (caseSuggestions.length > 0) {
      setCaseSearchOpen(true);
      setCaseSearchActiveIndex(0);
    } else {
      setCaseSearchOpen(false);
      setCaseSearchActiveIndex(-1);
    }
  }, [caseSearch, caseSuggestions.length]);

  const handleSelectCaseSuggestion = (odakanitNo: string) => {
    setCaseSearch(odakanitNo);
    setCaseSearchOpen(false);
    setCaseSearchActiveIndex(-1);
    onOpenCaseFolder(odakanitNo);
  };

  return (
    <div className="min-h-screen bg-gray-100 px-0 pb-6 text-[15px]" dir="rtl" lang="he">
      <div className="mx-auto max-w-6xl px-4">
        <header className="sticky top-0 z-20 mb-4 flex flex-col gap-3 border-b border-gray-200 bg-white/80 pb-3 pt-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-lpBlue font-heebo">
              {t('dashboardTitle')}
            </h1>
            <p className="text-base text-gray-600 text-right">
              <span className="font-semibold">{BRAND_NAME}</span>{' '}
              <span className="text-gray-500">{BRAND_SUBTITLE}</span>
              <span className="text-gray-400"> · </span>
              {t('welcomeBack')},{' '}
              <span className="font-semibold">{user.name}</span>{' '}
              <span className="text-gray-500">({t('roleLawyer')})</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
            <button
              type="button"
              onClick={onNewReport}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-lpBlue text-sm font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
              aria-label={t('openNewCaseFolderAria')}
              title={t('openNewCaseFolderTitle')}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            {renderNotifications()}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
              onClick={() => {
                // Inherit existing behavior from App-level user guide
                const event = new CustomEvent('openUserGuide');
                window.dispatchEvent(event);
              }}
              aria-label={t('openHelpCenterAria')}
              title={t('openHelpCenterTitle')}
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              aria-label={t('logoutAria')}
              title={t('logoutTitle')}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Getting Started helper card when there are no reports yet */}
        {!minimalDashboard && mine.length === 0 && (
          <section className="mb-4 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-4 text-base text-gray-700 shadow-sm text-right">
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              {t('gettingStartedTitle')}
            </h2>
            <p className="text-sm text-gray-600 mb-2">
              {t('gettingStartedBodyLine1')}
              <br />
              {t('gettingStartedBodyLine2')}
            </p>
            <ul className="mb-3 mr-4 list-disc text-sm text-gray-600">
              <li>{t('gettingStartedStep1')}</li>
              <li>{t('gettingStartedStep2')}</li>
              <li>{t('gettingStartedStep3')}</li>
            </ul>
            <button
              type="button"
              onClick={onNewReport}
              className="inline-flex items-center rounded-full bg-lpBlue px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
              aria-label={t('gettingStartedCta')}
            >
              {t('gettingStartedCta')}
            </button>
          </section>
        )}

        <section className="mb-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-700 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            {t('workloadTitle')}
          </h2>
          <div className="flex flex-wrap gap-3 text-[11px] text-gray-700 mb-2">
            <span>
              {financeTasksCount} {t('statsFinanceTasks')}
            </span>
            <span>
              {waitingForInvoicesCount} {t('statsWaitingOnOthers')}
            </span>
            <span>
              {readyToSendCount} {t('statsDraftsReady')}
            </span>
          </div>
          {/* רשימת כל הטיוטות שנמצאות בעבודה – כל דיווח שטרם נשלח לחברת הביטוח */}
              <div className="max-h-40 overflow-y-auto rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
            {mine.filter((r) => r.status !== 'SENT').length === 0 ? (
              <p className="text-[11px] text-gray-500">
                {t('emptyInProgressTitle')}
              </p>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {mine
                  .filter((r) => r.status !== 'SENT')
                  .sort((a, b) => {
                    const getTime = (r: ReportData) => {
                      const src = r.updatedAt || r.reportDate;
                      return src ? new Date(src).getTime() || 0 : 0;
                    };
                    return getTime(b) - getTime(a);
                  })
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 border-b border-gray-200/70 pb-1 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenReport(r)}
                        className="flex-1 text-right hover:text-lpBlue"
                      >
                        <span className="font-semibold">
                          {r.insuredName || r.plaintiffName || t('untitledCase')}
                        </span>
                        {r.odakanitNo && (
                          <span className="text-gray-500"> · {r.odakanitNo}</span>
                        )}
                      </button>
                      <span className="whitespace-nowrap text-[10px] text-gray-500 flex items-center gap-1">
                        <span>{STATUS_LABELS[r.status]}</span>
                        <FinanceReportBadge report={r} />
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>

        {!minimalDashboard && financeTasksCount > 0 && (
          <section className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900 shadow-sm">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">
                {t('financeBannerTitle')}
              </p>
              <p className="text-[11px]">
                {t('financeBannerBody')}
              </p>
              <p className="text-[11px] font-semibold">
                סה״כ דיווחים כספיים פתוחים: {financeTasksCount}
              </p>
            </div>
          </section>
        )}

        {/* Case-centric list (per Odakanit) */}
        <section className="mb-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">
              {t('caseListTitle')}
            </h2>
            <span className="text-[11px] text-gray-500">
              {caseRows.length}{' '}
              {t('statsActiveCases')}
            </span>
          </div>
          <p className="mb-2 text-[11px] text-gray-500">
            {t('caseListHintActiveOnly')}
          </p>

          {caseRows.length === 0 ? (
            <p className="text-[11px] text-gray-500">{t('caseListEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-2 py-1 text-right font-semibold w-32">
                      {t('caseListHeaderOdakanit')}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold w-40">
                      {t('caseListHeaderInsurer')}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold w-40">
                      {t('caseListHeaderInsured')}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold w-40">
                      {t('caseListHeaderPlaintiff')}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold w-20">
                      {t('caseListHeaderReportNo')}
                    </th>
                    <th className="px-2 py-1 text-right font-semibold w-20">
                      {t('caseListHeaderNextReportNo') ?? 'Next report'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {caseRows.map((row, index) => {
                    const isHot = row.hasUrgentWork;
                    const hasWork = row.hasOpenWork;
                    const baseStripe =
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    const highlight = isHot
                      ? 'border-l-4 border-red-400 bg-red-50/80'
                      : hasWork
                        ? 'border-l-4 border-amber-300 bg-amber-50/70'
                        : 'border-l border-transparent';
                    return (
                      <tr
                        key={row.odakanitNo}
                        className={`cursor-pointer border-b border-gray-100 ${baseStripe} ${highlight}`}
                        onClick={() => onOpenCaseFolder(row.odakanitNo)}
                      >
                        <td className="px-2 py-1 text-right font-mono text-[11px]">
                          <button
                            type="button"
                            className="text-lpBlue hover:underline"
                            onClick={() => onOpenCaseFolder(row.odakanitNo)}
                          >
                            {row.odakanitNo}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.insurerName || '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.insuredName || '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.plaintiffName || '—'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">
                          {row.latestReportNumber ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">
                          {row.nextReportNumber ?? ((row.latestReportNumber || 0) + 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!minimalDashboard && (
          <section className="mb-3 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <label
                htmlFor="case-folder-search"
                className="text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                {t('searchByOdakanit')}
              </label>
              <input
                id="case-folder-search"
                type="text"
                className="mt-1 w-full rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-lpBlue focus:outline-none focus:ring-1 focus:ring-lpBlue"
                placeholder={t('searchOdakanitPlaceholder')}
                value={caseSearch}
                onChange={(e) => {
                  setCaseSearch(e.target.value);
                }}
                onFocus={() => {
                  if (caseSuggestions.length > 0) {
                    setCaseSearchOpen(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (!caseSearchOpen && e.key === 'ArrowDown' && caseSuggestions.length > 0) {
                    setCaseSearchOpen(true);
                    setCaseSearchActiveIndex(0);
                    return;
                  }
                  if (!caseSearchOpen) {
                    if (e.key === 'Enter') {
                      const key = caseSearch.trim();
                      if (key && caseFolders[key]) {
                        handleSelectCaseSuggestion(key);
                      }
                    }
                    if (e.key === 'Escape') {
                      setCaseSearchOpen(false);
                    }
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCaseSearchActiveIndex((prev) => {
                      const next = prev + 1;
                      return next >= caseSuggestions.length ? caseSuggestions.length - 1 : next;
                    });
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCaseSearchActiveIndex((prev) => {
                      const next = prev - 1;
                      return next < 0 ? 0 : next;
                    });
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const idx = caseSearchActiveIndex >= 0 ? caseSearchActiveIndex : 0;
                    const choice = caseSuggestions[idx];
                    if (choice) {
                      handleSelectCaseSuggestion(choice.odakanitNo);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setCaseSearchOpen(false);
                    setCaseSearchActiveIndex(-1);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={caseSearchOpen}
                aria-controls="case-folder-search-listbox"
              />
              {caseSearchOpen && caseSuggestions.length > 0 && (
                <ul
                  id="case-folder-search-listbox"
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white py-1 text-xs shadow-lg"
                >
                  {caseSuggestions.map((s, index) => (
                    <li
                      key={s.odakanitNo}
                      role="option"
                      aria-selected={index === caseSearchActiveIndex}
                      className={`cursor-pointer px-3 py-2 flex flex-col gap-0.5 ${
                        index === caseSearchActiveIndex
                          ? 'bg-blue-50 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => handleSelectCaseSuggestion(s.odakanitNo)}
                    >
                      <span className="font-semibold text-[11px] text-gray-900">
                        {s.odakanitNo}
                      </span>
                      <span className="text-[11px] text-gray-600">
                        {s.insuredName || '—'}
                        {s.plaintiffName ? ` · ${s.plaintiffName}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {caseSearch.trim() && !caseSearchOpen && caseSuggestions.length === 0 && (
                <p className="mt-1 text-[11px] text-red-500">
                  {t('noCaseFolderFound')}
                </p>
              )}
            </div>
          </section>
        )}
        {!minimalDashboard && resumeReport && (
          <section className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-gray-800 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-right flex-1">
                <p className="font-semibold text-lpBlue text-sm">
                  {t('resumeLastCase')}
                </p>
                <p className="text-[11px] text-gray-600">
                  {resumeReport.insuredName || resumeReport.plaintiffName || ''}{' '}
                  {resumeReport.odakanitNo
                    ? `· ${t('internalFile')}: ${resumeReport.odakanitNo}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenReport(resumeReport)}
                className="inline-flex items-center rounded-full bg-lpBlue px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
                aria-label={t('resumeLastCase')}
              >
                {t('resumeLabel')}
              </button>
            </div>
          </section>
        )}
            <DashboardStats
              activeCases={activeCasesCount}
              actionRequired={actionRequiredCount}
              waitingOnOthers={waitingForInvoicesCount}
              draftsAndReady={readyToSendCount}
              financeTasks={financeTasksCount}
              selectedFilter={selectedStatFilter}
              onChangeFilter={handleChangeStatFilter}
            />
            {/* רשימת דיווחים כספיים מאיריס – לפי אותן עמודות של "תיקים לפי מספר עודכנית" */}
            <section className="mb-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-xs text-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  {t('financeReportsTitle')}
                </h2>
                <span className="text-[11px] text-gray-500">
                  {financeTasksCount}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-gray-500">
                {t('financeReportsHint')}
              </p>
              {financeReports.length === 0 ? (
                <p className="text-[11px] text-gray-500">
                  {t('financeReportsEmpty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-2 py-1 text-right font-semibold w-48">
                          {t('caseListHeaderTitle')}
                        </th>
                        <th className="px-2 py-1 text-right font-semibold w-20">
                          {t('caseListHeaderReportNo')}
                        </th>
                        <th className="px-2 py-1 text-right font-semibold w-40">
                          {t('caseListHeaderPlaintiff')}
                        </th>
                        <th className="px-2 py-1 text-right font-semibold w-40">
                          {t('caseListHeaderInsured')}
                        </th>
                        <th className="px-2 py-1 text-right font-semibold w-40">
                          {t('caseListHeaderInsurer')}
                        </th>
                        <th className="px-2 py-1 text-right font-semibold w-32">
                          {t('caseListHeaderOdakanit')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {financeReports
                        .slice()
                        .sort((a, b) => {
                          const getTime = (r: ReportData) => {
                            const src = r.updatedAt || r.reportDate;
                            return src ? new Date(src).getTime() || 0 : 0;
                          };
                          return getTime(b) - getTime(a);
                        })
                        .map((r) => {
                          const subject = buildReportSubject(r);
                          const parts = subject.split(' - ');
                          const title =
                            parts.length > 2
                              ? parts[parts.length - 2] || subject
                              : subject;
                          const reportNo =
                            (r.reportHistory?.length || 0) + 1;
                          return (
                            <tr
                              key={r.id}
                              className="cursor-pointer border-b border-gray-100 hover:bg-emerald-50/60"
                              onClick={() => {
                                if (r.odakanitNo) {
                                  onOpenCaseFolder(r.odakanitNo);
                                } else {
                                  handleOpenReport(r);
                                }
                              }}
                            >
                              <td className="px-2 py-1 text-right">
                                <div className="font-semibold text-gray-900">
                                  {title || '—'}
                                </div>
                                {r.updatedAt && (
                                  <div className="text-[10px] text-gray-500">
                                    {new Date(r.updatedAt).toLocaleString(
                                      'he-IL',
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px]">
                                {reportNo}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {r.plaintiffName || '—'}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {r.insuredName || '—'}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {r.insurerName || '—'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px]">
                                {r.odakanitNo || '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {!minimalDashboard && (
              <>
                <SearchAndFilters
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  onlyMyCases={onlyMyCases}
                  onOnlyMyCasesChange={setOnlyMyCases}
                  sortBy={sortBy}
                  onSortByChange={handleChangeSortBy}
                  hasActiveFilter={hasActiveFilters}
                  onClearFilters={hasActiveFilters ? handleClearFilters : undefined}
                />

                <div className="mb-3 flex items-center justify-start gap-3 text-[11px] text-gray-600">
                  <span className="text-gray-500">{t('densityLabel')}</span>
                  <button
                    type="button"
                    onClick={() => handleDensityChange('COMFORTABLE')}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2 ${
                      density === 'COMFORTABLE'
                        ? 'bg-gray-200 text-gray-900'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    aria-pressed={density === 'COMFORTABLE'}
                  >
                    {t('densityComfortable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDensityChange('COMPACT')}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2 ${
                      density === 'COMPACT'
                        ? 'bg-gray-200 text-gray-900'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                    aria-pressed={density === 'COMPACT'}
                  >
                    {t('densityCompact')}
                  </button>
                  <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-gray-300 text-lpBlue focus:ring-lpBlue"
                      checked={focusMode}
                      onChange={(e) => setFocusMode(e.target.checked)}
                    />
                    <span>{t('focusModeLabel')}</span>
                  </label>
                </div>

                <main className="space-y-4" aria-label={t('workQueuesAria')}>
                  <ActionList
                    id="action-required"
                    title={t('bucketActionRequiredTitle')}
                    description={t('bucketActionRequiredDescription')}
                    reports={sortReports(buckets.ACTION_REQUIRED)}
                    emptyTitle={t('emptyActionRequiredTitle')}
                    emptyDescription={t('emptyActionRequiredDesc')}
                    pinnedIds={pinnedIds}
                    onTogglePin={togglePin}
                    density={density}
                    onOpenReport={handleOpenReport}
                    onDeleteReport={handleDeleteReport}
                    isNewCase={isNewCase}
                  />
                  <ActionList
                    id="waiting-others"
                    title={t('bucketWaitingTitle')}
                    description={t('bucketWaitingDescription')}
                    reports={sortReports(buckets.WAITING_ON_OTHERS)}
                    emptyTitle={t('emptyWaitingTitle')}
                    emptyDescription={t('emptyWaitingDesc')}
                    pinnedIds={pinnedIds}
                    onTogglePin={togglePin}
                    density={density}
                    onOpenReport={handleOpenReport}
                    onDeleteReport={handleDeleteReport}
                    isNewCase={isNewCase}
                  />
                  <ActionList
                    id="in-progress"
                    title={t('bucketInProgressTitle')}
                    description={t('bucketInProgressDescription')}
                    reports={sortReports(buckets.IN_PROGRESS)}
                    emptyTitle={t('emptyInProgressTitle')}
                    emptyDescription={t('emptyInProgressDesc')}
                    emptyActionLabel={t('emptyInProgressCta')}
                    onEmptyAction={onNewReport}
                    pinnedIds={pinnedIds}
                    onTogglePin={togglePin}
                    density={density}
                    onOpenReport={handleOpenReport}
                    onDeleteReport={handleDeleteReport}
                    isNewCase={isNewCase}
                  />
                  <ActionList
                    id="sent-completed"
                    title={t('bucketSentTitle')}
                    description={t('bucketSentDescription')}
                    reports={sortReports(buckets.SENT_COMPLETED)}
                    defaultCollapsed
                    emptyTitle={t('emptySentTitle')}
                    emptyDescription={t('emptySentDesc')}
                    pinnedIds={pinnedIds}
                    onTogglePin={togglePin}
                    density={density}
                    onOpenReport={handleOpenReport}
                    onDeleteReport={handleDeleteReport}
                    isNewCase={isNewCase}
                  />
                </main>

                <footer className="mt-6 text-[11px] text-gray-400 flex items-center gap-2 justify-start">
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {t('footerArchiveNote')}{' '}
                    {archiveThreshold / (1000 * 60 * 60)}{' '}
                    שעות.
                  </span>
                </footer>
              </>
            )}
      </div>
    </div>
  );
};

export default LawyerDashboard;


