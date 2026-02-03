import React from 'react';
import type { AdminAttentionItem } from '../../../features/admin/adminPriority';
import { adminHe as adminHeDict } from '../i18n';

type AdminHe = typeof adminHeDict;

interface AttentionPanelProps {
  items: AdminAttentionItem[];
  adminHe: AdminHe;
  onSelectReportWithFocus?: (id: string, focus: 'REVIEW' | 'EXTERNAL_FEEDBACK') => void;
  onSelectReport: (id: string) => void;
  onRequestPendingAction?: (action: {
    kind: 'MARK_EXTERNAL_DONE' | 'REOPEN_HEBREW';
    reportId: string;
    reportLabel: string;
  }) => void;
}

const AttentionPanel: React.FC<AttentionPanelProps> = ({
  items,
  adminHe,
  onSelectReport,
  onSelectReportWithFocus,
  onRequestPendingAction,
}) => {
  if (!items.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-1">{adminHe.attention.title}</h2>
        <p className="text-xs text-slate-500 mb-2">{adminHe.attention.subtitle}</p>
        <p className="text-xs text-emerald-600 mt-2">{adminHe.attention.empty}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="text-sm font-bold text-slate-900 mb-1">{adminHe.attention.title}</h2>
      <p className="text-xs text-slate-500 mb-3">{adminHe.attention.subtitle}</p>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const { report, reasons, score } = item;
          const idLabel = report.odakanitNo || report.marketRef || report.id;
          const nameLabel = report.insuredName || report.plaintiffName || '';
          const insurer = report.insurerName || '';
          const ts = report.updatedAt || report.reportDate;
          const lastUpdated = ts
            ? new Date(ts).toLocaleDateString('he-IL', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
              })
            : adminHe.queueItem.noDate;

          const maxReasonsToShow = 3;
          const visibleReasons = reasons.slice(0, maxReasonsToShow);
          const hiddenCount = reasons.length - visibleReasons.length;
          const hebrewStatus = report.hebrewWorkflowStatus || report.reportReview?.status;
          const isHebrewRelevant =
            hebrewStatus === 'HEBREW_SUBMITTED' ||
            hebrewStatus === 'HEBREW_CHANGES_REQUESTED' ||
            hebrewStatus === 'HEBREW_REOPENED_EXTERNAL' ||
            hebrewStatus === 'SUBMITTED' ||
            hebrewStatus === 'CHANGES_REQUESTED';
          const hasExternalIssue =
            report.reportReview?.issues?.some(
              (issue) =>
                (issue.origin ?? 'INTERNAL') === 'EXTERNAL' && issue.status !== 'DONE',
            ) ?? false;
          const hasExternalRequiresHebrew =
            report.reportReview?.issues?.some(
              (issue) =>
                (issue.origin ?? 'INTERNAL') === 'EXTERNAL' &&
                issue.status !== 'DONE' &&
                issue.externalAction === 'REQUIRES_HEBREW',
            ) ?? false;
          const reportLabel =
            idLabel || nameLabel || insurer || report.reportSubject || report.id;

          return (
            <div
              key={report.id}
              className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-amber-900 truncate max-w-[220px]">
                    {idLabel}
                    {nameLabel ? ` – ${nameLabel}` : ''}
                  </span>
                  {insurer && (
                    <span className="text-xs text-amber-800 truncate max-w-[180px]">
                      ({insurer})
                    </span>
                  )}
                  <span className="text-[11px] text-amber-700 mr-auto">
                    {`עודכן לאחרונה: ${lastUpdated}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <span className="text-[11px] text-amber-900 mr-1">
                    {adminHe.attention.reasons}
                  </span>
                  {visibleReasons.map((reason) => (
                    <span
                      key={reason.code}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-600 text-white"
                    >
                      {reason.labelHe}
                    </span>
                  ))}
                  {hiddenCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {`+${hiddenCount}`}
                    </span>
                  )}
                  <span className="text-[10px] text-amber-700 ml-auto">{`Score: ${score}`}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectReport(report.id)}
                className="text-[11px] px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap"
              >
                {adminHe.attention.openReport}
              </button>
              {isHebrewRelevant && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectReportWithFocus
                      ? onSelectReportWithFocus(report.id, 'REVIEW')
                      : onSelectReport(report.id)
                  }
                  className="mt-1 text-[11px] px-3 py-1.5 rounded-md border border-amber-300 text-amber-800 bg-white hover:bg-amber-50 whitespace-nowrap"
                >
                  {adminHe.attention.jumpToReview}
                </button>
              )}
              {hasExternalIssue && (
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectReportWithFocus
                        ? onSelectReportWithFocus(report.id, 'EXTERNAL_FEEDBACK')
                        : onSelectReport(report.id)
                    }
                    className="text-[11px] px-3 py-1.5 rounded-md border border-amber-300 text-amber-800 bg-white hover:bg-amber-50 whitespace-nowrap"
                  >
                    {adminHe.attention.jumpToExternal}
                  </button>
                  {hasExternalRequiresHebrew && onRequestPendingAction && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          onRequestPendingAction({
                            kind: 'REOPEN_HEBREW',
                            reportId: report.id,
                            reportLabel,
                          })
                        }
                        className="text-[11px] px-3 py-1.5 rounded-md border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 whitespace-nowrap"
                      >
                        {adminHe.attention.reopenHebrew}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onRequestPendingAction({
                            kind: 'MARK_EXTERNAL_DONE',
                            reportId: report.id,
                            reportLabel,
                          })
                        }
                        className="text-[11px] px-3 py-1.5 rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 whitespace-nowrap"
                      >
                        {adminHe.attention.markExternalDone}
                      </button>
                    </>
                  )}
                  {!hasExternalRequiresHebrew && onRequestPendingAction && (
                    <button
                      type="button"
                      onClick={() =>
                        onRequestPendingAction({
                          kind: 'MARK_EXTERNAL_DONE',
                          reportId: report.id,
                          reportLabel,
                        })
                      }
                      className="text-[11px] px-3 py-1.5 rounded-md border border-red-200 text-red-700 bg-white hover:bg-red-50 whitespace-nowrap"
                    >
                      {adminHe.attention.markExternalDone}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttentionPanel;


