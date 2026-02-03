export interface ExtractedPreviousReport {
  reportNo?: number;
  sentAt?: string; // ISO YYYY-MM-DD
  title?: string;
  rawLine?: string;
  confidence?: number;
}

export interface ExtractedIdentifiers {
  insuredName?: string;
  plaintiffOrClaimant?: string;
  lineSlipNo?: string;
  marketRef?: string;
}

export interface OcrCaseSeedResult {
  previousReports: ExtractedPreviousReport[];
  identifiers: ExtractedIdentifiers;
}

const MONTHS_HEBREW_TO_ENGLISH: Record<string, string> = {
  ינואר: 'January',
  פברואר: 'February',
  מרץ: 'March',
  אפריל: 'April',
  מאי: 'May',
  יוני: 'June',
  יולי: 'July',
  אוגוסט: 'August',
  ספטמבר: 'September',
  אוקטובר: 'October',
  נובמבר: 'November',
  דצמבר: 'December',
};

const normalizeLine = (line: string): string => {
  let text = line.trim();
  // Common OCR mistakes
  text = text.replace(/Reporl/gi, 'Report');
  text = text.replace(/Rep0rt/gi, 'Report');
  text = text.replace(/Repcrt/gi, 'Report');
  text = text.replace(/\s+/g, ' ');
  return text;
};

const parseDateString = (dateStr: string): string | undefined => {
  try {
    let normalized = dateStr;
    Object.entries(MONTHS_HEBREW_TO_ENGLISH).forEach(([he, en]) => {
      const re = new RegExp(he, 'gi');
      normalized = normalized.replace(re, en);
    });
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
};

export async function ocrReportsFromImage(
  imageDataUrl: string,
): Promise<OcrCaseSeedResult> {
  try {
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(imageDataUrl, 'eng+heb', {
      logger: () => undefined,
    });

    const lines: Array<{ text: string; confidence?: number }> =
      // @ts-expect-error – tesseract.js typings are loose
      result?.data?.lines ||
      (result?.data?.text
        ?.split(/\r?\n/)
        .filter((t: string) => t.trim().length > 0)
        .map((t: string) => ({ text: t })) || []);

    const reports: ExtractedPreviousReport[] = [];
    const identifiers: ExtractedIdentifiers = {};

    // Pattern: "Report 5 - Some title, January 3, 2024"
    const monthPattern =
      '(January|February|March|April|May|June|July|August|September|October|November|December|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)';
    const reportLineRegex = new RegExp(
      `Report\\s*(\\d+)\\s*-\\s*(.*?),\\s*(${monthPattern}\\s+\\d{1,2},\\s*\\d{4})\\.?\$`,
      'i',
    );

    const lineSlipRegex = /^\s*(Line\s*Slip\s*No\.?|LineSlip\s*No\.?)\s*[:\-]?\s*(.+)\s*$/i;
    const marketRefRegex = /^\s*Unique\s+Market\s+Ref\.?\s*[:\-]?\s*(.+)\s*$/i;
    const insuredRegex = /^\s*Insured\s*[:\-]?\s*(.+)\s*$/i;
    const plaintiffRegex = /^\s*(Plaintiff|Claimant)\s*[:\-]?\s*(.+)\s*$/i;

    lines.forEach((line) => {
      const rawLine = line.text || '';
      if (!rawLine.trim()) return;
      const cleaned = normalizeLine(rawLine);

      // Previous reports
      const m = cleaned.match(reportLineRegex);
      if (m) {
        const reportNo = Number.parseInt(m[1], 10);
        const titlePart = (m[2] || '').trim().replace(/[.,]\s*$/, '');
        const dateStr = m[3] || '';
        const sentAt = parseDateString(dateStr);

        if (!reportNo || !sentAt || !titlePart || titlePart.length < 2) return;

        reports.push({
          reportNo,
          title: titlePart,
          sentAt,
          rawLine,
          confidence:
            typeof (line as any).confidence === 'number'
              ? Math.round((line as any).confidence)
              : undefined,
        });
        return;
      }

      // Identifiers
      const mLineSlip = cleaned.match(lineSlipRegex);
      if (mLineSlip && !identifiers.lineSlipNo) {
        identifiers.lineSlipNo = mLineSlip[2].trim();
      }

      const mMarket = cleaned.match(marketRefRegex);
      if (mMarket && !identifiers.marketRef) {
        identifiers.marketRef = mMarket[1].trim();
      }

      const mInsured = cleaned.match(insuredRegex);
      if (mInsured && !identifiers.insuredName) {
        identifiers.insuredName = mInsured[1].trim();
      }

      const mPlaintiff = cleaned.match(plaintiffRegex);
      if (mPlaintiff && !identifiers.plaintiffOrClaimant) {
        identifiers.plaintiffOrClaimant = mPlaintiff[2].trim();
      }
    });

    reports.sort((a, b) => (a.reportNo || 0) - (b.reportNo || 0));

    return { previousReports: reports, identifiers };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('OCR failed', err);
    return { previousReports: [], identifiers: {} };
  }
}


