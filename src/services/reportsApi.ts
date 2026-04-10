import type { ReportData } from '../types';
import { csrfFetch } from '../utils/csrfFetch';

const API_BASE = '/api/reports';
const CASE_FOLDERS_API = '/api/case-folders';

const fetchJson = async (url: string, options?: RequestInit) => {
  const res = await csrfFetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export const fetchReports = async (): Promise<ReportData[]> => {
  const data = await fetchJson(API_BASE);
  return data.reports || [];
};

export const fetchReport = async (id: string): Promise<ReportData | null> => {
  try {
    const data = await fetchJson(`${API_BASE}/${id}`);
    return data.report || null;
  } catch {
    return null;
  }
};

export const saveReport = async (report: ReportData): Promise<void> => {
  await fetchJson(`${API_BASE}/${report.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
};

export const createReport = async (report: ReportData): Promise<void> => {
  await fetchJson(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
};

export const deleteReportApi = async (id: string): Promise<void> => {
  await fetchJson(`${API_BASE}/${id}`, { method: 'DELETE' });
};

export const bulkImportReports = async (reports: ReportData[]): Promise<number> => {
  const data = await fetchJson(`${API_BASE}/bulk-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reports }),
  });
  return data.imported || 0;
};

export const fetchCaseFolders = async () => {
  const data = await fetchJson(CASE_FOLDERS_API);
  return data.folders || [];
};

export const saveCaseFolderApi = async (odakanitNo: string, folderData: unknown): Promise<void> => {
  await fetchJson(`${CASE_FOLDERS_API}/${encodeURIComponent(odakanitNo)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderData),
  });
};
