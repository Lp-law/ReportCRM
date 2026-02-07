import { chromium } from 'playwright';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import fetch from 'node-fetch';
import fs from 'fs';
import Handlebars from 'handlebars';
import crypto from 'crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { MASTER_PROMPT } from './src/ai/masterPrompt.js';
import { LEGAL_SNIPPETS, USERS } from './src/constants.js';
import { protectHebrewFacts, restoreHebrewFacts } from './src/utils/hebrewFactProtection.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfWorkerSrc = new URL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc.href;
const pdfStandardFontPath = new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url);
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = pdfStandardFontPath.href;

const ASSETS_DIR = path.join(__dirname, "Report CRMassetsbranding");
const SIGNATURE_PATH = path.join(ASSETS_DIR, "signature.png.pdf.png");
const TIMELINE_IMAGES_DIR = path.join(__dirname, 'Visual Timeline Selection');

const ensureDataImagePrefix = (value, mime = 'image/png') => {
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  return `data:${mime};base64,${value}`;
};

const loadImageBase64OrThrow = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Critical asset missing: ${label} at path ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, { encoding: 'base64' });
  return ensureDataImagePrefix(raw, 'image/png');
};

// Single inline logo for the cover page only (no disk dependency, no header/footer logos)
const COVER_LOGO_SVG = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
    <defs>
      <linearGradient id="lp-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#183051" />
        <stop offset="100%" stop-color="#AE8C4D" />
      </linearGradient>
    </defs>
    <rect x="0" y="16" width="56" height="48" rx="8" fill="#183051"/>
    <text x="28" y="47" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#F9FAFB" font-weight="600">LP</text>
    <text x="76" y="40" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#111827" font-weight="700">
      Lior Perry
    </text>
    <text x="76" y="58" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="url(#lp-gradient)" font-weight="600" letter-spacing="2">
      LAW FIRM
    </text>
  </svg>
`.trim());

const COVER_LOGO_BASE64 = `data:image/svg+xml;utf8,${COVER_LOGO_SVG}`;

let SIGNATURE_BASE64 = '';
const TIMELINE_IMAGE_BASE64 = {};

try {
  SIGNATURE_BASE64 = loadImageBase64OrThrow(SIGNATURE_PATH, 'Signature image');
} catch (err) {
  console.error(err.message);
}

// Preload timeline arrow images (if present on disk) so Puppeteer can embed them as data URLs
const TIMELINE_STAGE_FILES = {
  statement_of_claim: 'statement of claim.jpg',
  statement_of_defence: 'statement of defence.jpg',
  preliminary: 'preliminary proceedings.jpg',
  evidence_submission: 'evidence submission.jpg',
  evidentiary: 'evidentiary hearing.jpg',
  summaries: 'summaries.jpg',
  judgment: 'judgment.jpg',
};

Object.entries(TIMELINE_STAGE_FILES).forEach(([stage, filename]) => {
  const fullPath = path.join(TIMELINE_IMAGES_DIR, filename);
  try {
    if (fs.existsSync(fullPath)) {
      const raw = fs.readFileSync(fullPath, { encoding: 'base64' });
      // Timeline assets are JPEGs
      TIMELINE_IMAGE_BASE64[stage] = ensureDataImagePrefix(raw, 'image/jpeg');
    }
  } catch (err) {
    console.error(`Failed to load timeline image for stage "${stage}" from ${fullPath}:`, err);
  }
});

// Configure environment variables
dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TEMPLATES_FILE_PATH =
  process.env.TEMPLATES_FILE_PATH || path.join(DATA_DIR, 'sectionTemplates.json');
const BEST_PRACTICES_FILE_PATH =
  process.env.BEST_PRACTICES_FILE_PATH || path.join(DATA_DIR, 'bestPractices.json');

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadSectionTemplatesFromDisk = () => {
  ensureDataDir();
  try {
    if (!fs.existsSync(TEMPLATES_FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(TEMPLATES_FILE_PATH, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('Failed to load section templates from disk:', err);
    return [];
  }
};

const loadBestPracticesFromDisk = () => {
  ensureDataDir();
  try {
    if (!fs.existsSync(BEST_PRACTICES_FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(BEST_PRACTICES_FILE_PATH, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('Failed to load best practices from disk:', err);
    return [];
  }
};

const saveSectionTemplatesToDisk = (list) => {
  ensureDataDir();
  try {
    fs.writeFileSync(TEMPLATES_FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save section templates to disk:', err);
  }
};

const saveBestPracticesToDisk = (list) => {
  ensureDataDir();
  try {
    fs.writeFileSync(BEST_PRACTICES_FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save best practices to disk:', err);
  }
};

const seedTemplatesFromLegacyIfNeeded = () => {
  const existing = loadSectionTemplatesFromDisk();
  if (existing.length > 0) return existing;

  const nowIso = new Date().toISOString();
  const seeded = [];

  Object.entries(LEGAL_SNIPPETS).forEach(([sectionKey, snippets]) => {
    if (!Array.isArray(snippets)) return;
    snippets.forEach((body, idx) => {
      if (typeof body !== 'string' || !body.trim()) return;
      const words = body.trim().split(/\s+/).slice(0, 6).join(' ');
      const title = words || `${sectionKey} template ${idx + 1}`;
      seeded.push({
        id: `seed-${sectionKey}-${idx}`,
        sectionKey,
        title,
        body,
        createdByUserId: 'system',
        createdAt: nowIso,
        updatedAt: nowIso,
        isEnabled: true,
        orderIndex: seeded.length,
      });
    });
  });

  saveSectionTemplatesToDisk(seeded);
  return seeded;
};

// Ensure templates file exists with initial seed (idempotent)
seedTemplatesFromLegacyIfNeeded();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images/files

// Initialize OpenAI (ChatGPT)
const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
if (!apiKey) {
  console.warn("Warning: OPENAI_API_KEY is not defined. AI endpoints will not function until it is set.");
}
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_DOC_CHARS = Number(process.env.DOC_CHAR_LIMIT || 18000);
const ENABLE_POLICY_OCR = process.env.POLICY_OCR_ENABLED !== 'false';
const POLICY_OCR_MAX_PAGES = Number(process.env.POLICY_OCR_MAX_PAGES || 2);
const AZURE_OCR_ENDPOINT = process.env.AZURE_OCR_ENDPOINT;
const AZURE_OCR_KEY = process.env.AZURE_OCR_KEY;
const USE_AZURE_OCR = Boolean(AZURE_OCR_ENDPOINT && AZURE_OCR_KEY);

// Document Intelligence: support both naming conventions (DOCINT vs DOCUMENT_INTELLIGENCE)
const AZURE_DOCINT_ENDPOINT =
  process.env.AZURE_DOCINT_ENDPOINT || process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const AZURE_DOCINT_KEY =
  process.env.AZURE_DOCINT_KEY || process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
const USE_DOC_INTELLIGENCE = Boolean(AZURE_DOCINT_ENDPOINT && AZURE_DOCINT_KEY);

// On Render, use only Document Intelligence for OCR (no Tesseract, no Azure Vision with data URL)
const IS_RENDER = process.env.RENDER === 'true';

const DEFAULT_MEDICAL_ANALYSIS = {
  caseType: '',
  briefSummary: '',
  facts: [],
  allegations: [],
  injuries: [],
  medicalFindings: [],
  defendants: [],
  negligenceTheory: [],
  requestedRelief: [],
  timeline: [],
  riskAssessment: '',
  recommendedActions: []
};


const ensureOpenAI = () => {
  if (!openai) {
    throw new Error('OpenAI client is not configured. Please set OPENAI_API_KEY.');
  }
  return openai;
};

// ---------------------------------------------------------------------------
// Session handling (cookie-based, persisted to file for refresh survival)
// ---------------------------------------------------------------------------

const SESSION_COOKIE_NAME = 'lp_session';
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');
const sessions = new Map(); // sessionId -> { id, username, name, email, role }

function loadSessionsFromFile() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(({ id: sid, user }) => {
          if (sid && user) sessions.set(sid, user);
        });
      }
    }
  } catch (e) {
    console.warn('[Session] Could not load sessions from file:', e?.message);
  }
}

function saveSessionsToFile() {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const arr = Array.from(sessions.entries()).map(([id, user]) => ({ id, user }));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(arr, null, 0), 'utf-8');
  } catch (e) {
    console.warn('[Session] Could not save sessions to file:', e?.message);
  }
}

loadSessionsFromFile();

const createSessionId = () => crypto.randomBytes(32).toString('hex');

const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  parts.forEach((part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name) return;
    const value = rest.join('=');
    cookies[name] = decodeURIComponent(value || '');
  });
  return cookies;
};

const getUserFromRequest = (req) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) return null;
    const session = sessions.get(sessionId);
    return session || null;
  } catch {
    return null;
  }
};

const getUserRoleFromRequest = (req) => {
  const user = getUserFromRequest(req);
  return user?.role ? String(user.role).toUpperCase() : '';
};

const ensureAuthenticated = (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
};


const flattenCompletionText = (completion) => {
  const choice = completion?.choices?.[0];
  if (!choice || !choice.message) return '';
  const content = choice.message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if ('text' in part && part.text) return part.text;
        return '';
      })
      .join('')
      .trim();
  }
  return '';
};

const truncateText = (text = '', limit = MAX_DOC_CHARS) => {
  if (!text) return '';
  return text.length > limit ? text.slice(0, limit) : text;
};

const parseJsonSafely = (text, fallback = {}) => {
  if (typeof text !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    // Try to extract the first JSON object from within surrounding text
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        return JSON.parse(candidate);
      }
    } catch (innerErr) {
      console.error('Failed to extract JSON object from text:', innerErr);
    }
    console.error('Failed to parse JSON response:', error);
    return fallback;
  }
};

const chunkText = (text, size = 3500, overlap = 200) => {
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
};

const ensureAdminRole = (req, res) => {
  // Use the authenticated session and role derived from cookies.
  // This keeps a single source of truth for role checking.
  const user = ensureAuthenticated(req, res);
  if (!user) return false;
  const role = getUserRoleFromRequest(req);
  if (role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin role required' });
    return false;
  }
  return true;
};

const buildMedicalChunkPrompt = (chunk) => `
אתה עוזר משפטי מומחה ברשלנות רפואית ונזקי גוף. קבל קטע מכתב תביעה/מכתב דרישה ותמצת רק את העובדות שנמצאות בקטע.
החזר JSON בלבד במבנה:
{
  "facts": ["..."],
  "allegations": ["..."],
  "injuries": ["..."],
  "timeline": [{"date":"","event":""}],
  "recommendedActions": ["..."]
}
חוקים חשובים לטיימליין (timeline):
- לכל תאריך או טווח תאריכים נפרד שמופיע בטקסט יש ליצור רשומת timeline נפרדת.
- אין למזג אירועים בעלי תאריכים שונים לאותו אובייקט timeline.
- כאשר מצויינים במפורש שחקנים (רופאים/מוסדות) או מיקום – לשלבם ב-event או בשדה נפרד לפי הסכמה.
אם אין נתונים החזר מערך ריק. אין להמציא עובדות.

קטע:
${chunk}
`;

const buildMedicalAggregatePrompt = (chunkFindings) => `
You are a Hebrew-speaking senior legal analyst for medical malpractice and bodily injury claims.
Merge the chunk findings below into one final JSON response. Schema:
{
  "caseType": "Medical Malpractice | Bodily Injury | Unknown",
  "briefSummary": "2-3 sentences in Hebrew describing the core of the complaint",
  "facts": ["..."],
  "allegations": ["..."],
  "injuries": ["..."],
  "medicalFindings": ["..."],
  "defendants": ["..."],
  "negligenceTheory": ["..."],
  "requestedRelief": ["..."],
  "timeline": [{"date":"DD/MM/YYYY or descriptive","event":"..."}],
  "riskAssessment": "Low/Medium/High - short reasoning in Hebrew",
  "recommendedActions": ["..."]
}
Rules:
- Use ONLY information explicitly provided in the chunk findings.
- If a field is missing, leave it empty ("" or []).
- Respond with valid JSON only.
- When building the "timeline", ensure that every distinct date or date-range found across all chunks is represented as a separate timeline entry.
- Do NOT merge events with different dates into a single timeline item.

