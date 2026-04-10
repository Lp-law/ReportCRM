import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GrammarlyEditorPlugin } from '@grammarly/editor-sdk-react';
import { FileText, Check, ChevronRight, ChevronLeft, Plus, Trash2, Calendar, History, ListPlus, X, ShieldAlert, Upload, Loader2, FolderOpen, UserCheck, HelpCircle, Calculator, LogOut, Receipt, Paperclip, Sparkles, Lightbulb, Globe, Send, FilePlus2, AlertTriangle, Eye, Wand2, NotebookPen, Bell, Table, Star, Home, ArrowRight, Search, ChevronUp, ChevronDown } from 'lucide-react';

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
import { fetchReports, saveReport as saveReportToDb, bulkImportReports as bulkImportReportsToDb } from './services/reportsApi';
import { csrfFetch } from './utils/csrfFetch';
import { downloadFullBackup as downloadFullBackupUtil } from './utils/backup';
import { resetAllAppData as resetAllAppDataUtil, ensureResetAllAppDataOnce as ensureResetOnce, migrateReportLabels as migrateReportLabelsUtil, migrateReportReview as migrateReportReviewUtil, migrateSectionLabels as migrateSectionLabelsUtil } from './utils/migrations';
import { ToastProvider, useToast } from './components/ui/Toast';
import {
  REPORT_REVIEW_PANEL_ID,
  EXTERNAL_FEEDBACK_PANEL_ID,
} from './constants/scrollTargets';
import CaseFolderView from './components/cases/CaseFolderView';
import LoginScreen from './components/auth/LoginScreen';
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { useExpenses } from './hooks/useExpenses';
import { useReportLock } from './hooks/useReportLock';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { useEditLock } from './hooks/useEditLock';
import LoadingOverlay from './components/ui/LoadingOverlay';
import EmptyState from './components/ui/EmptyState';
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
import { extractPolicyData, refineLegalText, improveEnglishText, extractExpensesTable, askHelpChat, analyzeMedicalComplaint, analyzeDentalOpinion, sendEmailViaOutlook, fetchReportPdf, requestAssistantHelp, generateHebrewReportSummary, translateLegalText, type HebrewRefineMode } from './services/geminiService';
import Step1_Selection from './components/steps/Step1Selection';
import Step2_Content from './components/steps/Step2Content';
import Dashboard from './components/steps/Dashboard';

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
export const PROCEDURE_TYPE_OPTIONS: { value: ProceduralProcedureType; label: string }[] = [
  { value: 'LETTER_OF_DEMAND', label: 'Letter of Demand' },
  { value: 'FIRST_INSTANCE', label: 'First Instance Proceedings' },
  { value: 'APPEAL', label: 'Appeal Proceedings' },
];

export const PROCEDURAL_STAGE_CONFIG: Record<
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

