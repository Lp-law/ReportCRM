import React from 'react';
import type { ReportData } from '../../../types';
import { adminHe as adminHeDict } from '../i18n';

type AdminHe = typeof adminHeDict;

interface ReportsTableProps {
  reports: ReportData[];
  search: string;
  currentFilterLabel: string;
  onSearchChange: (value: string) => void;
  onResetUiState: () => void;
  onFilterAll: () => void;
  onNewReport: () => void;
  showNewReportButton?: boolean;
  getHebrewStatusLabel: (report: ReportData) => string;
  formatDateTime: (iso?: string) => string;
  onSelectReport: (id: string) => void;
  adminHe: AdminHe;
}

const ReportsTable: React.FC<ReportsTableProps> = ({
  reports,
  search,
  currentFilterLabel,
  onSearchChange,
  onResetUiState,
  onFilterAll,
  onNewReport,
  showNewReportButton = true,
  getHebrewStatusLabel,
  formatDateTime,
  onSelectReport,
  adminHe,
}) => {
  const trimmedSearch = search.trim();

  return (
    <section className="bg-panel rounded-xl shadow-sm border border-borderDark p-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{adminHe.table.title}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {adminHe.table.filterLabel}{' '}
            <span className="font-semibold text-slate-800">{currentFilterLabel}</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full md:w-auto">
          <input
            dir="rtl"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="חיפוש לפי מבוטח / תובעת / מבטחת / מספר תיק / UMR"
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-full border border-borderDark text-xs text-textLight bg-panel focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onResetUiState}
              className="px-3 py-1.5 rounded-full border border-borderDark text-xs text-textMuted hover:bg-navySecondary"
            >
              איפוס תצוגה
            </button>
            <button
              type="button"
              onClick={onFilterAll}
              className="px-3 py-1.5 rounded-full border border-borderDark text-xs text-textLight hover:bg-navySecondary"
            >
              {adminHe.actions.allReports}
            </button>
            <button
              type="button"
              onClick={onFilterAll}
              className="px-3 py-1.5 rounded-full border border-borderDark text-xs text-textLight hover:bg-navySecondary"
            >
              {adminHe.actions.clearFilter}
            </button>
            {showNewReportButton && (
              <button
                type="button"
                onClick={onNewReport}
                className="px-3 py-1.5 rounded-full bg-lpBlue text-white text-xs hover:bg-blue-800"
              >
                {adminHe.actions.openNewReport}
              </button>
            )}
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">
          {trimmedSearch ? 'לא נמצאו דוחות התואמים לחיפוש.' : adminHe.table.empty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-right">
            <thead className="bg-navySecondary text-textLight">
              <tr>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.id}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.status}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.hebrewStatus}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.insurer}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.insured}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.plaintiff}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {adminHe.table.columns.updatedAt}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-borderDark">
                  {/* action column */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-navySecondary">
                  <td className="px-3 py-2 whitespace-nowrap">{r.odakanitNo || r.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.status}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {getHebrewStatusLabel(r)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.insurerName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.insuredName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.plaintiffName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateTime(r.updatedAt || r.reportDate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectReport(r.id)}
                      className="px-2 py-1 rounded-md border border-borderDark300 text-[11px] hover:bg-navySecondary"
                    >
                      {adminHe.queueItem.openReport}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ReportsTable;


