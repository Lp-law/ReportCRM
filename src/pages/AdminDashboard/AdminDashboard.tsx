import React, { useMemo, useState } from 'react';
import { ReportData, User, CaseFolder } from '../../types';
import { USERS, SEED_TOOL_ENABLED } from '../../constants';
import SeedExistingCasesPanel from './components/SeedExistingCasesPanel';
import { adminHe } from './i18n';
import FinancialControl from './components/FinancialControl';
import { getInsurerFeedbackQueue, getResendEligibleQueue } from '../../features/admin/adminQueues';
import { buildReportSubject } from '../../utils/reportFileName';

export const ADMIN_DASHBOARD_UI_KEY = 'adminDashboardUiState:v1';

interface AdminDashboardProps {
  user: User;
  reports: ReportData[];
  caseFolders?: Record<string, CaseFolder>;
  onUpdateCaseFolders?: (updater: (folders: Record<string, CaseFolder>) => Record<string, CaseFolder>) => void;
  onSelectReport: (id: string) => void;
  onSelectReportWithFocus?: (id: string, focus: 'REVIEW' | 'EXTERNAL_FEEDBACK') => void;
  onMarkExternalIssuesDone?: (reportId: string) => void;
  onReopenHebrewDueToExternalFeedback?: (reportId: string) => void;
  onNewReport: () => void;
  canTranslate: (report: ReportData | null | undefined) => boolean;
  onLogout: () => void;
  onOpenAssistant?: () => void;
  onOpenCaseFolder?: (odakanitNo: string) => void;
}

export type FilterKey = 'ALL' | 'HEBREW' | 'FEEDBACK' | 'RESEND' | 'MISSING_POLICY';

type AdminScreen = 'SUMMARY' | 'LAWYER_CASES' | 'CASE_REPORTS';

const LAWYER_ORDER: string[] = ['u6', 'u5', 'u7', 'u4']; // Vlada, May, Orly, Hava

const LAWYER_CARDS = LAWYER_ORDER
  .map((id) => USERS.find((u) => u.id === id && u.role === 'LAWYER'))
  .filter((u): u is User => Boolean(u));

