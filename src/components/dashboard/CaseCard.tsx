import React, { KeyboardEvent } from 'react';
import { FileText, Eye, Trash2, ArrowRight, Star, AlertCircle } from 'lucide-react';
import type { ReportData, ReportStatus } from '../../types';
import { StatusPill } from './StatusPill';
import { t } from './i18n';
import { getNextStepLabelForStatus, getAlertLabelForReport } from './workRules';
import { getHebrewWorkflowBadgeLabel } from '../reviewLabels';

interface CaseCardProps {
  report: ReportData;
  onOpen: () => void;
  onDelete?: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  density?: 'COMFORTABLE' | 'COMPACT';
  isNewCase?: boolean;
}

const getPrimaryLabel = (report: ReportData) =>
  report.insuredName || report.plaintiffName || report.odakanitNo || t('untitledCase');

const getSecondaryLabel = (report: ReportData) => {
  const parts: string[] = [];
  if (report.plaintiffName) {
    parts.push(`${t('labelPlaintiff')}: ${report.plaintiffName}`);
  }
  if (report.insurerName) {
    parts.push(`${t('labelInsurer')}: ${report.insurerName}`);
  }
  return parts.join(' · ');
};

const canDeleteDraftReport = (status: ReportStatus) => status === 'DRAFT';

export const CaseCard: React.FC<CaseCardProps> = ({
  report,
  onOpen,
  onDelete,
  pinned = false,
  onTogglePin,
  density = 'COMFORTABLE',
  isNewCase,
}) => {
  const primary = getPrimaryLabel(report);
  const secondary = getSecondaryLabel(report);
  const deletable = onDelete && canDeleteDraftReport(report.status);
  const dateLabel = report.reportDate
    ? new Date(report.reportDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const nextStep = getNextStepLabelForStatus(report.status);
  const alertLabel = getAlertLabelForReport(report);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`flex flex-col border border-borderDark bg-panel shadow-sm transition hover:border-gold/50 hover:shadow-md focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2 ${
        density === 'COMPACT' ? 'rounded-xl p-3' : 'rounded-2xl p-4'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-right flex-1">
          <h3 className="text-base font-semibold text-textLight mb-0.5">
            {primary}
          </h3>
          <p className="text-sm font-semibold text-goldLight mb-0.5">
            {t('labelFile')}: {report.odakanitNo || '—'}
          </p>
          {density === 'COMPACT' ? (
            secondary && (
              <p className="mt-0.5 text-xs text-textMuted600">{secondary}</p>
            )
          ) : (
            <>
              {secondary && (
                <p className="text-sm text-textMuted600 mb-1.5">{secondary}</p>
              )}
              <div className="space-y-0.5 mt-1">
                {dateLabel && (
                  <p className="text-xs text-textMuted">
                    {t('labelUpdated')} {dateLabel}
                  </p>
                )}
                {nextStep && (
                  <p className="text-xs text-textMuted600">
                    <span className="font-medium text-textLight">
                      {t('labelNextStep')}
                    </span>{' '}
                    {nextStep}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill status={report.status} />
          {report.hebrewWorkflowStatus && (
            <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {getHebrewWorkflowBadgeLabel(report.hebrewWorkflowStatus)}
            </span>
          )}
          {report.policyFile && (report.attachPolicyAsAppendix ?? true) && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Policy attached as appendix
            </span>
          )}
          {typeof isNewCase === 'boolean' && (
            <span className="inline-flex items-center rounded-full border border-borderDark200 bg-navySecondary px-2 py-0.5 text-[11px] font-medium text-textMuted600">
              {isNewCase ? t('tagNewCase') : t('tagOngoingCase')}
            </span>
          )}
          {alertLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {alertLabel}
            </span>
          )}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              className={`inline-flex items-center justify-center rounded-full border bg-white p-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                pinned
                  ? 'border-amber-300 text-amber-600'
                  : 'border-borderDark200 text-textMuted hover:bg-navySecondary'
              }`}
              aria-label={
                pinned ? `${t('unpin')} ${primary}` : `${t('pin')} ${primary}`
              }
              title={pinned ? t('unpin') : t('pin')}
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  pinned ? 'fill-amber-400' : 'fill-none'
                }`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-row-reverse items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center rounded-full bg-lpBlue px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            aria-label={`${t('openContinue')} ${primary}`}
          >
            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            {t('openContinue')}
          </button>
        </div>
        <div className="flex flex-row-reverse items-center gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center rounded-full border border-borderDark200 bg-white p-1.5 text-textMuted600 hover:bg-navySecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            aria-label={`${t('preview')} ${primary}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center rounded-full border border-borderDark200 bg-white p-1.5 text-textMuted600 hover:bg-navySecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            aria-label={`${t('viewSections')} ${primary}`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {deletable && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center rounded-full border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              aria-label={t('deleteDraftAria')}
              title={t('deleteTitle')}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default CaseCard;


