import React from 'react';
import type { ReportData } from '../../types';

interface Props {
  report: ReportData;
}

const FinanceReportBadge: React.FC<Props> = ({ report }) => {
  if (!report.expensesSheetId) return null;

  if (report.supersededByReportId) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 border border-slate-200"
        title="קיים דו״ח פיננסי עדכני יותר עבור אותו גיליון הוצאות"
      >
        הוחלף
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 border border-emerald-200"
      title="זהו הדו״ח הפיננסי העדכני עבור גיליון ההוצאות"
    >
      עדכני (פיננסים)
    </span>
  );
};

export default FinanceReportBadge;


