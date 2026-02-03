import type { CaseFolder, ReportData, SentReportSnapshot } from '../types';
import { normalizeOdakanitNo } from '../utils/normalizeOdakanitNo';

const CASE_FOLDERS_KEY = 'lp_case_folders';
const CASE_FOLDERS_MIGRATED_FLAG = 'lp_case_folders_migrated';

export const loadCaseFolders = (): Record<string, CaseFolder> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CASE_FOLDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CaseFolder>;
  } catch (error) {
    console.error('Failed to load case folders', error);
    return {};
  }
};

export const saveCaseFolders = (folders: Record<string, CaseFolder>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CASE_FOLDERS_KEY, JSON.stringify(folders));
  } catch (error) {
    console.error('Failed to persist case folders', error);
  }
};

export const canonicalizeCaseFoldersKeys = (
  folders: Record<string, CaseFolder>,
): Record<string, CaseFolder> => {
  if (!folders || typeof folders !== 'object') return {};

  const next: Record<string, CaseFolder> = {};
  let changed = false;

  Object.entries(folders).forEach(([oldKey, folder]) => {
    const sourceKey = folder.odakanitNo || oldKey;
    const newKey = normalizeOdakanitNo(sourceKey);
    if (!newKey) {
      changed = true;
      return;
    }

    const existing = next[newKey];
    if (!existing) {
      next[newKey] = { ...folder, odakanitNo: newKey };
      if (newKey !== oldKey) {
        changed = true;
      }
      return;
    }

    // Collision: merge folders into a single canonical entry.
    changed = true;

    const pickMoreRecent = (
      a?: CaseFolder,
      b?: CaseFolder,
    ): CaseFolder | undefined => {
      if (!a) return b;
      if (!b) return a;
      const aTime = new Date(a.updatedAt || a.createdAt || '').getTime() || 0;
      const bTime = new Date(b.updatedAt || b.createdAt || '').getTime() || 0;
      return bTime > aTime ? b : a;
    };

    let base: CaseFolder = existing;
    let other: CaseFolder = folder;

    // Prefer closed case over open.
    if (!existing.closedAt && folder.closedAt) {
      base = folder;
      other = existing;
    } else {
      const newer = pickMoreRecent(existing, folder);
      if (newer === folder) {
        base = folder;
        other = existing;
      }
    }

    const merged: CaseFolder = {
      ...base,
      odakanitNo: newKey,
      reTemplate: base.reTemplate || other.reTemplate || '',
      insuredName: base.insuredName || other.insuredName || '',
      insurerName: base.insurerName || other.insurerName || '',
      plaintiffName: base.plaintiffName || other.plaintiffName || '',
      marketRef: base.marketRef || other.marketRef || '',
      lineSlipNo: base.lineSlipNo || other.lineSlipNo || '',
      certificateRef: base.certificateRef || other.certificateRef || '',
      createdAt: base.createdAt || other.createdAt,
      updatedAt: base.updatedAt || other.updatedAt,
      closedAt: base.closedAt || other.closedAt || null,
      closedByUserId: base.closedByUserId || other.closedByUserId || null,
      reportIds: Array.from(
        new Set([...(base.reportIds || []), ...(other.reportIds || [])]),
      ),
      sentReports: [...(base.sentReports || []), ...(other.sentReports || [])],
    };

    next[newKey] = merged;
  });

  return changed ? next : folders;
};

export const upsertCaseFolderFromReportInMap = (
  folders: Record<string, CaseFolder>,
  report: ReportData,
  nowIso?: string,
): Record<string, CaseFolder> => {
  if (!report.odakanitNo) return folders;
  const key = normalizeOdakanitNo(report.odakanitNo);
  if (!key) return folders;
  const timestamp = nowIso || new Date().toISOString();

  const existing = folders[key];
  const base: CaseFolder = existing || {
    odakanitNo: key,
    reTemplate: '',
    insuredName: '',
    insurerName: '',
    plaintiffName: '',
    marketRef: '',
    lineSlipNo: '',
    certificateRef: '',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: existing?.updatedAt || timestamp,
    reportIds: [],
    sentReports: existing?.sentReports || [],
  };

  const next: CaseFolder = {
    ...base,
    insuredName: report.insuredName || base.insuredName,
    insurerName: report.insurerName || base.insurerName,
    plaintiffName: report.plaintiffName || base.plaintiffName,
    marketRef: report.marketRef || base.marketRef,
    lineSlipNo: report.lineSlipNo || base.lineSlipNo,
    certificateRef: report.certificateRef || base.certificateRef,
    updatedAt: timestamp,
    reportIds: base.reportIds.includes(report.id)
      ? base.reportIds
      : [...base.reportIds, report.id],
    sentReports: base.sentReports,
  };

  const subject = (report.reportSubject || '').trim();
  if (subject && (!base.reTemplate || subject !== base.reTemplate)) {
    next.reTemplate = subject;
  }

  return { ...folders, [key]: next };
};

export const addSentReportToCaseFolderInMap = (
  folders: Record<string, CaseFolder>,
  report: ReportData,
  sentAtIso: string,
  fileName?: string,
  isResend?: boolean,
): Record<string, CaseFolder> => {
  if (!report.odakanitNo) return folders;
  const key = normalizeOdakanitNo(report.odakanitNo);
  if (!key) return folders;
  const timestamp = sentAtIso || new Date().toISOString();

  const existing = folders[key];
  if (!existing) return folders;

  const reportNo =
    (typeof report.reportNumber === 'number' && report.reportNumber > 0
      ? report.reportNumber
      : (report.reportHistory?.length || 0) + 1);
  const snapshot: Partial<ReportData> = {
    id: report.id,
    odakanitNo: report.odakanitNo,
    insuredName: report.insuredName,
    plaintiffName: report.plaintiffName,
    insurerName: report.insurerName,
    marketRef: report.marketRef,
    lineSlipNo: report.lineSlipNo,
    certificateRef: report.certificateRef,
    reportDate: report.reportDate,
    status: 'SENT',
    reportSubject: report.reportSubject,
  };

  const sentEntry: SentReportSnapshot = {
    reportId: report.id,
    sentAt: timestamp,
    reportNo,
    fileName,
    snapshot,
    isResend: Boolean(isResend),
    resendIndex: reportNo,
  };

  const next: CaseFolder = {
    ...existing,
    updatedAt: timestamp,
    sentReports: [...existing.sentReports, sentEntry],
  };

  return { ...folders, [key]: next };
};

export const migrateCaseFoldersFromReportsOnceInMap = (
  folders: Record<string, CaseFolder>,
  reports: ReportData[],
): Record<string, CaseFolder> => {
  let next = { ...folders };

  reports.forEach((report) => {
    if (!report.odakanitNo) return;
    next = upsertCaseFolderFromReportInMap(next, report, report.updatedAt || report.reportDate);
    if (report.status === 'SENT') {
      const sentAt = report.sentAt || report.reportDate || new Date().toISOString();
      next = addSentReportToCaseFolderInMap(next, report, sentAt);
    }
  });

  return next;
};

export const markCaseFoldersMigrated = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CASE_FOLDERS_MIGRATED_FLAG, '1');
  } catch {
    // ignore
  }
};

export const wasCaseFoldersMigrated = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(CASE_FOLDERS_MIGRATED_FLAG) === '1';
  } catch {
    return true;
  }
};