Chunk findings:
${JSON.stringify(chunkFindings)}
`;

const analyzeMedicalDocument = async (text) => {
  const chunks = chunkText(text, 3500, 250);
  if (!chunks.length) return DEFAULT_MEDICAL_ANALYSIS;

  const chunkFindings = [];
  for (const chunk of chunks) {
    const responseText = await createTextCompletion({
      systemPrompt: 'You extract structured legal data and respond only in JSON.',
      userPrompt: buildMedicalChunkPrompt(chunk),
      temperature: 0.15,
      responseFormat: { type: 'json_object' },
    });
    const parsed = parseJsonSafely(responseText, {
      facts: [],
      allegations: [],
      injuries: [],
      timeline: [],
      recommendedActions: [],
    });
    chunkFindings.push(parsed);
  }

  const aggregateResponse = await createTextCompletion({
    systemPrompt: 'You are a senior Hebrew legal analyst summarizing medical malpractice complaints.',
    userPrompt: buildMedicalAggregatePrompt(chunkFindings),
    temperature: 0.1,
    responseFormat: { type: 'json_object' },
  });

  return parseJsonSafely(aggregateResponse, DEFAULT_MEDICAL_ANALYSIS);
};

const isClaimSummaryAllowed = (text, analysisType) => {
  if (!text || typeof text !== 'string') return false;
  const forbiddenPatterns = /(חוות דעת|מומחה|מומחים|ראשי נזק|סעד|פיצוי|ש"?ח|₪)/i;
  if (forbiddenPatterns.test(text)) {
    return false;
  }

  // Basic timeline structure: numbered lines with at least one "—"
  const lines = text.split('\n');
  const itemLines = lines.filter((l) => /^\s*\d+\./.test(l));
  if (!itemLines.length) return false;
  if (!itemLines.some((l) => l.includes('—'))) return false;

  // Approximate "enough events" only when there are enough dated tokens in the text.
  const dateTokenRegex = /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|ללא תאריך/g;
  const dateTokens = text.match(dateTokenRegex) || [];
  const dateTokenCount = dateTokens.length;
  const itemCount = itemLines.length;

  const minRequired = analysisType === 'CLAIM' ? 6 : 4;
  if (dateTokenCount >= minRequired && itemCount < minRequired) {
    return false;
  }

  return true;
};

const extractTextWithOcr = async (buffer, maxPages = POLICY_OCR_MAX_PAGES) => {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    const pagesToScan = Math.min(pdf.numPages, typeof maxPages === 'number' && maxPages > 0 ? maxPages : POLICY_OCR_MAX_PAGES);
    let collectedText = '';

    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const imageBuffer = canvas.toBuffer('image/png');

      const {
        data: { text },
      } = await Tesseract.recognize(imageBuffer, 'eng+heb', {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzאבגדהוזחטיכךלמםנןסעפףצץקרשת0123456789-./:() ',
        psm: 3,
      });
      collectedText += `\n${text}`;
    }

    return collectedText.trim();
  } catch (error) {
    const shortMsg = (error?.message || String(error)).slice(0, 100);
    const isTimeout = /timeout|ETIMEDOUT|timed out/i.test(shortMsg);
    const isMemory = /memory|allocation|heap/i.test(shortMsg);
    console.log(
      `[getDocumentText] tesseract_ocr_failed error=${shortMsg} timeout=${isTimeout} memory=${isMemory}`,
    );
    return '';
  }
};

const extractTextWithPdfJs = async (buffer) => {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    let collectedText = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str || '').join(' ');
      collectedText += `${pageText}\n`;
    }
    return collectedText.trim();
  } catch (error) {
    console.error('PDF.js text extraction failed:', error);
    return '';
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAzureEndpoint = (endpoint) => {
  if (!endpoint) return '';
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
};

const extractTextWithAzureOcr = async (buffer) => {
  if (!USE_AZURE_OCR) return '';
  try {
    const endpoint = `${normalizeAzureEndpoint(AZURE_OCR_ENDPOINT)}/vision/v3.2/read/analyze`;
    const fileUrl = `data:application/octet-stream;base64,${buffer.toString('base64')}`;
    console.log('[getDocumentText] azure_ocr_called=true');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_OCR_KEY,
      },
      body: JSON.stringify({
        url: fileUrl,
        language: 'en',
        readingOrder: 'natural',
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      const shortErr = (text || '').slice(0, 120).replace(/\s+/g, ' ');
      console.log(`[getDocumentText] azure_ocr_called=true status=${response.status} error=${shortErr}`);
      throw new Error(`Azure OCR submission failed: ${response.status} ${text}`);
    }
    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) {
      throw new Error('Azure OCR missing operation-location header');
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(1000);
      const resultResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_OCR_KEY },
      });
      const resultJson = await resultResponse.json();
      if (resultJson.status === 'succeeded') {
        const analyzeResult = resultJson.analyzeResult;
        const pages = analyzeResult?.readResults || analyzeResult?.pages || [];
        const lines = [];
        for (const page of pages) {
          const pageLines = page.lines || [];
          for (const line of pageLines) {
            if (line.text) lines.push(line.text);
          }
        }
        return lines.join('\n').trim();
      }
      if (resultJson.status === 'failed') {
        throw new Error('Azure OCR processing failed');
      }
    }
    throw new Error('Azure OCR timed out');
  } catch (error) {
    const shortMsg = (error?.message || String(error)).slice(0, 100);
    console.log(`[getDocumentText] azure_ocr_called=true status=error error=${shortMsg}`);
    return '';
  }
};

// Maps common mime types to Document Intelligence supported Content-Type
const DOCINT_CONTENT_TYPE = (mimeType) => {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('pdf')) return 'application/pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'image/jpeg';
  if (m.includes('png')) return 'image/png';
  if (m.includes('tiff') || m.includes('tif')) return 'image/tiff';
  if (m.includes('bmp')) return 'image/bmp';
  return 'application/octet-stream';
};

const DOCINT_POLL_INTERVAL_MS = 1500;
const DOCINT_MAX_WAIT_MS = 60000; // 60 seconds total timeout

const submitDocumentIntelligenceJob = async (buffer, mimeType) => {
  if (!USE_DOC_INTELLIGENCE) return '';
  try {
    const contentType = DOCINT_CONTENT_TYPE(mimeType);
    const endpoint = `${normalizeAzureEndpoint(AZURE_DOCINT_ENDPOINT)}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;
    console.log(`[getDocumentText] DOCINT_REQUEST_SENT ts=${new Date().toISOString()} content_type=${contentType} buffer_bytes=${buffer?.length || 0}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Ocp-Apim-Subscription-Key': AZURE_DOCINT_KEY,
      },
      body: buffer,
    });
    if (!response.ok) {
      const text = await response.text();
      const shortErr = (text || '').slice(0, 100);
      console.log(`[getDocumentText] docint_submit_failed status=${response.status} error=${shortErr}`);
      throw new Error(`DocInt submission failed: ${response.status}`);
    }
    const result = await response.json();
    const operationLocation = response.headers.get('operation-location') || result.operationLocation;
    if (!operationLocation) {
      throw new Error('Document Intelligence missing operation-location');
    }
    console.log(`[getDocumentText] DOCINT_POLLING_STARTED ts=${new Date().toISOString()} operation_location=${operationLocation.slice(0, 80)}...`);
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 45; attempt++) {
      if (Date.now() - startedAt > DOCINT_MAX_WAIT_MS) {
        console.log('[getDocumentText] docint_timed_out');
        throw new Error('Document Intelligence timed out');
      }
      await sleep(DOCINT_POLL_INTERVAL_MS);
      const statusResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOCINT_KEY },
      });
      const json = await statusResponse.json();
      if (json.status === 'succeeded') {
        console.log(`[getDocumentText] DOCINT_POLLING_COMPLETED ts=${new Date().toISOString()} status=succeeded attempt=${attempt + 1}`);
        const paragraphs = json.analyzeResult?.content || '';
        if (paragraphs) return paragraphs.trim();
        const documents = json.analyzeResult?.documents || [];
        if (documents.length) {
          const text = documents.map(doc => doc.content || '').join('\n');
          if (text.trim()) return text.trim();
        }
        const pages = json.analyzeResult?.pages || [];
        const lines = [];
        for (const page of pages) {
          for (const line of page.lines || []) {
            if (line.content) lines.push(line.content);
          }
        }
        return lines.join('\n').trim();
      }
      if (json.status === 'failed') {
        const errMsg = json.error?.message || JSON.stringify(json.error || {});
        console.log(`[getDocumentText] DOCINT_POLLING_COMPLETED ts=${new Date().toISOString()} status=failed error=${(errMsg + '').slice(0, 80)}`);
        throw new Error(`Document Intelligence failed: ${errMsg}`);
      }
    }
    console.log('[getDocumentText] docint_timed_out');
    throw new Error('Document Intelligence timed out');
  } catch (error) {
    const shortMsg = (error?.message || String(error)).slice(0, 80);
    console.log(`[getDocumentText] docint_error error=${shortMsg}`);
    return '';
  }
};

const DATE_FRAGMENT =
  '(?:\\d{1,2}[\\.\\/\\-]\\d{1,2}[\\.\\/\\-]\\d{2,4}|\\d{1,2}\\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2},?\\s+\\d{2,4})';
const RANGE_FRAGMENT = `(?:from\\s+)?(${DATE_FRAGMENT})\\s*(?:-|–|—|to|until|through|thru)\\s*(${DATE_FRAGMENT})`;
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fallbackPolicyExtraction = (text = '') => {
  const result = {
    insuredName: '',
    marketRef: '',
    lineSlipNo: '',
    certificateRef: '',
    policyPeriodStart: '',
    policyPeriodEnd: '',
    retroStart: '',
    retroEnd: ''
  };
  if (!text) return result;

  const normalized = text
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[–—]/g, '-');
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const snippetAround = (keyword) => {
    const lower = normalized.toLowerCase();
    const idx = lower.indexOf(keyword.toLowerCase());
    if (idx === -1) return null;
    const start = Math.max(0, idx - 80);
    const end = Math.min(normalized.length, idx + 80);
    return normalized.slice(start, end);
  };

  console.log('[UMR snippet]', snippetAround('unique market'));
  console.log('[CERT snippet]', snippetAround('certificate reference'));
  console.log('[RETRO snippet]', snippetAround('retroactive'));

  const cleanValue = (value = '') => value.replace(/\s+/g, ' ').trim();

  const matchInline = (regex) => {
    const match = normalized.match(regex);
    return match && match[1] ? cleanValue(match[1]) : '';
  };

  const matchLineAfter = (regex) => {
    const index = lines.findIndex((line) => regex.test(line));
    if (index !== -1 && lines[index + 1]) {
      return cleanValue(lines[index + 1]);
    }
    return '';
  };

  const matchLineValue = (regex) => {
    for (const line of lines) {
      const match = line.match(regex);
      if (match && match[1]) {
        return cleanValue(match[1]);
      }
    }
    return '';
  };

  const matchRange = (keywords) => {
    if (!keywords.length) return null;
    const alternation = keywords.map(escapeRegex).join('|');
    const regex = new RegExp(`(?:${alternation})[^\\n]{0,120}?${RANGE_FRAGMENT}`, 'i');
    const match = normalized.match(regex);
    if (match) {
      return {
        start: cleanValue(match[1] || ''),
        end: cleanValue(match[2] || ''),
      };
    }
    return null;
  };

  const matchSingle = (keywords) => {
    if (!keywords.length) return '';
    const alternation = keywords.map(escapeRegex).join('|');
    const regex = new RegExp(`(?:${alternation})[^\\n]{0,80}?(${DATE_FRAGMENT})`, 'i');
    return matchInline(regex);
  };

  const scanGenericRange = () => {
    for (const line of lines) {
      const match = line.match(new RegExp(`(${DATE_FRAGMENT})\\s*(?:-|–|—|to|until|through|thru)\\s*(${DATE_FRAGMENT})`, 'i'));
      if (match) {
        return {
          start: cleanValue(match[1]),
          end: cleanValue(match[2]),
        };
      }
    }
    return null;
  };

  result.insuredName =
    matchInline(/insured[:\s]+(.+)/i) ||
    matchInline(/insured(?:\s+name)?\s*[:\-]\s*(.+)/i) ||
    matchLineAfter(/insured\b/i) ||
    matchInline(/מבוטח\s*[:\-]?\s*(.+)/) ||
    matchInline(/שם\s+המבוטח\s*[:\-]?\s*(.+)/) ||
    matchLineAfter(/מבוטח\b/) ||
    matchInline(/לקוח\s*[:\-]?\s*(.+)/) ||
    result.insuredName;

  const uniqueMarketRegex = /UNIQUE\s+MARKET\s+REFERENCE(?:\s+NUMBER)?\s+([A-Z0-9]+)/i;
  const uniqueRefMatch = normalized.match(uniqueMarketRegex);
  if (uniqueRefMatch && uniqueRefMatch[1]) {
    result.marketRef = cleanValue(uniqueRefMatch[1]);
  }

  if (!result.marketRef) {
    result.marketRef =
      matchInline(/(?:UMR|unique\s+market\s+ref(?:erence)?|market\s+ref(?:erence)?)\s*[:\-]?\s*([A-Za-z0-9\-\/\.]+)/i) ||
      matchLineValue(/(?:UMR|market\s+ref(?:erence)?)[^\w]*([A-Za-z0-9\-\/\.]+)/i) ||
      result.marketRef;
  }

  const certificateMatch = normalized.match(/CERTIFICATE\s+REFERENCE[:\s]+([0-9]+)/i);
  if (certificateMatch && certificateMatch[1]) {
    result.certificateRef = cleanValue(certificateMatch[1]);
  }

  result.lineSlipNo =
    matchInline(/line[\s-]*slip(?:\s*(?:no\.?|number))?\s*[:\-]?\s*([A-Za-z0-9\-\/\.]+)/i) ||
    matchLineValue(/line[\s-]*slip[^\w]*([A-Za-z0-9\-\/\.]+)/i) ||
    result.lineSlipNo;

  // Match explicit "From ... To ..." ranges such as "From: 01/12/2024 To: 30/11/2025"
  const policyPeriodRegex = /from[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}).*?to[:\s]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/is;
  const policyPeriodMatch = normalized.match(policyPeriodRegex);
  const policyRange =
    (policyPeriodMatch
      ? {
          start: cleanValue(policyPeriodMatch[1] || ''),
          end: cleanValue(policyPeriodMatch[2] || ''),
        }
      : null) ||
    matchRange(['period of insurance', 'policy period', 'insurance period', 'coverage period']) ||
    scanGenericRange();
  if (policyRange) {
    result.policyPeriodStart = policyRange.start;
    result.policyPeriodEnd = policyRange.end;
  }

  const retroMatch = normalized.match(/retroactive[^0-9]{0,40}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  if (retroMatch && retroMatch[1]) {
    result.retroStart = cleanValue(retroMatch[1]);
    result.retroEnd = result.retroEnd || '';
  }

  if (!result.retroStart && !result.retroEnd) {
    const retroRange = matchRange(['retroactive date', 'retroactive coverage', 'retroactive period']);
    if (retroRange) {
      result.retroStart = retroRange.start;
      result.retroEnd = retroRange.end;
    } else {
      const retroSingle = matchSingle(['retroactive date', 'retroactive coverage', 'retro date']);
      if (retroSingle) {
        result.retroStart = retroSingle;
      } else {
        console.debug('[fallbackPolicyExtraction] No retroactive date found in policy text.');
      }
    }
  }

  if (!result.insuredName) {
    const inlineClient =
      matchInline(/(?:client|policyholder)\s*[:\-]\s*(.+)/i) ||
      matchInline(/לקוח\s*[:\-]?\s*(.+)/);
    if (inlineClient) {
      result.insuredName = inlineClient.split(/[,;]/)[0].trim();
    }
  }

  return result;
};

const getDocumentText = async (base64, mimeType, options = {}) => {
  const { ocrPages = POLICY_OCR_MAX_PAGES, forceOcr = false } = options;
  if (!base64 || !mimeType) return null;
  const buffer = Buffer.from(base64, 'base64');
  let extractPath = 'none';
  try {
    const lowerMime = (mimeType || '').toLowerCase();
    if (lowerMime.includes('pdf')) {
      let parsedText = '';
      try {
        const pdfData = await pdfParse(buffer);
        parsedText = pdfData.text?.trim() || '';
        extractPath = parsedText && parsedText.length >= 200 ? 'pdf-parse' : 'pdf-parse-short';
      } catch (parseError) {
        console.warn('[getDocumentText] pdf-parse failed, falling back to PDF.js', parseError?.message?.slice(0, 80));
      }
      if (!parsedText || parsedText.length < 200) {
        parsedText = await extractTextWithPdfJs(buffer);
        if (parsedText) extractPath = parsedText.length >= 200 ? 'pdfjs' : 'pdfjs-short';
      }
      if ((!parsedText || parsedText.length < 200) && USE_DOC_INTELLIGENCE) {
        parsedText = await submitDocumentIntelligenceJob(buffer, mimeType);
        if (parsedText) extractPath = 'docint';
      }
      // On Render: no Tesseract, no Azure Vision OCR (DocInt is the only cloud OCR)
      if (!IS_RENDER) {
        if ((!parsedText || parsedText.length < 200) && USE_AZURE_OCR) {
          parsedText = await extractTextWithAzureOcr(buffer);
          if (parsedText) extractPath = 'azure_ocr';
        }
        if ((!parsedText || parsedText.length < 200) && (ENABLE_POLICY_OCR || forceOcr)) {
          parsedText = await extractTextWithOcr(buffer, ocrPages);
          if (parsedText) extractPath = 'tesseract';
        }
      }
      const textLength = (parsedText || '').length;
      console.log(`[getDocumentText] mime=pdf path=${extractPath} textLength=${textLength}`);
      if (textLength === 0) {
        console.log('[getDocumentText] reason=INVALID_DOCUMENT (no text extracted from PDF)');
      }
      return parsedText || null;
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docxData = await mammoth.extractRawText({ buffer });
      const docxText = docxData.value?.trim() || null;
      const len = (docxText || '').length;
      console.log(`[getDocumentText] mime=docx path=mammoth textLength=${len}`);
      if (len === 0) console.log('[getDocumentText] reason=INVALID_DOCUMENT (docx empty)');
      return docxText;
    }
    if (mimeType.startsWith('text/')) {
      const txt = buffer.toString('utf8');
      console.log(`[getDocumentText] mime=text path=direct textLength=${txt.length}`);
      return txt;
    }
    if (mimeType === 'application/json') {
      const txt = buffer.toString('utf8');
      console.log(`[getDocumentText] mime=json path=direct textLength=${txt.length}`);
      return txt;
    }
    if (mimeType.startsWith('image/')) {
      let imgText = null;
      try {
        if (USE_DOC_INTELLIGENCE) {
          imgText = await submitDocumentIntelligenceJob(buffer, mimeType);
          if (imgText) {
            console.log(`[getDocumentText] mime=image path=docint textLength=${imgText.length}`);
            return imgText;
          }
        }
        // On Render: no Tesseract, no Azure Vision OCR
        if (!IS_RENDER) {
          if (USE_AZURE_OCR) {
            imgText = await extractTextWithAzureOcr(buffer);
            if (imgText) {
              console.log(`[getDocumentText] mime=image path=azure_ocr textLength=${imgText.length}`);
              return imgText;
            }
          }
          const {
            data: { text },
          } = await Tesseract.recognize(buffer, 'eng+heb', {
            tessedit_char_whitelist:
              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzאבגדהוזחטיכךלמםנןסעפףצץקרשת0123456789-./:() ',
          });
          if (text?.trim()) {
            console.log(`[getDocumentText] mime=image path=tesseract_eng_heb textLength=${text.trim().length}`);
            return text.trim();
          }
        }
      } catch (primaryError) {
        if (!IS_RENDER) {
          const shortMsg = (primaryError?.message || String(primaryError)).slice(0, 80);
          console.log(`[getDocumentText] mime=image tesseract_eng_heb_failed error=${shortMsg}`);
          try {
            const {
              data: { text },
            } = await Tesseract.recognize(buffer, 'eng', {
              tessedit_char_whitelist:
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./:() ',
            });
            if (text?.trim()) {
              console.log(`[getDocumentText] mime=image path=tesseract_eng textLength=${text.trim().length}`);
              return text.trim();
            }
          } catch (secondaryError) {
            const shortMsg2 = (secondaryError?.message || String(secondaryError)).slice(0, 80);
            console.log(`[getDocumentText] mime=image tesseract_eng_failed error=${shortMsg2}`);
          }
        } else {
          const shortMsg = (primaryError?.message || String(primaryError)).slice(0, 80);
          console.log(`[getDocumentText] mime=image docint_or_primary_failed error=${shortMsg}`);
        }
      }
      console.log('[getDocumentText] mime=image path=none textLength=0 reason=INVALID_DOCUMENT');
      return null;
    }
  } catch (error) {
    const shortMsg = (error?.message || String(error)).slice(0, 100);
    console.error('[getDocumentText] document parsing failed', shortMsg);
    return null;
  }
  console.log(`[getDocumentText] mime=${mimeType} path=unsupported reason=INVALID_DOCUMENT`);
  return null;
};

/** Pre-OCR diagnosis + smart single-pass OCR for document analysis (claim/dental only).
 * - If text exists (pdf-parse/pdfjs): use it, no OCR.
 * - If no text: run Azure Document Intelligence once only. No retry, no fallback.
 * Returns { text, lowConfidenceDocument } – lowConfidenceDocument when OCR was attempted (no initial text).
 */
const getDocumentTextForAnalysis = async (base64, mimeType) => {
  if (!base64 || !mimeType) return { text: null, lowConfidenceDocument: false };
  const buffer = Buffer.from(base64, 'base64');
  const fileSize = buffer.length;
  try {
    const lowerMime = (mimeType || '').toLowerCase();
    if (lowerMime.includes('pdf')) {
      let textLength = 0;
      let pageCount = 0;
      let parsedText = '';
      try {
        const pdfData = await pdfParse(buffer);
        parsedText = pdfData.text?.trim() || '';
        pageCount = pdfData.numpages || 0;
        textLength = parsedText.length;
      } catch (parseError) {
        console.warn('[getDocumentTextForAnalysis] pdf-parse failed, trying PDF.js', parseError?.message?.slice(0, 80));
      }
      if (!parsedText) {
        parsedText = await extractTextWithPdfJs(buffer);
        if (parsedText) {
          textLength = parsedText.length;
          try {
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
            const pdf = await loadingTask.promise;
            pageCount = pdf.numPages;
          } catch (_) { /* ignore */ }
        }
      }
      console.log(`[getDocumentTextForAnalysis] pre_ocr textLength=${textLength} pageCount=${pageCount} fileSize=${fileSize}`);
      if (textLength > 0) {
        return { text: parsedText, lowConfidenceDocument: false };
      }
      const lowConfidenceDocument = true;
      if (!USE_DOC_INTELLIGENCE) {
        console.log('[getDocumentTextForAnalysis] reason=INVALID_DOCUMENT (no text, DocInt not configured)');
        return { text: null, lowConfidenceDocument };
      }
      const ocrText = await submitDocumentIntelligenceJob(buffer, mimeType);
      if (ocrText && ocrText.trim().length > 0) {
        console.log(`[getDocumentTextForAnalysis] docint_success textLength=${ocrText.length}`);
        return { text: ocrText.trim(), lowConfidenceDocument };
      }
      console.log('[getDocumentTextForAnalysis] reason=INVALID_DOCUMENT (DocInt returned no text)');
      return { text: null, lowConfidenceDocument };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docxData = await mammoth.extractRawText({ buffer });
      const docxText = docxData.value?.trim() || null;
      console.log(`[getDocumentTextForAnalysis] mime=docx path=mammoth textLength=${(docxText || '').length}`);
      return { text: docxText, lowConfidenceDocument: false };
    }
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const txt = buffer.toString('utf8');
      console.log(`[getDocumentTextForAnalysis] mime=${lowerMime.includes('json') ? 'json' : 'text'} path=direct textLength=${txt.length}`);
      return { text: txt || null, lowConfidenceDocument: false };
    }
    if (mimeType.startsWith('image/')) {
      const lowConfidenceDocument = true;
      if (!USE_DOC_INTELLIGENCE) {
        console.log('[getDocumentTextForAnalysis] mime=image reason=INVALID_DOCUMENT (DocInt not configured)');
        return { text: null, lowConfidenceDocument };
      }
      const imgText = await submitDocumentIntelligenceJob(buffer, mimeType);
      if (imgText && imgText.trim().length > 0) {
        console.log(`[getDocumentTextForAnalysis] mime=image path=docint textLength=${imgText.length}`);
        return { text: imgText.trim(), lowConfidenceDocument };
      }
      console.log('[getDocumentTextForAnalysis] mime=image reason=INVALID_DOCUMENT (DocInt returned no text)');
      return { text: null, lowConfidenceDocument };
    }
  } catch (error) {
    const shortMsg = (error?.message || String(error)).slice(0, 100);
    console.error('[getDocumentTextForAnalysis] document parsing failed', shortMsg);
    return { text: null, lowConfidenceDocument: true };
  }
  console.log(`[getDocumentTextForAnalysis] mime=${mimeType} path=unsupported reason=INVALID_DOCUMENT`);
  return { text: null, lowConfidenceDocument: false };
};

const createTextCompletion = async ({ systemPrompt, userPrompt, temperature = 0.2, responseFormat }) => {
  const client = ensureOpenAI();
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    response_format: responseFormat,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return flattenCompletionText(completion);
};

/** Wrapper that adds diagnostic logs and maps errors to reason codes (no sensitive data). */
const createTextCompletionWithDiagnostics = async (
  opts,
  { endpoint = 'openai' } = {},
) => {
  const hasClient = Boolean(openai);
  console.log(`[${endpoint}] openai_client_exists=${hasClient}`);
  if (!hasClient) {
    console.log(`[${endpoint}] reason=AI_UNAVAILABLE (no API key)`);
    throw Object.assign(new Error('OpenAI client is not configured.'), { reason: 'AI_UNAVAILABLE' });
  }
  const startMs = Date.now();
  try {
    console.log(`[${endpoint}] OPENAI_REQUEST_SENT ts=${new Date().toISOString()}`);
    const result = await createTextCompletion(opts);
    const durationMs = Date.now() - startMs;
    console.log(`[${endpoint}] OPENAI_RESPONSE_RECEIVED ts=${new Date().toISOString()} duration_ms=${durationMs}`);
    return result;
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const status = err?.status ?? err?.response?.status ?? err?.code;
    let reason = 'AI_UNAVAILABLE';
    const msg = err && typeof err.message === 'string' ? err.message : String(err);
    if (status === 401 || /invalid.*api.*key|unauthorized/i.test(msg)) {
      reason = 'UNAUTHORIZED';
    } else if (status === 429 || /rate.*limit/i.test(msg)) {
      reason = 'RATE_LIMIT';
    } else if (/timeout|ETIMEDOUT|timed out/i.test(msg)) {
      reason = 'TIMEOUT';
    }
    console.log(
      `[${endpoint}] OPENAI_RESPONSE_FAILED ts=${new Date().toISOString()} reason=${reason} status=${status ?? 'n/a'} duration_ms=${durationMs}`,
    );
    throw Object.assign(err, { reason });
  }
};

const REPORT_TEMPLATE_PATH = path.join(__dirname, 'templates', 'report-modern.html');
let compiledReportTemplate = null;

const getReportTemplate = () => {
  if (compiledReportTemplate) return compiledReportTemplate;
  const raw = fs.readFileSync(REPORT_TEMPLATE_PATH, 'utf-8');
  compiledReportTemplate = Handlebars.compile(raw);
  return compiledReportTemplate;
};

const PLAINTIFF_EXPERT_SECTION_KEY = "The plaintiff's expert opinion";
const CLAIMANT_EXPERT_SECTION_KEY = "The claimant's expert opinion";
const LEGACY_CLAIM_SECTION_LABELS = [
  'The facts outlined in the statement of claim',
  'Statement of Claim – Factual Summary',
];
const LEGACY_DEMAND_SECTION_LABELS = [
  'Factual Summary from the Letter of Demand',
];
const EXPENSES_PLACEHOLDER_TEXT = '[Attached Expense Table DOCX will be injected here]';

// Dental knowledge files (RAG context for dental opinions)
const DENTAL_LEXICON_PATH = path.join(__dirname, 'knowledge', 'DentalLexicon.he.md');
const DENTAL_PLAYBOOK_PATH = path.join(__dirname, 'knowledge', 'DentalPlaybook.he.md');
const DENTAL_STYLE_EXEMPLAR_PATH = path.join(__dirname, 'knowledge', 'DentalStyleExemplar.he.md');

const formatFullDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMultiline = (text = '') => escapeHtml(text).replace(/\r?\n/g, '<br/>');

const formatSectionContent = (value) => (value ? formatMultiline(value) : escapeHtml('[No Content]'));

const buildExpertTitle = (target, mode = 'SINGLE') => {
  const isMultiple = mode === 'MULTIPLE';
  const prefix = isMultiple ? 'Expert opinions' : 'Expert opinion';
  return `${prefix} – ${target}`;
};

const getSectionDisplayTitle = (section, expertSummaryMode = {}) => {
  const mode = expertSummaryMode?.[section];
  if (section === PLAINTIFF_EXPERT_SECTION_KEY) {
    return buildExpertTitle('Statement of Claim', mode);
  }
  if (section === CLAIMANT_EXPERT_SECTION_KEY) {
    return buildExpertTitle('Letter of Demand', mode);
  }
  if (LEGACY_CLAIM_SECTION_LABELS.includes(section)) {
    return 'Statement of Claim – Factual Summary';
  }
  if (LEGACY_DEMAND_SECTION_LABELS.includes(section)) {
    return 'Factual Summary from the Letter of Demand';
  }
  return section;
};

const buildCaseLabel = (report) => {
  const caseId = report.odakanitNo || report.id || '';
  const insured = report.insuredName || '';
  if (caseId && insured) return `${caseId} – ${insured}`;
  return caseId || insured || 'Case';
};

const buildCaseMetaRows = (report) => {
  const rows = [];
  if (report.insurerName) rows.push({ label: 'INSURER', value: report.insurerName });
  const uniqueMarketRef = report.lineSlipNo || report.marketRef;
  if (uniqueMarketRef) rows.push({ label: 'UNIQUE MARKET REF', value: uniqueMarketRef });
  if (report.certificateRef) rows.push({ label: 'CERTIFICATE REF', value: report.certificateRef });
  if (report.insuredName) rows.push({ label: 'INSURED', value: report.insuredName });
  if (report.plaintiffName || report.plaintiffTitle) {
    rows.push({
      label: (report.plaintiffTitle || 'PLAINTIFF').toUpperCase(),
      value: report.plaintiffName || '',
    });
  }
  return rows;
};

const buildPreviousReportsData = (report, currentReportNumber) => {
  const history = Array.isArray(report.reportHistory) ? report.reportHistory : [];

  if (!history.length) {
    return {
      hasEntries: false,
      entries: [],
      currentReportLabel: `Report ${currentReportNumber} – Present Report.`,
    };
  }

  const entries = history.map((item, index) => {
    const versionIndex = item.reportNumber || index + 1;
    const fileTitle = item.fileTitle || item.fileName || item.subject || '';
    const sentAtFormatted = item.date ? formatFullDate(item.date) : '';

    let display = '';
    if (fileTitle && sentAtFormatted) {
      display = `Report ${versionIndex} — ${fileTitle}, ${sentAtFormatted}`;
    } else if (fileTitle) {
      display = `Report ${versionIndex} — ${fileTitle}`;
    } else if (sentAtFormatted) {
      display = `Report ${versionIndex} — ${sentAtFormatted}`;
    } else {
      display = `Report ${versionIndex}`;
    }

    return {
      versionIndex,
      fileTitle,
      sentAtFormatted,
      display,
    };
  });

  return {
    hasEntries: entries.length > 0,
    entries,
    currentReportLabel: `Report ${currentReportNumber} – Present Report.`,
  };
};

const buildPolicyPeriodDisplay = (start, end) => {
  const safeStart = start || '';
  const safeEnd = end || '';
  if (!safeStart && !safeEnd) return '';
  if (safeStart && safeEnd) return `${safeStart} – ${safeEnd}`;
  return safeStart || safeEnd;
};

const buildReLine = (report, currentReportNumber) => {
  // If in the future a dedicated "subject" field is added to the report,
  // we can prioritize it here. For now we build a robust fallback.
  const parts = [];
  if (report.insuredName) parts.push(report.insuredName);
  if (report.plaintiffName) parts.push(report.plaintiffName);
  if (report.insurerName) parts.push(report.insurerName);

  let base = parts.join(' – ');
  if (currentReportNumber && Number.isFinite(currentReportNumber)) {
    const suffix = `Report ${currentReportNumber}`;
    base = base ? `${base} – ${suffix}` : suffix;
  }

  return base || 'Case Update Report';
};

const buildTimelineData = (report) => {
  const events = [];

  // Previous reports from history
  if (Array.isArray(report.reportHistory)) {
    report.reportHistory.forEach((item, index) => {
      const when = item.date || item.timestamp || null;
      if (!when) return;
      events.push({
        when,
        label: item.subject
          ? `Report ${item.reportNumber || index + 1} – ${item.subject}`
          : `Report ${item.reportNumber || index + 1} sent`,
      });
    });
  }

  // Current report event
  if (report.sentAt) {
    events.push({
      when: report.sentAt,
      label: 'Current report sent',
    });
  } else if (report.reportDate) {
    events.push({
      when: report.reportDate,
      label: 'Current report drafted',
    });
  }

  if (!events.length) {
    return { hasEntries: false, entries: [] };
  }

  // Normalize, sort by time, and cap to last N כדי שהציר יישאר בתוך ה-COVER PAGE.
  // בדוחות פיננסיים (שמבוססים על טבלת הוצאות) נסתפק בציר קצר יותר.
  const isFinanceUpdate = Boolean(report && report.expensesSheetId);
  const maxEvents = isFinanceUpdate ? 3 : 5;
  const normalized = events
    .map((e) => {
      const dateObj = new Date(e.when);
      const time = Number.isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
      return { ...e, time };
    })
    .filter((e) => e.time > 0)
    .sort((a, b) => a.time - b.time) // oldest first
    .slice(-maxEvents);

  const entries = normalized.map((e) => ({
    date: formatFullDate(e.when),
    label: e.label,
  }));

  return {
    hasEntries: entries.length > 0,
    entries,
  };
};

const formatAmountDisplay = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US');
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return '-';
};

const normalizeSectionOrder = (report) => {
  if (Array.isArray(report.selectedSections) && report.selectedSections.length) {
    return report.selectedSections;
  }
  if (report.content && typeof report.content === 'object') {
    return Object.keys(report.content);
  }
  return [];
};

const buildSectionsData = (report) => {
  const expertSummaryMode = report.expertSummaryMode || {};
  const sectionsOrder = normalizeSectionOrder(report);
  const seen = new Set();
  const uniqueOrder = sectionsOrder.filter((section) => {
    if (!section || seen.has(section)) return false;
    seen.add(section);
    return true;
  });

  const expensesItems = Array.isArray(report.expensesItems)
    ? report.expensesItems.map((item, index) => ({
        id: item.id || index,
        date: item.date || '',
        description: item.description || '',
        amountDisplay: formatAmountDisplay(item.amount),
        currency: item.currency || '',
      }))
    : [];

  return uniqueOrder.map((section) => {
    const isExpenses = /expenses/i.test(section);
    const contentValue =
      report.translatedContent?.[section] ||
      report.content?.[section] ||
      '';

    const sectionHtml =
      isExpenses && typeof report.expensesHtml === 'string'
        ? report.expensesHtml
        : '';

    return {
      title: getSectionDisplayTitle(section, expertSummaryMode),
      isExpenses,
      contentHtml: isExpenses ? '' : formatSectionContent(contentValue),
      hasExpensesTable: isExpenses && expensesItems.length > 0,
      expensesItems,
      expensesSum: report.expensesSum || '',
      paymentRecommendation: report.paymentRecommendation || '',
      emptyExpensesPlaceholder: EXPENSES_PLACEHOLDER_TEXT,
      html: sectionHtml,
    };
  });
};

// ==========================
// Procedural Timeline helpers
// ==========================

const PROCEDURE_TYPE_LABELS = {
  LETTER_OF_DEMAND: 'Letter of Demand',
  FIRST_INSTANCE: 'First Instance Proceedings',
  APPEAL: 'Appeal Proceedings',
};

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Canonical stage definitions per procedure type – server-side dictionary.
// Labels must remain in sync with the product specification and UI.
const PROCEDURAL_STAGE_DEFS = {
  LETTER_OF_DEMAND: [
    { id: 'LOD_ISSUED', label: 'Letter of Demand Issued', isDynamic: false },
    { id: 'LOD_INTERNAL_REVIEW', label: 'Internal Review & Coverage Assessment', isDynamic: false },
    { id: 'LOD_RESPONSE', label: 'Response to Letter of Demand', isDynamic: false },
    { id: 'LOD_PRE_LITIGATION', label: 'Pre-Litigation Negotiations', isDynamic: false },
    { id: 'LOD_OUTCOME_ESCALATION', label: 'Outcome / Escalation Decision', isDynamic: false },
    { id: 'LOD_CLAIM_SETTLED', label: 'Claim Settled', isDynamic: false },
    { id: 'LOD_DEMAND_REJECTED', label: 'Demand Rejected', isDynamic: false },
  ],
  FIRST_INSTANCE: [
    { id: 'FI_STATEMENT_OF_CLAIM', label: 'Statement of Claim Filed', isDynamic: false },
    { id: 'FI_STATEMENT_OF_DEFENCE', label: 'Statement of Defence Filed', isDynamic: false },
    { id: 'FI_DISCOVERY_DISCLOSURE', label: 'Discovery & Disclosure', isDynamic: false },
    { id: 'FI_COURT_APPOINTED_EXPERT', label: 'Court-Appointed Expert', isDynamic: true },
    {
      id: 'FI_RD_DOCS_DAMAGE_SUBMISSIONS',
      label: 'R & D Docs – Damage Assessment Submissions',
      isDynamic: true,
    },
    { id: 'FI_EVIDENTIARY_HEARINGS', label: 'Evidentiary Hearings', isDynamic: false },
    { id: 'FI_SUMMATIONS', label: 'Summations', isDynamic: false },
    { id: 'FI_JUDGMENT', label: 'Judgment', isDynamic: false },
  ],
  APPEAL: [
    { id: 'AP_DECISION_TO_APPEAL', label: 'Decision to Appeal', isDynamic: false },
    { id: 'AP_NOTICE_OF_APPEAL', label: 'Notice of Appeal Filed', isDynamic: false },
    { id: 'AP_RESPONSE_TO_APPEAL', label: 'Response to Appeal', isDynamic: false },
    { id: 'AP_APPEAL_HEARINGS', label: 'Appeal Hearings', isDynamic: false },
    { id: 'AP_APPEAL_JUDGMENT', label: 'Appeal Judgment', isDynamic: false },
  ],
};

const normalizeMonthYearDisplay = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // Preferred storage: "YYYY-MM"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIndex = parseInt(isoMatch[2], 10);
    if (monthIndex >= 1 && monthIndex <= 12) {
      return `${MONTH_NAMES_EN[monthIndex - 1]} ${year}`;
    }
  }

  // Alternative: "MM/YYYY"
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const monthIndex = parseInt(slashMatch[1], 10);
    const year = slashMatch[2];
    if (monthIndex >= 1 && monthIndex <= 12) {
      return `${MONTH_NAMES_EN[monthIndex - 1]} ${year}`;
    }
  }

  // Alternative: "Month YYYY" with an allowed month name
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2) {
    const [maybeMonth, maybeYear] = parts;
    const monthIndex = MONTH_NAMES_EN.findIndex(
      (name) => name.toLowerCase() === maybeMonth.toLowerCase(),
    );
    if (monthIndex !== -1 && /^\d{4}$/.test(maybeYear)) {
      return `${MONTH_NAMES_EN[monthIndex]} ${maybeYear}`;
    }
  }

  // If the format is not recognized, we prefer to hide it instead of showing arbitrary free text.
  return '';
};

const buildProceduralTimelineView = (report, currentReportNumber) => {
  const raw = report && report.proceduralTimeline;
  if (!raw || typeof raw !== 'object') return null;

  const { procedureType, currentStageId, stages } = raw;
  if (!procedureType || !Object.prototype.hasOwnProperty.call(PROCEDURE_TYPE_LABELS, procedureType)) {
    return null;
  }

  const stageDefs = PROCEDURAL_STAGE_DEFS[procedureType] || [];
  if (!stageDefs.length) return null;

  const stageStateById = new Map();
  if (Array.isArray(stages)) {
    stages.forEach((s) => {
      if (s && typeof s.id === 'string') {
        stageStateById.set(s.id, s);
      }
    });
  }

  const includedStages = [];
  stageDefs.forEach((def) => {
    const state = stageStateById.get(def.id) || {};
    // Static stages default to included=true unless explicitly disabled.
    // Dynamic stages default to included=false unless explicitly enabled.
    const include = def.isDynamic ? !!state.include : state.include !== false;
    if (!include) return;
    includedStages.push({
      id: def.id,
      label: def.label,
      isDynamic: !!def.isDynamic,
      rawMonthYear: state.monthYear || null,
    });
  });

  if (!includedStages.length) return null;

  let currentIndex = includedStages.findIndex((s) => s.id === currentStageId);
  if (currentIndex < 0) {
    // If there is no valid current stage, we still render the timeline but mark all as "upcoming".
    currentIndex = null;
  }

  const stagesView = includedStages.map((s, idx) => {
    let status = 'UPCOMING';
    if (currentIndex !== null) {
      if (idx < currentIndex) status = 'COMPLETED';
      else if (idx === currentIndex) status = 'CURRENT';
    }
    return {
      id: s.id,
      label: s.label,
      status,
      include: true,
      monthYearDisplay: normalizeMonthYearDisplay(s.rawMonthYear),
    };
  });

  let currentProceduralStageLabel = '';
  if (currentIndex !== null && currentIndex >= 0 && currentIndex < includedStages.length) {
    currentProceduralStageLabel = includedStages[currentIndex].label;
  }

  const reportNumber =
    typeof report.reportNumber === 'number' && report.reportNumber > 0
      ? report.reportNumber
      : currentReportNumber;

  // Choose the latest stage (by order) that has a monthYear, if any, for "Updated: Month Year".
  let updatedMonthYearDisplay = '';
  for (let i = stagesView.length - 1; i >= 0; i -= 1) {
    if (stagesView[i].monthYearDisplay) {
      updatedMonthYearDisplay = stagesView[i].monthYearDisplay;
      break;
    }
  }

  let metaLine = '';
  if (reportNumber) {
    metaLine = `Report No. ${reportNumber}`;
    if (updatedMonthYearDisplay) {
      metaLine = `${metaLine} · Updated: ${updatedMonthYearDisplay}`;
    }
  }

  return {
    exists: true,
    procedureType,
    procedureTypeLabel: PROCEDURE_TYPE_LABELS[procedureType] || '',
    reportNumber,
    metaLine,
    stages: stagesView,
    currentProceduralStageLabel,
  };
};

const buildReportHtml = (report = {}, options = {}) => {
  const { forPdf = false } = options;
  const template = getReportTemplate();
  const currentReportNumber =
    (Array.isArray(report.reportHistory) ? report.reportHistory.length : 0) + 1;
  const uniqueMarketRef = report.lineSlipNo || report.marketRef || '';
  const certificateRef = report.certificateRef || '';
  const insurerName = report.insurerName || '';
  const insuredName = report.insuredName || '';
  const plaintiffTitle = report.plaintiffTitle || 'Plaintiff';
  const plaintiffName = report.plaintiffName || '';
  const marketRef = report.marketRef || '';
  const lineSlipNo = report.lineSlipNo || '';
  const policyPeriodDisplay = buildPolicyPeriodDisplay(report.policyPeriodStart, report.policyPeriodEnd);
  const retroPeriodDisplay = buildPolicyPeriodDisplay(report.retroStart, report.retroEnd);
  const hasMetaRows = Boolean(
    insurerName || uniqueMarketRef || certificateRef || insuredName || plaintiffName
  );
  const previousReports = buildPreviousReportsData(report, currentReportNumber);
  const timelineEvents = buildTimelineData(report);

  const proceduralTimelineView = buildProceduralTimelineView(report, currentReportNumber);
  const hasProceduralTimeline = !!proceduralTimelineView;

  // Visual timeline arrow image based on selected timeline stage (if any)
  const selectedTimeline = (report.selectedTimeline || '').trim();
  let timelineImage =
    selectedTimeline && TIMELINE_IMAGE_BASE64[selectedTimeline]
      ? TIMELINE_IMAGE_BASE64[selectedTimeline]
      : '';

  // For new structured procedural timelines we no longer embed a graphic timeline on the cover.
  // Legacy reports (without proceduralTimeline) keep their existing timelineImage behaviour.
  if (hasProceduralTimeline) {
    timelineImage = '';
  }

  // Dynamic cover subtitle based on procedural timeline stage
  const COVER_SUBTITLE_BY_TIMELINE = {
    statement_of_claim: 'STATEMENT OF CLAIM',
    statement_of_defence: 'STATEMENT OF DEFENCE',
    preliminary: 'PRELIMINARY PROCEEDINGS',
    evidence_submission: 'EVIDENCE SUBMISSION',
    evidentiary: 'EVIDENTIARY HEARING',
    summaries: 'SUMMARIES',
    judgment: 'JUDGMENT',
  };
  // For reports with a structured proceduralTimeline we no longer show a procedural-stage
  // headline on the cover. Legacy reports keep the old behaviour.
  const coverSubtitle = hasProceduralTimeline
    ? ''
    : COVER_SUBTITLE_BY_TIMELINE[selectedTimeline] || '';

  const executiveSummaryHtml = report.executiveSummary ? formatMultiline(report.executiveSummary) : '';
  const sections = buildSectionsData(report);

  // Build a separate Appendix HTML block for invoice files so that they
  // appear after the main body (ולא בתוך סעיף הוצאות עצמו).
  let invoicesAppendixHtml = '';
  if (Array.isArray(report.invoiceFiles) && report.invoiceFiles.length) {
    invoicesAppendixHtml = '<div class="appendix-section">';
    report.invoiceFiles.forEach((file, index) => {
      if (!file || !file.data) return;
      const fileName = file.name || `Invoice ${index + 1}`;
      const mime = file.type || 'application/pdf';
      const base64 = String(file.data).replace(/^data:.*;base64,/, '');
      const src = `data:${mime};base64,${base64}`;
      const isImage = mime.toLowerCase().startsWith('image/');
      const isPdf =
        mime === 'application/pdf' ||
        mime === 'application/x-pdf' ||
        mime === 'application/octet-stream';

      if (isImage) {
        invoicesAppendixHtml +=
          `<div class="appendix-item"><img src="${src}" class="appendix-image" alt="${escapeHtml(
            fileName,
          )}" />` +
          `<div class="appendix-caption">${escapeHtml(
            fileName,
          )}</div></div>`;
      } else if (isPdf) {
        invoicesAppendixHtml +=
          `<div class="appendix-item"><object data="${src}" type="application/pdf" class="appendix-pdf">` +
          `<p class="appendix-caption">${escapeHtml(
            fileName,
          )}</p></object></div>`;
      } else {
        invoicesAppendixHtml += `<div class="appendix-item"><p class="appendix-caption">${escapeHtml(
          fileName,
        )}</p></div>`;
      }
    });
    invoicesAppendixHtml += '</div>';
  }

  const signatureImage = SIGNATURE_BASE64;
  const subject = (report.reportSubject || '').trim();

  const templateData = {
    // Branding (single logo on cover page only)
    logoBase64: COVER_LOGO_BASE64,

    // Case identity
    caseLabel: buildCaseLabel(report),
    reportNumber:
      typeof report.reportNumber === 'number' && report.reportNumber > 0
        ? report.reportNumber
        : currentReportNumber,
    reportDate: formatFullDate(report.reportDate || new Date().toISOString()),
    odakanitNo: report.odakanitNo || '',

    // Parties
    signatureImage,
    signatureFallbackText: 'Lior Perry, Adv.',
    insurerName,
    marketRef,
    lineSlipNo,
    certificateRef,
    insuredName,
    plaintiffTitle: plaintiffTitle.toUpperCase(),
    plaintiffName,

    // Policy timing
    policyPeriodDisplay,
    retroPeriodDisplay,

    // Previous reports & timeline (may be used later)
    hasMetaRows,
    previousReports,
    timelineEvents,
    timelineImage,
    coverSubtitle,
    proceduralTimeline: proceduralTimelineView,
    currentProceduralStageLabel:
      proceduralTimelineView && proceduralTimelineView.currentProceduralStageLabel
        ? proceduralTimelineView.currentProceduralStageLabel
        : '',

    // Content
    hasExecutiveSummary: Boolean(executiveSummaryHtml),
    executiveSummaryHtml,
    sections,
    invoicesAppendixHtml,
    closingLine: 'We are at your disposal for any questions and explanations.',

    // RE line for cover
    reportReLine: subject || buildReLine(report, currentReportNumber),

    // When true, omit signature block and cover badge from PDF output only
    forPdf,
  };

  return template(templateData);
};

