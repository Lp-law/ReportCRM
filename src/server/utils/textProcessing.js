const MAX_DOC_CHARS = Number(process.env.DOC_CHAR_LIMIT || 18000);

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

export {
  MAX_DOC_CHARS,
  flattenCompletionText,
  truncateText,
  parseJsonSafely,
  chunkText,
};
