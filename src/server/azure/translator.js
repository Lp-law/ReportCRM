/**
 * Azure AI Translator integration.
 *
 * Provides high-quality Hebrew ↔ English translation using Azure's dedicated
 * translation engine, which is more accurate for factual content (names, dates,
 * numbers) than general-purpose LLMs.
 *
 * Supports custom glossary for consistent legal terminology.
 *
 * Required env vars:
 *   AZURE_TRANSLATOR_KEY
 *   AZURE_TRANSLATOR_ENDPOINT  (e.g. https://api.cognitive.microsofttranslator.com)
 *   AZURE_TRANSLATOR_REGION    (e.g. westeurope)
 */
import fetch from 'node-fetch';
import crypto from 'crypto';

const TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const TRANSLATOR_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
const TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION || 'westeurope';

export const USE_AZURE_TRANSLATOR = Boolean(TRANSLATOR_KEY);

/**
 * Custom glossary for legal terminology — ensures consistent translation.
 * Azure Translator's dynamic dictionary feature uses XML tags inline.
 */
const LEGAL_GLOSSARY_HE_EN = {
  'כתב תביעה': 'Statement of Claim',
  'כתב הגנה': 'Statement of Defence',
  'מכתב דרישה': 'Letter of Demand',
  'הודעת צד ג\'': 'Third Party Notice',
  'חוות דעת': 'Expert Opinion',
  'חוות דעת מומחה': 'Expert Opinion',
  'רשלנות רפואית': 'Medical Malpractice',
  'נזקי גוף': 'Bodily Injury',
  'קשר סיבתי': 'Causation',
  'אחריות': 'Liability',
  'נכות': 'Disability',
  'נכות רפואית': 'Medical Disability',
  'נכות תפקודית': 'Functional Disability',
  'פיצויים': 'Damages',
  'ראשי נזק': 'Heads of Damage',
  'כאב וסבל': 'Pain and Suffering',
  'הוצאות רפואיות': 'Medical Expenses',
  'הסכמה מדעת': 'Informed Consent',
  'סטנדרט טיפול': 'Standard of Care',
  'הפרת חובת זהירות': 'Breach of Duty of Care',
  'פוליסת ביטוח': 'Insurance Policy',
  'תקופת הפוליסה': 'Policy Period',
  'תאריך רטרואקטיבי': 'Retroactive Date',
  'חברת הביטוח': 'The Insurer',
  'המבוטח': 'The Insured',
  'התובע': 'The Plaintiff',
  'התובעת': 'The Plaintiff',
  'הדורש': 'The Claimant',
  'הדורשת': 'The Claimant',
  'הנתבע': 'The Defendant',
  'הנתבעת': 'The Defendant',
  'בית משפט': 'Court',
  'בית המשפט המחוזי': 'The District Court',
  'בית משפט השלום': 'The Magistrates\' Court',
  'קדם משפט': 'Pre-Trial Hearing',
  'דיון הוכחות': 'Evidentiary Hearing',
  'סיכומים': 'Summaries',
  'פסק דין': 'Judgment',
  'ערעור': 'Appeal',
  'פשרה': 'Settlement',
  'הסכם פשרה': 'Settlement Agreement',
  'גישור': 'Mediation',
  'בוררות': 'Arbitration',
  'חשיפה ביטוחית': 'Insurance Exposure',
  'הערכת סיכון': 'Risk Assessment',
  'המלצות': 'Recommendations',
};

/**
 * Apply glossary by wrapping known terms with Azure's dynamic dictionary XML.
 */
const applyGlossary = (text, glossary) => {
  let result = text;
  // Sort by length descending to match longer phrases first
  const entries = Object.entries(glossary).sort((a, b) => b[0].length - a[0].length);
  for (const [he, en] of entries) {
    const escaped = he.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, `<mstrans:dictionary translation="${en}">${he}</mstrans:dictionary>`);
  }
  return result;
};

/**
 * Translate text using Azure Translator.
 * @param {string} text - Text to translate
 * @param {string} from - Source language code (e.g. 'he')
 * @param {string} to - Target language code (e.g. 'en')
 * @param {boolean} useGlossary - Whether to apply the legal glossary
 * @returns {Promise<string>} Translated text
 */
export const translateWithAzure = async (text, from = 'he', to = 'en', useGlossary = true) => {
  if (!TRANSLATOR_KEY) {
    throw new Error('Azure Translator is not configured. Set AZURE_TRANSLATOR_KEY.');
  }

  const textToTranslate = (useGlossary && from === 'he' && to === 'en')
    ? applyGlossary(text, LEGAL_GLOSSARY_HE_EN)
    : text;

  const url = `${TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=${from}&to=${to}&textType=html`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
      'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
      'Content-Type': 'application/json',
      'X-ClientTraceId': crypto.randomUUID(),
    },
    body: JSON.stringify([{ Text: textToTranslate }]),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Azure Translator failed: ${response.status} ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const translated = data?.[0]?.translations?.[0]?.text || '';

  console.log(`[AzureTranslator] ${from}->${to} inputChars=${text.length} outputChars=${translated.length}`);
  return translated;
};

/**
 * Detect the language of a text.
 */
export const detectLanguage = async (text) => {
  if (!TRANSLATOR_KEY) return null;

  const url = `${TRANSLATOR_ENDPOINT}/detect?api-version=3.0`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
      'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text.slice(0, 1000) }]),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.[0]?.language || null;
};