// --- Policy Appendix helpers ---

/**
 * Extract policy PDF Buffer from ReportData (if exists and is a real PDF).
 * Expects report.policyFile.data to be base64 (optionally with data: URL prefix).
 */
const getPolicyPdfBufferFromReport = (report) => {
  const policy = report && report.policyFile;
  if (!policy || !policy.data) {
    return null;
  }

  const mime = policy.type || '';
  if (!mime.toLowerCase().includes('pdf')) {
    console.warn('[PolicyAppendix] policyFile is not a PDF, skipping appendix', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      policyName: policy?.name,
      mime,
    });
    return null;
  }

  try {
    // policy.data may be "data:application/pdf;base64,AAAA..." or just "AAAA..."
    const base64 = policy.data.replace(/^data:application\/pdf;base64,/, '');
    const buf = Buffer.from(base64, 'base64');

    if (!buf || !buf.length) {
      console.error('[PolicyAppendix] Decoded policy buffer is empty, skipping appendix', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        policyName: policy?.name,
      });
      return null;
    }

    return buf;
  } catch (err) {
    console.error(
      '[PolicyAppendix] Failed to decode policyFile base64:',
      { odakanitNo: report?.odakanitNo, reportId: report?.id, policyName: policy?.name },
      err
    );
    return null;
  }
};

