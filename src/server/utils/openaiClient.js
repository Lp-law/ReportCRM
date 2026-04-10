import OpenAI from 'openai';
import { flattenCompletionText } from './textProcessing.js';

const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
if (!apiKey) {
  console.warn("Warning: OPENAI_API_KEY is not defined. AI endpoints will not function until it is set.");
}
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

const ensureOpenAI = () => {
  if (!openai) {
    throw new Error('OpenAI client is not configured. Please set OPENAI_API_KEY.');
  }
  return openai;
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

export {
  openai,
  OPENAI_MODEL,
  ensureOpenAI,
  createTextCompletion,
  createTextCompletionWithDiagnostics,
};