function getRowTone(report: ReportData): 'GREEN' | 'RED' | 'YELLOW' {
  // GREEN – sent to insurer (final)
  if (report.status === 'SENT') {
    return 'GREEN';
  }

  // RED – at Lior but not yet sent to insurer
  const reviewStatus = report.reportReview?.status;
  const hebrewStatus = report.hebrewWorkflowStatus;
  const isSentToLior =
    reviewStatus === 'SUBMITTED' ||
    reviewStatus === 'APPROVED' ||
    reviewStatus === 'CHANGES_REQUESTED' ||
    hebrewStatus === 'HEBREW_SUBMITTED' ||
    hebrewStatus === 'HEBREW_APPROVED' ||
    hebrewStatus === 'HEBREW_CHANGES_REQUESTED' ||
    hebrewStatus === 'HEBREW_REOPENED_EXTERNAL';

  if (isSentToLior && report.status !== 'SENT') {
    return 'RED';
  }

  // YELLOW – still at lawyer / not yet at Lior (fallback)
  return 'YELLOW';
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  reports,
  onSelectReport,
  onSelectReportWithFocus: _onSelectReportWithFocus,
  onMarkExternalIssuesDone: _onMarkExternalIssuesDone,
  onReopenHebrewDueToExternalFeedback: _onReopenHebrewDueToExternalFeedback,
  onNewReport,
  caseFolders,
  onUpdateCaseFolders,
  canTranslate,
  onLogout,
  onOpenAssistant,
  onOpenCaseFolder,
}) => {
  const activeReports = useMemo(
    () => reports.filter((r) => !r.deletedAt),
    [reports],
  );

  const insurerFeedbackQueue = useMemo(
    () => getInsurerFeedbackQueue(activeReports),
    [activeReports],
  );

  const resendQueue = useMemo(
    () => getResendEligibleQueue(activeReports, canTranslate),
    [activeReports, canTranslate],
  );

  const reportsByLawyer = useMemo(() => {
    const map = new Map<string, ReportData[]>();
    activeReports.forEach((r) => {
      if (!r.createdBy) return;
      const list = map.get(r.createdBy) || [];
      list.push(r);
      map.set(r.createdBy, list);
    });
    return map;
  }, [activeReports]);

  const lawyerCardsStats = useMemo(
    () =>
      LAWYER_CARDS.map((lawyer) => {
        const list = reportsByLawyer.get(lawyer.id) || [];
        const openReports = list.filter((r) => r.status !== 'SENT');
        const readyToSendCount = openReports.filter(
          (r) => r.status === 'READY_TO_SEND',
        ).length;
        const feedbackCount = insurerFeedbackQueue.filter(
          (r) => r.createdBy === lawyer.id,
        ).length;
        const resendCount = resendQueue.filter(
          (r) => r.createdBy === lawyer.id,
        ).length;
        return {
          lawyer,
          totalOpen: openReports.length,
          readyToSendCount,
          feedbackCount,
          resendCount,
        };
      }),
    [insurerFeedbackQueue, resendQueue, reportsByLawyer],
  );

  const getHebrewStatusLabel = (report: ReportData): string => {
    if (report.hebrewWorkflowStatus) return report.hebrewWorkflowStatus;
    return report.reportReview?.status ?? '-';
  };

  const formatDateTime = (iso?: string): string => {
    if (!iso) return adminHe.queueItem.noDate;
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('he-IL')} ${d
        .toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        .replace(':00', '')}`;
    } catch {
      return iso;
    }
  };

  const [activeView, setActiveView] = useState<'ADMIN' | 'FINANCIAL_CONTROL'>('ADMIN');
  const [selectedLawyerId, setSelectedLawyerId] = useState<string>(
    LAWYER_CARDS[0]?.id || '',
  );
  const [adminScreen, setAdminScreen] = useState<AdminScreen>('SUMMARY');
  const [selectedCaseOdakanit, setSelectedCaseOdakanit] = useState<string | null>(null);
  const [seedPanelOpen, setSeedPanelOpen] = useState(false);
  const closedCaseFolders: CaseFolder[] = useMemo(
    () =>
      caseFolders
        ? Object.values(caseFolders).filter((f) => f.closedAt)
        : [],
    [caseFolders],
  );

  const selectedLawyer = useMemo(
    () => LAWYER_CARDS.find((l) => l.id === selectedLawyerId) || LAWYER_CARDS[0],
    [selectedLawyerId],
  );

  const lawyerCasesForSelectedLawyer = useMemo(() => {
    if (!selectedLawyer) {
      return [] as {
        odakanitNo: string;
        displayOdakanit: string;
        representative: ReportData;
        lastUpdatedIso?: string;
        reportsCount: number;
      }[];
    }

    const list = reportsByLawyer.get(selectedLawyer.id) || [];
    const groups = new Map<string, ReportData[]>();

    list
      .filter((r) => !r.deletedAt)
      .forEach((r) => {
        const key =
          r.odakanitNo && r.odakanitNo.trim().length > 0
            ? r.odakanitNo.trim()
            : 'NO_ODAKANIT';
        const current = groups.get(key) || [];
        current.push(r);
        groups.set(key, current);
      });

    const rows = Array.from(groups.entries()).map(([key, caseReports]) => {
      let latest = caseReports[0];
      caseReports.forEach((cr) => {
        const t = new Date(cr.updatedAt || cr.reportDate).getTime();
        const tLatest = new Date(latest.updatedAt || latest.reportDate).getTime();
        if (t > tLatest) latest = cr;
      });

      const odakanitNo = key === 'NO_ODAKANIT' ? '' : key;
      const displayOdakanit = odakanitNo || 'ללא מספר עודכנית';
      const lastUpdatedIso = latest.updatedAt || latest.reportDate;

      return {
        odakanitNo,
        displayOdakanit,
        representative: latest,
        lastUpdatedIso,
        reportsCount: caseReports.length,
      };
    });

    // Add seeded-only CaseFolders assigned to this lawyer (no reports yet)
    const seededRows: {
      odakanitNo: string;
      displayOdakanit: string;
      representative: ReportData;
      lastUpdatedIso?: string;
      reportsCount: number;
    }[] = [];

    if (caseFolders) {
      Object.values(caseFolders).forEach((folder) => {
        if (!folder.odakanitNo) return;
        if (folder.assignedLawyer !== selectedLawyer.id) return;
        const key = folder.odakanitNo.trim();
        if (!key) return;
        if (groups.has(key)) return; // already covered by real reports

        const pseudoReport: ReportData = {
          id: `seed-folder-${key}`,
          createdBy: selectedLawyer.id,
          ownerName: selectedLawyer.name,
          ownerEmail: selectedLawyer.email,
          reportDate: folder.updatedAt || folder.createdAt,
          status: 'DRAFT',
          reportSubject: folder.reTemplate || '',
          recipientId: '1',
          insurerName: folder.insurerName || '',
          lineSlipNo: folder.lineSlipNo || '',
          marketRef: folder.marketRef || '',
          certificateRef: folder.certificateRef || '',
          insuredName: folder.insuredName || '',
          plaintiffName: folder.plaintiffName || '',
          plaintiffTitle: 'Plaintiff',
          sentAt: undefined,
          reportHistory: [],
          selectedTimeline: 'standard',
          filenameTag: 'New lawsuit',
          selectedSections: ['Update', 'Recommendations'],
          content: {},
          translatedContent: {},
          invoiceFiles: [],
          isWaitingForInvoices: false,
          requiresExpenses: false,
          isTranslated: false,
          expensesItems: [],
          expenseWorksheet: undefined,
          reportNotes: [],
          complaintAnalysis: undefined,
        };

        seededRows.push({
          odakanitNo: folder.odakanitNo,
          displayOdakanit: folder.odakanitNo || 'ללא מספר עודכנית',
          representative: pseudoReport,
          lastUpdatedIso: folder.updatedAt || folder.createdAt,
          reportsCount: folder.sentReports?.length || 0,
        });
      });
    }

    const allRows = [...rows, ...seededRows];

    return allRows.sort((a, b) => {
      const ta = a.lastUpdatedIso ? new Date(a.lastUpdatedIso).getTime() : 0;
      const tb = b.lastUpdatedIso ? new Date(b.lastUpdatedIso).getTime() : 0;
      return tb - ta;
    });
  }, [reportsByLawyer, selectedLawyer, caseFolders]);

  const caseReportsForSelected = useMemo(() => {
    if (!selectedLawyer || !selectedCaseOdakanit) {
      return [] as ReportData[];
    }

    const list = reportsByLawyer.get(selectedLawyer.id) || [];
    const trimmedOdakanit = selectedCaseOdakanit.trim();

    return list
      .filter((r) => !r.deletedAt)
      .filter((r) => (r.odakanitNo || '').trim() === trimmedOdakanit);
  }, [reportsByLawyer, selectedLawyer, selectedCaseOdakanit]);

  return (
    <div className="min-h-screen bg-navySecondary" dir="rtl">
      <div className="w-full px-6 md:px-8 lg:px-10 xl:px-12 py-6">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-textLight">{adminHe.title}</h1>
            <p className="text-sm text-textMuted mt-1">{adminHe.subtitle}</p>
            <p className="text-xs text-textMuted mt-1">
              מחובר/ת כ־<span className="font-semibold">{user.name}</span>{' '}
              <span className="ml-1 text-textMuted">
                ({user.role === 'SUB_ADMIN' ? 'SUB_ADMIN' : 'ADMIN'})
              </span>
            </p>
          </div>
          <div className="flex flex-col items-stretch md:flex-row md:items-center gap-3">
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold text-textMuted">
              <button
                type="button"
                onClick={() => setActiveView('ADMIN')}
                className={`px-3 py-1 rounded-full transition ${
                  activeView === 'ADMIN'
                    ? 'bg-panel text-textLight shadow-sm'
                    : 'text-textMuted hover:text-textLight'
                }`}
              >
                דשבורד אדמין
              </button>
              <button
                type="button"
                onClick={() => setActiveView('FINANCIAL_CONTROL')}
                className={`px-3 py-1 rounded-full transition ${
                  activeView === 'FINANCIAL_CONTROL'
                    ? 'bg-panel text-textLight shadow-sm'
                    : 'text-textMuted hover:text-textLight'
                }`}
              >
                בקרה פיננסית
              </button>
            </div>
            {onOpenAssistant && (
              <button
                type="button"
                onClick={() => onOpenAssistant()}
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-indigo-200 bg-panel text-xs font-semibold text-indigo-800 hover:bg-indigo-50 transition"
              >
                העוזר החכם
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-red-200 bg-panel text-sm font-semibold text-red-700 hover:bg-red-50 transition"
            >
              התנתק
            </button>
            {user.role !== 'ADMIN' && (
              <button
                onClick={onNewReport}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-lpBlue text-white text-sm font-semibold shadow-sm hover:bg-blue-800 transition"
              >
                {adminHe.actions.openNewReport}
              </button>
            )}
          </div>
        </header>

        {activeView === 'FINANCIAL_CONTROL' ? (
          <FinancialControl
            user={user}
            reports={reports}
            onOpenReport={onSelectReport}
          />
        ) : (
          <>
            {/* כרטיסיות לפי עורכת דין */}
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-textLight mb-2">
                סיכום לפי עורכת דין
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 text-xs">
                {lawyerCardsStats.map((card) => {
                  const isActive = selectedLawyer?.id === card.lawyer.id;
                  return (
                    <button
                      key={card.lawyer.id}
                      type="button"
                      onClick={() => {
                        setSelectedLawyerId(card.lawyer.id);
                        setSelectedCaseOdakanit(null);
                        setAdminScreen('LAWYER_CASES');
                      }}
                      className={`flex flex-col items-stretch rounded-2xl border px-3 py-3 text-right shadow-sm transition ${
                        isActive
                          ? 'border-gold bg-blue-50/80'
                          : 'border-borderDark bg-panel hover:bg-navySecondary'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-slate-700">
                          {card.lawyer.name}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-textMuted">
                          {card.totalOpen} פתוחים
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 text-[11px] text-textMuted">
                        <span>
                          מוכן לשליחה:&nbsp;
                          <span className="font-semibold text-emerald-700">
                            {card.readyToSendCount}
                          </span>
                        </span>
                        <span>
                          חזרו עם הערות:&nbsp;
                          <span className="font-semibold text-purple-700">
                            {card.feedbackCount}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {SEED_TOOL_ENABLED && user.role === 'ADMIN' && caseFolders && onUpdateCaseFolders && (
              <section className="mb-6">
                {!seedPanelOpen ? (
                  <button
                    type="button"
                    onClick={() => setSeedPanelOpen(true)}
                    className="inline-flex items-center px-4 py-2 rounded-lg border border-borderDark bg-panel text-sm font-semibold text-textLight hover:bg-navySecondary transition"
                  >
                    SEED
                  </button>
                ) : (
                  <div className="bg-panel rounded-2xl border border-borderDark shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-borderDark bg-navySecondary">
                      <span className="text-sm font-semibold text-textLight">Seed Existing Cases</span>
                      <button
                        type="button"
                        onClick={() => setSeedPanelOpen(false)}
                        className="text-[11px] px-3 py-1 rounded border border-borderDark text-textMuted hover:bg-panel"
                      >
                        סגור
                      </button>
                    </div>
                    <div className="p-4">
                      <SeedExistingCasesPanel
                        caseFolders={caseFolders}
                        onUpdateCaseFolders={onUpdateCaseFolders}
                        reports={reports}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {user.role === 'ADMIN' && closedCaseFolders.length > 0 && (
              <section className="mb-6 bg-panel rounded-2xl border border-borderDark shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-textLight">
                      תיקים סגורים
                    </h2>
                    <p className="text-[11px] text-textMuted">
                      תיקים שסומנו כסגורים ואינם מופיעים בדשבורדים הרגילים. ניתן לפתוח לצפייה, לפתוח מחדש (מתוך מסך התיק) או למחוק לצמיתות.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-borderDark bg-navySecondary">
                        <th className="px-2 py-1 text-right font-semibold">
                          מס׳ תיק בעודכנית
                        </th>
                        <th className="px-2 py-1 text-right font-semibold">
                          מבוטח
                        </th>
                        <th className="px-2 py-1 text-right font-semibold">
                          תובעת
                        </th>
                        <th className="px-2 py-1 text-right font-semibold">
                          נסגר בתאריך
                        </th>
                        <th className="px-2 py-1 text-right font-semibold">
                          פעולות
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedCaseFolders.map((folder) => {
                        const closedAt = folder.closedAt
                          ? new Date(folder.closedAt).toLocaleDateString('he-IL')
                          : '—';
                        return (
                          <tr key={folder.odakanitNo} className="border-b border-borderDark">
                            <td className="px-2 py-1 text-right font-semibold text-textLight">
                              {folder.odakanitNo}
                            </td>
                            <td className="px-2 py-1 text-right text-slate-700">
                              {folder.insuredName || '—'}
                            </td>
                            <td className="px-2 py-1 text-right text-slate-700">
                              {folder.plaintiffName || '—'}
                            </td>
                            <td className="px-2 py-1 text-right text-textMuted">
                              {closedAt}
                            </td>
                            <td className="px-2 py-1 text-left">
                              {onOpenCaseFolder && (
                                <button
                                  type="button"
                                  onClick={() => onOpenCaseFolder(folder.odakanitNo)}
                                  className="inline-flex items-center rounded-full bg-panel px-3 py-1 text-[11px] font-semibold text-gold border border-gold hover:bg-navySecondary"
                                >
                                  פתח תיק
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* LAWYER_CASES screen */}
            {adminScreen === 'LAWYER_CASES' && selectedLawyer && (
              <section className="mb-6 bg-panel rounded-2xl border border-borderDark shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-textLight">
                      תיקים לפי מספר עודכנית – {selectedLawyer.name}
              </h2>
                    <p className="text-[11px] text-textMuted">
                      רשימת תיקים לפי מספר עודכנית עבור עורכת הדין שנבחרה.
                      </p>
                    </div>
                    <button
                      type="button"
                    onClick={() => {
                      setAdminScreen('SUMMARY');
                      setSelectedCaseOdakanit(null);
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-borderDark text-slate-700 hover:bg-navySecondary"
                    >
                    חזרה לסיכום
                    </button>
          </div>
                {lawyerCasesForSelectedLawyer.length === 0 ? (
                  <p className="text-xs text-textMuted">
                    אין כרגע תיקים פעילים עבור עורכת דין זו.
              </p>
            ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-borderDark bg-navySecondary">
                          <th className="px-2 py-1 text-right font-semibold">
                            כותרת הדיווח
                          </th>
                          <th className="px-2 py-1 text-right font-semibold w-20">
                            REPORT NO.
                          </th>
                          <th className="px-2 py-1 text-right font-semibold w-40">
                            PLAINTIFF/CLAIMANT
                          </th>
                          <th className="px-2 py-1 text-right font-semibold w-40">
                            INSURED
                          </th>
                          <th className="px-2 py-1 text-right font-semibold w-40">
                            INSURER
                          </th>
                          <th className="px-2 py-1 text-right font-semibold w-28">
                            מס' תיק בעודכנית
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lawyerCasesForSelectedLawyer.map((row) => {
                          const { representative } = row;
                          const isClickable = !!row.odakanitNo;

                          const fullSubject = buildReportSubject(representative);
                          const subjectParts = fullSubject ? fullSubject.split(' - ') : [];
                          const primaryTitle =
                            subjectParts.length <= 2
                              ? fullSubject
                              : subjectParts[subjectParts.length - 2] || fullSubject;

                          const reportNumber =
                            typeof representative.reportNumber === 'number' &&
                            representative.reportNumber > 0
                              ? representative.reportNumber
                              : (representative.reportHistory?.length || 0) + 1;

                          const plaintiffName = representative.plaintiffName || '—';
                          const insuredName = representative.insuredName || '—';
                          const insurerName = representative.insurerName || '—';

                          return (
                            <tr
                              key={row.displayOdakanit}
                              className={`border-b border-borderDark ${
                                isClickable
                                  ? 'hover:bg-navySecondary cursor-pointer'
                                  : 'bg-navySecondary/40 text-textMuted'
                              }`}
                              onClick={() => {
                                if (!isClickable) return;
                                setSelectedCaseOdakanit(row.odakanitNo);
                                setAdminScreen('CASE_REPORTS');
                              }}
                            >
                              <td className="px-2 py-1 text-right">
                                <div className="text-textLight">
                                  {primaryTitle || '—'}
                                </div>
                                <div className="text-[10px] text-textMuted">
                                  {formatDateTime(row.lastUpdatedIso)}
                                </div>
                              </td>
                              <td className="px-2 py-1 text-right text-slate-700 font-mono text-[11px]">
                                {reportNumber}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-700">
                                {plaintiffName}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-700">
                                {insuredName}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-700">
                                {insurerName}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px]">
                                {row.displayOdakanit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* CASE_REPORTS screen */}
            {adminScreen === 'CASE_REPORTS' &&
              selectedLawyer &&
              selectedCaseOdakanit && (
                <section className="mb-6 bg-panel rounded-2xl border border-borderDark shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-textLight">
                        דיווחים בתיק {selectedCaseOdakanit} – {selectedLawyer.name}
                      </h2>
                      <p className="text-[11px] text-textMuted">
                        כל הדיווחים בתיק, כולל כאלו שנשלחו לחברת הביטוח.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminScreen('LAWYER_CASES')}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-borderDark text-slate-700 hover:bg-navySecondary"
                    >
                      חזרה לתיקים
                    </button>
          </div>
                  {caseReportsForSelected.length === 0 ? (
                    <p className="text-xs text-textMuted">
                      לא נמצאו דיווחים עבור תיק זה.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-borderDark bg-navySecondary">
                            <th className="px-2 py-1 text-right font-semibold w-64">
                              כותרת / מבוטח / תובעת
                            </th>
                            <th className="px-2 py-1 text-right font-semibold w-24">
                              מס׳ דו\"ח
                            </th>
                            <th className="px-2 py-1 text-right font-semibold w-32">
                              סטטוס
                            </th>
                            <th className="px-2 py-1 text-right font-semibold w-32">
                              עדכון אחרון
                            </th>
                            <th className="px-2 py-1 text-right font-semibold w-28" />
                          </tr>
                        </thead>
                        <tbody>
                          {caseReportsForSelected.map((r) => {
                            const tone = getRowTone(r);
                            const toneClass =
                              tone === 'GREEN'
                                ? 'bg-emerald-50'
                                : tone === 'RED'
                                ? 'bg-red-50'
                                : 'bg-yellow-50';

                            const isFromIris = !!r.expensesSheetId;
                            const title =
                              r.reportSubject ||
                              r.insuredName ||
                              r.plaintiffName ||
                              '—';
                            const reportNumber =
                              typeof r.reportNumber === 'number' && r.reportNumber > 0
                                ? r.reportNumber
                                : (r.reportHistory?.length || 0) + 1;

                            return (
                              <tr
                    key={r.id}
                                className={`border-b border-borderDark hover:bg-slate-100 cursor-pointer ${toneClass}`}
                                onClick={() => onSelectReport(r.id)}
                              >
                                <td className="px-2 py-1 text-right">
                                  <div className="text-textLight flex flex-wrap items-center gap-1 justify-end">
                                    <span>{title}</span>
                                    {isFromIris && (
                                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                        מאיריס / טבלת הוצאות
                                      </span>
                                    )}
                                  </div>
                                  {(r.insuredName || r.plaintiffName) && (
                                    <div className="text-[10px] text-textMuted">
                                      {[r.insuredName, r.plaintiffName]
                                        .filter(Boolean)
                                        .join(' / ')}
                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-1 text-right text-slate-700">
                                  {reportNumber}
                                </td>
                                <td className="px-2 py-1 text-right text-slate-700">
                                  {getHebrewStatusLabel(r)} ({r.status})
                                </td>
                                <td className="px-2 py-1 text-right text-textMuted whitespace-nowrap">
                                  {formatDateTime(r.updatedAt || r.reportDate)}
                                </td>
                                <td className="px-2 py-1 text-left">
                    <button
                      type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectReport(r.id);
                                    }}
                                    className="inline-flex items-center rounded-full bg-lpBlue px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-900"
                    >
                                    פתח דו\"ח
                    </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
          </div>
                  )}
        </section>
        )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;