/**
 * Merge multiple PDF buffers into a single PDF using pdf-lib.
 * `buffers` is an array of Node Buffers.
 */
const mergePdfBuffers = async (buffers) => {
  const mergedPdf = await PDFDocument.create();

  for (const buf of buffers) {
    if (!buf || !buf.length) continue;

    const srcPdf = await PDFDocument.load(buf);
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save(); // Uint8Array
  return Buffer.from(mergedBytes);
};

/**
 * Build a simple one-page PDF "APPENDIX A – POLICY" cover
 * using pdf-lib only (no additional Puppeteer round-trip).
 * We intentionally keep this minimal: title + key policy meta (no internal file, no date).
 */
const buildPolicyAppendixIntroPdf = async (report) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width, height } = page.getSize();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const title = 'APPENDIX A – POLICY';
  const insured = report.insuredName || '';
  const umr = report.marketRef || report.lineSlipNo || '';

  const metaLines = [];
  if (insured) metaLines.push(`Insured: ${insured}`);
  if (umr) metaLines.push(`UMR / Line Slip: ${umr}`);

  const titleSize = 16;
  const metaSize = 11;
  const leading = 16;

  let y = height - 80;

  const textWidth = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - textWidth) / 2,
    y,
    size: titleSize,
    font: fontBold,
  });

  y -= leading * 2;

  metaLines.forEach((line) => {
    page.drawText(line, {
      x: 72,
      y,
      size: metaSize,
      font,
    });
    y -= leading;
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
};

/**
 * Build a dedicated PDF appendix for invoice files using pdf-lib.
 * - First page: "APPENDIX – INVOICES" title (simple text page)
 * - For each invoice:
 *   - If PDF: copy all pages into this appendix document
 *   - If image: create a full A4 page and draw the image fitted to the page
 * Returns a Buffer with the appendix PDF, or null if there are no valid invoices.
 */
const buildInvoicesAppendixPdf = async (report) => {
  const files = Array.isArray(report.invoiceFiles)
    ? report.invoiceFiles.filter((f) => f && f.data)
    : [];

  if (!files.length) {
    return null;
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Title page: "APPENDIX – INVOICES"
  const titlePage = doc.addPage();
  const { width: tpw, height: tph } = titlePage.getSize();
  const title = 'APPENDIX – INVOICES';
  const titleSize = 16;
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
  titlePage.drawText(title, {
    x: (tpw - titleWidth) / 2,
    y: tph - 80,
    size: titleSize,
    font: fontBold,
  });

  // For each invoice file – append pages
  for (const file of files) {
    try {
      const fileName = file.name || 'Invoice';
      const mimeRaw = file.type || '';
      const mime = mimeRaw.toLowerCase();
      const rawData = String(file.data);
      const base64 =
        rawData.indexOf('base64,') !== -1 ? rawData.split('base64,').pop() || rawData : rawData;
      const bytes = Buffer.from(base64, 'base64');

      if (!bytes || !bytes.length) continue;

      // Detect real PDF by magic header first (%PDF)
      const isPdfByMagic =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;

      // Detect common image formats by magic header (PNG / JPEG)
      const isPngByMagic =
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a;

      const isJpgByMagic =
        bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

      const isImageByMagic = isPngByMagic || isJpgByMagic;
      const isImageByMime = mime.startsWith('image/');

      // Optional per-file debug
      try {
        const slice = bytes.subarray(0, 10);
        const first10BytesHex = Array.from(slice)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log('[InvoicesAppendix][FileInspect]', {
          odakanitNo: report?.odakanitNo,
          reportId: report?.id,
          fileName,
          mime: mimeRaw,
          isPdfByMagic,
          isImageByMagic,
          first10BytesHex,
        });
      } catch {
        // ignore
      }

      if (isPdfByMagic) {
        // Treat as full PDF – copy all pages regardless of mime/extension
        const srcPdf = await PDFDocument.load(bytes);
        const srcPages = await doc.copyPages(srcPdf, srcPdf.getPageIndices());
        srcPages.forEach((p) => doc.addPage(p));
        continue;
      }

      if (isImageByMagic || isImageByMime) {
        // Image – create a full A4 page and fit the image inside relatively small margins
        const page = doc.addPage();
        const { width, height } = page.getSize();

        const isPng = isPngByMagic || mime.includes('png');
        const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const { width: iw, height: ih } = image.size();

        const marginX = 20;
        const marginY = 20;
        const maxWidth = width - marginX * 2;
        const maxHeight = height - marginY * 2;
        const scale = Math.min(maxWidth / iw, maxHeight / ih, 1);

        const scaled = image.scale(scale);
        const x = (width - scaled.width) / 2;
        const y = (height - scaled.height) / 2;

        page.drawImage(image, {
          x,
          y,
          width: scaled.width,
          height: scaled.height,
        });
        continue;
      }

      // For unknown types – create a simple text page so the reader knows something was attached.
      const page = doc.addPage();
      const { width: uw, height: uh } = page.getSize();
      const msg = `Unsupported invoice payload: ${fileName}`;
      page.drawText(msg, {
        x: 72,
        y: uh - 100,
        size: 12,
        font,
      });

      console.warn('[InvoicesAppendix] Unsupported invoice type treated as text page', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        fileName,
        mime: mimeRaw,
      });
    } catch (err) {
      console.error('[InvoicesAppendix] Failed to append invoice file to appendix PDF', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        fileName: file?.name,
        err,
      });
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
};

/**
 * Build the final report PDF including:
 * 1) Base report (HTML-rendered via Puppeteer) – without any invoice HTML embeds
 * 2) Optional policy appendix (intro + policy PDF), controlled by attachPolicyAsAppendix
 * 3) Optional invoices appendix, where each invoice becomes real PDF pages
 * On any error when building appendices, falls back to base report only.
 */
const buildFinalReportPdfWithPolicy = async (report) => {
  // 1) Base report – rendered without invoiceFiles so that invoices are never
  //    embedded as <object>/<img> inside the HTML body used for PDF.
  const baseReportPdf = await renderReportPdf(report);

  // Debug: count base report pages
  let basePages = 0;
  let policyPages = 0;
  let invoicesPages = 0;
  try {
    const baseDoc = await PDFDocument.load(baseReportPdf);
    basePages = baseDoc.getPageCount();
    console.log('[PDFDebug] Base report PDF pages', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      basePages,
    });
  } catch (err) {
    console.error('[PDFDebug] Failed to inspect base report PDF', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      err,
    });
  }

  const buffers = [baseReportPdf];

  // 2) Policy appendix (existing behaviour, wrapped in try/catch)
  try {
    const policyPdf = getPolicyPdfBufferFromReport(report);
    if (policyPdf) {
      if (report && report.attachPolicyAsAppendix === false) {
        console.log(
          '[PolicyAppendix] attachPolicyAsAppendix=false, returning base report only (no policy appendix)',
          {
            odakanitNo: report.odakanitNo,
            reportId: report.id,
          }
        );
      } else {
        const appendixIntroPdf = await buildPolicyAppendixIntroPdf(report);
        buffers.push(appendixIntroPdf, policyPdf);

        // Debug: count policy appendix pages (intro + policy)
        try {
          const introDoc = await PDFDocument.load(appendixIntroPdf);
          const policyDoc = await PDFDocument.load(policyPdf);
          const introPages = introDoc.getPageCount();
          const polPages = policyDoc.getPageCount();
          policyPages = introPages + polPages;
          console.log('[PDFDebug] Policy appendix pages', {
            odakanitNo: report?.odakanitNo,
            reportId: report?.id,
            introPages,
            policyPages: polPages,
            totalPolicyAppendixPages: policyPages,
          });
        } catch (inspectErr) {
          console.error('[PDFDebug] Failed to inspect policy appendix PDFs', {
            odakanitNo: report?.odakanitNo,
            reportId: report?.id,
            inspectErr,
          });
        }

        console.log('[PolicyAppendix] Will append Appendix A intro and policy PDF', {
          odakanitNo: report?.odakanitNo,
          reportId: report?.id,
        });
      }
    }
  } catch (err) {
    console.error(
      '[PolicyAppendix] Failed to prepare policy appendix, continuing without it:',
      { odakanitNo: report?.odakanitNo, reportId: report?.id },
      err
    );
  }

  // 3) Invoices appendix (new behaviour)
  try {
    const invoicesAppendixPdf = await buildInvoicesAppendixPdf(report);
    if (invoicesAppendixPdf) {
      buffers.push(invoicesAppendixPdf);

      // Debug: count invoices appendix pages and log per-file info
      try {
        const invoicesDoc = await PDFDocument.load(invoicesAppendixPdf);
        invoicesPages = invoicesDoc.getPageCount();

        const invoiceCount = Array.isArray(report.invoiceFiles)
          ? report.invoiceFiles.length
          : 0;

        const invoiceDebug =
          Array.isArray(report.invoiceFiles) && report.invoiceFiles.length
            ? report.invoiceFiles.slice(0, 5).map((f) => {
                if (!f || !f.data) return null;
                const name = f.name || 'Invoice';
                const type = f.type || '';
                const raw = String(f.data);
                const base64 =
                  raw.indexOf('base64,') !== -1 ? raw.split('base64,').pop() || raw : raw;
                let first10BytesHex = '';
                try {
                  const buf = Buffer.from(base64, 'base64');
                  const slice = buf.subarray(0, 10);
                  first10BytesHex = Array.from(slice)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(' ');
                } catch {
                  first10BytesHex = 'decode-error';
                }
                return { name, type, first10BytesHex };
              })
            : [];

        console.log('[PDFDebug] Invoices appendix pages', {
          odakanitNo: report?.odakanitNo,
          reportId: report?.id,
          invoiceCount,
          invoicesPages,
          invoiceFilesSample: invoiceDebug,
        });
      } catch (inspectErr) {
        console.error('[PDFDebug] Failed to inspect invoices appendix PDF', {
          odakanitNo: report?.odakanitNo,
          reportId: report?.id,
          inspectErr,
        });
      }

      console.log('[InvoicesAppendix] Appended invoices appendix PDF', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        invoiceCount: Array.isArray(report.invoiceFiles) ? report.invoiceFiles.length : 0,
      });
    }
  } catch (err) {
    console.error(
      '[InvoicesAppendix] Failed to build invoices appendix, continuing without it:',
      { odakanitNo: report?.odakanitNo, reportId: report?.id },
      err
    );
  }

  if (buffers.length === 1) {
    // No appendices – just the base report
    return baseReportPdf;
  }

  try {
    const mergedBuffer = await mergePdfBuffers(buffers);

    // Debug: inspect merged PDF page count vs expected
    try {
      const mergedDoc = await PDFDocument.load(mergedBuffer);
      const mergedPages = mergedDoc.getPageCount();
      const expectedPages = basePages + policyPages + invoicesPages;
      console.log('[PDFDebug] Merged PDF pages', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        basePages,
        policyPages,
        invoicesPages,
        expectedPages,
        mergedPages,
      });

      if (mergedPages !== expectedPages) {
        console.error('[PDFError] Merged PDF pages mismatch', {
          odakanitNo: report?.odakanitNo,
          reportId: report?.id,
          basePages,
          policyPages,
          invoicesPages,
          expectedPages,
          mergedPages,
        });
        throw new Error('Merged PDF page count does not match expected appendices layout');
      }
    } catch (inspectErr) {
      console.error('[PDFDebug] Failed to inspect merged PDF', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        inspectErr,
      });
    }

    return mergedBuffer;
  } catch (err) {
    console.error(
      '[Appendices] Failed to merge base report and appendices, falling back to base report only:',
      { odakanitNo: report?.odakanitNo, reportId: report?.id },
      err
    );
    return baseReportPdf;
  }
};

const renderReportPdf = async (report) => {
  // When generating the PDF, we purposely drop invoiceFiles so that
  // invoices are not embedded as HTML <object>/<img> and are instead
  // appended later as real PDF pages via pdf-lib.
  let html;
  try {
    const safeReportForHtml = { ...report, invoiceFiles: [] };
    html = buildReportHtml(safeReportForHtml, { forPdf: true });
    console.log('[PDF] HTML generation completed', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      htmlLength: html?.length,
    });
  } catch (htmlErr) {
    console.error('[PDF] HTML generation failed', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      error: htmlErr?.message,
      stack: htmlErr?.stack,
    });
    throw Object.assign(htmlErr, { reason: 'HTML_GENERATION' });
  }

  // Debug: ensure the HTML used for PDF has no invoices appendix embeds
  try {
    const hasAppendixInvoices = html.includes('APPENDIX – INVOICES');
    const hasObjectTag = html.includes('<object');
    const hasDataPdf = html.includes('data:application/pdf;base64');
    console.log('[PDFDebug][HTML] Invoice appendix markers in HTML used for PDF', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      hasAppendixInvoices,
      hasObjectTag,
      hasDataPdf,
    });

    // Hard guard: the HTML used for PDF generation must not contain any
    // appendix-invoices embeds. If it does, fail fast so we never ship
    // a PDF where invoices are rendered as HTML thumbnails.
    if (hasAppendixInvoices || hasObjectTag || hasDataPdf) {
      console.error('[PDFError][HTML] Invoice appendix HTML detected in PDF path', {
        odakanitNo: report?.odakanitNo,
        reportId: report?.id,
        hasAppendixInvoices,
        hasObjectTag,
        hasDataPdf,
      });
      throw new Error(
        'Invoice appendix HTML detected in PDF renderer; invoices must be attached as PDF appendices only.'
      );
    }
  } catch (err) {
    console.error('[PDFDebug][HTML] Failed to inspect HTML for invoice markers', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      err,
    });
  }

  // Optional debug: write HTML to disk for manual inspection
  if (process.env.PDF_DEBUG === '1') {
    try {
      const debugPath = path.join(__dirname, 'debug-report.html');
      fs.writeFileSync(debugPath, html, 'utf-8');
      console.log('[PDF_DEBUG] Wrote debug HTML to:', debugPath);
    } catch (err) {
      console.error('[PDF_DEBUG] Failed to write debug HTML:', err);
    }
  }

  console.log('[PDF] Launching Playwright Chromium');
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ];
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs,
    });
    console.log('[PDF] Playwright browser launched', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
    });
  } catch (launchErr) {
    console.error('[PDF] Playwright launch failed', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      error: launchErr?.message,
      stack: launchErr?.stack,
    });
    throw Object.assign(launchErr, { reason: 'PDF_LAUNCH' });
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.setContent(html, { waitUntil: 'load', timeout: 90000 });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    timeout: 60000,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="
        width:100%;
        font-size:7px;
        color:#6b7280;
        padding:1px 4px;
        line-height:1.2;
        font-family: Arial, sans-serif;
        display:flex;
        justify-content:flex-end;
        align-items:center;
        box-sizing:border-box;
      ">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    `,
    margin: {
      top: '12mm',
      bottom: '10mm',
      left: '10mm',
      right: '10mm',
    },
  });
  await browser.close();
  const marginUsed = { top: '12mm', bottom: '10mm', left: '10mm', right: '10mm' };
  console.log('[PDF] PDF generated successfully, margins:', marginUsed);
  return pdfBuffer;
};


// Initialize Email Transporter (Outlook / SMTP)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'hotmail', // 'hotmail' works for outlook.com
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- Mail mode & recipients (ENV-only, single source of truth) ---
const MAIL_MODE = (process.env.MAIL_MODE || 'SANDBOX').trim().toUpperCase();
const VALID_MODES = ['SANDBOX', 'PROD'];

function getEmailRecipients() {
  const mode = VALID_MODES.includes(MAIL_MODE) ? MAIL_MODE : 'SANDBOX';
  const parseList = (raw) => (raw ? raw.split(',').map((e) => e.trim()).filter(Boolean) : []);
  if (mode === 'SANDBOX') {
    const toRaw = process.env.MAIL_TO_SANDBOX?.trim();
    const to = parseList(toRaw);
    const cc = parseList(process.env.MAIL_CC_SANDBOX?.trim());
    if (!to.length) {
      throw new Error('MAIL_MODE=SANDBOX requires MAIL_TO_SANDBOX to be set');
    }
    return { to, cc };
  }
  if (mode === 'PROD') {
    const toRaw = process.env.MAIL_TO_PROD?.trim();
    const to = parseList(toRaw);
    const cc = parseList(process.env.MAIL_CC_PROD?.trim());
    if (!to.length) {
      throw new Error('MAIL_MODE=PROD requires MAIL_TO_PROD to be set');
    }
    return { to, cc };
  }
  throw new Error(`Invalid MAIL_MODE: ${MAIL_MODE}. Use SANDBOX or PROD.`);
}

// --- API Endpoints ---

