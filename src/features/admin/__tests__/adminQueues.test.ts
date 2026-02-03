import { describe, it, expect } from 'vitest';
import type { ReportData } from '../../../types';
import { makeBaseReport, makeReportReview, makeIssue } from './fixtures';
import { getResendEligibleQueue, getHebrewReviewQueue } from '../adminQueues';

const canTranslate = (r: ReportData | null | undefined): boolean =>
  !!r && (r.reportReview?.status === 'APPROVED' || r.hebrewWorkflowStatus === 'HEBREW_APPROVED');

describe('adminQueues.getResendEligibleQueue', () => {
  it('includes SENT report when canTranslate=true and no blocking external requires-hebrew', () => {
    const report = makeBaseReport({
      id: 'r1',
      status: 'SENT',
      hebrewWorkflowStatus: 'HEBREW_APPROVED',
    });

    const queue = getResendEligibleQueue([report], canTranslate);
    expect(queue.map((r) => r.id)).toEqual(['r1']);
  });

  it('excludes SENT report when canTranslate=false', () => {
    const report = makeBaseReport({
      id: 'r1',
      status: 'SENT',
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
    });

    const queue = getResendEligibleQueue([report], () => false);
    expect(queue).toHaveLength(0);
  });

  it('blocks when there is OPEN EXTERNAL issue requiring Hebrew', () => {
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
      id: 'r2',
      status: 'SENT',
      hebrewWorkflowStatus: 'HEBREW_APPROVED',
      reportReview: review,
    });

    const queue = getResendEligibleQueue([report], canTranslate);
    expect(queue).toHaveLength(0);
  });
});

describe('adminQueues.getHebrewReviewQueue', () => {
  it('includes report when hebrewWorkflowStatus=HEBREW_SUBMITTED', () => {
    const report = makeBaseReport({
      id: 'h1',
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
    });

    const queue = getHebrewReviewQueue([report]);
    expect(queue.map((r) => r.id)).toEqual(['h1']);
  });

  it('includes report when review.status=SUBMITTED and no hebrewWorkflowStatus', () => {
    const review = makeReportReview({
      status: 'SUBMITTED',
      issues: [],
    });
    const report = makeBaseReport({
      id: 'h2',
      reportReview: review,
    });

    const queue = getHebrewReviewQueue([report]);
    expect(queue.map((r) => r.id)).toEqual(['h2']);
  });

  it('excludes deleted reports from queues', () => {
    const report = makeBaseReport({
      id: 'deleted',
      hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
      deletedAt: new Date().toISOString(),
    });

    const queue = getHebrewReviewQueue([report]);
    expect(queue).toHaveLength(0);
  });
}
);


