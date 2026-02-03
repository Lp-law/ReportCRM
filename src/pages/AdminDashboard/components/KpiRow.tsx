import React from 'react';
import type { AdminKpis } from '../../../features/admin/adminKpis';
import { adminHe as adminHeDict } from '../i18n';
import type { FilterKey } from '../AdminDashboard';

type AdminHe = typeof adminHeDict;

interface KpiRowProps {
  filter: FilterKey;
  kpis: AdminKpis;
  activeReportsCount: number;
  onChangeFilter: (filter: FilterKey) => void;
  adminHe: AdminHe;
}

const KpiRow: React.FC<KpiRowProps> = ({
  filter,
  kpis,
  activeReportsCount,
  onChangeFilter,
  adminHe,
}) => {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      <button
        type="button"
        onClick={() => onChangeFilter('ALL')}
        className={`flex flex-col items-start p-3 rounded-xl border text-right transition ${
          filter === 'ALL'
            ? 'border-lpBlue bg-blue-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-500">{adminHe.table.filterAll}</span>
        <span className="text-lg font-bold text-slate-900 mt-1">{activeReportsCount}</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeFilter('HEBREW')}
        className={`flex flex-col items-start p-3 rounded-xl border text-right transition ${
          filter === 'HEBREW'
            ? 'border-amber-500 bg-amber-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-500">{adminHe.kpis.hebrewPending}</span>
        <span className="text-lg font-bold text-amber-700 mt-1">{kpis.hebrewPending}</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeFilter('FEEDBACK')}
        className={`flex flex-col items-start p-3 rounded-xl border text-right transition ${
          filter === 'FEEDBACK'
            ? 'border-purple-500 bg-purple-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-500">{adminHe.kpis.insurerFeedbackOpen}</span>
        <span className="text-lg font-bold text-purple-700 mt-1">
          {kpis.insurerFeedbackOpen}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChangeFilter('RESEND')}
        className={`flex flex-col items-start p-3 rounded-xl border text-right transition ${
          filter === 'RESEND'
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-500">{adminHe.kpis.resendReady}</span>
        <span className="text-lg font-bold text-emerald-700 mt-1">{kpis.resendReady}</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeFilter('MISSING_POLICY')}
        className={`flex flex-col items-start p-3 rounded-xl border text-right transition ${
          filter === 'MISSING_POLICY'
            ? 'border-rose-500 bg-rose-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-500">
          {adminHe.kpis.missingPolicyAppendix}
        </span>
        <span className="text-lg font-bold text-rose-700 mt-1">
          {kpis.missingPolicyAppendix}
        </span>
      </button>
    </section>
  );
};

export default KpiRow;


