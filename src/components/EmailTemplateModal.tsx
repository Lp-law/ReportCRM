import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, X } from 'lucide-react';
import { GrammarlyEditorPlugin } from '@grammarly/editor-sdk-react';
import { ReportData } from '../types';
import { GRAMMARLY_CLIENT_ID } from '../config/grammarly';
import {
  DEFAULT_FILE_NAME_TOPICS,
  dedupeCaseInsensitive,
  loadUserFileNameTopics,
  saveUserFileNameTopics,
  sanitizeTopicLabel,
  upsertTopicMRU,
} from '../utils/fileNameTopics';
import buildReportFileName from '../utils/reportFileName';
import {
  resolveEmailScenario,
  RECOMMENDED_TEMPLATE_LABEL,
} from '../utils/emailContentDefaults';
import {
  clearInsurerDefaultTopics,
  getInsurerDefaultTopics,
  loadUserTopicCombos,
  setInsurerDefaultTopics,
  TopicCombo,
} from '../utils/topicPreferences';

interface EmailTemplate {
  id: string;
  label: string;
  body: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'general_update',
    label: 'General Update',
    body: `Dear Sir/Madam,

Please find below our general update regarding the above-captioned matter.

Best regards,
Lior Perry, Adv.`,
  },
  {
    id: 'risk_assessment',
    label: 'Risk Assessment',
    body: `Dear Sir/Madam,

Kindly review the following risk assessment prepared for the insurer.

Best regards,
Lior Perry, Adv.`,
  },
  {
    id: 'expert_opinion',
    label: 'Expert Opinion',
    body: `Dear Sir/Madam,

Please find our expert opinion summary for your review and records.

Best regards,
Lior Perry, Adv.`,
  },
  {
    id: 'full_report',
    label: 'Full Report Delivery',
    body: `Dear Sir/Madam,

Attached is the full report for the current update, including all relevant sections.

Best regards,
Lior Perry, Adv.`,
  },
  {
    id: 'zeev_new_demand',
    label: 'Zeev – New demand letter',
    body: `Dear Zeev,

I've attached a report regarding a new demand letter.

Sincerely,
Lior`,
  },
  {
    id: 'zeev_claim_update',
    label: 'Zeev – Claim update',
    body: `Dear Zeev,

I've attached a report on the claim in question.

Sincerely,
Lior`,
  },
  {
    id: 'zeev_new_lawsuit',
    label: 'Zeev – New lawsuit',
    body: `Dear Zeev,

I've attached a report regarding a new lawsuit.

Sincerely,
Lior`,
  },
  {
    id: 'zeev_lawsuit_update',
    label: 'Zeev – Lawsuit update',
    body: `Dear Zeev,

I've attached a report on the lawsuit in question.

Sincerely,
Lior`,
  },
];

const TEMPLATE_STORAGE_KEY = (userId?: string) => `emailTemplates:${userId || 'default'}`;

interface EmailTemplateModalProps {
  isOpen: boolean;
  report: ReportData;
  userId?: string;
  isSending?: boolean;
  /** SANDBOX | PROD from server (MAIL_MODE); controls SANDBOX badge */
  mailMode?: string;
  recipientsPreview: { to: string[]; cc: string[] };
  defaultSubject: string;
  /** Default body when report has no emailBodyDraft; used only on first open, never overrides draft */
  defaultBodyWhenNoDraft?: string;
  subjectDraft: string;
  onSubjectDraftChange: (value: string | undefined) => void;
  selectedTopics: string[];
  onSelectedTopicsChange: (topics: string[]) => void;
  /**
   * When true, the modal is used for resend (re-sending an already SENT report)
   * rather than for a brand new send.
   */
  isResendMode?: boolean;
  onClose: () => void;
  onSend: (payload: {
    body: string;
    templateId: string;
    subjectBase: string;
    topics: string[];
  }) => void;
}

