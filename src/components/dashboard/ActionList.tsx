import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReportData } from '../../types';
import CaseCard from './CaseCard';
import EmptyState from './EmptyState';
import { getCaseKey } from './caseKey';
import { t } from './i18n';

interface ActionListProps {
  id: string;
  title: string;
  description: string;
  reports: ReportData[];
  defaultCollapsed?: boolean;
  onOpenReport: (report: ReportData) => void;
  onDeleteReport?: (report: ReportData) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  pinnedIds?: string[];
  onTogglePin?: (report: ReportData) => void;
  density?: 'COMFORTABLE' | 'COMPACT';
  stickyOffsetPx?: number;
  isNewCase?: (report: ReportData) => boolean;
}

export const ActionList: React.FC<ActionListProps> = ({
  id,
  title,
  description,
  reports,
  defaultCollapsed = false,
  onOpenReport,
  onDeleteReport,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  pinnedIds,
  onTogglePin,
  density = 'COMFORTABLE',
  stickyOffsetPx,
  isNewCase,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const count = reports.length;

  const sortedReports = useMemo(() => reports, [reports]);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <section
      aria-labelledby={`lawyer-section-${id}`}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header
        className={[
          'flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4',
          typeof stickyOffsetPx === 'number'
            ? 'sticky z-10 bg-white/90 backdrop-blur-sm'
            : '',
        ].join(' ')}
        style={
          typeof stickyOffsetPx === 'number' ? { top: stickyOffsetPx } : undefined
        }
      >
        <div>
          <h2
            id={`lawyer-section-${id}`}
            className="text-base font-semibold text-slate-900 md:text-lg"
          >
            {title}{' '}
            <span className="text-sm font-normal text-slate-600">
              ({count})
            </span>
          </h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2"
          aria-expanded={!collapsed}
          aria-controls={`lawyer-section-body-${id}`}
        >
          {collapsed ? (
            <>
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              {t('expand')}
            </>
          ) : (
            <>
              <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
              {t('collapse')}
            </>
          )}
        </button>
      </header>
      <div
        id={`lawyer-section-body-${id}`}
        className={collapsed ? 'hidden' : ''}
      >
        {sortedReports.length === 0 ? (
          <EmptyState
            title={emptyTitle || t('defaultEmptyTitle')}
            description={emptyDescription || t('defaultEmptyDescription')}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        ) : (
          <div className="space-y-3 p-5">
            {sortedReports.map((report) => (
              <CaseCard
                key={report.id}
                report={report}
                onOpen={() => onOpenReport(report)}
                onDelete={
                  onDeleteReport ? () => onDeleteReport(report) : undefined
                }
                pinned={
                  pinnedIds ? pinnedIds.includes(getCaseKey(report)) : false
                }
                onTogglePin={
                  onTogglePin ? () => onTogglePin(report) : undefined
                }
                density={density}
                isNewCase={isNewCase ? isNewCase(report) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ActionList;


