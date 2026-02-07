
// Add this to the top of the file to handle the speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

export enum SectionType {
  UPDATE = 'Update',
  RISK_ASSESSMENT = 'Risk Assessment',
  RECOMMENDATIONS = 'Recommendations',
  NEW_LAWSUIT = 'New Lawsuit',
  LETTER_OF_DEMAND = 'Letter of Demand',
  EXPENSES = 'Expenses',
  OTHER = 'Other',
}

export type ReportStatus = 'TASK_ASSIGNED' | 'DRAFT' | 'WAITING_FOR_INVOICES' | 'PENDING_REVIEW' | 'APPROVED' | 'READY_TO_SEND' | 'SENT';

export type UserRole = 'ADMIN' | 'SUB_ADMIN' | 'FINANCE' | 'LAWYER';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  role: UserRole;
}

// --- Hebrew review workflow types (LAWYER → ADMIN) ---

export type ReportReviewIssueSeverity = 'CRITICAL' | 'NORMAL' | 'STYLE';

export type ReviewIssueOrigin = 'INTERNAL' | 'EXTERNAL';

export type ReportReviewIssueType =
  | 'MISSING_INFO'
  | 'INCONSISTENCY'
  | 'WORDING'
  | 'DATE'
  | 'NUMBERS'
  | 'SOURCE_DOC'
  | 'OTHER';

export type ReportReviewIssueStatus = 'OPEN' | 'DONE';

export interface ReportReviewIssue {
  id: string;
  createdAt: string;
  createdByUserId: string;
  sectionKey?: string; // e.g. 'FACTUAL_BACKGROUND', 'EXPERT_OPINION', etc.
  severity: ReportReviewIssueSeverity;
  type: ReportReviewIssueType;
  title: string;
  instruction: string; // מה בדיוק לעשות
  status: ReportReviewIssueStatus;
  doneAt?: string;
  origin?: ReviewIssueOrigin;
  externalRefId?: string;
  externalAction?: 'ENGLISH_ONLY' | 'REQUIRES_HEBREW';
}

// Minimal payload used when creating new review issues from the UI
export interface NewIssueInput {
  sectionKey?: string;
  severity: ReportReviewIssueSeverity;
  type: ReportReviewIssueType;
  title: string;
  instruction: string;
  externalAction?: 'ENGLISH_ONLY' | 'REQUIRES_HEBREW';
}

export type ReportReviewStatus = 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED';

export interface ReportReview {
  submittedAt?: string;
  submittedByUserId?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  status: ReportReviewStatus;
  issues: ReportReviewIssue[];
}

export type HebrewWorkflowStatus =
  | 'HEBREW_DRAFT'
  | 'HEBREW_SUBMITTED'
  | 'HEBREW_CHANGES_REQUESTED'
  | 'HEBREW_APPROVED'
  | 'HEBREW_REOPENED_EXTERNAL';

export interface PreviousReport {
  id: string;
  reportNumber: number;
  subject: string;
  date: string;
  sent?: boolean;
  fileName?: string;
  snapshot?: ReportSnapshot;
  /**
   * Optional metadata to distinguish corrected resends (content revisions) from simple resends.
   * - isCorrection: true when the resend reflected a content/financial correction before lock.
   * - correctionReason: optional free-text reason provided by the user (if collected).
   * - revisionIndex: monotonically increasing index of the correction for this reportNumber.
   */
  isCorrection?: boolean;
  correctionReason?: string;
  revisionIndex?: number;
}

export interface Recipient {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  role: string;
  address?: string;
}

export interface InvoiceFile {
  id: string;
  name: string;
  data: string; // Base64
  type: string;
}

// --- Procedural Timeline (new, structured timeline for COVER + Timeline page) ---

export type ProceduralProcedureType = 'LETTER_OF_DEMAND' | 'FIRST_INSTANCE' | 'APPEAL';

