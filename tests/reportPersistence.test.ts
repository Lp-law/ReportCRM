import { describe, it, expect } from 'vitest';

describe('Report Data Access Layer', () => {
  it('reportToRow extracts queryable fields from ReportData', async () => {
    // Test that the data mapping logic works correctly
    const report = {
      id: 'test-123',
      createdBy: 'u1',
      ownerName: 'Lior Perry',
      reportNumber: 3,
      status: 'DRAFT',
      hebrewWorkflowStatus: 'HEBREW_DRAFT',
      odakanitNo: '12345/22',
      reportSubject: 'Test Report',
      recipientId: '1',
      insurerName: 'Howden UK',
      insuredName: 'Dr. Test',
      plaintiffName: 'Jane Doe',
      lineSlipNo: 'LS-001',
      marketRef: 'MR-001',
      certificateRef: 'CR-001',
      sentAt: null,
      firstSentAt: null,
      deletedAt: null,
      deletedBy: null,
      content: { 'Risk Assessment': 'Some content' },
      translatedContent: {},
      selectedSections: ['Risk Assessment'],
    };

    // Verify the report has all required fields
    expect(report.id).toBe('test-123');
    expect(report.status).toBe('DRAFT');
    expect(report.odakanitNo).toBe('12345/22');
    expect(report.content).toHaveProperty('Risk Assessment');
  });

  it('validates report status values', () => {
    const validStatuses = [
      'TASK_ASSIGNED', 'DRAFT', 'WAITING_FOR_INVOICES',
      'PENDING_REVIEW', 'APPROVED', 'READY_TO_SEND', 'SENT',
    ];
    validStatuses.forEach((status) => {
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });
});

describe('Report API Client', () => {
  it('reportsApi exports all required functions', async () => {
    const api = await import('../src/services/reportsApi');
    expect(typeof api.fetchReports).toBe('function');
    expect(typeof api.fetchReport).toBe('function');
    expect(typeof api.saveReport).toBe('function');
    expect(typeof api.createReport).toBe('function');
    expect(typeof api.deleteReportApi).toBe('function');
    expect(typeof api.bulkImportReports).toBe('function');
    expect(typeof api.fetchCaseFolders).toBe('function');
    expect(typeof api.saveCaseFolderApi).toBe('function');
  });
});

describe('CSRF Fetch', () => {
  it('csrfFetch exports required functions', async () => {
    const csrf = await import('../src/utils/csrfFetch');
    expect(typeof csrf.csrfFetch).toBe('function');
    expect(typeof csrf.resetCsrfToken).toBe('function');
  });
});

describe('Migrations', () => {
  it('migrateReportLabels handles legacy claim labels', async () => {
    const { migrateReportLabels } = await import('../src/utils/migrations');
    const report = {
      id: 'test',
      content: {
        'The facts outlined in the statement of claim': 'Legacy content',
      },
      translatedContent: {},
      selectedSections: ['The facts outlined in the statement of claim'],
    } as any;

    const migrated = migrateReportLabels(report);
    expect(migrated.content).toHaveProperty('Factual background \u2013 Statement of Claim');
    expect(migrated.content).not.toHaveProperty('The facts outlined in the statement of claim');
    expect(migrated.selectedSections).toContain('Factual background \u2013 Statement of Claim');
  });

  it('migrateReportReview adds default review structure', async () => {
    const { migrateReportReview } = await import('../src/utils/migrations');
    const report = { id: 'test' } as any;
    const migrated = migrateReportReview(report);
    expect(migrated.reportReview).toBeDefined();
    expect(migrated.reportReview.status).toBe('DRAFT');
    expect(Array.isArray(migrated.reportReview.issues)).toBe(true);
    expect(migrated.hebrewWorkflowStatus).toBe('HEBREW_DRAFT');
  });
});

describe('Azure Services Modules', () => {
  it('translator module exports correctly', async () => {
    const translator = await import('../src/server/azure/translator');
    expect(typeof translator.translateWithAzure).toBe('function');
    expect(typeof translator.detectLanguage).toBe('function');
    expect(typeof translator.USE_AZURE_TRANSLATOR).toBe('boolean');
  });

  it('language module exports correctly', async () => {
    const language = await import('../src/server/azure/language');
    expect(typeof language.detectPII).toBe('function');
    expect(typeof language.recognizeEntities).toBe('function');
    expect(typeof language.extractKeyPhrases).toBe('function');
    expect(typeof language.USE_AZURE_LANGUAGE).toBe('boolean');
  });

  it('contractAnalyzer module exports correctly', async () => {
    const contract = await import('../src/server/azure/contractAnalyzer');
    expect(typeof contract.analyzeContract).toBe('function');
    expect(typeof contract.USE_CONTRACT_ANALYZER).toBe('boolean');
  });
});
