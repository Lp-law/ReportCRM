import { useState, useEffect } from 'react';
import type { ReportData } from '../types';

export const useReportLock = (currentReport: ReportData | null) => {
  const [canEditLockedReportForId, setCanEditLockedReportForId] = useState<string | null>(null);

  // Clear admin override when switching away from a report
  useEffect(() => {
    if (!currentReport || currentReport.id !== canEditLockedReportForId) {
      setCanEditLockedReportForId(null);
    }
  }, [currentReport, canEditLockedReportForId]);

  const enableOverride = (reportId: string) => setCanEditLockedReportForId(reportId);
  const clearOverride = () => setCanEditLockedReportForId(null);

  return {
    canEditLockedReportForId,
    enableOverride,
    clearOverride,
  };
};