export type ProceduralTimelineStageId =
  // Letter of Demand
  | 'LOD_ISSUED'
  | 'LOD_INTERNAL_REVIEW'
  | 'LOD_RESPONSE'
  | 'LOD_PRE_LITIGATION'
  | 'LOD_OUTCOME_ESCALATION'
  | 'LOD_CLAIM_SETTLED'
  | 'LOD_DEMAND_REJECTED'
  // First Instance Proceedings
  | 'FI_STATEMENT_OF_CLAIM'
  | 'FI_STATEMENT_OF_DEFENCE'
  | 'FI_DISCOVERY_DISCLOSURE'
  | 'FI_COURT_APPOINTED_EXPERT'
  | 'FI_RD_DOCS_DAMAGE_SUBMISSIONS'
  | 'FI_EVIDENTIARY_HEARINGS'
  | 'FI_SUMMATIONS'
  | 'FI_JUDGMENT'
  // Appeal Proceedings
  | 'AP_DECISION_TO_APPEAL'
  | 'AP_NOTICE_OF_APPEAL'
  | 'AP_RESPONSE_TO_APPEAL'
  | 'AP_APPEAL_HEARINGS'
  | 'AP_APPEAL_JUDGMENT';

export interface ProceduralTimelineStage {
  id: ProceduralTimelineStageId;
  /**
   * Display label – must always be taken from a stable dictionary on the client,
   * never free‑typed by the user.
   */
  label: string;
  include: boolean;
  isDynamic: boolean;
  /**
   * Optional Month+Year marker for this stage.
   * Stored in a structured format (e.g. "2026-10") and rendered as "October 2026".
   */
  monthYear?: string | null;
}

export interface ProceduralTimeline {
  procedureType: ProceduralProcedureType;
  /**
   * Exactly one current stage per timeline.
   */
  currentStageId: ProceduralTimelineStageId;
  stages: ProceduralTimelineStage[];
}

export interface ExpenseItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
}

export interface ReportData {
  id: string; // Unique ID for the report
  createdBy: string; // User ID of the lawyer
  ownerName: string; // Name of the lawyer (for dashboard display)
  ownerEmail?: string; // Email of the lawyer for the Send flow
  /**
   * Sequential number of this report within the case (1 = first report, 2 = second, etc.)
   * For legacy reports this may be undefined; newer flows should set it explicitly.
   */
  reportNumber?: number;
  
  // Meta
  reportDate: string;
  status: ReportStatus; 
  hebrewWorkflowStatus?: HebrewWorkflowStatus; // Hebrew drafting workflow status for ADMIN review
  odakanitNo?: string; // Internal Case Number
  reportSubject?: string; // Explicit subject/RE line for the report cover & email
  isSubjectAuto?: boolean; // Tracks if reportSubject was auto-generated from parties/insured
  updatedAt?: string; // Last updated timestamp for dashboard sorting
  
  // Recipient & Case Info
  recipientId: string;
  insurerName: string;
  lineSlipNo: string;
  marketRef: string;
  certificateRef?: string;
  insuredName: string;
  plaintiffName: string;
  plaintiffTitle: 'Plaintiff' | 'Claimant';
  sentAt?: string;
  policyPeriodStart?: string;
  policyPeriodEnd?: string;
  retroStart?: string;
  retroEnd?: string;

  // Report History (Dynamic Table)
  reportHistory: PreviousReport[];

  // Financial Expenses – linkage & final snapshot (Phase 5 data layer)
  expensesSheetId?: string | null; // ONE_TO_ONE: linked FinancialExpensesSheet (if persisted)
  expensesDataSnapshotFinal?: ExpensesDataSnapshotFinal | null;
  expensesSnapshotHash?: string | null;
  expensesSnapshotAt?: string | null;
  insurerRulesetIdAtSend?: string | null;
  insurerRulesetVersionAtSend?: string | null;
  paymentReference?: string | null;
  amountPaid?: number | null;
  paidAt?: string | null;

  // Supersede chain for financial reports (do not delete history, just link newer/older)
  supersededByReportId?: string | null;
  supersedesReportId?: string | null;

  /**
   * Optional metadata for auto-generated Update summary in follow-up reports.
   * When a new report (Report #N+1) is created for an existing case, we may
   * seed the Update section with a short summary of the last SENT report
   * ("כזכור, בדיווחים האחרונים..."). These fields track the source and
   * whether the user has since edited that summary manually.
   */
  updateAutoSummarySourceReportId?: string | null;
  updateAutoSummaryGeneratedAt?: string | null;
  updateAutoSummaryEdited?: boolean;

