import React, { useState } from 'react';
import { FileText, Plus, Trash2, Calendar, History, X, FolderOpen, HelpCircle, Calculator, LogOut, Receipt, Bell, Home, Search, ChevronUp, ChevronDown, Star, FilePlus2 } from 'lucide-react';
import type { ReportData, User, ExpenseWorksheetRow, ExpenseRowCategory, ExpenseWorksheetNote, ExpenseFavorite, CaseFolder, ReportNote } from '../../types';
import { USERS } from '../../constants';
import FinanceExpensesDashboard from '../finance/FinanceExpensesDashboard';
import LawyerDashboard from '../dashboard/LawyerDashboard';
import { financialExpensesClient } from '../../services/financialExpensesClient';

// --- DASHBOARD COMPONENT ---
const Dashboard = ({
  user,
  reports,
  onSelectReport,
  onNewReport,
  onLogout,
  onUpdateReport,
  onDeleteReport,
  onFinanceTaskCreate,
  onNotifyLawyerFromFinance,
  onSheetDeleted,
  caseTemplates = [],
  onStartTemplate,
  onStartNextReport,
  archiveAfterMs,
  favoriteProviders = {},
  onSaveFavorite,
  onDeleteFavorite,
  onOpenWorksheet,
  onRequestReminder,
  onRequestNote,
  onSoftDeleteReport,
  onRestoreReport,
  notifications = [],
  showNotifications,
  setShowNotifications,
  onClearNotifications,
  dailySummaryOptIn,
  setDailySummaryOptIn,
  caseFolders,
  onOpenCaseFolder,
  onOpenAssistant,
}: any) => {
  const isStaff = user.role === 'ADMIN' || user.role === 'SUB_ADMIN' || user.role === 'FINANCE';
  const isSoftDeleteRole = user.role === 'LAWYER' || user.role === 'SUB_ADMIN' || user.role === 'FINANCE';
  const canOpenFinanceCase = true; // כל התפקידים יכולים לפתוח תיק פיננסי חדש
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favoriteDraft, setFavoriteDraft] = useState<{ category: ExpenseRowCategory; label: string; provider: string }>({
    category: 'EXPERT_OUR',
    label: '',
    provider: '',
  });
  const [allReportsSearch, setAllReportsSearch] = useState('');
  const [expandedCaseKey, setExpandedCaseKey] = useState<string | null>(null);
  const isAdmin = user.role === 'ADMIN';
  const showExpensesSummary = user.role === 'SUB_ADMIN' || user.role === 'FINANCE';

  // Dedicated finance dashboard for Iris – focuses on FinancialExpenseSheet
  if (user.role === 'FINANCE') {
    const handleMarkReportPaidFromFinance = (reportId: string) => {
      onUpdateReport(reportId, { isPaid: true });
    };

    return (
      <FinanceExpensesDashboard
        user={user}
        reports={reports}
        onLogout={onLogout}
        onNotifyLawyer={onNotifyLawyerFromFinance}
        onMarkReportPaid={handleMarkReportPaidFromFinance}
        onSheetDeleted={onSheetDeleted}
        onOpenAssistant={() => onOpenAssistant && onOpenAssistant()}
        caseFolders={caseFolders}
      />
    );
  }

  if (!isStaff && user.role === 'LAWYER') {
    return (
      <LawyerDashboard
        user={user}
        reports={reports}
        caseFolders={caseFolders || {}}
        notifications={notifications}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        onClearNotifications={onClearNotifications}
        dailySummaryOptIn={dailySummaryOptIn}
        setDailySummaryOptIn={setDailySummaryOptIn}
        archiveAfterMs={archiveAfterMs}
        onSelectReport={onSelectReport}
        onNewReport={onNewReport}
            onOpenCaseFolder={onOpenCaseFolder}
        onLogout={onLogout}
        deleteReportById={onDeleteReport}
      />
    );
  }

  // Filter reports
  const now = Date.now();
  const archiveThreshold = archiveAfterMs ?? Number.MAX_SAFE_INTEGER;
  const shouldArchiveAdmin = (report: ReportData) =>
    report.status === 'SENT' &&
    report.sentAt &&
    (now - new Date(report.sentAt).getTime()) >= archiveThreshold;
  const visibleReports = isStaff ? reports : reports.filter((r: ReportData) => r.createdBy === user.id);
  const adminRecycleReports = visibleReports.filter(shouldArchiveAdmin);
  const adminActiveReports = visibleReports.filter((r: ReportData) => !shouldArchiveAdmin(r) && !r.deletedAt);
  const softDeletedReports = visibleReports.filter(
    (r: ReportData) => r.deletedAt && (now - new Date(r.deletedAt).getTime()) < LAWYER_RECYCLE_MS
  );
  const softActiveReports = visibleReports.filter((r: ReportData) => !r.deletedAt);
  const activeReports = isAdmin
    ? adminActiveReports
    : isSoftDeleteRole
      ? softActiveReports
      : visibleReports;
  const recycleReports = isAdmin
    ? adminRecycleReports
    : isSoftDeleteRole
      ? softDeletedReports
      : [];
  const lawyerAssignedReports = !isStaff ? reports.filter((r: ReportData) => r.status === 'READY_TO_SEND' && r.createdBy === user.id && !r.deletedAt) : [];
  const lawyerFinanceQueue = !isStaff
    ? reports.filter(
        (r: ReportData) =>
          ['TASK_ASSIGNED', 'WAITING_FOR_INVOICES'].includes(r.status) && r.createdBy === user.id && !r.deletedAt
      )
    : [];
  type SentReportEntry = {
    parent: ReportData;
    entry: PreviousReport;
    reportNumber: number;
    sentAt?: string;
    isLatest: boolean;
  };

  const buildReportHistoryList = (report: ReportData): PreviousReport[] => {
    if (report.reportHistory?.length) return report.reportHistory;
    if (report.status === 'SENT') {
      const fallbackDate = report.sentAt || report.reportDate || new Date().toISOString();
      return [
        {
          id: `${report.id}-legacy`,
          reportNumber: 1,
          subject: `${report.insurerName || 'Report'}${report.insuredName ? ` - ${report.insuredName}` : ''}`,
          date: fallbackDate,
          sent: true,
        },
      ];
    }
    return [];
  };

  const lawyerSentReports: SentReportEntry[] = !isStaff
    ? reports
        .filter((r: ReportData) => r.createdBy === user.id && !r.deletedAt)
        .flatMap((report) => {
          const historyList = buildReportHistoryList(report);
          if (!historyList.length) return [];
          return historyList.map((entry, index) => ({
            parent: report,
            entry,
            reportNumber: entry.reportNumber || index + 1,
            sentAt: entry.date || entry.snapshot?.createdAt || report.sentAt,
            isLatest: index === historyList.length - 1,
          }));
        })
        .sort((a, b) => {
          const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          return bTime - aTime;
        })
    : [];
  const getLatestSentTimestamp = (report: ReportData) => {
    const historyList = buildReportHistoryList(report);
    const latestEntry = historyList[historyList.length - 1];
    const dateString = latestEntry?.date || report.sentAt;
    return dateString ? new Date(dateString).getTime() : 0;
  };
  const lawyerFollowupReports = !isStaff
    ? reports
        .filter((r: ReportData) => {
          if (r.createdBy !== user.id || r.deletedAt || r.status !== 'SENT') return false;
          return buildReportHistoryList(r).length > 0;
        })
        .sort((a, b) => getLatestSentTimestamp(b) - getLatestSentTimestamp(a))
    : [];
  type LawyerTaskSection = {
    id: 'ready' | 'finance' | 'followup' | 'sent';
    title: string;
    subtitle: string;
    items: Array<ReportData | SentReportEntry>;
    empty: string;
    actionLabel?: string;
    action?: (report: ReportData) => void;
    tone: string;
  };
  const lawyerTaskSections: LawyerTaskSection[] = !isStaff
    ? [
        {
          id: 'ready',
          title: 'דיווחים שטרם יצאו',
          subtitle: 'דיווחים שהועברו לליאור וממתינים לשליחה',
          items: lawyerAssignedReports,
          empty: 'אין דיווחים ממתינים כרגע.',
          actionLabel: 'פתח דיווח',
          action: (report: ReportData) => onSelectReport(report.id),
          tone: 'border-red-100',
        },
        {
          id: 'finance',
          title: 'דיווחים כספיים שצריך להכין',
          subtitle: 'משימות שקיבלת מלידור/איריס למשלוח דוח כספי',
          items: lawyerFinanceQueue,
          empty: 'אין בקשות כספיות חדשות.',
          actionLabel: 'התחל עבודה',
          action: (report: ReportData) => onSelectReport(report.id),
          tone: 'border-amber-100',
        },
        {
          id: 'followup',
          title: 'דו"חות המשך נדרשים',
          subtitle: 'פתח דו"ח חדש על בסיס הדו"ח האחרון שנשלח בתיק',
          items: lawyerFollowupReports,
          empty: 'אין דו"חות שנשלחו שממתינים להמשך.',
          actionLabel: 'דו"ח המשך',
          action: onStartNextReport ? (report: ReportData) => onStartNextReport(report.id) : undefined,
          tone: 'border-blue-100',
        },
        {
          id: 'sent',
          title: 'דיווחים שנשלחו',
          subtitle: 'דיווחים היסטוריים שנשלחו – ניתן להפיק דו"ח המשך לאחר שליחה',
          items: lawyerSentReports,
          empty: 'עוד לא נשלחו דיווחים מהחשבון שלך.',
          tone: 'border-green-100',
        },
      ]
    : [];
  const financeFolders = isStaff ? reports.filter((r: ReportData) => r.odakanitNo && !r.deletedAt) : [];
  const currentFavorites: ExpenseFavorite[] = favoriteProviders?.[user.id] || [];
  const handleAddFavoriteProvider = () => {
    if (!favoriteDraft.provider.trim()) return;
    const option = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === favoriteDraft.category);
    const label = favoriteDraft.label.trim() || option?.label || 'Favorite provider';
    onSaveFavorite && onSaveFavorite(user.id, {
      id: makeId(),
      category: favoriteDraft.category,
      label,
      serviceProvider: favoriteDraft.provider.trim(),
    });
    setFavoriteDraft({ category: favoriteDraft.category, label: '', provider: '' });
  };
  const handleRemoveFavorite = (favoriteId: string) => {
    onDeleteFavorite && onDeleteFavorite(user.id, favoriteId);
  };
  const userCaseTemplates = caseTemplates.filter((template: any) => template.ownerId === user.id);
  const expenseReports = reports.filter((r: ReportData) => hasExpenseData(r) && !r.deletedAt);
  const showExpensesOnly = user.role === 'FINANCE' || user.role === 'SUB_ADMIN';
  const canToggleRecycle = isAdmin || isSoftDeleteRole;
  const recycleInfoText = isAdmin
    ? `Items move here ${archiveAfterMs / (1000 * 60 * 60)}h after sending and are deleted after ${DELETE_AFTER_MS / (1000 * 60 * 60 * 24)} days.`
    : isSoftDeleteRole
      ? 'דיווחים שנמחקו נשמרים כאן במשך 7 ימים לפני מחיקה סופית.'
      : '';
  const expensesAssigned = expenseReports.filter((r: ReportData) => !['READY_TO_SEND', 'SENT'].includes(r.status));
  const expensesReady = expenseReports.filter((r: ReportData) => r.status === 'READY_TO_SEND');
  const expensesSent = expenseReports.filter((r: ReportData) => r.status === 'SENT');
  const totalSentBalance = expensesSent.reduce((acc: number, report: ReportData) => acc + getExpensesNumericTotal(report), 0);
  const getStatusBadgeClasses = (status: ReportStatus) => {
    if (status === 'SENT') return 'bg-gold/20 text-goldLight border-gold';
    if (status === 'READY_TO_SEND') return 'bg-danger/30 text-red-300 border-danger';
    return 'bg-navySecondary text-textMuted border-borderDark';
  };

  const formatStatusLabel = (status: ReportStatus) => {
    if (status === 'READY_TO_SEND') return 'READY TO SEND';
    return status.replace(/_/g, ' ');
  };

  const handleMarkPaid = (id: string) => {
     onUpdateReport(id, { isPaid: true });
  };

  const baseReportsForTable = showRecycleBin ? recycleReports : activeReports;
  const computeCaseKey = (entity: { createdBy?: string; odakanitNo?: string; marketRef?: string; id?: string; plaintiffName?: string }) => {
    const ownerPart = entity.createdBy || 'unknown';
    const casePart = entity.odakanitNo || entity.marketRef || entity.id || 'unknown';
    const plaintiffPart = (entity.plaintiffName || 'unknown').toLowerCase();
    return `${ownerPart}::${casePart}::${plaintiffPart}`;
  };

  const reportsForTable = showExpensesOnly ? baseReportsForTable.filter(hasExpenseData) : baseReportsForTable;
  const existingKeys = new Set(
    (!showExpensesOnly ? baseReportsForTable : []).map((r: ReportData) => computeCaseKey(r))
  );
  const templatePlaceholders = !isStaff && !showExpensesOnly
    ? caseTemplates
        .filter((template: CaseTemplate) => template.ownerId === user.id && !existingKeys.has(template.caseKey))
        .map((template: CaseTemplate) => ({
          id: `template-${template.caseKey}`,
          createdBy: template.ownerId,
          ownerName: template.ownerName,
          reportDate: template.lastUpdated,
          status: 'TASK_ASSIGNED' as ReportStatus,
          recipientId: '1',
          insurerName: template.insurerName || '',
          lineSlipNo: template.lineSlipNo || '',
          marketRef: template.marketRef || '',
          insuredName: template.insuredName || '',
          plaintiffName: template.plaintiffName || '',
          plaintiffTitle: template.plaintiffTitle || 'Plaintiff',
          odakanitNo: template.odakanitNo,
          selectedTimeline: 'standard',
          filenameTag: FILENAME_TAGS[0],
          selectedSections: ['Update'],
          content: {},
          translatedContent: {},
  expertSummaryMode: {},
          invoiceFiles: [],
          isWaitingForInvoices: false,
          isTranslated: false,
          expensesItems: [],
          expenseWorksheet: defaultExpenseWorksheet(),
          reportNotes: [],
          __templateKey: template.caseKey,
        }))
    : [];
  const reportsForDisplay: DashboardReportRow[] = showExpensesOnly ? reportsForTable : [...reportsForTable, ...templatePlaceholders];
  const searchTerm = allReportsSearch.trim().toLowerCase();
  const matchesAllReportsSearch = (report: DashboardReportRow) => {
    if (!searchTerm) return true;
    const haystack = `${report.odakanitNo || ''} ${report.insuredName || ''} ${report.plaintiffName || ''} ${report.ownerName || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  };
  const filteredReportsForDisplay = searchTerm ? reportsForDisplay.filter(matchesAllReportsSearch) : reportsForDisplay;
  type GroupedCaseReport = {
    key: string;
    odakanitNo: string;
    caseLabel: string;
    insuredName: string;
    plaintiffName: string;
    reports: DashboardReportRow[];
    latestDate: number;
  };

  const groupedCaseReports: GroupedCaseReport[] = !showExpensesOnly
    ? (() => {
        const map = new Map<
          string,
          GroupedCaseReport
        >();
        filteredReportsForDisplay.forEach((report: DashboardReportRow) => {
          if (report.__templateKey) return;
          const caseKey = report.odakanitNo || report.marketRef || report.insuredName || report.id;
          const latestDate = report.reportDate ? new Date(report.reportDate).getTime() : 0;
          const existing = map.get(caseKey);
          if (!existing) {
            map.set(caseKey, {
              key: caseKey,
              odakanitNo: report.odakanitNo || '',
              caseLabel: report.insuredName || report.plaintiffName || report.marketRef || '—',
              insuredName: report.insuredName || '',
              plaintiffName: report.plaintiffName || '',
              reports: [report],
              latestDate,
            });
          } else {
            existing.reports.push(report);
            if (latestDate > existing.latestDate) existing.latestDate = latestDate;
            if (!existing.caseLabel && (report.insuredName || report.plaintiffName)) {
              existing.caseLabel = report.insuredName || report.plaintiffName || existing.caseLabel;
            }
            if (!existing.insuredName && report.insuredName) existing.insuredName = report.insuredName;
            if (!existing.plaintiffName && report.plaintiffName) existing.plaintiffName = report.plaintiffName;
          }
        });
        return Array.from(map.values()).sort((a, b) => b.latestDate - a.latestDate);
      })()
    : [];

  const canDeleteDraftReport = (report: ReportData) => !['READY_TO_SEND', 'SENT'].includes(report.status);
  const handleDeleteDraftReport = (report: ReportData) => {
    if (!canDeleteDraftReport(report)) {
      alert('לא ניתן למחוק דיווח שכבר סומן כ-READY TO SEND או שנשלח.');
      return;
    }
    const label = report.insuredName || report.plaintiffName || report.odakanitNo || report.id;
    if (window.confirm(`למחוק את הדו"ח "${label}"? הפעולה אינה ניתנת לשחזור.`)) {
      onDeleteReport && onDeleteReport(report.id);
    }
  };

  useEffect(() => {
    if (!expandedCaseKey) return;
    if (!groupedCaseReports.some((group: GroupedCaseReport) => group.key === expandedCaseKey)) {
      setExpandedCaseKey(null);
    }
  }, [expandedCaseKey, groupedCaseReports]);

  return (
    <div className="min-h-screen bg-bgDark p-6 relative">
      {showUserGuide && <UserGuideModal onClose={() => setShowUserGuide(false)} />}
      
      {showFinanceModal && (
         <FinanceRequestModal 
          currentUser={user}
           onClose={() => setShowFinanceModal(false)} 
           onSubmit={(data) => { onFinanceTaskCreate(data); setShowFinanceModal(false); }}
          favoriteProviders={favoriteProviders[user.id] || []}
          onSaveFavorite={(favorite) => onSaveFavorite && onSaveFavorite(user.id, favorite)}
        />
      )}
      {showFavoritesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4">
          <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-textLight flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> ניהול ספקים מועדפים
              </h3>
              <button onClick={() => setShowFavoritesModal(false)} className="text-textMuted hover:text-textLight">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">קטגוריה</label>
                <select value={favoriteDraft.category} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, category: e.target.value as ExpenseRowCategory })} className="w-full border rounded text-sm p-2">
                  {EXPENSE_DETAIL_OPTIONS.filter(opt => opt.type === 'EXPENSE').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">שם לתצוגה</label>
                <input className="w-full border rounded text-sm p-2" value={favoriteDraft.label} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, label: e.target.value })} placeholder="לדוגמה: מומחה ניתוחים" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">שם ספק</label>
                  <input className="w-full border rounded text-sm p-2" value={favoriteDraft.provider} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, provider: e.target.value })} placeholder='ד"ר יואב גרוסמן' />
              </div>
            </div>
            <div className="text-right">
              <button onClick={handleAddFavoriteProvider} className="bg-amber-500 text-white px-4 py-2 rounded font-bold hover:bg-amber-600">הוסף לרשימה</button>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
              {currentFavorites.length === 0 && <p className="text-sm text-gray-400 text-center py-6">אין ספקים מועדפים עדיין.</p>}
              {currentFavorites.map(fav => (
                <div key={fav.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-textLight">{fav.label}</p>
                    <p className="text-xs text-textMuted">{fav.serviceProvider}</p>
                  </div>
                  <button onClick={() => handleRemoveFavorite(fav.id)} className="text-xs text-red-500 hover:underline">הסר</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full px-6 md:px-8 lg:px-10 xl:px-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
           <div>
              <h1 className="text-3xl font-serif font-bold text-lpBlue">Lior Perry Law Office</h1>
              <p className="text-textMuted">Welcome back, <span className="font-bold">{user.name}</span> ({user.role})</p>
           </div>
           <div className="flex items-center gap-3 flex-wrap justify-end">
              {canToggleRecycle && (
                <button onClick={() => setShowRecycleBin((prev: boolean) => !prev)} className={`flex items-center px-4 py-2 rounded shadow text-sm font-bold ${showRecycleBin ? 'bg-gray-300 text-textLight' : 'bg-borderDark text-textLight'} hover:bg-borderDark`}>
                   <Trash2 className="w-4 h-4 mr-2"/> {showRecycleBin ? 'Back to Reports' : `Recycle Bin (${recycleReports.length})`}
                </button>
              )}
              {canOpenFinanceCase && (
                <button onClick={() => setShowFinanceModal(true)} className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold">
                   <Plus className="w-4 h-4 mr-2"/> Open New Case Folder
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAssistant && onOpenAssistant()}
                className="flex items-center text-indigo-700 bg-indigo-50 px-3 py-2 rounded hover:bg-indigo-100"
              >
                <Lightbulb className="w-4 h-4 mr-2" /> העוזר החכם
              </button>
              <div className="relative">
                <button onClick={() => setShowNotifications((prev: boolean) => !prev)} className="flex items-center text-blue-600 bg-blue-50 px-3 py-2 rounded hover:bg-blue-100 relative">
                   <Bell className="w-4 h-4 mr-2"/> Notifications
                   {notifications.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full px-1">{notifications.length}</span>}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-panel border border-borderDark shadow-xl rounded-lg z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-sm font-bold text-textLight">Smart Notifications</span>
                      <label className="text-xs text-textMuted flex items-center gap-1">
                        <input type="checkbox" checked={dailySummaryOptIn} onChange={e => setDailySummaryOptIn(e.target.checked)} />
                        Daily summary
                      </label>
                    </div>
                    <div className="max-h-64 overflow-auto divide-y">
                      {notifications.length === 0 && <div className="p-4 text-xs text-gray-400 text-center">No notifications yet.</div>}
                      {notifications.map((note: NotificationEntry) => (
                        <div key={note.id} className="p-3 text-sm">
                          <p className="font-medium text-textLight">{note.message}</p>
                          <p className="text-[10px] text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 text-right text-xs">
                      <button onClick={onClearNotifications} className="text-red-500 hover:underline">Clear all</button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowUserGuide(true)} className="flex items-center text-blue-600 bg-blue-50 px-3 py-2 rounded hover:bg-blue-100">
                 <HelpCircle className="w-4 h-4 mr-2"/> עזרה
              </button>
              {import.meta.env.DEV && (
                <button
                  onClick={() => {
                    resetAllAppData();
                    window.location.reload();
                  }}
                  className="flex items-center text-xs text-textMuted bg-navySecondary px-3 py-2 rounded hover:bg-borderDark border border-borderDark"
                >
                  Reset All Data (Dev)
                </button>
              )}
              <button onClick={onLogout} className="flex items-center text-red-600 hover:bg-red-50 px-4 py-2 rounded"><LogOut className="w-4 h-4 mr-2"/> Logout</button>
           </div>
        </div>

        {/* FINANCIAL TRACKER (Admin/Sub/Finance Only) */}
        {isStaff && (
           <FinancialTracker reports={reports} currentUser={user} onMarkPaid={handleMarkPaid} />
        )}

        {showExpensesSummary && (
          <div className="mb-8 bg-panel border border-amber-200 rounded-2xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-bold text-amber-700 flex items-center gap-2"><Receipt className="w-5 h-5"/> Expenses Overview</h3>
                <p className="text-sm text-textMuted">Tracking all reports that include expense tables. <span className="text-amber-600">כולל מידע היסטורי – לידיעה בלבד.</span></p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <button onClick={() => setShowFavoritesModal(true)} className="text-xs text-amber-700 underline hover:text-amber-900">
                  Manage Favorite Providers
                </button>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Assigned to Lawyers</p>
                  <p className="text-xl font-bold text-amber-700">{expensesAssigned.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Waiting for Lior</p>
                  <p className="text-xl font-bold text-blue-600">{expensesReady.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Sent to Insurer</p>
                  <p className="text-xl font-bold text-green-600">{expensesSent.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Total Sent Balance</p>
                  <p className="text-xl font-bold text-green-700">₪{totalSentBalance.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 text-amber-800">
                  <tr>
                    <th className="p-2 text-left">Case / Lawyer</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-right">Total Balance (₪)</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenseReports.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-400">No expense reports yet.</td>
                    </tr>
                  )}
                  {expenseReports.map((report: ReportData) => (
                    <tr key={`expense-${report.id}`} className="hover:bg-amber-50 transition">
                      <td className="p-2">
                        <div className="font-semibold text-textLight">{report.insuredName || 'Unnamed Case'}</div>
                        <div className="text-xs text-textMuted">Lawyer: {report.ownerName}</div>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(report.status)}`}>
                          {formatStatusLabel(report.status)}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold">₪{getExpensesNumericTotal(report).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => onSelectReport(report.id)} className="text-lpBlue hover:underline text-xs font-bold">Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LAWYER URGENT TASKS */}
        {!isStaff && lawyerTaskSections.length > 0 && (
          <div className="space-y-6 mb-8">
            {lawyerTaskSections.map((section) => (
              <div key={section.id} className="bg-panel border rounded-2xl shadow-sm">
                <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 border-b">
                       <div>
                    <h3 className="font-bold text-textLight">{section.title}</h3>
                    <p className="text-sm text-textMuted">{section.subtitle}</p>
                          </div>
                       </div>
                {section.items.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">{section.empty}</div>
                ) : (
                  <div className="p-4 space-y-3">
                    {section.items.map((item: ReportData | SentReportEntry) => {
                      if (section.id === 'sent') {
                        const sentItem = item as SentReportEntry;
                        const sentDate = sentItem.sentAt ? new Date(sentItem.sentAt).toLocaleDateString('he-IL') : '—';
                        const canStartFollowUp =
                          sentItem.isLatest && sentItem.parent.status === 'SENT' && typeof onStartNextReport === 'function';
                        const hasActiveDraft = sentItem.isLatest && sentItem.parent.status !== 'SENT';
                        return (
                          <div key={`${sentItem.parent.id}-${sentItem.entry.id}`} className={`border ${section.tone} rounded-xl p-4`}>
                            <div className="grid md:grid-cols-4 gap-4 text-sm text-textMuted">
                              <div>
                                <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                                <p className="font-bold text-textLight">{sentItem.parent.odakanitNo || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">שם המבוטח</p>
                                <p className="font-bold text-textLight">{sentItem.parent.insuredName || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">{sentItem.parent.plaintiffTitle}</p>
                                <p className="font-bold text-textLight">{sentItem.parent.plaintiffName || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">דוח #{sentItem.reportNumber}</p>
                                <p className="font-bold text-textLight">{sentDate}</p>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-textMuted space-y-1">
                              <p><span className="font-semibold text-textLight">נושא:</span> {sentItem.entry.subject || '—'}</p>
                              {sentItem.entry.fileName && (
                                <p className="text-xs text-textMuted">שם קובץ: {sentItem.entry.fileName}</p>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                              {canStartFollowUp && onStartNextReport && (
                              <button
                                  onClick={() => onStartNextReport(sentItem.parent.id)}
                                  className="px-4 py-2 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navySecondary"
                                >
                                  דו"ח המשך
                                </button>
                              )}
                              {hasActiveDraft && (
                              <span className="text-xs text-textMuted font-semibold px-3 py-1 rounded-full bg-navySecondary">
                                  דו"ח חדש בתהליך
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const reportItem = item as ReportData;
                      const iteration =
                        (typeof reportItem.reportNumber === 'number' && reportItem.reportNumber > 0)
                          ? reportItem.reportNumber
                          : (reportItem.reportHistory?.length || 0) + 1;
                      return (
                        <div key={reportItem.id} className={`border ${section.tone} rounded-xl p-4`}>
                          <div className="grid md:grid-cols-4 gap-4 text-sm text-textMuted">
                            <div>
                              <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                              <p className="font-bold text-textLight">{reportItem.odakanitNo || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">שם התובע</p>
                              <p className="font-bold text-textLight">{reportItem.plaintiffName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">שם המבוטח</p>
                              <p className="font-bold text-textLight">{reportItem.insuredName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">מספר דיווח</p>
                              <p className="font-bold text-textLight">#{iteration}</p>
                            </div>
                          </div>
                      {section.id === 'followup' && (
                        <div className="mt-2 text-xs text-textMuted">
                          {(() => {
                            const lastHistoryEntry =
                              reportItem.reportHistory?.[reportItem.reportHistory.length - 1];
                            const sentLabel = lastHistoryEntry?.date
                              ? new Date(lastHistoryEntry.date).toLocaleDateString('he-IL')
                              : reportItem.sentAt
                                ? new Date(reportItem.sentAt).toLocaleDateString('he-IL')
                                : '—';
                            return `דו"ח אחרון שנשלח: #${lastHistoryEntry?.reportNumber || iteration - 1} · ${sentLabel}`;
                          })()}
                        </div>
                      )}
                          <div className="mt-3 flex flex-wrap gap-2 justify-end">
                            {section.id === 'finance' && canDeleteDraftReport(reportItem) && (
                              <button
                                onClick={() => handleDeleteDraftReport(reportItem)}
                                className="px-3 py-2 rounded-full border border-red-200 text-red-600 text-sm font-semibold flex items-center gap-1 hover:bg-red-50"
                                title="מחק דיווח זה"
                              >
                                <Trash2 className="w-4 h-4" />
                                מחק
                              </button>
                            )}
                            {section.action && (
                              <button
                                onClick={() => section.action && section.action(reportItem)}
                                className="px-4 py-2 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navySecondary"
                              >
                                {section.actionLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
           </div>
        )}

        {/* FINANCE FOLDERS (ADMIN VIEW) */}
        {isStaff && (
           <div className="mb-8">
              <div className="flex justify-between items-end mb-4">
                  <h3 className="text-lg font-bold text-textLight flex items-center"><FolderOpen className="w-6 h-6 mr-2 text-indigo-600"/> Active Case Folders</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {financeFolders.length === 0 && <p className="text-gray-400 italic col-span-3 text-center py-4">No active finance folders.</p>}
                 {financeFolders.map((folder: ReportData) => {
                    const statusInfo = (() => {
                      switch (folder.status) {
                        case 'WAITING_FOR_INVOICES':
                          return { badge: 'bg-yellow-50 text-yellow-700', text: 'Awaiting Finance Finalize', icon: <Loader2 className="text-yellow-500 w-5 h-5 animate-spin" /> };
                        case 'TASK_ASSIGNED':
                          return { badge: 'bg-blue-50 text-blue-700', text: 'Pending Lawyer Action', icon: <ArrowRight className="text-blue-500 w-5 h-5" /> };
                        case 'READY_TO_SEND':
                          return { badge: 'bg-orange-50 text-orange-700', text: 'Waiting for Lior', icon: <Loader2 className="text-orange-500 w-5 h-5 animate-spin" /> };
                        case 'SENT':
                          return { badge: 'bg-green-50 text-green-700', text: 'Completed', icon: <Check className="text-green-500 w-6 h-6" /> };
                        default:
                          return { badge: 'bg-navySecondary text-textMuted', text: folder.status, icon: <Loader2 className="text-gray-400 w-5 h-5 animate-spin" /> };
                      }
                    })();
                    const assignedLawyer = USERS.find(u => u.id === folder.createdBy)?.name;
                    
                    return (
                      <div key={folder.id} className="bg-panel p-4 rounded-lg shadow border-t-4 relative border-indigo-100">
                          <div className="flex justify-between items-start mb-2">
                             <h4 className="font-bold text-lg">Case #{folder.odakanitNo}</h4>
                            {statusInfo.icon}
                          </div>
                          <div className="text-sm text-textMuted mb-1 flex items-center"><UserCheck className="w-4 h-4 mr-1"/> Assigned to: {assignedLawyer}</div>
                          <div className="text-xs text-textMuted mb-4">{new Date(folder.reportDate).toLocaleDateString()}</div>
                          
                          <div className="flex justify-end gap-2 mt-2">
                            {folder.status === 'SENT' ? (
                                <button onClick={() => onDeleteReport(folder.id)} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded text-sm flex items-center"><Trash2 className="w-4 h-4 mr-1"/> Delete Folder</button>
                             ) : (
                               <span className={`text-xs font-bold px-2 py-1 rounded ${statusInfo.badge}`}>{statusInfo.text}</span>
                             )}
                          </div>
                       </div>
                    );
                 })}
              </div>
           </div>
        )}

        {/* General Reports List (Existing) */}
        {(isStaff || showExpensesOnly) && (
        <div className="bg-panel rounded-xl shadow-sm border border-borderDark overflow-hidden">
           <div className="p-4 border-b border-gray-100 bg-navySecondary/50 flex flex-wrap gap-3 items-center justify-between">
              <h3 className="font-bold text-textLight flex items-center">
                <History className="w-4 h-4 mr-2 text-gray-400"/> {showRecycleBin ? 'Recycle Bin' : 'All Reports'}
              </h3>
              <div className="flex items-center gap-3 flex-wrap justify-end">
              {showRecycleBin && recycleInfoText && (
                <span className="text-xs text-textMuted">{recycleInfoText}</span>
                )}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={allReportsSearch}
                    onChange={(e) => setAllReportsSearch(e.target.value)}
                    placeholder="חיפוש לפי שם או מספר בעודכנית"
                    className="w-full border border-borderDark rounded-full pl-9 pr-10 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                  {allReportsSearch && (
                    <button
                      onClick={() => setAllReportsSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
              )}
           </div>
              </div>
           </div>
           {showExpensesOnly ? (
           <table className="w-full text-left">
              <thead className="bg-navySecondary text-textMuted text-xs uppercase tracking-wider font-semibold">
                 <tr>
                    <th className="p-4">Insurer / Subject</th>
                    {isStaff && <th className="p-4">Lawyer</th>}
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                 {filteredReportsForDisplay.length === 0 && (
                   <tr>
                     <td colSpan={isStaff ? 4 : 3} className="p-6 text-center text-gray-400 text-sm">
                       {searchTerm ? 'לא נמצאו דיווחים תואמים לחיפוש.' : 'אין דיווחים להצגה.'}
                     </td>
                   </tr>
                 )}
                 {filteredReportsForDisplay.map((r: DashboardReportRow) => {
                    const isReady = r.status === 'READY_TO_SEND';
                    const isSent = r.status === 'SENT';
                    const isTemplateRow = Boolean(r.__templateKey);
                    return (
                    <tr key={r.id} className={`transition cursor-default ${isReady ? 'bg-red-50 [&_.text-textLight]:text-gray-800 [&_.text-textMuted]:text-gray-600' : isSent ? 'bg-green-50/50 [&_.text-textLight]:text-gray-800 [&_.text-textMuted]:text-gray-600' : 'hover:bg-blue-50/30'}`}>
                       <td className="p-4">
                          <div className="font-bold text-textLight">{r.insurerName || 'Untitled'}</div>
                          <div className="text-xs text-textMuted">{r.marketRef} {r.insuredName ? ` - ${r.insuredName}` : ''}</div>
                       </td>
                       {isStaff && <td className="p-4 text-sm text-textMuted font-medium">{r.ownerName}</td>}
                       <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(r.status)}`}>
                             {formatStatusLabel(r.status)}
                          </span>
                       </td>
                       <td className="p-4 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                              <>
                                <button onClick={() => onOpenWorksheet(r.id)} className="text-xs bg-navySecondary hover:bg-borderDark px-3 py-1.5 rounded flex items-center gap-1">
                                   <Table className="w-3 h-3" /> View Expenses
                                </button>
                                <button onClick={() => onRequestReminder(r)} className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded flex items-center gap-1">
                                   <Bell className="w-3 h-3" /> Reminder
                                </button>
                                <button onClick={() => onRequestNote(r)} className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded flex items-center gap-1">
                                   <NotebookPen className="w-3 h-3" /> Add Note
                                </button>
                              </>
                            {isSoftDeleteRole && !isAdmin && !showRecycleBin && (
                              <button onClick={() => !isTemplateRow && onSoftDeleteReport(r.id)} disabled={isTemplateRow} className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${isTemplateRow ? 'bg-navySecondary text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                                 <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            )}
                            {showRecycleBin && (
                              <>
                                {isAdmin && (
                                  <button onClick={() => onUpdateReport(r.id, { sentAt: new Date().toISOString() })} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-sm font-bold">
                                     Restore
                                  </button>
                                )}
                                {!isAdmin && isSoftDeleteRole && (
                                  <button onClick={() => onRestoreReport(r.id)} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-sm font-bold">
                                     Restore
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                       </td>
                    </tr>
                )})}
              </tbody>
           </table>
           ) : (
             <div>
               {groupedCaseReports.length === 0 ? (
                 <div className="p-6 text-center text-gray-400 text-sm">
                   {searchTerm ? 'לא נמצאו דיווחים תואמים לחיפוש.' : 'אין דיווחים להצגה.'}
        </div>
               ) : (
                 <div className="divide-y divide-gray-100">
                   {groupedCaseReports.map((group: GroupedCaseReport) => {
                     const latestFormatted = group.latestDate ? new Date(group.latestDate).toLocaleDateString('he-IL') : '-';
                     const sortedReports = [...group.reports].sort((a, b) => {
                       const dateA = a.reportDate ? new Date(a.reportDate).getTime() : 0;
                       const dateB = b.reportDate ? new Date(b.reportDate).getTime() : 0;
                       return dateB - dateA;
                     });
                     return (
                       <div key={group.key} className="p-4">
                         <div className="flex flex-wrap justify-between gap-3">
                           <div>
                             <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                             <p className="text-xl font-bold text-textLight">{group.odakanitNo || '—'}</p>
                             <p className="text-xs text-textMuted">
                               שם התובע: <span className="font-semibold">{group.plaintiffName || '—'}</span> · שם המבוטח: <span className="font-semibold">{group.insuredName || '—'}</span>
                             </p>
                             <p className="text-xs text-gray-400">עודכן לאחרונה: {latestFormatted}</p>
                           </div>
                           <div className="text-right">
                             <p className="text-xs text-textMuted">סה"כ דיווחים</p>
                             <p className="text-2xl font-bold text-textLight">{group.reports.length}</p>
                             <button
                               onClick={() => setExpandedCaseKey((prev) => (prev === group.key ? null : group.key))}
                               className="mt-2 px-4 py-1.5 text-sm font-semibold rounded-full border border-borderDark text-textLight hover:bg-navySecondary"
                             >
                               {expandedCaseKey === group.key ? 'הסתר דיווחים' : 'צפה בדיווחים'}
                             </button>
                           </div>
                         </div>
                         {expandedCaseKey === group.key && (
                           <div className="mt-4 bg-navySecondary border border-borderDark rounded-xl overflow-hidden">
                             <table className="w-full text-sm">
                               <thead className="bg-navySecondary text-textMuted text-xs uppercase tracking-wide">
                                 <tr>
                                   <th className="p-3 text-left">תאריך דיווח</th>
                                   <th className="p-3 text-left">שם התובע</th>
                                   <th className="p-3 text-left">שם המבוטח</th>
                                   <th className="p-3 text-left">סטטוס</th>
                                   <th className="p-3 text-right">פעולות</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-gray-200">
                                 {sortedReports.map((report) => {
                                   const isReady = report.status === 'READY_TO_SEND';
                                   const isSent = report.status === 'SENT';
                                   const isTemplateRow = Boolean(report.__templateKey);
                                   return (
                                     <tr key={report.id} className={`bg-panel ${isReady ? 'bg-red-50 text-gray-900' : isSent ? 'bg-green-50/60 text-gray-900' : ''}`}>
                                       <td className="p-3">{report.reportDate ? new Date(report.reportDate).toLocaleDateString('he-IL') : '—'}</td>
                                       <td className="p-3">{report.plaintiffName || '—'}</td>
                                       <td className="p-3">{report.insuredName || '—'}</td>
                                       <td className="p-3">
                                         <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(report.status)}`}>
                                           {formatStatusLabel(report.status)}
                                         </span>
                                       </td>
                                       <td className="p-3 text-right">
                                         <div className="flex justify-end gap-2 flex-wrap">
                                           <button onClick={() => onSelectReport(report.id)} className="text-lpBlue hover:bg-blue-50 px-3 py-1.5 rounded transition font-bold text-xs flex items-center">
                                             Open <ChevronRight className="w-3 h-3 ml-1" />
                                           </button>
                                           {isSoftDeleteRole && !isAdmin && !showRecycleBin && (
                                             <button
                                               onClick={() => !isTemplateRow && onSoftDeleteReport(report.id)}
                                               disabled={isTemplateRow}
                                               className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${
                                                 isTemplateRow ? 'bg-navySecondary text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'
                                               }`}
                                             >
                                               <Trash2 className="w-3 h-3" /> Delete
                                             </button>
                                           )}
                                           {showRecycleBin && (
                                             <>
                                               {isAdmin && (
                                                 <button onClick={() => onUpdateReport(report.id, { sentAt: new Date().toISOString() })} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-xs font-bold">
                                                   Restore
                                                 </button>
                                               )}
                                               {!isAdmin && isSoftDeleteRole && (
                                                 <button onClick={() => onRestoreReport(report.id)} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-xs font-bold">
                                                   Restore
                                                 </button>
                                               )}
                                             </>
                                           )}
                                         </div>
                                       </td>
                                     </tr>
                                   );
                                 })}
                               </tbody>
                             </table>
                           </div>
                         )}
                       </div>
                     );
                   })}
                 </div>
               )}
             </div>
           )}
        </div>
        )}
        
        {!isStaff && (
          <div className="fixed bottom-8 right-8">
              <button onClick={onNewReport} className="bg-navy text-white p-4 rounded-full shadow-xl hover:bg-navySecondary transition transform hover:scale-110">
                  <FilePlus2 className="w-6 h-6"/>
              </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default Dashboard;
