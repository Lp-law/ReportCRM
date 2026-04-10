/**
 * Azure AI Language integration.
 *
 * Provides:
 * - PII Detection: identify sensitive data before sending reports
 * - Entity Recognition: extract names, dates, organizations from text
 * - Key Phrase Extraction: identify main topics in document sections
 *
 * Required env vars:
 *   AZURE_LANGUAGE_ENDPOINT  (e.g. https://your-resource.cognitiveservices.azure.com)
 *   AZURE_LANGUAGE_KEY
 */
import fetch from 'node-fetch';

const LANGUAGE_ENDPOINT = process.env.AZURE_LANGUAGE_ENDPOINT;
const LANGUAGE_KEY = process.env.AZURE_LANGUAGE_KEY;

export const USE_AZURE_LANGUAGE = Boolean(LANGUAGE_ENDPOINT && LANGUAGE_KEY);

const normalizeEndpoint = (ep) => ep?.endsWith('/') ? ep.slice(0, -1) : ep;

/**
 * Call Azure Language API with the given task.
 */
const callLanguageApi = async (path, body) => {
  if (!USE_AZURE_LANGUAGE) {
    throw new Error('Azure Language is not configured. Set AZURE_LANGUAGE_ENDPOINT and AZURE_LANGUAGE_KEY.');
  }

  const url = `${normalizeEndpoint(LANGUAGE_ENDPOINT)}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': LANGUAGE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Azure Language API failed: ${response.status} ${err.slice(0, 200)}`);
  }

  return response.json();
};

/**
 * Detect PII (Personally Identifiable Information) in text.
 * Returns an array of detected PII entities with their categories and positions.
 *
 * Categories include: Person, PhoneNumber, Email, Address, IDNumber,
 * CreditCardNumber, BankAccountNumber, etc.
 *
 * @param {string} text - Text to scan
 * @param {string} language - Language code ('he' or 'en')
 * @returns {Promise<{entities: Array, redactedText: string}>}
 */
export const detectPII = async (text, language = 'he') => {
  const result = await callLanguageApi(
    '/language/:analyze-text?api-version=2023-04-01',
    {
      kind: 'PiiEntityRecognition',
      parameters: {
        modelVersion: 'latest',
        piiCategories: [
          'Person', 'PhoneNumber', 'Email', 'Address',
          'CreditCardNumber', 'BankAccountNumber',
          'InternationalBankingAccountNumber',
          'IsraelIdentityNumber',
        ],
      },
      analysisInput: {
        documents: [{ id: '1', text, language }],
      },
    },
  );

  const doc = result?.results?.documents?.[0];
  if (!doc) return { entities: [], redactedText: text };

  const entities = (doc.entities || []).map((e) => ({
    text: e.text,
    category: e.category,
    subcategory: e.subcategory || null,
    confidence: e.confidenceScore,
    offset: e.offset,
    length: e.length,
  }));

  return {
    entities,
    redactedText: doc.redactedText || text,
  };
};

/**
 * Extract named entities (people, organizations, dates, locations) from text.
 *
 * @param {string} text
 * @param {string} language
 * @returns {Promise<Array<{text: string, category: string, subcategory: string|null, confidence: number}>>}
 */
export const recognizeEntities = async (text, language = 'he') => {
  const result = await callLanguageApi(
    '/language/:analyze-text?api-version=2023-04-01',
    {
      kind: 'EntityRecognition',
      parameters: { modelVersion: 'latest' },
      analysisInput: {
        documents: [{ id: '1', text, language }],
      },
    },
  );

  const doc = result?.results?.documents?.[0];
  if (!doc) return [];

  return (doc.entities || []).map((e) => ({
    text: e.text,
    category: e.category,
    subcategory: e.subcategory || null,
    confidence: e.confidenceScore,
  }));
};

/**
 * Extract key phrases from text.
 *
 * @param {string} text
 * @param {string} language
 * @returns {Promise<string[]>}
 */
export const extractKeyPhrases = async (text, language = 'he') => {
  const result = await callLanguageApi(
    '/language/:analyze-text?api-version=2023-04-01',
    {
      kind: 'KeyPhraseExtraction',
      parameters: { modelVersion: 'latest' },
      analysisInput: {
        documents: [{ id: '1', text, language }],
      },
    },
  );

  const doc = result?.results?.documents?.[0];
  return doc?.keyPhrases || [];
};