  /**
   * Locking & editing window metadata for SENT reports.
   *
   * firstSentAt:
   * - The timestamp of the FIRST time this report was sent to the broker.
   * - Set exactly once, on the initial successful send, and never changed afterwards.
   *
   * manualLockedAt / manualLockedBy* / manualLockReason:
   * - When an ADMIN explicitly locks a report for editing (even before auto-lock),
   *   these fields capture who did it, when, and why.
   *
   * lockExtensions:
   * - Optional list of "extend editing window" actions (e.g. +35 days) approved by ADMIN,
   *   each with its own audit trail.
   */
  firstSentAt?: string | null;
  manualLockedAt?: string | null;
  manualLockedById?: string | null;
  manualLockedByName?: string | null;
  manualLockReason?: string | null;
  lockExtensions?: {
    extendedAt: string;
    extendedById: string;
    extendedByName: string;
    days: number;
    reason: string;
  }[] | null;

  /**
   * Optional metadata for admin override sessions on locked (SENT) reports.
   * When an ADMIN explicitly opens a SENT report for editing, these fields
   * capture who approved it, when, and why. They are informational only and
   * do not change the legal status of the report by themselves.
   */
  lastAdminOverrideAt?: string | null;
  lastAdminOverrideById?: string | null;
  lastAdminOverrideByName?: string | null;
  lastAdminOverrideReason?: string | null;

  // Optional meta for post-send feedback from insurer
  postSendFeedbackMeta?: {
    lastFeedbackAt?: string;
    reopenedDueToFeedbackAt?: string;
  };

  // Hebrew review workflow (LAWYER → ADMIN)
  reportReview?: ReportReview;

  /**
   * Optional metadata for Tone & Risk check – last time a structured Tone & Risk
   * analysis was run on this report. Used for soft guards and assistant context only.
   */
  toneRiskLastRunAt?: string | null;

  // Layout Configuration
  selectedTimeline: string; 
  selectedTimelineImage?: string; 
  filenameTag: string; 

  // New: Structured Procedural Timeline for cover + dedicated page
  proceduralTimeline?: ProceduralTimeline;

  // Sections
  selectedSections: string[]; 
  
  // Content (Keys map to SectionType string values)
  content: Record<string, string>; // Hebrew content
  translatedContent: Record<string, string>; // English content
  expertSummaryMode?: Record<string, 'SINGLE' | 'MULTIPLE'>;

  // New Feature: AI Executive Summary
  executiveSummary?: string;

  // Expenses Special Data (Smart Editor)
  expensesItems: ExpenseItem[]; // Structured data instead of HTML
  expensesSum?: string; // The calculated TOTAL
  paymentRecommendation?: string; 
  isPaid?: boolean; // New: Financial tracking status
  /**
   * Optional rich HTML of the expenses table (במיוחד עבור דוחות פיננסיים מאיריס).
   * כאשר השדה קיים, השרת ישתמש בו כדי להציג טבלת הוצאות מלאה ב‑PDF.
   */
  expensesHtml?: string;
  /**
   * Flag used by client-side migration when לא הצלחנו לבנות מחדש את expensesHtml
   * עבור דו"ח פיננסי קיים. משמש כדי להימנע מניסיונות חוזרים אינסופיים.
   */
  expensesHtmlMissing?: boolean;
  expenseWorksheet?: ExpenseWorksheet;
  reportNotes?: ReportNote[];
  deletedAt?: string;
  deletedBy?: string;
  complaintAnalysis?: MedicalComplaintAnalysis;
  
  // Attachments
  invoiceFiles: InvoiceFile[]; // Invoices added by Finance
  expensesSourceFile?: InvoiceFile; // Word/Excel file with expenses table uploaded by Finance
  policyFile?: InvoiceFile; // Policy file added in Step 1
  attachPolicyAsAppendix?: boolean; // Controls whether policy should be merged as Appendix A in final PDF
  lawyerAppendixFiles?: InvoiceFile[]; // Additional appendices uploaded by the lawyer to be embedded in final PDF
  isWaitingForInvoices: boolean;
  requiresExpenses?: boolean;
  selectedEmailTemplate?: string;
  emailBodyDraft?: string;
  fileNameTitles?: string[];
  emailSubjectDraft?: string;

