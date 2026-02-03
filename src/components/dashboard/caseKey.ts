import type { ReportData } from '../../types';

const norm = (s?: string) => (s || '').trim().toLowerCase();

export const getCaseKey = (r: ReportData): string => {
  const o = (r.odakanitNo || '').trim();
  if (o) return `odakanit:${o}`;

  const parts = [
    `umr:${norm(r.marketRef)}`,
    `line:${norm(r.lineSlipNo)}`,
    `cert:${norm(r.certificateRef)}`,
    `insured:${norm(r.insuredName)}`,
    `plaintiff:${norm(r.plaintiffName)}`,
  ].filter((p) => !p.endsWith(':'));

  return parts.length ? parts.join('|') : `id:${r.id}`;
};


