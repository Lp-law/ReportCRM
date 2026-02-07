import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
    // בכל פתיחה חדשה נוודא שרואים את כל רשימת ה‑TOPICS בלי סינון קודם
    setTopicFilter('');
    setManualTopicInput('');
  }, [isOpen, userId, subjectDraft, report.insurerName]);

  useEffect(() => {
    if (!isOpen) return;
    const templateId =
      report.selectedEmailTemplate && templateMap[report.selectedEmailTemplate]
        ? report.selectedEmailTemplate
        : fallbackTemplate.id;
    setSelectedTemplate(templateId);
    setEmailBody(report.emailBodyDraft || templateMap[templateId].body);
  }, [isOpen, fallbackTemplate.id, report.emailBodyDraft, report.selectedEmailTemplate, templateMap]);

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
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-200">
                SANDBOX
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {resendBanner}
          {isOwnerMissingInCc && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-[1px]" />
              <p>
                ע״פ הנתונים אין כתובת אימייל של עורכת הדין בדוח הנוכחי. המייל יישלח רק אל
                הנמען הראשי (To) ואל הכתובות ב‑CC.
              </p>
            </div>
          )}
          {isSandbox && (
            <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-[1px]" />
              <p>
                מצב בדיקות: הדוא״ל יישלח כעת לכתובות הבדיקה (SANDBOX) במקום לנציג חברת הביטוח, עד לסיום שלב הבדיקות.
              </p>
            </div>
          )}
            <div className="text-xs text-gray-600 space-y-1 border rounded-md border-gray-200 bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">To:</span>{' '}
              <span>{recipientsPreview.to.join('; ') || '—'}</span>
            </div>
            {recipientsPreview.cc.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-semibold">CC:</span>{' '}
                <span>{recipientsPreview.cc.join('; ')}</span>
              </div>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              To: {primaryTo || '—'} (primary), CC: Office + report owner (אם מוגדר).
            </p>
            <div>
              <span className="font-semibold">Subject:</span>{' '}
              {subject || '(will be generated from case data)'}
            </div>
            <div>
              <span className="font-semibold">Attachment:</span>{' '}
              {attachmentNamePreview}
            </div>
            <p className="text-[11px] text-amber-700 mt-1">
              שימי לב: אם השליחה האוטומטית תיכשל וייפתח מייל ידני, הקובץ לא מצורף
              אוטומטית וצריך לצרף את ה-PDF ידנית.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Subject
              </label>
              <button
                type="button"
                onClick={() => {
                  setSubject(defaultSubject);
                  // True reset: clear draft so next open recomputes from default.
                  onSubjectDraftChange(undefined);
                }}
                className="text-[11px] text-blue-700 hover:underline disabled:opacity-50"
                disabled={isSending}
              >
                Reset
              </button>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => {
                const value = e.target.value;
                setSubject(value);
                onSubjectDraftChange(value);
              }}
              className="w-full border rounded-md p-2 text-sm"
              disabled={isSending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
            <div className="flex gap-3">
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="flex-1 border rounded-md p-2"
              >
                {allTemplates.map((template) => (
                  <option value={template.id} key={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="px-3 py-2 bg-panel border rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                disabled={isSending}
              >
                Save Template
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PDF Filename Topics
            </label>
            {topicCombos.length > 0 && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-gray-700 mb-1">
                  Recent combinations
                </p>
                <div className="flex flex-wrap gap-2">
                  {topicCombos.map((combo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectedTopicsChange(combo)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-[11px] text-gray-800 border border-gray-300 hover:bg-gray-200"
                    >
                      {combo.join(' + ')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedTopics.length === 0 ? (
                <span className="text-xs text-gray-400">
                  No topics selected yet. You can choose from the list below or add your own.
                </span>
              ) : (
                selectedTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => handleToggleTopic(topic)}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800 border border-blue-200 hover:bg-blue-100"
                  >
                    <span>{topic}</span>
                    <span className="text-[10px]">×</span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectedTopicsChange([]);
                // וגם אפס סינון כדי להחזיר את כל רשימת ה‑TOPICS לתצוגה מלאה
                setTopicFilter('');
              }}
              className="mb-2 text-[11px] text-blue-700 hover:underline"
              disabled={isSending}
            >
              נקה כל הנושאים
            </button>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                placeholder="סינון לפי טקסט..."
                className="flex-1 border rounded-md p-1.5 text-[11px]"
                disabled={isSending}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mb-2 max-h-32 overflow-y-auto border rounded-md p-2 bg-panel">
              {filteredTopics.map((topic) => {
                const id = `topic-${topic}`;
                const lower = topic.toLowerCase();
                const checked = selectedTopics.some(
                  (t) => t.trim().toLowerCase() === lower,
                );
                return (
                  <label
                    key={topic}
                    htmlFor={id}
                    className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="h-3 w-3"
                      checked={checked}
                      onChange={() => handleToggleTopic(topic)}
                      disabled={isSending}
                    />
                    <span className="whitespace-normal break-words">{topic}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={manualTopicInput}
                onChange={(e) => setManualTopicInput(e.target.value)}
                placeholder="Add custom topic…"
                className="flex-1 border rounded-md p-2 text-xs"
                disabled={isSending}
              />
              <button
                type="button"
                onClick={handleAddManualTopic}
                className="px-3 py-1.5 bg-panel border rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                disabled={isSending}
              >
                Add
              </button>
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-gray-700">
              <div className="flex gap-2 flex-wrap items-center">
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
                  className="px-2 py-1 rounded-full border border-gray-300 bg-panel hover:bg-gray-100"
                  disabled={isSending || selectedTopics.length === 0}
                >
                  שמור כנושאי ברירת מחדל למבטחת זו
                </button>
                {insurerDefaultTopics.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectedTopicsChange(insurerDefaultTopics)}
                      className="px-2 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                      disabled={isSending}
                    >
                      החל נושאי ברירת מחדל למבטחת זו
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearInsurerDefaultTopics(userId, report.insurerName);
                        setInsurerDefaultTopicsState([]);
                      }}
                      className="text-[11px] text-red-600 hover:underline"
                      disabled={isSending}
                    >
                      נקה ברירת מחדל למבטחת זו
                    </button>
                  </>
                )}
              </div>
              {insurerDefaultTopics.length > 0 && selectedTopics.length === 0 && (
                <p className="text-[11px] text-gray-500">
                  קיימים נושאי ברירת מחדל למבטחת זו. ניתן להחיל אותם בלחיצה על
                  הכפתור המתאים.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
            <GrammarlyEditorPlugin clientId={GRAMMARLY_CLIENT_ID}>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={12}
                dir="ltr"
                className="w-full border rounded-md p-3 text-sm"
                style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'plaintext' }}
              />
            </GrammarlyEditorPlugin>
          </div>

          <div className="border-t pt-4 text-right">
            <p className="text-sm font-semibold text-gray-600 mb-2">Signature</p>
            <div className="inline-flex flex-col items-end">
              <img
                src="/assets/branding/signature.png"
                alt="Signature placeholder"
                className="h-16 object-contain mb-2 opacity-80"
                onError={(e) => { (e.currentTarget.style.display = 'none'); }}
              />
              <span className="text-sm text-gray-700 font-semibold">Adv. Lior Perry</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-600 hover:bg-gray-200"
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
            className="px-5 py-2 rounded-md bg-lpBlue text-white font-semibold hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isSending}
          >
            {isSending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateModal;