  /** Minimal audit of last successful email send (read-only, not editable) */
  lastEmailSent?: {
    sentAt: string;
    sentBy: string;
    mailMode: string;
    to: string;
    cc: string;
    subject: string;
  };

  // Admin <-> Sub-Admin Messaging
  financeInstructions?: string; // Message from Finance to Lawyer
  adminMessageToSubAdmin?: string;
  subAdminTaskStatus?: 'PENDING' | 'DONE';

  // State
  isTranslated: boolean;
  /**
   * Hash / fingerprint of the Hebrew content at the time of last translation.
   * משמש לבדוק האם התרגום עלול להיות לא מעודכן ביחס לעברית.
   */
  translationBaseHash?: string | null;
  /**
   * האם ייתכן שהתרגום לא תואם את העברית הנוכחית (הטקסט בעברית השתנה מאז התרגום האחרון).
   */
  translationStale?: boolean;
}

export interface StepProps {
  data: ReportData;
  updateData: (updates: Partial<ReportData>) => void;
  onNext: () => void;
  onBack: () => void;
  currentUser: User;
  /**
   * When true, the step should render in read-only mode for the current report:
   * no mutating actions (save, translate, refine, AI, uploads, section edits).
   * Used primarily for SENT (locked) reports when no admin override is active.
   */
  readOnly?: boolean;
  
  // Shared App State
  timelineGallery: { id: string; name: string; src: string }[];
  onAddTimelineImages: (images: { name: string; src: string }[]) => void;
  onRemoveTimelineImage?: (id: string) => void;
  
  onSaveAndExit: () => void; // Return to dashboard
  // Optional hook to persist in-place edits without leaving the step
  onSaveDraft?: () => void;
  onTranslate?: () => void;
  onImproveEnglish?: () => void;
  onFormatContent?: () => void;
  onSubmitHebrewForReview?: () => void;
  onApproveHebrewForTranslation?: () => void;
  onAddReviewIssues?: (issues: NewIssueInput[]) => void;
  onMarkReviewIssueDone?: (issueId: string) => void;
  onAddExternalFeedbackIssues?: (issues: NewIssueInput[], externalRefId?: string) => void;
  onReopenHebrewDueToExternalFeedback?: () => void;
}

export type ExpenseRowType = 'EXPENSE' | 'ADJUSTMENT';

export type ExpenseRowCategory =
  | 'EXPERT_OUR'
  | 'EXPERT_COURT'
  | 'INVESTIGATION'
  | 'SECONDARY_FEE'
  | 'COURT_FEES'
  | 'PHOTOCOPY'
  | 'MEDICAL_RECORDS'
  | 'ATTORNEY_PHASE_1'
  | 'ATTORNEY_PHASE_2'
  | 'ATTORNEY_PHASE_3'
  | 'ATTORNEY_PHASE_4'
  | 'ATTORNEY_PHASE_5'
  | 'ATTORNEY_EXTRA_HEARING'
  | 'ATTORNEY_THIRD_PARTY'
  | 'COMPENSATION_JUDGMENT'
  | 'COMPENSATION_SETTLEMENT'
  | 'DEDUCTIBLE'
  | 'PAID_BY_INSURER'
  | 'OTHER';

export interface ExpenseWorksheetRow {
  id: string;
  type: ExpenseRowType;
  category: ExpenseRowCategory;
  label: string;
  serviceProvider?: string;
  amount: number;
  locked?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface ExpenseWorksheetHistoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
}

