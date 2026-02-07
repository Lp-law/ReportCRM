
import {
  MedicalComplaintAnalysis,
  ReportData,
  ToneRiskAnalysisResult,
  HebrewStyleReviewResult,
  AssistantIntent,
  AssistantHelpContext,
  AssistantReportMeta,
  AssistantHelpResponse,
} from '../types';

// Service now communicates with the backend server (server.js)

export const translateLegalText = async (text: string): Promise<string> => {
  if (!text || !text.trim()) return '';
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    const data = await response.json();
    return data.translation || '';
  } catch (error) {
    console.error("Translation error:", error);
    return "Error translation.";
  }
};

export const extractPolicyData = async (fileBase64: string, mimeType: string) => {
  try {
    const response = await fetch('/api/extract-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: fileBase64, mimeType: mimeType }),
    });
    if (!response.ok) throw new Error('Server error');
    return await response.json();
  } catch (error) {
    console.error(error);
    return {};
  }
};

export type HebrewRefineMode = 'SAFE_POLISH' | 'REWRITE';

export interface HebrewRefineResult {
  text: string;
  factProtectionBlocked: boolean;
}

export const refineLegalText = async (
  text: string,
  mode: HebrewRefineMode = 'SAFE_POLISH',
): Promise<HebrewRefineResult> => {
  try {
    const response = await fetch('/api/refine-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
    });

    const data = await response.json().catch(() => ({}));

    // Fact protection failure: keep original text, but mark as blocked so UI can warn.
    if (
      response.status === 422 &&
      data &&
      data.error &&
      data.error.code === 'FACT_PROTECTION_FAILED'
    ) {
      return {
        text: typeof data.refined === 'string' ? data.refined : text,
        factProtectionBlocked: true,
      };
    }

    if (!response.ok) {
      throw new Error('Refinement failed');
    }

    const refined =
      typeof data.refined === 'string' && data.refined.trim() ? data.refined : text;

    return { text: refined, factProtectionBlocked: false };
  } catch (error) {
    console.error('Hebrew refinement error:', error);
    throw error;
  }
};

export const improveEnglishText = async (text: string): Promise<string> => {
  if (!text || !text.trim()) return text;
  try {
    const response = await fetch('/api/improve-english', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error('English improvement failed');
    const data = await response.json();
    const improved = typeof data.improved === 'string' ? data.improved : '';
    return improved.trim() ? improved : text;
  } catch (error) {
    console.error('English improvement error:', error);
    throw error;
  }
};

export const generateHebrewReportSummary = async (text: string): Promise<string> => {
  if (!text || !text.trim()) return '';
  try {
    const response = await fetch('/api/hebrew-report-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        (data && typeof data.error === 'string' && data.error) ||
        'Hebrew report summary failed';
      throw new Error(msg);
    }
    const summary =
      typeof data.summary === 'string' && data.summary.trim()
        ? data.summary.trim()
        : '';
    return summary;
  } catch (error) {
    console.error('Hebrew report summary error:', error);
    // Propagate error so caller can fall back to a simple snippet.
    throw (error instanceof Error ? error : new Error('Hebrew report summary error'));
  }
};

export const analyzeUploadedFile = async (fileBase64: string, mimeType: string, prompt: string): Promise<string> => {
  try {
    const response = await fetch('/api/analyze-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, mimeType, userPrompt: prompt }),
    });
    if (!response.ok) throw new Error('Analysis failed');
    const data = await response.json();
    return data.result || '';
  } catch (error) {
    console.error(error);
    return 'Error analyzing file.';
  }
};

export interface MedicalAnalysisResponse {
  analysis?: MedicalComplaintAnalysis | null;
  claimSummary?: string;
  /** When false, analysis could not be completed; UI should show friendly message and allow continued work. */
  success?: boolean;
  /** Internal reason for failure (e.g. INVALID_DOCUMENT, AI_UNAVAILABLE); for logging only. */
  reason?: string;
  /** Document had no initial text and required OCR (low-quality scan); show info message. */
  lowConfidenceDocument?: boolean;
}

type ExpertCountMode = 'SINGLE' | 'MULTIPLE';
type PartyRole = 'PLAINTIFF' | 'CLAIMANT';

type MedicalAnalysisOptions = {
  expertCountMode?: ExpertCountMode;
  partyRole?: PartyRole;
  sectionKey?: string;
  plaintiffName?: string;
  insuredName?: string;
  insurerName?: string;
  reportSubject?: string;
};

