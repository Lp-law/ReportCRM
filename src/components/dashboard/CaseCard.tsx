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
      className={`flex flex-col border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2 ${
        density === 'COMPACT' ? 'rounded-xl p-4' : 'rounded-2xl p-5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-right flex-1">
          <h3 className="mb-1 text-lg font-semibold text-slate-900">
            {primary}
          </h3>
          <p className="mb-1 text-base font-semibold text-amber-700">
            {t('labelFile')}: {report.odakanitNo || '—'}
          </p>
          {density === 'COMPACT' ? (
            secondary && (
              <p className="mt-0.5 text-sm text-slate-600">{secondary}</p>
            )
          ) : (
            <>
              {secondary && (
                <p className="mb-1.5 text-base text-slate-600">{secondary}</p>
              )}
              <div className="space-y-0.5 mt-1">
                {dateLabel && (
                  <p className="text-sm text-slate-600">
                    {t('labelUpdated')} {dateLabel}
                  </p>
                )}
                {nextStep && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">
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
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {getHebrewWorkflowBadgeLabel(report.hebrewWorkflowStatus)}
            </span>
          )}
          {report.policyFile && (report.attachPolicyAsAppendix ?? true) && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Policy attached as appendix
            </span>
          )}
          {typeof isNewCase === 'boolean' && (
            <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {isNewCase ? t('tagNewCase') : t('tagOngoingCase')}
            </span>
          )}
          {alertLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {alertLabel}
            </span>
          )}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              className={`inline-flex items-center justify-center rounded-full border bg-white p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                pinned
                  ? 'border-amber-300 text-amber-600'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              aria-label={
                pinned ? `${t('unpin')} ${primary}` : `${t('pin')} ${primary}`
              }
              title={pinned ? t('unpin') : t('pin')}
            >
              <Star
                className={`h-4 w-4 ${
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
            className="inline-flex items-center rounded-full bg-blue-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            aria-label={`${t('openContinue')} ${primary}`}
          >
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            {t('openContinue')}
          </button>
        </div>
        <div className="flex flex-row-reverse items-center gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            aria-label={`${t('preview')} ${primary}`}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            aria-label={`${t('viewSections')} ${primary}`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
          </button>
          {deletable && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center rounded-full border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              aria-label={t('deleteDraftAria')}
              title={t('deleteTitle')}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default CaseCard;


