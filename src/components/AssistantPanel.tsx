import React from 'react';
import { X, Loader2, Lightbulb } from 'lucide-react';
import type {
  AssistantIntent,
  AssistantHelpResponse,
  User,
  ReportData,
} from '../types';

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  view: 'DASHBOARD' | 'STEP1' | 'STEP2' | 'PREVIEW' | 'CASE_FOLDER';
  currentUser: User | null;
  currentReport: ReportData | null;
  loading: boolean;
  error: string | null;
  response: AssistantHelpResponse | null;
  onRunIntent: (intent: AssistantIntent) => void;
}

const getStepNumber = (view: AssistantPanelProps['view']): 1 | 2 | 3 => {
  if (view === 'STEP2') return 2;
  if (view === 'PREVIEW') return 3;
  return 1;
};

const getScreenLabel = (view: AssistantPanelProps['view']): string => {
  switch (view) {
    case 'STEP1':
      return 'Setup';
    case 'STEP2':
      return 'Draft';
    case 'PREVIEW':
      return 'Preview';
    case 'CASE_FOLDER':
      return 'Case Folder';
    default:
      return 'Dashboard';
  }
};

const getRoleLabel = (user: User | null): string => {
  if (!user) return 'Guest';
  return user.role;
};

type QuickAction = {
  intent: AssistantIntent;
  label: string;
};

const getQuickActionsForStep = (step: 1 | 2 | 3): QuickAction[] => {
  if (step === 1) {
    return [
      { intent: 'explain_current_screen', label: 'מה המטרה בשלב זה?' },
      { intent: 'explain_buttons_in_step', label: 'הסבר על הכפתורים החשובים כאן' },
      { intent: 'common_mistakes_here', label: 'טעויות נפוצות בשלב 1' },
    ];
  }

  if (step === 2) {
    return [
      { intent: 'explain_current_screen', label: 'איך לעבוד נכון בשלב 2' },
      { intent: 'when_to_use_ai_tools', label: 'מתי להשתמש בכלי ה-AI כאן' },
      { intent: 'explain_hebrew_rewrite', label: 'איך להשתמש בשפר ניסוח בעברית' },
      { intent: 'explain_tone_risk', label: 'מה תפקיד Tone & Risk' },
      { intent: 'common_mistakes_here', label: 'טעויות נפוצות בשלב 2' },
    ];
  }

  // step 3
  return [
    { intent: 'pre_send_checks', label: 'מה חשוב לבדוק לפני שליחה' },
    { intent: 'explain_tone_risk', label: 'האם חובה להריץ Tone & Risk?' },
    { intent: 'common_mistakes_here', label: 'טעויות נפוצות לפני שליחה' },
  ];
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  isOpen,
  onClose,
  view,
  currentUser,
  currentReport,
  loading,
  error,
  response,
  onRunIntent,
}) => {
  if (!isOpen) return null;

  const step = getStepNumber(view);
  const screenLabel = getScreenLabel(view);
  const roleLabel = getRoleLabel(currentUser);
  const quickActions = getQuickActionsForStep(step);

  const hasReport = Boolean(currentReport);

  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-[180]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[190] w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">
                העוזר החכם
              </span>
              <span className="text-[11px] text-slate-500">
                Step {step} · {screenLabel} · {roleLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-600">
              פעולות מהירות למסך הנוכחי
            </span>
            {!hasReport && (
              <span className="text-[10px] text-slate-400">
                תחילה יש לבחור או לפתוח דו&quot;ח.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((qa) => (
              <button
                key={qa.intent}
                type="button"
                disabled={loading || !hasReport}
                onClick={() => onRunIntent(qa.intent)}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition ${
                  loading || !hasReport
                    ? 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                    : 'border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100'
                }`}
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Response Area */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-3" dir="rtl">
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>העוזר החכם מכין תשובה קצרה למסך הנוכחי…</span>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="font-semibold mb-1">העוזר החכם אינו זמין כרגע</div>
              <div>
                ניתן להמשיך לעבוד כרגיל עם הכלים במסך. אם התקלה חוזרת, כדאי לדווח
                לליאור.
              </div>
            </div>
          )}

          {!loading && !error && response && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">
                {response.title}
              </div>
              <ul className="list-disc pr-4 space-y-1 text-[12px] text-slate-700">
                {response.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
              {response.warning && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  <span className="font-semibold">שימי לב: </span>
                  {response.warning}
                </div>
              )}
              {response.nextSuggestion && (
                <div className="mt-1 text-[11px] text-slate-600">
                  <span className="font-semibold">הצעה להמשך: </span>
                  {response.nextSuggestion}
                </div>
              )}
            </div>
          )}

          {!loading && !error && !response && (
            <div className="text-[12px] text-slate-500 space-y-1">
              <div>
                העוזר החכם מלווה אותך צעד‑צעד בשימוש נכון בכלים במסך זה, בלי לגעת
                בתוכן הדו&quot;ח עצמו.
              </div>
              <div>בחרי אחת מהפעולות המהירות למעלה כדי לקבל הסבר קצר וממוקד.</div>
            </div>
          )}
        </div>

        {/* Disabled input hint */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <div className="text-[10px] text-slate-500 mb-1">
            בשלב זה אין צ&apos;אט חופשי – העוזר עובד לפי פעולות מהירות בלבד.
          </div>
          <input
            type="text"
            disabled
            className="w-full text-[11px] px-2 py-1.5 rounded border border-dashed border-slate-200 bg-slate-50 text-slate-400"
            placeholder="אפשר לשאול אותי איך לעבוד נכון כאן – דרך הכפתורים למעלה."
          />
        </div>
      </div>
    </>
  );
};

export default AssistantPanel;