export const analyzeMedicalComplaint = async (
  fileBase64: string,
  mimeType: string,
  analysisType: 'CLAIM' | 'DEMAND' | 'EXPERT' = 'CLAIM',
  options?: MedicalAnalysisOptions
): Promise<MedicalAnalysisResponse> => {
  const response = await fetch('/api/analyze-medical-complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64,
      mimeType,
      analysisType,
      expertCountMode: options?.expertCountMode,
      partyRole: options?.partyRole,
      sectionKey: options?.sectionKey,
      plaintiffName: options?.plaintiffName,
      insuredName: options?.insuredName,
      insurerName: options?.insurerName,
      reportSubject: options?.reportSubject,
    }),
  });
  const data = await response.json().catch(() => ({}));
  const analysis = data.analysis ?? null;
  const claimSummary = typeof data.claimSummary === 'string' ? data.claimSummary : '';

  if (!response.ok) {
    console.error('Medical complaint analysis failed', response.status, data);
    return { analysis: null, claimSummary: '', success: false, reason: data.reason || 'REQUEST_FAILED' };
  }
  if (data.success === false) {
    return { analysis: null, claimSummary: '', success: false, reason: data.reason };
  }
  return { analysis, claimSummary, success: true, lowConfidenceDocument: !!data.lowConfidenceDocument };
};

export interface DentalOpinionResponse {
  success: boolean;
  text: string;
  reason?: string;
  /** Document had no initial text and required OCR (low-quality scan); show info message. */
  lowConfidenceDocument?: boolean;
}

export const analyzeDentalOpinion = async (
  fileBase64: string,
  mimeType: string,
): Promise<DentalOpinionResponse> => {
  const response = await fetch('/api/analyze-dental-opinion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, mimeType }),
  });
  const data = await response.json().catch(() => ({}));
  const result = typeof data.result === 'string' ? data.result : '';
  const reason = typeof data.reason === 'string' ? data.reason : undefined;

  if (!response.ok) {
    console.error('Dental opinion analysis failed', response.status, data);
    return { success: false, text: '', reason: reason || 'REQUEST_FAILED' };
  }
  if (data.success === false) {
    return { success: false, text: '', reason: reason || 'AI_UNAVAILABLE' };
  }
  return { success: true, text: result, lowConfidenceDocument: !!data.lowConfidenceDocument };
};

export const extractExpensesTable = async (fileBase64: string, mimeType: string) => {
  try {
    const response = await fetch('/api/extract-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, mimeType }),
    });
    if (!response.ok) throw new Error('Expenses extraction failed');
    return await response.json(); // returns { items: [...] }
  } catch (error) {
    console.error(error);
    return { items: [] };
  }
};

export const askHelpChat = async (question: string): Promise<string> => {
  try {
    const response = await fetch('/api/help-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) throw new Error('Chat failed');
    const data = await response.json();
    return data.answer || 'Sorry, I could not answer that.';
  } catch (error) {
    console.error(error);
    return 'System error. Please try again.';
  }
};

interface AssistantHelpRequestPayload {
  intent: AssistantIntent;
  context: AssistantHelpContext;
  reportMeta: AssistantReportMeta;
}

export const requestAssistantHelp = async (
  payload: AssistantHelpRequestPayload,
): Promise<AssistantHelpResponse> => {
  try {
    const response = await fetch('/api/assistant/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Assistant help HTTP error:', response.status, data);
      if (response.status === 401) {
        throw new Error('AUTH_REQUIRED');
      }
      // Server returns 500 with helpful content (title, bullets) – use it instead of generic error
      if (response.status >= 500 && data && (data.title || Array.isArray(data.bullets))) {
        const title =
          typeof data.title === 'string' && data.title.trim()
            ? data.title.trim()
            : 'העוזר החכם אינו זמין כרגע';
        const bullets: string[] = Array.isArray(data.bullets)
          ? data.bullets.filter((b: unknown) => typeof b === 'string' && String(b).trim().length > 0)
          : ['אפשר להמשיך לעבוד כרגיל עם הכלים במסך.'];
        return {
          title,
          bullets,
          warning: typeof data.warning === 'string' && data.warning.trim() ? data.warning.trim() : undefined,
          nextSuggestion: typeof data.nextSuggestion === 'string' && data.nextSuggestion.trim() ? data.nextSuggestion.trim() : undefined,
        };
      }
      if (response.status >= 500) {
        throw new Error('SERVER_ERROR');
      }
    }

    const title =
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : 'העוזר החכם אינו זמין כרגע';

    const bullets: string[] = Array.isArray(data.bullets)
      ? data.bullets.filter((b: unknown) => typeof b === 'string' && b.trim().length > 0)
      : [
          'נראה שיש תקלה זמנית בעוזר החכם או בחיבור ל-AI.',
          'אפשר להמשיך לעבוד כרגיל עם הכלים במסך (שכתוב, בדיקות, תצוגת PDF).',
          'אם התקלה חוזרת, כדאי לדווח לליאור או לתיעוד התמיכה.',
        ];

    const warning =
      typeof data.warning === 'string' && data.warning.trim()
        ? data.warning.trim()
        : undefined;
    const nextSuggestion =
      typeof data.nextSuggestion === 'string' && data.nextSuggestion.trim()
        ? data.nextSuggestion.trim()
        : undefined;

    return { title, bullets, warning, nextSuggestion };
  } catch (error) {
    console.error('Assistant help error:', error);
    // Bubble up so caller can show a simple UI error if needed.
    throw error;
  }
};

