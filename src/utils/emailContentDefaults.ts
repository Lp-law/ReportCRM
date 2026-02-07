import type { ReportData } from '../types';
import { buildReportSubject } from './reportFileName';

// ---------------------------------------------------------------------------
// EmailScenario — explicit scenario for default email wording
// ---------------------------------------------------------------------------

export type EmailScenario =
  | 'NEW_LAWSUIT_FIRST'
  | 'NEW_DEMAND_FIRST'
  | 'NEW_TPN_FIRST'
  | 'NEW_CAUTION_FIRST'
  | 'UPDATE_LAWSUIT'
  | 'UPDATE_DEMAND'
  | 'UPDATE_TPN'
  | 'UPDATE_CAUTION';

const isFirstReport = (report: ReportData): boolean =>
  (report.reportHistory?.length ?? 0) === 0;

type MatterKind = 'lawsuit' | 'demand' | 'tpn' | 'caution';

function getMatterKind(report: ReportData): MatterKind {
  const tag = (report.filenameTag || '').toLowerCase();
  const title = (report.plaintiffTitle || '').toLowerCase();
  if (tag.includes('third-party') || tag.includes('third party')) return 'tpn';
  if (tag.includes('caution') || tag.includes('warning')) return 'caution';
  if (title === 'claimant' || tag.includes('demand')) return 'demand';
  return 'lawsuit';
}

/**
 * Resolves the email scenario from report state.
 * Deterministic: uses reportHistory.length, filenameTag, plaintiffTitle.
 * TEREM is not part of the scenario (handled when applying content).
 */
export function resolveEmailScenario(report: ReportData): EmailScenario {
  const first = isFirstReport(report);
  const kind = getMatterKind(report);
  if (first) {
    switch (kind) {
      case 'demand':
        return 'NEW_DEMAND_FIRST';
      case 'tpn':
        return 'NEW_TPN_FIRST';
      case 'caution':
        return 'NEW_CAUTION_FIRST';
      default:
        return 'NEW_LAWSUIT_FIRST';
    }
  }
  switch (kind) {
    case 'demand':
      return 'UPDATE_DEMAND';
    case 'tpn':
      return 'UPDATE_TPN';
    case 'caution':
      return 'UPDATE_CAUTION';
    default:
      return 'UPDATE_LAWSUIT';
  }
}

// ---------------------------------------------------------------------------
// Subject prefix per scenario (British English, Lloyd's / insurer correspondence)
// Used only when no emailSubjectDraft exists.
// ---------------------------------------------------------------------------

export const EMAIL_SCENARIO_SUBJECT_PREFIX: Record<EmailScenario, string> = {
  NEW_LAWSUIT_FIRST: 'New Lawsuit – ',
  NEW_DEMAND_FIRST: 'New Letter of Demand – ',
  NEW_TPN_FIRST: 'New Third Party Notice – ',
  NEW_CAUTION_FIRST: 'New Caution Notice – ',
  UPDATE_LAWSUIT: 'Update – Lawsuit – ',
  UPDATE_DEMAND: 'Update – Letter of Demand – ',
  UPDATE_TPN: 'Update – Third Party Notice – ',
  UPDATE_CAUTION: 'Update – Caution Notice – ',
};

/** Recommended template label per scenario (UI guidance only; non-binding) */
export const RECOMMENDED_TEMPLATE_LABEL: Record<EmailScenario, string> = {
  NEW_LAWSUIT_FIRST: 'New Matter Notification',
  NEW_DEMAND_FIRST: 'New Matter Notification',
  NEW_TPN_FIRST: 'New Matter Notification',
  NEW_CAUTION_FIRST: 'New Matter Notification',
  UPDATE_LAWSUIT: 'Matter Update',
  UPDATE_DEMAND: 'Matter Update',
  UPDATE_TPN: 'Matter Update',
  UPDATE_CAUTION: 'Matter Update',
};

/**
 * Default email subject with scenario-based prefix when no draft exists.
 * If report.emailSubjectDraft is set, returns it unchanged.
 * Otherwise returns prefix + buildReportSubject(report).
 */
export function buildSmartEmailSubject(report: ReportData): string {
  const draft = report.emailSubjectDraft?.trim();
  if (draft) return draft;
  const scenario = resolveEmailScenario(report);
  const prefix = EMAIL_SCENARIO_SUBJECT_PREFIX[scenario];
  const base = buildReportSubject(report);
  return prefix + base;
}