const EmailTemplateModal: React.FC<EmailTemplateModalProps> = ({
  isOpen,
  report,
  userId,
  isSending = false,
  mailMode,
  recipientsPreview,
  defaultSubject,
  defaultBodyWhenNoDraft,
  subjectDraft,
  onSubjectDraftChange,
  selectedTopics,
  onSelectedTopicsChange,
  isResendMode,
  onClose,
  onSend,
}) => {
  const fallbackTemplate = EMAIL_TEMPLATES[0];
  const [selectedTemplate, setSelectedTemplate] = useState<string>(fallbackTemplate.id);
  const [emailBody, setEmailBody] = useState<string>(fallbackTemplate.body);
  const [userTemplates, setUserTemplates] = useState<EmailTemplate[]>([]);
  const [userTopics, setUserTopics] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>(subjectDraft);
  const [manualTopicInput, setManualTopicInput] = useState<string>('');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [topicCombos, setTopicCombos] = useState<TopicCombo[]>([]);
  const [insurerDefaultTopics, setInsurerDefaultTopicsState] = useState<string[]>([]);
  /** Read-first, edit-second: when false, subject/body appear as calm preview; "Edit email content" reveals inputs */
  const [isEditingContent, setIsEditingContent] = useState(false);

  const loadUserTemplates = (id?: string) => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY(id));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (tpl): tpl is EmailTemplate =>
            typeof tpl?.id === 'string' && typeof tpl?.label === 'string' && typeof tpl?.body === 'string'
        );
      }
      return [];
    } catch {
      return [];
    }
  };

  const persistUserTemplates = (templates: EmailTemplate[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TEMPLATE_STORAGE_KEY(userId), JSON.stringify(templates));
  };

  const allTemplates = useMemo(() => [...EMAIL_TEMPLATES, ...userTemplates], [userTemplates]);

  const templateMap = useMemo(
    () =>
      allTemplates.reduce<Record<string, EmailTemplate>>((acc, template) => {
        acc[template.id] = template;
        return acc;
      }, {}),
    [allTemplates]
  );

  useEffect(() => {
    if (!isOpen) return;
    const storedTemplates = loadUserTemplates(userId);
    setUserTemplates(storedTemplates);
    const storedTopics = loadUserFileNameTopics(userId);
    setUserTopics(storedTopics);
    setTopicCombos(loadUserTopicCombos(userId));
    setInsurerDefaultTopicsState(
      getInsurerDefaultTopics(userId, report.insurerName),
    );
    setSubject(subjectDraft);
    setTopicFilter('');
    setManualTopicInput('');
    setIsEditingContent(false);
  }, [isOpen, userId, subjectDraft, report.insurerName]);

  useEffect(() => {
    if (!isOpen) return;
    const templateId =
      report.selectedEmailTemplate && templateMap[report.selectedEmailTemplate]
        ? report.selectedEmailTemplate
        : fallbackTemplate.id;
    setSelectedTemplate(templateId);
    setEmailBody(
      report.emailBodyDraft || defaultBodyWhenNoDraft || templateMap[templateId].body
    );
  }, [
    isOpen,
    fallbackTemplate.id,
    report.emailBodyDraft,
    report.selectedEmailTemplate,
    templateMap,
    defaultBodyWhenNoDraft,
  ]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templateMap[templateId];
    if (template) {
      setEmailBody(template.body);
    }
  };

  const handleSaveTemplate = () => {
    const name = window.prompt('שם לתבנית החדשה?');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const newTemplate: EmailTemplate = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      body: emailBody,
    };
    const nextTemplates = [...userTemplates, newTemplate];
    setUserTemplates(nextTemplates);
    persistUserTemplates(nextTemplates);
    setSelectedTemplate(newTemplate.id);
  };

  const availableTopics: string[] = useMemo(
    () => dedupeCaseInsensitive([...userTopics, ...DEFAULT_FILE_NAME_TOPICS]),
    [userTopics],
  );

  const filteredTopics: string[] = useMemo(() => {
    const term = topicFilter.trim().toLowerCase();
    if (!term) return availableTopics;
    return availableTopics.filter((topic) =>
      topic.toLowerCase().includes(term),
    );
  }, [availableTopics, topicFilter]);

  const resendBanner = useMemo(() => {
    if (!isResendMode) return null;
    const reportNo =
      typeof report.reportNumber === 'number' && report.reportNumber > 0
        ? `#${report.reportNumber}`
        : '';
    const sentDate = report.sentAt
      ? new Date(report.sentAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '';
    return (
      <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <AlertTriangle className="w-3 h-3 mt-[2px]" />
        <div>
          <p className="font-semibold">
            שליחה חוזרת של דו״ח {reportNo || ''}{sentDate ? ` שנשלח בתאריך ${sentDate}` : ''}.
          </p>
          <p className="mt-1">
            זוהי שליחה חוזרת (resend) של דו״ח קיים, ולא דיווח חדש בתיק. המספר הסידורי של הדו״ח נשאר ללא שינוי.
          </p>
        </div>
      </div>
    );
  }, [isResendMode, report.reportNumber, report.sentAt]);

  const handleToggleTopic = (topic: string) => {
    const cleaned = sanitizeTopicLabel(topic);
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();
    const next = selectedTopics.some((t) => t.trim().toLowerCase() === lower)
      ? selectedTopics.filter((t) => t.trim().toLowerCase() !== lower)
      : [...selectedTopics, cleaned];
    onSelectedTopicsChange(dedupeCaseInsensitive(next));
  };

  const handleAddManualTopic = () => {
    const cleaned = sanitizeTopicLabel(manualTopicInput);
    if (!cleaned) return;
    const nextUserTopics = upsertTopicMRU(userTopics, cleaned, 15);
    setUserTopics(nextUserTopics);
    saveUserFileNameTopics(userId, nextUserTopics);

    const nextSelected = dedupeCaseInsensitive([...selectedTopics, cleaned]);
    onSelectedTopicsChange(nextSelected);
    setManualTopicInput('');
  };

  const attachmentNamePreview = useMemo(
    () => buildReportFileName({ ...report, fileNameTitles: selectedTopics }),
    [report, selectedTopics],
  );

  const recommendedTemplateLabel = useMemo(
    () => RECOMMENDED_TEMPLATE_LABEL[resolveEmailScenario(report)],
    [report],
  );

  const bodyDeviatesFromFormat = useMemo(() => {
    const t = emailBody.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    const hasOpening = lower.startsWith('please find attached');
    const hasSignature = lower.includes('kind regards');
    return !hasOpening || !hasSignature;
  }, [emailBody]);

  const ownerPresent = recipientsPreview.cc.some(
    (email) => email.toLowerCase() !== 'reports@lp-law.co.il',
  );
  const isOwnerMissingInCc = !ownerPresent;
  const isSandbox = mailMode === 'SANDBOX';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4">
      <div className="bg-panel rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">Compose Email</h2>
            {isSandbox && (
              <span className="inline-flex items-center rounded-full bg-amber-50/80 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200/80">
                Test mode – emails are sent to configured test recipients
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {resendBanner}
          {isOwnerMissingInCc && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-[1px] shrink-0" />
              <p>
                ע״פ הנתונים אין כתובת אימייל של עורכת הדין בדוח הנוכחי. המייל יישלח רק אל
                הנמען הראשי (To) ואל הכתובות ב‑CC.
              </p>
            </div>
          )}

          {/* Recipients — read-only */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recipients</p>
            <div className="space-y-1.5 text-sm text-gray-700 bg-gray-50/80 rounded-lg px-3 py-2.5 border border-gray-100">
              <div>
                <span className="text-gray-500 font-medium">To:</span>{' '}
                {recipientsPreview.to.length ? recipientsPreview.to.join('; ') : '—'}
              </div>
              {recipientsPreview.cc.length > 0 && (
                <div>
                  <span className="text-gray-500 font-medium">CC:</span>{' '}
                  {recipientsPreview.cc.join('; ')}
                </div>
              )}
            </div>
          </div>

          {/* Subject — preview or editable */}
          <div>
            {!isEditingContent ? (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
                <p className="text-base font-semibold text-gray-900 leading-snug">
                  {subject || '(from case data)'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</label>
                  <button
                    type="button"
                    onClick={() => {
                      setSubject(defaultSubject);
                      onSubjectDraftChange(undefined);
                    }}
                    className="text-[11px] text-gray-600 hover:text-gray-800 hover:underline disabled:opacity-50"
                    disabled={isSending}
                  >
                    Reset
                  </button>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    onSubjectDraftChange(e.target.value);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  disabled={isSending}
                />
              </>
            )}
          </div>

          {/* Body — preview or editable */}
          <div className="max-w-2xl">
            {!isEditingContent ? (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</p>
                <div
                  className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap font-normal"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                >
                  {emailBody}
                </div>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email body</label>
                <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={10}
                    dir="ltr"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed text-gray-800 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'plaintext' }}
                  />
                </GrammarlyEditorPlugin>
                {bodyDeviatesFromFormat && (
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    This email deviates from the recommended professional format.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Single row: Edit email content (or when editing: template + PDF filename) */}
          {!isEditingContent ? (
            <div>
              <button
                type="button"
                onClick={() => setIsEditingContent(true)}
                className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
                disabled={isSending}
              >
                Edit email content
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-[11px] font-medium text-gray-500">Template</label>
                    <span className="text-[10px] text-gray-400">
                      Recommended: {recommendedTemplateLabel}
                    </span>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700"
                    disabled={isSending}
                  >
                    {allTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Save as template</label>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    disabled={isSending}
                  >
                    Save current as template
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">PDF filename topics</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {selectedTopics.length === 0 ? (
                    <span className="text-xs text-gray-400">None selected</span>
                  ) : (
                    selectedTopics.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => handleToggleTopic(topic)}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700 border border-gray-200 hover:bg-gray-200"
                      >
                        {topic} ×
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                    placeholder="Filter topics…"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                    disabled={isSending}
                  />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-24 overflow-y-auto border rounded-lg p-2 bg-panel min-w-[120px]">
                    {filteredTopics.slice(0, 24).map((topic) => {
                      const id = `topic-${topic}`;
                      const lower = topic.toLowerCase();
                      const checked = selectedTopics.some((t) => t.trim().toLowerCase() === lower);
                      return (
                        <label key={topic} htmlFor={id} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                          <input
                            id={id}
                            type="checkbox"
                            className="h-3 w-3"
                            checked={checked}
                            onChange={() => handleToggleTopic(topic)}
                            disabled={isSending}
                          />
                          <span className="truncate">{topic}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={manualTopicInput}
                    onChange={(e) => setManualTopicInput(e.target.value)}
                    placeholder="Add topic…"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                    disabled={isSending}
                  />
                  <button
                    type="button"
                    onClick={handleAddManualTopic}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    disabled={isSending}
                  >
                    Add
                  </button>
                </div>
                {topicCombos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {topicCombos.slice(0, 5).map((combo, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectedTopicsChange(combo)}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-200"
                      >
                        {combo.join(' + ')}
                      </button>
                    ))}
                  </div>
                )}
                {(insurerDefaultTopics.length > 0 || selectedTopics.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-1.5 text-[11px]">
                    {insurerDefaultTopics.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectedTopicsChange(insurerDefaultTopics)}
                          className="text-blue-600 hover:underline"
                          disabled={isSending}
                        >
                          Apply insurer default topics
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearInsurerDefaultTopics(userId, report.insurerName);
                            setInsurerDefaultTopicsState([]);
                          }}
                          className="text-gray-500 hover:underline"
                          disabled={isSending}
                        >
                          Clear default
                        </button>
                      </>
                    )}
                    {selectedTopics.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const cleaned = dedupeCaseInsensitive(
                            selectedTopics.map((t) => sanitizeTopicLabel(t)),
                          );
                          if (!cleaned.length) return;
                          setInsurerDefaultTopics(userId, report.insurerName, cleaned);
                          setInsurerDefaultTopicsState(cleaned);
                        }}
                        className="text-gray-500 hover:underline"
                        disabled={isSending}
                      >
                        Save as insurer default
                      </button>
                    )}
                  </div>
                )}
                {insurerDefaultTopics.length > 0 && selectedTopics.length === 0 && (
                  <p className="text-[11px] text-gray-500 mt-1">Insurer default topics available.</p>
                )}
              </div>
            </>
          )}

          {/* Attachment — single row */}
          <div className="flex items-center gap-2 py-2">
            <FileText className="w-4 h-4 text-red-600 shrink-0" aria-hidden />
            <span className="text-sm font-medium text-gray-800 truncate">{attachmentNamePreview}</span>
            <span className="text-xs text-gray-500 shrink-0">Attached PDF report</span>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex flex-col items-end gap-1">
              <img
                src="/assets/branding/signature.png"
                alt=""
                className="h-12 object-contain opacity-80"
                onError={(e) => { (e.currentTarget.style.display = 'none'); }}
              />
              <span className="text-sm text-gray-600 font-medium">Adv. Lior Perry</span>
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 bg-gray-50 space-y-3">
          <p className="text-xs text-gray-500">
            The report PDF will be attached and sent to the recipients above.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-200"
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              onClick={() =>
                onSend({
                  body: emailBody,
                  templateId: selectedTemplate,
                  subjectBase: subject.trim(),
                  topics: dedupeCaseInsensitive(
                    selectedTopics.map((t) => sanitizeTopicLabel(t)),
                  ),
                })
              }
              className="px-5 py-2 rounded-lg bg-lpBlue text-white font-semibold hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSending}
            >
              {isSending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateModal;

