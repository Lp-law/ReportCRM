import type { ReportData, CaseFolder } from '../types';

export type ReportLockType = 'NONE' | 'AUTO' | 'MANUAL';

export interface ReportLockState {
  isLocked: boolean;
  lockType: ReportLockType;
  lockAt: string | null;
  autoLockAt: string | null;
  remainingDays: number | null;
  reasonSummary: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the effective lock state for a report, based on:
 * - case closure (CaseFolder.closedAt)
 * - manual lock metadata on the report
 * - firstSentAt + 35 days + any ADMIN-approved extensions
 *
 * This utility is the single source of truth for "is this report locked?" logic.
 */
export function getReportLockState(
  report: ReportData,
  caseFolder?: CaseFolder,
  now: Date = new Date(),
): ReportLockState {
  const base: ReportLockState = {
    isLocked: false,
    lockType: 'NONE',
    lockAt: null,
    autoLockAt: null,
    remainingDays: null,
    reasonSummary: null,
  };

  const nowMs = now.getTime();

  // 1) Case closure is the strongest signal – once the case is closed, all reports
  // are effectively locked for editing, regardless of their own status.
  if (caseFolder?.closedAt) {
    const closedAt = caseFolder.closedAt;
    return {
      ...base,
      isLocked: true,
      lockType: 'MANUAL',
      lockAt: closedAt,
      autoLockAt: null,
      remainingDays: null,
      reasonSummary: 'התיק סגור – הדו״ח מוצג לקריאה בלבד.',
    };
  }

  // 2) Explicit manual lock on the report itself – ADMIN decided to lock it early.
  if (report.manualLockedAt) {
    return {
      ...base,
      isLocked: true,
      lockType: 'MANUAL',
      lockAt: report.manualLockedAt,
      autoLockAt: null,
      remainingDays: null,
      reasonSummary: report.manualLockReason
        ? `ננעל ידנית: ${report.manualLockReason}`
        : 'הדו״ח ננעל ידנית לעריכה.',
    };
  }

  // 3) Time-based auto-lock after firstSentAt + 35 days + extensions.
  if (report.firstSentAt) {
    const baseSent = new Date(report.firstSentAt);
    const baseMs = baseSent.getTime();
    if (!Number.isFinite(baseMs)) {
      return base;
    }

    const totalDaysExtension =
      (report.lockExtensions || []).reduce((sum, ext) => {
        const days = typeof ext.days === 'number' && !Number.isNaN(ext.days) ? ext.days : 0;
        return sum + days;
      }, 0) || 0;

    const totalDays = 35 + totalDaysExtension;
    const autoLockMs = baseMs + totalDays * MS_PER_DAY;
    const autoLockDate = new Date(autoLockMs);
    const autoLockAtIso = autoLockDate.toISOString();

    if (nowMs >= autoLockMs) {
      return {
        ...base,
        isLocked: true,
        lockType: 'AUTO',
        lockAt: autoLockAtIso,
        autoLockAt: autoLockAtIso,
        remainingDays: null,
        reasonSummary: 'הדו״ח ננעל אוטומטית לאחר 35 ימים ממועד השליחה לברוקר.',
      };
    }

    // Still within the editable window – compute remaining days.
    const diffMs = autoLockMs - nowMs;
    const rawDays = diffMs / MS_PER_DAY;
    const remainingDays = rawDays > 0 ? Math.ceil(rawDays) : 0;

    return {
      ...base,
      isLocked: false,
      lockType: 'NONE',
      lockAt: null,
      autoLockAt: autoLockAtIso,
      remainingDays,
      reasonSummary: `הדו״ח יינעל אוטומטית בעוד כ-${remainingDays} ימים (ב-${autoLockDate.toLocaleDateString(
        'he-IL',
      )}).`,
    };
  }

  // 4) No firstSentAt and no manual/case lock – report is not locked by time.
  return base;
}


