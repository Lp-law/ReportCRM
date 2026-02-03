import { ReportData } from '../types';
import { sanitizeTopicLabel, dedupeCaseInsensitive } from './fileNameTopics';
import {
  CLAIM_SECTION_LABEL,
  CLAIMANT_EXPERT_SECTION_KEY,
  DEMAND_LETTER_SECTION_LABEL,
  LEGACY_CLAIM_SECTION_LABELS,
  LEGACY_DEMAND_SECTION_LABELS,
  PLAINTIFF_EXPERT_SECTION_KEY,
} from '../constants';

export const SECTION_LABELS: Record<string, string> = {
  [CLAIM_SECTION_LABEL]: 'Statement of Claim',
  [DEMAND_LETTER_SECTION_LABEL]: 'Letter of Demand',
  [PLAINTIFF_EXPERT_SECTION_KEY]: 'Statement of Claim Expert Opinion',
  [CLAIMANT_EXPERT_SECTION_KEY]: 'Letter of Demand Expert Opinion',
  "The plaintiff's expert opinion": 'Plaintiff Expert Opinion',
  "The claimant's expert opinion": 'Claimant Expert Opinion',
  "The insured's expert opinion": 'Insured Expert Opinion',
  'Insurance Coverage': 'Insurance Coverage',
  'Risk Assessment': 'Risk Assessment',
  MPL: 'MPL',
  Strategy: 'Strategy',
  'Expenses breakdown': 'Expenses Breakdown',
  'Expenses & Compensation breakdown': 'Expenses & Compensation',
  Recommendations: 'Recommendations',
  'Strategy & Recommendations': 'Strategy & Recommendations',
  'Request for Approval of a Settlement Agreement': 'Settlement Approval',
  Update: 'Update',
};

LEGACY_CLAIM_SECTION_LABELS.forEach((label) => {
  SECTION_LABELS[label] = 'Statement of Claim';
});

LEGACY_DEMAND_SECTION_LABELS.forEach((label) => {
  SECTION_LABELS[label] = 'Letter of Demand';
});

const resolveSectionTitle = (section: string) => (SECTION_LABELS[section] || section || '').trim();

export const mapSectionsToFileNameTitles = (sections: string[]) =>
  sections.map(resolveSectionTitle).filter(Boolean);

export const dedupeTitles = (titles: string[]) => {
  const seen = new Set<string>();
  return titles
    .map((title) => title.trim())
    .filter((title) => {
      if (!title) return false;
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

const normalizeSegment = (value?: string) => (value || '').trim();

const isLetterOfDemandCase = (report: ReportData) => {
  const tag = (report.filenameTag || '').toLowerCase();
  const title = (report.plaintiffTitle || '').toLowerCase();
  return tag.includes('demand') || title === 'claimant';
};

const getReportNumber = (report: ReportData) => (report.reportHistory?.length || 0) + 1;

const MAX_FILENAME_BASE_LENGTH = 120;

const joinTitlesHumanReadable = (titles: string[]): string => {
  if (!titles.length) return '';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} & ${titles[1]}`;
  const allButLast = titles.slice(0, -1);
  const last = titles[titles.length - 1];
  return `${allButLast.join(', ')} & ${last}`;
};

const buildReportFileName = (report: ReportData): string => {
  const insurer = normalizeSegment(report.insurerName);
  const insured = normalizeSegment(report.insuredName);
  const claimant = normalizeSegment(report.plaintiffName);
  const reportNumber = getReportNumber(report);

  let titles: string[] = [];

  const customTitles = Array.isArray(report.fileNameTitles)
    ? dedupeCaseInsensitive(
        report.fileNameTitles.map((title) => sanitizeTopicLabel(title)),
      )
    : [];

  if (customTitles.length > 0) {
    // Admin-selected topics always win, including for the first report
    titles = dedupeTitles(customTitles);
  } else if (reportNumber === 1) {
    // Legacy default for very first report when no custom topics were selected
    titles = [isLetterOfDemandCase(report) ? 'New Letter of demand' : 'New Lawsuit'];
  } else {
    const availableTitles = dedupeTitles(mapSectionsToFileNameTitles(report.selectedSections || []));
    titles = availableTitles;
    if (!titles.length) titles = ['Update'];
  }

  const joinedTitles = joinTitlesHumanReadable(titles);

  const reportSegment = `Report ${reportNumber}`;
  const coreSegments = [
    insurer || undefined,
    insured || undefined,
    claimant || undefined,
    joinedTitles || undefined,
  ].filter(Boolean) as string[];

  // Build and sanitize prefix (everything before "Report N")
  let prefix = coreSegments.join(' - ');
  prefix = prefix
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();

  // If there is no meaningful prefix, fall back to just "Report N"
  if (!prefix) {
    const baseOnly = reportSegment;
    return baseOnly.toLowerCase().endsWith('.pdf') ? baseOnly : `${baseOnly}.pdf`;
  }

  const suffix = ` - ${reportSegment}`;
  const maxPrefixLength = Math.max(
    0,
    MAX_FILENAME_BASE_LENGTH - suffix.length,
  );

  if (prefix.length > maxPrefixLength) {
    // אל תחתוך באמצע מילה / נושא – קטע עד הרווח האחרון בטווח
    const hardSlice = prefix.slice(0, maxPrefixLength);
    const lastSpace = hardSlice.lastIndexOf(' ');
    prefix = (lastSpace > 0 ? hardSlice.slice(0, lastSpace) : hardSlice).trim();
  }

  let baseName = `${prefix}${suffix}`;
  baseName = baseName
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();

  if (!baseName) {
    baseName = `Report-${Date.now()}`;
  }

  // Ensure a single .pdf extension
  return baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
};

/**
 * Build a human‑readable report title (without ".pdf") that mirrors the
 * filename structure. Used for email SUBJECT and "Re:" lines so that the
 * subject, attachment name and internal references stay aligned.
 */
export const buildReportSubject = (report: ReportData): string => {
  const fileName = buildReportFileName(report);
  return fileName.replace(/\.pdf$/i, '');
};

export default buildReportFileName;
export { resolveSectionTitle };

