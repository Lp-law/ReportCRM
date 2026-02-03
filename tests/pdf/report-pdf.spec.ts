import { describe, it, expect } from 'vitest';
import request from 'supertest';
import pdfParse from 'pdf-parse';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { app } from '../../server.js';

// Minimal but realistic report payload for PDF generation
const buildMockReport = () => {
  const nowIso = new Date().toISOString();
  return {
    id: 'test-report-1',
    createdBy: 'lawyer-1',
    ownerName: 'Test Lawyer',
    reportDate: nowIso,
    status: 'DRAFT',
    odakanitNo: 'ODK-12345',
    reportSubject: 'John Doe v. XYZ Medical Center – Claim Update',
    recipientId: '1',
    insurerName: 'ABC Insurance Ltd.',
    lineSlipNo: 'LS-2024-001',
    marketRef: 'UMR-XYZ-2024',
    certificateRef: 'CERT-2024-01',
    insuredName: 'John Doe',
    plaintiffName: 'Jane Roe',
    plaintiffTitle: 'Plaintiff',
    policyPeriodStart: '01/01/2024',
    policyPeriodEnd: '31/12/2024',
    retroStart: '',
    retroEnd: '',
    sentAt: undefined,
    reportHistory: [],
    selectedTimeline: 'standard',
    filenameTag: 'Update',
    selectedSections: ['Update'],
    content: {
      Update:
        'This is a test report body section for automated PDF testing purposes.',
    },
    translatedContent: {},
    invoiceFiles: [],
    isWaitingForInvoices: false,
    requiresExpenses: false,
    isTranslated: false,
    expensesItems: [],
    expenseWorksheet: {
      status: 'DRAFT',
      rows: [],
      history: [],
      notes: [],
      favorites: [],
      totals: { totalExpenses: 0, totalAdjustments: 0, totalBalance: 0 },
    },
    reportNotes: [],
  } as any;
};

// Helper to request PDF and parse text (optionally with an override report payload)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requestAndParsePdf = async (overrideReport?: any) => {
  const mockReport = overrideReport || buildMockReport();

  const res = await request(app)
    .post('/api/render-report-pdf')
    .set('Content-Type', 'application/json')
    // supertest + pdf: ensure we capture raw bytes into a Buffer
    .buffer(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .parse((res: any, callback: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .send({ report: mockReport });

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/pdf/);
  const buffer: Buffer = res.body;
  expect(Buffer.isBuffer(buffer)).toBe(true);
  expect(buffer.byteLength).toBeGreaterThan(50_000);

  const parsed = await pdfParse(buffer);
  const text = parsed.text || '';
  const numpages = parsed.numpages ?? undefined;

  return { text, buffer, numpages };
};

// Build a tiny single-page PDF to act as a fake policy document for appendix tests
const buildTestPolicyPdfBase64 = async (): Promise<string> => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const title = 'Test Policy Document';
  const size = 12;
  const textWidth = font.widthOfTextAtSize(title, size);

  page.drawText(title, {
    x: (width - textWidth) / 2,
    y: height - 72,
    size,
    font,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes).toString('base64');
};

describe('Report PDF generation', () => {
  it('smoke test - generates a valid PDF for a minimal report', async () => {
    await requestAndParsePdf();
  });

  it('includes required cover content and RE line', async () => {
    const { text } = await requestAndParsePdf();

    // Cover title
    expect(text).toMatch(/CLAIM STATUS REPORT/i);
    // RE line label
    expect(text).toMatch(/Re[:\s]/i);
    // Branding – be tolerant to line breaks between "Lior Perry" and "LAW FIRM"
    expect(text).toMatch(/Lior Perry/i);
    expect(text).toMatch(/Law Firm/i);
  });

  it('renders page numbers via Puppeteer footer', async () => {
    const { text } = await requestAndParsePdf();

    // Be tolerant – pdf-parse may flatten or remove spacing, so allow optional spaces
    expect(text).toMatch(/Page\s*\d+\s*of\s*\d+/i);
  });

  it('does not contain legacy letterhead assets or logo file names', async () => {
    const { text } = await requestAndParsePdf();

    expect(text).not.toMatch(/logo-top/i);
    expect(text).not.toMatch(/logo-bottom/i);
    expect(text).not.toMatch(/Critical asset missing/i);
  });

  it('appends policy PDF as Appendix A when policyFile is present and attachPolicyAsAppendix is true', async () => {
    const base = buildMockReport();
    const { numpages: basePages } = await requestAndParsePdf(base);

    const policyBase64 = await buildTestPolicyPdfBase64();

    const reportWithPolicy = {
      ...base,
      attachPolicyAsAppendix: true,
      policyFile: {
        id: 'policy-test',
        name: 'TestPolicy.pdf',
        data: policyBase64,
        type: 'application/pdf',
      },
    } as any;

    const { numpages: withPolicyPages } = await requestAndParsePdf(reportWithPolicy);

    // When page counts are available, PDF with appendix should have more pages
    if (typeof basePages === 'number' && typeof withPolicyPages === 'number') {
      expect(withPolicyPages).toBeGreaterThan(basePages);
    }
  });
});


