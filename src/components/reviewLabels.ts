import type { HebrewWorkflowStatus, ReportReviewStatus } from '../types';

export const getHebrewWorkflowBadgeLabel = (
  status?: HebrewWorkflowStatus
): string => {
  switch (status) {
    case 'HEBREW_SUBMITTED':
      return 'נשלח לליאור';
    case 'HEBREW_CHANGES_REQUESTED':
      return 'נדרש תיקון';
    case 'HEBREW_APPROVED':
      return 'אושר לתרגום';
    case 'HEBREW_REOPENED_EXTERNAL':
      return 'נפתח מחדש (מבטחת)';
    case 'HEBREW_DRAFT':
    default:
      return 'טיוטת עברית';
  }
};

export const getReportReviewStatusLabel = (
  status: ReportReviewStatus
): string => {
  switch (status) {
    case 'SUBMITTED':
      return 'נשלח לליאור לבדיקה';
    case 'CHANGES_REQUESTED':
      return 'נדרשים תיקונים בעברית';
    case 'APPROVED':
      return 'אושר לתרגום לאנגלית';
    case 'DRAFT':
    default:
      return 'טיוטת סקירה (לא נשלח לליאור)';
  }
};


