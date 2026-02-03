import React, { useState, useMemo } from 'react';
import type { CaseFolder, ReportData, SentReportSnapshot } from '../../types';

interface CaseFolderViewProps {
  folder: CaseFolder;
  reports: ReportData[];
  onBack: () => void;
  onUpdateReTemplate: (value: string) => void;
  onCreateReportInCase: () => void;
  onOpenReport: (reportId: string) => void;
  currentUserRole: 'LAWYER' | 'ADMIN' | 'FINANCE' | 'SUB_ADMIN' | 'OPS';
  onCloseCase?: () => void;
  onReopenCase?: () => void;
  onDeleteCase?: () => void;
}

export const CaseFolderView: React.FC<CaseFolderViewProps> = ({
  folder,
  reports,
  onBack,
  onUpdateReTemplate,
  onCreateReportInCase,
  onOpenReport,
  currentUserRole,
  onCloseCase,
  onReopenCase,
  onDeleteCase,
}) => {
  const [draftRe, setDraftRe] = useState(folder.reTemplate || '');

  const handleBlurRe = () => {
    const trimmed = draftRe.trim();
    if (trimmed !== folder.reTemplate) {
      onUpdateReTemplate(trimmed);
    }
  };

  const relatedReports = reports.filter(
    (r) => r.odakanitNo && r.odakanitNo.trim() === folder.odakanitNo,
  );

  const activeDrafts = relatedReports.filter((r) => r.status !== 'SENT' && !r.deletedAt);
  const activeDraft = activeDrafts[0] || null;
  const isClosed = Boolean(folder.closedAt);

  // נציג בהיסטוריית הדו"חות רק שליחת דו"ח אחת לכל reportId –
  // הגרסה האחרונה/העדכנית ביותר, כדי למנוע כפילויות ישנות או partial snapshots.
  const uniqueSentReports = useMemo(() => {
    const byReportId = new Map<string, SentReportSnapshot>();

    (folder.sentReports as SentReportSnapshot[]).forEach((entry) => {
      if (!entry || !entry.reportId) return;
      const existing = byReportId.get(entry.reportId);
      if (!existing) {
        byReportId.set(entry.reportId, entry);
        return;
      }
      const prevTime = new Date(existing.sentAt).getTime() || 0;
      const nextTime = new Date(entry.sentAt).getTime() || 0;
      if (nextTime >= prevTime) {
        byReportId.set(entry.reportId, entry);
      }
    });

    return Array.from(byReportId.values()).sort((a, b) => {
      const at = new Date(a.sentAt).getTime() || 0;
      const bt = new Date(b.sentAt).getTime() || 0;
      return at - bt;
    });
  }, [folder.sentReports]);

  return (
    <div className="min-h-screen bg-bgDark px-0 pb-8">
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center rounded-full bg-panel border border-borderDark px-3 py-1.5 text-xs font-medium text-textLight shadow-sm hover:bg-navySecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          ← חזרה לדשבורד
        </button>

        <header className="mb-4 rounded-2xl bg-panel px-5 py-4 shadow-sm border border-borderDark flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-serif font-bold text-navy">
              תיק עודכנית – {folder.odakanitNo}
            </h1>
            <p className="mt-1 text-xs text-textMuted">
              תצוגה מרכזית של כל הדיווחים והמידע בתיק זה.
            </p>
            {isClosed && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                סטטוס תיק: סגור לצורך עבודה שוטפת. לא ניתן לערוך דו״חות או ליצור טיוטות חדשות.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {currentUserRole === 'ADMIN' && !isClosed && onCloseCase && (
              <button
                type="button"
                onClick={onCloseCase}
                className="inline-flex items-center rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-700 border border-red-200 hover:bg-red-100"
              >
                סגור תיק
              </button>
            )}
            {currentUserRole === 'ADMIN' && isClosed && (
              <>
                {onReopenCase && (
                  <button
                    type="button"
                    onClick={onReopenCase}
                    className="inline-flex items-center rounded-full bg-green-50 px-3 py-1.5 font-semibold text-green-700 border border-green-200 hover:bg-green-100"
                  >
                    פתח תיק מחדש
                  </button>
                )}
                {onDeleteCase && (
                  <button
                    type="button"
                    onClick={onDeleteCase}
                    className="inline-flex items-center rounded-full bg-panel px-3 py-1.5 font-semibold text-textLight border border-borderDark hover:bg-navySecondary"
                  >
                    מחיקה מוחלטת
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        <section className="mb-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-panel p-4 shadow-sm border border-borderDark">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
              פרטי תיק
            </h2>
            <dl className="space-y-1 text-xs text-textLight">
              <div>
                <dt className="font-semibold text-textMuted">מבוטח</dt>
                <dd>{folder.insuredName || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">תובע</dt>
                <dd>{folder.plaintiffName || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">מבטחת</dt>
                <dd>{folder.insurerName || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">UMR / מספר שוק</dt>
                <dd>{folder.marketRef || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">Line Slip</dt>
                <dd>{folder.lineSlipNo || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">מספר תעודה</dt>
                <dd>{folder.certificateRef || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-textMuted">מספר דיווחים בתיק</dt>
                <dd>{folder.reportIds.length}</dd>
              </div>
              {isClosed && (
                <div>
                  <dt className="font-semibold text-textMuted">סטטוס תיק</dt>
                  <dd className="text-amber-700">סגור</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl bg-panel p-4 shadow-sm border border-borderDark">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
              תבנית כותרת (RE)
            </h2>
            <textarea
              className="w-full rounded-lg border border-borderDark p-2 text-xs text-textLight placeholder:text-textMuted focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              rows={4}
              value={draftRe}
              onChange={(e) => setDraftRe(e.target.value)}
              onBlur={handleBlurRe}
              placeholder="Example: John Doe v. XYZ Medical Center - Claim Update"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onCreateReportInCase}
                className="inline-flex items-center rounded-full bg-navy px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
              >
                פתחי טיוטה חדשה בתיק זה
              </button>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-2xl bg-panel p-4 shadow-sm border border-borderDark">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-textLight">
                דיווחים שנשלחו בתיק זה
              </h2>
              <p className="text-xs text-textMuted">
                היסטוריה של דיווחים שמצבם סומן כ‑SENT בתיק זה (קריאה בלבד).
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeDraft && (
                <button
                  type="button"
                  onClick={() => onOpenReport(activeDraft.id)}
                  className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200 hover:bg-amber-100"
                >
                  קיימת טיוטה פעילה – המשיכי לעריכה
                </button>
              )}
              {!isClosed && (
                <>
                  {currentUserRole === 'LAWYER' ? (
                    // לעורכת דין: טיוטה אחת בלבד – אין כפתור יצירת דיווח חדש כשיש טיוטה פעילה.
                    !activeDraft && (
                      <button
                        type="button"
                        onClick={onCreateReportInCase}
                        className="inline-flex items-center rounded-full bg-navy px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                      >
                        יצירת דיווח חדש בתיק זה
                      </button>
                    )
                  ) : (
                    // לאדמין ותפקידים אחרים: אפשרות ליצירת דיווח חדש, גם חריג כשיש טיוטה.
                    <button
                      type="button"
                      onClick={onCreateReportInCase}
                      className="inline-flex items-center rounded-full bg-navy px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                    >
                      {activeDraft ? 'יצירת דיווח חדש (חריג)' : 'יצירת דיווח חדש בתיק זה'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left text-textLight">
              <thead className="bg-navySecondary text-[11px] uppercase tracking-wide text-textMuted">
                <tr>
                  <th className="px-3 py-2">מס' דיווח</th>
                  <th className="px-3 py-2">סוג</th>
                  <th className="px-3 py-2">נשלח בתאריך</th>
                  <th className="px-3 py-2">שם קובץ / כותרת</th>
                  <th className="px-3 py-2">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {uniqueSentReports.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-textMuted"
                    >
                      No sent reports recorded for this case yet.
                    </td>
                  </tr>
                )}
                {uniqueSentReports.map((entry) => {
                  const sentDate = entry.sentAt
                    ? new Date(entry.sentAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const snapshotSubject =
                    (entry.snapshot && entry.snapshot.reportSubject) || '';
                  const fileOrTitle =
                    entry.fileName || snapshotSubject || '—';

                  return (
                    <tr key={`${entry.reportId}-${entry.sentAt}`}>
                      <td className="px-3 py-2">
                        {entry.reportNo ? `#${entry.reportNo}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {entry.isResend ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                            שליחה חוזרת
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-navySecondary px-2 py-0.5 text-[10px] font-semibold text-textMuted border border-borderDark">
                            דיווח רגיל
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{sentDate}</td>
                      <td className="px-3 py-2">{fileOrTitle}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenReport(entry.reportId)}
                          className="inline-flex items-center rounded-full bg-panel px-3 py-1 text-[11px] font-semibold text-navy ring-1 ring-navy hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                          aria-label={`פתחי דו\"ח ${entry.reportId}`}
                        >
                          פתחי
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CaseFolderView;
