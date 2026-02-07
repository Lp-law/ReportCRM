import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GrammarlyEditorPlugin } from '@grammarly/editor-sdk-react';
import { FileText, Check, ChevronRight, ChevronLeft, Plus, Trash2, Calendar, History, ListPlus, X, ShieldAlert, Upload, Loader2, FolderOpen, UserCheck, HelpCircle, Calculator, LogOut, Receipt, Paperclip, Sparkles, Lightbulb, Globe, Send, FilePlus2, AlertTriangle, Eye, Wand2, NotebookPen, Bell, Table, Star, Home, User as UserIcon, KeyRound, ArrowRight, Search, ChevronUp, ChevronDown } from 'lucide-react';

import { ReportData, StepProps, User, InvoiceFile, ExpenseItem, ReportStatus, ExpenseWorksheet, ExpenseWorksheetRow, ExpenseRowType, ExpenseRowCategory, ExpenseWorksheetNote, ExpenseFavorite, ReportNote, MedicalComplaintAnalysis, ExpenseWorksheetHistoryEntry, PreviousReport, ReportSnapshot, NewIssueInput, SectionTemplate, ToneRiskIssue, HebrewStyleIssue, BestPracticeSnippet, CaseFolder, SentReportSnapshot, ProceduralProcedureType, ProceduralTimelineStageId, ProceduralTimeline, type AssistantHelpResponse, type AssistantIntent, type AssistantRole, type PersonalSnippet } from './types';
import {
  AVAILABLE_SECTIONS,
  CLAIM_SECTION_LABEL,
  DEMAND_LETTER_SECTION_LABEL,
  FILENAME_TAGS,
  INSURER_OPTIONS,
  LEGACY_CLAIM_SECTION_LABELS,
  LEGACY_DEMAND_SECTION_LABELS,
  USERS,
} from './constants';
import {
  loadTemplates as loadSectionTemplates,
  upsertTemplate as upsertSectionTemplateInStore,
  deleteTemplate as deleteSectionTemplateInStore,
  reorderTemplate as reorderSectionTemplateInStore,
} from './services/sectionTemplatesStore';
import { analyzeToneAndRisk, reviewHebrewStyle } from './services/geminiService';
import {
  loadBestPractices,
  upsertBestPractice,
  deleteBestPractice,
  setBestPracticeEnabled,
  recordBestPracticeUsage,
} from './services/bestPracticesStore';
import { getSectionDisplayTitle, getSectionPartyRole, ExpertCountMode, isExpertSection } from './utils/sectionDisplay';
import { DocumentPreview } from './components/DocumentPreview';
import ReportReviewPanel from './components/ReportReviewPanel';
import EmailTemplateModal from './components/EmailTemplateModal';
import FileNameTitleSelectorModal from './components/FileNameTitleSelectorModal';
import LawyerDashboard from './components/dashboard/LawyerDashboard';
import AdminDashboard, { ADMIN_DASHBOARD_UI_KEY } from './pages/AdminDashboard/AdminDashboard';
import FinanceExpensesDashboard from './components/finance/FinanceExpensesDashboard';
import { financialExpensesClient } from './services/financialExpensesClient';
import { renderExpensesTableText, renderExpensesTableHtml } from './utils/expensesTableText';
import { ToastProvider, useToast } from './components/ui/Toast';
import {
  REPORT_REVIEW_PANEL_ID,
  EXTERNAL_FEEDBACK_PANEL_ID,
} from './constants/scrollTargets';
import CaseFolderView from './components/cases/CaseFolderView';
import {
  loadCaseFolders,
  saveCaseFolders,
  upsertCaseFolderFromReportInMap,
  addSentReportToCaseFolderInMap,
  migrateCaseFoldersFromReportsOnceInMap,
  wasCaseFoldersMigrated,
  markCaseFoldersMigrated,
  canonicalizeCaseFoldersKeys,
} from './services/caseFolders';
import buildReportFileName, {
  mapSectionsToFileNameTitles,
  dedupeTitles,
  INVALID_FILENAME_CHARS,
  buildReportSubject,
} from './utils/reportFileName';
import {
  buildDefaultEmailContent,
  buildSmartEmailSubject,
  resolveEmailScenario,
  EMAIL_SCENARIO_SUBJECT_PREFIX,
} from './utils/emailContentDefaults';
import { extractPolicyData, refineLegalText, improveEnglishText, extractExpensesTable, askHelpChat, analyzeMedicalComplaint, analyzeDentalOpinion, sendEmailViaOutlook, fetchReportPdf, requestAssistantHelp, generateHebrewReportSummary, type HebrewRefineMode } from './services/geminiService';

const DOC_ANALYSIS_OCR_FAILED_MSG =
  'לא ניתן לקרוא טקסט מהמסמך.\nניתן להמשיך לעבוד ולהוסיף את הסיכום ידנית.\n\nאם יש באפשרותך, ניתן לבצע OCR ב־Adobe Acrobat ולהעלות את הקובץ מחדש.';
const DOC_ANALYSIS_GENERIC_FAIL_MSG =
  'לא ניתן לנתח את המסמך כרגע.\nניתן להמשיך לעבוד ולהוסיף את הסיכום ידנית.';
const DOC_ANALYSIS_LOW_CONFIDENCE_MSG =
  'המסמך נראה כסריקה באיכות נמוכה.\nננסה לנתח אותו, אך ייתכן שהניתוח לא יצליח במלואו.';
import { diffWords, type DiffToken } from './utils/wordDiff';
import { logError } from './utils/logging';
import { GRAMMARLY_CLIENT_ID } from './config/grammarly';
import AssistantPanel from './components/AssistantPanel';
import { getReportLockState } from './utils/reportLock';
import { logBlockedEdit } from './utils/telemetry';
import { normalizeOdakanitNo } from './utils/normalizeOdakanitNo';
import { transliterateHebrew } from './utils/hebrewTransliterate';
import { loadPersonalSnippets, upsertPersonalSnippet, deletePersonalSnippet, recordPersonalSnippetUsage } from './utils/personalSnippets';

// Feature flag: האם SUB_ADMIN רשאי לערוך את גוף הדו"ח (ולא רק פיננסים)
const SUB_ADMIN_CAN_EDIT_REPORT_BODY = false;
import { loadUserTopicCombos, saveUserTopicCombos, upsertTopicComboMRU } from './utils/topicPreferences';

// --- PREVIEW I18N (LAWYER vs default) ---
const PREVIEW_LABELS_DEFAULT = {
  title: 'Final Preview',
  toggleHide: 'Hide Preview',
  toggleShow: 'Show Preview',
  downloadPdf: 'Download PDF',
  editFileNames: 'Edit file name titles',
  finalize: 'Finalize & Close',
  backToEditing: 'Back to Editing',
  backToStep2: 'Back to Step 2',
  backToDashboard: 'Back to dashboard',
  helperScroll: 'Scroll to review entire document',
  collapsedHint: 'Click "Show Preview" to review the document before sending.',
};

const PREVIEW_LABELS_LAWYER = {
  title: 'תצוגה מקדימה',
  toggleHide: 'הסתר תצוגה',
  toggleShow: 'הצג תצוגה',
  downloadPdf: 'הורדת PDF',
  editFileNames: 'עריכת כותרות לקובץ',
  finalize: 'סיום ושליחה',
  backToEditing: 'חזרה לעריכה',
  backToStep2: 'חזרה לשלב 2',
  backToDashboard: 'חזרה ללוח הבקרה',
  helperScroll: 'גללי לסקירה מלאה של המסמך',
  collapsedHint: 'לחצי על "הצג תצוגה" כדי לצפות במסמך לפני שליחה.',
};

const getPreviewLabelsForRole = (role?: User['role']) =>
  role === 'LAWYER' ? PREVIEW_LABELS_LAWYER : PREVIEW_LABELS_DEFAULT;

// --- UPDATE section: first‑report intro templates (Hebrew) ---
const UPDATE_INTRO_TEMPLATES = {
  SOC: [
    'נעדכן כי ביום ___________ הוגשה תביעה לבית משפט ____________ ב____________ על ידי התובע, כנגד המבוטח ו____________________.',
    '',
    'כתב התביעה הועבר על ידי המבוטח לברוקר ביום ____________________.',
    '',
    'עניינה של התביעה בטענות לרשלנות המיוחסות למבוטח, אשר לטענת התובע באו לידי ביטוי ב________________________.',
  ].join('\n'),
  LOD: [
    'נעדכן כי ביום ___________ נשלח למבוטח מכתב דרישה מאת התובע.',
    '',
    'מכתב הדרישה הועבר על ידי המבוטח לברוקר ביום ____________________.',
    '',
    'בתמצית, במכתב הדרישה מעלה ה־Claimant טענות לרשלנות מצד המבוטח, אשר לטענתו באו לידי ביטוי ב______________________.',
  ].join('\n'),
} as const;

// --- UTILS: TOAST NOTIFICATION ---
type ToastType = 'success' | 'error' | 'info' | 'warning';

const Toast = ({ message, type, onClose }: { message: string, type: ToastType, onClose: () => void }) => {
  const base =
    'fixed top-4 right-4 z-[100] p-4 rounded-lg shadow-xl border-l-4 flex items-center gap-3 animate-slide-in bg-panel border-borderDark text-textLight';
  const theme =
    type === 'success'
      ? 'border-l-gold text-goldLight'
      : type === 'error'
      ? 'border-l-danger text-red-300'
      : type === 'warning'
      ? 'border-l-gold text-goldLight'
      : 'border-l-gold text-textLight';
  return (
  <div className={`${base} ${theme}`}>
    <span>{message}</span>
    <button onClick={onClose} className="hover:bg-navySecondary p-1 rounded text-textMuted"><X className="w-4 h-4"/></button>
  </div>
);
};

const BestPracticeDraftForm: React.FC<{
  onSubmit: (args: {
    title: string;
    label: 'BEST_PRACTICE' | 'LLOYDS_RECOMMENDED';
    tags: string[];
    behavior: 'INSERTABLE' | 'COPY_ONLY';
  }) => void;
  onCancel: () => void;
  initialTitle?: string;
}> = ({ onSubmit, onCancel, initialTitle }) => {
  const [title, setTitle] = useState(initialTitle || '');
  const [label, setLabel] = useState<'BEST_PRACTICE' | 'LLOYDS_RECOMMENDED'>('BEST_PRACTICE');
  const [tagsInput, setTagsInput] = useState('');
  const [behavior, setBehavior] = useState<'INSERTABLE' | 'COPY_ONLY'>('INSERTABLE');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSubmit({ title: trimmedTitle, label, tags, behavior });
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3 text-xs">
      <div className="space-y-1">
        <label className="block font-semibold text-textLight">Title</label>
        <input
          type="text"
          className="w-full border border-borderDark rounded px-2 py-1 text-xs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="block font-semibold text-textLight">Label / Type</label>
        <select
          className="w-full border border-borderDark rounded px-2 py-1 text-xs"
          value={label}
          onChange={(e) =>
            setLabel(e.target.value === 'LLOYDS_RECOMMENDED' ? 'LLOYDS_RECOMMENDED' : 'BEST_PRACTICE')
          }
        >
          <option value="BEST_PRACTICE">Best practice</option>
          <option value="LLOYDS_RECOMMENDED">Lloyds recommended</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="block font-semibold text-textLight">Tags (optional)</label>
        <input
          type="text"
          className="w-full border border-borderDark rounded px-2 py-1 text-xs"
          placeholder="e.g. lloyds, settlement, high exposure"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="block font-semibold text-textLight">Behavior</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="bp-behavior"
              checked={behavior === 'INSERTABLE'}
              onChange={() => setBehavior('INSERTABLE')}
            />
            <span>Insertable (insert into body)</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="bp-behavior"
              checked={behavior === 'COPY_ONLY'}
              onChange={() => setBehavior('COPY_ONLY')}
            />
            <span>Copy only</span>
          </label>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-borderDark mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
        >
          ביטול
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700"
        >
          שמירת Best Practice
        </button>
      </div>
    </form>
  );
};

// --- UTILS: AUTO RESIZE TEXTAREA ---
const AutoResizeTextarea = ({ value, onChange, placeholder, disabled, readOnly, dir = "ltr", className, style = {}, textareaRef }: any) => {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const refToUse = textareaRef || internalRef;
  useEffect(() => {
    const el: HTMLTextAreaElement | null = refToUse && 'current' in refToUse ? refToUse.current : internalRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [value, refToUse]);
  const handleInput = readOnly || !onChange ? undefined : (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if (target.value !== value) onChange({ target } as any);
  };
  const handleBlur = readOnly || !onChange ? undefined : (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if (target.value !== value) onChange({ target } as any);
  };
  return (
    <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
      <textarea
        ref={refToUse}
        className={className}
        dir={dir}
        value={value}
        onChange={readOnly ? undefined : onChange}
        onInput={handleInput}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled || readOnly}
        rows={3}
        style={{ ...style, overflow: 'hidden', resize: 'none' }}
      />
    </GrammarlyEditorPlugin>
  );
};

// --- COMPONENT: USER GUIDE & HELP CHAT ---
const UserGuideModal = ({ onClose }: { onClose: () => void }) => {
  const [tab, setTab] = useState<'MANUAL' | 'CHAT'>('MANUAL');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{q: string, a: string}[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!chatInput.trim()) return;
    setLoading(true);
    const answer = await askHelpChat(chatInput);
    setChatHistory(prev => [...prev, { q: chatInput, a: answer }]);
    setChatInput('');
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-panel w-full max-w-3xl h-[600px] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in">
         <div className="bg-navy p-4 text-gold flex justify-between items-center">
           <div className="flex items-center gap-2">
             <HelpCircle className="w-6 h-6" />
             <h2 className="font-bold text-lg">מרכז העזרה והתמיכה</h2>
           </div>
           <button onClick={onClose} className="hover:bg-panel/20 rounded p-1"><X className="w-5 h-5"/></button>
         </div>
         <div className="flex border-b">
           <button onClick={() => setTab('MANUAL')} className={`flex-1 p-3 font-bold ${tab === 'MANUAL' ? 'text-lpBlue border-b-2 border-lpBlue' : 'text-textMuted'}`}>מדריך אינטראקטיבי</button>
           <button onClick={() => setTab('CHAT')} className={`flex-1 p-3 font-bold ${tab === 'CHAT' ? 'text-lpBlue border-b-2 border-lpBlue' : 'text-textMuted'}`}>שוחח עם עוזר בינה</button>
         </div>
         <div className="flex-1 overflow-auto p-6 bg-navySecondary" dir="rtl">
           {tab === 'MANUAL' ? (
            <div className="space-y-4">
              <details className="bg-panel p-4 rounded shadow-sm group">
                <summary className="font-bold text-textLight cursor-pointer list-none flex justify-between">כניסה ובחירת תוכנה <ChevronRight className="group-open:rotate-90 transition"/></summary>
                <div className="mt-2 text-textMuted text-sm space-y-1">
                  <p>1. במסך הראשי בחרו את האפליקציה הרלוונטית (CRM / Finance / בעתיד גם אפליקציה שלישית).</p>
                  <p>2. לאחר הזדהות תראו דשבורד מותאם לתפקיד + כפתור Notifications עם תקציר יומי.</p>
                  <p>3. כפתור &quot;עזרה&quot; מחזיר תמיד למדריך זה ולצ&#39;אט התמיכה.</p>
                </div>
              </details>
              <details className="bg-panel p-4 rounded shadow-sm group">
                <summary className="font-bold text-textLight cursor-pointer list-none flex justify-between">פתיחת תיק פיננסי והקצאה לעו&quot;ד <ChevronRight className="group-open:rotate-90 transition"/></summary>
                <div className="mt-2 text-textMuted text-sm space-y-1">
                  <p>1. לחצו על <strong>Open New Case Folder</strong>, הזינו מספר בעודכנית ובחרו עורכת דין.</p>
                  <p>2. הוסיפו הוראות, צרפו עד 4 חשבוניות (Word/PDF) ומלאו את טבלת ההוצאות.</p>
                  <p>3. רק אחרי FINANCE FINALIZE המשימה תופיע אצל עורכת הדין.</p>
                </div>
              </details>
              <details className="bg-panel p-4 rounded shadow-sm group">
                <summary className="font-bold text-textLight cursor-pointer list-none flex justify-between">ניהול טבלת ההוצאות <ChevronRight className="group-open:rotate-90 transition"/></summary>
                <div className="mt-2 text-textMuted text-sm space-y-1">
                  <p>• לחיצה על View Worksheet מציגה טבלה, היסטוריה, הערות והשוואה לדו&quot;ח קודם.</p>
                  <p>• איריס/לידור יכולות להוסיף שורה חדשה (כפתור ADD), לעדכן ספק וסכום ולנעול.</p>
                  <p>• אחרי נעילה, עורכת הדין מחדירה את הטבלה לדו&quot;ח דרך אייקון 📊 בסעיף Expenses.</p>
                </div>
              </details>
              <details className="bg-panel p-4 rounded shadow-sm group">
                <summary className="font-bold text-textLight cursor-pointer list-none flex justify-between">ספקים מועדפים ומסמכים נלווים <ChevronRight className="group-open:rotate-90 transition"/></summary>
                <div className="mt-2 text-textMuted text-sm space-y-1">
                  <p>• דרך Manage Favorite Providers שומרים ספקים נפוצים לכל קטגוריה.</p>
                  <p>• בטופס ובמודאל הטבלה השמות מופיעים אוטומטית ברשימת הבחירה.</p>
                  <p>• ניתן לצרף עד 4 חשבוניות מס (PDF/Word) לכל דו&quot;ח – הן נשמרות כנספחים.</p>
                </div>
              </details>
              <details className="bg-panel p-4 rounded shadow-sm group">
                <summary className="font-bold text-textLight cursor-pointer list-none flex justify-between">התקדמות דו&quot;חות – עורכת דין וליאור <ChevronRight className="group-open:rotate-90 transition"/></summary>
                <div className="mt-2 text-textMuted text-sm space-y-1">
                  <p>• עורכת הדין מקבלת משימה רק אחרי ש-FINANCE סיים ולחץ FINALIZE.</p>
                  <p>• FINALIZE של העו&quot;ד צובע את הכרטיס באדום (READY TO SEND) עד שליאור שולח.</p>
                  <p>• ליאור רואה סל מיחזור (48 שעות → סל, 30 ימים → מחיקה) ויכול לערוך את התרגום והשליחה.</p>
                </div>
              </details>
            </div>
           ) : (
             <div className="flex flex-col h-full">
               <div className="flex-1 space-y-4 mb-4 overflow-auto">
                 {chatHistory.length === 0 && <div className="text-center text-gray-400 mt-10">שאלו אותי כל דבר על המערכת!</div>}
                 {chatHistory.map((msg, i) => (
                   <div key={i} className="space-y-1">
                     <div className="bg-blue-100 text-blue-900 p-2 rounded-lg rounded-tr-none self-end w-fit ml-auto max-w-[80%]">{msg.q}</div>
                     <div className="bg-panel border text-textLight p-2 rounded-lg rounded-tl-none self-start w-fit mr-auto max-w-[80%]">{msg.a}</div>
                   </div>
                 ))}
               </div>
               <div className="flex gap-2" dir="ltr">
                 <input 
                   className="flex-1 border p-2 rounded" 
                   placeholder="הקלד/י את השאלה שלך..." 
                   value={chatInput} 
                   onChange={e => setChatInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleAsk()}
                 />
                 <button onClick={handleAsk} disabled={loading} className="bg-navy text-gold px-4 rounded hover:bg-navySecondary">
                   {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                 </button>
               </div>
             </div>
           )}
         </div>
      </div>
    </div>
  );
};

// --- COMPONENT: FINANCIAL DASHBOARD ---
const FinancialTracker = ({ reports, currentUser, onMarkPaid }: { reports: ReportData[], currentUser: User, onMarkPaid: (id: string) => void }) => {
  const unpaidReports = reports.filter(r => r.expensesSum && !r.isPaid);
  const grandTotal = unpaidReports.reduce((acc, curr) => {
    const num = parseFloat(curr.expensesSum?.replace(/,/g, '') || '0');
    return acc + (isNaN(num) ? 0 : num);
  }, 0);
  const isSubAdmin = currentUser.role === 'SUB_ADMIN';

  if (!unpaidReports.length) return null;

  return (
    <div className="mb-8 bg-panel rounded-xl shadow-sm border border-indigo-100 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 text-white flex justify-between items-center">
         <h3 className="font-bold text-lg flex items-center"><Calculator className="w-6 h-6 mr-2"/> Financial Control - Outstanding Expenses <span className="text-indigo-200 text-xs font-normal mr-2">(מידע היסטורי – לידיעה בלבד)</span></h3>
         <div className="text-xl font-bold bg-panel/20 px-4 py-1 rounded">Total: ₪{grandTotal.toLocaleString()}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-indigo-50 text-indigo-800">
            <tr>
               <th className="p-3">Report Date</th>
               <th className="p-3">Insured / File</th>
               <th className="p-3">Amount Requested</th>
               <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {unpaidReports.map(r => (
              <tr key={r.id} className="hover:bg-navySecondary">
                 <td className="p-3">{new Date(r.reportDate).toLocaleDateString()}</td>
                 <td className="p-3 font-medium">{r.insuredName} ({r.marketRef})</td>
                 <td className="p-3 font-bold text-indigo-700">₪{r.expensesSum}</td>
                 <td className="p-3">
                   {isSubAdmin ? (
                     <button 
                       onClick={() => onMarkPaid(r.id)} 
                       className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition"
                       title="Mark as Paid"
                     >
                       <Trash2 className="w-4 h-4"/>
                     </button>
                   ) : (
                     <span className="text-gray-400 cursor-not-allowed"><Trash2 className="w-4 h-4"/></span>
                   )}
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TIMELINE_IMAGE_OPTIONS = [
  { id: 'statement_of_claim', name: 'Statement of Claim', src: new URL('../Visual Timeline Selection/statement of claim.jpg', import.meta.url).href },
  { id: 'statement_of_defence', name: 'Statement of Defence', src: new URL('../Visual Timeline Selection/statement of defence.jpg', import.meta.url).href },
  { id: 'preliminary', name: 'Preliminary Proceedings', src: new URL('../Visual Timeline Selection/preliminary proceedings.jpg', import.meta.url).href },
  { id: 'evidence_submission', name: 'Evidence Submission', src: new URL('../Visual Timeline Selection/evidence submission.jpg', import.meta.url).href },
  { id: 'evidentiary', name: 'Evidentiary Hearing', src: new URL('../Visual Timeline Selection/evidentiary hearing.jpg', import.meta.url).href },
  { id: 'summaries', name: 'Summaries', src: new URL('../Visual Timeline Selection/summaries.jpg', import.meta.url).href },
  { id: 'judgment', name: 'Judgment', src: new URL('../Visual Timeline Selection/judgment.jpg', import.meta.url).href },
];

// New structured Procedural Timeline configuration (must stay in sync with server-side dictionary)
const PROCEDURE_TYPE_OPTIONS: { value: ProceduralProcedureType; label: string }[] = [
  { value: 'LETTER_OF_DEMAND', label: 'Letter of Demand' },
  { value: 'FIRST_INSTANCE', label: 'First Instance Proceedings' },
  { value: 'APPEAL', label: 'Appeal Proceedings' },
];

const PROCEDURAL_STAGE_CONFIG: Record<
  ProceduralProcedureType,
  { id: ProceduralTimelineStageId; label: string; isDynamic?: boolean }[]
> = {
  LETTER_OF_DEMAND: [
    { id: 'LOD_ISSUED', label: 'Letter of Demand Issued' },
    { id: 'LOD_INTERNAL_REVIEW', label: 'Internal Review & Coverage Assessment' },
    { id: 'LOD_RESPONSE', label: 'Response to Letter of Demand' },
    { id: 'LOD_PRE_LITIGATION', label: 'Pre-Litigation Negotiations' },
    { id: 'LOD_OUTCOME_ESCALATION', label: 'Outcome / Escalation Decision' },
    { id: 'LOD_CLAIM_SETTLED', label: 'Claim Settled' },
    { id: 'LOD_DEMAND_REJECTED', label: 'Demand Rejected' },
  ],
  FIRST_INSTANCE: [
    { id: 'FI_STATEMENT_OF_CLAIM', label: 'Statement of Claim Filed' },
    { id: 'FI_STATEMENT_OF_DEFENCE', label: 'Statement of Defence Filed' },
    { id: 'FI_DISCOVERY_DISCLOSURE', label: 'Discovery & Disclosure' },
    { id: 'FI_COURT_APPOINTED_EXPERT', label: 'Court-Appointed Expert', isDynamic: true },
    {
      id: 'FI_RD_DOCS_DAMAGE_SUBMISSIONS',
      label: 'R & D Docs – Damage Assessment Submissions',
      isDynamic: true,
    },
    { id: 'FI_EVIDENTIARY_HEARINGS', label: 'Evidentiary Hearings' },
    { id: 'FI_SUMMATIONS', label: 'Summations' },
    { id: 'FI_JUDGMENT', label: 'Judgment' },
  ],
  APPEAL: [
    { id: 'AP_DECISION_TO_APPEAL', label: 'Decision to Appeal' },
    { id: 'AP_NOTICE_OF_APPEAL', label: 'Notice of Appeal Filed' },
    { id: 'AP_RESPONSE_TO_APPEAL', label: 'Response to Appeal' },
    { id: 'AP_APPEAL_HEARINGS', label: 'Appeal Hearings' },
    { id: 'AP_APPEAL_JUDGMENT', label: 'Appeal Judgment' },
  ],
};

const EXPENSE_DETAIL_OPTIONS: { value: ExpenseRowCategory; label: string; type: ExpenseRowType }[] = [
  { value: 'EXPERT_OUR', label: 'Expert fees on our behalf', type: 'EXPENSE' },
  { value: 'EXPERT_COURT', label: 'Expert fees on behalf of the court', type: 'EXPENSE' },
  { value: 'INVESTIGATION', label: 'Private Investigation fees', type: 'EXPENSE' },
  { value: 'SECONDARY_FEE', label: 'Payment of secondary procedure fee', type: 'EXPENSE' },
  { value: 'COURT_FEES', label: 'Court fees', type: 'EXPENSE' },
  { value: 'PHOTOCOPY', label: 'Photocopying and binding of documents', type: 'EXPENSE' },
  { value: 'MEDICAL_RECORDS', label: 'Medical Records Collection', type: 'EXPENSE' },
  { value: 'ATTORNEY_PHASE_1', label: 'Attorney fees for phase 1', type: 'EXPENSE' },
  { value: 'ATTORNEY_PHASE_2', label: 'Attorney fees for phase 2', type: 'EXPENSE' },
  { value: 'ATTORNEY_PHASE_3', label: 'Attorney fees for phase 3', type: 'EXPENSE' },
  { value: 'ATTORNEY_PHASE_4', label: 'Attorney fees for phase 4', type: 'EXPENSE' },
  { value: 'ATTORNEY_PHASE_5', label: 'Attorney fees for phase 5', type: 'EXPENSE' },
  { value: 'ATTORNEY_EXTRA_HEARING', label: 'Attorney fees for extra court hearing', type: 'EXPENSE' },
  { value: 'ATTORNEY_THIRD_PARTY', label: 'Attorney fees for third party notice', type: 'EXPENSE' },
  { value: 'OTHER', label: 'Other', type: 'EXPENSE' },
  { value: 'COMPENSATION_JUDGMENT', label: 'Compensation by Judgment', type: 'ADJUSTMENT' },
  { value: 'COMPENSATION_SETTLEMENT', label: 'Compensation under Settlement', type: 'ADJUSTMENT' },
  { value: 'DEDUCTIBLE', label: 'Deductible paid by the insured', type: 'ADJUSTMENT' },
  { value: 'PAID_BY_INSURER', label: 'Expenses already paid by the insurer', type: 'ADJUSTMENT' },
];

const defaultExpenseWorksheet = (): ExpenseWorksheet => ({
  status: 'DRAFT',
  rows: [],
  history: [],
  notes: [],
  favorites: [],
  totals: { totalExpenses: 0, totalAdjustments: 0, totalBalance: 0 },
});

const ARCHIVE_AFTER_MS = 1000 * 60 * 60 * 48; // 48 hours
const DELETE_AFTER_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const LAWYER_RECYCLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const STEP1_FIELD_LABELS = {
  lineSlip: 'UNIQUE MARKET REF',
  certificate: 'CERTIFICATE REF',
};

const STORAGE_KEYS = {
  REPORTS: 'lp_reports',
  USER: 'lp_current_user',
  VIEW: 'lp_view',
  CURRENT_REPORT: 'lp_current_report',
  CASE_FOLDERS: 'lp_case_folders',
  NOTIFICATIONS: 'lp_notifications',
};

const FINANCIAL_STORE_KEY = 'financial_expenses_store_v1';

/** Collects all user data for backup and triggers download */
const downloadFullBackup = (reports: ReportData[], currentReport: ReportData | null, caseFolders: Record<string, CaseFolder>) => {
  if (typeof window === 'undefined') return;
  try {
    const mergedReports = [...reports];
    if (currentReport) {
      const idx = mergedReports.findIndex((r) => r.id === currentReport.id);
      const merged = idx >= 0 ? { ...mergedReports[idx], ...currentReport } : currentReport;
      if (idx >= 0) mergedReports[idx] = merged;
      else mergedReports.push(merged);
    }
    const backup: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      reports: mergedReports,
      caseFolders,
      notifications: (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })(),
      financialStore: (() => {
        try {
          const raw = localStorage.getItem(FINANCIAL_STORE_KEY);
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })(),
      caseTemplates: (() => {
        try {
          const raw = localStorage.getItem('caseTemplates');
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      })(),
      favoriteProviders: (() => {
        try {
          const raw = localStorage.getItem('favoriteProviders');
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Backup download failed', error);
  }
};

// Canonical Expenses section used when a financial expenses table from Iris is linked to the report
const CANONICAL_EXPENSES_SECTION = 'Expenses breakdown';

const isCanonicalExpensesSection = (sec: string): boolean => {
  if (!sec) return false;
  if (sec === CANONICAL_EXPENSES_SECTION) return true;
  // Fallback: recognize legacy/custom headers that clearly include the word "Expenses"
  return /\bexpenses\b/i.test(sec);
};

const RESET_DONE_FLAG = '__reset_done__';
const STORAGE_PREFIXES = [
  'report',
  'reports',
  'case',
  'cases',
  'finance',
  'expense',
  'worksheet',
  'templates',
  'draft',
  'archive',
  'recycle',
];

const resetAllAppData = () => {
  if (typeof window === 'undefined') return;
  try {
    // Remove known keys (current schema)
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem('caseTemplates');
    localStorage.removeItem('favoriteProviders');

    // Email templates per user
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

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.error('Failed to reset app localStorage data', error);
  }
};

const ensureResetAllAppDataOnce = () => {
  if (typeof window === 'undefined') return;
  const shouldReset = import.meta.env.VITE_RESET_ALL === '1';
  if (!shouldReset) return;
  const alreadyDone = localStorage.getItem(RESET_DONE_FLAG) === '1';
  if (alreadyDone) return;
  resetAllAppData();
  localStorage.setItem(RESET_DONE_FLAG, '1');
};

const migrateSectionLabels = (report: ReportData, legacyLabels: readonly string[], targetLabel: string): ReportData => {
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
        legacyLabels.includes(section) ? targetLabel : section
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

const migrateReportLabels = (report: ReportData): ReportData => {
  let migrated = migrateSectionLabels(report, LEGACY_CLAIM_SECTION_LABELS, CLAIM_SECTION_LABEL);
  migrated = migrateSectionLabels(migrated, LEGACY_DEMAND_SECTION_LABELS, DEMAND_LETTER_SECTION_LABEL);
  return migrated;
};

const migrateReportReview = (report: ReportData): ReportData => {
  const next: ReportData = { ...report };

  if (!next.reportReview) {
    next.reportReview = {
      status: 'DRAFT',
      issues: [],
    };
  }

  // Default Hebrew workflow status for older reports
  if (!next.hebrewWorkflowStatus) {
    next.hebrewWorkflowStatus = 'HEBREW_DRAFT';
  }

  // Ensure legacy issues have origin set to INTERNAL, and default externalAction for EXTERNAL issues
  if (Array.isArray(next.reportReview.issues) && next.reportReview.issues.length > 0) {
    next.reportReview = {
      ...next.reportReview,
      issues: next.reportReview.issues.map((issue) => {
        const origin = issue.origin ?? 'INTERNAL';
        let externalAction = issue.externalAction;
        if (origin === 'EXTERNAL' && !externalAction) {
          externalAction = 'ENGLISH_ONLY';
        }
        return {
          ...issue,
          origin,
          externalAction,
        };
      }),
    };
  }

  return next;
};

const loadStoredReports = (): ReportData[] => {
  if (typeof window === 'undefined') return [];
  try {
    ensureResetAllAppDataOnce();
    const stored = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const parsed: ReportData[] = stored ? JSON.parse(stored) : [];
    return parsed.map(migrateReportLabels).map(migrateReportReview);
  } catch (error) {
    console.error('Failed to load stored reports', error);
    return [];
  }
};

const loadStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    ensureResetAllAppDataOnce();
    const username = localStorage.getItem(STORAGE_KEYS.USER);
    if (!username) return null;
    return USERS.find((u) => u.username === username) || null;
  } catch (error) {
    console.error('Failed to load stored user', error);
    return null;
  }
};

const loadStoredView = (): 'DASHBOARD' | 'STEP1' | 'STEP2' | 'PREVIEW' | 'CASE_FOLDER' => {
  if (typeof window === 'undefined') return 'DASHBOARD';
  ensureResetAllAppDataOnce();
  const stored = localStorage.getItem(STORAGE_KEYS.VIEW) as
    | 'DASHBOARD'
    | 'STEP1'
    | 'STEP2'
    | 'PREVIEW'
    | 'CASE_FOLDER'
    | null;
  if (!stored) return 'DASHBOARD';
  if (stored === 'STEP1' || stored === 'STEP2' || stored === 'PREVIEW' || stored === 'DASHBOARD' || stored === 'CASE_FOLDER') {
    return stored;
  }
  return 'DASHBOARD';
};

const recalcWorksheetTotals = (rows: ExpenseWorksheetRow[]) => {
  const totalExpenses = rows
    .filter((row) => row.type === 'EXPENSE')
    .reduce((sum, row) => sum + (row.amount || 0), 0);
  const totalAdjustments = rows
    .filter((row) => row.type === 'ADJUSTMENT')
    .reduce((sum, row) => sum + (row.amount || 0), 0);
  return {
    totalExpenses,
    totalAdjustments,
    totalBalance: totalExpenses - totalAdjustments,
  };
};

const getExpensesNumericTotal = (report: ReportData): number => {
  if (report.expenseWorksheet?.totals) {
    return report.expenseWorksheet.totals.totalBalance;
  }
  if (report.expensesSum) {
    const parsed = parseFloat(report.expensesSum.replace(/,/g, ''));
    if (!isNaN(parsed)) return parsed;
  }
  if (report.expensesItems?.length) {
    return report.expensesItems.reduce((acc, item) => acc + (item.amount || 0), 0);
  }
  return 0;
};

const hasExpenseData = (report: ReportData) =>
  (report.expenseWorksheet?.rows?.length ?? 0) > 0 ||
  (report.expensesItems?.length ?? 0) > 0 ||
  Boolean(report.expensesSum && report.expensesSum !== '0');

const makeId = () => Math.random().toString(36).slice(2, 10);

const deepClone = <T,>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to convert blob'));
    reader.readAsDataURL(blob);
  });

const formatParagraphContent = (text?: string): string => {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  const trimmedLines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+$/g, '').replace(/ {2,}/g, ' '))
    .join('\n')
    .trim();
  return trimmedLines.replace(/\n{3,}/g, '\n\n');
};

// Apply glossary-driven English replacements on legal/insurance text.
// - Case-insensitive
// - Word-boundary aware
// - With safeguards to avoid duplicating "expert opinion"
const applyEnglishGlossary = (text: string): string => {
  if (!text) return text;

  let result = text;

  const rules: { pattern: RegExp; replacement: string }[] = [
    { pattern: /\bprosecutor\b/gi, replacement: 'plaintiff' },
    { pattern: /\ba specialist\b/gi, replacement: 'an expert' },
    { pattern: /\bthe specialist\b/gi, replacement: 'the expert' },
    { pattern: /\bProf\.(?=\s|$)/gi, replacement: 'prof' },
    { pattern: /\bNational Insurance Institute\b/gi, replacement: 'NII' },
    { pattern: /\boperation\b/gi, replacement: 'surgery' },
    { pattern: /\bdamage calculations\b/gi, replacement: 'R & D Docs' },
    { pattern: /\bdemander\b/gi, replacement: 'claimant' },
    { pattern: /\bapplicant\b/gi, replacement: 'claimant' },
    { pattern: /\bbranch\b/gi, replacement: 'clinic' },
    { pattern: /\bverdict\b/gi, replacement: 'judgment' },
    { pattern: /\binterrogation\b/gi, replacement: 'cross-examination' },
    { pattern: /\bDr\.(?=\s|$)/gi, replacement: 'Dr' },
    { pattern: /\bversion\b/gi, replacement: 'position' },
    { pattern: /\bpolicyholder\b/gi, replacement: 'insured' },
  ];

  for (const { pattern, replacement } of rules) {
    result = result.replace(pattern, replacement);
  }

  // Special handling for "opinion" -> "expert opinion" with safeguards.
  // - Do not replace if already part of "expert opinion" (any casing).
  result = result.replace(/\bopinion\b/gi, (match: string, offset: number, full: string) => {
    const windowStart = Math.max(0, offset - 20);
    const before = full.slice(windowStart, offset).toLowerCase();
    if (/\bexpert\s*$/.test(before)) {
      // Already "expert opinion" (or similar) – leave as is.
      return match;
    }
    return 'expert opinion';
  });

  return result;
};

const formatContentMap = (map?: Record<string, string>) => {
  const source = map || {};
  return Object.keys(source).reduce<Record<string, string>>((acc, key) => {
    acc[key] = formatParagraphContent(source[key]);
    return acc;
  }, {});
};

type FactPlaceholderMap = Record<string, string>;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const protectFacts = (text: string): { protectedText: string; map: FactPlaceholderMap } => {
  if (!text) return { protectedText: text, map: {} };

  let protectedText = text;
  const map: FactPlaceholderMap = {};
  let counter = 0;

  const applyPattern = (pattern: RegExp, prefix: string) => {
    protectedText = protectedText.replace(pattern, (match) => {
      const key = `⟦${prefix}_${++counter}⟧`;
      // Avoid overriding if somehow already present
      if (!map[key]) {
        map[key] = match;
      }
      return key;
    });
  };

  // 1) Money amounts (symbols + common currency words)
  applyPattern(
    /(?:₪|\$|€|£)\s*\d[\d,]*(?:\.\d+)?/g,
    'MONEY',
  );
  applyPattern(
    /\b(?:USD|NIS|ILS|EUR|GBP)\s*\d[\d,]*(?:\.\d+)?\b/gi,
    'MONEY',
  );
  applyPattern(
    /\d[\d,]*(?:\.\d+)?\s*(?:NIS|ILS|USD|EUR|GBP)\b/gi,
    'MONEY',
  );

  // 2) Percentages
  applyPattern(/\d[\d,]*(?:\.\d+)?%/g, 'PCT');

  // 3) Dates – numeric formats
  applyPattern(/\b\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}\b/g, 'DATE');

  // 4) Dates – textual (e.g. 2 January 2026, January 2, 2026, 2 Jan 2026)
  const monthPattern = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  applyPattern(
    new RegExp(`\\b\\d{1,2}\\s+${monthPattern}\\s+\\d{4}\\b`, 'g'),
    'DATE',
  );
  applyPattern(
    new RegExp(`\\b${monthPattern}\\s+\\d{1,2},\\s+\\d{4}\\b`, 'g'),
    'DATE',
  );

  // 5) Case/policy/claim identifiers (best-effort)
  applyPattern(
    /\b(?:Policy\s+No\.?|Claim\s+#?|File|Case)\s+[A-Za-z0-9\/\-]+\b/gi,
    'ID',
  );

  // 6) Generic long-ish alphanumeric IDs (best-effort)
  applyPattern(
    /\b[A-Za-z0-9]{3,}[A-Za-z0-9\-\/]{3,}\b/g,
    'ID',
  );

  // 7) Plain numbers (after more specific patterns, to avoid double-wrapping)
  applyPattern(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g, 'NUM');

  return { protectedText, map };
};

const restoreFacts = (text: string, map: FactPlaceholderMap): string => {
  if (!text || !map || !Object.keys(map).length) return text;
  let restored = text;

  for (const [placeholder, original] of Object.entries(map)) {
    const re = new RegExp(escapeRegex(placeholder), 'g');
    restored = restored.replace(re, original);
  }

  return restored;
};

const buildMedicalAnalysisUpdates = (analysis: MedicalComplaintAnalysis, report: ReportData) => {
  if (!analysis || !report) return null;
  const nextSections = [...report.selectedSections];
  const ensureSection = (section: string) => {
    if (!nextSections.includes(section)) nextSections.push(section);
  };
  const bulletList = (items?: string[]) =>
    items && items.length ? items.map((item) => `• ${item}`).join('\n') : '';
  const timelineText = analysis.timeline?.length
    ? analysis.timeline
        .map((entry) => `• ${(entry?.date || 'תאריך לא צוין')} – ${entry?.event || ''}`)
        .join('\n')
    : '';
  const newContent = { ...report.content };

  if (analysis.briefSummary || timelineText || (analysis.injuries?.length)) {
    ensureSection('Update');
    const injuryText = bulletList(analysis.injuries);
    const reliefText = bulletList(analysis.requestedRelief);
    const parts = [
      analysis.briefSummary || '',
      injuryText ? `\nפגיעות נטענות:\n${injuryText}` : '',
      reliefText ? `\nסעדים מבוקשים:\n${reliefText}` : '',
      timelineText ? `\nציר זמן:\n${timelineText}` : '',
    ].filter(Boolean);
    newContent['Update'] = parts.join('\n').trim();
  }

  if (analysis.facts?.length) {
    const sectionKey = CLAIM_SECTION_LABEL;
    ensureSection(sectionKey);
    newContent[sectionKey] = bulletList(analysis.facts);
  }

  const strategyParts: string[] = [];
  if (analysis.allegations?.length) strategyParts.push(`טענות מרכזיות:\n${bulletList(analysis.allegations)}`);
  if (analysis.negligenceTheory?.length) strategyParts.push(`עילות רשלנות:\n${bulletList(analysis.negligenceTheory)}`);
  if (analysis.medicalFindings?.length) strategyParts.push(`ממצאים רפואיים:\n${bulletList(analysis.medicalFindings)}`);
  if (strategyParts.length) {
    const sectionKey = report.selectedSections.includes('Strategy & Recommendations')
      ? 'Strategy & Recommendations'
      : 'Strategy';
    ensureSection(sectionKey);
    newContent[sectionKey] = strategyParts.join('\n\n');
  }

  if (analysis.riskAssessment) {
    ensureSection('Risk Assessment');
    newContent['Risk Assessment'] = analysis.riskAssessment;
  }

  const recParts: string[] = [];
  if (analysis.recommendedActions?.length) recParts.push(bulletList(analysis.recommendedActions));
  if (analysis.requestedRelief?.length) recParts.push(`סעדים מבוקשים:\n${bulletList(analysis.requestedRelief)}`);
  if (recParts.length) {
    ensureSection('Recommendations');
    newContent['Recommendations'] = recParts.join('\n\n');
  }

  return {
    content: newContent,
    selectedSections: nextSections,
    complaintAnalysis: analysis,
  };
};

type DraftWorksheetRow = {
  id: string;
  category: ExpenseRowCategory;
  serviceProvider: string;
  amount: string;
  customLabel?: string;
};

type NotificationEntry = {
  id: string;
  message: string;
  createdAt: string;
  reportId?: string;
  severity?: 'info' | 'warning' | 'error';
  targetUserId?: string;
};

type DashboardReportRow = ReportData & { __templateKey?: string };

const FIRST_REPORT_STRATEGY_TEXT = `
בשלב זה בכוונתנו לפנות למבוטח לצורך קבלת גרסה מלאה באשר לנסיבות האירוע הנטען ולמערך העובדתי הרלוונטי. במקביל, נפעל לאיסוף ראיות, לרבות מלוא הרשומה הרפואית לצורך בחינה ראשונית ומקיפה של טענותיה.

לאחר שנאסוף את מלוא הנתונים הרלוונטיים ונבצע בחינה מושכלת של החומר, נפנה, במידת הצורך, למומחה רפואי מתאים לצורך קבלת חוות דעת שתאפשר הערכה של טענות התובע.

ככל שיתקבלו בינתיים מסמכים נוספים מצד באי-כוחה של התובעת, נשלבם במסגרת בחינתנו ונעדכן בהתאם.

לאחר השלמת הפעולות האמורות, ולאחר קבלת חוות הדעת הרפואית, נשוב ונעדכן אותך בהקדם האפשרי ונציג תמונה מלאה יותר לצורך גיבוש עמדתנו ביחס להמשך הטיפול בתביעה.

אנו עומדים לרשותך לכל שאלות והסברים נוספים.
`.trim();

const INSURANCE_COVERAGE_TEMPLATE = [
  'The policy period is from [policyStartDate] to [policyEndDate].',
  '',
  'The retroactive date is [retroactiveDate].',
  '',
  'התביעה נמסרה לברוקר ביום _______________, כלומר, בתוך תקופת הפוליסה.',
  '',
  'על פי הרשומה הרפואית שצורפה לכתב התביעה, הטיפולים היו בתקופה שבין ____________ לבין ____________.',
  '',
  'לכן, נראה שיש כיסוי ביטוחי לטיפולים שביצע המבוטח בהקשר זה.'
].join('\n');

type SectionAnalysisType = 'CLAIM' | 'DEMAND' | 'EXPERT';

const fillInsuranceCoverageSection = (
  existingText: string | undefined,
  policyPeriodStart?: string,
  policyPeriodEnd?: string,
  retroStart?: string,
  retroEnd?: string
) => {
  const template = INSURANCE_COVERAGE_TEMPLATE;
  const makeLtr = (text: string) => `\u202A${text}\u202C`;
  const safeStart = policyPeriodStart || '';
  const safeEnd = policyPeriodEnd || '';
  const retroactiveDate = retroStart || retroEnd || '';

  const policyLine = makeLtr(`The policy period is from ${safeStart} to ${safeEnd}.`);
  const retroLine = makeLtr(`The retroactive date is ${retroactiveDate}.`);
  const hebrewBlock = [
    'התביעה נמסרה לברוקר ביום _______________, כלומר, בתוך תקופת הפוליסה.',
    '',
    'על פי הרשומה הרפואית שצורפה לכתב התביעה, הטיפולים היו בתקופה שבין ____________ לבין ____________.',
    '',
    'לכן, נראה שיש כיסוי ביטוחי לטיפולים שביצע המבוטח בהקשר זה.'
  ].join('\n');

  const applyPlaceholders = (text: string) =>
    text
      .replace(/\[policyStartDate\]/gi, safeStart)
      .replace(/\[policyEndDate\]/gi, safeEnd)
      .replace(/\[retroactiveDate\]/gi, retroactiveDate);

  const fallbackBlock = `${policyLine}\n\n${retroLine}\n\n${hebrewBlock}`;
  const preparedTemplate = template ? applyPlaceholders(template) : '';
  if (!preparedTemplate && !existingText) {
    return fallbackBlock;
  }

  const baseText = existingText && existingText.trim().length ? existingText : preparedTemplate || fallbackBlock;
  let updated = baseText;

  // If placeholders still exist, replace them directly
  if (/\[policyStartDate\]/i.test(updated) || /\[policyEndDate\]/i.test(updated) || /\[retroactiveDate\]/i.test(updated)) {
    updated = applyPlaceholders(updated);
  }

  const policyRegex = /The policy period is[^\n]*/i;
  if (policyRegex.test(updated)) {
    updated = updated.replace(policyRegex, policyLine);
  } else if (!existingText || !existingText.trim()) {
    updated = `${policyLine}\n\n${updated}`;
  }

  const retroRegex = /The retroactive date is[^\n]*/i;
  if (retroRegex.test(updated)) {
    updated = updated.replace(retroRegex, retroLine);
  } else if (!existingText || !existingText.trim()) {
    updated = updated.includes(policyLine) ? updated.replace(policyLine, `${policyLine}\n\n${retroLine}`) : `${retroLine}\n\n${updated}`;
  }

  if (!updated.includes('התביעה נמסרה לברוקר ביום')) {
    updated = `${updated.trim()}\n\n${hebrewBlock}`;
  }

  return updated;
};

const convertDraftRowsToWorksheetRows = (rows: DraftWorksheetRow[], author?: User): ExpenseWorksheetRow[] => {
  return rows.map(row => {
    const meta = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === row.category);
    const type = meta?.type || 'EXPENSE';
    const label = row.category === 'OTHER'
      ? row.customLabel?.trim() || 'Other expense'
      : meta?.label || 'Expense';
    return {
      id: row.id || makeId(),
      type,
      category: row.category,
      label,
      serviceProvider: type === 'EXPENSE' ? row.serviceProvider : undefined,
      amount: Number(row.amount) || 0,
      locked: false,
      createdBy: author?.id,
      createdAt: new Date().toISOString(),
      updatedBy: author?.id,
      updatedAt: new Date().toISOString(),
    };
  });
};

const worksheetRowsToExpenseItems = (rows: ExpenseWorksheetRow[]) =>
  rows
    .filter(row => row.type === 'EXPENSE')
    .map(row => ({
      id: row.id,
      date: new Date().toISOString().split('T')[0],
      description: `${row.label}${row.serviceProvider ? ` (${row.serviceProvider})` : ''}`,
      amount: row.amount,
      currency: 'NIS',
    }));

// Hebrew block (letters, niqqud) – used to decide whether to suggest name translation
const hasHebrew = (str: string): boolean => /[\u0590-\u05FF]/.test(str || '');

// Exceptional clients (e.g. TEREM) – CERT/MARKET REF not required, hidden from UI and PDF
const isExceptionalClient = (insuredName?: string): boolean => {
  const n = (insuredName || '').trim().toUpperCase();
  return n === 'TEREM' || n.includes('TEREM');
};

// --- STEP 1: Setup & Selection ---
const Step1_Selection: React.FC<StepProps> = ({ data, updateData, onNext, currentUser, timelineGallery, onAddTimelineImages, onRemoveTimelineImage, onSaveAndExit, readOnly }) => {
  const [newCustomSection, setNewCustomSection] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const isPredefinedInsurer = data.insurerName === '' || INSURER_OPTIONS.includes(data.insurerName);
  const [showCustomInsurerInput, setShowCustomInsurerInput] = useState(!isPredefinedInsurer);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPolicyAnalyzing, setIsPolicyAnalyzing] = useState(false);
  const policyAnalysisInputRef = useRef<HTMLInputElement | null>(null);
  const insuredNameRef = useRef(data.insuredName);
  const plaintiffNameRef = useRef(data.plaintiffName);
  useEffect(() => {
    insuredNameRef.current = data.insuredName;
  }, [data.insuredName]);
  useEffect(() => {
    plaintiffNameRef.current = data.plaintiffName;
  }, [data.plaintiffName]);
  const [timelineDraftDates, setTimelineDraftDates] = useState<
    Record<ProceduralTimelineStageId, { month: string; year: string }>
  >(() => ({}));

  const formatDateForInput = (isoString: string) => {
    if (!isoString) return new Date().toISOString().split('T')[0];
    return new Date(isoString).toISOString().split('T')[0];
  };

  const normalizeName = (str: string): string =>
    str.trim().replace(/\s+/g, ' ');

  const maybeAutoFillSubject = (updates: Partial<ReportData>) => {
    const current = data;
    const nextPlaintiff = 'plaintiffName' in updates ? updates.plaintiffName ?? current.plaintiffName : current.plaintiffName;
    const nextInsured = 'insuredName' in updates ? updates.insuredName ?? current.insuredName : current.insuredName;
    const hasBoth = !!nextPlaintiff && !!nextInsured;

    if (!hasBoth) {
      return updates;
    }

    const normalizedParty = normalizeName(nextPlaintiff!);
    const normalizedInsured = normalizeName(nextInsured!);
    const nextAuto = `${normalizedParty} v. ${normalizedInsured}`;

    const currentSubject = 'reportSubject' in updates
      ? (updates.reportSubject ?? current.reportSubject)
      : current.reportSubject;
    const isAuto = 'isSubjectAuto' in updates
      ? updates.isSubjectAuto ?? current.isSubjectAuto
      : current.isSubjectAuto;

    if (!currentSubject || !currentSubject.trim() || isAuto) {
      return {
        ...updates,
        reportSubject: nextAuto,
        isSubjectAuto: true,
      };
    }

    return updates;
  };

  const handleInsurerSelect = (val: string) => {
    if (readOnly) return;
    if (val === 'OTHER') {
      setShowCustomInsurerInput(true);
      updateData(maybeAutoFillSubject({ insurerName: '' }));
    } else {
      setShowCustomInsurerInput(false);
      updateData(maybeAutoFillSubject({ insurerName: val }));
    }
  };

  const handleNextWithValidation = () => {
    if (!data.odakanitNo || !normalizeOdakanitNo(data.odakanitNo)) {
      alert('יש להזין מספר תיק בעודכנית (Odakanit) לפני מעבר לשלב הבא.');
      return;
    }
    // Certificate Ref and Unique Market Ref are not required when no Policy (e.g. TEREM)
    onNext();
  };

  const addSection = (sec: string) => {
    if (readOnly) return;
    // If there is a linked expenses table from Finance, always normalize to the canonical expenses section
    if (
      (data.expensesSheetId || (data as any).expensesHtml) &&
      isCanonicalExpensesSection(sec)
    ) {
      sec = CANONICAL_EXPENSES_SECTION;
    }
    if (!data.selectedSections.includes(sec)) {
      updateData({ selectedSections: [...data.selectedSections, sec] });
    }
    setIsAddingSection(false);
  };

  const removeSection = (sec: string) => {
    if (readOnly) return;
    if (sec === 'Update') return;
    // Guard: when a Finance expenses table exists, the canonical expenses section cannot be removed
    const hasFinanceExpenses = Boolean(data.expensesSheetId || (data as any).expensesHtml);
    if (hasFinanceExpenses && isCanonicalExpensesSection(sec)) {
      window.alert(
        'סעיף ההוצאות נוצר ומנוהל על‑ידי הנהלת החשבונות ולכן אינו ניתן להסרה מהדוח.',
      );
      return;
    }
    updateData({ selectedSections: data.selectedSections.filter(s => s !== sec) });
  };

  const addCustomSection = () => {
    if (readOnly) return;
    if (newCustomSection.trim() && !data.selectedSections.includes(newCustomSection)) {
      updateData({ selectedSections: [...data.selectedSections, newCustomSection] });
      setNewCustomSection('');
    }
  };

  const moveSection = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= data.selectedSections.length) return;
    const nextSections = [...data.selectedSections];
    [nextSections[index], nextSections[targetIndex]] = [nextSections[targetIndex], nextSections[index]];
    updateData({ selectedSections: nextSections });
  };

  // --- Procedural Timeline Setup (new) ---
  const ensureProceduralTimeline = (): ProceduralTimeline => {
    const current = data.proceduralTimeline;
    if (current && current.procedureType) {
      return current;
    }
    // Default to FIRST_INSTANCE if nothing was selected yet.
    return {
      procedureType: 'FIRST_INSTANCE',
      currentStageId: 'FI_STATEMENT_OF_CLAIM',
      stages: [],
    };
  };

  const isLegacyReport =
    typeof data.selectedTimeline === 'string'
      ? data.selectedTimeline.trim().length > 0
      : Boolean((data as any).selectedTimelineImage);

  // Ensure proceduralTimeline exists automatically only for non-legacy reports.
  // Idempotent: runs only when there is no existing proceduralTimeline and the report is not legacy.
  useEffect(() => {
    if (data.proceduralTimeline) return;
    if (isLegacyReport) return;
    const created = ensureProceduralTimeline();
    updateData({ proceduralTimeline: created });
  }, [data.proceduralTimeline, isLegacyReport]);

  // Ensure there is always a valid currentStageId pointing to an included stage.
  useEffect(() => {
    const pt = data.proceduralTimeline;
    if (!pt) return;
    const config = PROCEDURAL_STAGE_CONFIG[pt.procedureType];
    if (!config || !config.length) return;

    const includedIds: ProceduralTimelineStageId[] = [];
    config.forEach((def) => {
      const state = pt.stages?.find((s) => s.id === def.id) || undefined;
      const include = def.isDynamic ? !!state?.include : state?.include !== false;
      if (include) {
        includedIds.push(def.id);
      }
    });
    if (!includedIds.length) return;
    if (includedIds.includes(pt.currentStageId)) return;

    const safeCurrent = includedIds[0];
    if (safeCurrent && safeCurrent !== pt.currentStageId) {
      updateData({
        proceduralTimeline: {
          ...pt,
          currentStageId: safeCurrent,
        },
      });
    }
  }, [data.proceduralTimeline, updateData]);

  const handleProcedureTypeChange = (value: ProceduralProcedureType) => {
    const base = ensureProceduralTimeline();
    const config = PROCEDURAL_STAGE_CONFIG[value];
    const firstStageId = config[0]?.id;
    const next: ProceduralTimeline = {
      ...base,
      procedureType: value,
      currentStageId: firstStageId || base.currentStageId,
      stages: base.stages
        .filter((s) => PROCEDURAL_STAGE_CONFIG[base.procedureType].some((def) => def.id === s.id))
        .map((s) => ({ ...s })),
    };
    updateData({ proceduralTimeline: next });
    setTimelineDraftDates({});
  };

  const handleCurrentStageSelect = (stageId: ProceduralTimelineStageId) => {
    const base = ensureProceduralTimeline();
    const next: ProceduralTimeline = {
      ...base,
      currentStageId: stageId,
    };
    updateData({ proceduralTimeline: next });
  };

  const handleDynamicStageToggle = (stageId: ProceduralTimelineStageId, include: boolean) => {
    const base = ensureProceduralTimeline();
    const existing = Array.isArray(base.stages) ? [...base.stages] : [];
    const idx = existing.findIndex((s) => s.id === stageId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], include };
    } else {
      existing.push({ id: stageId, label: '', include, isDynamic: true, monthYear: null });
    }

    let nextCurrentStageId = base.currentStageId;
    // If we just disabled a dynamic stage that is currently selected, move currentStageId
    if (!include && stageId === base.currentStageId) {
      const config = PROCEDURAL_STAGE_CONFIG[base.procedureType];
      if (config && config.length) {
        const includedIds: ProceduralTimelineStageId[] = [];
        config.forEach((def) => {
          const state = existing.find((s) => s.id === def.id) || undefined;
          const isIncluded = def.isDynamic ? !!state?.include : state?.include !== false;
          if (isIncluded) {
            includedIds.push(def.id);
          }
        });
        if (includedIds.length) {
          const indexInConfig = config.findIndex((def) => def.id === stageId);
          let candidate: ProceduralTimelineStageId | null = null;
          if (indexInConfig > 0) {
            for (let i = indexInConfig - 1; i >= 0; i -= 1) {
              const id = config[i].id as ProceduralTimelineStageId;
              if (includedIds.includes(id)) {
                candidate = id;
                break;
              }
            }
          }
          if (!candidate) {
            candidate = includedIds[0];
          }
          nextCurrentStageId = candidate;
        }
      }
    }

    const next: ProceduralTimeline = {
      ...base,
      currentStageId: nextCurrentStageId,
      stages: existing,
    };
    updateData({ proceduralTimeline: next });
  };

  const handleStageMonthYearChange = (
    stageId: ProceduralTimelineStageId,
    month: string,
    year: string,
  ) => {
    setTimelineDraftDates((prev) => {
      const next = { ...prev };
      const hasMonth = !!month;
      const hasYear = !!year;
      if (!hasMonth && !hasYear) {
        delete next[stageId];
      } else {
        next[stageId] = { month, year };
      }
      return next;
    });

    const base = ensureProceduralTimeline();
    const existing = Array.isArray(base.stages) ? [...base.stages] : [];
    const idx = existing.findIndex((s) => s.id === stageId);
    let monthYear: string | null = null;
    if (month && year) {
      const mm = month.padStart(2, '0');
      monthYear = `${year}-${mm}`;
    }
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], monthYear };
    } else {
      existing.push({ id: stageId, label: '', include: true, isDynamic: false, monthYear });
    }
    const next: ProceduralTimeline = {
      ...base,
      stages: existing,
    };
    updateData({ proceduralTimeline: next });
  };

  const handlePolicyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64String = (reader.result as string).split(',')[1];
        const extracted = await extractPolicyData(base64String, file.type);
        let updates: Partial<ReportData> = {};
        if (extracted.insuredName) {
          const baseForSubject: Partial<ReportData> = {
            ...updates,
            insuredName: extracted.insuredName,
          };
          // If the current subject was never explicitly edited by the user
          // (isSubjectAuto is not false), we allow auto-overriding it based on
          // the extracted policy metadata.
          const shouldAutoSubject = data.isSubjectAuto !== false;
          updates = maybeAutoFillSubject(
            shouldAutoSubject
              ? { ...baseForSubject, isSubjectAuto: true }
              : baseForSubject,
          );
          // Fallback: if there was no subject at all, ensure we at least use the
          // insured name so that the RE (נדון) line is not empty.
          if (
            shouldAutoSubject &&
            (!data.reportSubject || !data.reportSubject.trim())
          ) {
            updates.reportSubject = extracted.insuredName;
            updates.isSubjectAuto = true;
          }
        }
        if (extracted.marketRef) {
          updates.marketRef = extracted.marketRef;
          updates.lineSlipNo = extracted.marketRef;
        } else if (extracted.lineSlipNo && !updates.lineSlipNo) {
          updates.lineSlipNo = extracted.lineSlipNo;
        }
        if (extracted.certificateRef) updates.certificateRef = extracted.certificateRef;
        if (typeof extracted.policyPeriodStart === 'string') updates.policyPeriodStart = extracted.policyPeriodStart;
        if (typeof extracted.policyPeriodEnd === 'string') updates.policyPeriodEnd = extracted.policyPeriodEnd;
        if (typeof extracted.retroStart === 'string') updates.retroStart = extracted.retroStart;
        if (typeof extracted.retroEnd === 'string') updates.retroEnd = extracted.retroEnd;
        updates.policyFile = { id: 'policy-doc', name: file.name, data: base64String, type: file.type };
        const filledCoverage = fillInsuranceCoverageSection(
          data.content?.['Insurance Coverage'],
          updates.policyPeriodStart || data.policyPeriodStart,
          updates.policyPeriodEnd || data.policyPeriodEnd,
          updates.retroStart || data.retroStart,
          updates.retroEnd || data.retroEnd
        );
        if (filledCoverage) {
          updates.content = { ...data.content, 'Insurance Coverage': filledCoverage };
        }
        updateData(updates);
        setIsExtracting(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error reading file", error);
      setIsExtracting(false);
    }
  };

  const MAX_LAWYER_APPENDICES = 10;
  const MAX_LAWYER_APPENDIX_SIZE_MB = 10;

  const handleLawyerAppendixFilesChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (readOnly) {
      e.preventDefault();
      e.target.value = '';
      return;
    }
    const files = e.target.files;
    if (!files || !files.length) return;

    const existing = data.lawyerAppendixFiles ?? [];
    if (existing.length >= MAX_LAWYER_APPENDICES) {
      alert(`You can attach up to ${MAX_LAWYER_APPENDICES} appendices.`);
      e.target.value = '';
      return;
    }

    const remaining = MAX_LAWYER_APPENDICES - existing.length;
    const selected = Array.from(files).slice(0, remaining);

    const processed: InvoiceFile[] = [];

    for (const file of selected) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_LAWYER_APPENDIX_SIZE_MB) {
        alert(
          `${file.name} is larger than ${MAX_LAWYER_APPENDIX_SIZE_MB}MB and will not be attached.`,
        );
        // skip this file
        // continue to next
        // eslint-disable-next-line no-continue
        continue;
      }

      let mime = file.type;
      if (!mime) {
        if (/\.(tif|tiff)$/i.test(file.name)) {
          mime = 'image/tiff';
        } else {
          mime = 'application/octet-stream';
        }
      }

      const reader = new FileReader();
      const dataBase64: string = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const result = String(reader.result || '');
          const parts = result.split(',');
          resolve(parts[1] || '');
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      processed.push({
        id: `lawyer-appx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        data: dataBase64,
        type: mime,
      });
    }

    if (processed.length) {
      updateData({
        lawyerAppendixFiles: [...existing, ...processed],
      });
    }

    e.target.value = '';
  };

  const handleRemoveLawyerAppendixFile = (id: string) => {
    if (readOnly) return;
    const existing = data.lawyerAppendixFiles ?? [];
    const next = existing.filter((f) => f.id !== id);
    updateData({ lawyerAppendixFiles: next });
  };

  const handlePolicyAnalysisClick = () => {
    if (readOnly) return;
    policyAnalysisInputRef.current?.click();
  };

  const handlePolicyAnalysisFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) {
      event.preventDefault();
      if (event.target) event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    setIsPolicyAnalyzing(true);
    try {
      const base64 = await readFileAsBase64(file);
      const response = await analyzeMedicalComplaint(base64, file.type || 'application/octet-stream');
      const payload: Partial<ReportData> = {
        policyFile: {
          id: `policy-doc-${Date.now()}`,
          name: file.name,
          data: base64,
          type: file.type,
        },
      };
      if (response?.analysis) {
        const updates = buildMedicalAnalysisUpdates(response.analysis, data);
        if (updates) {
          Object.assign(payload, updates);
        }
      }
      updateData(payload);
    } catch (error) {
      console.error(error);
      alert('הניתוח נכשל. נסו קובץ אחר.');
    } finally {
      setIsPolicyAnalyzing(false);
      if (event.target) event.target.value = '';
    }
  };

  const renderInputWithClear = (
    value: string,
    updateField: (val: string) => void,
    placeholder: string,
    onBlurOptional?: (currentValue: string) => void,
  ) => (
    <div className="relative group">
      <input 
        className="w-full border border-borderDark p-2 rounded focus:ring-2 focus:ring-lpBlue outline-none pr-8 bg-white text-slate-900 placeholder:text-slate-500" 
        placeholder={placeholder}
        value={value}
        onChange={readOnly ? undefined : (e) => updateField(e.target.value)}
        onBlur={readOnly ? undefined : (onBlurOptional ? () => onBlurOptional(value) : undefined)}
        disabled={readOnly}
      />
      {value && (
        <button
          type="button"
          onClick={readOnly ? undefined : () => updateField('')}
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 transition-colors ${readOnly ? 'cursor-not-allowed opacity-50' : 'hover:text-red-500'}`}
          disabled={readOnly}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={readOnly ? undefined : onSaveAndExit}
          disabled={readOnly}
          className={`flex items-center text-sm bg-blue-50 px-3 py-1.5 rounded-full ${
            readOnly
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-lpBlue hover:text-blue-900'
          }`}
          title={readOnly ? 'הדוח נעול לעריכה.' : undefined}
        >
          <Home className="w-4 h-4 mr-1" /> חזרה לדשבורד
        </button>
      </div>
      <h2 className="text-3xl font-bold text-lpBlue font-serif border-b pb-2">1. Case Setup & Structure</h2>

      {data.odakanitNo && (
          <div className="bg-indigo-50 border-l-4 border-indigo-600 p-4 mb-6">
             <div className="flex justify-between items-center">
                <div>
                   <h3 className="font-bold text-slate-900 flex items-center"><FolderOpen className="w-5 h-5 mr-2"/> Odakanit Case #{data.odakanitNo}</h3>
                   <p className="text-sm text-indigo-700">This report folder was initiated by Finance.</p>
                </div>
             </div>
          </div>
      )}
      
      <div className="bg-panel p-6 rounded-lg shadow-sm border border-borderDark relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-lpGold"></div>
        <h3 className="font-bold text-lg mb-4 text-textLight flex items-center">
           <FileText className="w-5 h-5 mr-2 text-lpGold" />
           Re: Case Details (Mandatory Fields - English)
        </h3>

        <div className="mb-6 bg-blue-50 border-2 border-dashed border-blue-200 rounded-lg p-4 text-center relative group">
           {isExtracting ? (
             <div className="flex flex-col items-center justify-center py-2">
               <Loader2 className="w-8 h-8 text-lpBlue animate-spin mb-2" />
               <span className="text-sm font-bold text-lpBlue">Analyzing Policy Document...</span>
             </div>
           ) : (
             <>
               {data.policyFile ? (
                 <div className="flex flex-col items-center justify-center gap-3">
                   <div className="flex items-center justify-center gap-3">
                     <div className="flex flex-col items-center text-green-700 font-bold text-center">
                       <div className="flex items-center">
                         <Check className="w-6 h-6 mr-2" />
                         Policy Document Attached
                       </div>
                       <span className="text-xs font-normal text-green-800">
                         Original file: {data.policyFile.name}
                       </span>
                     </div>
                   <button
                      className="text-xs text-red-500 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed"
                      onClick={readOnly ? undefined : () => updateData({ policyFile: undefined })}
                      disabled={readOnly}
                    >
                       Remove
                     </button>
                   </div>
                   <div className="flex items-center justify-center gap-2 text-xs text-textLight bg-panel/70 px-3 py-1 rounded-full border border-borderDark">
                     <input
                       id="attach-policy-appendix"
                       type="checkbox"
                       className="h-3 w-3 accent-lpBlue"
                       checked={data.attachPolicyAsAppendix ?? true}
                       onChange={readOnly ? undefined : (e) =>
                         updateData({ attachPolicyAsAppendix: e.target.checked })
                       }
                       disabled={readOnly}
                     />
                     <label htmlFor="attach-policy-appendix" className="cursor-pointer">
                       Attach policy as Appendix A to final PDF
                     </label>
                   </div>
                 </div>
               ) : (
                 <>
                   <div className={`flex flex-col items-center justify-center text-center px-4 ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                     <Upload className="w-8 h-8 text-lpBlue mb-2 group-hover:scale-110 transition-transform" />
                     <span className="text-sm font-bold text-textLight">Upload Policy Document</span>
                     <span className="text-xs text-textMuted mt-1">
                       Any file uploaded here (PDF/DOCX/scan) is treated as the official policy for this
                       case.
                     </span>
                   </div>
                   <input
                     type="file"
                     className="absolute inset-0 opacity-0 cursor-pointer"
                     accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*"
                     onChange={handlePolicyUpload}
                     disabled={readOnly}
                   />
                 </>
               )}
             </>
           )}
        </div>

        {/* Lawyer appendices (free-form attachments) */}
        <div className="mb-6 mt-4 bg-slate-50 border border-dashed border-borderDark rounded-lg p-4">
          <h4 className="text-sm font-semibold text-textLight mb-2 flex items-center justify-between">
            <span>Additional Appendices (Lawyer)</span>
            <span className="text-[11px] text-textMuted">
              {(data.lawyerAppendixFiles?.length || 0)}/{MAX_LAWYER_APPENDICES}
            </span>
          </h4>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <label
               htmlFor="lawyer-appendix-input"
               className={`flex flex-col items-center justify-center px-3 py-3 border-2 border-dashed border-borderDark rounded-lg text-xs text-textMuted bg-panel transition-colors ${
                 readOnly
                   ? 'cursor-not-allowed opacity-60'
                   : 'cursor-pointer hover:border-lpBlue hover:text-lpBlue'
               }`}
              >
                <Upload className="w-5 h-5 mb-1" />
                <span className="font-semibold">Upload / drag legal appendices</span>
                <span className="mt-1 text-[11px] text-textMuted">
                  Supported: PDF, PNG, JPG, TIFF (up to {MAX_LAWYER_APPENDIX_SIZE_MB}MB per file)
                </span>
                <input
                  id="lawyer-appendix-input"
                  type="file"
                  multiple
                  className="hidden"
                  accept="application/pdf,image/png,image/jpeg,image/jpg,image/tiff,image/x-tiff"
                  onChange={handleLawyerAppendixFilesChange}
                  disabled={readOnly}
                />
              </label>
            </div>
          </div>
          {(data.lawyerAppendixFiles?.length || 0) > 0 && (
            <div className="mt-3 border-t border-borderDark pt-2 space-y-1 max-h-40 overflow-y-auto text-xs text-textLight text-left">
              {data.lawyerAppendixFiles?.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded bg-panel px-2 py-1 border border-borderDark"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{f.name}</div>
                    <div className="text-[11px] text-textMuted truncate">
                      {f.type || 'Unknown type'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={readOnly ? undefined : () => handleRemoveLawyerAppendixFile(f.id)}
                    className="text-[11px] text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                    disabled={readOnly}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
             <label className="text-xs font-bold text-textMuted uppercase flex items-center"><Calendar className="w-3 h-3 mr-1" /> Report Date</label>
             <input 
                type="date" 
                className="w-full border border-borderDark p-2 rounded bg-white text-slate-900 disabled:bg-navySecondary disabled:text-textMuted"
                value={formatDateForInput(data.reportDate)}
                onChange={readOnly ? undefined : (e) => updateData({ reportDate: new Date(e.target.value).toISOString() })}
                disabled={readOnly}
             />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-textMuted uppercase">RE (Subject)</label>
            <input
              type="text"
              className="w-full border border-borderDark p-2 rounded text-sm bg-white text-slate-900 placeholder:text-slate-500 disabled:bg-navySecondary disabled:text-textMuted"
              placeholder="John Doe v. XYZ Medical Center – Claim Update"
              value={data.reportSubject || ''}
              onChange={readOnly ? undefined : (e) =>
                updateData({ reportSubject: e.target.value, isSubjectAuto: false })
              }
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-textMuted uppercase">Odakanit Case Number (Internal File)</label>
            {renderInputWithClear(
              data.odakanitNo || '',
              (val) => updateData({ odakanitNo: val }),
              '1/123',
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-textMuted uppercase">Insurer Name</label>
            <select 
              className="w-full border border-borderDark p-2 rounded bg-white text-slate-900 disabled:bg-navySecondary disabled:text-textMuted"
              value={showCustomInsurerInput ? 'OTHER' : data.insurerName} 
              onChange={readOnly ? undefined : (e) => handleInsurerSelect(e.target.value)} 
              disabled={readOnly}
            >
               <option value="" disabled>-- Select Insurer --</option>
               {INSURER_OPTIONS.map(opt => (
                 <option key={opt} value={opt}>{opt}</option>
               ))}
               <option value="OTHER">Other (Enter Manually)</option>
            </select>
            {showCustomInsurerInput && (
              <div className="mt-2 animate-fade-in">
                 {renderInputWithClear(data.insurerName, (val) => updateData({ insurerName: val }), "Type custom insurer name...")}
              </div>
            )}
          </div>
          {!isExceptionalClient(data.insuredName) && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-textMuted uppercase">{STEP1_FIELD_LABELS.lineSlip}</label>
                {renderInputWithClear(
                  data.lineSlipNo,
                  (val) => updateData({ lineSlipNo: val, marketRef: val }),
                  "B0180PD2391439"
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-textMuted uppercase">{STEP1_FIELD_LABELS.certificate}</label>
                {renderInputWithClear(
                  data.certificateRef || '',
                  (val) => updateData({ certificateRef: val }),
                  "516902624"
                )}
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-textMuted uppercase">Insured Name</label>
            {renderInputWithClear(
              data.insuredName,
              (val) => updateData(maybeAutoFillSubject({ insuredName: val })),
              "Dr. Cohen",
              (currentValue) => {
                const trimmed = (currentValue || '').trim();
                if (!trimmed || !hasHebrew(trimmed)) return;
                if (insuredNameRef.current !== trimmed) return;
                const transliterated = transliterateHebrew(trimmed);
                if (transliterated) updateData(maybeAutoFillSubject({ insuredName: transliterated }));
              },
            )}
          </div>
          <div className="space-y-1 md:col-span-2">
             <div className="flex justify-between items-end mb-1">
               <label className="text-xs font-bold text-textMuted uppercase">Party Name</label>
               <div className="flex bg-navySecondary rounded p-0.5 text-xs">
                  <button className={`px-3 py-1 rounded-sm transition-all font-semibold ${data.plaintiffTitle === 'Plaintiff' ? 'bg-panel shadow text-lpBlue' : 'text-slate-100 hover:text-white'}`} onClick={() => updateData({ plaintiffTitle: 'Plaintiff' })}>Plaintiff</button>
                  <button className={`px-3 py-1 rounded-sm transition-all font-semibold ${data.plaintiffTitle === 'Claimant' ? 'bg-panel shadow text-lpBlue' : 'text-slate-100 hover:text-white'}`} onClick={() => updateData({ plaintiffTitle: 'Claimant' })}>Claimant</button>
               </div>
            </div>
            {renderInputWithClear(
              data.plaintiffName,
              (val) => updateData(maybeAutoFillSubject({ plaintiffName: val })),
              "Mr. Levi",
              (currentValue) => {
                const trimmed = (currentValue || '').trim();
                if (!trimmed || !hasHebrew(trimmed)) return;
                if (plaintiffNameRef.current !== trimmed) return;
                const transliterated = transliterateHebrew(trimmed);
                if (transliterated) updateData(maybeAutoFillSubject({ plaintiffName: transliterated }));
              },
            )}
          </div>
        </div>
      </div>

      <div className="bg-panel p-6 rounded-lg shadow-sm border border-borderDark">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-lg text-textLight flex items-center">
              <History className="w-5 h-5 mr-2 text-lpBlue" />
              Procedural Timeline
            </h3>
            <p className="text-sm text-textMuted">
              בחרי את סוג ההליך, השלב הנוכחי ותאריכי חודש/שנה שיופיעו בציר הזמנים בדיווח.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-textMuted mb-1">
            Procedure Type
          </label>
          <select
            className="border border-borderDark rounded px-3 py-1 text-sm bg-white text-slate-900"
            value={data.proceduralTimeline?.procedureType || 'FIRST_INSTANCE'}
            onChange={(e) => handleProcedureTypeChange(e.target.value as ProceduralProcedureType)}
          >
            {PROCEDURE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {!data.proceduralTimeline && isLegacyReport && (
          <div className="border border-dashed border-borderDark rounded-md p-3 bg-navySecondary text-xs text-textLight">
            <p className="mb-2">
              This report uses the legacy timeline. You can enable the new Procedural Timeline (recommended for new reports).
            </p>
            <button
              type="button"
              className="inline-flex items-center px-3 py-1 rounded-full bg-navy text-gold text-[11px] font-semibold hover:bg-navySecondary"
              onClick={() => updateData({ proceduralTimeline: ensureProceduralTimeline() })}
            >
              Enable Procedural Timeline
            </button>
          </div>
        )}

        {data.proceduralTimeline && (
          <div className="space-y-3">
            {PROCEDURAL_STAGE_CONFIG[data.proceduralTimeline.procedureType].map((stage) => {
              const state =
                data.proceduralTimeline?.stages?.find((s) => s.id === stage.id) || undefined;
              const draft = timelineDraftDates[stage.id];
              const isDynamic = !!stage.isDynamic;
              const include = isDynamic ? !!state?.include : true;
              const monthYear = state?.monthYear || '';
              let month = '';
              let year = '';
              if (draft) {
                month = draft.month || '';
                year = draft.year || '';
              } else if (typeof monthYear === 'string' && monthYear.includes('-')) {
                const [y, m] = monthYear.split('-');
                if (y && m) {
                  year = y;
                  month = m;
                }
              }
              const isCurrent = data.proceduralTimeline?.currentStageId === stage.id;

              return (
                <div
                  key={stage.id}
                  className="flex items-start justify-between border border-borderDark rounded-lg px-3 py-2 bg-panel"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="currentStage"
                      className="mt-1"
                      checked={isCurrent}
                      disabled={!include}
                      onChange={() => include && handleCurrentStageSelect(stage.id)}
                    />
                    <div>
                      <div className="font-semibold text-sm text-textLight flex items-center gap-2">
                        <span>{stage.label}</span>
                        {isDynamic && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-navySecondary text-textMuted">
                            Dynamic
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-textMuted flex-wrap">
                        <span>Month / Year:</span>
                        <select
                          className="border border-borderDark rounded px-2 py-0.5 text-xs bg-white text-slate-900"
                          value={month}
                          disabled={!include}
                          onChange={(e) =>
                            handleStageMonthYearChange(stage.id, e.target.value, year)
                          }
                        >
                          <option value="">–</option>
                          <option value="01">January</option>
                          <option value="02">February</option>
                          <option value="03">March</option>
                          <option value="04">April</option>
                          <option value="05">May</option>
                          <option value="06">June</option>
                          <option value="07">July</option>
                          <option value="08">August</option>
                          <option value="09">September</option>
                          <option value="10">October</option>
                          <option value="11">November</option>
                          <option value="12">December</option>
                        </select>
                        <input
                          type="number"
                          className="w-20 border border-borderDark rounded px-2 py-0.5 text-xs bg-white text-slate-900"
                          placeholder="Year"
                          value={year}
                          disabled={!include}
                          onChange={(e) =>
                            handleStageMonthYearChange(stage.id, month, e.target.value)
                          }
                          min={1900}
                          max={2100}
                        />
                      </div>
                    </div>
                  </div>
                  {isDynamic && (
                    <div className="flex items-center gap-1 text-xs text-textMuted">
                      <span>Include</span>
                      <input
                        type="checkbox"
                        checked={include}
                        onChange={(e) => handleDynamicStageToggle(stage.id, e.target.checked)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-panel p-6 rounded-lg shadow-sm border border-borderDark">
        <h3 className="font-bold text-lg mb-4 text-textLight flex items-center">
           <ListPlus className="w-5 h-5 mr-2 text-green-600" />
           Current Report Sections
        </h3>
        <div className="space-y-2 mb-6">
          {data.selectedSections.map((sec, index) => {
            const canMoveUp = index > 0;
            const canMoveDown = index < data.selectedSections.length - 1;
            const hasFinanceExpenses = Boolean(data.expensesSheetId || (data as any).expensesHtml);
            const isCanonicalExpenses = hasFinanceExpenses && isCanonicalExpensesSection(sec);
            const isFixed = sec === 'Update' || isCanonicalExpenses;
            return (
            <div key={`${sec}-${index}`} className="flex items-center justify-between p-3 bg-panel border border-borderDark rounded shadow-sm">
                 <div className="flex items-center gap-2">
                   <span className="w-6 h-6 rounded-full bg-navySecondary text-textMuted flex items-center justify-center text-xs font-bold">{index + 1}</span>
                 <span className="font-medium text-textLight">{sec}</span>
                   {sec === 'Update' && (
                     <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                       Fixed
                     </span>
                   )}
                   {isCanonicalExpenses && (
                     <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                       מנוהל ע״י הנהלת חשבונות
                     </span>
                   )}
               </div>
                 <div className="flex items-center gap-2">
                   <div className="flex flex-col gap-1">
                     <button
                       onClick={() => moveSection(index, 'UP')}
                       disabled={!canMoveUp}
                       className={`p-1 rounded border ${canMoveUp ? 'text-textMuted hover:bg-navySecondary' : 'text-gray-300 cursor-not-allowed'}`}
                       title="הזז למעלה"
                     >
                       <ChevronUp className="w-4 h-4" />
                     </button>
                     <button
                       onClick={() => moveSection(index, 'DOWN')}
                       disabled={!canMoveDown}
                       className={`p-1 rounded border ${canMoveDown ? 'text-textMuted hover:bg-navySecondary' : 'text-gray-300 cursor-not-allowed'}`}
                       title="הזז למטה"
                     >
                       <ChevronDown className="w-4 h-4" />
                     </button>
                   </div>
                   {!isFixed && (
                     <button onClick={() => removeSection(sec)} className="p-2 rounded-md text-textMuted hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-400/40 transition" title="הסר סעיף">
                       <X className="w-4 h-4" />
                     </button>
               )}
            </div>
              </div>
            );
          })}
        </div>
        {!isAddingSection ? (
          <button onClick={() => setIsAddingSection(true)} className="w-full py-2 border-2 border-dashed border-borderDark text-textMuted rounded hover:border-green-500 hover:text-green-600 transition flex items-center justify-center font-medium">
            <Plus className="w-4 h-4 mr-2" /> Add Report Section
          </button>
        ) : (
          <div className="bg-navySecondary p-4 rounded border animate-fade-in">
             <div className="flex gap-2">
                <select className="flex-1 border p-2 rounded" onChange={(e) => addSection(e.target.value)} defaultValue="">
                  <option value="" disabled>-- Select a Header --</option>
                  {AVAILABLE_SECTIONS.filter(s => !data.selectedSections.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => setIsAddingSection(false)} className="px-4 py-2 bg-borderDark text-textMuted rounded hover:bg-borderDark">Cancel</button>
             </div>
             <div className="mt-4 pt-4 border-t border-borderDark">
                <div className="flex gap-2">
                  <input className="flex-1 border p-2 rounded" placeholder="Type custom header name..." value={newCustomSection} onChange={e => setNewCustomSection(e.target.value)} />
                  <button onClick={() => { addCustomSection(); setIsAddingSection(false); }} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Add Custom</button>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <button onClick={onSaveAndExit} className="flex items-center text-textMuted px-4 py-2 border rounded hover:bg-navySecondary transition">
          <ChevronLeft className="mr-2 w-4 h-4" /> Back to Dashboard
        </button>
        <button onClick={handleNextWithValidation} className="flex items-center bg-navy text-gold px-6 py-2 rounded hover:bg-navySecondary transition shadow-md">
          Next Step <ChevronRight className="ml-2 w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// --- STEP 2: Content Entry ---
type Step2ContentProps = StepProps & {
  step1Focus?: 'REVIEW' | 'EXTERNAL_FEEDBACK' | null;
  onStep1FocusConsumed?: () => void;
  isTranslating?: boolean;
  isImprovingEnglish?: boolean;
  onOpenAssistant?: () => void;
  onActiveSectionChange?: (sectionKey: string) => void;
  showToast?: (opts: { message: string; type: 'success'|'error'|'info' }) => void;
};

// Shared helper: compute a simple hash/fingerprint for the Hebrew content
// so we can detect when the translation might be stale.
const computeTranslationBaseHash = (
  content: Record<string, string> | undefined | null,
): string | null => {
  if (!content) return null;
  try {
    const json = JSON.stringify(content);
    // hashCode‑style פשוט: לא קריפטוגרפי, רק לזיהוי שינויי טקסט
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
      const chr = json.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      // eslint-disable-next-line no-bitwise
      hash |= 0; // Convert to 32bit integer
    }
    return String(hash);
  } catch {
    return null;
  }
};

const Step2_Content: React.FC<Step2ContentProps> = ({
  data,
  updateData,
  onBack,
  onNext,
  currentUser,
  onSaveAndExit,
  onSaveDraft,
  onTranslate,
  onImproveEnglish,
  onFormatContent,
  onSubmitHebrewForReview,
  onApproveHebrewForTranslation,
  onAddReviewIssues,
  onMarkReviewIssueDone,
  onAddExternalFeedbackIssues,
  onReopenHebrewDueToExternalFeedback,
  step1Focus,
  onStep1FocusConsumed,
  isTranslating,
  isImprovingEnglish,
  onOpenAssistant,
  onActiveSectionChange,
  readOnly,
  showToast: showToastProp,
}) => {
  const CLAIM_SECTION_KEY = CLAIM_SECTION_LABEL;
  const DEMAND_SECTION_KEY = DEMAND_LETTER_SECTION_LABEL;
  const [expandedSnippetSection, setExpandedSnippetSection] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const showToast = showToastProp ?? (() => {});
  const [allSectionTemplates, setAllSectionTemplates] = useState<SectionTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [templateManagerSection, setTemplateManagerSection] = useState<string>(() => AVAILABLE_SECTIONS[0] || 'Update');
  const [toneRiskIssues, setToneRiskIssues] = useState<ToneRiskIssue[]>([]);
  const [isToneRiskRunning, setIsToneRiskRunning] = useState(false);
  const [toneRiskLastRunAt, setToneRiskLastRunAt] = useState<string | null>(null);
  const [toneRiskMeta, setToneRiskMeta] = useState<{
    sectionsSent: number;
    charsBefore: number;
    charsAfter: number;
    truncatedSections: number;
  } | null>(null);
  const [lastToneRiskApply, setLastToneRiskApply] = useState<{
    sectionKey: string;
    prevText: string;
  } | null>(null);
  const [hebrewStyleIssues, setHebrewStyleIssues] = useState<HebrewStyleIssue[]>([]);
  const [isHebrewStyleRunning, setIsHebrewStyleRunning] = useState(false);
  const [hebrewStyleLastRunAt, setHebrewStyleLastRunAt] = useState<string | null>(null);
  const [hebrewRefineMode, setHebrewRefineMode] = useState<HebrewRefineMode>('SAFE_POLISH');
  const [hebrewRefineDiff, setHebrewRefineDiff] = useState<{
    sectionKey: string;
    tokens: DiffToken[];
    changedWords: number;
    expiresAt: number;
    open: boolean;
  } | null>(null);
  const [bestPractices, setBestPractices] = useState<BestPracticeSnippet[]>([]);
  const [bestPracticeTab, setBestPracticeTab] = useState<
    'TEMPLATES' | 'BEST_PRACTICES' | 'MY_SNIPPETS'
  >('TEMPLATES');
  const [bestPracticeSearch, setBestPracticeSearch] = useState<string>('');
  const [isBestPracticeManagerOpen, setIsBestPracticeManagerOpen] = useState(false);
  const [bestPracticeManagerSection, setBestPracticeManagerSection] = useState<string>(() => AVAILABLE_SECTIONS[0] || 'Update');
  const [bestPracticeDraft, setBestPracticeDraft] = useState<{
    sectionKey: string;
    body: string;
  } | null>(null);
  const [mySnippets, setMySnippets] = useState<PersonalSnippet[]>(() =>
    loadPersonalSnippets(currentUser.id),
  );
  const [mySnippetSearch, setMySnippetSearch] = useState('');
  const [isMySnippetsManagerOpen, setIsMySnippetsManagerOpen] = useState(false);
  const [mySnippetDraft, setMySnippetDraft] = useState<{
    id?: string;
    title: string;
    sectionKey: string;
    tagsInput: string;
    body: string;
  } | null>(null);
  const [englishViewMode, setEnglishViewMode] = useState<'DUAL' | 'ENGLISH_ONLY'>('DUAL');
  const [medicalTarget, setMedicalTarget] = useState<{
    section?: string;
    mode: 'SECTION' | 'POLICY' | 'INVOICE' | 'EXPENSE_SOURCE' | 'EXPENSES';
    analysisType?: SectionAnalysisType;
    domain?: 'general' | 'dental';
  } | null>(null);
  const [medicalProcessingTarget, setMedicalProcessingTarget] = useState<string | null>(null);
  const [refiningSection, setRefiningSection] = useState<string | null>(null);
  const [expensesUploadMenu, setExpensesUploadMenu] = useState<string | null>(null);
  const [improvingSectionKey, setImprovingSectionKey] = useState<string | null>(null);
  const medicalFileInputRef = useRef<HTMLInputElement | null>(null);
  const invoiceUploadRef = useRef<HTMLInputElement | null>(null);
  const sectionTextareaRefs = useRef<Record<string, React.RefObject<HTMLTextAreaElement>>>({});
  
  // Expense Editor State
  const [newExpense, setNewExpense] = useState<Partial<ExpenseItem>>({ date: new Date().toISOString().split('T')[0], description: '', amount: 0, currency: 'NIS' });

  const isRestrictedUser =
    currentUser.role === 'FINANCE' ||
    (currentUser.role === 'SUB_ADMIN' && !SUB_ADMIN_CAN_EDIT_REPORT_BODY);
  const hasExpensesSection = data.selectedSections.some((section) =>
    section.toLowerCase().includes('expenses')
  );
  // Show the finance warning only when the lawyer is required to handle expenses
  // and the current report actually contains an expenses-related section.
  const shouldWarnExpenses =
    currentUser.role === 'LAWYER' && data.requiresExpenses === true && hasExpensesSection;
  const canEditEnglish = currentUser.role === 'ADMIN' && data.isTranslated;
  const canInsertWorksheet = currentUser.role === 'LAWYER' || currentUser.role === 'ADMIN';
  const canManageExpenses =
    currentUser.role === 'FINANCE' ||
    currentUser.role === 'SUB_ADMIN' ||
    currentUser.role === 'ADMIN';
  const canTranslateNow =
    data.reportReview?.status === 'APPROVED' || data.hebrewWorkflowStatus === 'HEBREW_APPROVED';

  const translatedMap = data.translatedContent || {};
  const hasEnglishToImprove = Object.keys(translatedMap).some((key) => {
    if (key.toLowerCase().includes('expenses')) return false;
    const val = translatedMap[key];
    return typeof val === 'string' && val.trim().length > 0;
  });

  useEffect(() => {
    setMySnippets(loadPersonalSnippets(currentUser.id));
  }, [currentUser.id]);

  const handleImproveSection = async (sectionKey: string) => {
    if (readOnly) return;
    if (!canEditEnglish || !data.isTranslated) return;
    if (sectionKey.toLowerCase().includes('expenses')) return;

    const current = data.translatedContent?.[sectionKey] || '';
    if (!current.trim()) return;

    setImprovingSectionKey(sectionKey);
    try {
      const { protectedText, map } = protectFacts(current);
      const improvedRaw = await improveEnglishText(protectedText);
      const restored = restoreFacts(improvedRaw || protectedText, map);
      const withGlossary = applyEnglishGlossary(restored);
      const nextTranslated: Record<string, string> = {
        ...(data.translatedContent || {}),
        [sectionKey]: formatParagraphContent(withGlossary),
      };
      updateData({ translatedContent: nextTranslated });
      if (typeof onSaveDraft === 'function') {
        onSaveDraft();
      }
    } catch (error) {
      console.error('Improve English (single section) failed', error);
      const displayTitle = getSectionDisplayTitle(sectionKey, data.expertSummaryMode?.[sectionKey]);
      window.alert(`שיפור האנגלית בסעיף "${displayTitle}" נכשל. הטקסט בסעיף זה נשאר ללא שינוי.`);
    } finally {
      setImprovingSectionKey((prev) => (prev === sectionKey ? null : prev));
    }
  };

  const isInitialReport = (report: ReportData): boolean =>
    typeof report.reportNumber === 'number' && report.reportNumber === 1;
  const getSectionAnalysisType = (section: string): SectionAnalysisType => {
    if (isExpertSection(section)) return 'EXPERT';
    if (section === DEMAND_SECTION_KEY) return 'DEMAND';
    return 'CLAIM';
  };

  useEffect(() => {
    if (!step1Focus) return;

    const tryScroll = () => {
      let targetId: string | null = null;

      if (step1Focus === 'EXTERNAL_FEEDBACK') {
        targetId = EXTERNAL_FEEDBACK_PANEL_ID;
      } else if (step1Focus === 'REVIEW') {
        targetId = REPORT_REVIEW_PANEL_ID;
      }

      let el: HTMLElement | null = null;
      if (targetId) {
        el = document.getElementById(targetId);
      }

      // Fallback: אם לא נמצא יעד ספציפי, נסה לפחות את פאנל הביקורת הכללי
      if (!el) {
        el = document.getElementById(REPORT_REVIEW_PANEL_ID);
      }

      if (el) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          // ignore scroll errors
        }
      }

      onStep1FocusConsumed && onStep1FocusConsumed();
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const elNow =
          (step1Focus === 'EXTERNAL_FEEDBACK' &&
            document.getElementById(EXTERNAL_FEEDBACK_PANEL_ID)) ||
          document.getElementById(REPORT_REVIEW_PANEL_ID);

        if (elNow) {
          try {
            elNow.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch {
            // ignore scroll errors
          }
          onStep1FocusConsumed && onStep1FocusConsumed();
        } else {
          setTimeout(tryScroll, 0);
        }
      });
    } else {
      tryScroll();
    }
  }, [step1Focus, onStep1FocusConsumed]);

  const handleAddExpense = () => {
    if (readOnly) return;
    if (!canManageExpenses) return;
    if (!newExpense.description || !newExpense.amount) return;
    const newItem: ExpenseItem = {
      id: Date.now().toString(),
      date: newExpense.date || '',
      description: newExpense.description,
      amount: Number(newExpense.amount),
      currency: newExpense.currency || 'NIS'
    };
    const updatedItems = [...data.expensesItems, newItem];
    const sum = updatedItems.reduce((acc, item) => acc + item.amount, 0);
    
    updateData({ 
      expensesItems: updatedItems,
      expensesSum: sum.toLocaleString()
    });
    setNewExpense({ date: new Date().toISOString().split('T')[0], description: '', amount: 0, currency: 'NIS' });
  };

  const removeExpense = (id: string) => {
    if (readOnly) return;
    const updatedItems = data.expensesItems.filter(i => i.id !== id);
    const sum = updatedItems.reduce((acc, item) => acc + item.amount, 0);
    updateData({ 
      expensesItems: updatedItems,
      expensesSum: sum.toLocaleString()
    });
  };

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const files = e.target.files;
    if (!files) return;
    const existingCount = data.invoiceFiles.length;
    if (existingCount >= 4) {
      showToast({ message: 'ניתן לצרף עד 4 חשבוניות מס (PDF או Word).', type: 'info' });
      e.target.value = '';
      return;
    }
    const allowedFiles = Array.from(files).slice(0, 4 - existingCount);
    const newInvoices: InvoiceFile[] = [];
    for (let i = 0; i < allowedFiles.length; i++) {
      const file = allowedFiles[i];
      const reader = new FileReader();
      await new Promise<void>(resolve => {
        reader.onload = (ev) => {
          newInvoices.push({
             id: `inv-${Date.now()}-${i}`,
             name: file.name,
             data: (ev.target?.result as string).split(',')[1],
             type: file.type
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    
    const invoiceFiles = [...data.invoiceFiles, ...newInvoices];
    const hasInvoices = invoiceFiles.length > 0;
    const shouldAdvanceStatus = canManageExpenses && data.status === 'WAITING_FOR_INVOICES' && hasInvoices;
    const nextStatus = shouldAdvanceStatus ? 'TASK_ASSIGNED' : data.status;
    updateData({
      invoiceFiles,
      isWaitingForInvoices: !hasInvoices,
      status: nextStatus,
    });
    showToast({ message: "החשבוניות צורפו בהצלחה (עד 4 קבצים).", type: "success" });
  };

  const removeInvoice = (id: string) => {
    const invoiceFiles = data.invoiceFiles.filter(f => f.id !== id);
    const hasInvoices = invoiceFiles.length > 0;
    const shouldRevertStatus = canManageExpenses && !hasInvoices && data.status === 'TASK_ASSIGNED';
    const nextStatus = shouldRevertStatus ? 'WAITING_FOR_INVOICES' : data.status;
    updateData({
      invoiceFiles,
      isWaitingForInvoices: !hasInvoices,
      status: nextStatus,
    });
  };

  const handleContentChange = (section: string, text: string) => {
    if (isRestrictedUser) return; 
    updateData({ content: { ...data.content, [section]: text } });
  };

  const processSnippetText = (raw: string) =>
    raw
      .replace(/{plaintiff}/g, data.plaintiffName || 'התובע')
      .replace(/{insured}/g, data.insuredName || 'המבוטח')
      .replace(/\[DATE\]/g, new Date().toLocaleDateString('he-IL'));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const templates = await loadSectionTemplates();
        if (!cancelled) {
          setAllSectionTemplates(templates);
        }
      } catch (err) {
        console.error('Failed to load templates', err);
      }
      try {
        const bp = await loadBestPractices();
        if (!cancelled) setBestPractices(bp);
      } catch (err) {
        console.error('Failed to load best practices', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTranslatedChange = (section: string, text: string) => {
    if (!canEditEnglish) return;
    updateData({ translatedContent: { ...data.translatedContent, [section]: text } });
  };

  const insertSnippet = (section: string, snippet: string) => {
    if (isRestrictedUser) return;
    const processed = processSnippetText(snippet);
    const current = data.content[section] || '';
    handleContentChange(section, current ? `${current}\n\n${processed}` : processed);
    setExpandedSnippetSection(null); 
  };

  const getTemplatesForSection = (section: string): SectionTemplate[] => {
    return allSectionTemplates
      .filter((t) => t.sectionKey === section && t.isEnabled !== false)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.createdAt.localeCompare(b.createdAt));
  };

  const applyTemplateToSection = (section: string, template: SectionTemplate) => {
    if (isRestrictedUser) return;
    let processed = template.body
      .replace(/{plaintiff}/g, data.plaintiffName || 'the claimant')
      .replace(/{insured}/g, data.insuredName || 'the insured')
      .replace(/\[DATE\]/g, new Date().toLocaleDateString('he-IL'));
    const current = data.content[section] || '';
    handleContentChange(section, current ? `${current}\n\n${processed}` : processed);
    setExpandedSnippetSection(null);
  };

  const handleToggleTemplatesPanel = async (section: string) => {
    try {
      const fresh = await loadSectionTemplates();
      setAllSectionTemplates(fresh);
    } catch (err) {
      console.error('Failed to refresh templates', err);
    }
    setTemplateSearch('');
    setBestPracticeSearch('');
    setExpandedSnippetSection((prev) => (prev === section ? null : section));
  };

  const handleSaveSelectionAsTemplate = async (section: string) => {
    if (currentUser.role !== 'ADMIN') return;
    const refEntry = sectionTextareaRefs.current[section];
    const el = refEntry?.current;
    if (!el) {
      showToast({ message: 'לא נמצאה בחירה בטקסט בסעיף זה.', type: 'error' });
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      showToast({ message: 'בחר טקסט בסעיף לפני שמירה כתבנית.', type: 'info' });
      return;
    }
    const fullText = data.content[section] || '';
    let selected = fullText.slice(start, end).trim();
    if (!selected) {
      showToast({ message: 'הבחירה ריקה לאחר ניקוי רווחים.', type: 'info' });
      return;
    }
    if (selected.length < 15) {
      const confirmShort = window.confirm('הטקסט שנבחר קצר מאוד. לשמור כתבנית בכל זאת?');
      if (!confirmShort) return;
    }
    const defaultTitle = selected.split(/\s+/).slice(0, 6).join(' ');
    const input = window.prompt('כותרת לתבנית:', defaultTitle);
    const title = (input || '').trim();
    if (!title) {
      showToast({ message: 'התבנית לא נשמרה (כותרת נדרשת).', type: 'info' });
      return;
    }
    const nowIso = new Date().toISOString();
    const newTemplate: SectionTemplate = {
      id: '', // server will assign id
      sectionKey: section,
      title,
      body: selected,
      createdByUserId: currentUser.id,
      createdAt: nowIso,
      updatedAt: nowIso,
      isEnabled: true,
    };
    try {
      const updated = await upsertSectionTemplateInStore(newTemplate, currentUser.role);
      setAllSectionTemplates(updated);
      showToast({ message: 'התבנית נשמרה בהצלחה.', type: 'success' });
    } catch (err) {
      console.error('Failed to save template', err);
      showToast({ message: 'שמירת התבנית נכשלה.', type: 'error' });
    }
  };

  const handleTemplateFieldChange = async (id: string, patch: Partial<SectionTemplate>) => {
    if (currentUser.role !== 'ADMIN') return;
    const existing = allSectionTemplates.find((t) => t.id === id);
    if (!existing) return;
    const updatedTemplate: SectionTemplate = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    try {
      const updated = await upsertSectionTemplateInStore(updatedTemplate, currentUser.role);
      setAllSectionTemplates(updated);
    } catch (err) {
      console.error('Failed to update template', err);
      showToast({ message: 'עדכון התבנית נכשל.', type: 'error' });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (currentUser.role !== 'ADMIN') return;
    try {
      const updated = await deleteSectionTemplateInStore(id, currentUser.role);
      setAllSectionTemplates(updated);
    } catch (err) {
      console.error('Failed to delete template', err);
      showToast({ message: 'מחיקת התבנית נכשלה.', type: 'error' });
    }
  };

  const handleReorderTemplate = async (id: string, direction: 'UP' | 'DOWN') => {
    if (currentUser.role !== 'ADMIN') return;
    try {
      const updated = await reorderSectionTemplateInStore(id, direction, currentUser.role);
      setAllSectionTemplates(updated);
    } catch (err) {
      console.error('Failed to reorder template', err);
      showToast({ message: 'עדכון סדר התבניות נכשל.', type: 'error' });
    }
  };

  const computeChangeRatioLabel = (before: string, after: string): string => {
    if (!before || !after || before === after) return 'ללא שינוי מורגש';
    const beforeWords = before.split(/\s+/).filter(Boolean);
    const afterWords = after.split(/\s+/).filter(Boolean);
    if (!beforeWords.length || !afterWords.length) return 'ללא שינוי מורגש';
    const maxLen = Math.max(beforeWords.length, afterWords.length) || 1;
    let diffCount = 0;
    const minLen = Math.min(beforeWords.length, afterWords.length);
    for (let i = 0; i < minLen; i += 1) {
      if (beforeWords[i] !== afterWords[i]) {
        diffCount += 1;
      }
    }
    diffCount += Math.abs(beforeWords.length - afterWords.length);
    const ratio = diffCount / maxLen;
    if (ratio < 0.05) return 'שינוי קל מאוד';
    if (ratio < 0.15) return 'שינוי קל';
    if (ratio < 0.35) return 'שינוי בינוני';
    return 'שינוי משמעותי';
  };

  const handleRefineText = async (section: string) => {
    if (isRestrictedUser) return;
    const current = data.content[section];
    if (!current) return;
    setRefiningSection(section);
    setIsAiProcessing(true);
    try {
      const result = await refineLegalText(current, hebrewRefineMode);
      if (result.factProtectionBlocked) {
        showToast({
          message: 'השכתוב נחסם מטעמי בטיחות (שמירת עובדות). הטקסט נשאר ללא שינוי.',
          type: 'info',
        });
        return;
      }
      const refined = result.text;
      const label = computeChangeRatioLabel(current, refined);
      const tokens = diffWords(current, refined);
      const changedWords = tokens.filter(
        (t) => t.type === 'add' || t.type === 'remove',
      ).length;
      if (changedWords > 0) {
        const expiresAt = Date.now() + 20000;
        setHebrewRefineDiff({
          sectionKey: section,
          tokens,
          changedWords,
          expiresAt,
          open: false,
        });
        setTimeout(() => {
          setHebrewRefineDiff((prev) =>
            prev && prev.sectionKey === section && prev.expiresAt === expiresAt
              ? null
              : prev,
          );
        }, 20000);
      } else {
        setHebrewRefineDiff(null);
      }
      showToast({
        message: `שכתוב עברית (${hebrewRefineMode === 'SAFE_POLISH' ? 'SAFE_POLISH' : 'REWRITE'}): ${label}`,
        type: 'success',
      });
      handleContentChange(section, refined);
    } catch (err) {
      console.error('Refine text failed', err);
      showToast({ message: 'שדרוג הניסוח נכשל. הטקסט לא שונה.', type: 'error' });
    } finally {
      setIsAiProcessing(false);
      setRefiningSection(null);
    }
  };

  const handleExpensesFileExtraction = async (fileName: string, base64: string, mimeType: string) => {
         setIsAiProcessing(true);
    try {
      const extracted = await extractExpensesTable(base64, mimeType);
      if (extracted.items?.length) {
             const updatedItems = [...data.expensesItems, ...extracted.items];
             const sum = updatedItems.reduce((acc: number, item: any) => acc + (item.amount || 0), 0);
             updateData({ expensesItems: updatedItems, expensesSum: sum.toLocaleString() });
        showToast({ message: `טבלת ההוצאות "${fileName}" נותחה בהצלחה.`, type: 'success' });
      } else {
        showToast({ message: 'לא נמצאו הוצאות בקובץ שסופק.', type: 'info' });
         }
    } catch (error) {
      console.error('Expenses extraction failed', error);
      showToast({ message: 'העיבוד נכשל. נסו קובץ PDF/Word אחר.', type: 'error' });
    } finally {
         setIsAiProcessing(false);
       }
    };

  const getFileBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const applyMedicalAnalysisToSections = (analysis: MedicalComplaintAnalysis) => {
    if (!analysis) return;
    const nextSections = [...data.selectedSections];
    const ensureSection = (section: string) => {
      if (!nextSections.includes(section)) nextSections.push(section);
    };
    const bulletList = (items?: string[]) => items && items.length
      ? items.map((item) => `• ${item}`).join('\n')
      : '';
    const timelineText = analysis.timeline?.length
      ? analysis.timeline
          .map((entry) => `• ${(entry?.date || 'תאריך לא צוין')} – ${entry?.event || ''}`)
          .join('\n')
      : '';
    const newContent = { ...data.content };

    if (analysis.briefSummary || timelineText || (analysis.injuries?.length)) {
      ensureSection('Update');
      const injuryText = bulletList(analysis.injuries);
      const reliefText = bulletList(analysis.requestedRelief);
      const parts = [
        analysis.briefSummary || '',
        injuryText ? `\nפגיעות נטענות:\n${injuryText}` : '',
        reliefText ? `\nסעדים מבוקשים:\n${reliefText}` : '',
        timelineText ? `\nציר זמן:\n${timelineText}` : ''
      ].filter(Boolean);
      newContent['Update'] = parts.join('\n').trim();
    }

    if (analysis.facts?.length) {
      const sectionKey = CLAIM_SECTION_LABEL;
      ensureSection(sectionKey);
      newContent[sectionKey] = bulletList(analysis.facts);
    }

    const strategyParts: string[] = [];
    if (analysis.allegations?.length) strategyParts.push(`טענות מרכזיות:\n${bulletList(analysis.allegations)}`);
    if (analysis.negligenceTheory?.length) strategyParts.push(`עילות רשלנות:\n${bulletList(analysis.negligenceTheory)}`);
    if (analysis.medicalFindings?.length) strategyParts.push(`ממצאים רפואיים:\n${bulletList(analysis.medicalFindings)}`);
    if (strategyParts.length) {
      const sectionKey = data.selectedSections.includes('Strategy & Recommendations') ? 'Strategy & Recommendations' : 'Strategy';
      ensureSection(sectionKey);
      newContent[sectionKey] = strategyParts.join('\n\n');
    }

    if (analysis.riskAssessment) {
      ensureSection('Risk Assessment');
      newContent['Risk Assessment'] = analysis.riskAssessment;
    }

    const recParts: string[] = [];
    if (analysis.recommendedActions?.length) recParts.push(bulletList(analysis.recommendedActions));
    if (analysis.requestedRelief?.length) recParts.push(`סעדים מבוקשים:\n${bulletList(analysis.requestedRelief)}`);
    if (recParts.length) {
      ensureSection('Recommendations');
      newContent['Recommendations'] = recParts.join('\n\n');
    }

    updateData({ content: newContent, selectedSections: nextSections, complaintAnalysis: analysis });
    showToast({ message: 'המסמך נותח והמידע נוסף לסעיפים הרלוונטיים.', type: 'success' });
  };

  const buildClaimSummaryFromAnalysis = (
    analysis?: MedicalComplaintAnalysis | null,
    context?: { section?: string; analysisType?: SectionAnalysisType }
  ) => {
    if (!analysis) return '';

    const variant: SectionAnalysisType =
      context?.analysisType === 'DEMAND' || context?.section === DEMAND_SECTION_KEY ? 'DEMAND' : 'CLAIM';

    const subjectLabel = variant === 'DEMAND' ? 'הדורשת' : 'התובעת';
    const actionLabel = variant === 'DEMAND' ? 'פנתה במכתב דרישה אל' : 'הגישה תביעה נגד';

    const plaintiffName = analysis.entities?.plaintiff?.trim();
    const defendants = (analysis.defendants || []).filter(Boolean).join(', ');

    const openingParts: string[] = [];
    openingParts.push(plaintiffName ? `${subjectLabel}, ${plaintiffName}` : subjectLabel);
    if (defendants) openingParts.push(`${actionLabel} ${defendants}`);

    const openingSentence = `${openingParts.join(' ')}.`.replace(/\s+/g, ' ').trim();

    const buildNumberedBlock = (title: string, entries: string[], fallback?: string, omitWhenEmpty = false) => {
      const cleanedEntries = entries.map((e) => (e || '').trim()).filter(Boolean);
      if (!cleanedEntries.length && omitWhenEmpty) return '';
      const list = cleanedEntries.length ? cleanedEntries : fallback ? [fallback] : [];
      if (!list.length) return '';
      const body = list.map((entry, idx) => `${idx + 1}. ${entry}`.trim()).join('\n');
      return `${title}\n${body}`.trim();
    };

    // Timeline lines – aim for: [date] — actor — event — location — result
    const timelineEntries: string[] =
      (analysis.timeline || [])
        .map((entry: any) => {
          if (!entry?.event && !entry?.date) return '';

          const dateRaw = (entry?.date || '').toString().trim();
          const datePart = dateRaw ? dateRaw : 'ללא תאריך';

          const actorRaw =
            (entry?.actor || '').toString().trim() ||
            (analysis.entities?.plaintiff || '').toString().trim() ||
            subjectLabel;

          const locationRaw =
            (entry?.location || '').toString().trim() ||
            (analysis.entities as any)?.institution?.toString?.().trim?.() ||
            '';

          const eventText = (entry?.event || '').toString().trim();
          const resultText = (entry?.result || '').toString().trim();

          const parts: string[] = [];
          parts.push(datePart);
          parts.push(`— ${actorRaw}`);
          if (eventText) parts.push(`— ${eventText}`);
          if (locationRaw) parts.push(`— ${locationRaw}`);
          if (resultText) parts.push(`— ${resultText}`);

          return parts.join(' ').replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean) || [];

    const factsFallback = (analysis.facts || []).filter(Boolean);
    const eventsLines = timelineEntries.length ? timelineEntries : factsFallback;

    const eventsTitle =
      variant === 'DEMAND'
        ? 'להלן השתלשלות האירועים, לטענת הדורשת:'
        : 'להלן השתלשלות האירועים, לטענת התובעת:';

    const eventsBlock = buildNumberedBlock(eventsTitle, eventsLines, 'לא אותרו אירועים מפורטים במסמך.');

    // Actors paragraph (optional)
    const actorCandidates: string[] = [];
    if (analysis.entities?.plaintiff) actorCandidates.push(String(analysis.entities.plaintiff).trim());
    if (Array.isArray(analysis.defendants)) actorCandidates.push(...analysis.defendants.map(String).map((s) => s.trim()));
    if (Array.isArray((analysis as any).providers)) {
      actorCandidates.push(...(analysis as any).providers.map(String).map((s: string) => s.trim()));
    }

    const uniqueActors = Array.from(new Set(actorCandidates.filter(Boolean)));
    const actorsParagraph = uniqueActors.length
      ? `הגורמים המעורבים המרכזיים העולים מן המסמך הם: ${uniqueActors.join(', ')}.`
      : '';

    // Gaps block
    const gapsRaw =
      (Array.isArray((analysis as any).gaps) && (analysis as any).gaps) ||
      (Array.isArray((analysis as any).missingDetails) && (analysis as any).missingDetails) ||
      [];

    const gaps = gapsRaw.filter(Boolean).map((g: any) => String(g).trim()).filter(Boolean);

    const gapsLines = gaps.length
      ? gaps
      : ['קיימים פערים מסוימים במועדים, ברצף האירועים או במסמכים המצורפים שלא פורטו במלואם.'];

    const gapsBlock = buildNumberedBlock('פערים וחוסרים עובדתיים:', gapsLines);

    // Single brief sentence about medical outcome only (no demands/relief)
    const briefMedicalOutcome = (() => {
      const outcomeSample =
        (analysis.injuries || []).find((d) => d && String(d).trim()) ||
        (analysis.medicalFindings || []).find((d) => d && String(d).trim());

      if (!outcomeSample) return '';

      const roleLabel = variant === 'DEMAND' ? 'הדורשת' : 'התובעת';
      return `לטענת ${roleLabel}, בעקבות האירועים האמורים לעיל מצבה הרפואי מתואר במסמכים כ: ${String(
        outcomeSample,
      ).trim()}.`;
    })();

    return [
      openingSentence,
      eventsBlock,
      actorsParagraph,
      gapsBlock,
      briefMedicalOutcome,
    ]
      .filter((b) => b && String(b).trim())
      .join('\n\n')
      .trim();
  };
  const applyFirstReportStrategy = () => {
    handleContentChange('Strategy', FIRST_REPORT_STRATEGY_TEXT);
    showToast({ message: 'נוסח "דיווח ראשון" נוסף לסעיף.', type: 'success' });
  };

  const handleSectionFileUpload = (e: React.ChangeEvent<HTMLInputElement>, section: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!section.includes('Expenses')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1];
      await handleExpensesFileExtraction(file.name, base64, file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const startMedicalAnalysis = (target: {
    section?: string;
    mode: 'SECTION' | 'POLICY' | 'INVOICE' | 'EXPENSE_SOURCE' | 'EXPENSES';
    analysisType?: SectionAnalysisType;
    domain?: 'general' | 'dental';
  }) => {
    setExpensesUploadMenu(null);
    setMedicalTarget(target);
    setTimeout(() => {
      medicalFileInputRef.current?.click();
    }, 0);
  };

  const handleMedicalFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !medicalTarget) {
      setMedicalTarget(null);
      event.target.value = '';
      return;
    }
    setIsAiProcessing(true);
    const targetKey = medicalTarget.section || medicalTarget.mode;
    setMedicalProcessingTarget(targetKey);
    try {
      const base64 = await getFileBase64(file);
      const resolvedSectionKey =
        medicalTarget.mode === 'SECTION'
          ? medicalTarget.section || CLAIM_SECTION_LABEL
          : CLAIM_SECTION_LABEL;

      const isDentalMode =
        medicalTarget.domain === 'dental' &&
        medicalTarget.mode === 'SECTION';

      // Dental-specific flow – uses dedicated endpoint and DOES NOT change existing
      // medicalComplaint behaviour. Early-return so the legacy flow stays as-is.
      if (isDentalMode) {
        try {
          const dentalResponse = await analyzeDentalOpinion(
            base64,
            file.type || 'application/octet-stream',
          );
          const summaryText = dentalResponse.text?.trim() ?? '';

          if (!dentalResponse.success || !summaryText) {
            const msg =
              dentalResponse.reason === 'INVALID_DOCUMENT'
                ? DOC_ANALYSIS_OCR_FAILED_MSG
                : DOC_ANALYSIS_GENERIC_FAIL_MSG;
            showToast({ message: msg, type: 'info' });
          } else {
            const normalizedText = summaryText;
            const sectionKey = medicalTarget.section || CLAIM_SECTION_KEY;
            const existingValue = data.content[sectionKey] || '';
            const nextValue = existingValue
              ? `${existingValue}\n\n${normalizedText}`
              : normalizedText;

            const payload: Partial<ReportData> = {
              content: { ...data.content, [sectionKey]: nextValue },
              selectedSections: data.selectedSections.includes(sectionKey)
                ? data.selectedSections
                : [...data.selectedSections, sectionKey],
            };

            if (medicalTarget.analysisType === 'EXPERT' && medicalTarget.section) {
              const hasPriorContent = Boolean(existingValue.trim());
              const modeToStore: ExpertCountMode = hasPriorContent ? 'MULTIPLE' : 'SINGLE';
              payload.expertSummaryMode = {
                ...(data.expertSummaryMode || {}),
                [sectionKey]: modeToStore,
              };
            }

            updateData(payload);
            showToast({
              message: 'הקובץ נותח (דנטלי) והטקסט נוסף לסעיף בהצלחה.',
              type: 'success',
            });
            if (dentalResponse.lowConfidenceDocument) {
              setTimeout(() => showToast({ message: DOC_ANALYSIS_LOW_CONFIDENCE_MSG, type: 'info' }), 800);
            }
          }
        } catch (error) {
          console.error('Dental opinion analysis failed', error);
          showToast({ message: DOC_ANALYSIS_GENERIC_FAIL_MSG, type: 'info' });
        } finally {
          setIsAiProcessing(false);
          setMedicalProcessingTarget(null);
          setMedicalTarget(null);
          event.target.value = '';
        }
        return;
      }

      const isFactualBackgroundSection =
        resolvedSectionKey === CLAIM_SECTION_KEY || resolvedSectionKey === DEMAND_SECTION_KEY;
      const isExpertOpinionSection = isExpertSection(resolvedSectionKey);

      const analysisOptions: {
        expertCountMode?: 'SINGLE' | 'MULTIPLE';
        partyRole?: 'PLAINTIFF' | 'CLAIMANT';
        sectionKey?: string;
        plaintiffName?: string;
        insuredName?: string;
        insurerName?: string;
        reportSubject?: string;
      } = {
        expertCountMode:
          medicalTarget.analysisType === 'EXPERT'
            ? data.expertSummaryMode?.[resolvedSectionKey] || 'SINGLE'
            : undefined,
        partyRole: getSectionPartyRole(resolvedSectionKey) || undefined,
      };

      if (isFactualBackgroundSection || isExpertOpinionSection) {
        analysisOptions.sectionKey = resolvedSectionKey;
        analysisOptions.plaintiffName = data.plaintiffName || '';
        analysisOptions.insuredName = data.insuredName || '';
        analysisOptions.insurerName = data.insurerName || '';
        analysisOptions.reportSubject = data.reportSubject || '';
      }

      const response = await analyzeMedicalComplaint(
        base64,
        file.type || 'application/octet-stream',
        medicalTarget.analysisType || 'CLAIM',
        analysisOptions
      );

      if (response.success === false) {
        const msg =
          response.reason === 'INVALID_DOCUMENT'
            ? DOC_ANALYSIS_OCR_FAILED_MSG
            : DOC_ANALYSIS_GENERIC_FAIL_MSG;
        showToast({ message: msg, type: 'info' });
        return;
      }

      const analysis = response?.analysis || null;
      if (medicalTarget.mode === 'SECTION') {
        const summaryText =
          (response?.claimSummary || '').trim() ||
          buildClaimSummaryFromAnalysis(analysis, {
            analysisType: medicalTarget.analysisType,
            section: medicalTarget.section,
          });
        if (!summaryText) {
          showToast({ message: DOC_ANALYSIS_GENERIC_FAIL_MSG, type: 'info' });
        } else {
          const sectionKey = medicalTarget.section || CLAIM_SECTION_KEY;
          const existingValue = data.content[sectionKey] || '';
          const nextValue = existingValue ? `${existingValue}\n\n${summaryText}` : summaryText;
          const payload: Partial<ReportData> = {
            content: { ...data.content, [sectionKey]: nextValue },
            selectedSections: data.selectedSections.includes(sectionKey)
              ? data.selectedSections
              : [...data.selectedSections, sectionKey],
          };
          if (medicalTarget.analysisType === 'EXPERT' && medicalTarget.section) {
            const hasPriorContent = Boolean(existingValue.trim());
            const modeToStore: ExpertCountMode = hasPriorContent ? 'MULTIPLE' : 'SINGLE';
            payload.expertSummaryMode = {
              ...(data.expertSummaryMode || {}),
              [sectionKey]: modeToStore,
            };
          }
          if (analysis) {
            payload.complaintAnalysis = analysis;
          }
          updateData(payload);
          showToast({ message: 'הקובץ נותח והטקסט נוסף לסעיף בהצלחה.', type: 'success' });
          if (response.lowConfidenceDocument) {
            setTimeout(() => showToast({ message: DOC_ANALYSIS_LOW_CONFIDENCE_MSG, type: 'info' }), 800);
          }
        }
      } else if (analysis) {
        applyMedicalAnalysisToSections(analysis);
        if (medicalTarget.mode === 'POLICY') {
          updateData({
            policyFile: {
              id: `policy-${Date.now()}`,
              name: file.name,
              data: base64,
              type: file.type,
            },
          });
        }
        if (response.lowConfidenceDocument) {
          showToast({ message: DOC_ANALYSIS_LOW_CONFIDENCE_MSG, type: 'info' });
        }
      } else {
        showToast({ message: DOC_ANALYSIS_GENERIC_FAIL_MSG, type: 'info' });
      }
    } catch (error) {
      console.error(error);
      showToast({ message: DOC_ANALYSIS_GENERIC_FAIL_MSG, type: 'info' });
    } finally {
      setIsAiProcessing(false);
      setMedicalProcessingTarget(null);
      setMedicalTarget(null);
      event.target.value = '';
    }
  };

  const autoFillInsuranceCoverage = () => {
    const { policyPeriodStart, policyPeriodEnd, retroStart, retroEnd } = data;
    if (!policyPeriodStart && !policyPeriodEnd && !retroStart && !retroEnd) {
      showToast({ message: 'אין נתוני פוליסה למילוי אוטומטי. העלה POLCY קודם.', type: 'info' });
      return;
    }
    const current = fillInsuranceCoverageSection(
      data.content['Insurance Coverage'],
      policyPeriodStart,
      policyPeriodEnd,
      retroStart,
      retroEnd
    );
    handleContentChange('Insurance Coverage', current);
    showToast({ message: 'נתוני הפוליסה הושלמו אוטומטית.', type: 'success' });
  };
  const hasPolicyDates = Boolean(data.policyPeriodStart || data.policyPeriodEnd || data.retroStart || data.retroEnd);
  const insertWorksheetIntoSection = async (section: string) => {
    // First preference: new Expenses Table (FinancialExpenseSheet)
    if (data.odakanitNo) {
      try {
        const latest = await financialExpensesClient.getLatestSheetForCase(data.odakanitNo);
        if (latest && latest.lineItems && latest.lineItems.length > 0) {
          const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
            latest.sheet.id,
            new Date().toISOString(),
          );
          if (!snapshot) return;
          const { effectiveSheet, allLines, opts } = snapshot;
          const { text } = renderExpensesTableText(effectiveSheet, allLines, opts);
          const { html } = renderExpensesTableHtml(effectiveSheet, allLines, opts);
          handleContentChange(section, text);

          // Map Expenses Table attachments to invoiceFiles (up to 4 total)
          if (latest.attachments && latest.attachments.length) {
            const MAX_INVOICES_GLOBAL = 4;
            const existing = data.invoiceFiles || [];
            const room = Math.max(0, MAX_INVOICES_GLOBAL - existing.length);
            if (room > 0) {
              const toAdd = latest.attachments.slice(0, room).map((att, idx) => {
                const [meta, base64Part] = att.fileKey.split(',');
                let mime = att.mimeType || 'application/octet-stream';
                if (meta && meta.startsWith('data:')) {
                  const m = meta.match(/^data:(.*?);base64$/);
                  if (m && m[1]) mime = m[1];
                }
                const dataPart = base64Part || att.fileKey;
                return {
                  id: `fes-inv-${att.id}-${idx}`,
                  name: att.originalFileName,
                  data: dataPart,
                  type: mime,
                } as InvoiceFile;
              });

              if (toAdd.length) {
                const invoiceFiles = [...existing, ...toAdd];
                const hasInvoices = invoiceFiles.length > 0;
                const shouldAdvanceStatus =
                  canManageExpenses && data.status === 'WAITING_FOR_INVOICES' && hasInvoices;
                const nextStatus = shouldAdvanceStatus ? 'TASK_ASSIGNED' : data.status;
                updateData({
                  invoiceFiles,
                  isWaitingForInvoices: !hasInvoices,
                  status: nextStatus,
                  expensesSheetId: latest.sheet.id,
                  expensesSnapshotAt: latest.sheet.updatedAt || new Date().toISOString(),
                  expensesHtml: html || data.expensesHtml,
                });
              }
          }
          }

          showToast({ message: 'Expenses Table was inserted into the EXPENSES section.', type: 'success' });
          return;
        }
      } catch (e) {
        logError('Failed to load Expenses Table for report', e);
      }
    }

    // Fallback: legacy expenseWorksheet flow
    const worksheet = data.expenseWorksheet;
    if (!worksheet || !worksheet.rows || worksheet.rows.length === 0) {
      showToast({ message: 'אין טבלת הוצאות זמינה להוספה.', type: 'info' });
      return;
    }
    if (worksheet.status !== 'LOCKED') {
      showToast({ message: 'יש לנעול את טבלת ההוצאות לפני שמוסיפים לדו"ח.', type: 'info' });
      return;
    }
    const text = renderWorksheetAsText(worksheet);
    handleContentChange(section, text);
    showToast({ message: 'טבלת ההוצאות התווספה לדו"ח.', type: 'success' });
  };

  const triggerFormatAllContent = () => {
    if (!onFormatContent) return;
    onFormatContent();
    showToast({ message: 'כל הסעיפים עוצבו בפורמט מקצועי.', type: 'success' });
  };

  const handleRunToneRiskCheck = async () => {
    if (isRestrictedUser) return;
    setIsToneRiskRunning(true);
    try {
      const result = await analyzeToneAndRisk(data.content || {}, currentUser.role);
      const issues = result.issues || [];
      setToneRiskIssues(issues);
      const runAt = result.runAt || new Date().toISOString();
      setToneRiskLastRunAt(runAt);
      updateData({ toneRiskLastRunAt: runAt });
      setToneRiskMeta(result.meta || null);
      if (!issues.length) {
        showToast({ message: 'לא נמצאו הערות Tone & Risk בדוח.', type: 'success' });
      } else {
        showToast({ message: 'הבדיקה הושלמה – נמצאו הערות לבדיקה.', type: 'info' });
      }
    } catch (err) {
      console.error('Tone & Risk check failed', err);
      showToast({
        message: 'בדיקת Tone & Risk נכשלה טכנית – לא ניתן להסיק שאין הערות.',
        type: 'error',
      });
    } finally {
      setIsToneRiskRunning(false);
    }
  };

  const handleClearToneRisk = () => {
    setToneRiskIssues([]);
    setToneRiskLastRunAt(null);
    setToneRiskMeta(null);
    setLastToneRiskApply(null);
  };

  const hasUnsafeNumericChange = (excerpt: string, suggestion: string): boolean => {
    if (!excerpt || !suggestion) return false;
    const regex = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d+(?:\.\d+)?%?)/g;
    const tokens: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(excerpt)) !== null) {
      if (match[0]) tokens.push(match[0]);
    }
    if (!tokens.length) return false;
    return tokens.some((token) => !suggestion.includes(token));
  };

  const handleApplyToneRiskSuggestion = (issue: ToneRiskIssue) => {
    if (!issue.suggestion) return;
    const sectionKey = issue.sectionKey;
    const current = data.content[sectionKey] || '';
    if (!current || !issue.excerpt || !current.includes(issue.excerpt)) {
      navigator.clipboard?.writeText(issue.suggestion).catch(() => {});
      showToast({
        message: 'לא ניתן לבצע החלפה אוטומטית. הנוסח הועתק ללוח.',
        type: 'info',
      });
      return;
    }
    if (hasUnsafeNumericChange(issue.excerpt, issue.suggestion)) {
      navigator.clipboard?.writeText(issue.suggestion).catch(() => {});
      showToast({
        message: 'הנוסח המוצע כולל שינוי במספרים/תאריכים — העתקנו ללוח במקום להחליף אוטומטית.',
        type: 'info',
      });
      return;
    }
    setLastToneRiskApply({ sectionKey, prevText: current });
    const next = current.replace(issue.excerpt, issue.suggestion);
    handleContentChange(sectionKey, next);
  };

  const handleUndoToneRiskApply = () => {
    if (!lastToneRiskApply) return;
    const { sectionKey, prevText } = lastToneRiskApply;
    handleContentChange(sectionKey, prevText);
    setLastToneRiskApply(null);
    showToast({ message: 'ההחלפה האחרונה בוטלה.', type: 'info' });
  };

  const handleRunHebrewStyleReview = async () => {
    if (isRestrictedUser) return;
    setIsHebrewStyleRunning(true);
    try {
      const result = await reviewHebrewStyle(data.content || {}, currentUser.role);
      const issues = result.issues || [];
      setHebrewStyleIssues(issues);
      setHebrewStyleLastRunAt(result.runAt || new Date().toISOString());

      if (result.success === false) {
        showToast({
          message: 'בדיקת הניסוח לא הושלמה כרגע. ניתן להמשיך לעבוד כרגיל.',
          type: 'info',
        });
        return;
      }

      if (!issues.length) {
        showToast({ message: 'לא נמצאו הערות ניסוח מקצועי בעברית.', type: 'success' });
      } else {
        showToast({
          message: 'בדיקת הניסוח המקצועי הושלמה – נמצאו הערות לבדיקה.',
          type: 'info',
        });
      }
    } catch (err) {
      console.error('Hebrew style review failed', err);
      showToast({
        message: 'בדיקת הניסוח לא הושלמה כרגע. ניתן להמשיך לעבוד כרגיל.',
        type: 'info',
      });
    } finally {
      setIsHebrewStyleRunning(false);
    }
  };

  const handleClearHebrewStyle = () => {
    setHebrewStyleIssues([]);
    setHebrewStyleLastRunAt(null);
  };

  const handleApplyMySnippetInsert = (section: string, snippet: PersonalSnippet) => {
    if (isRestrictedUser) return;
    if (readOnly) return;
    const processed = processSnippetText(snippet.body);
    const current = data.content[section] || '';
    handleContentChange(section, current ? `${current}\n\n${processed}` : processed);
    setExpandedSnippetSection(null);
    const updated = recordPersonalSnippetUsage(currentUser.id, snippet.id);
    setMySnippets(updated);
  };

  const handleCopyMySnippet = async (snippet: PersonalSnippet) => {
    try {
      await navigator.clipboard.writeText(snippet.body);
      showToast({ message: 'התוכן הועתק ללוח.', type: 'info' });
    } catch {
      showToast({
        message: 'לא ניתן להעתיק ללוח בדפדפן זה',
        type: 'warning',
      });
    }
  };

  const handleApplyHebrewStyleSuggestion = (issue: HebrewStyleIssue) => {
    if (!issue.suggestion) return;
    const sectionKey = issue.sectionKey;
    const current = data.content[sectionKey] || '';
    const excerpt = issue.excerpt;
    const canReplace = excerpt && current.includes(excerpt);
    if (!canReplace) {
      navigator.clipboard?.writeText(issue.suggestion).catch(() => {});
      showToast({
        message: 'לא ניתן לבצע החלפה אוטומטית. ההצעה הועתקה ללוח.',
        type: 'info',
      });
      return;
    }
    const next = current.replace(excerpt, issue.suggestion);
    handleContentChange(sectionKey, next);
  };

  const getBestPracticesForSection = (section: string): BestPracticeSnippet[] => {
    return bestPractices
      .filter((bp) => bp.sectionKey === section && bp.isEnabled !== false)
      .sort((a, b) => {
        const aLabel = a.label === 'LLOYDS_RECOMMENDED' ? 0 : 1;
        const bLabel = b.label === 'LLOYDS_RECOMMENDED' ? 0 : 1;
        if (aLabel !== bLabel) return aLabel - bLabel;
        const aUsage = a.usageCount || 0;
        const bUsage = b.usageCount || 0;
        return bUsage - aUsage;
      });
  };

  const handleSaveSelectionAsBestPractice = (section: string) => {
    if (currentUser.role !== 'ADMIN') return;
    const refEntry = sectionTextareaRefs.current[section];
    const el = refEntry?.current;
    if (!el) {
      showToast({ message: 'לא נמצאה בחירה בטקסט בסעיף זה.', type: 'error' });
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      showToast({ message: 'בחר טקסט בסעיף לפני שמירה ל-Best Practice.', type: 'info' });
      return;
    }
    const fullText = data.content[section] || '';
    const selected = fullText.slice(start, end).trim();
    if (!selected) {
      showToast({ message: 'הבחירה ריקה לאחר ניקוי רווחים.', type: 'info' });
      return;
    }
    setBestPracticeDraft({ sectionKey: section, body: selected });
  };

  const handleSubmitBestPracticeDraft = async ({
    title,
    label,
    tags,
    behavior,
  }: {
    title: string;
    label: 'BEST_PRACTICE' | 'LLOYDS_RECOMMENDED';
    tags: string[];
    behavior: 'INSERTABLE' | 'COPY_ONLY';
  }) => {
    if (!bestPracticeDraft) return;
    const nowIso = new Date().toISOString();
    const snippet: BestPracticeSnippet = {
      id: '',
      sectionKey: bestPracticeDraft.sectionKey,
      title,
      body: bestPracticeDraft.body,
      label,
      tags: tags.length ? tags : undefined,
      isEnabled: true,
      createdByUserId: currentUser.id,
      createdAt: nowIso,
      updatedAt: nowIso,
      usageCount: 0,
      lastUsedAt: null,
      behavior,
    };
    try {
      const updated = await upsertBestPractice(snippet, currentUser.role);
      setBestPractices(updated);
      showToast({ message: 'Best Practice נשמר בהצלחה.', type: 'success' });
    } catch (err) {
      console.error('Failed to save best practice', err);
      showToast({ message: 'שמירת ה-Best Practice נכשלה.', type: 'error' });
    }
    setBestPracticeDraft(null);
  };

  const handleCancelBestPracticeDraft = () => {
    setBestPracticeDraft(null);
  };

  const handleApplyBestPracticeInsert = async (section: string, snippet: BestPracticeSnippet) => {
    if (isRestrictedUser) return;
    const current = data.content[section] || '';
    const next = current ? `${current}\n\n${snippet.body}` : snippet.body;
    handleContentChange(section, next);
    try {
      const updated = await recordBestPracticeUsage(snippet.id, 'INSERT', currentUser.role);
      setBestPractices(updated);
    } catch (err) {
      console.error('Failed to record best practice usage (insert)', err);
    }
  };

  const handleCopyBestPractice = async (snippet: BestPracticeSnippet) => {
    navigator.clipboard?.writeText(snippet.body).catch(() => {});
    try {
      const updated = await recordBestPracticeUsage(snippet.id, 'COPY', currentUser.role);
      setBestPractices(updated);
    } catch (err) {
      console.error('Failed to record best practice usage (copy)', err);
    }
    showToast({ message: 'הטקסט הועתק ללוח.', type: 'info' });
  };

  const handleBestPracticeFieldChange = async (
    id: string,
    patch: Partial<BestPracticeSnippet>,
  ) => {
    const existing = bestPractices.find((bp) => bp.id === id);
    if (!existing) return;
    const merged: BestPracticeSnippet = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    try {
      const updated = await upsertBestPractice(merged, currentUser.role);
      setBestPractices(updated);
    } catch (err) {
      console.error('Failed to update best practice', err);
      showToast({ message: 'עדכון ה-Best Practice נכשל.', type: 'error' });
    }
  };

  const handleDeleteBestPractice = async (id: string) => {
    try {
      const updated = await deleteBestPractice(id, currentUser.role);
      setBestPractices(updated);
    } catch (err) {
      console.error('Failed to delete best practice', err);
      showToast({ message: 'מחיקת ה-Best Practice נכשלה.', type: 'error' });
    }
  };

  const handleToggleBestPracticeEnabled = async (id: string, enabled: boolean) => {
    try {
      const updated = await setBestPracticeEnabled(id, enabled, currentUser.role);
      setBestPractices(updated);
    } catch (err) {
      console.error('Failed to toggle best practice enabled', err);
      showToast({ message: 'עדכון סטטוס ה-Best Practice נכשל.', type: 'error' });
    }
  };

  const renderWorksheetAsText = (worksheet: ExpenseWorksheet) => {
    const expenseRows = worksheet.rows.filter(row => row.type === 'EXPENSE');
    const adjustmentRows = worksheet.rows.filter(row => row.type === 'ADJUSTMENT');
    const expenseLines = expenseRows.map(row => `• ${row.label}${row.serviceProvider ? ` (${row.serviceProvider})` : ''} – ₪${row.amount.toLocaleString()}`);
    const adjustmentLines = adjustmentRows.map(row => `• ${row.label} – ₪${row.amount.toLocaleString()}`);
    return [
      'טבלת הוצאות – תמונת מצב עדכנית',
      '',
      'הוצאות:',
      expenseLines.length ? expenseLines.join('\n') : '• אין הוצאות רשומות',
      '',
      'קיזוזים / תשלומים:',
      adjustmentLines.length ? adjustmentLines.join('\n') : '• אין קיזוזים',
      '',
      `סה"כ הוצאות: ₪${worksheet.totals.totalExpenses.toLocaleString()}`,
      `סה"כ קיזוזים: ₪${worksheet.totals.totalAdjustments.toLocaleString()}`,
      `יתרה לתשלום: ₪${worksheet.totals.totalBalance.toLocaleString()}`,
    ].join('\n');
  };

  return (
    <>
    <input
      type="file"
      ref={medicalFileInputRef}
      className="hidden"
      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*"
      onChange={handleMedicalFileSelected}
    />
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <button onClick={onBack} className="flex items-center text-sm text-textMuted bg-navySecondary px-3 py-1.5 rounded-full hover:bg-borderDark">
          <ChevronLeft className="w-4 h-4 mr-1" /> חזרה לשלב 1
        </button>
        <div className="flex items-center gap-3">
          {currentUser.role === 'ADMIN' && (onTranslate || onImproveEnglish) && (
            <div className="flex flex-col items-end gap-1">
              {onTranslate && (
                <button
                  onClick={onTranslate}
                  disabled={!canTranslateNow || isTranslating}
                  className={`flex items-center text-sm px-3 py-1.5 rounded-full transition ${
                    canTranslateNow && !isTranslating
                      ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                      : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                  }`}
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" /> מתרגם...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 mr-1" /> Auto-Translate
                    </>
                  )}
                </button>
              )}

              {onImproveEnglish && (
                <button
                  onClick={onImproveEnglish}
                  disabled={!data.isTranslated || !hasEnglishToImprove || !!isImprovingEnglish}
                  className={`flex items-center text-sm px-3 py-1.5 rounded-full transition ${
                    data.isTranslated && hasEnglishToImprove && !isImprovingEnglish
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                  }`}
                >
                  {isImprovingEnglish ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Improving...
                    </>
                  ) : (
                    <>Improve English</>
                  )}
                </button>
              )}

              {onTranslate && !canTranslateNow && !isTranslating && (
                <p className="text-[11px] text-textMuted">
                  יש לאשר את הדיווח בעברית לפני תרגום.
                </p>
              )}
              {data.translationStale && (
                <p className="text-[11px] text-amber-700 max-w-xs text-right">
                  שים לב: התוכן בעברית עודכן לאחר התרגום האחרון, ייתכן שהגרסה באנגלית אינה תואמת במלואה.
                </p>
              )}
              {isTranslating && (
                <p className="text-[11px] text-indigo-600">
                  התרגום בעבודה… זה עלול לקחת כמה שניות.
                </p>
              )}
            </div>
          )}

          {currentUser.role === 'ADMIN' && canEditEnglish && (
            <div className="flex flex-col items-end gap-1 text-[11px] text-textLight">
              <span className="font-semibold">מצב תצוגת טקסט</span>
              <div className="inline-flex rounded-full border border-borderDark overflow-hidden bg-panel">
                <button
                  type="button"
                  onClick={() => setEnglishViewMode('DUAL')}
                  className={`px-3 py-1 ${
                    englishViewMode === 'DUAL'
                      ? 'bg-slate-800 text-white'
                      : 'bg-panel text-textLight hover:bg-slate-100'
                  } text-[11px]`}
                >
                  עברית + אנגלית
                </button>
                <button
                  type="button"
                  onClick={() => setEnglishViewMode('ENGLISH_ONLY')}
                  className={`px-3 py-1 border-r border-borderDark ${
                    englishViewMode === 'ENGLISH_ONLY'
                      ? 'bg-slate-800 text-white'
                      : 'bg-panel text-textLight hover:bg-slate-100'
                  } text-[11px]`}
                >
                  אנגלית בלבד
                </button>
              </div>
            </div>
          )}

          {currentUser.role === 'ADMIN' && onFormatContent && (
            <button
              onClick={triggerFormatAllContent}
              className="flex items-center text-sm text-purple-700 bg-purple-50 px-3 py-1.5 rounded-full hover:bg-purple-100"
            >
              <NotebookPen className="w-4 h-4 mr-1" /> Format Text
            </button>
          )}
        <button onClick={onSaveAndExit} className="flex items-center text-sm text-lpBlue bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100">
          <Home className="w-4 h-4 mr-1" /> חזרה לדשבורד
        </button>
        </div>
      </div>
      {isAiProcessing && (
        <div className="flex items-center justify-end gap-2 text-[11px] text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>המערכת מנתחת את המסמך, זה עשוי לקחת מספר שניות…</span>
        </div>
      )}
      
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold text-lpBlue font-serif">2. Draft Content</h2>
      </div>
      {!isRestrictedUser && (
        <div className="mb-3 mt-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-textMuted">
                בדיקות לפני שליחה
              </span>
            </div>
            {toneRiskLastRunAt && (
              <div className="text-[11px] text-textMuted">
                בדיקת Tone &amp; Risk אחרונה:{' '}
                {new Date(toneRiskLastRunAt).toLocaleString('he-IL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunHebrewStyleReview}
              disabled={isHebrewStyleRunning}
              title="סורק את הדוח ומציג הערות על ניסוח וסגנון בעברית. לא משנה את הטקסט – מציע הערות בלבד."
              className={`flex items-center text-sm font-semibold px-4 py-2 rounded-lg border ${
                isHebrewStyleRunning
                  ? 'bg-slate-100 text-slate-400 border-borderDark cursor-not-allowed'
                  : 'bg-blue-500/20 text-blue-200 border-blue-400/60 hover:bg-blue-500/30'
              }`}
            >
              {isHebrewStyleRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> בדיקת ניסוח בעברית...
                </>
              ) : (
                <>בדיקת ניסוח (הערות בלבד)</>
              )}
            </button>
            {hebrewStyleIssues.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('hebrew-style-panel');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/60 hover:bg-blue-500/30"
              >
                הערת ניסוח
                {hebrewStyleIssues.length > 1 && ` (${hebrewStyleIssues.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={handleRunToneRiskCheck}
              disabled={isToneRiskRunning}
              title="בודק ניסוחים שעלולים ליצור סיכון משפטי או להרחיב חשיפה למבטחת. לא משנה את הטקסט – מציג אזהרות בלבד."
              className={`flex items-center text-sm font-semibold px-4 py-2 rounded-lg border ${
                isToneRiskRunning
                  ? 'bg-slate-100 text-slate-400 border-borderDark cursor-not-allowed'
                  : 'bg-amber-500/20 text-amber-200 border-amber-400/60 hover:bg-amber-500/30'
              }`}
            >
              {isToneRiskRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> בדיקת Tone &amp; Risk...
                </>
              ) : (
                <>בדיקת Tone &amp; Risk (למבטחת)</>
              )}
            </button>
            {toneRiskIssues.length > 0 && (
              <button
                type="button"
                onClick={handleClearToneRisk}
                className="text-[11px] text-textMuted hover:text-textLight underline"
              >
                נקה תוצאות Tone &amp; Risk
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-textMuted">
            {hebrewStyleLastRunAt &&
              !hebrewStyleIssues.length &&
              !isHebrewStyleRunning && <span>אין הערות ניסוח.</span>}
            {toneRiskLastRunAt && !toneRiskIssues.length && !isToneRiskRunning && (
              <span>אין הערות Tone &amp; Risk.</span>
            )}
          </div>
        </div>
      )}
      {!isRestrictedUser && toneRiskIssues.length > 0 && (
        <div
          id="tone-risk-panel"
          className="mb-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-semibold text-amber-900">
              נמצאו {toneRiskIssues.length} הערות Tone &amp; Risk
            </div>
            {lastToneRiskApply && (
              <button
                type="button"
                onClick={handleUndoToneRiskApply}
                className="text-[11px] text-textMuted hover:text-textLight underline"
              >
                בטל החלפה אחרונה
              </button>
            )}
          </div>
          {toneRiskMeta && (
            <div className="text-[11px] text-textMuted">
              נבדקו {toneRiskMeta.sectionsSent} סעיפים | אורך לפני: {toneRiskMeta.charsBefore} | אחרי קיצור: {toneRiskMeta.charsAfter}
              {toneRiskMeta.truncatedSections > 0 && (
                <span className="ml-2 text-amber-700">
                  ⚠ חלק מהטקסט קוצר לצורך הבדיקה ({toneRiskMeta.truncatedSections})
                </span>
              )}
            </div>
          )}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {toneRiskIssues.map((issue) => (
              <div
                key={issue.id}
                className="bg-panel border border-amber-200 rounded px-2 py-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-textLight">
                      {issue.sectionKey || 'Unknown section'}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        issue.severity === 'CRITICAL'
                          ? 'bg-red-100 text-red-700'
                          : issue.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-textMuted'
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-700 font-mono">
                      {issue.kind}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-textLight">
                  <span className="font-semibold">ציטוט:</span>{' '}
                  <span className="italic">"{issue.excerpt}"</span>
                </div>
                <div className="text-[11px] text-textLight">
                  <span className="font-semibold">הסבר:</span> {issue.message}
                </div>
                {issue.suggestion && (
                  <div className="text-[11px] text-textLight">
                    <span className="font-semibold">ניסוח מוצע:</span>{' '}
                    <span className="whitespace-pre-wrap">{issue.suggestion}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {issue.suggestion && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            ?.writeText(issue.suggestion || '')
                            .catch(() => {})
                        }
                        className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                      >
                        העתק ניסוח מוצע
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyToneRiskSuggestion(issue)}
                        className="px-2 py-0.5 rounded border border-emerald-300 text-[11px] text-emerald-700 hover:bg-emerald-50"
                      >
                        החלף בטקסט
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setHebrewStyleIssues((prev) =>
                        prev.filter((other) => other.id !== issue.id),
                      )
                    }
                    className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textMuted hover:bg-slate-100 ml-auto"
                  >
                    התעלם
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!isRestrictedUser && hebrewStyleIssues.length > 0 && (
        <div
          id="hebrew-style-panel"
          className="mb-4 border border-blue-200 bg-blue-50 rounded-md p-3 text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-semibold text-blue-900">
              נמצאו {hebrewStyleIssues.length} הערות ניסוח בעברית
            </div>
            {hebrewStyleLastRunAt && (
              <div className="text-[11px] text-textMuted">
                בדיקה אחרונה:{' '}
                {new Date(hebrewStyleLastRunAt).toLocaleString('he-IL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {hebrewStyleIssues.map((issue) => {
              const sectionContent = data.content[issue.sectionKey] || '';
              const canReplace =
                !!issue.suggestion && !!issue.excerpt && sectionContent.includes(issue.excerpt);
              return (
                <div
                  key={issue.id}
                  className="bg-panel border border-blue-200 rounded px-2 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-textLight">
                        {issue.sectionKey || 'Unknown section'}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          issue.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : issue.severity === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-textMuted'
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] bg-blue-50 text-blue-700 font-mono">
                        {issue.category}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-textLight">
                    <span className="font-semibold">ציטוט:</span>{' '}
                    <span className="italic">"{issue.excerpt}"</span>
                  </div>
                  <div className="text-[11px] text-textLight">
                    <span className="font-semibold">הסבר:</span> {issue.message}
                  </div>
                  {issue.suggestion && (
                    <div className="text-[11px] text-textLight">
                      <span className="font-semibold">ניסוח מוצע:</span>{' '}
                      <span className="whitespace-pre-wrap">{issue.suggestion}</span>
                    </div>
                  )}
                  {issue.suggestion && (
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard?.writeText(issue.suggestion || '').catch(() => {})
                        }
                        className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                      >
                        העתק הצעה
                      </button>
                      {canReplace && (
                        <button
                          type="button"
                          onClick={() => handleApplyHebrewStyleSuggestion(issue)}
                          className="px-2 py-0.5 rounded border border-emerald-300 text-[11px] text-emerald-700 hover:bg-emerald-50"
                        >
                          החלף בטקסט
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {isRestrictedUser && (
        <div className="bg-orange-100 border-l-4 border-orange-500 p-4 text-orange-800">
          <p className="font-bold flex items-center"><ShieldAlert className="w-5 h-5 mr-2"/> Restricted Access Mode</p>
          <p className="text-sm">You are logged in as {currentUser.role}. You can only modify the Invoice Attachments in the Expenses section.</p>
        </div>
      )}

      {/* FINANCE INSTRUCTIONS ALERT */}
      {data.financeInstructions && (
          <div className="bg-red-50 border-l-4 border-red-600 p-4 shadow-md rounded-r-lg animate-pulse-slow">
             <div className="flex items-start">
                <div className="flex-shrink-0">
                   <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="ml-3 w-full">
                   <h3 className="text-sm font-bold text-red-800">Instruction from Finance</h3>
                   <div className="mt-2 text-sm text-red-700 whitespace-pre-wrap">{data.financeInstructions}</div>
                   {data.expensesSourceFile && (
                      <div className="mt-4 pt-2 border-t border-red-200">
                         <p className="text-xs font-bold text-red-800 mb-1">Attached Expenses Source File (Word/Excel):</p>
                         <div className="flex items-center bg-panel p-2 rounded border border-red-200 max-w-md">
                            <FileText className="w-4 h-4 text-blue-600 mr-2"/>
                            <span className="text-sm text-textLight flex-1">{data.expensesSourceFile.name}</span>
                            <a 
                               href={`data:${data.expensesSourceFile.type};base64,${data.expensesSourceFile.data}`} 
                               download={data.expensesSourceFile.name}
                               className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 font-bold"
                            >
                               Download
                            </a>
                         </div>
                      </div>
                   )}
             </div>
           </div>
        </div>
      )}

      {shouldWarnExpenses && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 shadow rounded-r-lg flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-1" />
          <div>
            <p className="font-bold text-amber-900">נדרש להשלים את סעיף ההוצאות</p>
            <p className="text-sm text-amber-800">
              קיבלת משימה מלידור/איריס להכין דוח כספי. אנא הזן נתוני הוצאות לפני השלמת הדוח או הסר זמנית את סעיף ההוצאות מהרשימה.
            </p>
          </div>
        </div>
      )}

      <ReportReviewPanel
        report={data}
        currentUser={currentUser}
        onSubmitToAdmin={() => onSubmitHebrewForReview && onSubmitHebrewForReview()}
        onApproveHebrew={() => onApproveHebrewForTranslation && onApproveHebrewForTranslation()}
        onRequestChanges={(issues) => onAddReviewIssues && onAddReviewIssues(issues)}
        onMarkIssueDone={(issueId) =>
          onMarkReviewIssueDone && onMarkReviewIssueDone(issueId)
        }
        onAddExternalFeedbackIssues={(issues, externalRefId) =>
          onAddExternalFeedbackIssues && onAddExternalFeedbackIssues(issues, externalRefId)
        }
        onReopenHebrewDueToExternalFeedback={() =>
          onReopenHebrewDueToExternalFeedback && onReopenHebrewDueToExternalFeedback()
        }
      />

      <div className="space-y-8">
        {data.selectedSections.map((sec) => {
          const displayTitle = getSectionDisplayTitle(sec, data.expertSummaryMode?.[sec]);
          const isExpertDisplay = /expert/i.test(displayTitle);

          const toneIssuesForSection = toneRiskIssues.filter(
            (issue) => issue.sectionKey === sec,
          ).length;
          const styleIssuesForSection = hebrewStyleIssues.filter(
            (issue) => issue.sectionKey === sec,
          ).length;
          const hasFinanceExpenses = Boolean(data.expensesSheetId || (data as any).expensesHtml);

          return (
          <div
            key={sec}
            className={`bg-panel p-6 rounded-lg shadow-sm border transition-all ${isRestrictedUser && !sec.includes('Expenses') ? 'opacity-60 pointer-events-none border-gray-100' : 'border-borderDark'}`}
            onClick={(event) => {
              if (!onActiveSectionChange || typeof sec !== 'string' || !sec.trim()) return;
              const target = event.target as HTMLElement | null;
              if (!target) return;
              // אל תעדכן סקשן פעיל אם המשתמשת לחצה על כפתור/לינק/שדה קלט/אייקון אינטראקטיבי
              const interactive = target.closest(
                'button, a, input, textarea, select, svg, [role="button"]',
              );
              if (interactive) return;
              onActiveSectionChange(sec);
            }}
          >
            
            {/* Section Header */}
            <div className="flex justify-between items-center mb-3 pb-3 border-b border-gold/30">
              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-xl text-gold uppercase tracking-wider border-r-2 border-gold/50 pr-2">
                  {displayTitle}
                </h3>
                {sec.includes('Expenses') && data.expensesSnapshotAt && (
                  <p className="text-[11px] text-textMuted">
                    Based on the latest Expenses Table as of{' '}
                    {new Date(data.expensesSnapshotAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    .
                  </p>
                )}
                {!sec.includes('Expenses') && (styleIssuesForSection > 0 || toneIssuesForSection > 0) && (
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {styleIssuesForSection > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('hebrew-style-panel');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="inline-flex items-center rounded-full px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                      >
                        הערת ניסוח
                        {styleIssuesForSection > 1 && ` (${styleIssuesForSection})`}
                      </button>
                    )}
                    {toneIssuesForSection > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('tone-risk-panel');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="inline-flex items-center rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                      >
                        הערת Tone &amp; Risk
                        {toneIssuesForSection > 1 && ` (${toneIssuesForSection})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!isRestrictedUser && (
                <div className="flex items-center gap-2">
                  {!sec.includes('Expenses') && (
                    <button
                      className="inline-flex items-center px-2.5 py-2 rounded-lg border border-borderDark hover:border-gold/50 hover:bg-gold/10 text-textMuted hover:text-goldLight transition"
                      disabled={isAiProcessing}
                      onClick={() => {
                        startMedicalAnalysis({ mode: 'SECTION', section: sec, analysisType: getSectionAnalysisType(sec) });
                      }}
                      title="ניתוח קובץ והוספה לסעיף"
                    >
                      {medicalProcessingTarget === sec ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </button>
                  )}
                  {isExpertDisplay && (
                    <button
                      className="inline-flex items-center px-2.5 py-2 rounded-lg border border-borderDark hover:border-gold/50 hover:bg-gold/10 text-textMuted hover:text-goldLight transition"
                      disabled={isAiProcessing}
                      onClick={() => {
                        startMedicalAnalysis({ mode: 'SECTION', section: sec, analysisType: 'EXPERT', domain: 'dental' });
                      }}
                      title="ניתוח חוות דעת – רפואת שיניים"
                    >
                      {medicalProcessingTarget === sec && medicalTarget?.domain === 'dental'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <span className="text-lg leading-none">🦷</span>}
                    </button>
                  )}
                  {sec.includes('Expenses') && canInsertWorksheet && (
                    <button onClick={() => insertWorksheetIntoSection(sec)} className="p-1.5 hover:bg-green-50 rounded text-textMuted hover:text-green-600" title="הוסף טבלת הוצאות עדכנית">
                      <Table className="w-4 h-4" />
                    </button>
                  )}
                  {!sec.includes('Expenses') && (
                    <>
                      {sec === 'Strategy' && !isRestrictedUser && (
                        <button
                          onClick={applyFirstReportStrategy}
                          className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                        >
                          דיווח ראשון
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRefineText(sec)}
                          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 border border-purple-500/50 transition"
                          title="משפר את הטקסט הנוכחי לעברית משפטית מקצועית, תוך שמירה מלאה על העובדות. זהו הכלי המרכזי לשיפור הניסוח."
                        >
                          {refiningSection === sec ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 mr-1.5" />
                          )}
                          שפר ניסוח בעברית
                        </button>
                        <div
                          className="flex rounded-full border border-purple-200 overflow-hidden text-[10px] bg-panel"
                          title="בחרי את עוצמת השיפור בעברית"
                        >
                          <button
                            type="button"
                            onClick={() => setHebrewRefineMode('SAFE_POLISH')}
                            className={`px-2 py-0.5 ${
                              hebrewRefineMode === 'SAFE_POLISH'
                                ? 'bg-purple-100 text-purple-800'
                                : 'text-purple-500 hover:bg-purple-50'
                            }`}
                          >
                            שינוי עדין
                          </button>
                          <button
                            type="button"
                            onClick={() => setHebrewRefineMode('REWRITE')}
                            className={`px-2 py-0.5 border-l border-purple-100 ${
                              hebrewRefineMode === 'REWRITE'
                                ? 'bg-purple-100 text-purple-800'
                                : 'text-purple-500 hover:bg-purple-50'
                            }`}
                          >
                            שכתוב מורגש
                          </button>
                        </div>
                      </div>
                      {sec === 'Insurance Coverage' && hasPolicyDates && (
                         <button onClick={autoFillInsuranceCoverage} className="p-1.5 hover:bg-blue-50 rounded text-textMuted hover:text-blue-600" title="Auto-fill policy data">
                            <Wand2 className="w-4 h-4" />
                         </button>
                      )}
                    </>
                  )}
                  {hebrewRefineDiff &&
                    hebrewRefineDiff.sectionKey === sec &&
                    hebrewRefineDiff.changedWords > 0 &&
                    hebrewRefineDiff.expiresAt > Date.now() && (
                      <div className="mt-1 text-[11px] text-textMuted bg-purple-50/40 border border-purple-100 rounded px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            שונו בערך {hebrewRefineDiff.changedWords} מילים בסעיף זה.
                          </span>
                          <button
                            type="button"
                            className="underline text-purple-700 hover:text-purple-900"
                            onClick={() =>
                              setHebrewRefineDiff((prev) =>
                                prev && prev.sectionKey === sec
                                  ? { ...prev, open: !prev.open }
                                  : prev,
                              )
                            }
                          >
                            {hebrewRefineDiff.open ? 'הסתר שינויים' : 'הצג שינויים'}
                          </button>
                        </div>
                        {hebrewRefineDiff.open && (
                          <div className="mt-1 text-[11px] text-textLight whitespace-pre-wrap leading-relaxed">
                            {hebrewRefineDiff.tokens.map((tok, idx) => {
                              if (tok.type === 'same') {
                                return ` ${tok.text}`;
                              }
                              if (tok.type === 'add') {
                                return ` [+${tok.text}+]`;
                              }
                              // remove
                              return ` [-${tok.text}-]`;
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  {getTemplatesForSection(sec).length > 0 && (
                    <button
                      onClick={() => handleToggleTemplatesPanel(sec)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-navySecondary text-textMuted border hover:bg-yellow-50"
                    >
                      <Lightbulb className="w-3 h-3" /> Ideas
                    </button>
                  )}
                  {currentUser.role === 'ADMIN' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveSelectionAsTemplate(sec)}
                        className="px-2 py-1 rounded text-[11px] border border-dashed border-borderDark text-textMuted hover:bg-slate-50"
                      >
                        Save selection as template
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveSelectionAsBestPractice(sec)}
                        className="px-2 py-1 rounded text-[11px] border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        Save selection as Best Practice
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {sec === 'Update' && isInitialReport(data) && (
              <div className="mb-3 text-xs text-textLight">
                <span className="block mb-1 font-semibold">
                  הוסף נוסח פתיחה מובנה (אופציונלי)
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-full border border-borderDark bg-navySecondary hover:bg-navySecondary text-[11px] font-semibold text-textLight"
                    onClick={() => {
                      const template = UPDATE_INTRO_TEMPLATES.SOC;
                      const current = data.content['Update'] || '';
                      const firstLine = template.split('\n')[0];
                      // prevent duplicates only when the intro is already at the top (ignoring leading whitespace)
                      if (current.trimStart().startsWith(firstLine)) return;
                      const hasContent = current.trim().length > 0;
                      const next = hasContent
                        ? `${template}\n\n${current.trimStart()}`
                        : template;
                      handleContentChange('Update', next);
                    }}
                  >
                    כתב תביעה (Statement of Claim)
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-full border border-borderDark bg-navySecondary hover:bg-navySecondary text-[11px] font-semibold text-textLight"
                    onClick={() => {
                      const template = UPDATE_INTRO_TEMPLATES.LOD;
                      const current = data.content['Update'] || '';
                      const firstLine = template.split('\n')[0];
                      // prevent duplicates only when the intro is already at the top (ignoring leading whitespace)
                      if (current.trimStart().startsWith(firstLine)) return;
                      const hasContent = current.trim().length > 0;
                      const next = hasContent
                        ? `${template}\n\n${current.trimStart()}`
                        : template;
                      handleContentChange('Update', next);
                    }}
                  >
                    מכתב דרישה (Letter of Demand)
                  </button>
                </div>
              </div>
            )}

            {/* Templates & Best Practices Panel (Lightbulb) */}
            {expandedSnippetSection === sec && !isRestrictedUser && (
              <div className="mb-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      className={`px-2 py-1 rounded-full border ${
                        bestPracticeTab === 'TEMPLATES'
                          ? 'bg-panel border-yellow-400 text-yellow-800 font-semibold'
                          : 'bg-yellow-100/60 border-yellow-200 text-yellow-700'
                      }`}
                      onClick={() => setBestPracticeTab('TEMPLATES')}
                    >
                      Templates
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 rounded-full border ${
                        bestPracticeTab === 'BEST_PRACTICES'
                          ? 'bg-panel border-emerald-400 text-emerald-800 font-semibold'
                          : 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                      }`}
                      onClick={() => setBestPracticeTab('BEST_PRACTICES')}
                    >
                      Best Practices
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 rounded-full border ${
                        bestPracticeTab === 'MY_SNIPPETS'
                          ? 'bg-panel border-sky-400 text-sky-800 font-semibold'
                          : 'bg-sky-50/70 border-sky-200 text-sky-700'
                      }`}
                      onClick={() => setBestPracticeTab('MY_SNIPPETS')}
                    >
                      בלוקים אישיים
                    </button>
                  </div>
                  {bestPracticeTab === 'TEMPLATES' && (
                    <input
                      type="text"
                      className="flex-1 border border-yellow-300 rounded px-2 py-1 text-xs"
                      placeholder="Search templates…"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                  )}
                  {bestPracticeTab === 'BEST_PRACTICES' && (
                    <input
                      type="text"
                      className="flex-1 border border-emerald-300 rounded px-2 py-1 text-xs"
                      placeholder="Search best practices…"
                      value={bestPracticeSearch}
                      onChange={(e) => setBestPracticeSearch(e.target.value)}
                    />
                  )}
                  {bestPracticeTab === 'MY_SNIPPETS' && (
                    <input
                      type="text"
                      className="flex-1 border border-sky-300 rounded px-2 py-1 text-xs"
                      placeholder="חיפוש בבלוקים האישיים…"
                      value={mySnippetSearch}
                      onChange={(e) => setMySnippetSearch(e.target.value)}
                    />
                  )}
                  {currentUser.role === 'ADMIN' && bestPracticeTab === 'TEMPLATES' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateManagerSection(sec);
                        setIsTemplateManagerOpen(true);
                      }}
                      className="text-[11px] px-2 py-1 rounded bg-panel text-textLight border border-borderDark hover:bg-slate-50"
                    >
                      Manage templates
                    </button>
                  )}
                  {currentUser.role === 'ADMIN' && bestPracticeTab === 'BEST_PRACTICES' && (
                    <button
                      type="button"
                      onClick={() => {
                        setBestPracticeManagerSection(sec);
                        setIsBestPracticeManagerOpen(true);
                      }}
                      className="text-[11px] px-2 py-1 rounded bg-panel text-textLight border border-borderDark hover:bg-slate-50"
                    >
                      Manage best practices
                    </button>
                  )}
                  {bestPracticeTab === 'MY_SNIPPETS' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMySnippetsManagerOpen(true);
                        setMySnippetDraft(null);
                      }}
                      className="text-[11px] px-2 py-1 rounded bg-panel text-textLight border border-borderDark hover:bg-slate-50"
                    >
                      ניהול בלוקים
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto text-xs">
                  {bestPracticeTab === 'TEMPLATES' ? (
                    (() => {
                      const templates = getTemplatesForSection(sec);
                      const q = templateSearch.trim().toLowerCase();
                      const filtered = q
                        ? templates.filter(
                            (t) =>
                              t.title.toLowerCase().includes(q) ||
                              t.body.toLowerCase().includes(q),
                          )
                        : templates;
                      if (!filtered.length) {
                        return (
                          <p className="text-[11px] text-textMuted">
                            No templates found for this section.
                          </p>
                        );
                      }
                      return filtered.map((tpl) => {
                        const preview =
                          tpl.body.length > 160 ? `${tpl.body.slice(0, 160)}…` : tpl.body;
                        return (
                          <div
                            key={tpl.id}
                            className="flex items-center gap-2 bg-panel border border-yellow-100 rounded px-2 py-2 hover:bg-yellow-100 cursor-pointer"
                            onClick={() => applyTemplateToSection(sec, tpl)}
                          >
                            <div className="flex-1 min-w-0 text-right">
                              <div className="font-semibold text-textLight truncate">
                                {tpl.title}
                              </div>
                              <div className="text-[11px] text-textMuted max-h-10 overflow-hidden whitespace-pre-wrap">
                                {preview}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded bg-yellow-50 text-yellow-800 border border-yellow-200 hover:bg-yellow-100"
                            >
                              Insert
                            </button>
                          </div>
                        );
                      });
                    })()
                  ) : bestPracticeTab === 'BEST_PRACTICES' ? (
                    (() => {
                      const list = getBestPracticesForSection(sec);
                      const q = bestPracticeSearch.trim().toLowerCase();
                      const filtered = q
                        ? list.filter((bp) => {
                            const tags = (bp.tags || []).join(' ').toLowerCase();
                            return (
                              bp.title.toLowerCase().includes(q) ||
                              bp.body.toLowerCase().includes(q) ||
                              tags.includes(q)
                            );
                          })
                        : list;
                      if (!filtered.length) {
                        return (
                          <p className="text-[11px] text-textMuted">
                            No best practices found for this section.
                          </p>
                        );
                      }
                      return filtered.map((bp) => {
                        const preview =
                          bp.body.length > 160 ? `${bp.body.slice(0, 160)}…` : bp.body;
                        const canInsert = bp.behavior !== 'COPY_ONLY';
                        return (
                          <div
                            key={bp.id}
                            className="flex items-center gap-2 bg-panel border border-emerald-100 rounded px-2 py-2 hover:bg-emerald-50 cursor-default"
                          >
                            <div className="flex-1 min-w-0 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1 mb-0.5">
                                <span className="font-semibold text-textLight truncate">
                                  {bp.title}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                    bp.label === 'LLOYDS_RECOMMENDED'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {bp.label === 'LLOYDS_RECOMMENDED'
                                    ? 'Lloyds recommended'
                                    : 'Best practice'}
                                </span>
                                {bp.tags && bp.tags.length > 0 && (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-slate-100 text-textLight">
                                    {bp.tags.join(', ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-textMuted max-h-10 overflow-hidden whitespace-pre-wrap">
                                {preview}
                              </div>
                            </div>
                            <div className="flex flex-col items-stretch gap-1">
                              {canInsert && (
                                <button
                                  type="button"
                                  onClick={() => handleApplyBestPracticeInsert(sec, bp)}
                                  className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                                >
                                  Insert
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCopyBestPractice(bp)}
                                className="text-[11px] px-2 py-0.5 rounded bg-slate-50 text-textLight border border-borderDark hover:bg-slate-100"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    (() => {
                      const q = mySnippetSearch.trim().toLowerCase();
                      const list = mySnippets
                        .filter(
                          (s) =>
                            !s.sectionKey ||
                            s.sectionKey === sec,
                        )
                        .filter((s) => {
                          if (!q) return true;
                          const tags = (s.tags || []).join(' ').toLowerCase();
                          return (
                            s.title.toLowerCase().includes(q) ||
                            s.body.toLowerCase().includes(q) ||
                            tags.includes(q)
                          );
                        });
                      const sorted = list.slice().sort((a, b) => {
                        const aLast = a.lastUsedAt || '';
                        const bLast = b.lastUsedAt || '';
                        if (aLast && bLast && aLast !== bLast) {
                          return bLast.localeCompare(aLast);
                        }
                        if (aLast && !bLast) return -1;
                        if (!aLast && bLast) return 1;
                        const aUpdated = a.updatedAt || a.createdAt;
                        const bUpdated = b.updatedAt || b.createdAt;
                        return bUpdated.localeCompare(aUpdated);
                      });
                      if (!sorted.length) {
                        return (
                          <p className="text-[11px] text-textMuted">
                            אין עדיין בלוקים אישיים.
                          </p>
                        );
                      }
                      return sorted.map((snip) => {
                        const preview =
                          snip.body.length > 160
                            ? `${snip.body.slice(0, 160)}…`
                            : snip.body;
                        return (
                          <div
                            key={snip.id}
                            className="flex items-center gap-2 bg-panel border border-sky-100 rounded px-2 py-2 hover:bg-sky-50 cursor-default"
                          >
                            <div className="flex-1 min-w-0 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1 mb-0.5">
                                <span className="font-semibold text-textLight truncate">
                                  {snip.title}
                                </span>
                                {snip.tags && snip.tags.length > 0 && (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-slate-100 text-textLight">
                                    {snip.tags.join(', ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-textMuted max-h-10 overflow-hidden whitespace-pre-wrap">
                                {preview}
                              </div>
                            </div>
                            <div className="flex flex-col items-stretch gap-1">
                              <button
                                type="button"
                                onClick={() => handleApplyMySnippetInsert(sec, snip)}
                                className="text-[11px] px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={readOnly}
                                title={readOnly ? 'הדוח נעול לעריכה – לא ניתן להכניס טקסט.' : undefined}
                              >
                                הכנסה
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyMySnippet(snip)}
                                className="text-[11px] px-2 py-0.5 rounded bg-slate-50 text-textLight border border-borderDark hover:bg-slate-100"
                              >
                                העתקה
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsMySnippetsManagerOpen(true);
                                  setMySnippetDraft({
                                    id: snip.id,
                                    title: snip.title,
                                    sectionKey: snip.sectionKey || '',
                                    tagsInput: (snip.tags || []).join(', '),
                                    body: snip.body,
                                  });
                                }}
                                className="text-[11px] px-2 py-0.5 rounded bg-slate-50 text-textLight border border-borderDark hover:bg-slate-100"
                              >
                                עריכה
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('למחוק את הבלוק האישי הזה?')) {
                                    const updated = deletePersonalSnippet(
                                      currentUser.id,
                                      snip.id,
                                    );
                                    setMySnippets(updated);
                                  }
                                }}
                                className="text-[11px] px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                              >
                                מחיקה
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            )}
            
            {/* SECTION CONTENT */}
            {sec.includes("Expenses") ? (
               <div className="space-y-4">
                  {hasFinanceExpenses ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-medium">טבלת ההוצאות מגיעה מטבלת הנהלת החשבונות (Expense Sheet).</p>
                      <p className="text-xs text-emerald-800 mt-1">לעדכון – השתמשי בכפתור &quot;הוסף טבלת הוצאות עדכנית&quot; למעלה.</p>
                    </div>
                  ) : (
                  <>
                  {/* Manual Expense Entry (Legacy) */}
                  {canManageExpenses && (
                     <div className="bg-blue-50 p-4 rounded border border-blue-100 mb-4">
                        <h4 className="text-sm font-bold text-blue-800 mb-2">Add Expense Item</h4>
                        <div className="flex gap-2 flex-wrap">
                           <input type="date" className="border p-2 rounded text-sm" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} />
                           <input type="text" className="border p-2 rounded text-sm flex-1" placeholder="Description (e.g. Court Fee)" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
                           <input type="number" className="border p-2 rounded text-sm w-24" placeholder="Amount" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} />
                           <button onClick={handleAddExpense} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700">Add</button>
                        </div>
                     </div>
                  )}

                  {/* Table Extraction UI (AI Upload) */}
                  {canManageExpenses && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="relative text-xs">
                        <button className="flex items-center text-indigo-600 bg-panel px-2 py-1 rounded hover:bg-indigo-50" onClick={() => setExpensesUploadMenu(expensesUploadMenu === sec ? null : sec)}>
                          <Upload className="w-3 h-3 mr-1"/> Auto-extract
                        </button>
                        {expensesUploadMenu === sec && (
                          <div className="absolute right-0 mt-2 w-44 bg-panel border border-borderDark rounded-lg shadow-lg z-20">
                            <label className="w-full block px-3 py-2 hover:bg-navySecondary cursor-pointer text-right">
                              📎 העלאה רגילה
                              <input type="file" className="hidden" onChange={(e) => { setExpensesUploadMenu(null); handleSectionFileUpload(e, sec); }} accept=".pdf,.jpg,.png" />
                         </label>
                            <button className="w-full text-right px-3 py-2 hover:bg-navySecondary" onClick={() => startMedicalAnalysis({ mode: 'EXPENSES', section: sec })}>
                              📄 ניתוח OCR
                            </button>
                          </div>
                        )}
                      </div>
                         {isAiProcessing && (
                           <span className="text-xs text-indigo-500 flex items-center">
                             <Loader2 className="w-3 h-3 animate-spin mr-1" />
                             המערכת מנתחת את המסמך, זה עשוי לקחת מספר שניות…
                           </span>
                         )}
                    </div>
                  )}

                  <div className="space-y-2">
                       <div className="flex justify-between items-center bg-indigo-50 p-2 rounded border border-indigo-200">
                          <span className="text-sm font-bold text-indigo-900">Total Extracted: ₪{data.expensesSum || '0'}</span>
                          {canManageExpenses && <button onClick={() => updateData({ expensesItems: [], expensesSum: '0' })} className="text-xs text-red-500 hover:underline">Clear All</button>}
                       </div>
                       
                       {/* Render Items Table */}
                        <div className="overflow-x-auto border rounded">
                          <table className="w-full text-sm border-collapse border-borderDark">
                            <thead className="bg-navySecondary">
                              <tr>
                                <th className="p-2 text-left text-textMuted">Date</th>
                                <th className="p-2 text-left text-textMuted">Description</th>
                                <th className="p-2 text-right text-textMuted">Amount</th>
                                {!isRestrictedUser && <th className="p-2 w-8"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {data.expensesItems.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">No expenses added.</td></tr>}
                              {data.expensesItems.map((item, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="p-2">{item.date}</td>
                                  <td className="p-2">{item.description}</td>
                                  <td className="p-2 text-right">{item.amount} {item.currency}</td>
                                  {canManageExpenses && (
                                    <td className="p-2 text-center">
                                       <button onClick={() => removeExpense(item.id)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                       {canManageExpenses && (
                         <div className="bg-indigo-50 p-3 rounded border">
                            <select className="w-full text-sm border p-2 rounded" value={data.paymentRecommendation || ''} onChange={(e) => updateData({ paymentRecommendation: e.target.value })}>
                              <option value="">-- Select Recommendation --</option>
                              <option value="The expenses are lower than the Deductible...">Option A: Lower than Deductible</option>
                              <option value={`It would be appreciated... transfer ₪${data.expensesSum || '...'}`}>Option B: Transfer Funds ({data.expensesSum} ₪)</option>
                            </select>
                         </div>
                       )}
                    </div>
                  </>
                  )}
                  {/* INVOICE ATTACHMENTS ZONE (Sub-Admin/Finance Focus) */}
                  <div className={`border-t-2 pt-4 mt-6 ${isRestrictedUser ? 'bg-green-50 p-4 rounded border-green-200' : ''}`}>
                     <h4 className="font-bold text-sm text-textLight mb-2 flex items-center">
                        <Receipt className="w-4 h-4 mr-2"/> Tax Invoices (Appendices)
                     </h4>
                     
                     {(canManageExpenses || !data.isWaitingForInvoices) && (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <button onClick={() => invoiceUploadRef.current?.click()} className="px-3 py-1.5 text-xs bg-navySecondary text-textLight rounded hover:bg-borderDark flex items-center gap-1">
                            <Upload className="w-3 h-3"/> העלאה
                          </button>
                          <button onClick={() => startMedicalAnalysis({ mode: 'INVOICE' })} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">
                            {medicalProcessingTarget === 'INVOICE' ? <Loader2 className="w-3 h-3 animate-spin" /> : '📄 ניתוח'}
                          </button>
                          <input ref={invoiceUploadRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={handleInvoiceUpload} />
                            </div>
                     )}

                     {/* File List */}
                     <div className="mt-2 space-y-2">
                        {data.invoiceFiles.map(file => (
                           <div key={file.id} className="flex items-center justify-between bg-panel p-2 rounded border shadow-sm text-xs">
                              <span className="flex items-center"><FileText className="w-3 h-3 mr-2 text-blue-500"/> {file.name}</span>
                              <button onClick={() => removeInvoice(file.id)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            ) : (
              <div className="relative">
                {/* Hebrew editor hidden when in English-only view */}
                {!(canEditEnglish && englishViewMode === 'ENGLISH_ONLY') && (
                  <AutoResizeTextarea
                    className="w-full border border-borderDark rounded-md p-4 min-h-[100px] text-right font-sans focus:ring-1 focus:ring-lpBlue outline-none transition-all"
                    dir="rtl"
                    value={data.content[sec] || ''}
                    onChange={(e: any) => handleContentChange(sec, e.target.value)}
                    disabled={isRestrictedUser}
                    readOnly={readOnly}
                    placeholder="Type Hebrew content here..."
                    style={{ lineHeight: '1.6', textAlign: 'justify' }}
                    textareaRef={(() => {
                      if (!sectionTextareaRefs.current[sec]) {
                        sectionTextareaRefs.current[sec] = React.createRef<HTMLTextAreaElement>();
                      }
                      return sectionTextareaRefs.current[sec];
                    })()}
                  />
                )}
                {canEditEnglish && (
                  <div className={englishViewMode === 'ENGLISH_ONLY' ? '' : 'mt-4 border-t pt-4'}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-textMuted uppercase block">
                        English Output (Editable)
                      </label>
                      {currentUser.role === 'ADMIN' &&
                        data.isTranslated &&
                        !sec.toLowerCase().includes('expenses') && (
                          <button
                            type="button"
                            onClick={() => handleImproveSection(sec)}
                            disabled={
                              !!improvingSectionKey &&
                              improvingSectionKey === sec
                            || !(data.translatedContent?.[sec] || '').trim()
                            }
                            className={`text-[11px] px-2 py-1 rounded-full border transition ${
                              improvingSectionKey === sec
                                ? 'border-emerald-400 text-emerald-600 bg-emerald-50 cursor-wait'
                                : (data.translatedContent?.[sec] || '').trim()
                                ? 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                                : 'border-borderDark text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {improvingSectionKey === sec ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Improving...
                              </span>
                            ) : (
                              'Improve this section'
                            )}
                          </button>
                        )}
                    </div>
                    <AutoResizeTextarea
                      className="w-full border border-indigo-200 rounded-md p-4 min-h-[100px] font-serif focus:ring-1 focus:ring-indigo-300 outline-none transition-all"
                      dir="ltr"
                      value={data.translatedContent?.[sec] || ''}
                      onChange={(e: any) => handleTranslatedChange(sec, e.target.value)}
                      placeholder="Translated text will appear here after Auto-Translate..."
                      readOnly={readOnly}
                      style={{ lineHeight: '1.6', textAlign: 'justify' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )})}
      </div>

      {currentUser.role === 'ADMIN' && isTemplateManagerOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40">
          <div className="bg-panel rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-textLight">Manage Templates</h3>
              <button
                type="button"
                onClick={() => setIsTemplateManagerOpen(false)}
                className="text-textMuted hover:text-textLight"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b flex items-center gap-3 text-xs">
              <label className="font-semibold text-textLight">
                Section:
                <select
                  className="ml-2 border border-borderDark rounded px-2 py-1 text-xs"
                  value={templateManagerSection}
                  onChange={(e) => setTemplateManagerSection(e.target.value)}
                >
                  {AVAILABLE_SECTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
              {(() => {
                const list = allSectionTemplates
                  .filter((t) => t.sectionKey === templateManagerSection)
                  .sort(
                    (a, b) =>
                      (a.orderIndex || 0) - (b.orderIndex || 0) ||
                      a.createdAt.localeCompare(b.createdAt),
                  );
                if (!list.length) {
                  return (
                    <p className="text-[11px] text-textMuted">
                      No templates defined yet for this section.
                    </p>
                  );
                }
                return list.map((tpl, idx) => (
                  <div
                    key={tpl.id}
                    className="border border-borderDark rounded-md p-2 bg-slate-50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        className="flex-1 border border-borderDark rounded px-2 py-1 text-xs"
                        value={tpl.title}
                        onChange={(e) =>
                          handleTemplateFieldChange(tpl.id, { title: e.target.value })
                        }
                      />
                      <label className="flex items-center gap-1 text-[11px] text-textLight">
                        <input
                          type="checkbox"
                          checked={tpl.isEnabled !== false}
                          onChange={(e) =>
                            handleTemplateFieldChange(tpl.id, {
                              isEnabled: e.target.checked,
                            })
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <textarea
                      className="w-full border border-borderDark rounded px-2 py-1 text-xs mt-1"
                      rows={3}
                      value={tpl.body}
                      onChange={(e) =>
                        handleTemplateFieldChange(tpl.id, { body: e.target.value })
                      }
                    />
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                          onClick={() => handleReorderTemplate(tpl.id, 'UP')}
                          disabled={idx === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                          onClick={() => handleReorderTemplate(tpl.id, 'DOWN')}
                          disabled={idx === list.length - 1}
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-red-200 text-[11px] text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm('Delete this template?')) {
                            handleDeleteTemplate(tpl.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {currentUser.role === 'ADMIN' && isBestPracticeManagerOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40">
          <div className="bg-panel rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-textLight">Manage Best Practices</h3>
              <button
                type="button"
                onClick={() => setIsBestPracticeManagerOpen(false)}
                className="text-textMuted hover:text-textLight"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b flex items-center gap-3 text-xs">
              <label className="font-semibold text-textLight">
                Section:
                <select
                  className="ml-2 border border-borderDark rounded px-2 py-1 text-xs"
                  value={bestPracticeManagerSection}
                  onChange={(e) => setBestPracticeManagerSection(e.target.value)}
                >
                  {AVAILABLE_SECTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
              {(() => {
                const list = bestPractices
                  .filter((bp) => bp.sectionKey === bestPracticeManagerSection)
                  .sort((a, b) => {
                    const aLabel = a.label === 'LLOYDS_RECOMMENDED' ? 0 : 1;
                    const bLabel = b.label === 'LLOYDS_RECOMMENDED' ? 0 : 1;
                    if (aLabel !== bLabel) return aLabel - bLabel;
                    const aUsage = a.usageCount || 0;
                    const bUsage = b.usageCount || 0;
                    return bUsage - aUsage;
                  });
                if (!list.length) {
                  return (
                    <p className="text-[11px] text-textMuted">
                      No best practices defined yet for this section.
                    </p>
                  );
                }
                return list.map((bp) => (
                  <div
                    key={bp.id}
                    className="border border-borderDark rounded-md p-2 bg-slate-50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        className="flex-1 border border-borderDark rounded px-2 py-1 text-xs"
                        value={bp.title}
                        onChange={(e) =>
                          handleBestPracticeFieldChange(bp.id, { title: e.target.value })
                        }
                      />
                      <select
                        className="border border-borderDark rounded px-2 py-1 text-[11px]"
                        value={bp.label}
                        onChange={(e) =>
                          handleBestPracticeFieldChange(bp.id, {
                            label:
                              e.target.value === 'LLOYDS_RECOMMENDED'
                                ? 'LLOYDS_RECOMMENDED'
                                : 'BEST_PRACTICE',
                          })
                        }
                      >
                        <option value="BEST_PRACTICE">Best practice</option>
                        <option value="LLOYDS_RECOMMENDED">Lloyds recommended</option>
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-textLight">
                        <input
                          type="checkbox"
                          checked={bp.isEnabled !== false}
                          onChange={(e) =>
                            handleToggleBestPracticeEnabled(bp.id, e.target.checked)
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <textarea
                      className="w-full border border-borderDark rounded px-2 py-1 text-xs mt-1"
                      rows={3}
                      value={bp.body}
                      onChange={(e) =>
                        handleBestPracticeFieldChange(bp.id, { body: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      className="w-full border border-borderDark rounded px-2 py-1 text-[11px] mt-1"
                      placeholder="Tags (comma separated)"
                      value={(bp.tags || []).join(', ')}
                      onChange={(e) =>
                        handleBestPracticeFieldChange(bp.id, {
                          tags: e.target.value
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2 text-[10px] text-textMuted">
                        <span>Usage: {bp.usageCount || 0}</span>
                        {bp.lastUsedAt && (
                          <span>
                            Last used:{' '}
                            {new Date(bp.lastUsedAt).toLocaleString('he-IL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-red-200 text-[11px] text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm('Delete this best practice?')) {
                            handleDeleteBestPractice(bp.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {isMySnippetsManagerOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40">
          <div className="bg-panel rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-textLight">בלוקים אישיים</h3>
              <button
                type="button"
                onClick={() => {
                  setIsMySnippetsManagerOpen(false);
                  setMySnippetDraft(null);
                }}
                className="text-textMuted hover:text-textLight"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-textMuted">
                  בלוקים אישיים זמינים רק לך וניתן להכניס אותם לכל דו״ח בלחיצה.
                </p>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700"
                  onClick={() =>
                    setMySnippetDraft({
                      id: undefined,
                      title: '',
                      sectionKey: '',
                      tagsInput: '',
                      body: '',
                    })
                  }
                >
                  בלוק חדש
                </button>
              </div>

              {mySnippets.length === 0 && (
                <p className="text-[11px] text-textMuted">
                  עדיין אין לך בלוקים אישיים. אפשר ליצור אחד דרך &quot;בלוק חדש&quot;.
                </p>
              )}

              {mySnippets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-textLight">בלוקים קיימים</h4>
                  <div className="space-y-1">
                    {mySnippets
                      .slice()
                      .sort((a, b) =>
                        (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
                      )
                      .map((snip) => (
                        <div
                          key={snip.id}
                          className="flex items-center justify-between gap-2 border border-borderDark rounded-md px-2 py-1 bg-slate-50"
                        >
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <span className="font-semibold text-textLight truncate">
                                {snip.title}
                              </span>
                              {snip.sectionKey && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-slate-100 text-textLight">
                                  {snip.sectionKey}
                                </span>
                              )}
                              {snip.tags && snip.tags.length > 0 && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-slate-100 text-textLight">
                                  {snip.tags.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                              onClick={() =>
                                setMySnippetDraft({
                                  id: snip.id,
                                  title: snip.title,
                                  sectionKey: snip.sectionKey || '',
                                  tagsInput: (snip.tags || []).join(', '),
                                  body: snip.body,
                                })
                              }
                            >
                              עריכה
                            </button>
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded border border-red-200 text-[11px] text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (window.confirm('Delete this personal snippet?')) {
                                  const updated = deletePersonalSnippet(currentUser.id, snip.id);
                                  setMySnippets(updated);
                                  if (mySnippetDraft && mySnippetDraft.id === snip.id) {
                                    setMySnippetDraft(null);
                                  }
                                }
                              }}
                            >
                              מחיקה
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {mySnippetDraft && (
                <form
                  className="border-t border-borderDark pt-3 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = mySnippetDraft.title.trim();
                    const body = mySnippetDraft.body.trim();
                    if (!title || !body) return;
                    const tags =
                      mySnippetDraft.tagsInput
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean) || [];
                    const updated = upsertPersonalSnippet(currentUser.id, {
                      id: mySnippetDraft.id,
                      title,
                      body,
                      sectionKey: mySnippetDraft.sectionKey || undefined,
                      tags,
                    });
                    setMySnippets(updated);
                    setMySnippetDraft(null);
                  }}
                >
                  <h4 className="text-[11px] font-semibold text-textLight">
                    {mySnippetDraft.id ? 'עריכת בלוק' : 'בלוק חדש'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block font-semibold text-textLight">כותרת</label>
                      <input
                        type="text"
                        className="w-full border border-borderDark rounded px-2 py-1 text-xs"
                        value={mySnippetDraft.title}
                        onChange={(e) =>
                          setMySnippetDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  title: e.target.value,
                                }
                              : prev,
                          )
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-semibold text-textLight">
                        סקשן (רשות)
                      </label>
                      <select
                        className="w-full border border-borderDark rounded px-2 py-1 text-xs"
                        value={mySnippetDraft.sectionKey}
                        onChange={(e) =>
                          setMySnippetDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sectionKey: e.target.value,
                                }
                              : prev,
                          )
                        }
                      >
                        <option value="">כל הסקשנים</option>
                        {AVAILABLE_SECTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-textLight">
                      תגיות (רשות, מופרדות בפסיקים)
                    </label>
                    <input
                      type="text"
                      className="w-full border border-borderDark rounded px-2 py-1 text-xs"
                      value={mySnippetDraft.tagsInput}
                      onChange={(e) =>
                        setMySnippetDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                tagsInput: e.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-semibold text-textLight">תוכן הבלוק</label>
                    <textarea
                      className="w-full border border-borderDark rounded px-2 py-1 text-xs"
                      rows={5}
                      value={mySnippetDraft.body}
                      onChange={(e) =>
                        setMySnippetDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                body: e.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-borderDark">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded border border-borderDark text-[11px] text-textLight hover:bg-slate-100"
                      onClick={() => setMySnippetDraft(null)}
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700"
                    >
                      שמירה
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {currentUser.role === 'ADMIN' && bestPracticeDraft && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40">
          <div className="bg-panel rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-textLight">Save Best Practice</h3>
              <button
                type="button"
                onClick={handleCancelBestPracticeDraft}
                className="text-textMuted hover:text-textLight"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <BestPracticeDraftForm
              onSubmit={handleSubmitBestPracticeDraft}
              onCancel={handleCancelBestPracticeDraft}
              initialTitle={bestPracticeDraft.body.split(/\s+/).slice(0, 6).join(' ')}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="flex items-center text-textMuted px-4 py-2 hover:bg-navySecondary rounded"><ChevronLeft className="mr-2 w-4 h-4" /> Back</button>
        <button onClick={onNext} className="flex items-center bg-navy text-white px-6 py-2 rounded hover:bg-navySecondary transition">Next Step <ChevronRight className="ml-2 w-4 h-4" /></button>
      </div>
    </div>
    </>
  );
};

// --- COMPONENT: FINANCE REQUEST MODAL ---
const FinanceRequestModal = ({
  onClose,
  onSubmit,
  currentUser,
  favoriteProviders = [],
  onSaveFavorite,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  currentUser: User;
  favoriteProviders?: ExpenseFavorite[];
  onSaveFavorite?: (favorite: ExpenseFavorite) => void;
}) => {
  const isLawyer = currentUser.role === 'LAWYER';
  const [lawyerId, setLawyerId] = useState(isLawyer ? currentUser.id : '');
  const [instructions, setInstructions] = useState('');
  const [odakanitNo, setOdakanitNo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [worksheetRows, setWorksheetRows] = useState<DraftWorksheetRow[]>([
    { id: makeId(), category: 'EXPERT_OUR', serviceProvider: '', amount: '' },
  ]);
  const [invoiceFiles, setInvoiceFiles] = useState<InvoiceFile[]>([]);
  const MAX_INVOICES = 4;

  const handleSubmit = async () => {
     if(!lawyerId || !odakanitNo) return;
     let fileData = null;
     const submitPayload = (attachment?: any) => onSubmit({ lawyerId, instructions, odakanitNo, file: attachment, worksheet: worksheetRows, invoiceFiles });
     if(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
           fileData = {
              name: file.name,
              type: file.type,
              data: (e.target?.result as string).split(',')[1]
           };
          submitPayload(fileData);
        };
        reader.readAsDataURL(file);
     } else {
        submitPayload();
     }
  };
  const handleInvoiceUploadFinance = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (invoiceFiles.length >= MAX_INVOICES) {
      alert('ניתן לצרף עד 4 חשבוניות.');
      e.target.value = '';
      return;
    }
    const allowed = Array.from(files).slice(0, MAX_INVOICES - invoiceFiles.length);
    const mapped = await Promise.all(
      allowed.map(
        (f) =>
          new Promise<InvoiceFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) =>
              resolve({
                id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: f.name,
                data: (ev.target?.result as string).split(',')[1],
                type: f.type,
              });
            reader.readAsDataURL(f);
          })
      )
    );
    setInvoiceFiles((prev) => [...prev, ...mapped]);
    e.target.value = '';
  };

  const removeFinanceInvoice = (id: string) => {
    setInvoiceFiles((prev) => prev.filter((f) => f.id !== id));
  };


  const updateWorksheetRow = (id: string, field: keyof DraftWorksheetRow, value: string) => {
    setWorksheetRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const addWorksheetRow = (type: ExpenseRowType) => {
    const option = EXPENSE_DETAIL_OPTIONS.find(opt => opt.type === type) || EXPENSE_DETAIL_OPTIONS[0];
    setWorksheetRows((rows) => [...rows, { id: makeId(), category: option.value, serviceProvider: '', amount: '', customLabel: '' }]);
  };

  const removeWorksheetRow = (id: string) => {
    setWorksheetRows((rows) => rows.length === 1 ? rows : rows.filter((row) => row.id !== id));
  };

  const previewRows = convertDraftRowsToWorksheetRows(worksheetRows, currentUser);
  const worksheetTotals = recalcWorksheetTotals(previewRows);

  return (
     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
        <div className="bg-panel p-6 rounded-lg shadow-xl w-96 animate-scale-in">
           <h3 className="font-bold text-lg mb-4 text-textLight">{isLawyer ? 'פתח תיק אישי' : 'Open New Finance Case'}</h3>
           <div className="space-y-3">
              <div>
                 <label className="block text-xs font-bold text-textMuted">Internal Case # (Odakanit)</label>
                 <input className="w-full border border-borderDark p-2 rounded bg-white text-slate-900 placeholder:text-slate-500" value={odakanitNo} onChange={e => setOdakanitNo(e.target.value)} placeholder="55492" />
              </div>
              {!isLawyer && (
                <>
              <div>
                 <label className="block text-xs font-bold text-textMuted">Assign Lawyer</label>
                 <select className="w-full border border-borderDark p-2 rounded bg-white text-slate-900" value={lawyerId} onChange={e => setLawyerId(e.target.value)}>
                    <option value="">-- Select --</option>
                    {USERS.filter(u => u.role === 'LAWYER').map(u => (
                       <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-textMuted">Instructions</label>
                <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
                  <textarea className="w-full border border-borderDark p-2 rounded bg-white text-slate-900 placeholder:text-slate-500" rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Notes for lawyer..."/>
                </GrammarlyEditorPlugin>
              </div>
              <div>
                 <label className="block text-xs font-bold text-textMuted">Attach Expenses File</label>
                 <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs"/>
              </div>
                  <div className="border rounded-lg p-3 bg-amber-50">
                     <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-amber-700">Expense Worksheet</label>
                        <div className="flex gap-2 text-xs text-amber-700 font-semibold">
                          <button type="button" onClick={() => addWorksheetRow('EXPENSE')} className="hover:underline">+ Expense</button>
                          <button type="button" onClick={() => addWorksheetRow('ADJUSTMENT')} className="hover:underline">+ Adjustment</button>
                        </div>
                     </div>
                     <div className="space-y-2 max-h-48 overflow-auto pr-1">
                        {worksheetRows.map((row) => {
                          const option = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === row.category);
                          const isExpenseRow = option?.type !== 'ADJUSTMENT';
                          const suggestions = favoriteProviders.filter(f => f.category === row.category || f.category === 'OTHER');
                          const convertedRow = convertDraftRowsToWorksheetRows([row], currentUser)[0];
                          return (
                            <div key={row.id} className="border border-amber-100 bg-panel rounded-lg p-2 space-y-2">
                              <div>
                                 <label className="block text-[10px] font-bold text-textMuted">Expense Details</label>
                                 <select value={row.category} onChange={(e) => updateWorksheetRow(row.id, 'category', e.target.value as ExpenseRowCategory)} className="w-full border border-borderDark rounded text-xs p-2 bg-white text-slate-900">
                                    {EXPENSE_DETAIL_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                 </select>
                              </div>
                              {row.category === 'OTHER' && (
                                <div>
                                   <label className="block text-[10px] font-bold text-textMuted">Custom Label</label>
                                   <input className="w-full border border-borderDark rounded text-xs p-2 bg-white text-slate-900 placeholder:text-slate-500" placeholder="Describe expense" value={row.customLabel || ''} onChange={(e) => updateWorksheetRow(row.id, 'customLabel', e.target.value)} />
                                </div>
                              )}
                              {isExpenseRow && (
                                <div>
                                   <label className="block text-[10px] font-bold text-textMuted">Service Provider</label>
                                   <input list={`provider-${row.id}`} className="w-full border border-borderDark rounded text-xs p-2 bg-white text-slate-900 placeholder:text-slate-500" placeholder="Provider name" value={row.serviceProvider} onChange={(e) => updateWorksheetRow(row.id, 'serviceProvider', e.target.value)} />
                                   <datalist id={`provider-${row.id}`}>
                                      {suggestions.map(fav => (
                                        <option key={fav.id} value={fav.serviceProvider}>{fav.label}</option>
                                      ))}
                                   </datalist>
                                   <button type="button" onClick={() => onSaveFavorite && row.serviceProvider.trim() && onSaveFavorite({
                                      id: makeId(),
                                      category: row.category,
                                      label: convertedRow?.label || 'Expense',
                                      serviceProvider: row.serviceProvider.trim(),
                                   })} className="text-[10px] text-amber-600 hover:underline mt-1">Save to favorites</button>
                                </div>
                              )}
                              <div>
                                 <label className="block text-[10px] font-bold text-textMuted">Cost (₪)</label>
                                 <input type="number" min="0" className="w-full border border-borderDark rounded text-xs p-2 bg-white text-slate-900 placeholder:text-slate-500" placeholder="₪" value={row.amount} onChange={e => updateWorksheetRow(row.id, 'amount', e.target.value)} />
                              </div>
                              <div className="text-right">
                                 <button type="button" onClick={() => removeWorksheetRow(row.id)} className="text-[10px] text-red-500 hover:underline">Remove</button>
                              </div>
                            </div>
                          );
                        })}
                     </div>
                     <div className="text-right text-xs font-bold text-amber-800 mt-2">Total balance preview: ₪{worksheetTotals.totalBalance.toLocaleString()}</div>
                  </div>
                  <div className="border rounded-lg p-3 bg-panel">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-textLight">Tax Invoices (PDF / Word)</label>
                      <span className="text-[11px] text-textMuted">{invoiceFiles.length}/{MAX_INVOICES}</span>
                    </div>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-borderDark border-dashed rounded-lg cursor-pointer bg-panel hover:bg-navySecondary">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-6 h-6 text-gray-400 mb-2" />
                        <p className="text-xs text-textMuted">צרפו חשבוניות מס (עד 4 קבצים)</p>
                      </div>
                      <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={handleInvoiceUploadFinance} />
                    </label>
                    <div className="mt-2 space-y-2 max-h-32 overflow-auto">
                      {invoiceFiles.map(file => (
                        <div key={file.id} className="flex items-center justify-between bg-navySecondary p-2 rounded border text-xs">
                          <span className="flex items-center gap-2 text-textLight"><FileText className="w-3 h-3 text-blue-500"/>{file.name}</span>
                          <button type="button" onClick={() => removeFinanceInvoice(file.id)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                        </div>
                      ))}
                      {invoiceFiles.length === 0 && <p className="text-xs text-gray-400 text-center">לא צורפו חשבוניות עדיין.</p>}
                    </div>
                  </div>
                </>
              )}
              {isLawyer && <p className="text-xs text-textMuted">המספר יעזור לסנכרן מול בעודכנית. אין צורך בשדות נוספים.</p>}
              <button onClick={handleSubmit} className="w-full bg-indigo-600 text-white py-2 rounded font-bold mt-2 hover:bg-indigo-700">{isLawyer ? 'Create Personal Folder' : 'Create Folder'}</button>
              <button onClick={onClose} className="w-full text-textMuted text-sm hover:underline mt-1">Cancel</button>
           </div>
        </div>
     </div>
  );
};

// --- DASHBOARD COMPONENT ---
const Dashboard = ({
  user,
  reports,
  onSelectReport,
  onNewReport,
  onLogout,
  onUpdateReport,
  onDeleteReport,
  onFinanceTaskCreate,
  onNotifyLawyerFromFinance,
  onSheetDeleted,
  caseTemplates = [],
  onStartTemplate,
  onStartNextReport,
  archiveAfterMs,
  favoriteProviders = {},
  onSaveFavorite,
  onDeleteFavorite,
  onOpenWorksheet,
  onRequestReminder,
  onRequestNote,
  onSoftDeleteReport,
  onRestoreReport,
  notifications = [],
  showNotifications,
  setShowNotifications,
  onClearNotifications,
  dailySummaryOptIn,
  setDailySummaryOptIn,
  caseFolders,
  onOpenCaseFolder,
  onOpenAssistant,
}: any) => {
  const isStaff = user.role === 'ADMIN' || user.role === 'SUB_ADMIN' || user.role === 'FINANCE';
  const isSoftDeleteRole = user.role === 'LAWYER' || user.role === 'SUB_ADMIN' || user.role === 'FINANCE';
  const canOpenFinanceCase = true; // כל התפקידים יכולים לפתוח תיק פיננסי חדש
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favoriteDraft, setFavoriteDraft] = useState<{ category: ExpenseRowCategory; label: string; provider: string }>({
    category: 'EXPERT_OUR',
    label: '',
    provider: '',
  });
  const [allReportsSearch, setAllReportsSearch] = useState('');
  const [expandedCaseKey, setExpandedCaseKey] = useState<string | null>(null);
  const isAdmin = user.role === 'ADMIN';
  const showExpensesSummary = user.role === 'SUB_ADMIN' || user.role === 'FINANCE';

  // Dedicated finance dashboard for Iris – focuses on FinancialExpenseSheet
  if (user.role === 'FINANCE') {
    const handleMarkReportPaidFromFinance = (reportId: string) => {
      onUpdateReport(reportId, { isPaid: true });
    };

    return (
      <FinanceExpensesDashboard
        user={user}
        reports={reports}
        onLogout={onLogout}
        onNotifyLawyer={onNotifyLawyerFromFinance}
        onMarkReportPaid={handleMarkReportPaidFromFinance}
        onSheetDeleted={onSheetDeleted}
        onOpenAssistant={() => onOpenAssistant && onOpenAssistant()}
        caseFolders={caseFolders}
      />
    );
  }

  if (!isStaff && user.role === 'LAWYER') {
    return (
      <LawyerDashboard
        user={user}
        reports={reports}
        caseFolders={caseFolders || {}}
        notifications={notifications}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        onClearNotifications={onClearNotifications}
        dailySummaryOptIn={dailySummaryOptIn}
        setDailySummaryOptIn={setDailySummaryOptIn}
        archiveAfterMs={archiveAfterMs}
        onSelectReport={onSelectReport}
        onNewReport={onNewReport}
            onOpenCaseFolder={onOpenCaseFolder}
        onLogout={onLogout}
        deleteReportById={onDeleteReport}
      />
    );
  }

  // Filter reports
  const now = Date.now();
  const archiveThreshold = archiveAfterMs ?? Number.MAX_SAFE_INTEGER;
  const shouldArchiveAdmin = (report: ReportData) =>
    report.status === 'SENT' &&
    report.sentAt &&
    (now - new Date(report.sentAt).getTime()) >= archiveThreshold;
  const visibleReports = isStaff ? reports : reports.filter((r: ReportData) => r.createdBy === user.id);
  const adminRecycleReports = visibleReports.filter(shouldArchiveAdmin);
  const adminActiveReports = visibleReports.filter((r: ReportData) => !shouldArchiveAdmin(r) && !r.deletedAt);
  const softDeletedReports = visibleReports.filter(
    (r: ReportData) => r.deletedAt && (now - new Date(r.deletedAt).getTime()) < LAWYER_RECYCLE_MS
  );
  const softActiveReports = visibleReports.filter((r: ReportData) => !r.deletedAt);
  const activeReports = isAdmin
    ? adminActiveReports
    : isSoftDeleteRole
      ? softActiveReports
      : visibleReports;
  const recycleReports = isAdmin
    ? adminRecycleReports
    : isSoftDeleteRole
      ? softDeletedReports
      : [];
  const lawyerAssignedReports = !isStaff ? reports.filter((r: ReportData) => r.status === 'READY_TO_SEND' && r.createdBy === user.id && !r.deletedAt) : [];
  const lawyerFinanceQueue = !isStaff
    ? reports.filter(
        (r: ReportData) =>
          ['TASK_ASSIGNED', 'WAITING_FOR_INVOICES'].includes(r.status) && r.createdBy === user.id && !r.deletedAt
      )
    : [];
  type SentReportEntry = {
    parent: ReportData;
    entry: PreviousReport;
    reportNumber: number;
    sentAt?: string;
    isLatest: boolean;
  };

  const buildReportHistoryList = (report: ReportData): PreviousReport[] => {
    if (report.reportHistory?.length) return report.reportHistory;
    if (report.status === 'SENT') {
      const fallbackDate = report.sentAt || report.reportDate || new Date().toISOString();
      return [
        {
          id: `${report.id}-legacy`,
          reportNumber: 1,
          subject: `${report.insurerName || 'Report'}${report.insuredName ? ` - ${report.insuredName}` : ''}`,
          date: fallbackDate,
          sent: true,
        },
      ];
    }
    return [];
  };

  const lawyerSentReports: SentReportEntry[] = !isStaff
    ? reports
        .filter((r: ReportData) => r.createdBy === user.id && !r.deletedAt)
        .flatMap((report) => {
          const historyList = buildReportHistoryList(report);
          if (!historyList.length) return [];
          return historyList.map((entry, index) => ({
            parent: report,
            entry,
            reportNumber: entry.reportNumber || index + 1,
            sentAt: entry.date || entry.snapshot?.createdAt || report.sentAt,
            isLatest: index === historyList.length - 1,
          }));
        })
        .sort((a, b) => {
          const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
          const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
          return bTime - aTime;
        })
    : [];
  const getLatestSentTimestamp = (report: ReportData) => {
    const historyList = buildReportHistoryList(report);
    const latestEntry = historyList[historyList.length - 1];
    const dateString = latestEntry?.date || report.sentAt;
    return dateString ? new Date(dateString).getTime() : 0;
  };
  const lawyerFollowupReports = !isStaff
    ? reports
        .filter((r: ReportData) => {
          if (r.createdBy !== user.id || r.deletedAt || r.status !== 'SENT') return false;
          return buildReportHistoryList(r).length > 0;
        })
        .sort((a, b) => getLatestSentTimestamp(b) - getLatestSentTimestamp(a))
    : [];
  type LawyerTaskSection = {
    id: 'ready' | 'finance' | 'followup' | 'sent';
    title: string;
    subtitle: string;
    items: Array<ReportData | SentReportEntry>;
    empty: string;
    actionLabel?: string;
    action?: (report: ReportData) => void;
    tone: string;
  };
  const lawyerTaskSections: LawyerTaskSection[] = !isStaff
    ? [
        {
          id: 'ready',
          title: 'דיווחים שטרם יצאו',
          subtitle: 'דיווחים שהועברו לליאור וממתינים לשליחה',
          items: lawyerAssignedReports,
          empty: 'אין דיווחים ממתינים כרגע.',
          actionLabel: 'פתח דיווח',
          action: (report: ReportData) => onSelectReport(report.id),
          tone: 'border-red-100',
        },
        {
          id: 'finance',
          title: 'דיווחים כספיים שצריך להכין',
          subtitle: 'משימות שקיבלת מלידור/איריס למשלוח דוח כספי',
          items: lawyerFinanceQueue,
          empty: 'אין בקשות כספיות חדשות.',
          actionLabel: 'התחל עבודה',
          action: (report: ReportData) => onSelectReport(report.id),
          tone: 'border-amber-100',
        },
        {
          id: 'followup',
          title: 'דו"חות המשך נדרשים',
          subtitle: 'פתח דו"ח חדש על בסיס הדו"ח האחרון שנשלח בתיק',
          items: lawyerFollowupReports,
          empty: 'אין דו"חות שנשלחו שממתינים להמשך.',
          actionLabel: 'דו"ח המשך',
          action: onStartNextReport ? (report: ReportData) => onStartNextReport(report.id) : undefined,
          tone: 'border-blue-100',
        },
        {
          id: 'sent',
          title: 'דיווחים שנשלחו',
          subtitle: 'דיווחים היסטוריים שנשלחו – ניתן להפיק דו"ח המשך לאחר שליחה',
          items: lawyerSentReports,
          empty: 'עוד לא נשלחו דיווחים מהחשבון שלך.',
          tone: 'border-green-100',
        },
      ]
    : [];
  const financeFolders = isStaff ? reports.filter((r: ReportData) => r.odakanitNo && !r.deletedAt) : [];
  const currentFavorites: ExpenseFavorite[] = favoriteProviders?.[user.id] || [];
  const handleAddFavoriteProvider = () => {
    if (!favoriteDraft.provider.trim()) return;
    const option = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === favoriteDraft.category);
    const label = favoriteDraft.label.trim() || option?.label || 'Favorite provider';
    onSaveFavorite && onSaveFavorite(user.id, {
      id: makeId(),
      category: favoriteDraft.category,
      label,
      serviceProvider: favoriteDraft.provider.trim(),
    });
    setFavoriteDraft({ category: favoriteDraft.category, label: '', provider: '' });
  };
  const handleRemoveFavorite = (favoriteId: string) => {
    onDeleteFavorite && onDeleteFavorite(user.id, favoriteId);
  };
  const userCaseTemplates = caseTemplates.filter((template: any) => template.ownerId === user.id);
  const expenseReports = reports.filter((r: ReportData) => hasExpenseData(r) && !r.deletedAt);
  const showExpensesOnly = user.role === 'FINANCE' || user.role === 'SUB_ADMIN';
  const canToggleRecycle = isAdmin || isSoftDeleteRole;
  const recycleInfoText = isAdmin
    ? `Items move here ${archiveAfterMs / (1000 * 60 * 60)}h after sending and are deleted after ${DELETE_AFTER_MS / (1000 * 60 * 60 * 24)} days.`
    : isSoftDeleteRole
      ? 'דיווחים שנמחקו נשמרים כאן במשך 7 ימים לפני מחיקה סופית.'
      : '';
  const expensesAssigned = expenseReports.filter((r: ReportData) => !['READY_TO_SEND', 'SENT'].includes(r.status));
  const expensesReady = expenseReports.filter((r: ReportData) => r.status === 'READY_TO_SEND');
  const expensesSent = expenseReports.filter((r: ReportData) => r.status === 'SENT');
  const totalSentBalance = expensesSent.reduce((acc: number, report: ReportData) => acc + getExpensesNumericTotal(report), 0);
  const getStatusBadgeClasses = (status: ReportStatus) => {
    if (status === 'SENT') return 'bg-gold/20 text-goldLight border-gold';
    if (status === 'READY_TO_SEND') return 'bg-danger/30 text-red-300 border-danger';
    return 'bg-navySecondary text-textMuted border-borderDark';
  };

  const formatStatusLabel = (status: ReportStatus) => {
    if (status === 'READY_TO_SEND') return 'READY TO SEND';
    return status.replace(/_/g, ' ');
  };

  const handleMarkPaid = (id: string) => {
     onUpdateReport(id, { isPaid: true });
  };

  const baseReportsForTable = showRecycleBin ? recycleReports : activeReports;
  const computeCaseKey = (entity: { createdBy?: string; odakanitNo?: string; marketRef?: string; id?: string; plaintiffName?: string }) => {
    const ownerPart = entity.createdBy || 'unknown';
    const casePart = entity.odakanitNo || entity.marketRef || entity.id || 'unknown';
    const plaintiffPart = (entity.plaintiffName || 'unknown').toLowerCase();
    return `${ownerPart}::${casePart}::${plaintiffPart}`;
  };

  const reportsForTable = showExpensesOnly ? baseReportsForTable.filter(hasExpenseData) : baseReportsForTable;
  const existingKeys = new Set(
    (!showExpensesOnly ? baseReportsForTable : []).map((r: ReportData) => computeCaseKey(r))
  );
  const templatePlaceholders = !isStaff && !showExpensesOnly
    ? caseTemplates
        .filter((template: CaseTemplate) => template.ownerId === user.id && !existingKeys.has(template.caseKey))
        .map((template: CaseTemplate) => ({
          id: `template-${template.caseKey}`,
          createdBy: template.ownerId,
          ownerName: template.ownerName,
          reportDate: template.lastUpdated,
          status: 'TASK_ASSIGNED' as ReportStatus,
          recipientId: '1',
          insurerName: template.insurerName || '',
          lineSlipNo: template.lineSlipNo || '',
          marketRef: template.marketRef || '',
          insuredName: template.insuredName || '',
          plaintiffName: template.plaintiffName || '',
          plaintiffTitle: template.plaintiffTitle || 'Plaintiff',
          odakanitNo: template.odakanitNo,
          selectedTimeline: 'standard',
          filenameTag: FILENAME_TAGS[0],
          selectedSections: ['Update'],
          content: {},
          translatedContent: {},
  expertSummaryMode: {},
          invoiceFiles: [],
          isWaitingForInvoices: false,
          isTranslated: false,
          expensesItems: [],
          expenseWorksheet: defaultExpenseWorksheet(),
          reportNotes: [],
          __templateKey: template.caseKey,
        }))
    : [];
  const reportsForDisplay: DashboardReportRow[] = showExpensesOnly ? reportsForTable : [...reportsForTable, ...templatePlaceholders];
  const searchTerm = allReportsSearch.trim().toLowerCase();
  const matchesAllReportsSearch = (report: DashboardReportRow) => {
    if (!searchTerm) return true;
    const haystack = `${report.odakanitNo || ''} ${report.insuredName || ''} ${report.plaintiffName || ''} ${report.ownerName || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  };
  const filteredReportsForDisplay = searchTerm ? reportsForDisplay.filter(matchesAllReportsSearch) : reportsForDisplay;
  type GroupedCaseReport = {
    key: string;
    odakanitNo: string;
    caseLabel: string;
    insuredName: string;
    plaintiffName: string;
    reports: DashboardReportRow[];
    latestDate: number;
  };

  const groupedCaseReports: GroupedCaseReport[] = !showExpensesOnly
    ? (() => {
        const map = new Map<
          string,
          GroupedCaseReport
        >();
        filteredReportsForDisplay.forEach((report: DashboardReportRow) => {
          if (report.__templateKey) return;
          const caseKey = report.odakanitNo || report.marketRef || report.insuredName || report.id;
          const latestDate = report.reportDate ? new Date(report.reportDate).getTime() : 0;
          const existing = map.get(caseKey);
          if (!existing) {
            map.set(caseKey, {
              key: caseKey,
              odakanitNo: report.odakanitNo || '',
              caseLabel: report.insuredName || report.plaintiffName || report.marketRef || '—',
              insuredName: report.insuredName || '',
              plaintiffName: report.plaintiffName || '',
              reports: [report],
              latestDate,
            });
          } else {
            existing.reports.push(report);
            if (latestDate > existing.latestDate) existing.latestDate = latestDate;
            if (!existing.caseLabel && (report.insuredName || report.plaintiffName)) {
              existing.caseLabel = report.insuredName || report.plaintiffName || existing.caseLabel;
            }
            if (!existing.insuredName && report.insuredName) existing.insuredName = report.insuredName;
            if (!existing.plaintiffName && report.plaintiffName) existing.plaintiffName = report.plaintiffName;
          }
        });
        return Array.from(map.values()).sort((a, b) => b.latestDate - a.latestDate);
      })()
    : [];

  const canDeleteDraftReport = (report: ReportData) => !['READY_TO_SEND', 'SENT'].includes(report.status);
  const handleDeleteDraftReport = (report: ReportData) => {
    if (!canDeleteDraftReport(report)) {
      alert('לא ניתן למחוק דיווח שכבר סומן כ-READY TO SEND או שנשלח.');
      return;
    }
    const label = report.insuredName || report.plaintiffName || report.odakanitNo || report.id;
    if (window.confirm(`למחוק את הדו"ח "${label}"? הפעולה אינה ניתנת לשחזור.`)) {
      onDeleteReport && onDeleteReport(report.id);
    }
  };

  useEffect(() => {
    if (!expandedCaseKey) return;
    if (!groupedCaseReports.some((group: GroupedCaseReport) => group.key === expandedCaseKey)) {
      setExpandedCaseKey(null);
    }
  }, [expandedCaseKey, groupedCaseReports]);

  return (
    <div className="min-h-screen bg-bgDark p-6 relative">
      {showUserGuide && <UserGuideModal onClose={() => setShowUserGuide(false)} />}
      
      {showFinanceModal && (
         <FinanceRequestModal 
          currentUser={user}
           onClose={() => setShowFinanceModal(false)} 
           onSubmit={(data) => { onFinanceTaskCreate(data); setShowFinanceModal(false); }}
          favoriteProviders={favoriteProviders[user.id] || []}
          onSaveFavorite={(favorite) => onSaveFavorite && onSaveFavorite(user.id, favorite)}
        />
      )}
      {showFavoritesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4">
          <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-textLight flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> ניהול ספקים מועדפים
              </h3>
              <button onClick={() => setShowFavoritesModal(false)} className="text-textMuted hover:text-textLight">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">קטגוריה</label>
                <select value={favoriteDraft.category} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, category: e.target.value as ExpenseRowCategory })} className="w-full border rounded text-sm p-2">
                  {EXPENSE_DETAIL_OPTIONS.filter(opt => opt.type === 'EXPENSE').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">שם לתצוגה</label>
                <input className="w-full border rounded text-sm p-2" value={favoriteDraft.label} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, label: e.target.value })} placeholder="לדוגמה: מומחה ניתוחים" />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted mb-1">שם ספק</label>
                  <input className="w-full border rounded text-sm p-2" value={favoriteDraft.provider} onChange={(e) => setFavoriteDraft({ ...favoriteDraft, provider: e.target.value })} placeholder='ד"ר יואב גרוסמן' />
              </div>
            </div>
            <div className="text-right">
              <button onClick={handleAddFavoriteProvider} className="bg-amber-500 text-white px-4 py-2 rounded font-bold hover:bg-amber-600">הוסף לרשימה</button>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
              {currentFavorites.length === 0 && <p className="text-sm text-gray-400 text-center py-6">אין ספקים מועדפים עדיין.</p>}
              {currentFavorites.map(fav => (
                <div key={fav.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-textLight">{fav.label}</p>
                    <p className="text-xs text-textMuted">{fav.serviceProvider}</p>
                  </div>
                  <button onClick={() => handleRemoveFavorite(fav.id)} className="text-xs text-red-500 hover:underline">הסר</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full px-6 md:px-8 lg:px-10 xl:px-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
           <div>
              <h1 className="text-3xl font-serif font-bold text-lpBlue">Lior Perry Law Office</h1>
              <p className="text-textMuted">Welcome back, <span className="font-bold">{user.name}</span> ({user.role})</p>
           </div>
           <div className="flex items-center gap-3 flex-wrap justify-end">
              {canToggleRecycle && (
                <button onClick={() => setShowRecycleBin((prev: boolean) => !prev)} className={`flex items-center px-4 py-2 rounded shadow text-sm font-bold ${showRecycleBin ? 'bg-gray-300 text-textLight' : 'bg-borderDark text-textLight'} hover:bg-borderDark`}>
                   <Trash2 className="w-4 h-4 mr-2"/> {showRecycleBin ? 'Back to Reports' : `Recycle Bin (${recycleReports.length})`}
                </button>
              )}
              {canOpenFinanceCase && (
                <button onClick={() => setShowFinanceModal(true)} className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold">
                   <Plus className="w-4 h-4 mr-2"/> Open New Case Folder
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAssistant && onOpenAssistant()}
                className="flex items-center text-indigo-700 bg-indigo-50 px-3 py-2 rounded hover:bg-indigo-100"
              >
                <Lightbulb className="w-4 h-4 mr-2" /> העוזר החכם
              </button>
              <div className="relative">
                <button onClick={() => setShowNotifications((prev: boolean) => !prev)} className="flex items-center text-blue-600 bg-blue-50 px-3 py-2 rounded hover:bg-blue-100 relative">
                   <Bell className="w-4 h-4 mr-2"/> Notifications
                   {notifications.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full px-1">{notifications.length}</span>}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-panel border border-borderDark shadow-xl rounded-lg z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-sm font-bold text-textLight">Smart Notifications</span>
                      <label className="text-xs text-textMuted flex items-center gap-1">
                        <input type="checkbox" checked={dailySummaryOptIn} onChange={e => setDailySummaryOptIn(e.target.checked)} />
                        Daily summary
                      </label>
                    </div>
                    <div className="max-h-64 overflow-auto divide-y">
                      {notifications.length === 0 && <div className="p-4 text-xs text-gray-400 text-center">No notifications yet.</div>}
                      {notifications.map((note: NotificationEntry) => (
                        <div key={note.id} className="p-3 text-sm">
                          <p className="font-medium text-textLight">{note.message}</p>
                          <p className="text-[10px] text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 text-right text-xs">
                      <button onClick={onClearNotifications} className="text-red-500 hover:underline">Clear all</button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowUserGuide(true)} className="flex items-center text-blue-600 bg-blue-50 px-3 py-2 rounded hover:bg-blue-100">
                 <HelpCircle className="w-4 h-4 mr-2"/> עזרה
              </button>
              {import.meta.env.DEV && (
                <button
                  onClick={() => {
                    resetAllAppData();
                    window.location.reload();
                  }}
                  className="flex items-center text-xs text-textMuted bg-navySecondary px-3 py-2 rounded hover:bg-borderDark border border-borderDark"
                >
                  Reset All Data (Dev)
                </button>
              )}
              <button onClick={onLogout} className="flex items-center text-red-600 hover:bg-red-50 px-4 py-2 rounded"><LogOut className="w-4 h-4 mr-2"/> Logout</button>
           </div>
        </div>

        {/* FINANCIAL TRACKER (Admin/Sub/Finance Only) */}
        {isStaff && (
           <FinancialTracker reports={reports} currentUser={user} onMarkPaid={handleMarkPaid} />
        )}

        {showExpensesSummary && (
          <div className="mb-8 bg-panel border border-amber-200 rounded-2xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-bold text-amber-700 flex items-center gap-2"><Receipt className="w-5 h-5"/> Expenses Overview</h3>
                <p className="text-sm text-textMuted">Tracking all reports that include expense tables. <span className="text-amber-600">כולל מידע היסטורי – לידיעה בלבד.</span></p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <button onClick={() => setShowFavoritesModal(true)} className="text-xs text-amber-700 underline hover:text-amber-900">
                  Manage Favorite Providers
                </button>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Assigned to Lawyers</p>
                  <p className="text-xl font-bold text-amber-700">{expensesAssigned.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Waiting for Lior</p>
                  <p className="text-xl font-bold text-blue-600">{expensesReady.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Sent to Insurer</p>
                  <p className="text-xl font-bold text-green-600">{expensesSent.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase text-gray-400">Total Sent Balance</p>
                  <p className="text-xl font-bold text-green-700">₪{totalSentBalance.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 text-amber-800">
                  <tr>
                    <th className="p-2 text-left">Case / Lawyer</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-right">Total Balance (₪)</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenseReports.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-gray-400">No expense reports yet.</td>
                    </tr>
                  )}
                  {expenseReports.map((report: ReportData) => (
                    <tr key={`expense-${report.id}`} className="hover:bg-amber-50 transition">
                      <td className="p-2">
                        <div className="font-semibold text-textLight">{report.insuredName || 'Unnamed Case'}</div>
                        <div className="text-xs text-textMuted">Lawyer: {report.ownerName}</div>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(report.status)}`}>
                          {formatStatusLabel(report.status)}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold">₪{getExpensesNumericTotal(report).toLocaleString()}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => onSelectReport(report.id)} className="text-lpBlue hover:underline text-xs font-bold">Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LAWYER URGENT TASKS */}
        {!isStaff && lawyerTaskSections.length > 0 && (
          <div className="space-y-6 mb-8">
            {lawyerTaskSections.map((section) => (
              <div key={section.id} className="bg-panel border rounded-2xl shadow-sm">
                <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 border-b">
                       <div>
                    <h3 className="font-bold text-textLight">{section.title}</h3>
                    <p className="text-sm text-textMuted">{section.subtitle}</p>
                          </div>
                       </div>
                {section.items.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">{section.empty}</div>
                ) : (
                  <div className="p-4 space-y-3">
                    {section.items.map((item: ReportData | SentReportEntry) => {
                      if (section.id === 'sent') {
                        const sentItem = item as SentReportEntry;
                        const sentDate = sentItem.sentAt ? new Date(sentItem.sentAt).toLocaleDateString('he-IL') : '—';
                        const canStartFollowUp =
                          sentItem.isLatest && sentItem.parent.status === 'SENT' && typeof onStartNextReport === 'function';
                        const hasActiveDraft = sentItem.isLatest && sentItem.parent.status !== 'SENT';
                        return (
                          <div key={`${sentItem.parent.id}-${sentItem.entry.id}`} className={`border ${section.tone} rounded-xl p-4`}>
                            <div className="grid md:grid-cols-4 gap-4 text-sm text-textMuted">
                              <div>
                                <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                                <p className="font-bold text-textLight">{sentItem.parent.odakanitNo || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">שם המבוטח</p>
                                <p className="font-bold text-textLight">{sentItem.parent.insuredName || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">{sentItem.parent.plaintiffTitle}</p>
                                <p className="font-bold text-textLight">{sentItem.parent.plaintiffName || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-400">דוח #{sentItem.reportNumber}</p>
                                <p className="font-bold text-textLight">{sentDate}</p>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-textMuted space-y-1">
                              <p><span className="font-semibold text-textLight">נושא:</span> {sentItem.entry.subject || '—'}</p>
                              {sentItem.entry.fileName && (
                                <p className="text-xs text-textMuted">שם קובץ: {sentItem.entry.fileName}</p>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 justify-end">
                              {canStartFollowUp && onStartNextReport && (
                              <button
                                  onClick={() => onStartNextReport(sentItem.parent.id)}
                                  className="px-4 py-2 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navySecondary"
                                >
                                  דו"ח המשך
                                </button>
                              )}
                              {hasActiveDraft && (
                              <span className="text-xs text-textMuted font-semibold px-3 py-1 rounded-full bg-navySecondary">
                                  דו"ח חדש בתהליך
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const reportItem = item as ReportData;
                      const iteration =
                        (typeof reportItem.reportNumber === 'number' && reportItem.reportNumber > 0)
                          ? reportItem.reportNumber
                          : (reportItem.reportHistory?.length || 0) + 1;
                      return (
                        <div key={reportItem.id} className={`border ${section.tone} rounded-xl p-4`}>
                          <div className="grid md:grid-cols-4 gap-4 text-sm text-textMuted">
                            <div>
                              <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                              <p className="font-bold text-textLight">{reportItem.odakanitNo || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">שם התובע</p>
                              <p className="font-bold text-textLight">{reportItem.plaintiffName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">שם המבוטח</p>
                              <p className="font-bold text-textLight">{reportItem.insuredName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-400">מספר דיווח</p>
                              <p className="font-bold text-textLight">#{iteration}</p>
                            </div>
                          </div>
                      {section.id === 'followup' && (
                        <div className="mt-2 text-xs text-textMuted">
                          {(() => {
                            const lastHistoryEntry =
                              reportItem.reportHistory?.[reportItem.reportHistory.length - 1];
                            const sentLabel = lastHistoryEntry?.date
                              ? new Date(lastHistoryEntry.date).toLocaleDateString('he-IL')
                              : reportItem.sentAt
                                ? new Date(reportItem.sentAt).toLocaleDateString('he-IL')
                                : '—';
                            return `דו"ח אחרון שנשלח: #${lastHistoryEntry?.reportNumber || iteration - 1} · ${sentLabel}`;
                          })()}
                        </div>
                      )}
                          <div className="mt-3 flex flex-wrap gap-2 justify-end">
                            {section.id === 'finance' && canDeleteDraftReport(reportItem) && (
                              <button
                                onClick={() => handleDeleteDraftReport(reportItem)}
                                className="px-3 py-2 rounded-full border border-red-200 text-red-600 text-sm font-semibold flex items-center gap-1 hover:bg-red-50"
                                title="מחק דיווח זה"
                              >
                                <Trash2 className="w-4 h-4" />
                                מחק
                              </button>
                            )}
                            {section.action && (
                              <button
                                onClick={() => section.action && section.action(reportItem)}
                                className="px-4 py-2 rounded-full bg-navy text-white text-sm font-semibold hover:bg-navySecondary"
                              >
                                {section.actionLabel}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
           </div>
        )}

        {/* FINANCE FOLDERS (ADMIN VIEW) */}
        {isStaff && (
           <div className="mb-8">
              <div className="flex justify-between items-end mb-4">
                  <h3 className="text-lg font-bold text-textLight flex items-center"><FolderOpen className="w-6 h-6 mr-2 text-indigo-600"/> Active Case Folders</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {financeFolders.length === 0 && <p className="text-gray-400 italic col-span-3 text-center py-4">No active finance folders.</p>}
                 {financeFolders.map((folder: ReportData) => {
                    const statusInfo = (() => {
                      switch (folder.status) {
                        case 'WAITING_FOR_INVOICES':
                          return { badge: 'bg-yellow-50 text-yellow-700', text: 'Awaiting Finance Finalize', icon: <Loader2 className="text-yellow-500 w-5 h-5 animate-spin" /> };
                        case 'TASK_ASSIGNED':
                          return { badge: 'bg-blue-50 text-blue-700', text: 'Pending Lawyer Action', icon: <ArrowRight className="text-blue-500 w-5 h-5" /> };
                        case 'READY_TO_SEND':
                          return { badge: 'bg-orange-50 text-orange-700', text: 'Waiting for Lior', icon: <Loader2 className="text-orange-500 w-5 h-5 animate-spin" /> };
                        case 'SENT':
                          return { badge: 'bg-green-50 text-green-700', text: 'Completed', icon: <Check className="text-green-500 w-6 h-6" /> };
                        default:
                          return { badge: 'bg-navySecondary text-textMuted', text: folder.status, icon: <Loader2 className="text-gray-400 w-5 h-5 animate-spin" /> };
                      }
                    })();
                    const assignedLawyer = USERS.find(u => u.id === folder.createdBy)?.name;
                    
                    return (
                      <div key={folder.id} className="bg-panel p-4 rounded-lg shadow border-t-4 relative border-indigo-100">
                          <div className="flex justify-between items-start mb-2">
                             <h4 className="font-bold text-lg">Case #{folder.odakanitNo}</h4>
                            {statusInfo.icon}
                          </div>
                          <div className="text-sm text-textMuted mb-1 flex items-center"><UserCheck className="w-4 h-4 mr-1"/> Assigned to: {assignedLawyer}</div>
                          <div className="text-xs text-textMuted mb-4">{new Date(folder.reportDate).toLocaleDateString()}</div>
                          
                          <div className="flex justify-end gap-2 mt-2">
                            {folder.status === 'SENT' ? (
                                <button onClick={() => onDeleteReport(folder.id)} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded text-sm flex items-center"><Trash2 className="w-4 h-4 mr-1"/> Delete Folder</button>
                             ) : (
                               <span className={`text-xs font-bold px-2 py-1 rounded ${statusInfo.badge}`}>{statusInfo.text}</span>
                             )}
                          </div>
                       </div>
                    );
                 })}
              </div>
           </div>
        )}

        {/* General Reports List (Existing) */}
        {(isStaff || showExpensesOnly) && (
        <div className="bg-panel rounded-xl shadow-sm border border-borderDark overflow-hidden">
           <div className="p-4 border-b border-gray-100 bg-navySecondary/50 flex flex-wrap gap-3 items-center justify-between">
              <h3 className="font-bold text-textLight flex items-center">
                <History className="w-4 h-4 mr-2 text-gray-400"/> {showRecycleBin ? 'Recycle Bin' : 'All Reports'}
              </h3>
              <div className="flex items-center gap-3 flex-wrap justify-end">
              {showRecycleBin && recycleInfoText && (
                <span className="text-xs text-textMuted">{recycleInfoText}</span>
                )}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={allReportsSearch}
                    onChange={(e) => setAllReportsSearch(e.target.value)}
                    placeholder="חיפוש לפי שם או מספר בעודכנית"
                    className="w-full border border-borderDark rounded-full pl-9 pr-10 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                  {allReportsSearch && (
                    <button
                      onClick={() => setAllReportsSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
              )}
           </div>
              </div>
           </div>
           {showExpensesOnly ? (
           <table className="w-full text-left">
              <thead className="bg-navySecondary text-textMuted text-xs uppercase tracking-wider font-semibold">
                 <tr>
                    <th className="p-4">Insurer / Subject</th>
                    {isStaff && <th className="p-4">Lawyer</th>}
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                 {filteredReportsForDisplay.length === 0 && (
                   <tr>
                     <td colSpan={isStaff ? 4 : 3} className="p-6 text-center text-gray-400 text-sm">
                       {searchTerm ? 'לא נמצאו דיווחים תואמים לחיפוש.' : 'אין דיווחים להצגה.'}
                     </td>
                   </tr>
                 )}
                 {filteredReportsForDisplay.map((r: DashboardReportRow) => {
                    const isReady = r.status === 'READY_TO_SEND';
                    const isSent = r.status === 'SENT';
                    const isTemplateRow = Boolean(r.__templateKey);
                    return (
                    <tr key={r.id} className={`transition cursor-default ${isReady ? 'bg-red-50 [&_.text-textLight]:text-gray-800 [&_.text-textMuted]:text-gray-600' : isSent ? 'bg-green-50/50 [&_.text-textLight]:text-gray-800 [&_.text-textMuted]:text-gray-600' : 'hover:bg-blue-50/30'}`}>
                       <td className="p-4">
                          <div className="font-bold text-textLight">{r.insurerName || 'Untitled'}</div>
                          <div className="text-xs text-textMuted">{r.marketRef} {r.insuredName ? ` - ${r.insuredName}` : ''}</div>
                       </td>
                       {isStaff && <td className="p-4 text-sm text-textMuted font-medium">{r.ownerName}</td>}
                       <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(r.status)}`}>
                             {formatStatusLabel(r.status)}
                          </span>
                       </td>
                       <td className="p-4 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                              <>
                                <button onClick={() => onOpenWorksheet(r.id)} className="text-xs bg-navySecondary hover:bg-borderDark px-3 py-1.5 rounded flex items-center gap-1">
                                   <Table className="w-3 h-3" /> View Expenses
                                </button>
                                <button onClick={() => onRequestReminder(r)} className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded flex items-center gap-1">
                                   <Bell className="w-3 h-3" /> Reminder
                                </button>
                                <button onClick={() => onRequestNote(r)} className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded flex items-center gap-1">
                                   <NotebookPen className="w-3 h-3" /> Add Note
                                </button>
                              </>
                            {isSoftDeleteRole && !isAdmin && !showRecycleBin && (
                              <button onClick={() => !isTemplateRow && onSoftDeleteReport(r.id)} disabled={isTemplateRow} className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${isTemplateRow ? 'bg-navySecondary text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                                 <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            )}
                            {showRecycleBin && (
                              <>
                                {isAdmin && (
                                  <button onClick={() => onUpdateReport(r.id, { sentAt: new Date().toISOString() })} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-sm font-bold">
                                     Restore
                                  </button>
                                )}
                                {!isAdmin && isSoftDeleteRole && (
                                  <button onClick={() => onRestoreReport(r.id)} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-sm font-bold">
                                     Restore
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                       </td>
                    </tr>
                )})}
              </tbody>
           </table>
           ) : (
             <div>
               {groupedCaseReports.length === 0 ? (
                 <div className="p-6 text-center text-gray-400 text-sm">
                   {searchTerm ? 'לא נמצאו דיווחים תואמים לחיפוש.' : 'אין דיווחים להצגה.'}
        </div>
               ) : (
                 <div className="divide-y divide-gray-100">
                   {groupedCaseReports.map((group: GroupedCaseReport) => {
                     const latestFormatted = group.latestDate ? new Date(group.latestDate).toLocaleDateString('he-IL') : '-';
                     const sortedReports = [...group.reports].sort((a, b) => {
                       const dateA = a.reportDate ? new Date(a.reportDate).getTime() : 0;
                       const dateB = b.reportDate ? new Date(b.reportDate).getTime() : 0;
                       return dateB - dateA;
                     });
                     return (
                       <div key={group.key} className="p-4">
                         <div className="flex flex-wrap justify-between gap-3">
                           <div>
                             <p className="text-xs uppercase text-gray-400">מספר בעודכנית</p>
                             <p className="text-xl font-bold text-textLight">{group.odakanitNo || '—'}</p>
                             <p className="text-xs text-textMuted">
                               שם התובע: <span className="font-semibold">{group.plaintiffName || '—'}</span> · שם המבוטח: <span className="font-semibold">{group.insuredName || '—'}</span>
                             </p>
                             <p className="text-xs text-gray-400">עודכן לאחרונה: {latestFormatted}</p>
                           </div>
                           <div className="text-right">
                             <p className="text-xs text-textMuted">סה"כ דיווחים</p>
                             <p className="text-2xl font-bold text-textLight">{group.reports.length}</p>
                             <button
                               onClick={() => setExpandedCaseKey((prev) => (prev === group.key ? null : group.key))}
                               className="mt-2 px-4 py-1.5 text-sm font-semibold rounded-full border border-borderDark text-textLight hover:bg-navySecondary"
                             >
                               {expandedCaseKey === group.key ? 'הסתר דיווחים' : 'צפה בדיווחים'}
                             </button>
                           </div>
                         </div>
                         {expandedCaseKey === group.key && (
                           <div className="mt-4 bg-navySecondary border border-borderDark rounded-xl overflow-hidden">
                             <table className="w-full text-sm">
                               <thead className="bg-navySecondary text-textMuted text-xs uppercase tracking-wide">
                                 <tr>
                                   <th className="p-3 text-left">תאריך דיווח</th>
                                   <th className="p-3 text-left">שם התובע</th>
                                   <th className="p-3 text-left">שם המבוטח</th>
                                   <th className="p-3 text-left">סטטוס</th>
                                   <th className="p-3 text-right">פעולות</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-gray-200">
                                 {sortedReports.map((report) => {
                                   const isReady = report.status === 'READY_TO_SEND';
                                   const isSent = report.status === 'SENT';
                                   const isTemplateRow = Boolean(report.__templateKey);
                                   return (
                                     <tr key={report.id} className={`bg-panel ${isReady ? 'bg-red-50 text-gray-900' : isSent ? 'bg-green-50/60 text-gray-900' : ''}`}>
                                       <td className="p-3">{report.reportDate ? new Date(report.reportDate).toLocaleDateString('he-IL') : '—'}</td>
                                       <td className="p-3">{report.plaintiffName || '—'}</td>
                                       <td className="p-3">{report.insuredName || '—'}</td>
                                       <td className="p-3">
                                         <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm border ${getStatusBadgeClasses(report.status)}`}>
                                           {formatStatusLabel(report.status)}
                                         </span>
                                       </td>
                                       <td className="p-3 text-right">
                                         <div className="flex justify-end gap-2 flex-wrap">
                                           <button onClick={() => onSelectReport(report.id)} className="text-lpBlue hover:bg-blue-50 px-3 py-1.5 rounded transition font-bold text-xs flex items-center">
                                             Open <ChevronRight className="w-3 h-3 ml-1" />
                                           </button>
                                           {isSoftDeleteRole && !isAdmin && !showRecycleBin && (
                                             <button
                                               onClick={() => !isTemplateRow && onSoftDeleteReport(report.id)}
                                               disabled={isTemplateRow}
                                               className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${
                                                 isTemplateRow ? 'bg-navySecondary text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'
                                               }`}
                                             >
                                               <Trash2 className="w-3 h-3" /> Delete
                                             </button>
                                           )}
                                           {showRecycleBin && (
                                             <>
                                               {isAdmin && (
                                                 <button onClick={() => onUpdateReport(report.id, { sentAt: new Date().toISOString() })} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-xs font-bold">
                                                   Restore
                                                 </button>
                                               )}
                                               {!isAdmin && isSoftDeleteRole && (
                                                 <button onClick={() => onRestoreReport(report.id)} className="text-green-600 hover:bg-green-50 px-3 py-1.5 rounded text-xs font-bold">
                                                   Restore
                                                 </button>
                                               )}
                                             </>
                                           )}
                                         </div>
                                       </td>
                                     </tr>
                                   );
                                 })}
                               </tbody>
                             </table>
                           </div>
                         )}
                       </div>
                     );
                   })}
                 </div>
               )}
             </div>
           )}
        </div>
        )}
        
        {!isStaff && (
          <div className="fixed bottom-8 right-8">
              <button onClick={onNewReport} className="bg-navy text-white p-4 rounded-full shadow-xl hover:bg-navySecondary transition transform hover:scale-110">
                  <FilePlus2 className="w-6 h-6"/>
              </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- LOGIN SCREEN ---
const LoginScreen = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      alert('נא להזין שם משתמש וסיסמה.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg = data?.error || 'שם המשתמש או הסיסמה שגויים.';
        alert(msg);
        return;
      }
      const data = await response.json();
      if (data && data.user) {
        onLogin(data.user);
      } else {
        alert('Login response was invalid.');
      }
    } catch (error) {
      console.error('Login failed', error);
      alert('התחברות נכשלה (שרת לא זמין?). נסה שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bgDark">
      <div className="w-full max-w-sm bg-panel border border-borderDark rounded-2xl p-10 text-center shadow-2xl">
        <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-gold/20 border border-gold flex items-center justify-center text-4xl font-bold text-gold shadow-lg">
          LP
        </div>
        <div className="text-sm tracking-[0.5em] text-gold uppercase mb-2">
          Lloyd&apos;s
        </div>
        <div className="text-3xl font-serif text-textLight mb-1">REPORT</div>
        <div className="text-xs text-textMuted uppercase tracking-[0.4em] mb-8">
          Builder System
        </div>

        <div className="space-y-4 text-left">
          <label className="text-xs uppercase text-textMuted tracking-[0.2em]">
            Username
          </label>
          <div className="relative">
            <UserIcon className="w-4 h-4 text-gold absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-full bg-navy border border-borderDark rounded-full py-3 pl-10 pr-4 text-textLight placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-gold/50"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <label className="text-xs uppercase text-textMuted tracking-[0.2em]">
            Password
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-gold absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              className="w-full bg-navy border border-borderDark rounded-full py-3 pl-10 pr-4 text-textLight placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-gold/50"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={isSubmitting}
          className="mt-8 w-full bg-navy text-gold border border-gold py-3 rounded-full font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-navySecondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Signing in…' : 'Sign In'} <ArrowRight className="w-4 h-4" />
        </button>

        <div className="mt-6 text-[11px] text-textMuted tracking-[0.3em] uppercase">
          Lior Perry Law Office &amp; Notary © 2024
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
type CaseTemplate = {
  caseKey: string;
  ownerId: string;
  ownerName: string;
  odakanitNo?: string;
  plaintiffName?: string;
  plaintiffTitle: 'Plaintiff' | 'Claimant';
  insurerName: string;
  lineSlipNo: string;
  marketRef: string;
  certificateRef?: string;
  insuredName: string;
  policyPeriodStart?: string;
  policyPeriodEnd?: string;
  retroStart?: string;
  retroEnd?: string;
  lastUpdated: string;
};

const AppInner = () => {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const [view, setView] = useState<'DASHBOARD' | 'STEP1' | 'STEP2' | 'PREVIEW' | 'CASE_FOLDER'>(() => loadStoredView());
   
  // Report State
  const [reports, setReports] = useState<ReportData[]>(() => loadStoredReports());
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null);
  const reportsRef = useRef<ReportData[]>(reports);
  const currentReportRef = useRef<ReportData | null>(currentReport);
  // Admin-only override to allow temporary edits on a specific locked (SENT) report.
  const [canEditLockedReportForId, setCanEditLockedReportForId] = useState<string | null>(null);

  // Debug: עקוב אחרי רינדור ה־App וה־view הנוכחי
  // eslint-disable-next-line no-console
  console.log('AppInner render', { currentUser, view, reportsCount: reports.length });
   const hydratedCurrentReport = useRef(false);
  const [step1Focus, setStep1Focus] = useState<null | 'REVIEW' | 'EXTERNAL_FEEDBACK'>(null);
   // Shared State for Timelines
   const [timelineGallery, setTimelineGallery] = useState<{id: string, name: string, src: string}[]>([]);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const isAdminUser = currentUser?.role === 'ADMIN';
  const [notifications, setNotifications] = useState<NotificationEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter(
            (n) =>
              n &&
              typeof n.id === 'string' &&
              typeof n.message === 'string' &&
              typeof n.createdAt === 'string',
          )
        : [];
    } catch {
      return [];
    }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [dailySummaryOptIn, setDailySummaryOptIn] = useState(false);
  const [worksheetSessions, setWorksheetSessions] = useState<{ reportId: string }[]>([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [favoriteProviders, setFavoriteProviders] = useState<Record<string, ExpenseFavorite[]>>(() => {
      if (typeof window === 'undefined') return {};
      try {
         const stored = localStorage.getItem('favoriteProviders');
         return stored ? JSON.parse(stored) : {};
      } catch (error) {
         console.error('Failed to load favorite providers', error);
         return {};
      }
  });

  // Rehydrate auth from server session on load (cookie). Prevents redirect to Login on refresh when session is valid.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setCurrentUser(data.user);
      })
      .catch(() => { /* not authenticated */ })
      .finally(() => {
        if (!cancelled) setAuthCheckDone(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Persist notifications so that messages from Iris נשמרות גם אחרי החלפת משתמש בדפדפן
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch {
      // ignore quota / storage errors
    }
  }, [notifications]);
  const [noteModalReport, setNoteModalReport] = useState<ReportData | null>(null);
  const [noteMessage, setNoteMessage] = useState('');
  const [reminderModalReport, setReminderModalReport] = useState<ReportData | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderTarget, setReminderTarget] = useState<'LAWYER' | 'SUB_ADMIN' | 'BOTH'>('LAWYER');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isImprovingEnglish, setIsImprovingEnglish] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [mailConfig, setMailConfig] = useState<{ mode: string; to: string[]; cc: string[] } | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isResendMode, setIsResendMode] = useState(false);
  const [isFileNameModalOpen, setIsFileNameModalOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantResponse, setAssistantResponse] = useState<AssistantHelpResponse | null>(null);
   const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>(() => {
      if (typeof window === 'undefined') return [];
      try {
         const stored = localStorage.getItem('caseTemplates');
         return stored ? JSON.parse(stored) : [];
      } catch (error) {
         console.error('Failed to load case templates', error);
         return [];
      }
   });
  const [currentCaseOdakanitNo, setCurrentCaseOdakanitNo] = useState<string | null>(null);
  const [newCaseOdakanitInput, setNewCaseOdakanitInput] = useState('');
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);

  type PreSendIssueKind = 'TRANSLATION_OUTDATED' | 'TONE_RISK_NOT_RUN' | 'EXPENSES_OLD';

  type PreSendIssue = {
    id: string;
    kind: PreSendIssueKind;
    label: string;
    intent: AssistantIntent;
  };

  const [preSendGuard, setPreSendGuard] = useState<{
    issues: PreSendIssue[];
    onContinue?: () => void;
  } | null>(null);

  const [activeSectionKey, setActiveSectionKey] = useState<string | undefined>(undefined);

  // Guardrail: ensure Admin override never "floats" to a different report.
  useEffect(() => {
    if (!currentReport && canEditLockedReportForId !== null) {
      setCanEditLockedReportForId(null);
      return;
    }
    if (currentReport && canEditLockedReportForId && currentReport.id !== canEditLockedReportForId) {
      setCanEditLockedReportForId(null);
    }
  }, [currentReport, canEditLockedReportForId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (wasCaseFoldersMigrated()) return;
    if (!reports.length) return;

    setCaseFolders((prev) => {
      const next = migrateCaseFoldersFromReportsOnceInMap(prev, reports);
      saveCaseFolders(next);
      markCaseFoldersMigrated();
      return next;
    });
  }, [reports]);
  const [caseFolders, setCaseFolders] = useState<Record<string, CaseFolder>>(() => {
    const loaded = loadCaseFolders();
    const canonical = canonicalizeCaseFoldersKeys(loaded);
    if (canonical !== loaded) {
      saveCaseFolders(canonical);
    }
    return canonical;
  });
  const caseFoldersRef = useRef<Record<string, CaseFolder>>(caseFolders);

  useEffect(() => {
    reportsRef.current = reports;
    currentReportRef.current = currentReport;
    caseFoldersRef.current = caseFolders;
  }, [reports, currentReport, caseFolders]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const rep = reportsRef.current;
      const cur = currentReportRef.current;
      const cf = caseFoldersRef.current;
      if (rep && cur) {
        const mergedReports = [...rep];
        const idx = mergedReports.findIndex((r) => r.id === cur.id);
        const merged = idx >= 0 ? { ...mergedReports[idx], ...cur } : cur;
        if (idx >= 0) mergedReports[idx] = merged;
        else mergedReports.push(merged);
        try {
          localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(mergedReports));
        } catch (err) {
          console.error('beforeunload save failed', err);
        }
      }
      if (cf) {
        try {
          saveCaseFolders(cf);
        } catch (err) {
          console.error('beforeunload save caseFolders failed', err);
        }
      }
      if (rep?.length || cur) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const persistToLocalStorage = () => {
      const rep = reportsRef.current;
      const cur = currentReportRef.current;
      const cf = caseFoldersRef.current;
      if (rep && cur) {
        const mergedReports = [...rep];
        const idx = mergedReports.findIndex((r) => r.id === cur.id);
        const merged = idx >= 0 ? { ...mergedReports[idx], ...cur } : cur;
        if (idx >= 0) mergedReports[idx] = merged;
        else mergedReports.push(merged);
        try {
          localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(mergedReports));
        } catch (err) {
          console.error('visibility/pagehide save reports failed', err);
        }
      }
      if (cf) {
        try {
          saveCaseFolders(cf);
        } catch (err) {
          console.error('visibility/pagehide save caseFolders failed', err);
        }
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistToLocalStorage();
    };
    const handlePageHide = () => persistToLocalStorage();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentUser]);

  useEffect(() => {
    if (view !== 'PREVIEW') {
      setIsPreviewVisible(false);
    }
  }, [view]);

  const mapUserRoleToAssistantRole = (role?: User['role']): AssistantRole => {
    if (!role) return 'LAWYER';
    if (role === 'SUB_ADMIN') return 'OPS';
    if (role === 'FINANCE' || role === 'LAWYER' || role === 'ADMIN') return role;
    return 'LAWYER';
  };

   const shouldHardDeleteReport = (report: ReportData) => {
      if (report.deletedAt) {
         return Date.now() - new Date(report.deletedAt).getTime() >= LAWYER_RECYCLE_MS;
      }
      if (report.status === 'SENT' && report.sentAt) {
         return Date.now() - new Date(report.sentAt).getTime() >= DELETE_AFTER_MS;
      }
      return false;
   };

   useEffect(() => {
      const cleanup = () => {
         setReports(prev => prev.filter(r => !shouldHardDeleteReport(r)));
      };
      cleanup();
      const interval = setInterval(cleanup, 60 * 60 * 1000);
      return () => clearInterval(interval);
   }, []);

   useEffect(() => {
      if (!dailySummaryOptIn) return;
      const interval = setInterval(() => {
        if (!reports.length) return;
        const ready = reports.filter(r => r.status === 'READY_TO_SEND').length;
        const sent = reports.filter(r => r.status === 'SENT').length;
        const message = `Daily summary: ${ready} ready to send, ${sent} sent reports.`;
        setNotifications(prev => [{ id: `daily-${Date.now()}`, message, createdAt: new Date().toISOString(), severity: 'info' }, ...prev]);
      }, 1000 * 60 * 60 * 12);
      return () => clearInterval(interval);
   }, [dailySummaryOptIn, reports]);

   useEffect(() => {
      try {
         localStorage.setItem('caseTemplates', JSON.stringify(caseTemplates));
      } catch (error) {
         console.error('Failed to persist case templates', error);
      }
   }, [caseTemplates]);

   useEffect(() => {
      try {
         localStorage.setItem('favoriteProviders', JSON.stringify(favoriteProviders));
      } catch (error) {
         console.error('Failed to persist favorites', error);
      }
   }, [favoriteProviders]);

  const handleRunAssistantIntent = async (intent: AssistantIntent) => {
    if (!currentUser || !currentReport) {
      setIsAssistantOpen(true);
      setAssistantError(null);
      setAssistantResponse({
        title: 'אין דו״ח פעיל כרגע',
        bullets: [
          'כדי להשתמש בעוזר החכם יש לבחור דו״ח קיים או לפתוח דו״ח חדש.',
          'חזרי ללוח הבקרה, בחרי דו״ח מהרשימה או פתחי דו״ח חדש בהתאם לצורך.',
          'לאחר בחירת דו״ח, ניתן לפתוח שוב את העוזר החכם ולקבל הנחיות למסך הרלוונטי.',
        ],
      });
      return;
    }

    const step: 1 | 2 | 3 =
      view === 'STEP2' ? 2 : view === 'PREVIEW' ? 3 : 1;

    const screen =
      view === 'STEP1'
        ? 'Step1'
        : view === 'STEP2'
        ? 'Step2Draft'
        : view === 'PREVIEW'
        ? 'Step3Preview'
        : 'Dashboard';

    const context = {
      step,
      role: mapUserRoleToAssistantRole(currentUser.role),
      screen,
      section: step === 2 && activeSectionKey ? activeSectionKey : undefined,
    };

    const reportMeta = {
      hebrewApproved: currentReport.hebrewWorkflowStatus === 'HEBREW_APPROVED',
      hasTranslation: Boolean(currentReport.isTranslated),
      translationOutdated: Boolean(currentReport.translationStale),
      toneRiskRun: Boolean(currentReport.toneRiskLastRunAt),
      expensesLastUpdatedAt: currentReport.expensesSnapshotAt || undefined,
    };

    setIsAssistantOpen(true);
    setAssistantLoading(true);
    setAssistantError(null);

    try {
      const resp = await requestAssistantHelp({
        intent,
        context,
        reportMeta,
      });
      setAssistantResponse(resp);
    } catch (error) {
      console.error('Smart assistant request failed', error);
      const msg = error instanceof Error ? error.message : 'REQUEST_FAILED';
      setAssistantError(msg === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : msg === 'SERVER_ERROR' ? 'SERVER_ERROR' : 'REQUEST_FAILED');
      setAssistantResponse(null);
    } finally {
      setAssistantLoading(false);
    }
  };

  const computePreSendIssues = (report: ReportData | null, user: User | null): PreSendIssue[] => {
    if (!report || !user) return [];

    const issues: PreSendIssue[] = [];

    if (report.translationStale) {
      issues.push({
        id: 'translation-outdated',
        kind: 'TRANSLATION_OUTDATED',
        label: 'האנגלית מבוססת על גרסת עברית ישנה יותר (translationStale=true). מומלץ לעדכן תרגום לפני שליחה.',
        intent: 'pre_send_checks',
      });
    }

    const role = user.role;
    const roleIsLawyerOrAdmin = role === 'LAWYER' || role === 'ADMIN';

    if (roleIsLawyerOrAdmin && !report.toneRiskLastRunAt) {
      issues.push({
        id: 'tone-risk-not-run',
        kind: 'TONE_RISK_NOT_RUN',
        label: 'לא נמצאה בדיקת Tone & Risk לדו״ח זה. מומלץ להריץ בדיקה אחת לפחות לפני שליחה.',
        intent: 'explain_tone_risk',
      });
    }

    return issues;
  };

  // Migration: השלים expensesHtml לכל דו"ח פיננסי שמבוסס על expensesSheetId
  // ואין לו עדיין טבלת HTML מוכנה. Snapshot רך: לא דורס קיים, לא מתקן דיווחים שנשלחו.
  useEffect(() => {
    let cancelled = false;

    const migrateMissingExpensesHtml = async () => {
      if (typeof window === 'undefined') return;
      const targets = reports.filter(
        (r) =>
          !!r.expensesSheetId &&
          !r.expensesHtml &&
          !r.expensesHtmlMissing &&
          r.status !== 'SENT',
      );
      if (!targets.length) return;

      let changed = false;
      const nextReports = [...reports];

      for (const target of targets) {
        try {
          const relations = await financialExpensesClient.getSheet(
            target.expensesSheetId!,
          );
          if (relations && relations.sheet && relations.lineItems?.length) {
            const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
              relations.sheet.id,
              new Date().toISOString(),
            );
            if (!snapshot) continue;
            const { effectiveSheet, allLines, opts } = snapshot;
            const { html } = renderExpensesTableHtml(effectiveSheet, allLines, opts);
            if (html) {
              const idx = nextReports.findIndex((r) => r.id === target.id);
              if (idx !== -1) {
                nextReports[idx] = {
                  ...nextReports[idx],
                  expensesHtml: html,
                };
                changed = true;
              }
            }
          } else {
            const idx = nextReports.findIndex((r) => r.id === target.id);
            if (idx !== -1) {
              nextReports[idx] = {
                ...nextReports[idx],
                expensesHtmlMissing: true,
              };
              changed = true;
            }
          }
        } catch (err) {
          console.error(
            'Failed to migrate expensesHtml for report',
            target.id,
            err,
          );
          const idx = nextReports.findIndex((r) => r.id === target.id);
          if (idx !== -1) {
            nextReports[idx] = {
              ...nextReports[idx],
              expensesHtmlMissing: true,
            };
            changed = true;
          }
        }
      }

      if (!cancelled && changed) {
        setReports(nextReports);
      }
    };

    void migrateMissingExpensesHtml();

    return () => {
      cancelled = true;
    };
  }, [reports]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
    } catch (error) {
      console.error('Failed to persist reports', error);
    }
  }, [reports]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUser) {
      localStorage.setItem(STORAGE_KEYS.USER, currentUser.username);
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.VIEW, view);
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentReport) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, currentReport.id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
    }
  }, [currentReport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedCurrentReport.current) return;
    const storedId = localStorage.getItem(STORAGE_KEYS.CURRENT_REPORT);
    if (!storedId) {
      hydratedCurrentReport.current = true;
      return;
    }
    const match = reports.find((report) => report.id === storedId);
    if (match) {
      // Auto-repair: ensure canonical expenses section exists when a Finance table is linked
      const hasFinanceExpenses = Boolean(match.expensesSheetId || match.expensesHtml);
      let next: ReportData = match;
      if (
        hasFinanceExpenses &&
        Array.isArray(match.selectedSections) &&
        !match.selectedSections.some((s) => isCanonicalExpensesSection(s))
      ) {
        const baseSections = [...match.selectedSections];
        const hasUpdate = baseSections.includes('Update');
        const hasRecommendations = baseSections.includes('Recommendations');
        const insertIndex = hasUpdate
          ? Math.min(
              baseSections.indexOf('Update') + 1,
              hasRecommendations ? baseSections.indexOf('Recommendations') : baseSections.length,
            )
          : 0;
        baseSections.splice(insertIndex, 0, CANONICAL_EXPENSES_SECTION);
        next = {
          ...match,
          selectedSections: Array.from(new Set(baseSections)),
        };
      }
      setCurrentReport(next);
    }
    hydratedCurrentReport.current = true;
  }, [reports, currentUser]);

  useEffect(() => {
    // מסך תיק עודכנית (CASE_FOLDER) לא תלוי ב־currentReport, ולכן לא מחזירים ממנו לדשבורד אוטומטית.
    if (view === 'DASHBOARD' || view === 'CASE_FOLDER') return;
    if (currentReport) return;
    setView('DASHBOARD');
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.VIEW, 'DASHBOARD');
      localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
    }
  }, [currentReport, view]);

  const createNewReport = (): ReportData => ({
    id: Date.now().toString(),
    createdBy: currentUser!.id,
    ownerName: currentUser!.name,
    ownerEmail: currentUser!.email,
    // Default – will be overridden for existing cases with history
    reportNumber: 1,
    reportDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'DRAFT',
    reportSubject: '',
    recipientId: '1',
    insurerName: '',
    lineSlipNo: '',
    marketRef: '',
    certificateRef: '',
    insuredName: '',
    plaintiffName: '',
    plaintiffTitle: 'Plaintiff',
    policyPeriodStart: '',
    policyPeriodEnd: '',
    retroStart: '',
    retroEnd: '',
    sentAt: undefined,
    reportHistory: [],
    selectedTimeline: 'standard',
    filenameTag: FILENAME_TAGS[0],
    selectedSections: ['Update'],
    content: {},
    translatedContent: {},
    invoiceFiles: [],
    isWaitingForInvoices: false,
    requiresExpenses: false,
    isTranslated: false,
    expensesItems: [],
    expenseWorksheet: defaultExpenseWorksheet(),
    reportNotes: [],
    complaintAnalysis: undefined,
    // By default, when a new report is created we assume policy (if present)
    // should be attached as Appendix A to the final PDF. This can be toggled in Step 1.
    attachPolicyAsAppendix: true,
  });

  const getNextReportNumberForCase = ({
    odakanitNo,
    reports: allReports,
    caseFolder,
  }: {
    odakanitNo: string;
    reports: ReportData[];
    caseFolder?: CaseFolder;
  }): number => {
    const key = normalizeOdakanitNo(odakanitNo);
    if (!key) return 1;

    const numbers: number[] = [];

    if (caseFolder?.sentReports?.length) {
      caseFolder.sentReports.forEach((sr) => {
        if (typeof sr.reportNo === 'number' && sr.reportNo > 0) {
          numbers.push(sr.reportNo);
        }
      });
    }

    allReports.forEach((r) => {
      if (normalizeOdakanitNo(r.odakanitNo) !== key) return;
      // לצורך קביעת מספור – מתייחסים רק לדו"חות שנשלחו בפועל (SENT),
      // טיוטות חדשות אינן אמורות "לקפוץ" את המספר הבא.
      if (r.status !== 'SENT') return;
      if (typeof r.reportNumber === 'number' && r.reportNumber > 0) {
        numbers.push(r.reportNumber);
      } else {
        const fallback = (r.reportHistory?.length || 0) + 1;
        numbers.push(fallback);
      }
    });

    const max = numbers.length ? Math.max(...numbers) : 0;
    return max + 1;
  };

   const buildCaseKey = (report: ReportData) => {
      const ownerPart = report.createdBy || 'unknown';
      const casePart = report.odakanitNo || report.marketRef || report.id;
      const plaintiffPart = (report.plaintiffName || 'unknown').toLowerCase();
      return `${ownerPart}::${casePart}::${plaintiffPart}`;
   };

   const persistCaseTemplate = (report: ReportData) => {
      const caseKey = buildCaseKey(report);
      const template: CaseTemplate = {
         caseKey,
         ownerId: report.createdBy,
         ownerName: report.ownerName,
         odakanitNo: report.odakanitNo,
         plaintiffName: report.plaintiffName,
         plaintiffTitle: report.plaintiffTitle,
         insurerName: report.insurerName,
         lineSlipNo: report.lineSlipNo,
         marketRef: report.marketRef,
         certificateRef: report.certificateRef,
         insuredName: report.insuredName,
      policyPeriodStart: report.policyPeriodStart,
      policyPeriodEnd: report.policyPeriodEnd,
      retroStart: report.retroStart,
      retroEnd: report.retroEnd,
         lastUpdated: new Date().toISOString()
      };
      setCaseTemplates(prev => {
         const exists = prev.find(t => t.caseKey === caseKey);
         if (exists) {
            return prev.map(t => t.caseKey === caseKey ? template : t);
         }
         return [...prev, template];
      });
   };

   const startReportFromTemplate = (caseKey: string) => {
      if (!currentUser) return;
      const template = caseTemplates.find(t => t.caseKey === caseKey && t.ownerId === currentUser.id);
      if (!template) return;
      const newReport = {
         ...createNewReport(),
         odakanitNo: template.odakanitNo || '',
         insurerName: template.insurerName || '',
         lineSlipNo: template.lineSlipNo || '',
         marketRef: template.marketRef || '',
         certificateRef: template.certificateRef || '',
         insuredName: template.insuredName || '',
         plaintiffName: template.plaintiffName || '',
         plaintiffTitle: template.plaintiffTitle || 'Plaintiff',
         policyPeriodStart: template.policyPeriodStart || '',
         policyPeriodEnd: template.policyPeriodEnd || '',
         retroStart: template.retroStart || '',
         retroEnd: template.retroEnd || ''
      };
      setCurrentReport(newReport);
      setView('STEP1');
   };

  const startNextReport = (reportId: string) => {
    if (!currentUser) return;
    const report = getReportById(reportId);
    if (!report) return;
    if (report.createdBy !== currentUser.id) return;
    if ((report.reportHistory?.length || 0) === 0) return;
    if (report.status !== 'SENT') return;
    const latestEntry = report.reportHistory[report.reportHistory.length - 1];
    if (!latestEntry) return;
    const snapshotSource = latestEntry.snapshot;
    const metadataSource = snapshotSource || report;
    const nextSections =
      metadataSource.selectedSections && metadataSource.selectedSections.length
        ? [...metadataSource.selectedSections]
        : [...(report.selectedSections || [])];
    const normalizedSections = nextSections.length ? nextSections : ['Update', 'Recommendations'];
    const nowIso = new Date().toISOString();
    const nextReport: ReportData = {
      ...report,
      reportDate: nowIso,
      updatedAt: nowIso,
      status: 'DRAFT',
      sentAt: undefined,
      reportNotes: [],
      content: {},
      translatedContent: {},
      executiveSummary: undefined,
      complaintAnalysis: undefined,
      expensesItems: [],
      expensesSum: undefined,
      paymentRecommendation: undefined,
      expenseWorksheet: defaultExpenseWorksheet(),
      invoiceFiles: [],
      expensesSourceFile: undefined,
      requiresExpenses: false,
      isWaitingForInvoices: false,
      isTranslated: false,
      selectedEmailTemplate: undefined,
      emailBodyDraft: undefined,
      fileNameTitles: [],
      deletedAt: undefined,
      deletedBy: undefined,
      selectedSections: normalizedSections,
      reportHistory: [...(report.reportHistory || [])],
    };

    nextReport.insurerName = metadataSource.insurerName || '';
    nextReport.lineSlipNo = metadataSource.lineSlipNo || '';
    nextReport.marketRef = metadataSource.marketRef || '';
    nextReport.certificateRef = metadataSource.certificateRef || '';
    nextReport.insuredName = metadataSource.insuredName || '';
    nextReport.plaintiffName = metadataSource.plaintiffName || '';
    nextReport.plaintiffTitle = metadataSource.plaintiffTitle || report.plaintiffTitle;
    nextReport.policyPeriodStart = metadataSource.policyPeriodStart || '';
    nextReport.policyPeriodEnd = metadataSource.policyPeriodEnd || '';
    nextReport.retroStart = metadataSource.retroStart || '';
    nextReport.retroEnd = metadataSource.retroEnd || '';
    nextReport.filenameTag = metadataSource.filenameTag || nextReport.filenameTag;
    nextReport.fileNameTitles = [];
    nextReport.selectedTimeline = metadataSource.selectedTimeline || nextReport.selectedTimeline;
    nextReport.selectedTimelineImage = metadataSource.selectedTimelineImage;
    nextReport.odakanitNo = metadataSource.odakanitNo || report.odakanitNo;
    nextReport.recipientId = metadataSource.recipientId || report.recipientId;

    setReports(prev => prev.map(r => (r.id === report.id ? nextReport : r)));
    setCurrentReport(nextReport);
    persistCaseTemplate(nextReport);
    setView('STEP1');
  };

   const getReportById = (reportId: string) => reports.find(report => report.id === reportId);

  const hasSignificantChanges = (prev: ReportData, next: ReportData): boolean => {
    if (prev.status !== next.status) return true;
    if (prev.hebrewWorkflowStatus !== next.hebrewWorkflowStatus) return true;

    if (prev.insuredName !== next.insuredName) return true;
    if (prev.plaintiffName !== next.plaintiffName) return true;
    if (prev.insurerName !== next.insurerName) return true;
    if (prev.odakanitNo !== next.odakanitNo) return true;
    if (prev.marketRef !== next.marketRef) return true;
    if (prev.lineSlipNo !== next.lineSlipNo) return true;
    if (prev.certificateRef !== next.certificateRef) return true;

    if (prev.policyPeriodStart !== next.policyPeriodStart) return true;
    if (prev.policyPeriodEnd !== next.policyPeriodEnd) return true;
    if (prev.retroStart !== next.retroStart) return true;
    if (prev.retroEnd !== next.retroEnd) return true;

    if (prev.reportSubject !== next.reportSubject) return true;
    if (prev.executiveSummary !== next.executiveSummary) return true;

    const jsonEqual = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);

    if (!jsonEqual(prev.content, next.content)) return true;
    if (!jsonEqual(prev.translatedContent, next.translatedContent)) return true;
    if (!jsonEqual(prev.expenseWorksheet, next.expenseWorksheet)) return true;
    if (!jsonEqual(prev.expensesItems, next.expensesItems)) return true;

    if (prev.expensesSum !== next.expensesSum) return true;
    if (prev.paymentRecommendation !== next.paymentRecommendation) return true;

    if (!jsonEqual(prev.complaintAnalysis, next.complaintAnalysis)) return true;
    if (!jsonEqual(prev.reportReview, next.reportReview)) return true;

    return false;
  };

  const upsertCaseFolderFromReport = (report: ReportData, nowIso?: string) => {
    if (!report.odakanitNo) return;
    setCaseFolders((prev) => {
      const next = upsertCaseFolderFromReportInMap(prev, report, nowIso);
      saveCaseFolders(next);
      return next;
    });
  };

  const addSentReportToCaseFolder = (
    report: ReportData,
    sentAtIso: string,
    fileName?: string,
    isResend?: boolean,
  ) => {
    if (!report.odakanitNo) return;
    setCaseFolders((prev) => {
      const next = addSentReportToCaseFolderInMap(prev, report, sentAtIso, fileName, isResend);
      saveCaseFolders(next);
      return next;
    });
  };

  const buildPreviousReportsFromFolder = (folder: CaseFolder | null | undefined): PreviousReport[] => {
    if (!folder?.sentReports?.length) return [];
    const items = folder.sentReports
      .map((sr, index): PreviousReport | null => {
        const number =
          typeof sr.reportNo === 'number' && sr.reportNo > 0
            ? sr.reportNo
            : index + 1;
        const date =
          sr.sentAt ||
          (sr.snapshot as any)?.reportDate ||
          '';
        const subject =
          (sr.snapshot as any)?.reportSubject ||
          sr.fileName ||
          '';
        if (!subject || !date) return null;
        return {
          id: sr.reportId,
          reportNumber: number,
          subject,
          date,
          sent: true,
          fileName: sr.fileName,
          snapshot: sr.snapshot,
        };
      })
      .filter((x): x is PreviousReport => Boolean(x));

    return items.sort((a, b) => a.reportNumber - b.reportNumber);
  };

  const withReportReview = (
    report: ReportData,
    updater: (prev: NonNullable<ReportData['reportReview']>) => NonNullable<ReportData['reportReview']>,
  ): ReportData => {
    const base: NonNullable<ReportData['reportReview']> =
      report.reportReview ?? { status: 'DRAFT', issues: [] };
    return {
      ...report,
      reportReview: updater(base),
    };
  };

  const submitHebrewForReview = (reportId: string) => {
    updateReportById(reportId, (report) => {
      const userId = currentUser?.id || 'unknown';
      const ts = new Date().toISOString();
      const next = withReportReview(report, (rr) => ({
        ...rr,
        status: 'SUBMITTED',
        submittedAt: ts,
        submittedByUserId: rr.submittedByUserId || userId,
      }));
      return {
        ...next,
        hebrewWorkflowStatus: 'HEBREW_SUBMITTED',
      };
    });
  };

  const approveHebrewForTranslation = (reportId: string) => {
    if (currentUser?.role !== 'ADMIN') return;

    updateReportById(reportId, (report) => {
      const userId = currentUser?.id || 'unknown';
      const ts = new Date().toISOString();
      const next = withReportReview(report, (rr) => ({
        ...rr,
        status: 'APPROVED',
        reviewedAt: ts,
        reviewedByUserId: userId,
      }));
      return {
        ...next,
        hebrewWorkflowStatus: 'HEBREW_APPROVED',
      };
    });
  };

  const addReviewIssues = (reportId: string, issues: NewIssueInput[]) => {
    if (!issues.length) return;
    updateReportById(reportId, (report) => {
      const userId = currentUser?.id || 'unknown';
      const ts = new Date().toISOString();
      const next = withReportReview(report, (rr) => ({
        ...rr,
        status: 'CHANGES_REQUESTED',
        reviewedAt: ts,
        reviewedByUserId: userId,
        issues: [
          ...rr.issues,
          ...issues.map((ni) => ({
            id: `issue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: ts,
            createdByUserId: userId,
            sectionKey: ni.sectionKey,
            severity: ni.severity,
            type: ni.type,
            title: ni.title,
            instruction: ni.instruction,
            status: 'OPEN',
          })),
        ],
      }));
      return {
        ...next,
        hebrewWorkflowStatus: 'HEBREW_CHANGES_REQUESTED',
      };
    });
  };

  const markReviewIssueDone = (reportId: string, issueId: string) => {
    updateReportById(reportId, (report) => {
      const ts = new Date().toISOString();
      return withReportReview(report, (rr) => ({
        ...rr,
        issues: rr.issues.map((issue) =>
          issue.id === issueId && issue.status !== 'DONE'
            ? { ...issue, status: 'DONE', doneAt: ts }
            : issue,
        ),
      }));
    });
  };

  const markExternalIssuesAsDone = (reportId: string) => {
    if (currentUser?.role !== 'ADMIN') return;

    updateReportById(reportId, (report) => {
      const ts = new Date().toISOString();
      return withReportReview(report, (rr) => ({
        ...rr,
        issues: rr.issues.map((issue) =>
          (issue.origin ?? 'INTERNAL') === 'EXTERNAL' && issue.status !== 'DONE'
            ? { ...issue, status: 'DONE', doneAt: ts }
            : issue,
        ),
      }));
    });
  };

  const canTranslate = (report: ReportData | null | undefined): boolean => {
    if (!report) return false;
    const status = report.reportReview?.status;
    if (status === 'APPROVED') return true;
    if (report.hebrewWorkflowStatus === 'HEBREW_APPROVED') return true;
    return false;
  };

  const updateReportById = (reportId: string, updater: (report: ReportData) => ReportData) => {
    const timestamp = new Date().toISOString();
    let prevSnapshot: ReportData | null = null;
    let nextSnapshot: ReportData | null = null;

    setReports((prev) =>
      prev.map((report) => {
        if (report.id !== reportId) return report;

        const odakanitKey = normalizeOdakanitNo(report.odakanitNo);
        const folderForReport =
          odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
        const lockState = getReportLockState(report, folderForReport || undefined);
        const isCaseClosed = Boolean(folderForReport?.closedAt);

        // Admin override is never valid on a closed case – reopening the case is required first.
        const hasAdminOverride =
          currentUser?.role === 'ADMIN' &&
          canEditLockedReportForId === report.id &&
          !isCaseClosed;

        const isLawyerSent =
          currentUser?.role === 'LAWYER' && report.status === 'SENT';

        // Lock enforcement:
        // - LAWYER: cannot edit SENT reports at all.
        // - ADMIN/others: cannot edit locked reports (by time/case closure) without override.
        if (isLawyerSent && !hasAdminOverride) {
          logBlockedEdit({
            reason: 'LAWYER_SENT_BLOCK',
            reportId: report.id,
            odakanitNo: report.odakanitNo,
            role: currentUser?.role,
            status: report.status,
            lockType: lockState.lockType,
          });
          return report;
        }
        if (!hasAdminOverride && lockState.isLocked) {
          logBlockedEdit({
            reason: caseFolders && caseFolders[odakanitKey]?.closedAt
              ? 'CASE_CLOSED_BLOCK'
              : 'LOCKSTATE_BLOCK',
            reportId: report.id,
            odakanitNo: report.odakanitNo,
            role: currentUser?.role,
            status: report.status,
            lockType: lockState.lockType,
          });
          return report;
        }

        const updated = updater(report);
        prevSnapshot = report;
        nextSnapshot = updated;
        const significant = hasSignificantChanges(report, updated);
        return significant ? { ...updated, updatedAt: timestamp } : updated;
      }),
    );

    if (prevSnapshot && nextSnapshot && prevSnapshot.odakanitNo && nextSnapshot.odakanitNo) {
      const oldKey = prevSnapshot.odakanitNo.trim();
      const newKey = nextSnapshot.odakanitNo.trim();
      if (oldKey && newKey && oldKey !== newKey) {
        // When a report's odakanitNo changes, move it between case folders
        setCaseFolders((prevFolders) => {
          let nextFolders = { ...prevFolders };
          const oldFolder = nextFolders[oldKey];
          if (oldFolder) {
            const newReportIds = oldFolder.reportIds.filter((id) => id !== nextSnapshot!.id);
            nextFolders[oldKey] = { ...oldFolder, reportIds: newReportIds };
          }
          nextFolders = upsertCaseFolderFromReportInMap(nextFolders, nextSnapshot!, timestamp);
          saveCaseFolders(nextFolders);
          return nextFolders;
        });
      }
    }

    setCurrentReport((prev) => {
      if (!prev || prev.id !== reportId) return prev;
      const updated = updater(prev);
      const significant = hasSignificantChanges(prev, updated);
      return significant ? { ...updated, updatedAt: timestamp } : updated;
    });
  };

  const addExternalFeedbackIssues = (
    reportId: string,
    issues: NewIssueInput[],
    externalRefId?: string,
  ) => {
    if (!issues.length) return;
    if (currentUser?.role !== 'ADMIN') return;

    updateReportById(reportId, (report) => {
      const userId = currentUser?.id || 'unknown';
      const ts = new Date().toISOString();
      const next = withReportReview(report, (rr) => ({
        ...rr,
        status: 'CHANGES_REQUESTED',
        reviewedAt: ts,
        reviewedByUserId: userId,
        issues: [
          ...rr.issues,
          ...issues.map((ni) => ({
            id: `issue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: ts,
            createdByUserId: userId,
            sectionKey: ni.sectionKey,
            severity: ni.severity,
            type: ni.type,
            title: ni.title,
            instruction: ni.instruction,
            status: 'OPEN',
            origin: 'EXTERNAL',
            externalRefId,
            externalAction: ni.externalAction ?? 'ENGLISH_ONLY',
          })),
        ],
      }));

      return {
        ...next,
        postSendFeedbackMeta: {
          ...(report.postSendFeedbackMeta || {}),
          lastFeedbackAt: ts,
        },
      };
    });
  };

  const reopenHebrewDueToExternalFeedback = (reportId: string) => {
    if (currentUser?.role !== 'ADMIN') return;

    updateReportById(reportId, (report) => {
      const ts = new Date().toISOString();
      const baseReview = report.reportReview ?? { status: 'DRAFT', issues: [] };

      return {
        ...report,
        hebrewWorkflowStatus: 'HEBREW_REOPENED_EXTERNAL',
        reportReview: {
          ...baseReview,
          status: baseReview.status === 'CHANGES_REQUESTED' ? baseReview.status : 'CHANGES_REQUESTED',
        },
        postSendFeedbackMeta: {
          ...(report.postSendFeedbackMeta || {}),
          reopenedDueToFeedbackAt: ts,
        },
      };
    });
  };

   const pushNotification = (entry: NotificationEntry) => {
      setNotifications(prev => [entry, ...prev]);
   };

   const openWorksheetSession = (reportId: string) => {
      setWorksheetSessions(prev => {
         if (prev.some(session => session.reportId === reportId)) return prev;
         return [...prev, { reportId }];
      });
      setActiveWorksheetId(reportId);
   };

   const closeWorksheetSession = (reportId: string) => {
      setWorksheetSessions(prev => prev.filter(session => session.reportId !== reportId));
      setActiveWorksheetId(prev => (prev === reportId ? null : prev));
   };

   const saveFavoriteProvider = (userId: string, favorite: ExpenseFavorite) => {
      setFavoriteProviders(prev => {
         const list = prev[userId] || [];
         if (list.some(item => item.serviceProvider.toLowerCase() === favorite.serviceProvider.toLowerCase() && item.category === favorite.category)) {
            return prev;
         }
         return { ...prev, [userId]: [favorite, ...list] };
      });
   };

   const deleteFavoriteProvider = (userId: string, favoriteId: string) => {
      setFavoriteProviders(prev => {
         const list = prev[userId] || [];
         return { ...prev, [userId]: list.filter(item => item.id !== favoriteId) };
      });
   };

  const handleUpdateReport = (updates: Partial<ReportData>) => {
    if (currentReport) {
      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
      const folderForReport =
        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
      const lockState = getReportLockState(currentReport, folderForReport || undefined);
      const isCaseClosed = Boolean(folderForReport?.closedAt);

      const hasAdminOverride =
        currentUser?.role === 'ADMIN' &&
        canEditLockedReportForId === currentReport.id &&
        !isCaseClosed;

      const isLawyerSent =
        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';

      // Lock enforcement:
      // - LAWYER: cannot edit SENT reports at all.
      // - ADMIN/others: cannot edit locked reports (by time/case closure) without override.
      if (isLawyerSent && !hasAdminOverride) {
        logBlockedEdit({
          reason: 'LAWYER_SENT_BLOCK',
          reportId: currentReport.id,
          odakanitNo: currentReport.odakanitNo,
          role: currentUser?.role,
          status: currentReport.status,
          lockType: lockState.lockType,
        });
        return;
      }
      if (!hasAdminOverride && lockState.isLocked) {
        logBlockedEdit({
          reason: caseFolders && odakanitKey && caseFolders[odakanitKey]?.closedAt
            ? 'CASE_CLOSED_BLOCK'
            : 'LOCKSTATE_BLOCK',
          reportId: currentReport.id,
          odakanitNo: currentReport.odakanitNo,
          role: currentUser?.role,
          status: currentReport.status,
          lockType: lockState.lockType,
        });
        return;
      }

      const prev = currentReport;
      let next: ReportData = { ...currentReport, ...updates };

        // אם תוכן העברית השתנה מאז התרגום האחרון – נסמן שהתרגום עלול להיות לא מעודכן
        if (prev.translationBaseHash && updates.content) {
          const prevHash = prev.translationBaseHash;
          const newHash = computeTranslationBaseHash(updates.content);
          if (newHash && newHash !== prevHash) {
            next = {
              ...next,
              translationStale: true,
            };
          }
        }

      // If there was an auto-generated Update summary and the Update content
      // was changed, mark the summary as edited by the user.
      if (
        prev.updateAutoSummarySourceReportId &&
        updates.content &&
        updates.content.Update !== undefined
      ) {
        next = {
          ...next,
          updateAutoSummaryEdited: true,
        };
      }

      const significant = hasSignificantChanges(prev, next);
      setCurrentReport(
        significant ? { ...next, updatedAt: new Date().toISOString() } : next,
      );
    }
  };

   const saveCurrentReport = () => {
  if (currentReport) {
    setReports(prev => {
      const exists = prev.find(r => r.id === currentReport.id);
      const nextReports = exists
        ? prev.map(r => (r.id === currentReport.id ? currentReport : r))
        : [...prev, currentReport];
      upsertCaseFolderFromReport(currentReport);
      return nextReports;
    });
  }
};

  const formatAllReportText = () => {
    if (!currentReport) return;
    const formattedContent = formatContentMap(currentReport.content);
    const formattedTranslations = formatContentMap(currentReport.translatedContent);
    handleUpdateReport({
      content: formattedContent,
      translatedContent: formattedTranslations,
    });
  };

  const handleTranslate = async () => {
     if (!currentReport) return;

     if (!canTranslate(currentReport)) {
      window.alert('יש לאשר את הדיווח בעברית לפני תרגום לאנגלית.');
       return;
     }

    setIsTranslating(true);
    try {
     const normalizedContent = formatContentMap(currentReport.content);
     const newTranslated: Record<string, string> = {};

     for (const key of Object.keys(normalizedContent)) {
        const text = normalizedContent[key];
        if (text) {
           const translated = await translateLegalText(text);
           newTranslated[key] = formatParagraphContent(translated);
        }
     }

      const baseHash = computeTranslationBaseHash(normalizedContent);
      handleUpdateReport({
        content: normalizedContent,
        translatedContent: newTranslated,
        isTranslated: true,
        translationBaseHash: baseHash,
        translationStale: false,
      });
      window.alert('התרגום הושלם בהצלחה.');
    } catch (error) {
      console.error('Translate failed', error);
      window.alert('התרגום נכשל. נסו שוב מאוחר יותר.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleImproveEnglish = async () => {
    if (!currentReport) return;

    if (!currentReport.isTranslated) {
      window.alert('יש לבצע תרגום לאנגלית (Auto-Translate) לפני שיפור האנגלית.');
      return;
    }

    const translated = currentReport.translatedContent || {};
    const sectionKeys = Object.keys(translated).filter(
      (key) =>
        !key.toLowerCase().includes('expenses') &&
        typeof translated[key] === 'string' &&
        translated[key].trim().length > 0,
    );

    if (!sectionKeys.length) {
      window.alert('אין טקסט באנגלית לשיפור.');
      return;
    }

    setIsImprovingEnglish(true);
    try {
      const nextTranslated: Record<string, string> = { ...translated };
      const failedSections: string[] = [];

      for (const key of sectionKeys) {
        const original = translated[key];
        if (!original || !original.trim()) continue;

        try {
          const { protectedText, map } = protectFacts(original);
          const improvedRaw = await improveEnglishText(protectedText);
          const restored = restoreFacts(improvedRaw || protectedText, map);
          const withGlossary = applyEnglishGlossary(restored);
          nextTranslated[key] = formatParagraphContent(withGlossary);
        } catch (sectionError) {
          console.error(`Improve English failed for section "${key}"`, sectionError);
          failedSections.push(key);
          // keep original text in nextTranslated for this key
          nextTranslated[key] = original;
        }
      }

      handleUpdateReport({ translatedContent: nextTranslated });
      saveCurrentReport();

      if (!failedSections.length) {
        window.alert('שיפור האנגלית הושלם בהצלחה.');
      } else {
        const labels = failedSections.map((secKey) =>
          getSectionDisplayTitle(secKey, currentReport.expertSummaryMode?.[secKey]),
        );
        window.alert(
          `שיפור האנגלית הושלם חלקית.\nהסעיפים הבאים נכשלו: ${labels.join(
            ', ',
          )}.\nשאר הסעיפים שופרו בהצלחה.`,
        );
      }
    } catch (error) {
      console.error('Improve English failed', error);
      window.alert('שיפור האנגלית נכשל. נסו שוב מאוחר יותר.');
    } finally {
      setIsImprovingEnglish(false);
    }
  };

  const getLawyerEmail = (report?: ReportData) =>
    report?.ownerEmail || (report?.createdBy && USERS.find((u) => u.id === report.createdBy)?.email) || '';

  const getEmailRecipients = (report?: ReportData) => {
    if (!mailConfig) return { to: [] as string[], cc: [] as string[] };
    const lawyer = getLawyerEmail(report);
    const cc = lawyer && !mailConfig.cc.some((e) => e.toLowerCase() === lawyer.toLowerCase())
      ? [...mailConfig.cc, lawyer]
      : mailConfig.cc;
    return { to: mailConfig.to, cc };
  };

  const fetchMailConfigAndOpenCompose = (resendMode: boolean) => {
    setMailConfig(null);
    fetch('/api/mail-config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: { mode: string; to: string[]; cc: string[] }) => {
        setMailConfig(data);
        setIsResendMode(resendMode);
        setIsEmailModalOpen(true);
      })
      .catch(() => {
        showToast({ message: 'Mail configuration could not be loaded. Recipients may be unavailable.', type: 'info' });
        setMailConfig({ mode: 'SANDBOX', to: [], cc: [] });
        setIsResendMode(resendMode);
        setIsEmailModalOpen(true);
      });
  };

  const buildEmailSubjectLine = (report: ReportData) => buildReportSubject(report);

  const buildReportPayloadForPdf = (report: ReportData): ReportData => ({
    ...report,
    invoiceFiles: [],
    policyFile: undefined,
    expensesSourceFile: undefined,
  });

  const buildReportSnapshot = (report: ReportData, sentAt: string): ReportSnapshot => {
    const contentClone = report.content ? deepClone(report.content) : {};
    const translatedClone = report.translatedContent ? deepClone(report.translatedContent) : {};
    return {
      createdAt: sentAt,
      reportDate: report.reportDate,
      subject: report.emailSubjectDraft?.trim() || buildEmailSubjectLine(report),
      status: 'SENT',
      odakanitNo: report.odakanitNo,
      recipientId: report.recipientId,
      insurerName: report.insurerName,
      lineSlipNo: report.lineSlipNo,
      marketRef: report.marketRef,
      insuredName: report.insuredName,
      plaintiffName: report.plaintiffName,
      plaintiffTitle: report.plaintiffTitle,
      policyPeriodStart: report.policyPeriodStart,
      policyPeriodEnd: report.policyPeriodEnd,
      retroStart: report.retroStart,
      retroEnd: report.retroEnd,
      filenameTag: report.filenameTag,
      fileNameTitles: report.fileNameTitles ? [...report.fileNameTitles] : undefined,
      selectedSections: [...(report.selectedSections || [])],
      content: contentClone,
      translatedContent: translatedClone,
      executiveSummary: report.executiveSummary,
      complaintAnalysis: report.complaintAnalysis ? deepClone(report.complaintAnalysis) : undefined,
      requiresExpenses: Boolean(report.requiresExpenses),
      isWaitingForInvoices: Boolean(report.isWaitingForInvoices),
      isTranslated: Boolean(report.isTranslated),
      selectedTimeline: report.selectedTimeline,
      selectedTimelineImage: report.selectedTimelineImage,
      expensesItems: report.expensesItems?.length ? deepClone(report.expensesItems) : undefined,
      expenseWorksheet: report.expenseWorksheet ? deepClone(report.expenseWorksheet) : undefined,
      expensesSum: report.expensesSum,
      paymentRecommendation: report.paymentRecommendation,
      reportNotes: report.reportNotes?.length ? deepClone(report.reportNotes) : undefined,
      ownerName: report.ownerName,
      ownerEmail: report.ownerEmail,
    };
  };

  const buildHistoryEntry = (report: ReportData, fileName: string, sentAt: string): PreviousReport => {
    const baseSubject = report.emailSubjectDraft?.trim() || buildEmailSubjectLine(report);
    const historyCount = report.reportHistory?.length || 0;
    const effectiveNumber =
      typeof report.reportNumber === 'number' && report.reportNumber > 0
        ? report.reportNumber
        : historyCount + 1;
    return {
      id: makeId(),
      reportNumber: effectiveNumber,
      subject: baseSubject,
      date: sentAt,
      sent: true,
      fileName,
      snapshot: buildReportSnapshot(report, sentAt),
    };
  };

  const forceLtrEmailBody = (text: string): string => {
    if (!text) return text;
    const LRE = '\u202A'; // Left-to-Right Embedding
    const PDF = '\u202C'; // Pop Directional Formatting
    // אם כבר עטוף, אל תעטוף שוב
    if (text.startsWith(LRE)) return text;
    return `${LRE}${text}${PDF}`;
  };

  const openEmailClient = (recipients: { to: string[]; cc: string[] }, subject: string, body: string) => {
    if (typeof window === 'undefined') return;
    const toPart = recipients.to.join(';');
    const encode = (value: string) => encodeURIComponent(value);

    const queryParts: string[] = [];
    if (recipients.cc.length) {
      queryParts.push(`cc=${encode(recipients.cc.join(';'))}`);
    }
    queryParts.push(`subject=${encode(subject)}`);
    queryParts.push(`body=${encode(forceLtrEmailBody(body))}`);

    const mailtoUrl = `mailto:${toPart}?${queryParts.join('&')}`;
    window.location.href = mailtoUrl;
  };


  const performDownloadPdf = async () => {
    if (!currentReport) return;
    setIsPdfGenerating(true);
    try {
      const pdfBlob = await fetchReportPdf(currentReport);
      const fileName = buildReportFileName(currentReport);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF download failed', error);
      let msg = error instanceof Error ? error.message : 'הפקת ה-PDF נכשלה. נסה שוב.';
      if (msg.includes('Chrome') || msg.includes('Chromium') || msg.includes('Puppeteer Chrome')) {
        msg = 'הפקת PDF דורשת Chrome. אם התקלה נמשכת, פנה לליאור.';
      } else if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
        msg = 'הפקת ה-PDF ארכה זמן רב. נסה שוב.';
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Network request failed')) {
        msg = 'שגיאת רשת. בדוק חיבור לאינטרנט ונסה שוב.';
      } else if (msg.length < 3 || (!/[\u0590-\u05FF]/.test(msg) && msg.length < 50)) {
        msg = 'הפקת ה-PDF נכשלה. נסה שוב או פנה לליאור.';
      }
      alert(msg);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    const issues = computePreSendIssues(currentReport, currentUser);
    if (!issues.length) {
      await performDownloadPdf();
      return;
    }

    setPreSendGuard({
      issues,
      onContinue: () => {
        setPreSendGuard(null);
        void performDownloadPdf();
      },
    });
  };

  const handleFinalizeClick = () => {
    if (!currentReport) return;
    if (currentUser?.role === 'ADMIN') {
      fetchMailConfigAndOpenCompose(false);
    } else {
      finalizeReport();
    }
  };

  const handlePrepareResendClick = () => {
    if (!currentReport) return;
    if (currentUser?.role !== 'ADMIN') return;

    if (currentReport.status !== 'SENT') {
      showToast({
        message: 'שליחה מחדש זמינה רק לאחר שהדוח נשלח (SENT).',
        type: 'error',
      });
      return;
    }

    // Block resend if Hebrew is reopened / not re-approved
    if (!canTranslate(currentReport)) {
      showToast({
        message: 'הדיווח פתוח לתיקוני עברית/לא אושר לתרגום מחדש. יש להשלים תיקונים ולאשר לפני שליחה מחדש.',
        type: 'error',
      });
      return;
    }

    // Block resend if there is an OPEN EXTERNAL issue that requires Hebrew changes
    const hasBlockingExternalIssue =
      currentReport.reportReview?.issues?.some(
        (issue) =>
          (issue.origin ?? 'INTERNAL') === 'EXTERNAL' &&
          issue.status !== 'DONE' &&
          issue.externalAction === 'REQUIRES_HEBREW',
      ) ?? false;

    if (hasBlockingExternalIssue) {
      showToast({
        message: 'יש משוב מחברת הביטוח שמחייב תיקון בעברית. יש לפתוח מחדש עברית/להשלים תיקונים ולאשר מחדש לפני שליחה מחדש.',
        type: 'error',
      });
      return;
    }

    // Require existing English translation (do not auto-translate)
    const hasEnglish =
      currentReport.isTranslated &&
      currentReport.translatedContent &&
      Object.values(currentReport.translatedContent).some((v) => v && v.trim().length > 0);

    if (!hasEnglish) {
      showToast({
        message: 'אין טקסט אנגלי מוכן לשליחה. יש להשלים תרגום לפני שליחה מחדש.',
        type: 'error',
      });
      return;
    }

    fetchMailConfigAndOpenCompose(true);
  };

  type EmailSendPayload = {
    body: string;
    templateId: string;
    subjectBase: string;
    topics: string[];
  };

  // Future: extend email audit trail (multi-send history, insurer rules, confirmations).
  // Comment only – no execution, no config, no feature flag.

  const performEmailSend = async (
    {
      body,
      templateId,
      subjectBase,
      topics,
    }: EmailSendPayload,
    reportOverride?: ReportData,
  ) => {
    const baseReport = reportOverride ?? currentReport;
    if (!baseReport) return;
    if (
      baseReport.translationStale &&
      !window.confirm('התוכן בעברית עודכן מאז התרגום האחרון. ייתכן שהגרסה באנגלית אינה תואמת במדויק. להמשיך בשליחה בכל זאת?')
    ) {
      return;
    }
    const reportForSend: ReportData = {
      ...baseReport,
      selectedEmailTemplate: templateId,
      emailBodyDraft: body,
      emailSubjectDraft: subjectBase.trim()
        ? subjectBase.trim()
        : undefined,
      fileNameTitles: topics,
    };
    handleUpdateReport({
      selectedEmailTemplate: templateId,
      emailBodyDraft: body,
      emailSubjectDraft: reportForSend.emailSubjectDraft,
      fileNameTitles: topics,
    });
    // Update recent topic combinations MRU for this user
    if (currentUser) {
      const existingCombos = loadUserTopicCombos(currentUser.id);
      const nextCombos = upsertTopicComboMRU(existingCombos, topics, 6);
      saveUserTopicCombos(currentUser.id, nextCombos);
    }
    const ltrBody = forceLtrEmailBody(body);

    setIsSendingEmail(true);
    let recipients: { to: string[]; cc: string[] } | null = null;
    let subject = '';
    const subjectBaseTrimmed =
      subjectBase.trim() || buildEmailSubjectLine(reportForSend);
    let attachmentName = '';
    let pdfBlob: Blob | null = null;
    let sendSucceeded = false;
    let lastEmailSentAudit: ReportData['lastEmailSent'];
    try {
      pdfBlob = await fetchReportPdf(reportForSend);
      const attachmentBase64 = await blobToBase64(pdfBlob);
      attachmentName = buildReportFileName(reportForSend);
      recipients = getEmailRecipients(reportForSend);
      subject = subjectBaseTrimmed;

      sendSucceeded = await sendEmailViaOutlook({
        subject,
        body: ltrBody,
        attachmentBase64,
        attachmentName,
        lawyerEmail: getLawyerEmail(reportForSend),
        reportId: reportForSend?.id,
      });

      if (sendSucceeded) {
        const scenario = resolveEmailScenario(reportForSend);
        const defaultSubject = buildSmartEmailSubject({
          ...reportForSend,
          emailSubjectDraft: undefined,
        });
        const defaultBody = buildDefaultEmailContent(reportForSend).body;
        const wasEdited =
          subject.trim() !== defaultSubject.trim() ||
          body.trim() !== defaultBody.trim();
        lastEmailSentAudit = {
          sentAt: new Date().toISOString(),
          sentBy: currentUser?.id ?? currentUser?.name ?? 'unknown',
          mailMode: mailConfig?.mode ?? 'PROD',
          to: recipients.to.join('; '),
          cc: recipients.cc.join('; '),
          subject,
          scenario,
          wasEdited,
        };
        const sentAsLabel = (EMAIL_SCENARIO_SUBJECT_PREFIX[scenario] ?? '').replace(/\s*–\s*$/, '').trim() || 'Report';
        showToast({
          message: `Report email sent successfully to the broker and CC recipients. Sent as: ${sentAsLabel} | PDF attached | Broker + CC`,
          type: 'success',
        });
      } else {
        showToast({
          message: 'Sending failed. The PDF can be sent manually if needed.',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Email send failed', error);
      const errMsg = error instanceof Error ? error.message : '';
      showToast({
        message: errMsg && errMsg.includes('פוליסה')
          ? errMsg
          : 'Sending failed. The PDF can be sent manually if needed.',
        type: 'error',
      });
    } finally {
      if (recipients) {
        if (!sendSucceeded) {
          if (pdfBlob) {
            const downloadName = attachmentName || buildReportFileName(reportForSend);
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
          openEmailClient(recipients, subject || subjectBaseTrimmed, ltrBody);
        }
        finalizeReport(attachmentName || undefined, lastEmailSentAudit);
        setIsEmailModalOpen(false);
      }
      setIsSendingEmail(false);
    }
  };

  const handleEmailSend = async (payload: EmailSendPayload) => {
    if (!currentReport) return;

    let effectiveReport: ReportData = currentReport;

    // Guard: prevent sending an out-of-order report as a "new" report.
    if (effectiveReport.odakanitNo) {
      const key = normalizeOdakanitNo(effectiveReport.odakanitNo);
      if (key) {
        const reportsInCase = reports.filter(
          (r) => normalizeOdakanitNo(r.odakanitNo) === key,
        );
        const maxNumber = reportsInCase.reduce((max, r) => {
          const n = typeof r.reportNumber === 'number' && r.reportNumber > 0 ? r.reportNumber : max;
          return n > max ? n : max;
        }, 0);
        const currentNumber =
          typeof effectiveReport.reportNumber === 'number' && effectiveReport.reportNumber > 0
            ? effectiveReport.reportNumber
            : maxNumber;
        if (currentNumber < maxNumber) {
          window.alert(
            'קיים בתיק זה דו״ח עם מספר גבוה יותר. לא ניתן לשלוח דו״ח מוקדם כדיווח חדש. נא המשיכי לעבוד על הדיווח האחרון בתיק.',
          );
          return;
        }
      }
    }

    // Guard: ensure that if a Finance expenses table exists, the canonical expenses section is present
    const hasFinanceExpenses =
      Boolean(currentReport.expensesSheetId) || Boolean(currentReport.expensesHtml);
    const hasExpensesSection =
      Array.isArray(currentReport.selectedSections) &&
      currentReport.selectedSections.some((sec) => isCanonicalExpensesSection(sec));

    if (hasFinanceExpenses && !hasExpensesSection) {
      const confirmed = window.confirm(
        'לא ניתן לשלוח את הדו״ח ללא סעיף הוצאות, מאחר שקיימת טבלת הוצאות שהוכנה על‑ידי הנהלת החשבונות.\n\nלהוסיף כעת את סעיף ההוצאות לדו״ח ולהמשיך לשליחה?',
      );
      if (!confirmed) {
        return;
      }

      const baseSections = [...(currentReport.selectedSections || [])];
      const hasUpdate = baseSections.includes('Update');
      const hasRecommendations = baseSections.includes('Recommendations');
      const insertIndex = hasUpdate
        ? Math.min(
            baseSections.indexOf('Update') + 1,
            hasRecommendations ? baseSections.indexOf('Recommendations') : baseSections.length,
          )
        : 0;
      baseSections.splice(insertIndex, 0, CANONICAL_EXPENSES_SECTION);

      const nextSections = Array.from(new Set(baseSections));
      const nextReport: ReportData = {
        ...currentReport,
        selectedSections: nextSections,
      };

      handleUpdateReport({
        selectedSections: nextSections,
      });

      effectiveReport = nextReport;
    }

    await performEmailSend(payload, effectiveReport);
  };

  const performResendEmailSend = async (
    {
      body,
      templateId,
      subjectBase,
      topics,
    }: EmailSendPayload,
    reportOverride?: ReportData,
  ) => {
    const baseReport = reportOverride ?? currentReport;
    if (!baseReport) return;
    if (currentUser?.role !== 'ADMIN') return;
    if (
      baseReport.translationStale &&
      !window.confirm('התוכן בעברית עודכן מאז התרגום האחרון. ייתכן שהגרסה באנגלית אינה תואמת במדויק. להמשיך בשליחה מחדש בכל זאת?')
    ) {
      return;
    }

    const reportForSend: ReportData = {
      ...baseReport,
      selectedEmailTemplate: templateId,
      emailBodyDraft: body,
      emailSubjectDraft: subjectBase.trim()
        ? subjectBase.trim()
        : undefined,
      fileNameTitles: topics,
    };
    handleUpdateReport({
      selectedEmailTemplate: templateId,
      emailBodyDraft: body,
      emailSubjectDraft: reportForSend.emailSubjectDraft,
      fileNameTitles: topics,
    });
    // Update recent topic combinations MRU for this user (resend as well)
    if (currentUser && topics.length) {
      const existingCombos = loadUserTopicCombos(currentUser.id);
      const nextCombos = upsertTopicComboMRU(existingCombos, topics, 6);
      saveUserTopicCombos(currentUser.id, nextCombos);
    }
    const ltrBody = forceLtrEmailBody(body);

    setIsSendingEmail(true);
    let recipients: { to: string[]; cc: string[] } | null = null;
    let subject = '';
    let attachmentName = '';
    const subjectBaseTrimmed =
      subjectBase.trim() || buildEmailSubjectLine(reportForSend);
    let sendSucceeded = false;
    try {
      const pdfBlob = await fetchReportPdf(reportForSend);
      const attachmentBase64 = await blobToBase64(pdfBlob);
      attachmentName = buildReportFileName(reportForSend);
      recipients = getEmailRecipients(reportForSend);
      subject = `Resend – ${subjectBaseTrimmed}`;

      sendSucceeded = await sendEmailViaOutlook({
        subject,
        body: ltrBody,
        attachmentBase64,
        attachmentName,
        lawyerEmail: getLawyerEmail(reportForSend),
        reportId: reportForSend?.id,
      });

      const scenario = sendSucceeded ? resolveEmailScenario(reportForSend) : null;
      const defaultSubject = sendSucceeded
        ? buildSmartEmailSubject({ ...reportForSend, emailSubjectDraft: undefined })
        : '';
      const defaultBody = sendSucceeded ? buildDefaultEmailContent(reportForSend).body : '';
      const wasEdited =
        sendSucceeded &&
        (subject.trim() !== defaultSubject.trim() || body.trim() !== defaultBody.trim());

      if (sendSucceeded) {
        const sentAsLabel = (scenario ? (EMAIL_SCENARIO_SUBJECT_PREFIX[scenario] ?? '').replace(/\s*–\s*$/, '').trim() : '') || 'Report';
        showToast({
          message: `Report email sent successfully to the broker and CC recipients. Sent as: ${sentAsLabel} | PDF attached | Broker + CC`,
          type: 'success',
        });
      } else {
        showToast({
          message: 'Sending failed. The PDF can be sent manually if needed.',
          type: 'error',
        });
      }

      const sentAt = new Date().toISOString();
      const lastEmailSentAudit: ReportData['lastEmailSent'] =
        sendSucceeded && recipients
          ? {
              sentAt,
              sentBy: currentUser?.id ?? currentUser?.name ?? 'unknown',
              mailMode: mailConfig?.mode ?? 'PROD',
              to: recipients.to.join('; '),
              cc: recipients.cc.join('; '),
              subject,
              scenario: scenario ?? undefined,
              wasEdited: wasEdited ?? false,
            }
          : undefined;

      // Append resend history & case folder snapshot
      const baseHistoryEntry = buildHistoryEntry(
        { ...baseReport, status: 'SENT', sentAt },
        attachmentName,
        sentAt,
      );
      const resendIndex =
        (typeof baseReport.reportNumber === 'number' && baseReport.reportNumber > 0)
          ? baseReport.reportNumber
          : (baseReport.reportHistory?.length || 0) + 1;

      // Determine whether this resend represents a "correction" (content/expenses revision)
      // or just a simple resend. For now, we treat resends that happen while the report is
      // still unlocked as corrections, and resends after lock as regular resends.
      const odakanitKey = normalizeOdakanitNo(baseReport.odakanitNo);
      const folderForReport =
        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
      const lockStateForBase = getReportLockState(baseReport, folderForReport || undefined);
      const isCorrection = !lockStateForBase.isLocked;

      const historyEntry: PreviousReport = {
        ...baseHistoryEntry,
        subject: isCorrection
          ? `Corrected resend #${resendIndex} – ${baseHistoryEntry.subject}`
          : `Resent #${resendIndex} – ${baseHistoryEntry.subject}`,
        isCorrection,
        revisionIndex: isCorrection
          ? (baseReport.reportHistory?.filter((h) => h.isCorrection)?.length || 0) + 1
          : undefined,
      };

      const updatedReport: ReportData = {
        ...baseReport,
        status: 'SENT',
        sentAt,
        reportHistory: [...(baseReport.reportHistory || []), historyEntry],
        selectedEmailTemplate: undefined,
        emailBodyDraft: undefined,
        ...(lastEmailSentAudit ? { lastEmailSent: lastEmailSentAudit } : {}),
      };

      persistCaseTemplate(updatedReport);
      upsertCaseFolderFromReport(updatedReport, sentAt);
      addSentReportToCaseFolder(updatedReport, sentAt, historyEntry.fileName || attachmentName, true);

      setCurrentReport(updatedReport);
    setReports((prev) =>
      prev.map((r) => (r.id === updatedReport.id ? updatedReport : r)),
    );
    } catch (error) {
      console.error('Resend email failed', error);
      const errMsg = error instanceof Error ? error.message : '';
      showToast({
        message: errMsg && errMsg.includes('פוליסה')
          ? errMsg
          : 'Sending failed. The PDF can be sent manually if needed.',
        type: 'error',
      });
    } finally {
      if (recipients) {
        const base = subjectBaseTrimmed || buildEmailSubjectLine(baseReport);
        const fallbackSubject = subject || `UPDATED: ${base}`;
        // Only open mailto when automatic resend fails; avoid double-sending on success.
        if (!sendSucceeded) {
          openEmailClient(recipients, fallbackSubject, ltrBody);
        }
        setIsEmailModalOpen(false);
      }
      setIsResendMode(false);
      setIsSendingEmail(false);
    }
  };

  const handleResendEmailSend = async (payload: EmailSendPayload) => {
    if (!currentReport) return;

    let effectiveReport: ReportData = currentReport;

    // Guard: ensure that if a Finance expenses table exists, the canonical expenses section is present
    const hasFinanceExpenses =
      Boolean(currentReport.expensesSheetId) || Boolean(currentReport.expensesHtml);
    const hasExpensesSection =
      Array.isArray(currentReport.selectedSections) &&
      currentReport.selectedSections.some((sec) => isCanonicalExpensesSection(sec));

    if (hasFinanceExpenses && !hasExpensesSection) {
      const confirmed = window.confirm(
        'לא ניתן לשלוח מחדש את הדו״ח ללא סעיף הוצאות, מאחר שקיימת טבלת הוצאות שהוכנה על‑ידי הנהלת החשבונות.\n\nלהוסיף כעת את סעיף ההוצאות לדו״ח ולהמשיך בשליחה מחדש?',
      );
      if (!confirmed) {
        return;
      }

      const baseSections = [...(currentReport.selectedSections || [])];
      const hasUpdate = baseSections.includes('Update');
      const hasRecommendations = baseSections.includes('Recommendations');
      const insertIndex = hasUpdate
        ? Math.min(
            baseSections.indexOf('Update') + 1,
            hasRecommendations ? baseSections.indexOf('Recommendations') : baseSections.length,
          )
        : 0;
      baseSections.splice(insertIndex, 0, CANONICAL_EXPENSES_SECTION);

      const nextSections = Array.from(new Set(baseSections));
      const nextReport: ReportData = {
        ...currentReport,
        selectedSections: nextSections,
      };

      handleUpdateReport({
        selectedSections: nextSections,
      });

      effectiveReport = nextReport;
    }

    await performResendEmailSend(payload, effectiveReport);
  };

  const normalizeOverrideFileName = (overrideFileName?: string): string | undefined => {
    if (!overrideFileName) return undefined;
    let value = overrideFileName.trim();
    if (!value) return undefined;

    // Basic sanitization to avoid illegal filename characters / weird spacing.
    value = value
      .replace(INVALID_FILENAME_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!value) return undefined;

    const lower = value.toLowerCase();
    if (lower.endsWith('.pdf.pdf')) {
      value = value.slice(0, -4);
    }

    if (!value.toLowerCase().endsWith('.pdf')) {
      value = `${value}.pdf`;
    }

    // Extremely long overrides fall back to automatic builder.
    if (value.length > 255) return undefined;

    return value;
  };

  const finalizeReport = (
    overrideFileName?: string,
    lastEmailSent?: ReportData['lastEmailSent'],
  ) => {
    if (!currentReport) return;

    let nextStatus: ReportStatus = 'READY_TO_SEND';
    let sentAt = currentReport.sentAt;
    let reportForUpdate: ReportData = currentReport;

    if (currentUser?.role === 'ADMIN') {
      nextStatus = 'SENT';
      const nowIso = new Date().toISOString();
      sentAt = nowIso;
      const cleanedOverride = normalizeOverrideFileName(overrideFileName);
      const fileName =
        cleanedOverride ||
        buildReportFileName(buildReportPayloadForPdf(currentReport));
      const historyEntry = buildHistoryEntry(
        { ...currentReport, status: 'SENT', sentAt },
        fileName,
        sentAt,
      );
      reportForUpdate = {
        ...currentReport,
        reportHistory: [...(currentReport.reportHistory || []), historyEntry],
        selectedEmailTemplate: undefined,
        emailBodyDraft: undefined,
        firstSentAt: currentReport.firstSentAt || nowIso,
        ...(lastEmailSent ? { lastEmailSent } : {}),
      };
    } else if (currentUser?.role === 'FINANCE' || currentUser?.role === 'SUB_ADMIN') {
      nextStatus = 'TASK_ASSIGNED';
    }

    const updatedReport: ReportData = {
      ...reportForUpdate,
      status: nextStatus,
      sentAt,
    };

    persistCaseTemplate(updatedReport);
    upsertCaseFolderFromReport(updatedReport, sentAt || new Date().toISOString());
    if (nextStatus === 'SENT' && sentAt) {
      const lastHistory = updatedReport.reportHistory?.[updatedReport.reportHistory.length - 1];
      addSentReportToCaseFolder(updatedReport, sentAt, lastHistory?.fileName, false);
    }
    setCurrentReport(updatedReport);
    setReports((prev) => {
      const exists = prev.find((r) => r.id === updatedReport.id);
      if (exists) {
        return prev.map((r) => (r.id === updatedReport.id ? updatedReport : r));
      }
      return [...prev, updatedReport];
    });
    setView('DASHBOARD');
  };

  const addReportNote = (reportId: string, message: string) => {
    if (!currentUser) return;
    updateReportById(reportId, (report) => {
      const nextNotes: ReportNote[] = [
        {
          id: makeId(),
          authorId: currentUser.id,
          authorName: currentUser.name,
          message,
          createdAt: new Date().toISOString(),
        },
        ...(report.reportNotes || []),
      ];
      return { ...report, reportNotes: nextNotes };
    });
    pushNotification({
      id: `note-${Date.now()}`,
      message: `${currentUser.name} added a note: "${message}"`,
      createdAt: new Date().toISOString(),
    });
  };

   const appendWorksheetHistory = (reportId: string, entry: Partial<ExpenseWorksheetHistoryEntry>) => {
      updateReportById(reportId, report => {
         const worksheet = report.expenseWorksheet || defaultExpenseWorksheet();
         const historyEntry: ExpenseWorksheetHistoryEntry = {
            id: makeId(),
            timestamp: new Date().toISOString(),
            userId: currentUser?.id || 'system',
            userName: currentUser?.name || 'System',
            action: entry.action || 'UPDATE',
            details: entry.details,
         };
         return {
           ...report,
           expenseWorksheet: {
             ...worksheet,
             history: [historyEntry, ...(worksheet.history || [])],
           },
         };
      });
   };

   const addRowNote = (reportId: string, rowId: string | undefined, message: string) => {
      if (!currentUser) return;
      updateReportById(reportId, report => {
         const worksheet = report.expenseWorksheet || defaultExpenseWorksheet();
         const note: ExpenseWorksheetNote = {
            id: makeId(),
            rowId,
            authorId: currentUser.id,
            authorName: currentUser.name,
            message,
            createdAt: new Date().toISOString(),
         };
         return {
            ...report,
            expenseWorksheet: {
               ...worksheet,
               notes: [note, ...(worksheet.notes || [])],
            },
         };
      });
      appendWorksheetHistory(reportId, { action: 'NOTE_ADDED', details: message });
   };

   const softDeleteReport = (reportId: string) => {
      const timestamp = new Date().toISOString();
      updateReportById(reportId, report => ({ ...report, deletedAt: timestamp, deletedBy: currentUser?.id }));
   };

   const restoreDeletedReport = (reportId: string) => {
      updateReportById(reportId, report => {
         const updated = { ...report };
         delete updated.deletedAt;
         delete updated.deletedBy;
         return updated;
      });
   };

   const resolveRowNote = (reportId: string, noteId: string) => {
      updateReportById(reportId, report => {
         const worksheet = report.expenseWorksheet || defaultExpenseWorksheet();
         return {
            ...report,
            expenseWorksheet: {
               ...worksheet,
               notes: worksheet.notes.map(note =>
                 note.id === noteId ? { ...note, resolved: true, resolvedAt: new Date().toISOString() } : note
               ),
            },
         };
      });
   };

   const addWorksheetRow = (reportId: string, input: { category: ExpenseRowCategory; serviceProvider?: string; amount: number; customLabel?: string }) => {
      if (!input.amount || input.amount <= 0) return;
      updateReportById(reportId, report => {
         const worksheet = report.expenseWorksheet || defaultExpenseWorksheet();
         const option = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === input.category);
         const type = option?.type || 'EXPENSE';
         const label = input.category === 'OTHER'
           ? (input.customLabel?.trim() || 'Other expense')
           : option?.label || 'Expense';
         const newRow: ExpenseWorksheetRow = {
            id: makeId(),
            type,
            category: input.category,
            label,
            serviceProvider: type === 'EXPENSE' ? input.serviceProvider?.trim() : undefined,
            amount: input.amount,
            createdBy: currentUser?.id,
            createdAt: new Date().toISOString(),
         };
         const rows = [...(worksheet.rows || []), newRow];
         const totals = recalcWorksheetTotals(rows);
         const expensesItems = worksheetRowsToExpenseItems(rows);
         const historyEntry: ExpenseWorksheetHistoryEntry = {
            id: makeId(),
            timestamp: new Date().toISOString(),
            userId: currentUser?.id || 'system',
            userName: currentUser?.name || 'System',
            action: 'ROW_ADDED',
            details: `${label} ₪${newRow.amount.toLocaleString()}`,
         };
         return {
            ...report,
            expenseWorksheet: {
               ...worksheet,
               rows,
               totals,
               history: [historyEntry, ...(worksheet.history || [])],
            },
            expensesItems,
            expensesSum: totals.totalExpenses.toLocaleString(),
         };
      });
   };

   // Finance creates task for Lawyer
  const handleFinanceTaskCreate = (data: { lawyerId: string, instructions: string, odakanitNo: string, file?: any, worksheet?: DraftWorksheetRow[], invoiceFiles?: InvoiceFile[] }) => {
      const lawyer = USERS.find(u => u.id === data.lawyerId);
      if (!lawyer) return;
     const worksheetRowsConverted = convertDraftRowsToWorksheetRows(data.worksheet || [], currentUser || undefined);
     const worksheetTotals = recalcWorksheetTotals(worksheetRowsConverted);
      const invoiceAttachments = data.invoiceFiles || [];
     const waitingForInvoices = invoiceAttachments.length === 0;
      
    const baseReport: ReportData = {
        ...createNewReport(),
        createdBy: lawyer.id, // Assign ownership to lawyer
        ownerName: lawyer.name,
        ownerEmail: lawyer.email,
        status: waitingForInvoices ? 'WAITING_FOR_INVOICES' : 'TASK_ASSIGNED',
         odakanitNo: data.odakanitNo,
         financeInstructions: data.instructions,
         expensesSourceFile: data.file,
        selectedSections: ['Update', 'Expenses breakdown'], // Lawyers מקבלים עדכון + הוצאות כברירת מחדל
       isWaitingForInvoices: waitingForInvoices,
       requiresExpenses: true,
     };
     const newReport: ReportData = {
       ...baseReport,
       expensesItems: worksheetRowsConverted
         .filter(row => row.type === 'EXPENSE')
         .map(row => ({
           id: row.id,
           date: new Date().toISOString().split('T')[0],
           description: `${row.label}${row.serviceProvider ? ` (${row.serviceProvider})` : ''}`,
           amount: row.amount,
           currency: 'NIS'
         })),
       expensesSum: worksheetRowsConverted.length ? worksheetTotals.totalExpenses.toLocaleString() : baseReport.expensesSum,
        invoiceFiles: invoiceAttachments,
       expenseWorksheet: {
         status: 'DRAFT',
         rows: worksheetRowsConverted,
         history: [
           {
             id: makeId(),
             timestamp: new Date().toISOString(),
             userId: currentUser?.id || 'system',
             userName: currentUser?.name || 'System',
             action: 'WORKSHEET_CREATED',
             details: `${worksheetRowsConverted.length} rows added via finance request`,
           },
         ],
         notes: [],
         favorites: favoriteProviders[data.lawyerId] || [],
         totals: worksheetTotals,
       },
      };
      setReports(prev => [...prev, newReport]);
     pushNotification({
       id: `worksheet-${Date.now()}`,
       message: `New expense worksheet created for case ${data.odakanitNo || newReport.id}`,
       createdAt: new Date().toISOString(),
       reportId: newReport.id,
       severity: 'info',
     });
   };

  // When Iris finalizes an Expenses Sheet and sends it to the lawyer
  const handleNotifyLawyerFromFinance = async ({
    caseId,
    sheetId,
    lawyerId,
  }: {
    caseId: string;
    sheetId: string;
    lawyerId?: string;
  }) => {
    const normalizedCaseId = normalizeOdakanitNo(caseId);

    const folder = caseFolders?.[normalizedCaseId];

    const reportsForCase = reports.filter(
      (r: ReportData) => normalizeOdakanitNo(r.odakanitNo) === normalizedCaseId,
    );

    // Guard 1: תיק סגור – לא מייצרים דיווח פיננסי חדש ולא מודיעים לעורכת הדין.
    if (folder && folder.closedAt) {
      window.alert(
        'תיק זה סגור – לא ניתן ליצור דיווחים חדשים. אם נדרש חריג, פנו לאדמין לפתיחת התיק מחדש.',
      );
      return;
    }

    // Guard 2: תיק לא נמצא כלל במערכת (אין CaseFolder ואין דו״חות) – לא יוצרים כלום.
    if (!reportsForCase.length && !folder) {
      window.alert(
        'מספר תיק לא נמצא במערכת (ייתכן שנמחק). יש לוודא מספר תיק או לפנות לאדמין.',
      );
      return;
    }

    if (!reportsForCase.length) return;

    const byTimeDesc = (a: ReportData, b: ReportData) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    };

    let targetReport = reportsForCase
      .filter((r) => !lawyerId || r.createdBy === lawyerId)
      .sort(byTimeDesc)[0];

    if (!targetReport) {
      targetReport = reportsForCase.sort(byTimeDesc)[0];
    }

    if (!targetReport) return;

    const targetUserId = lawyerId || targetReport.createdBy;
    if (!targetUserId) return;

    const caseLabel = targetReport.odakanitNo || caseId;
    const insuredLabel =
      targetReport.insuredName || targetReport.plaintiffName || 'case';
    const message = `New financial update (Expenses breakdown) is available for Odakanit case ${caseLabel} (${insuredLabel}).`;

    // Fetch sheet + build expenses text
    let expensesText: string | null = null;
    let expensesSnapshotAt: string | undefined;
    let expensesHtml: string | null = null;
    let invoiceFilesFromSheet: InvoiceFile[] = [];

    try {
      const relations = await financialExpensesClient.getSheet(sheetId);
      if (relations && relations.sheet && relations.lineItems?.length) {
        const snapshot = financialExpensesClient.buildCumulativeExpensesSnapshot(
          relations.sheet.id,
          new Date().toISOString(),
        );
        if (!snapshot) return;
        const { effectiveSheet, allLines, opts } = snapshot;
        const { text, totals } = renderExpensesTableText(
          effectiveSheet,
          allLines,
          opts,
        );
        const invoiceCount = relations.attachments?.length ?? 0;
        const amountFormatted = totals.amountToRequest.toLocaleString('he-IL', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const intro =
          'This expenses breakdown was prepared by the finance department and is attached for your review.';
        const summaryLine = `Summary: total amount to request ₪${amountFormatted}${
          invoiceCount > 0 ? ` (invoices attached: ${invoiceCount})` : ''
        }.`;
        // בטקסט הסיכום שנכנס לדו"ח עצמו נסתפק בהקדמה + שורה מסכמת,
        // ואת פירוט השורות נשאיר לטבלת ה-HTML (expensesHtml).
        expensesText = `${intro}\n\n${summaryLine}`;

        // HTML table for rich rendering inside the PDF body
        const { html } = renderExpensesTableHtml(
          effectiveSheet,
          allLines,
          opts,
        );
        expensesHtml = html;
        expensesSnapshotAt =
          relations.sheet.updatedAt || new Date().toISOString();

        if (relations.attachments && relations.attachments.length) {
          const MAX_INVOICES_GLOBAL = 4;
          const toAdd = relations.attachments
            .slice(0, MAX_INVOICES_GLOBAL)
            .map(
              (att, idx): InvoiceFile => ({
                id: `fes-inv-${att.id}-${idx}`,
                name: att.originalFileName,
                data: att.fileKey.split(',').pop() || att.fileKey,
                type: att.mimeType || 'application/pdf',
              }),
            );
          if (toAdd.length) invoiceFilesFromSheet = toAdd;
        }
      }
    } catch (err) {
      logError(
        'Failed to build Expenses Breakdown text for finance notification',
        err,
      );
    }

    const nowIso = new Date().toISOString();
    const finalExpensesText =
      expensesText ||
      'An expenses table has been prepared by the finance department for this case. Please review the attached sheet or coordinate with Finance as needed.';

    const nextReportNumber =
      typeof targetReport.reportNumber === 'number' &&
      targetReport.reportNumber > 0
        ? targetReport.reportNumber + 1
        : (targetReport.reportHistory?.length || 0) + 1;

    // Build base financial update report (will be enriched with supersede links below)
    let financeUpdateReport: ReportData = {
      ...targetReport,
      id: `${Date.now()}-finance`,
      createdBy: targetUserId,
      status: 'TASK_ASSIGNED',
      reportDate: nowIso,
      updatedAt: nowIso,
      expensesSheetId: sheetId,
      expensesSnapshotAt: expensesSnapshotAt || nowIso,
      invoiceFiles: invoiceFilesFromSheet,
      reportNumber: nextReportNumber,
      reportHistory: targetReport.reportHistory || [],
      // בדיווח פיננסי לא מצרפים שוב את הפוליסה כנספח – רק את חשבוניות המס
      attachPolicyAsAppendix: false,
      expensesHtml: expensesHtml || undefined,
      content: {
        ...targetReport.content,
        Update: targetReport.content?.Update || '',
        'Expenses breakdown': finalExpensesText,
        Recommendations: targetReport.content?.Recommendations || '',
      },
      selectedSections: ['Update', 'Expenses breakdown', 'Recommendations'],
      supersededByReportId: null,
      supersedesReportId: null,
    };

    setReports((prev) => {
      // מצא דוח פיננסי קודם לאותו גיליון הוצאות (אם קיים) כדי לבנות שרשרת supersede
      const previousFinanceReport = [...prev]
        .filter(
          (r) =>
            r.expensesSheetId === sheetId &&
            !r.deletedAt &&
            r.id !== financeUpdateReport.id,
        )
        .sort((a, b) => {
          const aTime = new Date(a.updatedAt || a.reportDate || '').getTime() || 0;
          const bTime = new Date(b.updatedAt || b.reportDate || '').getTime() || 0;
          return bTime - aTime;
        })[0];

      let nextReports = prev;
      if (previousFinanceReport) {
        // קושר את הדוח הקודם כ"הוחלף" ומעדכן בדוח החדש את המצב "מחליף את"
        nextReports = prev.map((r) =>
          r.id === previousFinanceReport.id
            ? { ...r, supersededByReportId: financeUpdateReport.id }
            : r,
        );
        financeUpdateReport = {
          ...financeUpdateReport,
          supersedesReportId: previousFinanceReport.id,
        };
      }

      return [...nextReports, financeUpdateReport];
    });

    pushNotification({
      id: `${Date.now()}`,
      message,
      createdAt: new Date().toISOString(),
      reportId: financeUpdateReport.id,
      severity: 'info',
      targetUserId,
    });
  };

  const handleUserLogin = (user: User) => {
     setCurrentUser(user);
     setView('DASHBOARD');
     setCurrentReport(null);
     setCanEditLockedReportForId(null);
     hydratedCurrentReport.current = false;
     if (typeof window !== 'undefined') {
       localStorage.setItem(STORAGE_KEYS.USER, user.username);
       localStorage.setItem(STORAGE_KEYS.VIEW, 'DASHBOARD');
       localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
     }
   };

  const [showLogoutBackupModal, setShowLogoutBackupModal] = useState(false);
  const [logoutBackupDone, setLogoutBackupDone] = useState(false);

  const handleLogoutClick = () => {
    const hasData = reports.length > 0 || currentReport || (caseFolders && Object.keys(caseFolders).length > 0);
    const isAdminOrSubAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUB_ADMIN';
    if (!hasData && !isAdminOrSubAdmin) {
      performLogout();
      return;
    }
    setLogoutBackupDone(false);
    setShowLogoutBackupModal(true);
  };

  const handleLogoutConfirm = () => {
    setShowLogoutBackupModal(false);
    setLogoutBackupDone(false);
    performLogout();
  };

  const performLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.warn('Logout API call failed, clearing client state anyway', e);
    }
    // Clear user/session-related React state
    setCurrentUser(null);
    setCurrentReport(null);
    setCanEditLockedReportForId(null);
    hydratedCurrentReport.current = false;
    setView('DASHBOARD');

    // Clear per-session UI state that should not leak across users
    setStep1Focus(null);
    setIsPreviewVisible(false);
    setIsEmailModalOpen(false);
    setIsSendingEmail(false);
    setIsResendMode(false);
    setIsFileNameModalOpen(false);
    setNoteModalReport(null);
    setNoteMessage('');
    setReminderModalReport(null);
    setReminderMessage('');
    setReminderTarget('LAWYER');
    setWorksheetSessions([]);
    setActiveWorksheetId(null);
    setShowNotifications(false);
    setCurrentCaseOdakanitNo(null);
    setTimelineGallery([]);

    // Clear session-localStorage keys (but keep global data like templates/favorites)
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_REPORT);
        localStorage.setItem(STORAGE_KEYS.VIEW, 'DASHBOARD');
        // Reset Admin dashboard UI state so a new user starts fresh
        localStorage.removeItem(ADMIN_DASHBOARD_UI_KEY);
      } catch (error) {
        console.error('Failed to clear session storage on logout', error);
      }
    }
  };

  // Navigation Logic: wait for session check before showing login or app
  if (!authCheckDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bgDark">
        <div className="text-textMuted text-sm flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          <span>טוען...</span>
        </div>
      </div>
    );
  }
  if (!currentUser) return <LoginScreen onLogin={handleUserLogin} />;

  if (view === 'CASE_FOLDER' && currentCaseOdakanitNo) {
    const folder = caseFolders[currentCaseOdakanitNo] || null;
    const handleBackToDashboard = () => {
      setView('DASHBOARD');
    };

    if (!folder) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bgDark px-4">
          <div className="max-w-md rounded-2xl bg-panel p-6 text-center text-sm text-textLight shadow-sm border border-borderDark">
            <p className="mb-3 font-semibold text-gold">
              Case folder not found
            </p>
            <p className="mb-4 text-xs text-textMuted">
              The requested case folder is no longer available. You can return to the dashboard and select another case.
            </p>
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="inline-flex items-center rounded-full bg-navy px-4 py-1.5 text-xs font-semibold text-gold shadow-sm hover:bg-navySecondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      );
    }

    return (
      <CaseFolderView
        folder={folder}
        reports={reports}
        currentUserRole={currentUser.role}
        onBack={handleBackToDashboard}
        onUpdateReTemplate={(value) => {
          setCaseFolders((prev) => {
            const existing = prev[currentCaseOdakanitNo];
            if (!existing) return prev;
            const updated: CaseFolder = {
              ...existing,
              reTemplate: value,
              updatedAt: new Date().toISOString(),
            };
            const next = { ...prev, [currentCaseOdakanitNo]: updated };
            saveCaseFolders(next);
            return next;
          });
        }}
        onCloseCase={
          currentUser.role === 'ADMIN'
            ? () => {
                const key = currentCaseOdakanitNo;
                if (!key) return;
                const normalizedKey = normalizeOdakanitNo(key);
                const hasOpenDraft = reports.some(
                  (r) =>
                    normalizeOdakanitNo(r.odakanitNo) === normalizedKey &&
                    r.status !== 'SENT' &&
                    !r.deletedAt,
                );
                if (hasOpenDraft) {
                  window.alert(
                    'לא ניתן לסגור תיק כל עוד קיימות בו טיוטות פתוחות. יש לסגור או למחוק טיוטות לפני סגירת התיק.',
                  );
                  return;
                }
                if (
                  !window.confirm(
                    'סגירת התיק תסיר אותו מהדשבורדים ותמנע יצירת דיווחים חדשים. להמשיך בסגירת התיק?',
                  )
                ) {
                  return;
                }
                const closedAt = new Date().toISOString();
                setCaseFolders((prev) => {
                  const existing = prev[key];
                  if (!existing) return prev;
                  const next: CaseFolder = {
                    ...existing,
                    closedAt,
                    closedByUserId: currentUser.id,
                    updatedAt: closedAt,
                  };
                  const updated = { ...prev, [key]: next };
                  saveCaseFolders(updated);
                  return updated;
                });
              }
            : undefined
        }
        onReopenCase={
          currentUser.role === 'ADMIN'
            ? () => {
                const key = currentCaseOdakanitNo;
                if (!key) return;
                if (
                  !window.confirm(
                    'פתיחת התיק מחדש תחזיר אותו לדשבורדים ותאפשר שוב עבודה שוטפת. לפתוח את התיק?',
                  )
                ) {
                  return;
                }
                setCaseFolders((prev) => {
                  const existing = prev[key];
                  if (!existing) return prev;
                  const next: CaseFolder = {
                    ...existing,
                    closedAt: null,
                    closedByUserId: null,
                    updatedAt: new Date().toISOString(),
                  };
                  const updated = { ...prev, [key]: next };
                  saveCaseFolders(updated);
                  return updated;
                });
              }
            : undefined
        }
        onDeleteCase={
          currentUser.role === 'ADMIN'
            ? () => {
                const key = currentCaseOdakanitNo;
                if (!key) return;
                const normalizedKey = normalizeOdakanitNo(key);
                const hasOpenDraft = reports.some(
                  (r) =>
                    normalizeOdakanitNo(r.odakanitNo) === normalizedKey &&
                    r.status !== 'SENT' &&
                    !r.deletedAt,
                );
                if (hasOpenDraft) {
                  window.alert(
                    'לא ניתן למחוק תיק שבו קיימות טיוטות פתוחות. יש לסגור או למחוק טיוטות לפני מחיקה מוחלטת.',
                  );
                  return;
                }
                if (
                  !window.confirm(
                    'מחיקה מוחלטת של התיק תסיר אותו וכל הדיווחים הקשורים אליו מהמערכת (ללא אפשרות שחזור). האם אתה בטוח?',
                  )
                ) {
                  return;
                }
                if (
                  !window.confirm(
                    'אישור נוסף: האם למחוק את התיק ודיווחיו לצמיתות? פעולה זו אינה ניתנת לביטול.',
                  )
                ) {
                  return;
                }
                setCaseFolders((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  saveCaseFolders(next);
                  return next;
                });
                setReports((prev) =>
                  prev.filter(
                    (r) => normalizeOdakanitNo(r.odakanitNo) !== normalizedKey,
                  ),
                );
                setCurrentCaseOdakanitNo(null);
                setView('DASHBOARD');
              }
            : undefined
        }
        onCreateReportInCase={() => {
          const baseFolder = caseFolders[currentCaseOdakanitNo];
          if (!baseFolder || !currentUser) return;

          // Case-level guard: do not allow new drafts in a closed case.
          if (baseFolder.closedAt) {
            window.alert('תיק זה סגור. לא ניתן ליצור בו דיווחים חדשים.');
            return;
          }

          // If there is already an active draft in this case, prevent creating another for lawyers.
          const existingDraft = reports.find(
            (r) =>
              r.odakanitNo &&
              normalizeOdakanitNo(r.odakanitNo) === normalizeOdakanitNo(baseFolder.odakanitNo) &&
              r.status !== 'SENT' &&
              !r.deletedAt,
          );
          if (existingDraft && currentUser.role === 'LAWYER') {
            window.alert(
              'קיימת כבר טיוטה פעילה בתיק זה. לא ניתן ליצור טיוטה נוספת. יש להמשיך לעבוד על הטיוטה הקיימת.',
            );
            return;
          }
          if (existingDraft && currentUser.role === 'ADMIN') {
            const confirmed = window.confirm(
              'קיימת כבר טיוטה פעילה בתיק זה. האם ליצור בכל זאת טיוטה נוספת (פעולה חריגה, מומלצת רק במקרים מיוחדים)?',
            );
            if (!confirmed) {
              return;
            }
          }

          const now = new Date().toISOString();
          const baseReport = createNewReport();
          const historyFromFolder = buildPreviousReportsFromFolder(baseFolder);
          const nextNumber = getNextReportNumberForCase({
            odakanitNo: baseFolder.odakanitNo,
            reports,
            caseFolder: baseFolder,
          });

          // Prefer using the last SENT snapshot from the case folder as the auto-summary source.
          const sentSnapshots = Array.isArray(baseFolder.sentReports)
            ? baseFolder.sentReports
            : [];

          let latestSnapshot = null as (SentReportSnapshot | null);
          let fallbackText = '';
          if (sentSnapshots.length > 0) {
            latestSnapshot = [...sentSnapshots].sort((a, b) => {
              const at = new Date(a.sentAt || '').getTime() || 0;
              const bt = new Date(b.sentAt || '').getTime() || 0;
              return bt - at;
            })[0];
            const snapshot = latestSnapshot?.snapshot || {};
            const content = (snapshot as any).content || {};
            const selectedSections: string[] = Array.isArray(
              (snapshot as any).selectedSections,
            )
              ? (snapshot as any).selectedSections
              : [];

            const orderedKeys =
              selectedSections.length > 0 ? selectedSections : Object.keys(content);
            const pieces: string[] = [];
            orderedKeys.forEach((key) => {
              const val = content[key];
              if (typeof val === 'string' && val.trim()) {
                pieces.push(val.trim());
              }
            });
            fallbackText = pieces.join('\n\n').trim();
          }

          const hasSummarySource = Boolean(latestSnapshot && fallbackText);
          const PLACEHOLDER_UPDATE =
            'מייצרת תקציר אוטומטי מהדיווח הקודם…';

          const report: ReportData = {
            ...baseReport,
            odakanitNo: baseFolder.odakanitNo,
            reportSubject: baseFolder.reTemplate || '',
            insuredName: baseFolder.insuredName || '',
            plaintiffName: baseFolder.plaintiffName || '',
            insurerName: baseFolder.insurerName || '',
            marketRef: baseFolder.marketRef || '',
            lineSlipNo: baseFolder.lineSlipNo || '',
            certificateRef: baseFolder.certificateRef || '',
            reportDate: now,
            updatedAt: now,
            reportHistory: historyFromFolder,
            reportNumber: nextNumber,
            content: hasSummarySource
              ? {
                  ...(baseReport.content || {}),
                  Update: PLACEHOLDER_UPDATE,
                }
              : baseReport.content,
            updateAutoSummarySourceReportId: hasSummarySource
              ? latestSnapshot!.reportId
              : null,
            updateAutoSummaryGeneratedAt: hasSummarySource ? now : null,
            updateAutoSummaryEdited: false,
          };

          setCurrentReport(report);
          setCanEditLockedReportForId(null);
          setView('STEP1');
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, report.id);
            } catch {
              // ignore
            }
          }
          upsertCaseFolderFromReport(report, now);

          // Kick off AI summary generation in the background, without blocking the user.
          if (hasSummarySource) {
            const sourceText = fallbackText;
            const sourceReportId = latestSnapshot!.reportId;

            void (async () => {
              try {
                let summary = await generateHebrewReportSummary(sourceText);
                summary = (summary || '').trim();
                if (!summary) {
                  // Fallback: snippet-based summary if AI returned empty
                  const trimmed = sourceText.trim();
                  const snippet = trimmed.slice(0, 600);
                  summary = `כזכור, בדיווחים האחרונים עודכן כי ${snippet}`;
                }

                if (!summary.startsWith('כזכור, בדיווחים האחרונים')) {
                  summary = `כזכור, בדיווחים האחרונים עודכן כי ${summary}`;
                }

                // Apply the summary only if the user has not manually edited the Update yet.
                updateReportById(report.id, (current) => {
                  if (
                    current.updateAutoSummaryEdited ||
                    current.content?.Update !== PLACEHOLDER_UPDATE
                  ) {
                    return current;
                  }
                  return {
                    ...current,
                    content: {
                      ...(current.content || {}),
                      Update: summary,
                    },
                    updateAutoSummarySourceReportId: sourceReportId,
                    updateAutoSummaryGeneratedAt: new Date().toISOString(),
                  };
                });
              } catch (error) {
                console.error(
                  'Auto summary generation failed, falling back to snippet.',
                  error,
                );
                const trimmed = sourceText.trim();
                if (!trimmed) return;
                const snippet = trimmed.slice(0, 600);
                const fallbackSummary = `כזכור, בדיווחים האחרונים עודכן כי ${snippet}`;

                updateReportById(report.id, (current) => {
                  if (
                    current.updateAutoSummaryEdited ||
                    current.content?.Update !== PLACEHOLDER_UPDATE
                  ) {
                    return current;
                  }
                  return {
                    ...current,
                    content: {
                      ...(current.content || {}),
                      Update: fallbackSummary,
                    },
                    updateAutoSummarySourceReportId: sourceReportId,
                    updateAutoSummaryGeneratedAt: new Date().toISOString(),
                  };
                });
              }
            })();
          }
        }}
        onOpenReport={(id) => {
          const rep = reports.find((r) => r.id === id);
          if (rep) {
            setCurrentReport(rep);
            setCanEditLockedReportForId(null);
            setView('STEP1');
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, rep.id);
              } catch {
                // ignore
              }
            }
          }
        }}
      />
    );
  }

  const handleNewReportFromDashboard = () => {
    // For lawyers – first ask for Odakanit case number
    if (currentUser?.role === 'LAWYER') {
      setNewCaseOdakanitInput('');
      setShowNewCaseModal(true);
      return;
    }

    const report = createNewReport();
    setCurrentReport(report);
    setCanEditLockedReportForId(null);
    setView('STEP1');
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, report.id);
      } catch {
        // ignore
      }
    }
  };

  const handleSelectReportFromDashboard = (
    id: string,
    focus?: 'REVIEW' | 'EXTERNAL_FEEDBACK',
  ) => {
    const rep = reports.find((r) => r.id === id);
    if (rep) {
      setCurrentReport(rep);
      setCanEditLockedReportForId(null);
      setView('STEP1');
      if (focus) {
        setStep1Focus(focus);
      } else {
        setStep1Focus(null);
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, rep.id);
        } catch {
          // ignore
        }
      }
    }
  };

  if (view === 'DASHBOARD') {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'SUB_ADMIN') {
      return (
        <>
          <AdminDashboard
            user={currentUser}
            reports={reports}
            caseFolders={caseFolders}
            onUpdateCaseFolders={(updater) => {
              setCaseFolders((prev) => {
                const next = updater(prev);
                saveCaseFolders(next);
                return next;
              });
            }}
            onNewReport={handleNewReportFromDashboard}
            onSelectReport={handleSelectReportFromDashboard}
            onSelectReportWithFocus={(id: string, focus: 'REVIEW' | 'EXTERNAL_FEEDBACK') =>
              handleSelectReportFromDashboard(id, focus)
            }
            onMarkExternalIssuesDone={markExternalIssuesAsDone}
            onReopenHebrewDueToExternalFeedback={(id: string) =>
              reopenHebrewDueToExternalFeedback(id)
            }
            canTranslate={canTranslate}
            onLogout={handleLogoutClick}
            onOpenAssistant={() => setIsAssistantOpen(true)}
            onOpenCaseFolder={(odakanitNo: string) => {
              const key = normalizeOdakanitNo(odakanitNo);
              if (!key) return;

              // ודא שתיק בעודכנית קיים ומעודכן לפני הניווט למסך התיק
              setCaseFolders((prev) => {
                const next = migrateCaseFoldersFromReportsOnceInMap(prev, reports);
                saveCaseFolders(next);
                return next;
              });

              setCurrentCaseOdakanitNo(key);
              setView('CASE_FOLDER');
            }}
          />
          {showLogoutBackupModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" dir="rtl">
              <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-bold text-gold">גיבוי לפני התנתקות</h3>
                <p className="text-sm text-textLight">
                  לפני ההתנתקות יש לבצע גיבוי למידע. הורד את קובץ הגיבוי ולאחר מכן אשר התנתקות.
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      downloadFullBackup(reports, currentReport, caseFolders);
                      setLogoutBackupDone(true);
                    }}
                    className="px-4 py-2 rounded-lg bg-navy text-gold text-sm font-semibold hover:bg-navySecondary"
                  >
                    הורד גיבוי
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutConfirm}
                    disabled={!logoutBackupDone}
                    title={logoutBackupDone ? '' : 'יש להוריד גיבוי לפני התנתקות'}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    התנתק (לאחר גיבוי)
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutConfirm}
                    className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50"
                  >
                    התנתק בכל זאת
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogoutBackupModal(false);
                      setLogoutBackupDone(false);
                    }}
                    className="px-4 py-2 rounded-lg border border-borderDark text-textLight text-sm hover:bg-navySecondary"
                  >
                    ביטול
                  </button>
                </div>
                {logoutBackupDone && (
                  <p className="text-xs text-green-600">הגיבוי הורד. ניתן להתנתק כעת.</p>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      );
    }

    return (
      <>
      <Dashboard
        user={currentUser}
        reports={reports}
        onNewReport={handleNewReportFromDashboard}
        onSelectReport={handleSelectReportFromDashboard}
        onLogout={handleLogoutClick}
        onUpdateReport={(id: string, data: any) => {
          updateReportById(id, (report) => ({ ...report, ...data }));
        }}
        onDeleteReport={(id: string) => setReports((prev) => prev.filter((r) => r.id !== id))}
        onFinanceTaskCreate={handleFinanceTaskCreate}
        onNotifyLawyerFromFinance={handleNotifyLawyerFromFinance}
        onSheetDeleted={(sheetId) => {
          setReports((prev) =>
            prev.map((r) =>
              r.expensesSheetId === sheetId
                ? { ...r, expensesSheetId: undefined, expensesHtml: undefined, expensesSnapshotAt: undefined }
                : r
            )
          );
        }}
        caseTemplates={caseTemplates}
        onStartTemplate={startReportFromTemplate}
        onStartNextReport={startNextReport}
        archiveAfterMs={ARCHIVE_AFTER_MS}
        favoriteProviders={favoriteProviders}
        onSaveFavorite={saveFavoriteProvider}
        onDeleteFavorite={deleteFavoriteProvider}
        onOpenWorksheet={openWorksheetSession}
        onRequestReminder={(report: ReportData) => {
          setReminderModalReport(report);
          setReminderMessage(`Reminder for ${report.insuredName || 'case'}`);
        }}
        onRequestNote={(report: ReportData) => {
          setNoteModalReport(report);
          setNoteMessage('');
        }}
        onSoftDeleteReport={softDeleteReport}
        onRestoreReport={restoreDeletedReport}
          notifications={notifications.filter(
            (n) => !n.targetUserId || n.targetUserId === currentUser?.id,
          )}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        onClearNotifications={() => setNotifications([])}
        dailySummaryOptIn={dailySummaryOptIn}
        setDailySummaryOptIn={setDailySummaryOptIn}
        caseFolders={caseFolders}
        onOpenCaseFolder={(odakanitNo: string) => {
          const key = normalizeOdakanitNo(odakanitNo);
          if (!key) return;

          // ודא שתיק בעודכנית קיים ומעודכן לפני הניווט למסך התיק
          setCaseFolders((prev) => {
            const next = migrateCaseFoldersFromReportsOnceInMap(prev, reports);
            saveCaseFolders(next);
            return next;
          });

          setCurrentCaseOdakanitNo(key);
          setView('CASE_FOLDER');
        }}
        onOpenAssistant={() => setIsAssistantOpen(true)}
      />

        {showLogoutBackupModal && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" dir="rtl">
            <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-lg font-bold text-gold">גיבוי לפני התנתקות</h3>
              <p className="text-sm text-textLight">
                לפני ההתנתקות יש לבצע גיבוי למידע. הורד את קובץ הגיבוי ולאחר מכן אשר התנתקות.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    downloadFullBackup(reports, currentReport, caseFolders);
                    setLogoutBackupDone(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-navy text-gold text-sm font-semibold hover:bg-navySecondary"
                >
                  הורד גיבוי
                </button>
                <button
                  type="button"
                  onClick={handleLogoutConfirm}
                  disabled={!logoutBackupDone}
                  title={logoutBackupDone ? '' : 'יש להוריד גיבוי לפני התנתקות'}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  התנתק (לאחר גיבוי)
                </button>
                <button
                  type="button"
                  onClick={handleLogoutConfirm}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50"
                >
                  התנתק בכל זאת
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutBackupModal(false);
                    setLogoutBackupDone(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-borderDark text-textLight text-sm hover:bg-navySecondary"
                >
                  ביטול
                </button>
              </div>
              {logoutBackupDone && (
                <p className="text-xs text-green-600">הגיבוי הורד. ניתן להתנתק כעת.</p>
              )}
            </div>
          </div>,
          document.body
        )}

        {currentUser?.role === 'LAWYER' && showNewCaseModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40">
            <div className="bg-panel rounded-2xl shadow-xl max-w-sm w-full mx-4 p-5 space-y-3" dir="rtl">
              <h2 className="text-sm font-bold text-textLight text-right">פתיחת תיק לפי מספר עודכנית</h2>
              <p className="text-xs text-textMuted text-right">
                הזן/י מספר תיק בעודכנית. אם זה תיק חדש – תיפתח תיקייה חדשה ותתחיל/י דו"ח חדש.
                אם זה תיק קיים – נפתח עבורך את תיקיית התיק.
              </p>
              <input
                type="text"
                className="w-full border border-borderDark rounded px-3 py-1.5 text-sm bg-white text-slate-900 placeholder:text-slate-500"
                placeholder="לדוגמה: 1/123"
                value={newCaseOdakanitInput}
                onChange={(e) => setNewCaseOdakanitInput(e.target.value)}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-borderDark text-xs text-textLight bg-panel hover:bg-slate-50"
                  onClick={() => {
                    setShowNewCaseModal(false);
                    setNewCaseOdakanitInput('');
                  }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md bg-navy text-xs font-semibold text-gold hover:bg-navySecondary"
                  onClick={() => {
                    const raw = newCaseOdakanitInput.trim();
                    if (!raw) {
                      alert('יש להזין מספר תיק בעודכנית.');
                      return;
                    }
                    const key = raw;
                    const existingFolder = caseFolders[key];
                    const now = new Date().toISOString();

                    if (existingFolder) {
                      // תיק קיים – פותחים דו"ח חדש עם נתוני התיק והיסטוריה
                      const baseReport = createNewReport();
                      const historyFromFolder = buildPreviousReportsFromFolder(existingFolder);
                      const nextNumber = getNextReportNumberForCase({
                        odakanitNo: existingFolder.odakanitNo,
                        reports,
                        caseFolder: existingFolder,
                      });
                      const report: ReportData = {
                        ...baseReport,
                        odakanitNo: existingFolder.odakanitNo,
                        reportSubject: existingFolder.reTemplate || '',
                        insuredName: existingFolder.insuredName || '',
                        plaintiffName: existingFolder.plaintiffName || '',
                        insurerName: existingFolder.insurerName || '',
                        marketRef: existingFolder.marketRef || '',
                        lineSlipNo: existingFolder.lineSlipNo || '',
                        certificateRef: existingFolder.certificateRef || '',
                        reportDate: now,
                        updatedAt: now,
                        reportHistory: historyFromFolder,
                        reportNumber: nextNumber,
                      };
                      setCurrentReport(report);
                      setView('STEP1');
                      if (typeof window !== 'undefined') {
                        try {
                          localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, report.id);
                        } catch {
                          // ignore
                        }
                      }
                      upsertCaseFolderFromReport(report, now);
                    } else {
                      // תיק חדש – יוצרים דו"ח חדש ורושמים את מספר העודכנית
                      const base = createNewReport();
                      const nextReport: ReportData = { ...base, odakanitNo: key };
                      setCurrentReport(nextReport);
                      setView('STEP1');
                      if (typeof window !== 'undefined') {
                        try {
                          localStorage.setItem(STORAGE_KEYS.CURRENT_REPORT, nextReport.id);
                        } catch {
                          // ignore
                        }
                      }
                      upsertCaseFolderFromReport(nextReport, now);
                    }

                    setShowNewCaseModal(false);
                    setNewCaseOdakanitInput('');
                  }}
                >
                  המשך
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!currentReport) return null; // Should not happen

  const currentReportNumber =
    (typeof currentReport.reportNumber === 'number' && currentReport.reportNumber > 0)
      ? currentReport.reportNumber
      : (currentReport.reportHistory?.length || 0) + 1;
  const rawFileNameTitles = mapSectionsToFileNameTitles(currentReport.selectedSections || []);
  const availableFileNameTitleOptions = rawFileNameTitles
    .map((label, index) => ({
      id: `${index}-${label.replace(/\s+/g, '-') || 'title'}`,
      label,
    }))
    .filter((option) => Boolean(option.label));
  const defaultFileNameTitles = dedupeTitles(rawFileNameTitles);
  const effectiveFileNameTitles =
    currentReport.fileNameTitles && currentReport.fileNameTitles.length
      ? currentReport.fileNameTitles
      : defaultFileNameTitles;
  const canEditFileNameTitles = availableFileNameTitleOptions.length > 0;

   const worksheetSessionItems = worksheetSessions
     .map(session => {
        const report = getReportById(session.reportId);
        if (!report) return null;
        return { ...session, report, title: `${report.insuredName || 'Case'} (${report.ownerName})` };
     })
     .filter(Boolean) as { reportId: string; report: ReportData; title: string }[];
   const activeWorksheetReport = activeWorksheetId ? getReportById(activeWorksheetId) : null;

   return (
      <>
      <div className="min-h-screen bg-navySecondary pb-12">
         <div className="w-full pt-6 px-6 md:px-8 lg:px-10 xl:px-12">
            {/* Stepper Header + Global Assistant */}
            <div className="flex justify-between items-center mb-8">
               <div className="flex items-center bg-panel p-2 rounded-full shadow-sm">
                  <div className={`px-4 py-1 rounded-full ${view === 'STEP1' ? 'bg-navy text-white font-bold' : 'text-textMuted'}`}>1. Setup</div>
                  <ChevronRight className="w-4 h-4 text-gray-300 mx-2"/>
                  <div className={`px-4 py-1 rounded-full ${view === 'STEP2' ? 'bg-navy text-white font-bold' : 'text-textMuted'}`}>2. Draft</div>
                  <ChevronRight className="w-4 h-4 text-gray-300 mx-2"/>
                  <div className={`px-4 py-1 rounded-full ${view === 'PREVIEW' ? 'bg-navy text-white font-bold' : 'text-textMuted'}`}>3. Preview</div>
               </div>
               <button
                 type="button"
                 onClick={() => setIsAssistantOpen(true)}
                 className="flex items-center text-[11px] px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100"
                 title="העוזר החכם – זמין בכל שלב, להסבר על זרימת העבודה והכלים."
               >
                 <Lightbulb className="w-3 h-3 ml-1" />
                 העוזר החכם
               </button>
            </div>

           {currentReport && (() => {
             const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
             const folderForReport =
               odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
             const lockState = getReportLockState(currentReport, folderForReport || undefined);
             const isCaseClosed = Boolean(folderForReport?.closedAt);
             const hasAdminOverride =
               currentUser?.role === 'ADMIN' && canEditLockedReportForId === currentReport.id;
             // Banner is always shown for closed cases; for other locks, hide only when override is active.
             const shouldShow =
               (lockState.isLocked || isCaseClosed) && !(hasAdminOverride && !isCaseClosed);
             return shouldShow;
           })() && (
              <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[13px]">
                    {(() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(
                        currentReport,
                        folderForReport || undefined,
                      );
                      if (folderForReport?.closedAt) {
                        return 'התיק סגור – הדו״ח מוצג לקריאה בלבד.';
                      }
                      if (lockState.lockType === 'MANUAL') {
                        return 'הדו״ח ננעל ידנית לעריכה.';
                      }
                      if (lockState.lockType === 'AUTO' && lockState.lockAt) {
                        return `הדו״ח ננעל אוטומטית בתאריך ${new Date(
                          lockState.lockAt,
                        ).toLocaleDateString('he-IL')}.`;
                      }
                      return 'הדו״ח מוגבל לעריכה.';
                    })()}
                  </p>
                  <p className="mt-1 text-[11px]">
                    ניתן לצפות בתוכן, להעתיק טקסט ולהוריד PDF, אך לא ניתן לשנות את הדו&quot;ח ללא פתיחה חריגה על‑ידי אדמין.
                  </p>
                </div>
                {currentUser?.role === 'ADMIN' && (
                  <div className="flex flex-col items-end gap-2">
                    {(() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(
                        currentReport,
                        folderForReport || undefined,
                      );
                      return currentReport.status === 'SENT' && !lockState.isLocked;
                    })() && (
                      <button
                        type="button"
                        className="shrink-0 inline-flex items-center rounded-full bg-panel px-3 py-1.5 text-[11px] font-semibold text-amber-900 border border-amber-300 hover:bg-amber-100"
                        onClick={() => {
                          const reason = window.prompt(
                            'פתיחת דו״ח שנשלח לעריכה היא פעולה חריגה.\nאנא הזן/י סיבה קצרה לפתיחה זו (תתועד ביומן המערכת):',
                          );
                          if (!reason || !reason.trim()) return;
                          // Enable override for this SENT report only; audit is recorded on the report.
                          setCanEditLockedReportForId(currentReport.id);
                          const now = new Date().toISOString();
                          const adminId = currentUser.id;
                          const adminName = currentUser.name;
                          // Store minimal override metadata directly on the report for transparency.
                          handleUpdateReport({
                            lastAdminOverrideAt: now as any,
                            lastAdminOverrideById: adminId as any,
                            lastAdminOverrideByName: adminName as any,
                            lastAdminOverrideReason: reason.trim() as any,
                          } as any);
                        }}
                      >
                        פתח לעריכה (חריג)
                      </button>
                    )}

                    {(() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(
                        currentReport,
                        folderForReport || undefined,
                      );
                      const canExtend =
                        !lockState.isLocked && !!currentReport.firstSentAt && !folderForReport?.closedAt;
                      const canManualLock =
                        !folderForReport?.closedAt &&
                        !currentReport.manualLockedAt &&
                        !lockState.isLocked;

                      return (
                        <div className="flex flex-wrap gap-2 justify-end">
                          {canExtend && (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-semibold text-amber-900 border border-amber-300 hover:bg-amber-200"
                              onClick={() => {
                                const reason = window.prompt(
                                  'הארכת חלון העריכה ב-35 ימים נוספים.\nאנא הזן/י סיבה קצרה (תתועד ביומן המערכת):',
                                );
                                if (!reason || !reason.trim()) return;
                                const nowIso = new Date().toISOString();
                                const existing = currentReport.lockExtensions || [];
                                handleUpdateReport({
                                  lockExtensions: [
                                    ...existing,
                                    {
                                      extendedAt: nowIso,
                                      extendedById: currentUser.id,
                                      extendedByName: currentUser.name,
                                      days: 35,
                                      reason: reason.trim(),
                                    },
                                  ],
                                });
                              }}
                            >
                              הארך חלון עריכה (+35 ימים)
                            </button>
                          )}

                          {canManualLock && (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-semibold text-amber-900 border border-amber-300 hover:bg-amber-200"
                              onClick={() => {
                                const reason = window.prompt(
                                  'נעילת הדו״ח לעריכה היא פעולה משמעותית.\nאנא הזן/י סיבה קצרה לנעילה זו (תתועד ביומן המערכת):',
                                );
                                if (!reason || !reason.trim()) return;
                                const nowIso = new Date().toISOString();
                                handleUpdateReport({
                                  manualLockedAt: nowIso,
                                  manualLockedById: currentUser.id,
                                  manualLockedByName: currentUser.name,
                                  manualLockReason: reason.trim(),
                                });
                              }}
                            >
                              נעל דיווח עכשיו
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {view === 'STEP1' && (
               <Step1_Selection 
                  data={currentReport} 
                  updateData={handleUpdateReport} 
                  onNext={() => { 
                    if (currentReport) {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      if (!lockState.isLocked) {
                        saveCurrentReport();
                      }
                    }
                    setView('STEP2'); 
                  }} 
                  onBack={() => { 
                    if (currentReport) {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      if (!lockState.isLocked) {
                        saveCurrentReport();
                      }
                    }
                    setView('DASHBOARD'); 
                  }} 
                  currentUser={currentUser}
                  timelineGallery={timelineGallery}
                  onAddTimelineImages={(imgs) => setTimelineGallery(prev => [...prev, ...imgs.map(i => ({...i, id: Date.now().toString()}))])}
                  onRemoveTimelineImage={(id) => setTimelineGallery(prev => prev.filter(i => i.id !== id))}
                  onSaveAndExit={() => { 
                    if (currentReport) {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      if (!lockState.isLocked) {
                        saveCurrentReport();
                      }
                    }
                    setView('DASHBOARD'); 
                  }}
                  readOnly={
                    !!currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(
                        currentReport,
                        folderForReport || undefined,
                      );
                  const isCaseClosed = Boolean(folderForReport?.closedAt);
                  const hasAdminOverride =
                    currentUser?.role === 'ADMIN' &&
                    canEditLockedReportForId === currentReport.id &&
                    !isCaseClosed;
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (hasAdminOverride) return false;
                      if (isLawyerSent) return true;
                  if (isCaseClosed) return true;
                  return lockState.isLocked;
                    })()
                  }
               />
            )}

            {view === 'STEP2' && (
               <Step2_Content 
                  data={currentReport} 
                  updateData={handleUpdateReport}
                  showToast={showToast} 
                onNext={() => {
                  if (currentReport) {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    if (!lockState.isLocked) {
                      saveCurrentReport();
                    }
                  }
                  setView('PREVIEW');
                }}
                onBack={() => {
                  if (currentReport) {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    if (!lockState.isLocked) {
                      saveCurrentReport();
                    }
                  }
                  setView('STEP1');
                }}
                  currentUser={currentUser}
                  timelineGallery={timelineGallery} 
                  onAddTimelineImages={(_imgs) => {}} 
                onSaveAndExit={() => {
                  if (currentReport) {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    if (!lockState.isLocked) {
                      saveCurrentReport();
                    }
                  }
                  setView('DASHBOARD');
                }}
                  onSaveDraft={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return saveCurrentReport;
                    })()
                  }
                  onTranslate={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return handleTranslate;
                    })()
                  }
                  onFormatContent={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return formatAllReportText;
                    })()
                  }
                  onSubmitHebrewForReview={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return () => submitHebrewForReview(currentReport.id);
                    })()
                  }
                onApproveHebrewForTranslation={
                  currentReport &&
                  (() => {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    const isLawyerSent =
                      currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                    if (isLawyerSent || lockState.isLocked) return undefined;
                    return () => approveHebrewForTranslation(currentReport.id);
                  })()
                }
                  onAddReviewIssues={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return (issues: NewIssueInput[]) =>
                        addReviewIssues(currentReport.id, issues);
                    })()
                  }
                onMarkReviewIssueDone={
                  currentReport &&
                  (() => {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    const isLawyerSent =
                      currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                    if (isLawyerSent || lockState.isLocked) return undefined;
                    return (issueId: string) =>
                      markReviewIssueDone(currentReport.id, issueId);
                  })()
                }
                  onAddExternalFeedbackIssues={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return (issues: NewIssueInput[], externalRefId?: string) =>
                        addExternalFeedbackIssues(
                          currentReport.id,
                          issues,
                          externalRefId,
                        );
                    })()
                  }
                  onReopenHebrewDueToExternalFeedback={
                    currentReport &&
                    (() => {
                      const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                      const folderForReport =
                        odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                      const lockState = getReportLockState(currentReport, folderForReport || undefined);
                      const isLawyerSent =
                        currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                      if (isLawyerSent || lockState.isLocked) return undefined;
                      return () => reopenHebrewDueToExternalFeedback(currentReport.id);
                    })()
                  }
                  step1Focus={step1Focus}
                  onStep1FocusConsumed={() => setStep1Focus(null)}
                isTranslating={isTranslating}
                isImprovingEnglish={isImprovingEnglish}
                onImproveEnglish={
                  currentReport &&
                  (() => {
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(currentReport, folderForReport || undefined);
                    const isLawyerSent =
                      currentUser?.role === 'LAWYER' && currentReport.status === 'SENT';
                    if (isLawyerSent || lockState.isLocked) return undefined;
                    return handleImproveEnglish;
                  })()
                }
                onOpenAssistant={() => setIsAssistantOpen(true)}
                onActiveSectionChange={(sectionKey) => setActiveSectionKey(sectionKey)}
                readOnly={
                  !!currentReport &&
                  (() => {
                    const hasAdminOverride =
                      currentUser?.role === 'ADMIN' &&
                      canEditLockedReportForId === currentReport.id;
                    if (!currentReport) return false;
                    const odakanitKey = normalizeOdakanitNo(currentReport.odakanitNo);
                    const folderForReport =
                      odakanitKey && caseFolders ? caseFolders[odakanitKey] : undefined;
                    const lockState = getReportLockState(
                      currentReport,
                      folderForReport || undefined,
                    );
                    return !hasAdminOverride && lockState.isLocked;
                  })()
                }
               />
            )}

            {view === 'PREVIEW' && (
              (() => {
                const previewLabels = getPreviewLabelsForRole(currentUser?.role);
                const isLawyer = currentUser?.role === 'LAWYER';
                return (
                  <div
                    className="space-y-6 animate-fade-in"
                    dir={isLawyer ? 'rtl' : undefined}
                    lang={isLawyer ? 'he' : undefined}
                  >
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <button
                        onClick={() => {
                          saveCurrentReport();
                          setView('STEP2');
                        }}
                        className="flex items-center text-sm text-textMuted bg-navySecondary px-3 py-1.5 rounded-full hover:bg-borderDark"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        {previewLabels.backToStep2}
                      </button>
                      <button
                        onClick={() => {
                          saveCurrentReport();
                          setView('DASHBOARD');
                        }}
                        className="flex items-center text-sm text-lpBlue bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100"
                      >
                        <Home className="w-4 h-4 mr-1" />
                        {previewLabels.backToDashboard}
                      </button>
                    </div>
                    <div className="flex justify-between items-center bg-panel p-4 rounded shadow mb-4">
                      <div>
                      <h2 className="text-xl font-bold text-lpBlue">
                        {previewLabels.title}
                      </h2>
                      </div>
                      <div className="flex gap-3 flex-wrap justify-end items-center">
                        <div className="flex items-center gap-2 text-sm text-textMuted">
                          <button
                            onClick={() => setIsPreviewVisible((prev) => !prev)}
                            className="flex items-center px-3 py-1.5 rounded border border-borderDark hover:bg-navySecondary"
                          >
                            {isPreviewVisible
                              ? previewLabels.toggleHide
                              : previewLabels.toggleShow}
                          </button>
                          <button
                            onClick={handleDownloadPdf}
                            disabled={isPdfGenerating}
                            className="flex items-center px-3 py-1.5 rounded border border-borderDark hover:bg-navySecondary disabled:opacity-50"
                          >
                            {isPdfGenerating ? (
                              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 mr-1.5" />
                            )}
                            {previewLabels.downloadPdf}
                          </button>
                          {canEditFileNameTitles && (
                          <button
                            onClick={() => setIsFileNameModalOpen(true)}
                            className="flex items-center px-3 py-1.5 rounded border border-borderDark hover:bg-navySecondary"
                            title={previewLabels.editFileNames}
                          >
                            {previewLabels.editFileNames}
                          </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 border-r border-borderDark pr-3">
                          {currentReport.lastEmailSent && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              Last email sent on{' '}
                              {new Date(currentReport.lastEmailSent.sentAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}{' '}
                              to Broker (+CC)
                            </span>
                          )}
                          <button
                            onClick={handleFinalizeClick}
                            className="flex items-center bg-green-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-green-700 shadow-sm"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            {previewLabels.finalize}
                          </button>
                          {currentUser.role === 'ADMIN' && (
                            <button
                              onClick={handlePrepareResendClick}
                              className="flex items-center bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-orange-700 shadow-sm"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              הכן שליחה מחדש למבטחת
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isPreviewVisible ? (
                      <div className="bg-panel rounded-2xl shadow p-4 space-y-4">
                        <div className="flex items-center justify-end flex-wrap gap-3">
                          <span className="text-xs text-textMuted">
                            {previewLabels.helperScroll}
                          </span>
                        </div>
                        <div className="border rounded-2xl bg-navySecondary p-4 pr-6 max-h-[900px] overflow-auto shadow-inner">
                          <div className="scale-[0.85] origin-top flex justify-center overflow-visible">
                            <DocumentPreview data={currentReport} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-textMuted border border-dashed border-borderDark rounded-2xl p-6 bg-navySecondary">
                        {previewLabels.collapsedHint}
                      </div>
                    )}

                    <div className="flex justify-start mt-4">
                      <button
                        onClick={() => setView('STEP2')}
                        className="px-6 py-2 bg-borderDark text-textLight rounded hover:bg-borderDark"
                      >
                        {previewLabels.backToEditing}
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
         </div>
      </div>
      {currentReport && (
        <EmailTemplateModal
          isOpen={isEmailModalOpen}
          isSending={isSendingEmail}
          report={currentReport}
          userId={currentUser?.id}
          mailMode={mailConfig?.mode}
          recipientsPreview={getEmailRecipients(currentReport)}
          defaultSubject={buildSmartEmailSubject(currentReport)}
          defaultBodyWhenNoDraft={buildDefaultEmailContent(currentReport).body}
          subjectDraft={buildSmartEmailSubject(currentReport)}
          onSubjectDraftChange={(value) =>
            handleUpdateReport({
              emailSubjectDraft:
                value && value.trim() ? value.trim() : undefined,
            })
          }
          selectedTopics={currentReport.fileNameTitles || []}
          onSelectedTopicsChange={(topics: string[]) =>
            handleUpdateReport({ fileNameTitles: topics })
          }
          isResendMode={isResendMode}
          onClose={() => {
            if (!isSendingEmail) {
              setIsResendMode(false);
              setIsEmailModalOpen(false);
            }
          }}
          onSend={isResendMode ? handleResendEmailSend : handleEmailSend}
        />
      )}

      {currentReport && (
        <FileNameTitleSelectorModal
          isOpen={isFileNameModalOpen}
          availableTitles={availableFileNameTitleOptions}
          selectedTitles={effectiveFileNameTitles}
          onClose={() => setIsFileNameModalOpen(false)}
          onSave={(titles) => {
            const cleaned = titles.map((title) => title.trim()).filter(Boolean);
            handleUpdateReport({ fileNameTitles: cleaned });
            setIsFileNameModalOpen(false);
          }}
        />
      )}

      <AssistantPanel
        isOpen={isAssistantOpen}
        onClose={() => {
          setIsAssistantOpen(false);
        }}
        view={view}
        currentUser={currentUser}
        currentReport={currentReport}
        loading={assistantLoading}
        error={assistantError}
        response={assistantResponse}
        onRunIntent={handleRunAssistantIntent}
      />

      {noteModalReport && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-textLight flex items-center gap-2"><NotebookPen className="w-4 h-4"/> Add Note</h3>
            <p className="text-sm text-textMuted">Case: {noteModalReport.insuredName || noteModalReport.odakanitNo || noteModalReport.id}</p>
            <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
              <textarea className="w-full border rounded p-3 text-sm" rows={4} value={noteMessage} onChange={e => setNoteMessage(e.target.value)} placeholder="Write your note..." />
            </GrammarlyEditorPlugin>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setNoteModalReport(null); setNoteMessage(''); }} className="px-4 py-2 text-textMuted hover:bg-navySecondary rounded">Cancel</button>
              <button onClick={() => { if (noteModalReport && noteMessage.trim()) { addReportNote(noteModalReport.id, noteMessage.trim()); setNoteModalReport(null); setNoteMessage(''); } }} className="px-4 py-2 bg-navy text-white rounded hover:bg-navySecondary">Save</button>
            </div>
          </div>
        </div>
      )}

      {reminderModalReport && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-textLight flex items-center gap-2"><Bell className="w-4 h-4"/> Send Reminder</h3>
            <p className="text-sm text-textMuted">Case: {reminderModalReport.insuredName || reminderModalReport.odakanitNo || reminderModalReport.id}</p>
            <label className="text-xs font-bold text-textMuted">Recipients</label>
            <select className="w-full border rounded p-2 text-sm" value={reminderTarget} onChange={e => setReminderTarget(e.target.value as any)}>
              <option value="LAWYER">Lawyer</option>
              <option value="SUB_ADMIN">Sub-Admin</option>
              <option value="BOTH">Both</option>
            </select>
            <label className="text-xs font-bold text-textMuted">Message</label>
            <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
              <textarea className="w-full border rounded p-3 text-sm" rows={4} value={reminderMessage} onChange={e => setReminderMessage(e.target.value)} placeholder="Reminder details..." />
            </GrammarlyEditorPlugin>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setReminderModalReport(null); setReminderMessage(''); }} className="px-4 py-2 text-textMuted hover:bg-navySecondary rounded">Cancel</button>
              <button onClick={() => {
                if (reminderModalReport && reminderMessage.trim()) {
                   const recipients: string[] = [];
                   if (reminderTarget === 'LAWYER' || reminderTarget === 'BOTH') recipients.push(reminderModalReport.ownerName);
                   if (reminderTarget === 'SUB_ADMIN' || reminderTarget === 'BOTH') {
                      recipients.push(...USERS.filter(u => u.role === 'SUB_ADMIN').map(u => u.name));
                   }
                   pushNotification({
                     id: `reminder-${Date.now()}`,
                     message: `Reminder to ${recipients.join(', ')}: ${reminderMessage.trim()}`,
                     createdAt: new Date().toISOString(),
                     reportId: reminderModalReport.id,
                   });
                   setReminderModalReport(null);
                   setReminderMessage('');
                }
              }} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Send</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutBackupModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gold">גיבוי לפני התנתקות</h3>
            <p className="text-sm text-textLight">
              לפני ההתנתקות יש לבצע גיבוי למידע. הורד את קובץ הגיבוי ולאחר מכן אשר התנתקות.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  downloadFullBackup(reports, currentReport, caseFolders);
                  setLogoutBackupDone(true);
                }}
                className="px-4 py-2 rounded-lg bg-navy text-gold text-sm font-semibold hover:bg-navySecondary"
              >
                הורד גיבוי
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                disabled={!logoutBackupDone}
                title={logoutBackupDone ? '' : 'יש להוריד גיבוי לפני התנתקות'}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                התנתק (לאחר גיבוי)
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50"
              >
                התנתק בכל זאת
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutBackupModal(false);
                  setLogoutBackupDone(false);
                }}
                className="px-4 py-2 rounded-lg border border-borderDark text-textLight text-sm hover:bg-navySecondary"
              >
                ביטול
              </button>
            </div>
            {logoutBackupDone && (
              <p className="text-xs text-green-600">הגיבוי הורד. ניתן להתנתק כעת.</p>
            )}
          </div>
        </div>,
        document.body
      )}

      {preSendGuard && preSendGuard.issues.length > 0 && (
        <div className="fixed inset-0 bg-black/40 z-[210] flex items-center justify-center p-4">
          <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-textLight">רגע לפני שליחה</h3>
              <button
                type="button"
                onClick={() => setPreSendGuard(null)}
                className="p-1 rounded hover:bg-slate-100 text-textMuted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-textMuted">
              זיהינו כמה נקודות שכדאי לבדוק לפני הפקת PDF או שליחת הדו״ח למבטחת. אפשר לתקן עכשיו או להמשיך בכל זאת.
            </p>
            <ul className="space-y-2 text-sm text-textLight">
              {preSendGuard.issues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex items-start justify-between gap-3 border border-slate-100 rounded-md px-3 py-2 bg-slate-50"
                >
                  <span className="flex-1">{issue.label}</span>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      className="text-[11px] text-indigo-700 hover:text-indigo-900 underline whitespace-nowrap"
                      onClick={() => {
                        setIsAssistantOpen(true);
                        void handleRunAssistantIntent(issue.intent);
                      }}
                    >
                      למה זה חשוב?
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-textLight hover:text-textLight underline whitespace-nowrap"
                      onClick={() => {
                        setPreSendGuard(null);
                        if (issue.kind === 'TRANSLATION_OUTDATED') {
                          // ניווט לשלב 2 כדי לרענן תרגום (Auto-Translate / Improve English)
                          saveCurrentReport();
                          setView('STEP2');
                        } else if (issue.kind === 'TONE_RISK_NOT_RUN') {
                          // ניווט לשלב 2 למסך שבו מפעילים Tone & Risk
                          saveCurrentReport();
                          setView('STEP2');
                        } else if (issue.kind === 'EXPENSES_OLD') {
                          // לעתיד: ניווט למסך פיננסי; לעת עתה – חזרה לשלב 2 לסקירת ההוצאות
                          saveCurrentReport();
                          setView('STEP2');
                        }
                      }}
                    >
                      {issue.kind === 'TRANSLATION_OUTDATED'
                        ? 'רענן תרגום'
                        : issue.kind === 'TONE_RISK_NOT_RUN'
                        ? 'הרץ Tone & Risk'
                        : issue.kind === 'EXPENSES_OLD'
                        ? 'בדוק טבלת הוצאות'
                        : 'בדוק עכשיו'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-3">
              <button
                type="button"
                className="px-4 py-1.5 rounded-md bg-green-600 text-xs text-white hover:bg-green-700"
                onClick={() => {
                  const guard = preSendGuard;
                  setPreSendGuard(null);
                  if (guard?.onContinue) {
                    guard.onContinue();
                  }
                }}
              >
                המשך בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}

      {activeWorksheetReport && (
        <WorksheetModal
          report={activeWorksheetReport}
          sessions={worksheetSessionItems}
          onSwitch={setActiveWorksheetId}
          onClose={closeWorksheetSession}
          currentUser={currentUser}
          onAddRowNote={addRowNote}
          onResolveRowNote={resolveRowNote}
          onAddWorksheetRow={addWorksheetRow}
          previousReport={reports
            .filter(r => r.id !== activeWorksheetReport.id && r.odakanitNo && r.odakanitNo === activeWorksheetReport.odakanitNo)
            .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime())[0]}
        />
      )}
      </>
   );
};

type WorksheetModalProps = {
  report: ReportData;
  sessions: { reportId: string; title: string; report: ReportData }[];
  onSwitch: (reportId: string) => void;
  onClose: (reportId: string) => void;
  currentUser: User | null;
  onAddRowNote: (reportId: string, rowId: string | undefined, message: string) => void;
  onResolveRowNote: (reportId: string, noteId: string) => void;
  onAddWorksheetRow: (reportId: string, input: { category: ExpenseRowCategory; serviceProvider?: string; amount: number; customLabel?: string }) => void;
  previousReport?: ReportData;
};

const WorksheetModal: React.FC<WorksheetModalProps> = ({
  report,
  sessions,
  onSwitch,
  onClose,
  currentUser,
  onAddRowNote,
  onResolveRowNote,
  onAddWorksheetRow,
  previousReport,
}) => {
  const [viewTab, setViewTab] = useState<'table' | 'history' | 'notes' | 'compare'>('table');
  const [rowNoteDraft, setRowNoteDraft] = useState('');
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [newRowDraft, setNewRowDraft] = useState<{ category: ExpenseRowCategory; serviceProvider: string; amount: string; customLabel: string }>({
    category: 'EXPERT_OUR',
    serviceProvider: '',
    amount: '',
    customLabel: '',
  });
  const worksheet = report.expenseWorksheet || defaultExpenseWorksheet();
  const expenseRows = worksheet.rows.filter(row => row.type === 'EXPENSE');
  const adjustmentRows = worksheet.rows.filter(row => row.type === 'ADJUSTMENT');
  const openNotes = worksheet.notes.filter(note => !note.resolved);
  const totals = worksheet.totals || recalcWorksheetTotals(worksheet.rows);
  const canEditWorksheet = currentUser?.role === 'FINANCE' || currentUser?.role === 'SUB_ADMIN';
  const selectedDraftOption = EXPENSE_DETAIL_OPTIONS.find(opt => opt.value === newRowDraft.category);
  const draftIsExpense = selectedDraftOption?.type !== 'ADJUSTMENT';

  const handleRowNote = (rowId?: string) => {
    if (!rowNoteDraft.trim()) return;
    onAddRowNote(report.id, rowId, rowNoteDraft.trim());
    setRowNoteDraft('');
    setActiveRowId(null);
  };

  const handleAddWorksheetRow = () => {
    const amountNumber = parseFloat(newRowDraft.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return;
    onAddWorksheetRow(report.id, {
      category: newRowDraft.category,
      serviceProvider: draftIsExpense ? newRowDraft.serviceProvider : undefined,
      amount: amountNumber,
      customLabel: newRowDraft.customLabel,
    });
    setNewRowDraft({
      category: 'EXPERT_OUR',
      serviceProvider: '',
      amount: '',
      customLabel: '',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[220] flex items-center justify-center p-4">
      <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-5 py-3 border-b bg-navySecondary">
          <div>
            <p className="text-xs text-textMuted uppercase">Expense Worksheet</p>
            <h2 className="text-lg font-bold text-textLight">{report.insuredName || report.odakanitNo || 'Case'} · {report.ownerName}</h2>
          </div>
          <button onClick={() => onClose(report.id)} className="text-textMuted hover:text-textLight">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex border-b bg-panel px-4 overflow-x-auto">
          {sessions.map(session => (
            <button
              key={session.reportId}
              onClick={() => onSwitch(session.reportId)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 ${session.reportId === report.id ? 'border-lpBlue text-lpBlue font-bold' : 'border-transparent text-gray-400'}`}
            >
              {session.title}
              <span
                onClick={(e) => { e.stopPropagation(); onClose(session.reportId); }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 px-5 pt-4 text-sm font-semibold">
          {['table', 'history', 'notes', 'compare'].map(tab => (
            <button
              key={tab}
              onClick={() => setViewTab(tab as any)}
              className={`px-3 py-1 rounded-full ${viewTab === tab ? 'bg-navy text-white' : 'bg-navySecondary text-textMuted'}`}
            >
              {tab === 'table' ? 'Worksheet' : tab === 'history' ? 'History' : tab === 'notes' ? `Notes (${openNotes.length})` : 'Compare'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {viewTab === 'table' && (
            <>
              <div className="grid grid-cols-3 gap-4 text-center bg-navySecondary rounded-lg py-3">
                <div>
                  <p className="text-xs uppercase text-gray-400">Total Expenses</p>
                  <p className="text-lg font-bold text-textLight">₪{totals.totalExpenses.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Adjustments</p>
                  <p className="text-lg font-bold text-yellow-700">₪{totals.totalAdjustments.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-400">Balance Due</p>
                  <p className="text-lg font-bold text-green-700">₪{totals.totalBalance.toLocaleString()}</p>
                </div>
              </div>
              {canEditWorksheet && (
                <div className="border rounded-lg p-3 bg-amber-50 space-y-2">
                  <p className="text-xs font-bold text-amber-700">הוספת שורה חדשה</p>
                  <div className="grid md:grid-cols-3 gap-2">
                    <select value={newRowDraft.category} onChange={(e) => setNewRowDraft({ ...newRowDraft, category: e.target.value as ExpenseRowCategory })} className="border rounded text-xs p-2">
                      {EXPENSE_DETAIL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {newRowDraft.category === 'OTHER' && (
                      <input className="border rounded text-xs p-2" placeholder="תיאור מותאם" value={newRowDraft.customLabel} onChange={(e) => setNewRowDraft({ ...newRowDraft, customLabel: e.target.value })} />
                    )}
                    {draftIsExpense && (
                      <input className="border rounded text-xs p-2" placeholder="שם ספק" value={newRowDraft.serviceProvider} onChange={(e) => setNewRowDraft({ ...newRowDraft, serviceProvider: e.target.value })} />
                    )}
                    <input className="border rounded text-xs p-2" placeholder="₪ סכום" type="number" min="0" value={newRowDraft.amount} onChange={(e) => setNewRowDraft({ ...newRowDraft, amount: e.target.value })} />
                    <button onClick={handleAddWorksheetRow} className="bg-amber-500 text-white rounded text-xs font-bold px-3 py-2 hover:bg-amber-600">Add</button>
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-bold text-textMuted mb-2">Service Expenses</h4>
                  <div className="space-y-2">
                    {expenseRows.length === 0 && <p className="text-xs text-gray-400">No expenses recorded.</p>}
                    {expenseRows.map(row => {
                      const noteCount = worksheet.notes.filter(note => note.rowId === row.id && !note.resolved).length;
                      return (
                        <div key={row.id} className="border rounded-lg p-3 bg-panel shadow-sm">
                          <div className="flex justify-between">
                            <div>
                              <p className="font-semibold text-sm">{row.label}</p>
                              {row.serviceProvider && <p className="text-xs text-textMuted">{row.serviceProvider}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lpBlue">₪{row.amount.toLocaleString()}</p>
                              <button className="text-[10px] text-gray-400" onClick={() => setActiveRowId(activeRowId === row.id ? null : row.id)}>
                                📌 Notes ({noteCount})
                              </button>
                            </div>
                          </div>
                          {activeRowId === row.id && (
                            <div className="mt-2 flex gap-2">
                              <input className="flex-1 border rounded text-xs p-2" value={rowNoteDraft} onChange={(e) => setRowNoteDraft(e.target.value)} placeholder="Add note..." />
                              <button onClick={() => handleRowNote(row.id)} className="px-3 py-1 text-xs bg-navy text-white rounded">Save</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-textMuted mb-2">Adjustments</h4>
                  <div className="space-y-2">
                    {adjustmentRows.length === 0 && <p className="text-xs text-gray-400">No adjustments yet.</p>}
                    {adjustmentRows.map(row => (
                      <div key={row.id} className="border rounded-lg p-3 bg-navySecondary">
                        <div className="flex justify-between">
                          <p className="font-semibold text-sm">{row.label}</p>
                          <p className="font-bold text-red-600">₪{row.amount.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border rounded-lg p-3 bg-navySecondary">
                <label className="block text-xs font-bold text-textMuted mb-1">General Note</label>
                <div className="flex gap-2">
                  <input className="flex-1 border rounded text-xs p-2" value={rowNoteDraft} onChange={(e) => setRowNoteDraft(e.target.value)} placeholder="Add note for worksheet..." />
                  <button onClick={() => handleRowNote(undefined)} className="px-3 py-1 text-xs bg-navy text-white rounded">Save</button>
                </div>
              </div>
            </>
          )}
          {viewTab === 'history' && (
            <div className="space-y-2">
              {worksheet.history.length === 0 && <p className="text-xs text-gray-400">No history recorded yet.</p>}
              {worksheet.history.map(entry => (
                <div key={entry.id} className="border rounded-lg p-3 bg-panel flex justify-between">
                  <div>
                    <p className="text-sm font-semibold">{entry.action}</p>
                    {entry.details && <p className="text-xs text-textMuted">{entry.details}</p>}
                  </div>
                  <div className="text-right text-[10px] text-gray-400">
                    <p>{entry.userName}</p>
                    <p>{new Date(entry.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {viewTab === 'notes' && (
            <div className="space-y-2">
              {worksheet.notes.length === 0 && <p className="text-xs text-gray-400">No notes yet.</p>}
              {worksheet.notes.map(note => (
                <div key={note.id} className={`border rounded-lg p-3 ${note.resolved ? 'bg-green-50' : 'bg-panel'}`}>
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-semibold">{note.authorName}</p>
                      <p className="text-xs text-textMuted">{note.message}</p>
                    </div>
                    <div className="text-right text-[10px] text-gray-400">
                      <p>{new Date(note.createdAt).toLocaleString()}</p>
                      {!note.resolved && (
                        <button onClick={() => onResolveRowNote(report.id, note.id)} className="text-xs text-green-600 hover:underline">Resolve</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {viewTab === 'compare' && (
            <div>
              {previousReport?.expenseWorksheet ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <h4 className="text-sm font-bold text-textMuted mb-2">Previous Report</h4>
                    <p className="text-xs text-gray-400 mb-2">{new Date(previousReport.reportDate).toLocaleDateString()}</p>
                    <p className="text-lg font-bold text-textLight">₪{previousReport.expenseWorksheet.totals.totalBalance.toLocaleString()}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <h4 className="text-sm font-bold text-textMuted mb-2">Current Report</h4>
                    <p className="text-xs text-gray-400 mb-2">{new Date(report.reportDate).toLocaleDateString()}</p>
                    <p className="text-lg font-bold text-textLight">₪{totals.totalBalance.toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No previous worksheet available for comparison.</p>
              )}
            </div>
          )}
        </div>
         </div>
      </div>
   );
};

const App = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);

export default App;