import { describe, it, expect } from 'vitest';
import type { ReportData } from '../../../types';
import { makeBaseReport, makeIssue, makeReportReview } from './fixtures';
import { scoreReportForAdminAttention } from '../adminPriority';
import { ADMIN_PRIORITY_REASONS } from '../adminPriorityReasons';

const canTranslate = (r: ReportData | null | undefined): boolean =>
  !!r && (r.reportReview?.status === 'APPROVED' || r.hebrewWorkflowStatus === 'HEBREW_APPROVED');

describe('adminPriority.scoreReportForAdminAttention', () => {
  it('adds EXTERNAL_REQUIRES_HEBREW reason when external requires Hebrew exists', () => {
    const review = makeReportReview({
      status: 'APPROVED',
      issues: [
        makeIssue({
          id: 'i1',
          origin: 'EXTERNAL',
          status: 'OPEN',
          externalAction: 'REQUIRES_HEBREW',
        }),
      ],
    });
    const report = makeBaseReport({
      id: 'ext1',
      reportReview: review,
    });

    const { score, reasons } = scoreReportForAdminAttention(report, canTranslate);
    const reason = reasons.find((r) => r.code === ADMIN_PRIORITY_REASONS.EXTERNAL_REQUIRES_HEBREW.code);

    expect(reason).toBeDefined();
    expect(score).toBeGreaterThanOrEqual(ADMIN_PRIORITY_REASONS.EXTERNAL_REQUIRES_HEBREW.weight);
  });

  it('does not duplicate the same reason code', () => {
    const now = new Date().toISOString();
    const report = makeBaseReport({
      id: 'dup1',
      updatedAt: now,
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
      status: 'SENT',
    });

    const { reasons } = scoreReportForAdminAttention(report, canTranslate);
    const codes = reasons.map((r) => r.code);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('adds HEBREW_SUBMITTED reason when hebrewWorkflowStatus is HEBREW_SUBMITTED', () => {
    const report = makeBaseReport({
      id: 'heb1',
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
    });

    const { reasons } = scoreReportForAdminAttention(report, canTranslate);
    const hasHebrewSubmitted = reasons.some(
      (r) => r.code === ADMIN_PRIORITY_REASONS.HEBREW_SUBMITTED.code,
    );

    expect(hasHebrewSubmitted).toBe(true);
  });

  it('adds AGING_OVER_7_DAYS reason for stale reports', () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    const updatedAt = new Date(Date.now() - eightDaysMs).toISOString();

    const report = makeBaseReport({
      id: 'age1',
      updatedAt,
    });

    const { reasons } = scoreReportForAdminAttention(report, canTranslate);
    const hasAging = reasons.some(
      (r) => r.code === ADMIN_PRIORITY_REASONS.AGING_OVER_7_DAYS.code,
    );

    expect(hasAging).toBe(true);
  });
});


