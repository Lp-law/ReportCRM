import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Check,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Calendar,
  History,
  ListPlus,
  X,
  Upload,
  Loader2,
  FolderOpen,
  Home,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

import {
  ReportData,
  StepProps,
  InvoiceFile,
  MedicalComplaintAnalysis,
  ProceduralProcedureType,
  ProceduralTimelineStageId,
  ProceduralTimeline,
} from '../../types';
import {
  AVAILABLE_SECTIONS,
  INSURER_OPTIONS,
} from '../../constants';
import { normalizeOdakanitNo } from '../../utils/normalizeOdakanitNo';
import { transliterateHebrew } from '../../utils/hebrewTransliterate';
import {
  extractPolicyData,
  analyzeMedicalComplaint,
} from '../../services/geminiService';
import {
  PROCEDURE_TYPE_OPTIONS,
  PROCEDURAL_STAGE_CONFIG,
  STEP1_FIELD_LABELS,
  CANONICAL_EXPENSES_SECTION,
  isCanonicalExpensesSection,
  readFileAsBase64,
  buildMedicalAnalysisUpdates,
  fillInsuranceCoverageSection,
  hasHebrew,
  isExceptionalClient,
} from '../../App';

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

export default Step1_Selection;
