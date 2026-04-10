import { useState, useEffect, useRef } from 'react';
import type { ReportData, StepProps, User, ExpenseItem, SectionTemplate, HebrewStyleIssue, BestPracticeSnippet, MedicalComplaintAnalysis, PreviousReport, type AssistantHelpResponse, type AssistantIntent, type PersonalSnippet } from '../../../types';
import { AVAILABLE_SECTIONS, CLAIM_SECTION_LABEL, DEMAND_LETTER_SECTION_LABEL, LEGAL_SNIPPETS } from '../../../constants';
import { loadTemplates as loadSectionTemplates, upsertTemplate as upsertSectionTemplateInStore, deleteTemplate as deleteSectionTemplateInStore, reorderTemplate as reorderSectionTemplateInStore } from '../../../services/sectionTemplatesStore';
import { reviewHebrewStyle } from '../../../services/geminiService';
import { loadBestPractices, upsertBestPractice, deleteBestPractice, setBestPracticeEnabled, recordBestPracticeUsage } from '../../../services/bestPracticesStore';
import { getSectionDisplayTitle, getSectionPartyRole, ExpertCountMode, isExpertSection } from '../../../utils/sectionDisplay';
/**
 * Custom hook containing all state and handler logic for Step2Content.
 * Extracted to reduce the component file size.
 */
export const useStep2Logic = (props: any) => {
  const { data, updateData, currentUser, onSaveDraft, readOnly, showToast: showToastProp, onTranslate, onImproveEnglish, onFormatContent, onSubmitHebrewForReview, onApproveHebrewForTranslation, onAddReviewIssues, onMarkReviewIssueDone, onAddExternalFeedbackIssues, onReopenHebrewDueToExternalFeedback, onActiveSectionChange, onOpenAssistant, step1Focus, onStep1FocusConsumed, isTranslating, isImprovingEnglish, onBack, onNext, onSaveAndExit } = props;
  const CLAIM_SECTION_KEY = CLAIM_SECTION_LABEL;
  const DEMAND_SECTION_KEY = DEMAND_LETTER_SECTION_LABEL;
  const [expandedSnippetSection, setExpandedSnippetSection] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const showToast = showToastProp ?? (() => {});
  const [allSectionTemplates, setAllSectionTemplates] = useState<SectionTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [templateManagerSection, setTemplateManagerSection] = useState<string>(() => AVAILABLE_SECTIONS[0] || 'Update');
  // Tone & Risk feature removed — replaced by unified text improvement
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

  // Tone & Risk handlers removed — feature deprecated

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


  // Return all state and handlers for the component to use
  return {
    // Re-export props
    data, updateData, currentUser, onSaveDraft, readOnly, onTranslate, onImproveEnglish, onFormatContent, onSubmitHebrewForReview, onApproveHebrewForTranslation, onAddReviewIssues, onMarkReviewIssueDone, onAddExternalFeedbackIssues, onReopenHebrewDueToExternalFeedback, onActiveSectionChange, onOpenAssistant, step1Focus, onStep1FocusConsumed, isTranslating, isImprovingEnglish, onBack, onNext, onSaveAndExit,
    // State
    showToast: showToastProp ?? (() => {}),
    expandedSnippetSection, setExpandedSnippetSection, isAiProcessing, setIsAiProcessing,
    allSectionTemplates, setAllSectionTemplates, templateSearch, setTemplateSearch,
    isTemplateManagerOpen, setIsTemplateManagerOpen, templateManagerSection, setTemplateManagerSection,
    hebrewStyleIssues, setHebrewStyleIssues, isHebrewStyleRunning, hebrewStyleLastRunAt,
    hebrewRefineMode, setHebrewRefineMode, hebrewRefineDiff, setHebrewRefineDiff,
    bestPractices, setBestPractices, bestPracticeTab, setBestPracticeTab,
    bestPracticeSearch, setBestPracticeSearch, isBestPracticeManagerOpen, setIsBestPracticeManagerOpen,
    bestPracticeManagerSection, setBestPracticeManagerSection, bestPracticeDraft, setBestPracticeDraft,
    mySnippets, setMySnippets, mySnippetSearch, setMySnippetSearch, isMySnippetsManagerOpen, setIsMySnippetsManagerOpen, mySnippetDraft, setMySnippetDraft,
    englishViewMode, setEnglishViewMode, medicalTarget, setMedicalTarget,
    medicalProcessingTarget, refiningSection, expensesUploadMenu, setExpensesUploadMenu,
    improvingSectionKey, newExpense, setNewExpense,
    isRestrictedUser, canEditEnglish, canTranslateNow, canManageExpenses, canInsertWorksheet, hasExpensesSection,
    medicalFileInputRef,
    // Handlers
    handleImproveSection, handleAddExpense, handleInvoiceUpload, handleContentChange,
    handleTranslatedChange, applyTemplateToSection, handleToggleTemplatesPanel,
    handleSaveSelectionAsTemplate, handleTemplateFieldChange, handleDeleteTemplate,
    handleReorderTemplate, computeChangeRatioLabel, handleRefineText,
    handleExpensesFileExtraction, applyMedicalAnalysisToSections, applyFirstReportStrategy,
    handleSectionFileUpload, startMedicalAnalysis, handleMedicalFileSelected,
    handleRunHebrewStyleReview, handleClearHebrewStyle,
    handleApplyMySnippetInsert, handleCopyMySnippet, handleApplyHebrewStyleSuggestion,
    handleSaveSelectionAsBestPractice, handleSubmitBestPracticeDraft, handleCancelBestPracticeDraft,
    handleApplyBestPracticeInsert, handleCopyBestPractice, fillInsuranceCoverage,
    isInitialReport, getSectionAnalysisType,
  };
};