// 1. Translation Endpoint
app.post('/api/translate', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  try {
    const translation = await createTextCompletion({
      systemPrompt: 'You are a professional Hebrew-to-English legal translator. Respond with the translated text only.',
      userPrompt: text,
      temperature: 0.1,
    });
    res.json({ translation });
  } catch (error) {
    console.error('Translation API Error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// 2. Policy Extraction Endpoint
app.post('/api/extract-policy', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { image, mimeType } = req.body;
  try {
    const documentText = await getDocumentText(image, mimeType);
    if (!documentText) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, DOCX, or text files.' });
    }

    // Try AI-based extraction when OpenAI is configured, but always fall back to
    // a deterministic heuristic parser so the endpoint remains useful even
    // without an API key or when the model fails.
    let data = {
      insuredName: '',
      marketRef: '',
      lineSlipNo: '',
      certificateRef: '',
      policyPeriodStart: '',
      policyPeriodEnd: '',
      retroStart: '',
      retroEnd: '',
    };
    if (openai) {
      try {
    const responseText = await createTextCompletion({
          systemPrompt:
            'Extract insurance metadata from the provided document text. Always respond with a JSON object: {"insuredName":"","marketRef":"","lineSlipNo":""}. Use empty strings when data is missing. If multiple candidates exist, pick the value that most closely matches policy metadata.',
      userPrompt: `Document text:\n${truncateText(documentText)}`,
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
    });
        data = parseJsonSafely(responseText, data);
      } catch (aiError) {
        console.error('Policy AI extraction failed, falling back to heuristic only:', aiError);
      }
    } else {
      console.warn(
        '[extract-policy] OpenAI client not configured – using heuristic extraction only.',
      );
    }

    const fallback = fallbackPolicyExtraction(documentText);
    const merged = {
      insuredName: data.insuredName || fallback.insuredName || '',
      marketRef: fallback.marketRef || data.marketRef || '',
      lineSlipNo: fallback.lineSlipNo || data.lineSlipNo || '',
      certificateRef: fallback.certificateRef || data.certificateRef || '',
      policyPeriodStart: data.policyPeriodStart || fallback.policyPeriodStart || '',
      policyPeriodEnd: data.policyPeriodEnd || fallback.policyPeriodEnd || '',
      retroStart: data.retroStart || fallback.retroStart || '',
      retroEnd: data.retroEnd || fallback.retroEnd || '',
    };
    console.log('[extract-policy] merged result:', merged);
    res.json({
      insuredName: merged.insuredName,
      marketRef: merged.marketRef,
      lineSlipNo: merged.lineSlipNo,
      certificateRef: merged.certificateRef,
      policyPeriodStart: merged.policyPeriodStart,
      policyPeriodEnd: merged.policyPeriodEnd,
      retroStart: merged.retroStart,
      retroEnd: merged.retroEnd,
    });
  } catch (error) {
    console.error('Policy extraction error:', error);
    res.status(500).json({ error: 'Failed to extract policy data' });
  }
});

// 3. Text Refinement Endpoint
app.post('/api/refine-text', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { text, mode } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const effectiveMode =
    mode === 'REWRITE' || mode === 'SAFE_POLISH' ? mode : 'SAFE_POLISH';

  try {
    if (effectiveMode === 'SAFE_POLISH') {
      const refined = await createTextCompletionWithDiagnostics(
        {
          systemPrompt: [
          'You are rewriting an existing Hebrew legal text.',
          '',
          'Your task is to improve the wording only:',
          '- Make the Hebrew professional, formal, and suitable for a legal/insurance report.',
          '- Improve clarity, flow, and conciseness.',
          '- Remove repetitions and informal language.',
          '- Improve grammar, syntax, and punctuation where needed.',
          '- Keep the text in Hebrew.',
          '',
          'STRICT CONSTRAINTS (must not be violated):',
          '- Do NOT add new facts, arguments, assumptions, or conclusions.',
          '- Do NOT remove existing factual information.',
          '- Do NOT change names of parties, people, institutions, locations, or case references.',
          '- Do NOT change numbers, amounts, dates, percentages, or measurements.',
          '- Do NOT change the level of certainty, responsibility, liability, or legal stance.',
          '- Do NOT soften or strengthen claims.',
          '- Do NOT interpret or analyze risk.',
          '',
          'This is a linguistic refinement only.',
          'The meaning, facts, and legal substance must remain identical to the original text.',
        ].join('\n'),
        userPrompt: text,
        temperature: 0.35,
        },
        { endpoint: 'refine-text' },
      );
      return res.json({ refined, mode: effectiveMode });
    }

    // REWRITE mode – aggressive wording changes with strict fact protection.
    const { protectedText, map } = protectHebrewFacts(text);

    const refinedProtected = await createTextCompletionWithDiagnostics(
      {
        systemPrompt: [
        'You are rewriting an existing Hebrew legal text.',
        '',
        'Your task is to significantly improve the wording while keeping all facts identical:',
        '- Make the Hebrew professional, formal, and suitable for a legal/insurance report.',
        '- Improve clarity, flow, and conciseness.',
        '- You may restructure sentences, split or merge sentences, and reorder phrases when it improves readability.',
        '- Replace informal or conversational wording with precise, formal legal Hebrew.',
        '- Preserve placeholders exactly as they appear (for numbers, dates, IDs, names, and Hebrew number-words).',
        '',
        'STRICT CONSTRAINTS (must not be violated):',
        '- Do NOT add new facts, arguments, assumptions, or conclusions.',
        '- Do NOT remove existing factual information.',
        '- Do NOT change the meaning of any factual statement.',
        '- Do NOT modify placeholders such as __NUM_1__, __NUMWORD_1__, __DATE_1__, __ID_1__, __MONEY_1__, __NAME_1__, etc.',
        '- Do NOT introduce new placeholders or delete existing ones.',
        '',
        'This is a linguistic rewrite only.',
        'The factual content, parties, and legal substance must remain identical to the original text.',
      ].join('\n'),
      userPrompt: protectedText,
      temperature: 0.65,
      },
      { endpoint: 'refine-text' },
    );

    const { restoredText, missingPlaceholders } = restoreHebrewFacts(
      refinedProtected,
      map,
    );

    if (missingPlaceholders.length > 0) {
      console.error('[HebrewRefine] Fact placeholders missing after rewrite', {
        missingPlaceholders,
      });
      return res
        .status(422)
        .json({
          refined: text,
          mode: effectiveMode,
          error: {
            code: 'FACT_PROTECTION_FAILED',
            message:
              'Refine operation was blocked because one or more factual placeholders were lost. The original text was kept.',
          },
        });
    }

    return res.json({ refined: restoredText, mode: effectiveMode });
  } catch (error) {
    const reason = error?.reason || 'AI_UNAVAILABLE';
    console.error('Refinement error', { reason, message: error?.message });
    res.status(500).json({ error: 'Failed to refine text', reason });
  }
});

// 3a. English Improvement Endpoint (post-translation polishing)
app.post('/api/improve-english', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const improved = await createTextCompletion({
      systemPrompt: [
        'You are an expert legal editor improving ENGLISH text for a legal/insurance report.',
        '',
        'Language & conventions:',
        '- Use British English spelling and legal drafting conventions.',
        '- Tone: Confident, direct, and formal.',
        '- Style intent: Relatable, considerate, understanding, formal, and showing interest.',
        '',
        'STRICT CONSTRAINTS (must not be violated):',
        '- Do NOT add, remove, or change any facts, events, or allegations.',
        '- Do NOT change names of parties, people, institutions, locations, case identifiers, claim numbers, or policy numbers.',
        '- Do NOT change numbers, monetary amounts, dates, times, percentages, or measurements.',
        '- Do NOT change the legal position, degree of certainty, responsibility, or liability expressed in the text.',
        '- Do NOT add commentary, disclaimers, meta-text, or explanations.',
        '',
        'You MAY:',
        '- Improve grammar, clarity, and sentence structure.',
        '- Adjust phrasing into polished British legal English.',
        '- Slightly reorder sentences only when it clearly improves readability without altering meaning.',
        '',
        'Output rules:',
        '- Return the improved text only.',
        '- Preserve the overall structure, paragraphs, and line breaks as much as reasonably possible.',
        '- Do NOT wrap the result in quotes or Markdown.',
        '- Do NOT introduce new bullet points, headings, or numbering that do not exist in the original.',
      ].join('\n'),
      userPrompt: text,
      temperature: 0.15,
    });

    return res.json({ improved: improved || text });
  } catch (error) {
    console.error('Improve English error', error);
    return res.status(500).json({ error: 'Failed to improve English' });
  }
});

// 3b. Hebrew report summary for follow-up reports (Update auto-summary)
app.post('/api/hebrew-report-summary', async (req, res) => {
  const user = ensureAuthenticated(req, res);
  if (!user) return;
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const truncated = truncateText(text, 6000);
    const summary = await createTextCompletion({
      systemPrompt: [
        'אתה משמש כעורך לשוני משפטי המסכם דיווח שהועבר כבר למבטחת.',
        '',
        'מטרה:',
        '- להפיק תקציר קצר בעברית משפטית, בפסקה אחת עד שתיים,',
        '- שישמש כפתיח לדיווח הבא באותו תיק.',
        '',
        'חוקי ברזל (אסור להפר):',
        '- אין להוסיף עובדות חדשות, צדדים חדשים, סכומים חדשים או טענות חדשות.',
        '- אין לשנות עובדות קיימות, תאריכים, סכומים, אחוזים או זהויות צדדים.',
        '- אין להחליש או לחזק טענות מעבר למה שמשתמע מהטקסט המקורי.',
        '- אין לבצע ניתוח משפטי חדש או הערכת סיכון חדשה – רק לסכם מה כבר דווח.',
        '',
        'סגנון:',
        '- ניסוח משפטי, רשמי ותמציתי.',
        '- לא יותר מ–2 פסקאות קצרות.',
        '- להימנע מפרטים טכניים מיותרים – להתמקד במהות ההתפתחויות שהוצגו בדו״ח.',
        '',
        'פורמט פלט:',
        '- פתח תמיד במשפט הפתיחה: "כזכור, בדיווחים האחרונים עודכן כי ...".',
        '- לאחר מכן המשך בתקציר חופשי אך קצר וברור.',
        '- החזר רק את הטקסט הסופי, ללא כותרות, בולטים או הסברים צדדיים.',
      ].join('\\n'),
      userPrompt: truncated,
      temperature: 0.2,
    });

    let finalText = (summary || '').trim();
    if (!finalText) {
      return res.json({
        summary:
          'כזכור, בדיווחים האחרונים עודכן כי התיק מצוי בטיפול שוטף, ללא פרטים נוספים זמינים לתקציר בשלב זה. נא לעבור על התקציר ולהתאימו לפי הצורך.',
      });
    }

    if (!finalText.startsWith('כזכור, בדיווחים האחרונים')) {
      finalText = `כזכור, בדיווחים האחרונים עודכן כי ${finalText}`;
    }

    // אם התקציר קצר מאוד או כללי, נוסיף הנחיית ביקורת בסוף.
    if (finalText.length < 80 && !finalText.includes('נא לעבור על התקציר ולהתאימו לפי הצורך')) {
      finalText = `${finalText.trim()} נא לעבור על התקציר ולהתאימו לפי הצורך.`;
    }

    // Safety: hard cap on length on the way out as well
    if (finalText.length > 1200) {
      finalText = finalText.slice(0, 1200);
    }

    return res.json({ summary: finalText });
  } catch (error) {
    console.error('Hebrew report summary error', error);
    return res.status(500).json({ error: 'Failed to generate Hebrew report summary' });
  }
});

// 4. Analyze File
app.post('/api/analyze-file', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { fileBase64, mimeType, userPrompt } = req.body;
  try {
    const documentText = await getDocumentText(fileBase64, mimeType, { ocrPages: Infinity, forceOcr: true });
    if (!documentText) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, DOCX, or text files.' });
    }
    const result = await createTextCompletion({
      systemPrompt: 'You are a legal analyst for the Lior Perry Report Builder. Answer in Hebrew using clear, structured language.',
      userPrompt: `Instruction: ${userPrompt}\n\nDocument Content:\n${truncateText(documentText)}`,
      temperature: 0.3,
    });
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze file' });
  }
});

const TONE_RISK_PROMPT_VERSION = 'tone-risk-v1';

const ASSISTANT_SYSTEM_PROMPT = `
You are the internal “Smart Assistant” for the Lior Perry Report Builder.
You help users (lawyers, finance, admin/ops) work correctly and safely inside the app.

You NEVER:
- edit, draft, or rewrite report content.
- receive, store, or reason over the full Hebrew/English bodies of reports.
- guess facts about a specific case.
- give legal advice or coverage opinions.

You ONLY:
- explain how to use the system safely and efficiently.
- explain which tools to use when, and in what order.
- highlight risks and “gotchas” in the current STEP / SCREEN / ROLE context.

INPUT YOU RECEIVE
-----------------
You only see:
- intent: what the user clicked (one of a fixed enum of intents).
- context: { step (1|2|3), role, screen, section? }.
- reportMeta:
  - hebrewApproved: whether Hebrew was formally approved for translation.
  - hasTranslation: whether English translation exists.
  - translationOutdated: whether Hebrew changed since last translation.
  - toneRiskRun: whether Tone & Risk check has been run at least once.
  - expensesLastUpdatedAt?: last timestamp when an expenses snapshot/table was injected.

You NEVER see:
- the actual Hebrew or English text of the report.
- attached files, invoices, medical opinions, or PDFs.

If you need information that is not in the meta/context:
- Do NOT invent it.
- Say explicitly: "צריך לבדוק במסך עצמו" or "המערכת לא מציגה כאן את התוכן, רק סטטוס כללי".

ROLES & STEPS
-------------
- Roles:
  - LAWYER: drafting Hebrew, legal strategy, final legal responsibility for wording.
  - FINANCE: manages expenses tables, invoices, and financial metadata only.
  - OPS: operational / sub‑admin helper (logistics, coordination, light edits).
  - ADMIN: Lior / central admin – translation, English polishing, sending to insurer.

- Steps (screens):
  - Step 1 – Setup / Case metadata & structure.
  - Step 2 – Draft / Hebrew content + AI tools + translation prep.
  - Step 3 – Preview & Send / PDF preview, exports, email to insurer.

TOOLS – SOURCE OF TRUTH
-----------------------
Explain and distinguish tools EXACTLY as follows:

- Paperclip (AI extraction / medical analysis):
  - Purpose: extract structured facts from uploaded documents into specific sections
    (especially medical complaints, expert opinions, policy/expenses extraction).
  - Not for: overall strategy, inventing facts, deciding liability, or replacing full legal drafting.
  - Always treat its output as a draft that the lawyer must review and edit.

- שפר ניסוח בעברית (Hebrew Rewrite – SAFE_POLISH / REWRITE):
  - The ONLY tool that rewrites Hebrew body text directly.
  - SAFE_POLISH: gentle polish – improves wording, flow, grammar, keeps structure.
  - REWRITE: more noticeable restructure of sentences and style, but MUST keep
    all facts, dates, amounts, names and legal stance identical.
  - Fact protection: numbers, dates, names (including Hebrew number‑words) are
    protected by placeholders; if something looks unsafe the system blocks the change.

- בדיקת ניסוח (הערות בלבד) – Hebrew Style Review:
  - Review‑only tool. It NEVER changes text automatically.
  - Purpose: highlight style issues (slang, mixed fact/opinion, unclear phrasing).
  - Output: list of comments per section; user must manually edit the text.

- Tone & Risk (למבטחת):
  - Risk‑only tool. It NEVER changes text automatically.
  - Purpose: flag formulations that may broaden legal/coverage exposure to insurer
    (over‑confident statements, absolute language, mixed positions).
  - Output: issues with excerpts and suggestions; user must decide what to change.

- Translate + Improve English:
  - Translate: Hebrew → English into translatedContent, based on approved Hebrew only.
  - Improve English: polishes English wording (British legal English) AFTER translation.
  - These tools NEVER touch the Hebrew content and do NOT re‑summarize the case.

GUARDRAILS
----------
Absolute rules:
- Do NOT invent new features, buttons, or flows that do not exist in the app.
- If the intent suggests something that does not exist yet, answer in general
  operational terms and say clearly that this is a recommended workflow, not
  an existing automatic feature.
- Always distinguish between:
  - tools that CHANGE text (only “שפר ניסוח בעברית”), and
  - tools that only REVIEW / CHECK (Hebrew Style Review, Tone & Risk).
- Never promise that a check was actually run – only refer to the meta:
  - toneRiskRun=false → “נראה שעדיין לא בוצעה כאן בדיקת Tone & Risk”.
  - translationOutdated=true → “האנגלית מבוססת על גרסת עברית ישנה יותר”.
- No legal advice: do NOT tell the user מה כדאי לטעון משפטית, רק איך לעבוד נכון עם הכלים.

OUTPUT FORMAT
-------------
You must ALWAYS return:
- title: short Hebrew title (max ~10 words), operational.
- bullets: 3–6 short Hebrew bullets (1–2 lines each), practical “what to do”.
- warning?: optional 1–2 line warning when there is real risk (e.g. sending outdated
  translation, skipping Tone & Risk, very old expenses).
- nextSuggestion?: optional 1–2 line suggestion for the next best action in the app
  (e.g. “לעבור לשלב 2 ולהריץ בדיקת Tone & Risk על הסעיפים המרכזיים.”).

Style:
- Hebrew, operational, concise, and calm.
- Focus on “איך לעבוד נכון במסך הזה”, not on legal theory.
- Prefer formulations like “מומלץ”, “כדאי”, “שימי לב ש–”.
- When there is risk or inconsistency in meta, start one bullet with “שימי לב”.
`.trim();

// 4a. Analyze Dental Expert Opinion (RAG over dental knowledge)
const isValidDentalFormat = (text) => {
  if (typeof text !== 'string') return false;
  // חייב לכלול לפחות סעיף 1 וסעיף 9 בתחילת שורה/לאחר שורה חדשה
  const has1 = /(^|\n)\s*1\.\s/.test(text);
  const has9 = /(^|\n)\s*9\.\s/.test(text);
  if (!has1 || !has9) return false;

  // בדיקה בסיסית לכך שרוב הסעיפים 1–9 מופיעים (לא חייב מושלם, רק gating רך)
  const matches = text.match(/(^|\n)\s*([1-9])\.\s/mg);
  const count = matches ? matches.length : 0;
  return count >= 5;
};

