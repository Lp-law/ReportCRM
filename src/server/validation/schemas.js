import { z } from 'zod';

// --- Authentication ---
export const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100),
});

// --- AI / Text Processing ---
export const translateSchema = z.object({
  text: z.string().min(1).max(200000),
});

export const extractPolicySchema = z.object({
  image: z.string().min(1),
  mimeType: z.string().min(1).max(100),
});

export const refineTextSchema = z.object({
  text: z.string().min(1).max(200000),
  sectionKey: z.string().optional(),
  mode: z.enum(['SAFE_POLISH', 'REWRITE']).optional(),
});

export const improveEnglishSchema = z.object({
  text: z.string().min(1).max(200000),
  sectionKey: z.string().optional(),
});

export const hebrewReportSummarySchema = z.object({
  sections: z.record(z.string()).optional(),
  content: z.record(z.string()).optional(),
});

// --- Document Analysis ---
export const analyzeFileSchema = z.object({
  file: z.string().min(1),
  mimeType: z.string().min(1).max(100),
  mode: z.string().optional(),
  prompt: z.string().optional(),
  existingContent: z.string().optional(),
}).passthrough();

export const analyzeMedicalComplaintSchema = z.object({
  file: z.string().min(1),
  mimeType: z.string().min(1).max(100),
}).passthrough();

export const analyzeDentalOpinionSchema = z.object({
  file: z.string().min(1),
  mimeType: z.string().min(1).max(100),
}).passthrough();

export const extractExpensesSchema = z.object({
  file: z.string().min(1),
  mimeType: z.string().min(1).max(100),
}).passthrough();

// --- Tone & Risk / Hebrew Style ---
export const analyzeToneRiskSchema = z.object({
  sections: z.record(z.string()),
}).passthrough();

export const reviewHebrewStyleSchema = z.object({
  sections: z.record(z.string()),
}).passthrough();

// --- Help / Assistant ---
export const helpChatSchema = z.object({
  message: z.string().min(1).max(50000),
}).passthrough();

export const assistantHelpSchema = z.object({
  intent: z.string().min(1),
}).passthrough();

// --- Summary ---
export const generateSummarySchema = z.object({
  sections: z.record(z.string()).optional(),
  content: z.record(z.string()).optional(),
}).passthrough();

// --- Email ---
export const sendEmailSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
}).passthrough();

// --- PDF / HTML ---
export const renderReportSchema = z.object({
  report: z.object({}).passthrough(),
}).passthrough();

// --- Templates ---
export const createTemplateSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
}).passthrough();

export const updateTemplateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
}).passthrough();

export const reorderTemplateSchema = z.object({
  direction: z.enum(['up', 'down']),
});

// --- Best Practices ---
export const createBestPracticeSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
}).passthrough();

export const updateBestPracticeSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
}).passthrough();

export const reorderBestPracticeSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export const recordUsageSchema = z.object({
  mode: z.string().optional(),
  noteTitle: z.string().optional(),
}).passthrough();
