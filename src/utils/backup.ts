import type { ReportData, CaseFolder } from '../types';

const STORAGE_KEYS = {
  REPORTS: 'lp_reports',
  USER: 'lp_current_user',
  VIEW: 'lp_view',
  CURRENT_REPORT: 'lp_current_report',
  CASE_FOLDERS: 'lp_case_folders',
  NOTIFICATIONS: 'lp_notifications',
};

const FINANCIAL_STORE_KEY = 'financial_expenses_store_v1';

/** Collects all user data for backup and triggers download */
export const downloadFullBackup = (
  reports: ReportData[],
  currentReport: ReportData | null,
  caseFolders: Record<string, CaseFolder>,
) => {
  if (typeof window === 'undefined') return;
  try {
    const mergedReports = [...reports];
    if (currentReport) {
      const idx = mergedReports.findIndex((r) => r.id === currentReport.id);
      const merged = idx >= 0 ? { ...mergedReports[idx], ...currentReport } : currentReport;
      if (idx >= 0) mergedReports[idx] = merged;
      else mergedReports.push(merged);
    }
    const backup: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      reports: mergedReports,
      caseFolders,
      notifications: (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })(),
      financialStore: (() => {
        try {
          const raw = localStorage.getItem(FINANCIAL_STORE_KEY);
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })(),
      caseTemplates: (() => {
        try {
          const raw = localStorage.getItem('caseTemplates');
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })(),
      favoriteProviders: (() => {
        try {
          const raw = localStorage.getItem('favoriteProviders');
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Backup download failed', error);
  }
};