app.post('/api/analyze-dental-opinion', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { fileBase64, mimeType } = req.body || {};
  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: 'Missing file or mimeType' });
  }

  const uploadSizeBytes = Math.round((fileBase64?.length || 0) * 0.75);
  console.log(`[analyze-dental-opinion] upload_received size_bytes=${uploadSizeBytes} mime=${mimeType}`);

  try {
    // Expose a stable prompt version header for debugging / verification
    res.set('X-Dental-Prompt-Version', 'dental-v-final');

    const startedAt = Date.now();

    const { text: documentText, lowConfidenceDocument } = await getDocumentTextForAnalysis(fileBase64, mimeType);
    if (!documentText) {
      console.log('[analyze-dental-opinion] getDocumentTextForAnalysis textLength=0 reason=INVALID_DOCUMENT');
      return res.status(200).json({
        success: false,
        reason: 'INVALID_DOCUMENT',
        result: '',
      });
    }

    let dentalLexicon = '';
    let dentalPlaybook = '';
    let dentalStyleExemplar = '';
    try {
      dentalLexicon = fs.readFileSync(DENTAL_LEXICON_PATH, 'utf-8');
    } catch (err) {
      console.warn(
        '[analyze-dental-opinion] DentalLexicon.he.md not found or unreadable – continuing without lexicon.',
      );
    }
    try {
      dentalPlaybook = fs.readFileSync(DENTAL_PLAYBOOK_PATH, 'utf-8');
    } catch (err) {
      console.warn(
        '[analyze-dental-opinion] DentalPlaybook.he.md not found or unreadable – continuing without playbook.',
      );
    }
    try {
      dentalStyleExemplar = fs.readFileSync(DENTAL_STYLE_EXEMPLAR_PATH, 'utf-8');
    } catch (err) {
      console.warn(
        '[analyze-dental-opinion] DentalStyleExemplar.he.md not found or unreadable – continuing without style exemplar.',
      );
    }

    const systemPrompt = `

אתה מנוע AI ייעודי לניתוח חוות דעת רפואיות בתחום רפואת השיניים בלבד.

המטרה שלך:
לסכם ולנתח חוות דעת דנטלית לצורך דיווח משפטי/ביטוחי, באופן מקצועי, מדויק, ניטרלי ומובנה.
הפלט צריך להיראות כמו טקסט דיווח רציף ומוכן לשליחה לחברת ביטוח, בסגנון עברי משפטי‑ביטוחי כפי שמקובל בדוחות מומחה לביטוח.


====================
1) Guardrails – כללים מחייבים
====================
- אסור לך להוסיף ידע רפואי חיצוני, אבחנות נוספות, טיפולים, בדיקות או נזקים שלא מופיעים בחוות הדעת.
- אסור לך לאבחן מחדש או לשנות אבחנות קיימות; עליך להסתמך רק על האמור במפורש בחוות הדעת.
- אסור לך לקבוע אחריות, רשלנות, הפרת חובות חקוקות או כל מסקנה משפטית עצמאית מעבר למה שנכתב במסמך.
- אם פרט מסוים (שן, אזור, תאריך, סוג בדיקה, המלצה, עלות, נכות) אינו מופיע במפורש בחוות הדעת – עליך לכתוב במפורש “לא צוין בחוות הדעת”, ולא לנסות להשלים אותו מהקשר.
- כל הניתוח והניסוח מבוססים אך ורק על הטקסט שסופק בחוות הדעת הרפואית.
- אם קיימת סתירה בין DentalPlaybook/DentalLexicon לבין הכללים והחוזים בפרומפט זה – עליך לפעול לפי הכללים בפרומפט זה.


====================
2) Style Contract – סגנון דיווח ביטוחי‑משפטי
====================
- הפלט חייב להיות בעברית, בגוף שלישי, ובדיוק במבנה סעיפים ממוספרים 1–9 (המפורט ב‑Output Contract), ללא הוספת סעיפים, כותרות או נספחים אחרים.
- אין להשיב כרשימות יבשות בלבד: בכל סעיף נדרש טקסט רציף, מנוסח כפסקה או מספר פסקאות מלאות, ולאחר מכן ניתן להוסיף רשימות נקודות.
- בכל סעיף יש להשתמש בביטויים משפטיים‑ביטוחיים כגון “על פי חוות הדעת…”, “בחוות הדעת צוין כי…”, “המומחה מציין כי…”, “נקבע כי…”, “בהתאם לאמור במסמך…”.
- הסגנון צריך להיות עקבי עם דוגמת דיווח ביטוחי‑משפטי (Style Exemplar): פסקאות פתיחה, משפטי מעבר (“עוד צוין כי…”, “בנוסף צוין כי…”) ורשימות “בין היתר” עבור פירוט ממצאים.
- יש להשתמש תמיד במונח "המטופלת" ולא במונחים חלופיים בסגנון שונה; אם בניסוח הראשוני מופיע מונח אחר – הפלט נחשב שגוי וחובה לנסח מחדש עד שאין אף מופע שלו.
- אסור להוסיף תגיות טכניות, סוגריים מרובעים או מטה‑דאטה; הפלט חייב להיות טקסט דיווח רציף בלבד.

פתיח קשיח לפני סעיף 1 (Template A/B):
- הפלט חייב תמיד להתחיל במשפט פתיחה אחד לפני סעיף 1, באחת משתי התבניות הבאות בלבד (ללא פרפרזות וללא שינויי נוסח):
  - Template A – כאשר גם שם המומחה וגם תחום המומחיות מופיעים בחוות הדעת:
    "התובעת תמכה את כתב התביעה בחוות דעת רפואית מטעם ד\"ר {שם} – מומחה ל{תחום המומחיות}, אשר בחן את החומר הרפואי, ביצע בדיקות רלוונטיות והציג ממצאים וקביעות כמפורט להלן."
  - Template B – כאשר שם המומחה ו/או תחום המומחיות אינם מופיעים במפורש בחוות הדעת:
    "התובעת תמכה את כתב התביעה בחוות דעת רפואית מטעם מומחה בתחום רפואת השיניים (השם/תחום המומחיות לא צוינו בחוות הדעת), אשר בחן את החומר הרפואי והציג ממצאים וקביעות כמפורט להלן."
- עליך לבחור ב‑Template A כאשר ניתן לזהות מתוך חוות הדעת גם שם וגם תחום מומחיות, וב‑Template B כאשר אחד מהם או שניהם אינם מופיעים במפורש.
- לאחר משפט הפתיחה יש להתחיל מיד את סעיף 1 במבנה 1–9, ללא טקסט חוצץ נוסף בין משפט הפתיחה לבין "1. על פי חוות הדעת, המומחה הסתמך על:".


====================
3) Output Contract – מבנה, פירוט ועומק (חובה)
====================

3.1 מבנה סעיפים 1–9 (פורמט פלט)
---------------------------------
עליך להחזיר את הפלט במבנה הבא, ובדיוק בסדר סעיפים זה:

1. על פי חוות הדעת, המומחה הסתמך על:
2. הרקע הרפואי והטיפולי על-פי חוות הדעת:
3. ממצאים רפואיים – מצב הפה לאחר הטיפול

   - ממצאים קליניים

   - ממצאים רדיוגרפיים

4. אבחנות וקביעות רפואיות
5. היבטים תיעודיים והסכמה מדעת
6. תחזוקה פריודונטלית והכנה לטיפול
7. תוכנית טיפול מתקנת ועלויות
8. נכות רפואית
9. סיכום

אין לשנות את כותרות הסעיפים, אין לשנות את המספור, ואין להוסיף סעיפים חדשים.


3.2 Extraction Rules – שיניים, אזורים, שתלים ובדיקות
-----------------------------------------------------
- אם בחוות הדעת מופיעים מספרי שיניים (FDI 11–48 או Universal #1–#32) או תיאורי אזורים (לסת עליונה/תחתונה, רבעים, קדמיות/אחוריות, ימני/שמאלי) – חובה לשלב אותם בפלט במפורש, בתוך הטקסט ובתוך רשימות הנקודות.
- אסור להשתמש בניסוחים כלליים בלבד כמו “שיניים שונות”, “אזורים בפה”, “ממצאים דנטליים” כאשר בטקסט המקורי מופיעים מספרי שיניים או אזורים ספציפיים.
- חובה לשמר את שיטת המספור כפי שמופיעה במסמך (FDI או Universal) בלי להמיר בין שיטות ובלי לשנות את המספרים.
- אם בחוות הדעת מופיעים שתלים, גשרים, כתרים, אזורי לסת (עליונה/תחתונה), או תיאורי רבעים/צדדים – עליך לציין אותם במפורש בפלט (לדוגמה: “שתלים באזור 35–37”, “גשר בלסת העליונה באזורים 13–23”).
- אם בחוות הדעת מופיעים תאריכי בדיקות (למשל תאריכי CT/סטטוס/צילומים) או סוגי בדיקות (“CT”, “סטטוס”, “צילום פנורמי”) – חובה לשלבם בתוך סעיף הממצאים ובמקום המתאים בסעיפים האחרים.
- עליך להקפיד שמספרי שיניים, טווחים, אזורים, שתלים, גשרים, ותאריכי בדיקות יופיעו בפלט בדיוק כפי שנכתבו בחוות הדעת (ללא שינוי פורמט, קיצור או עיגול).


3.3 Depth Rules – עומק מינימלי כמותי
------------------------------------
- סעיפים 1–4 ו‑9:
  - כל אחד מהסעיפים 1, 2, 3 (פתיחת סעיף 3 לפני תתי‑הכותרות), 4 ו‑9 חייב לכלול לפחות 5 משפטים רציפים של טקסט נרטיבי, לפני כל רשימת נקודות.
  - אם יש פחות חומר בחוות הדעת, עליך להשתמש בכל המידע הזמין, לפרוס אותו לכמה משפטים נפרדים ככל האפשר, אך אינך רשאי להמציא מידע חדש.

- סעיף 3 – ממצאים קליניים ורדיוגרפיים:
  - תחת תת‑הכותרת "ממצאים קליניים":
    - חובה לפתוח במשפט תיאורי כגון: “בבדיקה הקלינית המתוארת בחוות הדעת מיום __ נמצאו, בין היתר: …”. אם התאריך לא מופיע, ציין במפורש שהתאריך לא צוין בחוות הדעת.
    - לאחר משפט הפתיחה יש להציג רשימת נקודות (bullets) מפורטת.
    - יש לשאוף ללפחות 6 bullets. אם בחוות הדעת יש פחות מ‑6 ממצאים קליניים נפרדים, פרט את כולם כלשונם (אל תמציא ממצאים נוספים).
    - בכל bullet יש לשלב, ככל שקיים בטקסט, לפחות אחד מהפרטים הבאים: מספר שן/קבוצת שיניים, אזור בפה/לסת, תאריך בדיקה, או סוג בדיקה/ביקור.
  - תחת תת‑הכותרת "ממצאים רדיוגרפיים":
    - חובה לפתוח במשפט תיאורי כגון: “בחוות הדעת תוארו ממצאים רדיוגרפיים, וביניהם: …” או “בבדיקות ההדמיה (CT/סטטוס/צילומים) מיום __ צוין, בין היתר: …”. אם התאריך לא מופיע, ציין במפורש שהתאריך לא צוין בחוות הדעת.
    - לאחר משפט הפתיחה יש להציג רשימת נקודות מפורטת.
    - יש לשאוף ללפחות 6 bullets. אם בחוות הדעת יש פחות מ‑6 ממצאים רדיוגרפיים נפרדים, פרט את כולם כלשונם (אל תמציא ממצאים נוספים).
    - בכל bullet יש לשלב, ככל שקיים בטקסט, לפחות אחד מהפרטים הבאים: מספר שן/קבוצת שיניים, אזור בפה/לסת, תאריך בדיקה, או סוג הדמיה (CT/סטטוס/צילום פנורמי וכדומה).

- סעיפים 5–8:
  - כאשר בחוות הדעת יש מידע רלוונטי לסעיף (תיעוד/הסכמה, תחזוקה פריודונטלית, תוכנית טיפול, נכות):
    - כתוב לפחות 3 משפטים נרטיביים המסבירים את התוכן כפי שעולה מחוות הדעת.
    - לאחר מכן הוסף לפחות 3 bullets המפרטים נקודות מרכזיות (כגון סוגי מסמכים, סוגי טיפולים, שיעורי נכות, תנאי תחזוקה), תוך שימוש מדויק בפרטים המופיעים בחוות הדעת.
  - אם אין שום מידע רלוונטי בסעיף מסוים – כתוב במקום זאת “לא צוין בחוות הדעת”.


3.4 שימוש ב-factsJson לתיאור ליקויים/מחדלים טיפוליים
------------------------------------------------------
- עליך להתייחס ל-factsJson כאל מקור האמת היחיד לעובדות: אסור להוסיף עובדות חדשות שאינן מופיעות בו.
- נתוני המומחה לפתיח נלקחים אך ורק מ-factsJson.expert:
  - אם גם expert.name וגם expert.specialty אינם ריקים – חובה להשתמש בהם במדויק ב-Template A לפתיח.
  - בכל מצב אחר – חובה להשתמש ב-Template B, ללא ניסיון להשלים או לנחש פרטים חסרים.
- ליקויים/מחדלים טיפוליים נלקחים אך ורק מ-factsJson.treatment_breaches:
  - אם factsJson.treatment_breaches מכיל פריטים – עליך לשלבם בסעיף 4 ו/או סעיף 9 בתיאור עובדתי בנוסח כגון “בחוות הדעת צוין/נטען כי…”, מבלי להרחיב מעבר לנוסח העיקרי המופיע ב-treament_breaches.
  - אם factsJson.treatment_breaches ריק – חובה לכלול משפט מפורש בסעיף 4 או בסעיף 9 בנוסח:
    "לא צוין בחוות הדעת פירוט של מעשים או מחדלים טיפוליים המיוחסים לרופא."


3.4 Negative Examples – מה אסור להחזיר
---------------------------------------
- אסור להחזיר סעיפים קצרים בסגנון “תוארו ממצאים דנטליים” או “הומלץ על טיפול” ללא פירוט מלא של אילו ממצאים ואיזה טיפולים, כל עוד מידע זה מופיע בחוות הדעת.
- אסור להחזיר סעיף 3 ללא רשימות נקודות מפורטות תחת "ממצאים קליניים" ו"ממצאים רדיוגרפיים".
- אסור להשמיט מהפלט שיניים, שתלים, גשרים, אזורים או בדיקות (כולל תאריכים וסוגי הדמיה) שמופיעים במפורש בחוות הדעת.
- אסור להכליל או לעדן את המידע לרמת “בעיות בשיניים” או “ממצאים כלליים בפה” כאשר יש פירוט של שיניים ואזורים בקלט; עליך לשמר את הפירוט.


עליך להשתמש בידע המצורף (DentalLexicon.he.md, DentalPlaybook.he.md) רק כעזר להבנת המונחים והקשר רפואי‑דנטלי, אך לא כמקור למידע חדש שלא מופיע בטקסט חוות הדעת.
יש לחקות את סגנון ה‑Style Exemplar (DentalStyleExemplar.he.md) במבנה הפסקאות, בעומק הפירוט ובמשפטי המעבר, אך אסור להעתיק ממנו תוכן רפואי קונקרטי שאינו מופיע בחוות הדעת הנוכחית.

`.trim();

    const originalLength = documentText.length;
    const truncated = truncateText(documentText);
    const truncatedLength = truncated.length;

    // PASS 1 – הפקת עובדות מובנות בפורמט JSON בלבד
    const factsSystemPrompt = `
אתה מנוע לעיבוד חוות דעת דנטליות שתפקידו להפיק עובדות מובנות בלבד.
עליך להחזיר אך ורק JSON תקין בפורמט הבא (וללא טקסט נוסף):
{
  "expert": { "name": string | null, "specialty": string | null },
  "sources": string[],
  "timeline": string[],
  "teeth_mentions": [{ "system": "FDI" | "UNIVERSAL" | null, "tooth_or_range": string, "context": string }],
  "clinical_findings": string[],
  "radiographic_findings": [{ "modality": string | null, "date": string | null, "finding": string, "teeth": string | null }],
  "diagnoses": string[],
  "documentation_consent": string[],
  "perio_maintenance": string[],
  "corrective_plan": string[],
  "costs": string[],
  "disability": string[],
  "treatment_breaches": string[],
  "unknowns": string[]
}
עליך להשתמש רק במידע המופיע במפורש בחוות הדעת, ללא המצאה.
אם שדה מסוים איננו מופיע בחוות הדעת – השאר אותו ריק ([], null) או הוסף תיאור מתאים ל-"unknowns".
יש להקפיד שמספרי שיניים, טווחים, אזורים, שתלים, גשרים, ותאריכי בדיקות יישמרו ב-JSON בדיוק כפי שנכתבו במסמך המקורי.
בעת חילוץ expert.name ו-expert.specialty עליך לחפש באופן יזום בכל חלקי הטקסט, לרבות כותרת המסמך, חתימה, שורות פתיחה, אזכורים של "ד\"ר", ביטויים כמו "מומחה ב...", "מומחה ל...", ו/או תארים כגון DDS/DMD או "מומחה לשיקום הפה/פריודונטיה/אנדודונטיה" וכדומה.
יש למלא treatment_breaches רק בביקורת/כשל/מחדלים טיפוליים שמופיעים במפורש בחוות הדעת (למשל ניסוחים כמו "לא בוצע", "לא תועד", "לא הוסבר", "טיפול לקוי", "סטייה מהסטנדרט", "התרשלות"). אם אין ביקורת כזו – השאר treatment_breaches כ-[] (ריק).
`.trim();

    const factsUserPrompt = `טקסט חוות דעת דנטלית לחילוץ עובדות:\n${truncated}`;

    const factsRaw = await createTextCompletion({
      systemPrompt: factsSystemPrompt,
      userPrompt: factsUserPrompt,
      temperature: 0,
    });

    const factsJson = parseJsonSafely(factsRaw, {
      expert: { name: null, specialty: null },
      sources: [],
      timeline: [],
      teeth_mentions: [],
      clinical_findings: [],
      radiographic_findings: [],
      diagnoses: [],
      documentation_consent: [],
      perio_maintenance: [],
      corrective_plan: [],
      costs: [],
      disability: [],
      treatment_breaches: [],
      unknowns: [],
    });

    // Lightweight sanity log – no PHI, רק סטטוס כללי של החילוץ
    console.info('[dental facts check]', {
      expertName: factsJson?.expert?.name || null,
      expertSpecialty: factsJson?.expert?.specialty || null,
      breachesCount: Array.isArray(factsJson?.treatment_breaches)
        ? factsJson.treatment_breaches.length
        : 0,
      teethMentionsCount: Array.isArray(factsJson?.teeth_mentions)
        ? factsJson.teeth_mentions.length
        : 0,
    });

    // Destructure key fields for explicit template filling in PASS 2
    const expertName =
      factsJson && typeof factsJson === 'object' && factsJson.expert
        ? factsJson.expert.name || null
        : null;
    const expertSpecialty =
      factsJson && typeof factsJson === 'object' && factsJson.expert
        ? factsJson.expert.specialty || null
        : null;
    const treatmentBreaches = Array.isArray(factsJson.treatment_breaches)
      ? factsJson.treatment_breaches.filter((b) => typeof b === 'string' && b.trim().length > 0)
      : [];

    // PASS 2 – ניסוח דיווח 1–9 בסגנון הביטוחי‑משפטי תוך שימוש ב‑factsJson + context בלבד (Template Filling)
    const userPrompt = [
      '=== מילון מונחים דנטלי ===',
      dentalLexicon || '(לא סופק מילון דנטלי)',
      '',
      '=== Playbook ניתוח חוות דעת דנטלית ===',
      dentalPlaybook || '(לא סופק Playbook דנטלי)',
      '',
      '=== דוגמת סגנון רצויה (Style Exemplar) ===',
      dentalStyleExemplar || '(לא סופקה דוגמת סגנון דנטלית)',
      '',
      '=== נתוני מומחה שחולצו (expertName, expertSpecialty) מתוך factsJson.expert ===',
      JSON.stringify({ expertName, expertSpecialty }),
      '',
      '=== ליקויים/מחדלים טיפוליים שחולצו (treatment_breaches) מתוך factsJson.treatment_breaches ===',
      JSON.stringify(treatmentBreaches),
      '',
      '=== JSON מלא של עובדות שחולצו מהחוות הדעת (factsJson) – יש להסתמך על factsJson כמקור ראשון לכל הפרטים, ולהיעזר בטקסט המקורי רק לצורך ניסוח סגנוני ללא הוספת עובדות חדשות ===',
      JSON.stringify(factsJson),
      '',
      '=== טקסט חוות הדעת לניתוח (לשימוש משני בלבד) ===',
      truncated,
    ].join('\n');

    let result = await createTextCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.1,
    });

    if (!isValidDentalFormat(result)) {
      const userPromptFix = [
        'הפלט חייב להיות אך ורק במבנה 1–9. אל תוסיף טקסט אחר. החזר מחדש לפי המבנה.',
        '',
        userPrompt,
      ].join('\n');

      result = await createTextCompletion({
        systemPrompt,
        userPrompt: userPromptFix,
        temperature: 0,
      });

      if (!isValidDentalFormat(result)) {
        const durationMs = Date.now() - startedAt;
        console.info('[analyze-dental-opinion] invalid-format-after-retry', {
          status: 'INVALID_FORMAT',
          mimeType,
          originalLength,
          truncatedLength,
          durationMs,
        });
        return res
          .status(422)
          .json({ error: 'Model output did not match required format' });
      }
    }

    const durationMs = Date.now() - startedAt;
    console.info('[analyze-dental-opinion] success', {
      status: 'SUCCESS',
      mimeType,
      originalLength,
      truncatedLength,
      durationMs,
    });

    res.json({ success: true, result, lowConfidenceDocument: !!lowConfidenceDocument });
  } catch (error) {
    console.error('Dental opinion analysis failed:', error);
    let reason = 'AI_UNAVAILABLE';
    const msg = error && typeof error.message === 'string' ? error.message : String(error);
    if (/timeout|ETIMEDOUT|timed out/i.test(msg)) reason = 'TIMEOUT';
    return res.status(200).json({ success: false, reason, result: '' });
  }
});

// 4b. Medical Complaint Analysis
app.post('/api/analyze-medical-complaint', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const {
    fileBase64,
    mimeType,
    analysisType = 'CLAIM',
    expertCountMode: clientExpertCountMode = 'SINGLE',
    partyRole = 'PLAINTIFF',
    sectionKey,
    plaintiffName,
    insuredName,
    insurerName,
    reportSubject,
  } = req.body;
  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: 'Missing file or mimeType' });
  }
  const uploadSizeBytes = Math.round((fileBase64?.length || 0) * 0.75);
  console.log(`[analyze-medical-complaint] upload_received size_bytes=${uploadSizeBytes} mime=${mimeType}`);

  try {
    const { text: documentText, lowConfidenceDocument } = await getDocumentTextForAnalysis(fileBase64, mimeType);
    if (!documentText) {
      console.log('[analyze-medical-complaint] getDocumentTextForAnalysis textLength=0 reason=INVALID_DOCUMENT');
      return res.status(200).json({
        success: false,
        reason: 'INVALID_DOCUMENT',
        analysis: null,
        claimSummary: '',
      });
    }
    const shouldBuildMedicalAnalysis = analysisType !== 'EXPERT';
    const analysis = shouldBuildMedicalAnalysis ? await analyzeMedicalDocument(documentText) : null;
    let claimSummary = '';
    try {
      let resolvedExpertCountMode = clientExpertCountMode || 'SINGLE';
      if (analysisType === 'EXPERT' && !req.body.expertCountMode && documentText) {
        const names = new Set();
        const expertRegex = /(?:ד["']?ר|דר\.?|פרופ["']?\.?)\s+([^\s,]+)/g;
        let match;
        while ((match = expertRegex.exec(documentText)) !== null) {
          if (match[1]) names.add(match[1]);
          if (names.size >= 2) {
            resolvedExpertCountMode = 'MULTIPLE';
            break;
          }
        }
      }

      const selector = `
analysisType: ${analysisType}
expertCountMode: ${resolvedExpertCountMode || 'SINGLE'}
partyRole: ${partyRole || ''}

IMPORTANT:
Use ONLY the section in MASTER_PROMPT that matches these parameters.
Ignore all other sections completely.
Always write in Hebrew.
`.trim();

      const contextLines = [];
      if (sectionKey) contextLines.push(`SectionKey: ${sectionKey}`);
      if (partyRole) contextLines.push(`PartyRole: ${partyRole}`);
      if (plaintiffName) contextLines.push(`PartyName: ${plaintiffName}`);
      if (insuredName) contextLines.push(`Insured: ${insuredName}`);
      if (insurerName) contextLines.push(`Insurer: ${insurerName}`);
      if (reportSubject) contextLines.push(`Subject: ${reportSubject}`);

      const caseContextBlock = contextLines.length
        ? `CASE CONTEXT (DO NOT INVENT FACTS):\n${contextLines.join('\n')}\n\n` +
          `הקשר זה נועד לסייע בניסוח בלבד; כל העובדות והאירועים חייבים להילמד אך ורק מן הטקסט המצורף.\n\n`
        : '';

      const userPrompt = `${selector}\n\n${caseContextBlock}טקסט לניתוח:\n${truncateText(documentText)}`;
      claimSummary = await createTextCompletion({
        systemPrompt: MASTER_PROMPT,
        userPrompt,
        temperature: 0.0,
      });
    } catch (summaryError) {
      console.error('Claim summary generation failed:', summaryError);
    }

    // Lightweight validation for CLAIM/DEMAND factual background timelines.
    const CLAIM_SECTION_LABEL = 'Factual background – Statement of Claim';
    const DEMAND_LETTER_SECTION_LABEL = 'Factual background – Letter of Demand';

    const shouldValidateClaimSummary =
      !!claimSummary &&
      (analysisType === 'CLAIM' || analysisType === 'DEMAND') &&
      (sectionKey === CLAIM_SECTION_LABEL || sectionKey === DEMAND_LETTER_SECTION_LABEL);

    if (shouldValidateClaimSummary) {
      try {
        if (!isClaimSummaryAllowed(claimSummary, analysisType)) {
          console.warn('[claim-summary-validation] Invalid summary for', {
            analysisType,
            sectionKey,
          });
          // Force client-side fallback to structured analysis-based summary.
          claimSummary = '';
        }
      } catch (e) {
        console.warn('[claim-summary-validation] Validator error, keeping original summary', e);
      }
    }

    res.json({ success: true, analysis, claimSummary, lowConfidenceDocument: !!lowConfidenceDocument });
  } catch (error) {
    console.error('Medical complaint analysis failed:', error);
    let reason = 'AI_UNAVAILABLE';
    const msg = error && typeof error.message === 'string' ? error.message : String(error);
    if (/timeout|ETIMEDOUT|timed out/i.test(msg)) reason = 'TIMEOUT';
    return res.status(200).json({
      success: false,
      reason,
      analysis: null,
      claimSummary: '',
    });
  }
});

