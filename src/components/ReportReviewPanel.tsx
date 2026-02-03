import React, { useMemo, useState } from 'react';
import type {
  ReportData,
  ReportReviewIssue,
  ReportReviewStatus,
  User,
  NewIssueInput,
} from '../types';
import { getHebrewWorkflowBadgeLabel, getReportReviewStatusLabel } from './reviewLabels';
import {
  REPORT_REVIEW_PANEL_ID,
  EXTERNAL_FEEDBACK_PANEL_ID,
} from '../constants/scrollTargets';

interface ReportReviewPanelProps {
  report: ReportData;
  currentUser: User | null;
  onSubmitToAdmin: () => void;
  onApproveHebrew: () => void;
  onRequestChanges: (issues: NewIssueInput[]) => void;
  onMarkIssueDone: (issueId: string) => void;
  onAddExternalFeedbackIssues?: (issues: NewIssueInput[], externalRefId?: string) => void;
  onReopenHebrewDueToExternalFeedback?: () => void;
}

const ReportReviewPanel: React.FC<ReportReviewPanelProps> = ({
  report,
  currentUser,
  onSubmitToAdmin,
  onApproveHebrew,
  onRequestChanges,
  onMarkIssueDone,
  onAddExternalFeedbackIssues,
  onReopenHebrewDueToExternalFeedback,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalInstruction, setModalInstruction] = useState('');
  const [modalSeverity, setModalSeverity] = useState<'CRITICAL' | 'NORMAL' | 'STYLE'>('NORMAL');
  const [modalExternalRefId, setModalExternalRefId] = useState('');
  const [modalMode, setModalMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [modalExternalAction, setModalExternalAction] = useState<
    'ENGLISH_ONLY' | 'REQUIRES_HEBREW'
  >('ENGLISH_ONLY');

  const review = useMemo(() => {
    const base = report.reportReview;
    if (!base) {
      return {
        status: 'DRAFT' as ReportReviewStatus,
        issues: [] as ReportReviewIssue[],
      };
    }
    return base;
  }, [report.reportReview]);

  const internalIssuesBySection = useMemo(() => {
    const groups: Record<string, ReportReviewIssue[]> = {};
    review.issues
      .filter((issue) => (issue.origin ?? 'INTERNAL') === 'INTERNAL')
      .forEach((issue) => {
        const key = issue.sectionKey || 'GENERAL';
        if (!groups[key]) groups[key] = [];
        groups[key] = [...groups[key], issue];
      });
    return groups;
  }, [review.issues]);

  const externalIssuesBySection = useMemo(() => {
    const groups: Record<string, ReportReviewIssue[]> = {};
    review.issues
      .filter((issue) => issue.origin === 'EXTERNAL')
      .forEach((issue) => {
        const key = issue.sectionKey || 'GENERAL';
        if (!groups[key]) groups[key] = [];
        groups[key] = [...groups[key], issue];
      });
    return groups;
  }, [review.issues]);

  const isLawyer = currentUser?.role === 'LAWYER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const hasExternalRequiresHebrew = review.issues.some(
    (issue) =>
      (issue.origin ?? 'INTERNAL') === 'EXTERNAL' &&
      issue.status !== 'DONE' &&
      issue.externalAction === 'REQUIRES_HEBREW',
  );

  const handleOpenModal = (mode: 'INTERNAL' | 'EXTERNAL') => {
    setModalMode(mode);
    setModalTitle('');
    setModalInstruction('');
    setModalSeverity('NORMAL');
    setModalExternalRefId('');
    setModalExternalAction('ENGLISH_ONLY');
    setIsModalOpen(true);
  };

  const handleSubmitModal = () => {
    const title = modalTitle.trim();
    const instruction = modalInstruction.trim();
    if (!title || !instruction) {
      return;
    }
    const issue: NewIssueInput = {
      title,
      instruction,
      severity: modalSeverity,
      type: 'OTHER',
      sectionKey: undefined,
      externalAction: modalMode === 'EXTERNAL' ? modalExternalAction : undefined,
    };
    if (modalMode === 'EXTERNAL' && onAddExternalFeedbackIssues) {
      onAddExternalFeedbackIssues([issue], modalExternalRefId.trim() || undefined);
    } else {
      onRequestChanges([issue]);
    }
    setIsModalOpen(false);
  };

  const handleReopenClick = () => {
    if (!onReopenHebrewDueToExternalFeedback) return;
    const confirmed = window.confirm(
      'פתיחה מחדש תחסום תרגום/שליחה מחדש עד אישור עברית מחדש. להמשיך?',
    );
    if (!confirmed) return;
    onReopenHebrewDueToExternalFeedback();
  };

  const statusLabel = getReportReviewStatusLabel(review.status);
  const workflowBadge = getHebrewWorkflowBadgeLabel(report.hebrewWorkflowStatus);

  return (
    <section
      id={REPORT_REVIEW_PANEL_ID}
      className="mt-4 rounded-xl border border-borderDark bg-navySecondary px-4 py-3"
      dir="rtl"
      lang="he"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-textMuted500">סטטוס סקירה</div>
          <div className="text-sm font-medium text-textLight">{statusLabel}</div>
        </div>
        <span className="inline-flex items-center rounded-full bg-navySecondary px-3 py-1 text-xs font-medium text-textMuted700">
          {workflowBadge}
        </span>
      </div>

      {isLawyer && (
        <div className="mb-3 text-xs text-amber-700">
          {report.hebrewWorkflowStatus === 'HEBREW_REOPENED_EXTERNAL'
            ? 'הדיווח נפתח מחדש בעקבות משוב מחברת הביטוח — התרגום חסום עד אישור מחדש.'
            : review.status === 'SUBMITTED'
            ? 'הדיווח נשלח לליאור לבדיקה. מומלץ להימנע משינויים מהותיים עד לקבלת הערות.'
            : review.status === 'CHANGES_REQUESTED'
            ? 'ליאור ביקש תיקונים בעברית. נא לעבור על ההערות ולסמן כשטופל.'
            : null}
        </div>
      )}

      {isAdmin && hasExternalRequiresHebrew && (
        <div className="mb-3 text-xs font-semibold text-red-700">
          קיים משוב מחברת הביטוח שמצריך שינוי בעברית. מומלץ לפתוח מחדש עברית.
        </div>
      )}

      {review.issues.length > 0 && (
        <div className="mb-3 space-y-3">
          {Object.keys(internalIssuesBySection).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-textMuted">הערות פנימיות (ליאור)</div>
              {Object.entries(internalIssuesBySection).map(([sectionKey, issues]) => (
                <div key={sectionKey} className="rounded-lg bg-panel p-2 mb-1">
                  {sectionKey !== 'GENERAL' && (
                    <div className="mb-1 text-[11px] font-semibold text-textMuted500">
                      סעיף: {sectionKey}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {issues.map((issue) => (
                      <li
                        key={issue.id}
                        className="flex items-start justify-between gap-2 rounded-md border border-borderDark bg-navySecondary px-2 py-1.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                issue.severity === 'CRITICAL'
                                  ? 'bg-red-100 text-red-700'
                                  : issue.severity === 'NORMAL'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-navySecondary text-textMuted'
                              }`}
                            >
                              {issue.severity === 'CRITICAL'
                                ? 'קריטי'
                                : issue.severity === 'NORMAL'
                                ? 'מהותי'
                                : 'סגנון'}
                            </span>
                            <span className="text-xs font-medium text-textLight">
                              {issue.title}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-textMuted700">
                            {issue.instruction}
                          </div>
                        </div>
                        {(isLawyer || isAdmin) && (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            disabled={issue.status === 'DONE'}
                            onClick={() => onMarkIssueDone(issue.id)}
                          >
                            {issue.status === 'DONE' ? 'טופל' : 'סומן כטופל'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {Object.keys(externalIssuesBySection).length > 0 && (
            <div id={EXTERNAL_FEEDBACK_PANEL_ID}>
              <div className="mb-1 text-xs font-semibold text-textMuted">משוב מחברת הביטוח</div>
              {Object.entries(externalIssuesBySection).map(([sectionKey, issues]) => (
                <div key={sectionKey} className="rounded-lg bg-panel p-2 mb-1">
                  {sectionKey !== 'GENERAL' && (
                    <div className="mb-1 text-[11px] font-semibold text-textMuted500">
                      סעיף: {sectionKey}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {issues.map((issue) => (
                      <li
                        key={issue.id}
                        className="flex items-start justify-between gap-2 rounded-md border border-borderDark bg-navySecondary px-2 py-1.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                issue.severity === 'CRITICAL'
                                  ? 'bg-red-100 text-red-700'
                                  : issue.severity === 'NORMAL'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-navySecondary text-textMuted'
                              }`}
                            >
                              {issue.severity === 'CRITICAL'
                                ? 'קריטי'
                                : issue.severity === 'NORMAL'
                                ? 'מהותי'
                                : 'סגנון'}
                            </span>
                            <span className="text-xs font-medium text-textLight">
                              {issue.title}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-textMuted700">
                            {issue.instruction}
                          </div>
                        </div>
                        {(isLawyer || isAdmin) && (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            disabled={issue.status === 'DONE'}
                            onClick={() => onMarkIssueDone(issue.id)}
                          >
                            {issue.status === 'DONE' ? 'טופל' : 'סומן כטופל'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isLawyer && (
          <button
            type="button"
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            onClick={onSubmitToAdmin}
            disabled={review.status === 'SUBMITTED' || review.status === 'APPROVED'}
          >
            שלח לליאור לבדיקה
          </button>
        )}

        {isAdmin && (
          <>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              onClick={onApproveHebrew}
            >
              אשר עברית לתרגום
            </button>
            <button
              type="button"
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
              onClick={() => handleOpenModal('INTERNAL')}
            >
              בקש תיקונים
            </button>
            {onAddExternalFeedbackIssues && (
              <button
                type="button"
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={() => handleOpenModal('EXTERNAL')}
              >
                הוסף משוב מחברת הביטוח
              </button>
            )}
            {onReopenHebrewDueToExternalFeedback && report.status === 'SENT' && (
              <button
                type="button"
                className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                onClick={onReopenHebrewDueToExternalFeedback}
              >
                פתח מחדש עברית (משוב מבטחת)
              </button>
            )}
            {onReopenHebrewDueToExternalFeedback && report.status !== 'SENT' && (
              <span className="text-[11px] text-textMuted500">
                פתיחה מחדש זמינה רק לאחר שליחת הדיווח (SENT).
              </span>
            )}
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-panel p-4 shadow-2xl" dir="rtl" lang="he">
            <h3 className="mb-3 text-sm font-bold text-textLight">בקשת תיקונים מלשכת ליאור</h3>
            <div className="mb-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted700">
                  כותרת ההערה (חובה)
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-borderDark px-2 py-1.5 text-sm"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted700">
                  הנחיה מפורטת (חובה)
                </label>
                <textarea
                  className="w-full rounded-md border border-borderDark px-2 py-1.5 text-sm"
                  rows={3}
                  value={modalInstruction}
                  onChange={(e) => setModalInstruction(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted700">
                  חומרת ההערה
                </label>
                <select
                  className="w-full rounded-md border border-borderDark px-2 py-1.5 text-xs"
                  value={modalSeverity}
                  onChange={(e) =>
                    setModalSeverity(e.target.value as 'CRITICAL' | 'NORMAL' | 'STYLE')
                  }
                >
                  <option value="NORMAL">מהותי</option>
                  <option value="CRITICAL">קריטי</option>
                  <option value="STYLE">סגנון</option>
                </select>
              </div>
              {modalMode === 'EXTERNAL' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-textMuted700">
                    מזהה פנייה מחברת הביטוח (אופציונלי)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-borderDark px-2 py-1.5 text-sm"
                    value={modalExternalRefId}
                    onChange={(e) => setModalExternalRefId(e.target.value)}
                  />
                  <label className="mb-1 mt-3 block text-xs font-semibold text-textMuted700">
                    אופן טיפול
                  </label>
                  <select
                    className="w-full rounded-md border border-borderDark px-2 py-1.5 text-xs"
                    value={modalExternalAction}
                    onChange={(e) =>
                      setModalExternalAction(
                        e.target.value as 'ENGLISH_ONLY' | 'REQUIRES_HEBREW',
                      )
                    }
                  >
                    <option value="ENGLISH_ONLY">עדכון באנגלית בלבד</option>
                    <option value="REQUIRES_HEBREW">נדרש תיקון בעברית</option>
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-borderDark px-3 py-1.5 text-xs font-medium text-textMuted700 hover:bg-navySecondary"
                onClick={() => setIsModalOpen(false)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                onClick={handleSubmitModal}
                disabled={!modalTitle.trim() || !modalInstruction.trim()}
              >
                הוסף הערה
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReportReviewPanel;


