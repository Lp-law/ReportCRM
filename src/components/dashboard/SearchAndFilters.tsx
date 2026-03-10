import React from 'react';
import { Search } from 'lucide-react';
import type { ReportStatus } from '../../types';
import { t } from './i18n';

export type DashboardSortBy = 'UPDATED' | 'REPORT_DATE' | 'INSURED';

interface SearchAndFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: ReportStatus | 'ALL';
  onStatusFilterChange: (status: ReportStatus | 'ALL') => void;
  onlyMyCases: boolean;
  onOnlyMyCasesChange: (value: boolean) => void;
  sortBy: DashboardSortBy;
  onSortByChange: (value: DashboardSortBy) => void;
  hasActiveFilter?: boolean;
  onClearFilters?: () => void;
}

const STATUS_OPTIONS: Array<{ value: ReportStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'כל הסטטוסים' },
  { value: 'DRAFT', label: 'טיוטה' },
  { value: 'TASK_ASSIGNED', label: 'משימה הוקצתה' },
  { value: 'WAITING_FOR_INVOICES', label: 'ממתין לחשבוניות' },
  { value: 'PENDING_REVIEW', label: 'ממתין לסקירה' },
  { value: 'APPROVED', label: 'מאושר' },
  { value: 'READY_TO_SEND', label: 'מוכן לשליחה' },
  { value: 'SENT', label: 'נשלח' },
];

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  onlyMyCases,
  onOnlyMyCasesChange,
  sortBy,
  onSortByChange,
  hasActiveFilter,
  onClearFilters,
}) => {
  return (
    <section
      aria-label={t('searchSectionLabel')}
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor="lawyer-dashboard-search">
            {t('searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="lawyer-dashboard-search"
            type="search"
            className="w-full rounded-full border border-slate-300 py-2.5 pr-10 pl-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <div className="flex items-center gap-2">
            <label
              htmlFor="lawyer-dashboard-status-filter"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600"
            >
              {t('statusLabel')}
            </label>
            <select
              id="lawyer-dashboard-status-filter"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
              value={statusFilter}
              onChange={(e) =>
                onStatusFilterChange(e.target.value as ReportStatus | 'ALL')
              }
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="lawyer-dashboard-sort-by"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600"
            >
              {t('sortByLabel')}
            </label>
            <select
              id="lawyer-dashboard-sort-by"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
              value={sortBy}
              onChange={(e) =>
                onSortByChange(e.target.value as DashboardSortBy)
              }
            >
              <option value="UPDATED">{t('sortByUpdated')}</option>
              <option value="REPORT_DATE">{t('sortByReportDate')}</option>
              <option value="INSURED">{t('sortByInsured')}</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900"
              checked={onlyMyCases}
              onChange={(e) => onOnlyMyCasesChange(e.target.checked)}
            />
            <span>{t('onlyMyCases')}</span>
          </label>
          {hasActiveFilter && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default SearchAndFilters;


