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
// Default email body content per scenario (British English, Lloyd's-level)
// All start with "Please find attached ..."; no "We are pleased to report".
// First reports (NEW_*): include matter type and policy documentation line.
// TEREM: same wording but policy line omitted (handled at lookup time).
// Update reports (UPDATE_*): no policy mention.
// ---------------------------------------------------------------------------

const UPDATE_BODY = `Dear Zeev,

Please find attached our report providing an update in relation to the matter referenced above.

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

Please find attached our first report in relation to the above-referenced ${matterLabel}${policyLine}.

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
  UPDATE_LAWSUIT: { body: UPDATE_BODY },
  UPDATE_DEMAND: { body: UPDATE_BODY },
  UPDATE_TPN: { body: UPDATE_BODY },
  UPDATE_CAUTION: { body: UPDATE_BODY },
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

/**
 * Returns the default email body for the given scenario.
 * For first-report scenarios and TEREM clients, omits the policy documentation phrase.
 */
function getDefaultBodyForScenario(
  report: ReportData,
  scenario: EmailScenario
): string {
  let body = EMAIL_SCENARIO_CONTENT[scenario].body;
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
