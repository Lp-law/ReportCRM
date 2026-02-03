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
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor="lawyer-dashboard-search">
            {t('searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
          <input
            id="lawyer-dashboard-search"
            type="search"
            className="w-full rounded-full border border-gray-300 py-2 pr-9 pl-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-lpBlue focus:outline-none focus:ring-1 focus:ring-lpBlue"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <div className="flex items-center gap-2">
            <label
              htmlFor="lawyer-dashboard-status-filter"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {t('statusLabel')}
            </label>
            <select
              id="lawyer-dashboard-status-filter"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 focus:border-lpBlue focus:outline-none focus:ring-1 focus:ring-lpBlue"
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
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {t('sortByLabel')}
            </label>
            <select
              id="lawyer-dashboard-sort-by"
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 focus:border-lpBlue focus:outline-none focus:ring-1 focus:ring-lpBlue"
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
          <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-gray-300 text-lpBlue focus:ring-lpBlue"
              checked={onlyMyCases}
              onChange={(e) => onOnlyMyCasesChange(e.target.checked)}
            />
            <span>{t('onlyMyCases')}</span>
          </label>
          {hasActiveFilter && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[11px] font-medium text-gray-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lpBlue focus-visible:ring-offset-2"
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


