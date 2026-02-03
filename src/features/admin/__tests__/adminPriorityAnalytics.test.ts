import { describe, it, expect } from 'vitest';
import type { ReportData } from '../../../types';
import { makeBaseReport } from './fixtures';
import {
  computeAdminPriorityInsights,
  computeAdminPriorityInsightsFromScored,
} from '../adminPriorityAnalytics';

const canTranslate = (r: ReportData | null | undefined): boolean =>
  !!r && (r.reportReview?.status === 'APPROVED' || r.hebrewWorkflowStatus === 'HEBREW_APPROVED');

describe('adminPriorityAnalytics.computeAdminPriorityInsights', () => {
  it('counts only reports with score > 0 as totalScoredReports', () => {
    const a = makeBaseReport({
      id: 'a',
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
    });
    const b = makeBaseReport({
      id: 'b',
      status: 'WAITING_FOR_INVOICES',
    });
    const c = makeBaseReport({
      id: 'c',
    });

    const insights = computeAdminPriorityInsights([a, b, c], canTranslate, 5);
    expect(insights.totalScoredReports).toBe(2);
  });
});

describe('adminPriorityAnalytics.computeAdminPriorityInsightsFromScored', () => {
  it('aggregates counts and shares correctly from scored items', () => {
    const scored = [
      { score: 10, reasons: [{ code: 'EXTERNAL_REQUIRES_HEBREW' }] },
      { score: 5, reasons: [{ code: 'EXTERNAL_REQUIRES_HEBREW' }] },
      { score: 0, reasons: [{ code: 'EXTERNAL_REQUIRES_HEBREW' }] },
    ];

    const insights = computeAdminPriorityInsightsFromScored(scored, 5);

    expect(insights.totalScoredReports).toBe(2);

    const extReason = insights.topReasons.find(
      (r) => r.code === 'EXTERNAL_REQUIRES_HEBREW',
    );
    expect(extReason).toBeDefined();
    expect(extReason?.count).toBe(2);
    expect(extReason?.share).toBeCloseTo(1);
  });
});


