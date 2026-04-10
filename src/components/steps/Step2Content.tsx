import React, { useState, useEffect, useRef } from 'react';
import { FileText, Check, ChevronRight, ChevronLeft, Plus, Trash2, X, Upload, Loader2, Sparkles, Lightbulb, Globe, Send, Wand2, NotebookPen, Table, Star, Search, ChevronUp, ChevronDown, Eye, AlertTriangle } from 'lucide-react';
import type { ReportData, StepProps, User, ExpenseItem, SectionTemplate, HebrewStyleIssue, BestPracticeSnippet, NewIssueInput, MedicalComplaintAnalysis, PreviousReport, type AssistantHelpResponse, type AssistantIntent, type PersonalSnippet } from '../../types';
import { AVAILABLE_SECTIONS, CLAIM_SECTION_LABEL, DEMAND_LETTER_SECTION_LABEL, INSURER_OPTIONS, LEGAL_SNIPPETS } from '../../constants';
import { loadTemplates as loadSectionTemplates, upsertTemplate as upsertSectionTemplateInStore, deleteTemplate as deleteSectionTemplateInStore, reorderTemplate as reorderSectionTemplateInStore } from '../../services/sectionTemplatesStore';
import { reviewHebrewStyle } from '../../services/geminiService';
import { loadBestPractices, upsertBestPractice, deleteBestPractice, setBestPracticeEnabled, recordBestPracticeUsage } from '../../services/bestPracticesStore';
import { getSectionDisplayTitle, getSectionPartyRole, ExpertCountMode, isExpertSection } from '../../utils/sectionDisplay';
import ReportReviewPanel from '../ReportReviewPanel';
import { REPORT_REVIEW_PANEL_ID, EXTERNAL_FEEDBACK_PANEL_ID } from '../../constants/scrollTargets';

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

import { useStep2Logic } from './step2/useStep2Logic';

const Step2_Content: React.FC<Step2ContentProps> = (props) => {
  const ctx = useStep2Logic(props);
  const {
    data, updateData, currentUser, onSaveDraft, readOnly, onTranslate, onImproveEnglish, onFormatContent,
    onSubmitHebrewForReview, onApproveHebrewForTranslation, onAddReviewIssues, onMarkReviewIssueDone,
    onAddExternalFeedbackIssues, onReopenHebrewDueToExternalFeedback, onActiveSectionChange, onOpenAssistant,
    step1Focus, onStep1FocusConsumed, isTranslating, isImprovingEnglish, onBack, onNext, onSaveAndExit,
    showToast, expandedSnippetSection, setExpandedSnippetSection, isAiProcessing, setIsAiProcessing,
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
  } = ctx;

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
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-textMuted">
              הגהה ובדיקת ניסוח
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunHebrewStyleReview}
              disabled={isHebrewStyleRunning}
              title="סורק את הדוח ומציג הערות על ניסוח וסגנון בעברית. לא משנה את הטקסט - מציע הערות בלבד."
              className={`flex items-center text-sm font-semibold px-4 py-2 rounded-lg border transition-all duration-200 ${
                isHebrewStyleRunning
                  ? 'bg-slate-100 text-slate-400 border-borderDark cursor-not-allowed'
                  : 'bg-blue-500/20 text-blue-200 border-blue-400/60 hover:bg-blue-500/30'
              }`}
            >
              {isHebrewStyleRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> בודק ניסוח...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-1.5" />
                  בדיקת ניסוח והגהה
                </>
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
                {hebrewStyleIssues.length} {hebrewStyleIssues.length === 1 ? 'הערה' : 'הערות'}
              </button>
            )}
          </div>
          {hebrewStyleLastRunAt &&
            !hebrewStyleIssues.length &&
            !isHebrewStyleRunning && (
              <div className="text-[11px] text-emerald-400">
                הניסוח תקין - אין הערות.
              </div>
            )}
        </div>
      )}
      {/* Tone & Risk panel removed */}
      {false && (
        <div
          id="tone-risk-panel-removed"
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

          // toneIssuesForSection removed (Tone & Risk feature deprecated)
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
                    {/* Tone & Risk per-section badge removed */}
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


export default Step2_Content;
