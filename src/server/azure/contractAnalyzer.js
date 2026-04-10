/**
 * Azure Document Intelligence — prebuilt-contract model.
 *
 * Specialized model for extracting structured data from insurance policies
 * and contracts: parties, dates, jurisdictions, amounts.
 *
 * Uses the same AZURE_DOCINT credentials as the existing layout model.
 *
 * Required env vars (already configured):
 *   AZURE_DOCINT_ENDPOINT
 *   AZURE_DOCINT_KEY
 */
import fetch from 'node-fetch';

const DOCINT_ENDPOINT = process.env.AZURE_DOCINT_ENDPOINT || process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCINT_KEY = process.env.AZURE_DOCINT_KEY || process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

export const USE_CONTRACT_ANALYZER = Boolean(DOCINT_ENDPOINT && DOCINT_KEY);

const normalizeEndpoint = (ep) => ep?.endsWith('/') ? ep.slice(0, -1) : ep;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONTENT_TYPE_MAP = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
};

const getContentType = (mimeType) => {
  const m = (mimeType || '').toLowerCase();
  for (const [key, value] of Object.entries(CONTENT_TYPE_MAP)) {
    if (m.includes(key)) return value;
  }
  return 'application/octet-stream';
};

/**
 * Analyze a document using prebuilt-contract model.
 * Returns structured contract/policy data.
 *
 * @param {Buffer} buffer - Document binary content
 * @param {string} mimeType - MIME type of the document
 * @returns {Promise<ContractAnalysisResult>}
 */
export const analyzeContract = async (buffer, mimeType) => {
  if (!USE_CONTRACT_ANALYZER) {
    throw new Error('Contract analyzer not configured. Set AZURE_DOCINT_ENDPOINT and AZURE_DOCINT_KEY.');
  }

  const contentType = getContentType(mimeType);
  const endpoint = `${normalizeEndpoint(DOCINT_ENDPOINT)}/documentintelligence/documentModels/prebuilt-contract:analyze?api-version=2024-11-30`;

  console.log(`[ContractAnalyzer] Submitting document (${buffer.length} bytes, ${contentType})`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Ocp-Apim-Subscription-Key': DOCINT_KEY,
    },
    body: buffer,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Contract analysis submission failed: ${response.status} ${(err || '').slice(0, 200)}`);
  }

  const operationLocation = response.headers.get('operation-location');
  if (!operationLocation) {
    throw new Error('Contract analysis missing operation-location');
  }

  // Poll for result
  const startedAt = Date.now();
  const MAX_WAIT_MS = 60000;

  for (let attempt = 0; attempt < 40; attempt++) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error('Contract analysis timed out');
    }
    await sleep(1500);

    const statusResponse = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': DOCINT_KEY },
    });
    const json = await statusResponse.json();

    if (json.status === 'succeeded') {
      console.log(`[ContractAnalyzer] Analysis completed in ${Date.now() - startedAt}ms`);
      return parseContractResult(json.analyzeResult);
    }
    if (json.status === 'failed') {
      throw new Error(`Contract analysis failed: ${json.error?.message || 'unknown'}`);
    }
  }

  throw new Error('Contract analysis timed out');
};

/**
 * Parse the raw Document Intelligence contract result into a clean structure.
 */
const parseContractResult = (analyzeResult) => {
  const documents = analyzeResult?.documents || [];
  const result = {
    parties: [],
    contractDates: {
      startDate: '',
      endDate: '',
      executionDate: '',
    },
    jurisdiction: '',
    contractId: '',
    contractTitle: '',
    renewalDate: '',
    totalAmount: '',
    fields: {},
    rawContent: analyzeResult?.content || '',
  };

  for (const doc of documents) {
    const fields = doc.fields || {};

    // Extract parties
    if (fields.Parties?.valueArray) {
      result.parties = fields.Parties.valueArray.map((p) => ({
        name: p.valueObject?.Name?.valueString || '',
        role: p.valueObject?.Role?.valueString || '',
        address: p.valueObject?.Address?.valueString || '',
      }));
    }

    // Extract dates
    if (fields.ContractStartDate?.valueDate) {
      result.contractDates.startDate = fields.ContractStartDate.valueDate;
    }
    if (fields.ContractEndDate?.valueDate) {
      result.contractDates.endDate = fields.ContractEndDate.valueDate;
    }
    if (fields.ExecutionDate?.valueDate) {
      result.contractDates.executionDate = fields.ExecutionDate.valueDate;
    }
    if (fields.RenewalDate?.valueDate) {
      result.renewalDate = fields.RenewalDate.valueDate;
    }

    // Extract other fields
    if (fields.Jurisdictions?.valueArray) {
      result.jurisdiction = fields.Jurisdictions.valueArray
        .map((j) => j.valueString || '')
        .filter(Boolean)
        .join(', ');
    }
    if (fields.ContractId?.valueString) {
      result.contractId = fields.ContractId.valueString;
    }
    if (fields.ContractTitle?.valueString) {
      result.contractTitle = fields.ContractTitle.valueString;
    }

    // Store all raw fields for debugging
    for (const [key, value] of Object.entries(fields)) {
      result.fields[key] = value.valueString || value.valueDate || value.valueNumber || '';
    }
  }

  return result;
};