export interface ExpenseWorksheetNote {
  id: string;
  rowId?: string;
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface ExpenseFavorite {
  id: string;
  category: ExpenseRowCategory;
  label: string;
  serviceProvider: string;
}

export interface ExpenseWorksheetTotals {
  totalExpenses: number;
  totalAdjustments: number;
  totalBalance: number;
}

export interface ExpenseWorksheet {
  status: 'DRAFT' | 'LOCKED';
  rows: ExpenseWorksheetRow[];
  history: ExpenseWorksheetHistoryEntry[];
  notes: ExpenseWorksheetNote[];
  favorites: ExpenseFavorite[];
  totals: ExpenseWorksheetTotals;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
}

// ---------------------------------------------------------------------------
// Phase 5 – Financial Expenses Data Layer (Server/DB-ready domain types)
// ---------------------------------------------------------------------------

export type FinancialExpenseSheetStatus =
  | 'DRAFT'
  | 'READY_FOR_REPORT'
  | 'ATTACHED_TO_REPORT'
  | 'ARCHIVED';

export type FinancialExpenseSheetArchivedReason =
  | 'USED_IN_REPORT'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | null;

export interface FinancialExpenseSheet {
  id: string;
  caseId: string;
  insurerId?: string | null;
  insurerName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  periodLabel?: string | null;
  versionIndex: number;
  status: FinancialExpenseSheetStatus;
  archivedReason: FinancialExpenseSheetArchivedReason;
  currency: string;
  deductibleAmount?: number | null;
  alreadyPaidAmount?: number | null;
  infoOnly: boolean;
  attachedToReportId?: string | null; // ONE_TO_ONE with Report.id
  attachedAt?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  readyAt?: string | null;
  sheetVersionNumber: number;
  sheetVersionHash: string;
  insurerRulesetId?: string | null;
  insurerRulesetVersion?: string | null;
}

export interface FinancialPaymentEvent {
  id: string;
  caseId: string;
  sheetId?: string | null;
  amount: number;
  paidAt: string; // ISO timestamp of when the insurer actually paid
  reference?: string | null;
  note?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FinancialExpenseLineItemKind =
  | 'EXPENSE'
  | 'ADJUSTMENT'
  | 'COMPENSATION';

export type FinancialCompensationSource = 'SETTLEMENT' | 'COURT';

export interface FinancialExpenseLineItem {
  id: string;
  sheetId: string;
  kind: FinancialExpenseLineItemKind;
  compensationSource?: FinancialCompensationSource | null;
  expenseType?: string | null;
  providerName?: string | null;
  providerId?: string | null;
  description: string;
  date?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  vatRate?: number | null;
  isIncludedInRequestedAmount: boolean;
  lineNetAmount?: number | null;
  lineVatAmount?: number | null;
  lineTotalAmount?: number | null;
  attachmentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialExpenseAttachment {
  id: string;
  sheetId: string;
  fileKey: string; // storageKey / URL / fileId – implementation-specific
  originalFileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId: string;
  uploadedAt: string;
  linkedLineItemId?: string | null;
}

export type FinancialExpenseAuditEntityType =
  | 'SHEET'
  | 'LINE_ITEM'
  | 'ATTACHMENT'
  | 'REPORT';

export interface FinancialExpenseAuditLogEntry {
  id: string;
  sheetId: string;
  actorUserId: string;
  actorRole: string;
  eventType: string;
  eventAt: string;
  entityType: FinancialExpenseAuditEntityType;
  entityId?: string | null;
  diffJson?: unknown;
  sheetVersionNumberAtEvent: number;
  sheetVersionHashAtEvent: string;
}

export type InsurerPolicyFamily = 'STRICT' | 'PARTIAL' | 'FLEXIBLE';

export interface InsurerRuleset {
  insurerId: string;
  policyFamily: InsurerPolicyFamily;
  requiredAttachmentTypes: string[];
  requireAttachmentPerLine: boolean;
  requireAttachmentForExpenseTypes: string[];
  amountThresholdRequiringAttachment?: number | null;
  infoOnlyTextVariant?: string | null;
  notesInternal?: string | null;
  rulesetVersion: string;
  updatedAt: string;
}

// Lidor (SUB_ADMIN) financial sheets query DTOs
export interface LidorFinancialSheetListItem {
  sheetId: string;
  caseId: string;
  insurerName?: string | null;
  status: FinancialExpenseSheetStatus;
  versionIndex: number;
  updatedAt: string;
  readyAt?: string | null;
  attachedAt?: string | null;
  sentAt?: string | null;
  amountToRequest: number;
  infoOnly: boolean;
  expensesOutOfSync?: boolean;
  blockingIssueCodesLatest?: string[];
}

export interface LidorFinancialCounts {
  readyCount: number;
  attachedCount: number;
  sentCount: number;
  exceptionsCount: number;
}

export interface LidorFinancialExceptionSummary {
  count: number;
  samples: {
    sheetId: string;
    caseId: string;
    reason: string;
    updatedAt?: string;
    amountToRequest?: number;
    failedAttempts?: number;
  }[];
}

export interface LidorFinancialKpis {
  sla: {
    draftToReadyAvgHours: number | null;
    draftToReadyMedianHours: number | null;
    readyToAttachedAvgHours: number | null;
    readyToAttachedMedianHours: number | null;
    attachedToSentAvgHours: number | null;
    attachedToSentMedianHours: number | null;
  };
  volumes: {
    totalSheets: number;
    totalSentReports: number;
    totalAmountRequested: number;
    infoOnlyRatio: number | null;
  };
  exceptions: {
    divergenceOld: LidorFinancialExceptionSummary;
    missingAttachments: LidorFinancialExceptionSummary;
    highAmounts: LidorFinancialExceptionSummary & { threshold: number };
    repeatedBlocks: LidorFinancialExceptionSummary & { threshold: number };
  };
}

export type FinancialExceptionStatusValue = 'IN_PROGRESS' | 'RESOLVED';

export interface FinancialExceptionAnnotation {
  id: string;
  sheetId: string;
  noteType: 'EXCEPTION_STATUS';
  value: FinancialExceptionStatusValue;
  actorUserId: string;
  createdAt: string;
}

// Final expenses snapshot as attached to a sent report
export interface ExpensesDataSnapshotFinal {
  sheetId: string;
  sheetVersionNumber: number;
  sheetVersionHash: string;
  insurerRulesetId?: string | null;
  insurerRulesetVersion?: string | null;
  // Minimal denormalised payload for audit / future analytics
  sheet: FinancialExpenseSheet;
  lineItems: FinancialExpenseLineItem[];
  attachments: FinancialExpenseAttachment[];
}

export type SentReportSnapshot = {
  reportId: string;
  sentAt: string;
  reportNo?: number;
  fileName?: string;
  snapshot: Partial<ReportData>;
  isResend?: boolean;
  resendIndex?: number;
};

export type CaseFolder = {
  odakanitNo: string;
  reTemplate: string;
  insuredName?: string;
  insurerName?: string;
  plaintiffName?: string;
  assignedLawyer?: string;
  marketRef?: string;
  lineSlipNo?: string;
  seededAt?: string; // ISO datetime of last seed
  seedSourceLastReportNo?: number;
  seedSourceLastReportDate?: string; // ISO date (YYYY-MM-DD)
  certificateRef?: string;
  createdAt: string;
  updatedAt: string;
  reportIds: string[];
  sentReports: SentReportSnapshot[];
  /**
   * Optional closure metadata – when set, the case is considered closed and
   * should be hidden from the main dashboards by default.
   */
  closedAt?: string | null;
  closedByUserId?: string | null;
};

export interface ReportNote {
  id: string;
  authorId: string;
  authorName: string;
  message: string;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface SectionTemplate {
  id: string;
  sectionKey: string;
  title: string;
  body: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isEnabled?: boolean;
  orderIndex?: number;
}

export interface ToneRiskIssue {
  id: string;
  sectionKey: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  kind:
    | 'ABSOLUTE_LANGUAGE'
    | 'OVERCONFIDENT_STATEMENT'
    | 'LEGAL_EXPOSURE'
    | 'INCONSISTENT_POSITION'
    | 'NON_PROFESSIONAL_TONE';
  excerpt: string;
  message: string;
  suggestion?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface ToneRiskAnalysisResult {
  ok: boolean;
  runAt: string;
  promptVersion: string;
  issues: ToneRiskIssue[];
  meta: {
    sectionsSent: number;
    charsBefore: number;
    charsAfter: number;
    truncatedSections: number;
  };
  error?: {
    code: 'AUTH' | 'BAD_INPUT' | 'LLM_FAILED' | 'PARSE_FAILED' | 'SCHEMA_FAILED';
    message: string;
  };
}

// --- Smart Assistant (\"העוזר החכם\") ---

export type AssistantIntent =
  | 'explain_current_screen'
  | 'explain_buttons_in_step'
  | 'when_to_use_ai_tools'
  | 'common_mistakes_here'
  | 'pre_send_checks'
  | 'explain_tone_risk'
  | 'explain_paperclip'
  | 'explain_hebrew_rewrite'
  | 'finance_first_time'
  | 'finance_repeat';

export type AssistantRole = 'LAWYER' | 'FINANCE' | 'OPS' | 'ADMIN';

export interface AssistantHelpContext {
  step: 1 | 2 | 3;
  role: AssistantRole;
  screen: string;
  section?: string;
}

export interface AssistantReportMeta {
  hebrewApproved: boolean;
  hasTranslation: boolean;
  translationOutdated: boolean;
  toneRiskRun: boolean;
  expensesLastUpdatedAt?: string;
}

export interface AssistantHelpResponse {
  title: string;
  bullets: string[];
  warning?: string;
  nextSuggestion?: string;
}

export interface HebrewStyleIssue {
  id: string;
  sectionKey: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category:
    | 'SLANG_OR_INFORMAL'
    | 'NON_LEGAL_REGISTER'
    | 'FACT_OPINION_MIX'
    | 'INCONSISTENT_TERMS'
    | 'AMBIGUOUS_OR_OVERBROAD'
    | 'GRAMMAR_OR_CLARITY';
  message: string;
  excerpt: string;
  suggestion?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface HebrewStyleReviewResult {
  runAt: string;
  issues: HebrewStyleIssue[];
  /** When false, AI/server could not complete the review; UI should show friendly message and allow continued work. */
  success?: boolean;
  /** Internal reason for failure (e.g. AI_UNAVAILABLE, TIMEOUT); for logging only, not shown in UI. */
  reason?: string;
}

export interface BestPracticeSnippet {
  id: string;
  sectionKey: string;
  title: string;
  body: string;
  label: 'BEST_PRACTICE' | 'LLOYDS_RECOMMENDED';
  tags?: string[];
  isEnabled?: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  lastUsedAt?: string | null;
  behavior?: 'INSERTABLE' | 'COPY_ONLY';
  sourceReportId?: string;
}

export interface PersonalSnippet {
  id: string;
  title: string;
  body: string;
  /**
   * Optional logical section key this snippet is most relevant for.
   * When undefined, the snippet is treated as global and offered in all sections.
   */
  sectionKey?: string;
  tags?: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  lastUsedAt?: string | null;
}

export interface MedicalComplaintAnalysis {
  caseType?: string;
  briefSummary?: string;
  entities?: {
    plaintiff?: string;
    insured?: string;
    medicalInstitutions?: string[];
    experts?: string[];
  };
  facts?: string[];
  allegations?: string[];
  injuries?: string[];
  medicalFindings?: string[];
  defendants?: string[];
  negligenceTheory?: string[];
  requestedRelief?: string[];
  timeline?: { date?: string; event?: string }[];
  riskAssessment?: string;
  recommendedActions?: string[];
}

export interface ReportSnapshot {
  createdAt: string;
  reportDate: string;
  subject?: string;
  status: ReportStatus;
  odakanitNo?: string;
  recipientId: string;
  insurerName: string;
  lineSlipNo: string;
  marketRef: string;
  certificateRef?: string;
  insuredName: string;
  plaintiffName: string;
  plaintiffTitle: 'Plaintiff' | 'Claimant';
  policyPeriodStart?: string;
  policyPeriodEnd?: string;
  retroStart?: string;
  retroEnd?: string;
  filenameTag: string;
  fileNameTitles?: string[];
  selectedSections: string[];
  content: Record<string, string>;
  translatedContent: Record<string, string>;
  expertSummaryMode?: Record<string, 'SINGLE' | 'MULTIPLE'>;
  executiveSummary?: string;
  complaintAnalysis?: MedicalComplaintAnalysis;
  requiresExpenses?: boolean;
  isWaitingForInvoices: boolean;
  isTranslated: boolean;
  selectedTimeline: string;
  selectedTimelineImage?: string;
  expensesItems?: ExpenseItem[];
  expenseWorksheet?: ExpenseWorksheet;
  expensesSum?: string;
  paymentRecommendation?: string;
  reportNotes?: ReportNote[];
  ownerName: string;
  ownerEmail?: string;
}