export const generateExecutiveSummary = async (reportContent: any, insurerName: string, insuredName: string): Promise<string> => {
  try {
    const response = await fetch('/api/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportContent, insurerName, insuredName }),
    });
    if (!response.ok) throw new Error('Summary generation failed');
    const data = await response.json();
    return data.summary || '';
  } catch (error) {
    console.error(error);
    return 'Could not generate summary.';
  }
};

export interface EmailPayload {
  subject: string;
  body: string;
  attachmentBase64?: string;
  attachmentName?: string;
  /** Lawyer (report author) email – server adds to CC; do not send to/cc from client */
  lawyerEmail?: string;
  /** Report id for server audit log and duplicate-send guard */
  reportId?: string;
}

export const sendEmailViaOutlook = async (emailData: EmailPayload): Promise<boolean> => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      credentials: 'include', // required for session cookie so auth passes
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData),
    });
    if (!response.ok) throw new Error('Email failed');
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const fetchReportPdf = async (report: ReportData): Promise<Blob> => {
  try {
    const response = await fetch('/api/render-report-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ report }),
    });
    if (!response.ok) {
      let msg = 'PDF rendering failed';
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string') msg = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return await response.blob();
  } catch (error) {
    console.error('PDF render error:', error);
    throw error;
  }
};

export async function analyzeToneAndRisk(
  content: Record<string, string>,
  _userRole?: string,
): Promise<ToneRiskAnalysisResult> {
  try {
    const response = await fetch('/api/analyze-tone-risk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data && data.error && typeof data.error.message === 'string'
          ? data.error.message
          : 'Tone & Risk analysis failed';
      throw new Error(message);
    }

    const ok = Boolean(data && data.ok);
    const runAt =
      data && typeof data.runAt === 'string'
        ? data.runAt
        : new Date().toISOString();
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    const promptVersion =
      data && typeof data.promptVersion === 'string'
        ? data.promptVersion
        : 'unknown';
    const meta =
      data && typeof data.meta === 'object'
        ? {
            sectionsSent: Number(data.meta.sectionsSent) || 0,
            charsBefore: Number(data.meta.charsBefore) || 0,
            charsAfter: Number(data.meta.charsAfter) || 0,
            truncatedSections: Number(data.meta.truncatedSections) || 0,
          }
        : {
            sectionsSent: 0,
            charsBefore: 0,
            charsAfter: 0,
            truncatedSections: 0,
          };

    const error =
      data && typeof data.error === 'object'
        ? {
            code: data.error.code,
            message: data.error.message,
          }
        : undefined;

    if (!ok) {
      const message =
        (error && typeof error.message === 'string' && error.message) ||
        'Tone & Risk analysis failed';
      const err = new Error(message);
      // preserve error code for callers that care
      (err as any).code = error?.code || 'LLM_FAILED';
      throw err;
    }

    return {
      ok: true,
      runAt,
      promptVersion,
      issues,
      meta,
      error: undefined,
    };
  } catch (error) {
    console.error('Tone & Risk analysis error:', error);
    // זרוק את השגיאה כדי שה־UI יציג למשתמש שהבדיקה נכשלה (ולא "הכל בסדר")
    throw (error instanceof Error ? error : new Error('Tone & Risk analysis error'));
  }
}

export async function reviewHebrewStyle(
  content: Record<string, string>,
  _userRole?: string,
): Promise<HebrewStyleReviewResult> {
  const response = await fetch('/api/review-hebrew-style', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });
  const data = await response.json().catch(() => ({}));
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const runAt =
    typeof data.runAt === 'string' ? data.runAt : new Date().toISOString();

  if (!response.ok) {
    console.error('Hebrew style review failed', response.status, data);
    return { runAt, issues, success: false, reason: data.reason || 'REQUEST_FAILED' };
  }
  if (data.success === false) {
    return { runAt, issues, success: false, reason: data.reason };
  }
  return { runAt, issues, success: true };
}