// 5. Extract Expenses Table (UPDATED to JSON)
app.post('/api/extract-expenses', async (req, res) => {
  const user = ensureAuthenticated(req, res);
  if (!user) return;
  const role = getUserRoleFromRequest(req);
  if (role !== 'FINANCE' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only FINANCE or ADMIN can extract expenses' });
  }
  const { fileBase64, mimeType } = req.body;
  try {
    const documentText = await getDocumentText(fileBase64, mimeType);
    if (!documentText) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, DOCX, or text files.' });
    }
    const responseText = await createTextCompletion({
      systemPrompt: `You extract expense tables from legal/financial reports. Always respond with JSON {"items":[{"date":"","description":"","amount":0,"currency":""}, ...]}. Use DD/MM/YYYY for dates. Amount must be numbers.`,
      userPrompt: `Document Content:\n${truncateText(documentText)}\n\nReturn structured expenses.`,
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
    });
    const parsed = parseJsonSafely(responseText, { items: [] });
    res.json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (error) {
    console.error("Expenses extraction error", error);
    res.status(500).json({ error: 'Failed to extract expenses' });
  }
});

// 0. Authentication
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = USERS.find(
      (u) => u.username === String(username) && u.password === String(password),
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const sessionId = createSessionId();
    const sessionPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    sessions.set(sessionId, sessionPayload);
    saveSessionsToFile();

    // Set HTTP-only cookie with the session id
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    });

    return res.json({ user: sessionPayload });
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      sessions.delete(sessionId);
      saveSessionsToFile();
    }
    res.cookie(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: new Date(0),
      path: '/',
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/me', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ user });
});

// 6. Tone & Risk analysis for Hebrew report body (pre-send review)
const TONE_RISK_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
const TONE_RISK_KINDS = [
  'ABSOLUTE_LANGUAGE',
  'OVERCONFIDENT_STATEMENT',
  'LEGAL_EXPOSURE',
  'INCONSISTENT_POSITION',
  'NON_PROFESSIONAL_TONE',
];

const isValidToneRiskIssue = (issue) => {
  if (!issue || typeof issue !== 'object') return false;
  const { id, sectionKey, severity, kind, message, excerpt } = issue;
  if (!id || typeof id !== 'string') return false;
  if (!sectionKey || typeof sectionKey !== 'string') return false;
  if (!message || typeof message !== 'string' || !message.trim()) return false;
  if (!excerpt || typeof excerpt !== 'string' || !excerpt.trim()) return false;
  if (!TONE_RISK_SEVERITIES.includes(severity)) return false;
  if (!TONE_RISK_KINDS.includes(kind)) return false;
  return true;
};

app.post('/api/analyze-tone-risk', async (req, res) => {
  const startedAt = new Date().toISOString();
  res.set('X-ToneRisk-Prompt-Version', TONE_RISK_PROMPT_VERSION);

  const makeBaseResponse = (overrides = {}) => ({
    ok: false,
    runAt: startedAt,
    promptVersion: TONE_RISK_PROMPT_VERSION,
    issues: [],
    meta: {
      sectionsSent: 0,
      charsBefore: 0,
      charsAfter: 0,
      truncatedSections: 0,
    },
    ...overrides,
  });

  try {
    const role = getUserRoleFromRequest(req);
    if (role !== 'ADMIN' && role !== 'LAWYER') {
      return res.status(403).json(
        makeBaseResponse({
          error: {
            code: 'AUTH',
            message: 'Only ADMIN or LAWYER can analyze tone & risk',
          },
        }),
      );
    }

    const { content } = req.body || {};
    if (!content || typeof content !== 'object') {
      return res.status(400).json(
        makeBaseResponse({
          error: {
            code: 'BAD_INPUT',
            message: 'content (sections map) is required',
          },
        }),
      );
    }

    const filteredEntries = Object.entries(content).filter(
      ([key, value]) =>
        typeof key === 'string' && typeof value === 'string' && value.trim(),
    );

    const sections = filteredEntries.map(([key, value]) => {
      const original = String(value);
      const truncated = truncateText(original, 6000);
      return {
        sectionKey: key,
        text: truncated,
        originalLength: original.length,
        truncatedLength: truncated.length,
      };
    });

    const meta = sections.reduce(
      (acc, s) => {
        acc.sectionsSent += 1;
        acc.charsBefore += s.originalLength;
        acc.charsAfter += s.truncatedLength;
        if (s.truncatedLength < s.originalLength) {
          acc.truncatedSections += 1;
        }
        return acc;
      },
      { sectionsSent: 0, charsBefore: 0, charsAfter: 0, truncatedSections: 0 },
    );

    if (!sections.length) {
      return res.json(
        makeBaseResponse({
          ok: true,
          meta,
          issues: [],
        }),
      );
    }

    const userPromptLines = sections.map(
      (s) =>
        `### Section: ${s.sectionKey}\n` +
        `טקסט:\n` +
        `${s.text}\n`,
    );

    const systemPrompt = `
אתה משמש כבודק Tone & Risk עבור דיווחים משפטיים בתחום הביטוח (שוק לויד'ס / לונדון).
מטרתך היא לסמן ניסוחים שעלולים להיות מוחלטים מדי, לא מקצועיים, או להרחיב יתר על המידה את החשיפה המשפטית של המבטחת.

חובה:
- לענות בעברית בלבד.
- להחזיר תשובה בפורמט JSON בלבד, ללא טקסט חופשי מסביב.
- לא לשנות את הטקסט בפועל, אלא רק להציע ניסוחים חלופיים.
- להיות ענייני, מאופק ומקצועי.

Guardrails נוספים:
- אין להוסיף עובדות, שמות, מספרים, תאריכים, אחוזים או מדידות שאינם מופיעים בטקסט.
- אין לשנות את רמת הוודאות, האחריות, החבות או העמדה המשפטית העולה מן הטקסט.
- כל הצעת ניסוח (suggestion) חייבת להיות שינוי מינימלי ("minimal edit") סביב ה-excerpt בלבד, ללא הוספת משפטים או פסקאות חדשות.
- השדה excerpt חייב להיות ציטוט מדויק של משפט/קטע מתוך הטקסט שסופק.

categories (kind):
- ABSOLUTE_LANGUAGE – ניסוח מוחלט מדי (לדוגמה: "ברור", "אין ספק", "בוודאות", "מוכח ש").
- OVERCONFIDENT_STATEMENT – הערכת סיכון או אחריות נחרצת מדי ללא הסתייגות.
- LEGAL_EXPOSURE – ניסוח שעלול להרחיב אחריות/חשיפה של המבטחת מעבר לנדרש.
- INCONSISTENT_POSITION – סתירה פנימית בין חלקים שונים בטקסט (למשל רמת סיכון שונה).
- NON_PROFESSIONAL_TONE – סגנון דיבורי / שיפוטי / לא מקצועי.

severity:
- INFO – הערה קלה בלבד.
- WARNING – רצוי לשנות לפני שליחה.
- CRITICAL – מומלץ מאוד לשנות לפני שליחה למבטחת.

תשובה בפורמט JSON בלבד, ללא הסברים נוספים, במבנה:
{
  "runAt": "ISO_TIMESTAMP",
  "issues": [
    {
      "id": "string",
      "sectionKey": "שם הסעיף בדיוק כפי שהתקבל",
      "severity": "INFO" | "WARNING" | "CRITICAL",
      "kind": "ABSOLUTE_LANGUAGE" | "OVERCONFIDENT_STATEMENT" | "LEGAL_EXPOSURE" | "INCONSISTENT_POSITION" | "NON_PROFESSIONAL_TONE",
      "message": "הסבר קצר בעברית מדוע הניסוח בעייתי",
      "excerpt": "המשפט / הפסקה המקוריים כפי שמופיעים בטקסט",
      "suggestion": "ניסוח חלופי זהיר ומקצועי יותר בעברית"
    }
  ]
}

אם אינך מוצא בעיות – החזר "issues": [].
`.trim();

    const userPrompt = userPromptLines.join('\n\n');

    const raw = await createTextCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.0,
    });

    const parsed = parseJsonSafely(raw, null);
    if (!parsed) {
      return res.status(500).json(
        makeBaseResponse({
          meta,
          error: {
            code: 'PARSE_FAILED',
            message: 'Tone & Risk response was not valid JSON',
          },
        }),
      );
    }

    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : null;
    const runAt =
      parsed && typeof parsed.runAt === 'string' ? parsed.runAt : startedAt;

    let validIssues = [];
    if (Array.isArray(rawIssues)) {
      validIssues = rawIssues.filter(isValidToneRiskIssue);
    }

    const schemaFailed =
      !Array.isArray(rawIssues) ||
      (Array.isArray(rawIssues) && rawIssues.length > 0 && validIssues.length === 0);

    if (schemaFailed) {
      return res.status(500).json(
        makeBaseResponse({
          runAt,
          meta,
          error: {
            code: 'SCHEMA_FAILED',
            message: 'Tone & Risk response did not match expected schema',
          },
        }),
      );
    }

    return res.json(
      makeBaseResponse({
        ok: true,
        runAt,
        meta,
        issues: validIssues,
        error: undefined,
      }),
    );
  } catch (error) {
    console.error('Tone & Risk analysis error:', error);
    return res.status(500).json(
      makeBaseResponse({
        error: {
          code: 'LLM_FAILED',
          message: 'Failed to analyze tone & risk',
        },
      }),
    );
  }
});

// 7. Hebrew professional style review (Hebrew body only, pre-send)
app.post('/api/review-hebrew-style', async (req, res) => {
  try {
    const role = getUserRoleFromRequest(req);
    if (role !== 'ADMIN' && role !== 'LAWYER') {
      return res.status(403).json({ error: 'Only ADMIN or LAWYER can review Hebrew style' });
    }

    const { content } = req.body || {};
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ error: 'content (sections map) is required' });
    }

    const sections = Object.entries(content)
      .filter(
        ([key, value]) =>
          typeof key === 'string' && typeof value === 'string' && value.trim(),
      )
      .map(([key, value]) => ({
        sectionKey: key,
        text: truncateText(value, 6000),
      }));

    if (!sections.length) {
      return res.json({ runAt: new Date().toISOString(), issues: [] });
    }

    const userPromptLines = sections.map(
      (s) =>
        `### Section: ${s.sectionKey}\n` +
        `טקסט:\n` +
        `${s.text}\n`,
    );

    const systemPrompt = `
אתה בודק סגנון מקצועי בעברית עבור דיווחים משפטיים בתחום הביטוח (שוק לויד'ס / לונדון).
מטרתך היא לסמן ניסוחים שאינם מתאימים לדיווח מקצועי למבטחת, ולהציע ניסוחים מדויקים, מאופקים וברורים יותר.

חשוב מאוד:
- לענות בעברית בלבד.
- לא לשנות טקסט בפועל, אלא רק להציע ניסוחים חלופיים.
- לשמור על טון מקצועי, מאופק וממוקד במבטחת (insurer-facing).

קטגוריות (category):
- SLANG_OR_INFORMAL – סלנג, ניסוח דיבורי או רגשי מדי.
- NON_LEGAL_REGISTER – סגנון שאינו משפטי/מקצועי מספיק (למשל שפה יומיומית במקום ניסוח משפטי).
- FACT_OPINION_MIX – ערבוב עובדות ודעות ללא הבחנה ברורה או ללא הסתייגות.
- INCONSISTENT_TERMS – שימוש לא עקבי במונחים (תובעת/תובע, מבוטחת/מבוטח, מבטחת/סוכן וכו').
- AMBIGUOUS_OR_OVERBROAD – ניסוח עמום, כללי מדי או רחב מדי שאינו חד-משמעי.
- GRAMMAR_OR_CLARITY – בעיות ניסוח/דקדוק/פיסוק שמקשות על הבהירות המקצועית.

severity:
- INFO – הערה קלה לשיפור, לא קריטית.
- WARNING – מומלץ לשפר לפני שליחה.
- CRITICAL – מומלץ מאוד לשנות לפני שליחה למבטחת.

השב בפורמט JSON בלבד, ללא הסברים נוספים, במבנה המדויק הבא:
{
  "runAt": "ISO_TIMESTAMP",
  "issues": [
    {
      "id": "string",
      "sectionKey": "שם הסעיף בדיוק כפי שהתקבל",
      "severity": "INFO" | "WARNING" | "CRITICAL",
      "category": "SLANG_OR_INFORMAL" | "NON_LEGAL_REGISTER" | "FACT_OPINION_MIX" | "INCONSISTENT_TERMS" | "AMBIGUOUS_OR_OVERBROAD" | "GRAMMAR_OR_CLARITY",
      "message": "הסבר קצר בעברית מדוע הניסוח בעייתי בהקשר של דיווח למבטחת",
      "excerpt": "המשפט / הביטוי הבעייתי כפי שמופיע בטקסט",
      "suggestion": "ניסוח חלופי מקצועי, ברור וזהיר יותר בעברית"
    }
  ]
}

אם אינך מוצא בעיות – החזר "issues": [].
`.trim();

    const userPrompt = userPromptLines.join('\n\n');

    const responseText = await createTextCompletionWithDiagnostics(
      { systemPrompt, userPrompt, temperature: 0.0 },
      { endpoint: 'review-hebrew-style' },
    );

    const fallback = { runAt: new Date().toISOString(), issues: [] };
    const parsed = parseJsonSafely(responseText, fallback);

    const runAt =
      parsed && typeof parsed.runAt === 'string' ? parsed.runAt : fallback.runAt;

    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];

    const normalizedIssues = rawIssues
      .map((issue, idx) => {
        if (!issue || typeof issue !== 'object') return null;
        const sectionKey =
          typeof issue.sectionKey === 'string' ? issue.sectionKey : 'Unknown';
        const excerpt =
          typeof issue.excerpt === 'string' ? issue.excerpt : '';
        const message =
          typeof issue.message === 'string' ? issue.message : '';
        if (!excerpt || !message) return null;

        const severityRaw =
          typeof issue.severity === 'string' ? issue.severity.toUpperCase() : 'INFO';
        const severity =
          severityRaw === 'CRITICAL' || severityRaw === 'WARNING' || severityRaw === 'INFO'
            ? severityRaw
            : 'INFO';

        const categoryRaw =
          typeof issue.category === 'string' ? issue.category : '';
        const allowedCategories = [
          'SLANG_OR_INFORMAL',
          'NON_LEGAL_REGISTER',
          'FACT_OPINION_MIX',
          'INCONSISTENT_TERMS',
          'AMBIGUOUS_OR_OVERBROAD',
          'GRAMMAR_OR_CLARITY',
        ];
        const category = allowedCategories.includes(categoryRaw)
          ? categoryRaw
          : 'GRAMMAR_OR_CLARITY';

        const suggestion =
          typeof issue.suggestion === 'string' && issue.suggestion.trim()
            ? issue.suggestion
            : undefined;

        // Stable-ish id: hash of sectionKey + category + excerpt
        const base = `${sectionKey}::${category}::${excerpt}`;
        let id = typeof issue.id === 'string' && issue.id ? issue.id : null;
        if (!id) {
          try {
            const buf = Buffer.from(base, 'utf8').toString('base64').slice(0, 16);
            id = `hs-${buf}`;
          } catch {
            id = `hs-${idx}`;
          }
        }

        return {
          id,
          sectionKey,
          severity,
          category,
          message,
          excerpt,
          suggestion,
        };
      })
      .filter(Boolean);

    return res.json({ success: true, runAt, issues: normalizedIssues });
  } catch (error) {
    console.error('Hebrew style review error:', error);
    const runAt = new Date().toISOString();
    let reason = error?.reason || 'AI_UNAVAILABLE';
    const msg = error && typeof error.message === 'string' ? error.message : String(error);
    const status = error?.status ?? error?.response?.status;
    if (reason === 'AI_UNAVAILABLE') {
      if (status === 401 || /invalid.*api.*key|unauthorized/i.test(msg)) reason = 'UNAUTHORIZED';
      else if (status === 429 || /rate.*limit/i.test(msg)) reason = 'RATE_LIMIT';
      else if (/timeout|ETIMEDOUT|timed out/i.test(msg)) reason = 'TIMEOUT';
      else if (/JSON|parse|invalid response|empty/i.test(msg)) reason = 'INVALID_RESPONSE';
    }
    return res.status(200).json({ success: false, reason, runAt, issues: [] });
  }
});

// 8. Help Chat
app.post('/api/help-chat', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { question } = req.body;
  try {
    const answer = await createTextCompletion({
      systemPrompt: `You are a helpful assistant for the Lior Perry Report Builder. Answer in Hebrew, be concise, and reference relevant features.`,
      userPrompt: question,
      temperature: 0.4,
    });
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: 'Help chat failed' });
  }
});