export const STEP1_FIELD_LABELS = {
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

/** Collects all user data for backup and triggers download (extracted to utils/backup.ts) */
const downloadFullBackup = downloadFullBackupUtil;

// Canonical Expenses section used when a financial expenses table from Iris is linked to the report
export const CANONICAL_EXPENSES_SECTION = 'Expenses breakdown';

export const isCanonicalExpensesSection = (sec: string): boolean => {
  if (!sec) return false;
  if (sec === CANONICAL_EXPENSES_SECTION) return true;
  // Fallback: recognize legacy/custom headers that clearly include the word "Expenses"
  return /\bexpenses\b/i.test(sec);
};

// resetAllAppData, ensureResetAllAppDataOnce — extracted to utils/migrations.ts
const resetAllAppData = resetAllAppDataUtil;
const ensureResetAllAppDataOnce = ensureResetOnce;

// migrateSectionLabels, migrateReportLabels, migrateReportReview — extracted to utils/migrations.ts
const migrateSectionLabels = migrateSectionLabelsUtil;
const migrateReportLabels = migrateReportLabelsUtil;
const migrateReportReview = migrateReportReviewUtil;

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

export const readFileAsBase64 = (file: File) =>
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

export const buildMedicalAnalysisUpdates = (analysis: MedicalComplaintAnalysis, report: ReportData) => {
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

export const fillInsuranceCoverageSection = (
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
export const hasHebrew = (str: string): boolean => /[\u0590-\u05FF]/.test(str || '');

// Exceptional clients (e.g. TEREM) – CERT/MARKET REF not required, hidden from UI and PDF
export const isExceptionalClient = (insuredName?: string): boolean => {
  const n = (insuredName || '').trim().toUpperCase();
  return n === 'TEREM' || n.includes('TEREM');
};

// Step1_Selection extracted to components/steps/Step1Selection.tsx

// Step2_Content — extracted to src/components/steps/Step2Content.tsx

// Dashboard — extracted to src/components/steps/Dashboard.tsx

// --- LOGIN SCREEN (extracted to src/components/auth/LoginScreen.tsx) ---

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
  // Auth hook replaces manual useState + /api/me useEffect
  const { currentUser, setCurrentUser, authCheckDone, isAdminUser, isHebrewUi } = useAuth();
  const [view, setView] = useState<'DASHBOARD' | 'STEP1' | 'STEP2' | 'PREVIEW' | 'CASE_FOLDER'>(() => loadStoredView());
   
  // Report State
  const [reports, setReports] = useState<ReportData[]>(() => loadStoredReports());
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null);
  const reportsRef = useRef<ReportData[]>(reports);
  const currentReportRef = useRef<ReportData | null>(currentReport);
  // Admin-only override for locked reports (from useReportLock hook)
  const { canEditLockedReportForId, enableOverride: setCanEditLockedReportForIdFn, clearOverride: clearReportLockOverride } = useReportLock(currentReport);
  const setCanEditLockedReportForId = (id: string | null) => id ? setCanEditLockedReportForIdFn(id) : clearReportLockOverride();

  // Edit lock: prevent concurrent edits on the same report
  const { lockInfo, hasLock } = useEditLock(
    currentReport?.id || null,
    currentUser?.id || null,
  );

  // Debug: עקוב אחרי רינדור ה־App וה־view הנוכחי
  // eslint-disable-next-line no-console
  console.log('AppInner render', { currentUser, view, reportsCount: reports.length });
   const hydratedCurrentReport = useRef(false);
  const [step1Focus, setStep1Focus] = useState<null | 'REVIEW' | 'EXTERNAL_FEEDBACK'>(null);
   // Shared State for Timelines
   const [timelineGallery, setTimelineGallery] = useState<{id: string, name: string, src: string}[]>([]);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  // isAdminUser and isHebrewUi now come from useAuth hook
  // Notifications state (from useNotifications hook)
  const { notifications, setNotifications, showNotifications, setShowNotifications, dailySummaryOptIn, setDailySummaryOptIn } = useNotifications();
  // Expenses state (from useExpenses hook)
  const { worksheetSessions, setWorksheetSessions, activeWorksheetId, setActiveWorksheetId, favoriteProviders, setFavoriteProviders, saveFavoriteProvider: saveFavProvider, deleteFavoriteProvider: deleteFavProvider } = useExpenses();

  // Auth rehydration is now handled by the useAuth hook

  // Load reports from DB when user is authenticated; migrate localStorage data on first load
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    fetchReports()
      .then((dbReports) => {
        if (cancelled) return;
        const localReports = loadStoredReports();
        if (dbReports.length === 0 && localReports.length > 0) {
          // First-time migration: push localStorage reports to DB
          console.log('[DB] Migrating', localReports.length, 'reports from localStorage to DB');
          bulkImportReportsToDb(localReports).catch((err) =>
            console.warn('[DB] Bulk import failed:', err.message),
          );
          // Keep local reports as source of truth for this session
        } else if (dbReports.length > 0) {
          // Merge: DB is source of truth, but keep any local-only reports
          const dbIds = new Set(dbReports.map((r) => r.id));
          const localOnly = localReports.filter((r) => !dbIds.has(r.id));
          const merged = [...dbReports, ...localOnly];
          setReports(merged);
        }
      })
      .catch((err) => {
        console.warn('[DB] Failed to fetch reports from server, using localStorage:', err.message);
      });
    return () => { cancelled = true; };
  }, [currentUser]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = isHebrewUi ? 'rtl' : 'ltr';
    document.documentElement.lang = isHebrewUi ? 'he' : 'en';
    if (document.body) {
      document.body.dir = isHebrewUi ? 'rtl' : 'ltr';
      document.body.lang = isHebrewUi ? 'he' : 'en';
    }
  }, [isHebrewUi]);

  // Notification persistence is now handled by the useNotifications hook
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

  // Report lock guardrail is now handled by the useReportLock hook

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

  // Favorites persistence is now handled by the useExpenses hook

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

    // Tone & Risk pre-send check removed (feature deprecated)

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

  // Persist reports to localStorage (immediate) and DB (debounced)
  const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
    } catch (error) {
      console.error('Failed to persist reports to localStorage', error);
    }
    // Debounced save to PostgreSQL (2-second delay to avoid hammering DB)
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    dbSaveTimerRef.current = setTimeout(() => {
      if (!currentUser) return;
      reports.forEach((r) => {
        saveReportToDb(r).catch((err) =>
          console.warn('[DB] Failed to sync report', r.id, err.message),
        );
      });
    }, 2000);
    return () => {
      if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    };
  }, [reports, currentUser]);

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
      await csrfFetch('/api/logout', {
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-bgDark">
        <div className="mb-8 h-16 w-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-2xl font-bold text-gold animate-pulse-slow">
          LP
        </div>
        <div className="text-textMuted text-sm flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gold/60" aria-hidden />
          <span className="tracking-wide">Loading...</span>
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
               {/* Concurrent edit lock warning */}
               {lockInfo.locked && lockInfo.lockedBy && (
                 <div className="ml-4 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm animate-fade-in" dir="rtl">
                   <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                   <span>{lockInfo.lockedBy.userName} עורך/ת כרגע את הדוח הזה. שינויים שלך עלולים להידרס.</span>
                 </div>
               )}
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
               <ErrorBoundary fallbackTitle="Step 1 encountered an error">
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
               </ErrorBoundary>
            )}

            {view === 'STEP2' && (
               <ErrorBoundary fallbackTitle="Step 2 encountered an error">
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
               </ErrorBoundary>
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

      {/* Global loading overlays for long operations */}
      <LoadingOverlay
        visible={isPdfGenerating}
        message="Generating PDF..."
        subMessage="This may take a few seconds"
      />
      <LoadingOverlay
        visible={isSendingEmail}
        message="Sending email..."
        subMessage="Delivering report to recipients"
      />
      <LoadingOverlay
        visible={isTranslating}
        message="Translating..."
        subMessage="Converting Hebrew to English"
      />
      </div>
   );
};

const App = () => (
  <ToastProvider>
    <ErrorBoundary fallbackTitle="Application Error">
      <AppInner />
    </ErrorBoundary>
  </ToastProvider>
);


export default App;