// ---------------------------------------------------------------------------
// Default email body content per scenario (British English, Lloyd's-level)
// All start with "Please find attached ..."; no "We are pleased to report".
// First reports (NEW_*): matter type + policy documentation (omitted for TEREM at lookup).
// Update reports (UPDATE_*): standard wording or "further update" when history length > 1.
// ---------------------------------------------------------------------------

/** Standard update (first follow-up); used when reportHistory.length === 1 */
const UPDATE_BODY_STANDARD = `Dear Zeev,

Please find attached our report advising of an update in respect of the matter referenced above.

Kind regards,
Lior`;

/** Further update (continuity); used when reportHistory.length > 1 */
const UPDATE_BODY_FURTHER = `Dear Zeev,

Please find attached our report advising of a further update in respect of the matter referenced above.

Kind regards,
Lior`;

const FIRST_REPORT_BODY = (
  matterLabel: string,
  withPolicy: boolean
): string => {
  const policyLine = withPolicy
    ? ', together with the relevant policy documentation'
    : '';
  return `Dear Zeev,

Please find attached our first report in respect of the above-referenced ${matterLabel}${policyLine}.

Kind regards,
Lior`;
};

export const EMAIL_SCENARIO_CONTENT: Record<EmailScenario, { body: string }> = {
  NEW_LAWSUIT_FIRST: {
    body: FIRST_REPORT_BODY('lawsuit', true),
  },
  NEW_DEMAND_FIRST: {
    body: FIRST_REPORT_BODY('letter of demand', true),
  },
  NEW_TPN_FIRST: {
    body: FIRST_REPORT_BODY('third-party notice', true),
  },
  NEW_CAUTION_FIRST: {
    body: FIRST_REPORT_BODY('caution notice', true),
  },
  UPDATE_LAWSUIT: { body: UPDATE_BODY_STANDARD },
  UPDATE_DEMAND: { body: UPDATE_BODY_STANDARD },
  UPDATE_TPN: { body: UPDATE_BODY_STANDARD },
  UPDATE_CAUTION: { body: UPDATE_BODY_STANDARD },
};

const POLICY_PHRASE = ', together with the relevant policy documentation.';

const isTEREM = (insuredName?: string): boolean =>
  (insuredName || '').trim().toUpperCase().includes('TEREM');

function isFirstReportScenario(scenario: EmailScenario): boolean {
  return (
    scenario === 'NEW_LAWSUIT_FIRST' ||
    scenario === 'NEW_DEMAND_FIRST' ||
    scenario === 'NEW_TPN_FIRST' ||
    scenario === 'NEW_CAUTION_FIRST'
  );
}

function isUpdateScenario(scenario: EmailScenario): boolean {
  return (
    scenario === 'UPDATE_LAWSUIT' ||
    scenario === 'UPDATE_DEMAND' ||
    scenario === 'UPDATE_TPN' ||
    scenario === 'UPDATE_CAUTION'
  );
}

/**
 * Returns the default email body for the given scenario.
 * First-report + TEREM: policy phrase omitted.
 * Update scenarios: "further update" when reportHistory.length > 1, else standard update.
 */
function getDefaultBodyForScenario(
  report: ReportData,
  scenario: EmailScenario
): string {
  let body: string;
  if (isUpdateScenario(scenario)) {
    const historyLength = report.reportHistory?.length ?? 0;
    body = historyLength > 1 ? UPDATE_BODY_FURTHER : UPDATE_BODY_STANDARD;
  } else {
    body = EMAIL_SCENARIO_CONTENT[scenario].body;
  }
  if (isFirstReportScenario(scenario) && isTEREM(report.insuredName)) {
    body = body.replace(POLICY_PHRASE, '.');
  }
  return body;
}

/**
 * Build deterministic default email subject and body by report type.
 * Used only when opening Compose and when report has no existing draft.
 * Does not override emailSubjectDraft or emailBodyDraft.
 */
export function buildDefaultEmailContent(report: ReportData): {
  subject: string;
  body: string;
} {
  const subject = buildReportSubject(report);
  const scenario = resolveEmailScenario(report);
  const body = getDefaultBodyForScenario(report, scenario);
  return { subject, body };
}
