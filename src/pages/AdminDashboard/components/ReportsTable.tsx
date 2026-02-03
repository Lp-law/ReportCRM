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
  getHebrewStatusLabel,
  formatDateTime,
  onSelectReport,
  adminHe,
}) => {
  const trimmedSearch = search.trim();

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
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
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-lpBlue"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onResetUiState}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
            >
              איפוס תצוגה
            </button>
            <button
              type="button"
              onClick={onFilterAll}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
            >
              {adminHe.actions.allReports}
            </button>
            <button
              type="button"
              onClick={onFilterAll}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
            >
              {adminHe.actions.clearFilter}
            </button>
            <button
              type="button"
              onClick={onNewReport}
              className="px-3 py-1.5 rounded-full bg-lpBlue text-white text-xs hover:bg-blue-800"
            >
              {adminHe.actions.openNewReport}
            </button>
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
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.id}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.status}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.hebrewStatus}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.insurer}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.insured}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.plaintiff}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {adminHe.table.columns.updatedAt}
                </th>
                <th className="px-3 py-2 font-semibold border-b border-slate-200">
                  {/* action column */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
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
                      className="px-2 py-1 rounded-md border border-slate-300 text-[11px] hover:bg-slate-100"
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


