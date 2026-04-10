import type { ReportData } from '../types';
import { LEGACY_CLAIM_SECTION_LABELS, CLAIM_SECTION_LABEL, LEGACY_DEMAND_SECTION_LABELS, DEMAND_LETTER_SECTION_LABEL } from '../constants';

const STORAGE_KEYS = {
  REPORTS: 'lp_reports',
  USER: 'lp_current_user',
  VIEW: 'lp_view',
  CURRENT_REPORT: 'lp_current_report',
  CASE_FOLDERS: 'lp_case_folders',
  NOTIFICATIONS: 'lp_notifications',
};

const RESET_DONE_FLAG = '__reset_done__';
const STORAGE_PREFIXES = [
  'report', 'reports', 'case', 'cases', 'finance', 'expense',
  'worksheet', 'templates', 'draft', 'archive', 'recycle',
];

export const resetAllAppData = () => {
  if (typeof window === 'undefined') return;
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem('caseTemplates');
    localStorage.removeItem('favoriteProviders');

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('emailtemplates:')) {
        keysToRemove.push(key);
        continue;
      }
      if (
        STORAGE_PREFIXES.some((prefix) => lowerKey.startsWith(prefix)) ||
        STORAGE_PREFIXES.some((prefix) => lowerKey.includes(prefix))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to reset app localStorage data', error);
  }
};

export const ensureResetAllAppDataOnce = () => {
  if (typeof window === 'undefined') return;
  const shouldReset = import.meta.env.VITE_RESET_ALL === '1';
  if (!shouldReset) return;
  const alreadyDone = localStorage.getItem(RESET_DONE_FLAG) === '1';
  if (alreadyDone) return;
  resetAllAppData();
  localStorage.setItem(RESET_DONE_FLAG, '1');
};

export const migrateSectionLabels = (
  report: ReportData,
  legacyLabels: readonly string[],
  targetLabel: string,
): ReportData => {
  if (!report) return report;
  let mutated = false;
  const next: ReportData = { ...report };

  if (next.content) {
    legacyLabels.forEach((legacy) => {
      const legacyContent = next.content?.[legacy];
      if (legacyContent !== undefined) {
        next.content = { ...next.content };
        if (!next.content[targetLabel] && legacyContent) {
          next.content[targetLabel] = legacyContent;
        }
        delete next.content[legacy];
        mutated = true;
      }
    });
  }

  if (next.translatedContent) {
    legacyLabels.forEach((legacy) => {
      const legacyTranslated = next.translatedContent?.[legacy];
      if (legacyTranslated !== undefined) {
        next.translatedContent = { ...next.translatedContent };
        if (!next.translatedContent[targetLabel] && legacyTranslated) {
          next.translatedContent[targetLabel] = legacyTranslated;
        }
        delete next.translatedContent[legacy];
        mutated = true;
      }
    });
  }

  if (Array.isArray(next.selectedSections)) {
    const hasLegacy = next.selectedSections.some((section) => legacyLabels.includes(section));
    if (hasLegacy) {
      const remapped = next.selectedSections.map((section) =>
        legacyLabels.includes(section) ? targetLabel : section,
      );
      next.selectedSections = Array.from(new Set(remapped));
      mutated = true;
    }
  }

  if (next.expertSummaryMode) {
    legacyLabels.forEach((legacy) => {
      const entry = next.expertSummaryMode?.[legacy];
      if (entry) {
        next.expertSummaryMode = { ...next.expertSummaryMode, [targetLabel]: entry };
        delete next.expertSummaryMode[legacy];
        mutated = true;
      }
    });
  }

  return mutated ? next : report;
};

export const migrateReportLabels = (report: ReportData): ReportData => {
  let migrated = migrateSectionLabels(report, LEGACY_CLAIM_SECTION_LABELS, CLAIM_SECTION_LABEL);
  migrated = migrateSectionLabels(migrated, LEGACY_DEMAND_SECTION_LABELS, DEMAND_LETTER_SECTION_LABEL);
  return migrated;
};

export const migrateReportReview = (report: ReportData): ReportData => {
  const next: ReportData = { ...report };

  if (!next.reportReview) {
    next.reportReview = { status: 'DRAFT', issues: [] };
  }

  if (!next.hebrewWorkflowStatus) {
    next.hebrewWorkflowStatus = 'HEBREW_DRAFT';
  }

  if (Array.isArray(next.reportReview.issues) && next.reportReview.issues.length > 0) {
    next.reportReview = {
      ...next.reportReview,
      issues: next.reportReview.issues.map((issue) => {
        const origin = issue.origin ?? 'INTERNAL';
        let externalAction = issue.externalAction;
        if (origin === 'EXTERNAL' && !externalAction) {
          externalAction = 'ENGLISH_ONLY';
        }
        return { ...issue, origin, externalAction };
      }),
    };
  }

  return next;
};
