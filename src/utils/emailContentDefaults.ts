import type { ReportData } from '../types';
import { buildReportSubject } from './reportFileName';

const isTEREM = (insuredName?: string): boolean =>
  (insuredName || '').trim().toUpperCase().includes('TEREM');

const isFirstReport = (report: ReportData): boolean =>
  (report.reportHistory?.length ?? 0) === 0;

type FirstReportSubtype = 'lawsuit' | 'letter_of_demand' | 'third_party_notice' | 'caution_notice';

function getFirstReportSubtype(report: ReportData): FirstReportSubtype {
  const tag = (report.filenameTag || '').toLowerCase();
  const title = (report.plaintiffTitle || '').toLowerCase();
  if (tag.includes('third-party') || tag.includes('third party')) return 'third_party_notice';
  if (tag.includes('caution') || tag.includes('warning')) return 'caution_notice';
  if (title === 'claimant' || tag.includes('demand')) return 'letter_of_demand';
  return 'lawsuit';
}

/**
 * Build deterministic default email subject and body by report type.
 * Used only when opening Compose and when report has no existing draft.
 * Does not override emailSubjectDraft or emailBodyDraft.
 */
export function buildDefaultEmailContent(report: ReportData): { subject: string; body: string } {
  const subject = buildReportSubject(report);
  const first = isFirstReport(report);
  const terem = isTEREM(report.insuredName);

  if (!first) {
    return {
      subject,
      body: `Dear Zeev,

Please find attached our report providing an update in relation to the matter referenced above.

Kind regards,
Lior`,
    };
  }

  const subtype = getFirstReportSubtype(report);
  let matterLabel: string;
  switch (subtype) {
    case 'letter_of_demand':
      matterLabel = 'letter of demand';
      break;
    case 'third_party_notice':
      matterLabel = 'third-party notice';
      break;
    case 'caution_notice':
      matterLabel = 'caution notice';
      break;
    default:
      matterLabel = 'lawsuit';
  }

  const policyLine = terem
    ? ''
    : ', together with the relevant policy documentation';

  const body = `Dear Zeev,

Please find attached our first report in relation to the above-referenced ${matterLabel}${policyLine}.

Kind regards,
Lior`;

  return { subject, body };
}