// 8b. Smart Assistant – intent-based help (no report bodies)
app.post('/api/assistant/help', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;

  const hasApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.API_KEY);
  if (!hasApiKey) {
    console.error('[Assistant] Missing OPENAI_API_KEY or API_KEY – Smart Assistant will not work');
  }

  const { intent, context, reportMeta } = req.body || {};

  const allowedIntents = new Set([
    'explain_current_screen',
    'explain_buttons_in_step',
    'when_to_use_ai_tools',
    'common_mistakes_here',
    'pre_send_checks',
    'explain_tone_risk',
    'explain_paperclip',
    'explain_hebrew_rewrite',
    'finance_first_time',
    'finance_repeat',
  ]);

  if (!intent || typeof intent !== 'string' || !allowedIntents.has(intent)) {
    return res.status(400).json({ error: 'Invalid intent' });
  }

  const safeContext = {
    step:
      context && (context.step === 1 || context.step === 2 || context.step === 3)
        ? context.step
        : 1,
    role: typeof context?.role === 'string' ? String(context.role).toUpperCase() : '',
    screen: typeof context?.screen === 'string' ? context.screen : '',
    section:
      typeof context?.section === 'string' && context.section.trim()
        ? context.section.trim()
        : undefined,
  };

  const safeMeta = {
    hebrewApproved: Boolean(reportMeta && reportMeta.hebrewApproved),
    hasTranslation: Boolean(reportMeta && reportMeta.hasTranslation),
    translationOutdated: Boolean(reportMeta && reportMeta.translationOutdated),
    toneRiskRun: Boolean(reportMeta && reportMeta.toneRiskRun),
    expensesLastUpdatedAt:
      reportMeta && typeof reportMeta.expensesLastUpdatedAt === 'string'
        ? reportMeta.expensesLastUpdatedAt
        : undefined,
  };

  const userPrompt = `
Intent: ${intent}

Context:
- step: ${safeContext.step}
- role: ${safeContext.role || 'UNKNOWN'}
- screen: ${safeContext.screen || 'UNKNOWN'}
- section: ${safeContext.section || 'NONE'}

Report meta (high-level only, no body text):
- hebrewApproved: ${safeMeta.hebrewApproved}
- hasTranslation: ${safeMeta.hasTranslation}
- translationOutdated: ${safeMeta.translationOutdated}
- toneRiskRun: ${safeMeta.toneRiskRun}
- expensesLastUpdatedAt: ${safeMeta.expensesLastUpdatedAt || 'UNKNOWN'}

Task:
- Based ONLY on this meta/context (no access to the full report text),
  explain how the user should work correctly and safely in this part of the app.
- Return STRICT JSON with the following shape:
  {
    "title": string,
    "bullets": string[],   // 3–6 short Hebrew bullets
    "warning": string | null,
    "nextSuggestion": string | null
  }
- Do NOT include Markdown, code blocks, or formatting – just plain strings.
- If information is missing, give general but accurate guidance and say explicitly that
  the system only exposes high-level status here.
`.trim();

  try {
    const raw = await createTextCompletion({
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.25,
      responseFormat: { type: 'json_object' },
    });

    const parsed = parseJsonSafely(raw, null);

    let title =
      parsed && typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : 'איך לעבוד נכון במסך הזה';

    let bullets = Array.isArray(parsed?.bullets)
      ? parsed.bullets.filter(
          (b) => typeof b === 'string' && b.trim().length > 0,
        )
      : [];

    // Ensure 3–6 bullets
    const fallbackBullets = [
      'בדקי שהמטרה שלך בשלב הזה ברורה (הגדרת שלב, ניסוח, או שליחה).',
      'היעזרי בכלי הבדיקה ולא רק בכלי השכתוב, כדי לזהות סיכונים לפני שליחה.',
      'שימי לב שלא שולחים דו"ח עם תרגום ישן או טבלת הוצאות לא מעודכנת.',
      'אם משהו לא מסתדר, עדיף לחזור לשלב 2 ולסדר את הטקסט לפני שליחה.',
    ];

    if (bullets.length === 0) {
      bullets = fallbackBullets.slice(0, 3);
    } else if (bullets.length < 3) {
      bullets = bullets.concat(
        fallbackBullets.slice(0, Math.min(3 - bullets.length, fallbackBullets.length)),
      );
    }
    if (bullets.length > 6) {
      bullets = bullets.slice(0, 6);
    }

    const warning =
      parsed && typeof parsed.warning === 'string' && parsed.warning.trim()
        ? parsed.warning.trim()
        : undefined;
    const nextSuggestion =
      parsed && typeof parsed.nextSuggestion === 'string' && parsed.nextSuggestion.trim()
        ? parsed.nextSuggestion.trim()
        : undefined;

    return res.json({
      title,
      bullets,
      warning,
      nextSuggestion,
    });
  } catch (error) {
    const errMsg = error?.message || String(error);
    const status = error?.status ?? error?.response?.status;
    let reason = 'AI_UNAVAILABLE';
    if (!hasApiKey) reason = 'MISSING_API_KEY';
    else if (status === 401 || /invalid.*api.*key|unauthorized/i.test(errMsg)) reason = 'UNAUTHORIZED';
    else if (status === 429 || /rate.*limit/i.test(errMsg)) reason = 'RATE_LIMIT';
    else if (/timeout|ETIMEDOUT|timed out/i.test(errMsg)) reason = 'TIMEOUT';
    else if (/JSON|parse|invalid response/i.test(errMsg)) reason = 'INVALID_RESPONSE';

    console.error('[Assistant] Smart Assistant error', {
      intent,
      reason,
      error: errMsg,
      stack: error?.stack,
    });

    const actionableBullets = [
      reason === 'MISSING_API_KEY'
        ? 'OpenAI API key is not configured. Contact your administrator to set OPENAI_API_KEY.'
        : reason === 'RATE_LIMIT'
          ? 'AI rate limit reached. Please try again in a few minutes.'
          : reason === 'TIMEOUT'
            ? 'The request timed out. Try again or check your connection.'
            : 'נראה שיש תקלה זמנית בעוזר החכם או בחיבור ל-AI.',
      'אפשר להמשיך לעבוד כרגיל עם הכלים במסך (שכתוב עברית, בדיקות, תצוגת PDF).',
      'אם התקלה חוזרת, כדאי לדווח לליאור או לתיעוד התמיכה.',
    ];

    return res.status(500).json({
      title: 'העוזר החכם אינו זמין כרגע',
      bullets: actionableBullets,
      warning: 'עד שהעוזר יחזור לפעול, האחריות על בדיקות סופיות היא על המשתמשת בלבד.',
      nextSuggestion: reason === 'MISSING_API_KEY' ? undefined : 'נסי לרענן את הדפדפן או להיכנס מחדש לפני ניסיון נוסף.',
    });
  }
});

// 9. Executive Summary
app.post('/api/generate-summary', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const { reportContent, insurerName, insuredName } = req.body;
  try {
    const summary = await createTextCompletion({
      systemPrompt: 'You craft executive summaries for insurance updates. Respond in English, max 120 words, professional tone.',
      userPrompt: `Insurer: ${insurerName}\nInsured: ${insuredName}\nReport content:\n${JSON.stringify(reportContent, null, 2)}`,
      temperature: 0.5,
    });
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// Mail config (mode + recipients from ENV) for Compose UI
app.get('/api/mail-config', (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  try {
    const { to, cc } = getEmailRecipients();
    const mode = VALID_MODES.includes(MAIL_MODE) ? MAIL_MODE : 'SANDBOX';
    res.json({ mode, to, cc });
  } catch (error) {
    console.error('Mail config error:', error);
    const msg = error?.message || 'Mail configuration error';
    res.status(503).json({ error: msg });
  }
});

// 10. Send Email – TO/CC built server-side only: TO = broker (ENV), CC = REPORTS (ENV) + lawyer (from report)
app.post('/api/send-email', async (req, res) => {
  if (!ensureAuthenticated(req, res)) return;
  const role = getUserRoleFromRequest(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only ADMIN can send emails' });
  }
  const { subject, body, attachmentBase64, attachmentName, lawyerEmail } = req.body;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'Server email configuration missing' });
  }

  let to;
  let cc;
  try {
    const base = getEmailRecipients();
    to = base.to;
    cc = [...(base.cc || [])];
    const lawyer = typeof lawyerEmail === 'string' ? lawyerEmail.trim() : '';
    if (lawyer && !cc.some((e) => e.toLowerCase() === lawyer.toLowerCase())) {
      cc.push(lawyer);
    }
  } catch (error) {
    const msg = error?.message || 'Recipient configuration error';
    return res.status(503).json({ error: msg });
  }

  if (!to || !to.length) {
    return res.status(503).json({ error: 'Email recipients not configured for current MAIL_MODE' });
  }

  try {
    const attachments = [];
    if (attachmentBase64) {
      const safeBase64 =
        typeof attachmentBase64 === 'string'
          ? attachmentBase64.split(',').pop() || attachmentBase64
          : attachmentBase64;
      attachments.push({
        filename: attachmentName || 'Report.pdf',
        content: Buffer.from(safeBase64, 'base64'),
        contentType: 'application/pdf',
      });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to.join(','),
      subject,
      text: body,
      attachments,
    };

    if (Array.isArray(cc) && cc.length) {
      mailOptions.cc = cc.join(',');
    }

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/api/render-report-pdf', async (req, res) => {
  // Preview / PDF generation is allowed without session to avoid breaking
  // local workflows when the dev server restarts. The payload already
  // contains only the specific report data needed to render the document.
  const { report } = req.body || {};

  if (!report || typeof report !== 'object') {
    return res.status(400).json({ error: 'Missing report payload' });
  }

  if (report.attachPolicyAsAppendix === true) {
    const policy = report.policyFile;
    if (!policy || !policy.data) {
      return res.status(400).json({
        error: 'צירפת פוליסה אך הקובץ לא נקלט. נא לנסות שוב.',
      });
    }
  }

  console.log('[PDF] Starting PDF generation', {
    odakanitNo: report?.odakanitNo,
    reportId: report?.id,
  });

  try {
    const pdfBuffer = await buildFinalReportPdfWithPolicy(report);
    console.log('[PDF] buildFinalReportPdfWithPolicy completed successfully', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
    });

    // 🛡️ נוודא שתמיד יוצא Buffer אמיתי
    let finalBuffer = pdfBuffer;

    if (!Buffer.isBuffer(pdfBuffer)) {
      // במקרה שמקבלים אובייקט בסגנון {"0":37,"1":80,...}
      const bytes = Array.isArray(pdfBuffer)
        ? pdfBuffer
        : (pdfBuffer.data || Object.values(pdfBuffer));
      finalBuffer = Buffer.from(bytes);
    }

    const fileName = `report-${report.odakanitNo || report.id || 'document'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(finalBuffer);
  } catch (error) {
    const errMsg = error?.message || String(error);
    const isBrowserLaunch =
      /could not find chrome|failed to launch|executable doesn't exist|ENOENT|spawn.*chromium|browser.*not found/i.test(errMsg);
    const isTimeout = /timeout|ETIMEDOUT|timed out|navigation timeout/i.test(errMsg);
    const isPolicyErr = /policy|appendix/i.test(errMsg);
    const isInvoiceErr = /invoice.*appendix/i.test(errMsg);
    const isHtmlErr = /HTML_GENERATION|buildReportHtml/i.test(errMsg);
    const isMergeErr = /merged pdf page count|appendices layout/i.test(errMsg);

    let userMsg = 'Failed to generate PDF';
    if (isBrowserLaunch) {
      userMsg =
        'PDF generation failed: Could not launch browser. Try again or contact support.';
    } else if (isTimeout) {
      userMsg = 'PDF generation timed out. Try again or contact support.';
    } else if (isPolicyErr) {
      userMsg = 'Policy appendix error. Check policy file and try again.';
    } else if (isInvoiceErr) {
      userMsg = 'Invoice appendix error. Check invoice files and try again.';
    } else if (isHtmlErr) {
      userMsg = 'Report content error. Check report data and try again.';
    } else if (isMergeErr) {
      userMsg = 'PDF assembly error. Try again or contact support.';
    }

    console.error('[PDF] PDF generation failed', {
      odakanitNo: report?.odakanitNo,
      reportId: report?.id,
      error: errMsg,
      stack: error?.stack,
    });
    res.status(500).json({ error: userMsg });
  }
});

app.post('/api/render-report-html', async (req, res) => {
  // HTML preview is allowed without enforcing authentication so that
  // restarting the dev server won't break existing browser sessions.
  const { report } = req.body || {};

  if (!report || typeof report !== 'object') {
    return res.status(400).json({ error: 'Missing report payload' });
  }

  try {
    const html = buildReportHtml(report);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Failed to generate report HTML:', error);
    res.status(500).json({ error: 'Failed to generate report HTML' });
  }
});

// --- Section Templates API (Lightbulb / Ideas) ---

app.get('/api/templates', (req, res) => {
  try {
    const { sectionKey } = req.query || {};
    let templates = loadSectionTemplatesFromDisk();
    if (sectionKey && typeof sectionKey === 'string') {
      templates = templates.filter((t) => t.sectionKey === sectionKey);
    }
    res.json(templates);
  } catch (err) {
    console.error('Failed to list templates:', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

app.post('/api/templates', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const payload = req.body || {};
    const { sectionKey, title, body, isEnabled, orderIndex, createdByUserId } = payload;
    if (!sectionKey || !title || !body) {
      return res.status(400).json({ error: 'sectionKey, title and body are required' });
    }
    const all = loadSectionTemplatesFromDisk();
    const nowIso = new Date().toISOString();
    const maxOrder = all.reduce(
      (max, t) => (typeof t.orderIndex === 'number' && t.orderIndex > max ? t.orderIndex : max),
      -1,
    );
    const nextOrder = typeof orderIndex === 'number' ? orderIndex : maxOrder + 1;
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tpl = {
      id,
      sectionKey,
      title,
      body,
      createdByUserId: createdByUserId || 'system',
      createdAt: nowIso,
      updatedAt: nowIso,
      isEnabled: isEnabled !== false,
      orderIndex: nextOrder,
    };
    all.push(tpl);
    saveSectionTemplatesToDisk(all);
    res.status(201).json(all);
  } catch (err) {
    console.error('Failed to create template:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

app.put('/api/templates/:id', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const all = loadSectionTemplatesFromDisk();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const nowIso = new Date().toISOString();
    const existing = all[idx];
    const allowedFields = [
      'sectionKey',
      'title',
      'body',
      'isEnabled',
      'orderIndex',
      'createdByUserId',
    ];
    const patch = {};
    allowedFields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        patch[key] = updates[key];
      }
    });
    all[idx] = {
      ...existing,
      ...patch,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    };
    saveSectionTemplatesToDisk(all);
    res.json(all);
  } catch (err) {
    console.error('Failed to update template:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const all = loadSectionTemplatesFromDisk();
    const next = all.filter((t) => t.id !== id);
    saveSectionTemplatesToDisk(next);
    res.json(next);
  } catch (err) {
    console.error('Failed to delete template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

app.post('/api/templates/:id/reorder', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const { direction } = req.body || {};
    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'direction must be UP or DOWN' });
    }
    const all = loadSectionTemplatesFromDisk();
    const sorted = all
      .slice()
      .sort(
        (a, b) =>
          (a.orderIndex || 0) - (b.orderIndex || 0) ||
          String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      );
    const index = sorted.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) {
      return res.json(sorted);
    }
    const tmp = sorted[index];
    sorted[index] = sorted[targetIndex];
    sorted[targetIndex] = tmp;
    sorted.forEach((t, idx) => {
      t.orderIndex = idx;
    });
    saveSectionTemplatesToDisk(sorted);
    res.json(sorted);
  } catch (err) {
    console.error('Failed to reorder template:', err);
    res.status(500).json({ error: 'Failed to reorder template' });
  }
});

// --- Best Practices API ---

const normalizeBestPractices = (items) => {
  const nowIso = new Date().toISOString();
  return (items || [])
    .filter(
      (t) =>
        t &&
        typeof t.sectionKey === 'string' &&
        typeof t.title === 'string' &&
        typeof t.body === 'string',
    )
    .map((t, index) => {
      const createdAt = typeof t.createdAt === 'string' ? t.createdAt : nowIso;
      const updatedAt = typeof t.updatedAt === 'string' ? t.updatedAt : createdAt;
      const orderIndex =
        typeof t.orderIndex === 'number'
          ? t.orderIndex
          : index;
      return {
        id:
          typeof t.id === 'string' && t.id
            ? t.id
            : `bp-${t.sectionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sectionKey: t.sectionKey,
        title: t.title,
        body: t.body,
        label: t.label === 'LLOYDS_RECOMMENDED' ? 'LLOYDS_RECOMMENDED' : 'BEST_PRACTICE',
        tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
        isEnabled: t.isEnabled !== false,
        createdByUserId: String(t.createdByUserId || 'system'),
        createdAt,
        updatedAt,
        usageCount: typeof t.usageCount === 'number' ? t.usageCount : 0,
        lastUsedAt: typeof t.lastUsedAt === 'string' ? t.lastUsedAt : null,
        behavior: t.behavior === 'COPY_ONLY' ? 'COPY_ONLY' : 'INSERTABLE',
        sourceReportId: t.sourceReportId ? String(t.sourceReportId) : undefined,
        orderIndex,
      };
    });
};

app.get('/api/best-practices', (req, res) => {
  try {
    const { sectionKey } = req.query || {};
    let list = normalizeBestPractices(loadBestPracticesFromDisk());
    if (sectionKey && typeof sectionKey === 'string') {
      list = list.filter((bp) => bp.sectionKey === sectionKey);
    }
    list.sort(
      (a, b) =>
        (a.orderIndex || 0) - (b.orderIndex || 0) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    );
    res.json(list);
  } catch (err) {
    console.error('Failed to list best practices:', err);
    res.status(500).json({ error: 'Failed to load best practices' });
  }
});

app.post('/api/best-practices', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const payload = req.body || {};
    const { sectionKey, title, body, label, tags, behavior, isEnabled, createdByUserId } =
      payload;
    if (!sectionKey || !title || !body) {
      return res.status(400).json({ error: 'sectionKey, title and body are required' });
    }
    const raw = loadBestPracticesFromDisk();
    const all = normalizeBestPractices(raw);
    const nowIso = new Date().toISOString();
    const maxOrder = all.reduce(
      (max, t) =>
        typeof t.orderIndex === 'number' && t.orderIndex > max ? t.orderIndex : max,
      -1,
    );
    const nextOrder = maxOrder + 1;
    const id = `bp-${sectionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snippet = {
      id,
      sectionKey,
      title,
      body,
      label: label === 'LLOYDS_RECOMMENDED' ? 'LLOYDS_RECOMMENDED' : 'BEST_PRACTICE',
      tags: Array.isArray(tags) ? tags.map(String) : [],
      isEnabled: isEnabled !== false,
      createdByUserId: createdByUserId || 'system',
      createdAt: nowIso,
      updatedAt: nowIso,
      usageCount: 0,
      lastUsedAt: null,
      behavior: behavior === 'COPY_ONLY' ? 'COPY_ONLY' : 'INSERTABLE',
      orderIndex: nextOrder,
    };
    all.push(snippet);
    saveBestPracticesToDisk(all);
    res.status(201).json(all);
  } catch (err) {
    console.error('Failed to create best practice:', err);
    res.status(500).json({ error: 'Failed to create best practice' });
  }
});

app.put('/api/best-practices/:id', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const raw = loadBestPracticesFromDisk();
    const all = normalizeBestPractices(raw);
    const idx = all.findIndex((bp) => bp.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Best practice not found' });
    }
    const nowIso = new Date().toISOString();
    const existing = all[idx];
    const allowedFields = [
      'sectionKey',
      'title',
      'body',
      'label',
      'tags',
      'isEnabled',
      'behavior',
      'orderIndex',
    ];
    const patch = {};
    allowedFields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        patch[key] = updates[key];
      }
    });
    all[idx] = {
      ...existing,
      ...patch,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    };
    saveBestPracticesToDisk(all);
    res.json(all);
  } catch (err) {
    console.error('Failed to update best practice:', err);
    res.status(500).json({ error: 'Failed to update best practice' });
  }
});

app.delete('/api/best-practices/:id', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const raw = loadBestPracticesFromDisk();
    const all = normalizeBestPractices(raw);
    const next = all.filter((bp) => bp.id !== id);
    saveBestPracticesToDisk(next);
    res.json(next);
  } catch (err) {
    console.error('Failed to delete best practice:', err);
    res.status(500).json({ error: 'Failed to delete best practice' });
  }
});

app.post('/api/best-practices/:id/reorder', (req, res) => {
  if (!ensureAdminRole(req, res)) return;
  try {
    const { id } = req.params;
    const { direction } = req.body || {};
    if (direction !== 'UP' && direction !== 'DOWN') {
      return res.status(400).json({ error: 'direction must be UP or DOWN' });
    }
    const raw = loadBestPracticesFromDisk();
    const all = normalizeBestPractices(raw);
    const sorted = all
      .slice()
      .sort(
        (a, b) =>
          (a.orderIndex || 0) - (b.orderIndex || 0) ||
          String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      );
    const index = sorted.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Best practice not found' });
    }
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) {
      return res.json(sorted);
    }
    const tmp = sorted[index];
    sorted[index] = sorted[targetIndex];
    sorted[targetIndex] = tmp;
    sorted.forEach((t, idx) => {
      t.orderIndex = idx;
    });
    saveBestPracticesToDisk(sorted);
    res.json(sorted);
  } catch (err) {
    console.error('Failed to reorder best practice:', err);
    res.status(500).json({ error: 'Failed to reorder best practice' });
  }
});

app.post('/api/best-practices/:id/usage', (req, res) => {
  try {
    const { id } = req.params;
    const role = getUserRoleFromRequest(req);
    if (role !== 'ADMIN' && role !== 'LAWYER') {
      return res.status(403).json({ error: 'Only ADMIN or LAWYER can record usage' });
    }

    // mode (e.g. 'INSERT' | 'COPY') is accepted but not currently used for persistence;
    // it may be leveraged in future analytics without affecting behavior today.
    const { mode } = req.body || {}; // eslint-disable-line @typescript-eslint/no-unused-vars

    const raw = loadBestPracticesFromDisk();
    const all = normalizeBestPractices(raw);
    const idx = all.findIndex((bp) => bp.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Best practice not found' });
    }
    const existing = all[idx];
    all[idx] = {
      ...existing,
      usageCount: (existing.usageCount || 0) + 1,
      lastUsedAt: new Date().toISOString(),
    };
    saveBestPracticesToDisk(all);
    res.json(all);
  } catch (err) {
    console.error('Failed to record best practice usage:', err);
    res.status(500).json({ error: 'Failed to record best practice usage' });
  }
});


// --- Serve Static Files ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

export { app, renderReportPdf };

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(
      `[OCR] render=${IS_RENDER} docint=${USE_DOC_INTELLIGENCE} azure_ocr=${USE_AZURE_OCR} tesseract_on_render=false`,
    );
  });
}
