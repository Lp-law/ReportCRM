import React from 'react';
import type { AdminPriorityInsights } from '../../../features/admin/adminPriorityAnalytics';
import { adminHe as adminHeDict } from '../i18n';

type AdminHe = typeof adminHeDict;

interface InsightsSectionProps {
  insights: AdminPriorityInsights;
  adminHe: AdminHe;
}

const InsightsSection: React.FC<InsightsSectionProps> = ({ insights, adminHe }) => {
  return (
    <section className="mb-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-1">{adminHe.insights.title}</h2>
        <p className="text-xs text-slate-500 mb-3">{adminHe.insights.subtitle}</p>
        {insights.totalScoredReports === 0 ? (
          <p className="text-xs text-slate-400">{adminHe.insights.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[260px] text-xs text-right">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold border-b border-slate-200">
                    {adminHe.insights.column.reason}
                  </th>
                  <th className="px-3 py-2 font-semibold border-b border-slate-200">
                    {adminHe.insights.column.count}
                  </th>
                  <th className="px-3 py-2 font-semibold border-b border-slate-200">
                    {adminHe.insights.column.share}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {insights.topReasons.map((r) => {
                  const percent = Math.round(r.share * 100);
                  return (
                    <tr key={r.code} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.labelHe}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.count}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{`${percent}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-2">{adminHe.insights.hint}</p>
      </div>
    </section>
  );
};

export default InsightsSection;


