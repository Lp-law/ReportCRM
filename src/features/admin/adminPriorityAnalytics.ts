import { ReportData } from '../../types';
import { scoreReportForAdminAttention } from './adminPriority';
import { ADMIN_PRIORITY_REASONS, AdminPriorityReasonKey } from './adminPriorityReasons';

export type PriorityReasonStat = {
  code: AdminPriorityReasonKey;
  labelHe: string;
  count: number;
  share: number; // 0..1
};

export type AdminPriorityInsights = {
  totalScoredReports: number;
  topReasons: PriorityReasonStat[];
};

const buildInsightsFromCounts = (
  counts: Partial<Record<AdminPriorityReasonKey, number>>,
  totalScoredReports: number,
  topN: number,
): AdminPriorityInsights => {
  if (totalScoredReports === 0) {
    return {
      totalScoredReports: 0,
      topReasons: [],
    };
  }

  const stats: PriorityReasonStat[] = (Object.keys(ADMIN_PRIORITY_REASONS) as AdminPriorityReasonKey[])
    .filter((code) => counts[code])
    .map((code) => {
      const def = ADMIN_PRIORITY_REASONS[code];
      const count = counts[code] || 0;
      const share = count > 0 && totalScoredReports > 0 ? count / totalScoredReports : 0;
      return {
        code,
        labelHe: def.labelHe,
        count,
        share,
      };
    });

  stats.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const weightA = ADMIN_PRIORITY_REASONS[a.code].weight;
    const weightB = ADMIN_PRIORITY_REASONS[b.code].weight;
    if (weightB !== weightA) return weightB - weightA;
    return a.labelHe.localeCompare(b.labelHe, 'he-IL');
  });

  return {
    totalScoredReports,
    topReasons: stats.slice(0, topN),
  };
};

export function computeAdminPriorityInsights(
  reports: ReportData[],
  canTranslate: (r: ReportData | null | undefined) => boolean,
  topN: number = 5,
): AdminPriorityInsights {
  const counts: Partial<Record<AdminPriorityReasonKey, number>> = {};
  let totalScoredReports = 0;

  for (const report of reports) {
    if (report.deletedAt) continue;
    const { score, reasons } = scoreReportForAdminAttention(report, canTranslate);
    if (score <= 0) continue;
    totalScoredReports += 1;
    for (const reason of reasons) {
      const code = reason.code as AdminPriorityReasonKey;
      if (!ADMIN_PRIORITY_REASONS[code]) continue;
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  return buildInsightsFromCounts(counts, totalScoredReports, topN);
}

export function computeAdminPriorityInsightsFromScored(
  scoredItems: { score: number; reasons: { code: string }[] }[],
  topN: number = 5,
): AdminPriorityInsights {
  const counts: Partial<Record<AdminPriorityReasonKey, number>> = {};
  let totalScoredReports = 0;

  for (const item of scoredItems) {
    if (item.score <= 0) continue;
    totalScoredReports += 1;
    for (const reason of item.reasons) {
      const code = reason.code as AdminPriorityReasonKey;
      if (!ADMIN_PRIORITY_REASONS[code]) continue;
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  return buildInsightsFromCounts(counts, totalScoredReports, topN);
}


