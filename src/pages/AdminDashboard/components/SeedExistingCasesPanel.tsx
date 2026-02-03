import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import type { CaseFolder, ReportData } from '../../../types';
import { USERS } from '../../../constants';
import { ocrReportsFromImage, ExtractedPreviousReport } from '../../../services/ocrReportsFromImage';
import SeedShortcutsSticker from './SeedShortcutsSticker';
import { normalizeOdakanitNo } from '../../../utils/normalizeOdakanitNo';

type SeedStatus = 'MISSING_HISTORY' | 'READY' | 'APPLIED';

export interface SeedCaseDraftReport {
  reportNo: number;
  sentAt: string; // ISO YYYY-MM-DD
  title: string;
}

export interface SeedCaseDraft {
  odakanitNo: string;
  assignedLawyer?: string;
  insurerName?: string;
  insuredName?: string;
  plaintiffName?: string;
  reports: SeedCaseDraftReport[];
  status: SeedStatus;
  screenshotDataUrl?: string;
}

const DRAFT_STORAGE_KEY = 'seedDraftCases_v1';
const FINALIZED_KEY = 'seedDraftFinalized_v1';
const SEED_STALE_DAYS_DEFAULT = 7;

interface Props {
  caseFolders: Record<string, CaseFolder>;
  onUpdateCaseFolders: (updater: (folders: Record<string, CaseFolder>) => Record<string, CaseFolder>) => void;
  reports: ReportData[];
}

interface CaseEditorProps {
  draft: SeedCaseDraft;
  index: number;
  total: number;
  finalized: boolean;
  onChangeDraft: (next: SeedCaseDraft) => void;
  onApply: (draft: SeedCaseDraft) => void;
  onNavigateRelative: (delta: number) => void;
  onResetSeedMeta: () => void;
}

// --- CSV helpers (Excel/Google Sheets‑safe) ---

const normalizeHeaderName = (raw: string): string =>
  raw
    .replace(/^\uFEFF/, '') // strip BOM if present
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '')
    .replace(/[^a-z0-9]/g, '');

const parseCsvRow = (line: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((c) => c.trim());
};

const parseCsv = (
  text: string,
): { drafts: SeedCaseDraft[]; error?: string; delimiter?: string } => {
  const rawLines = text.split(/\r?\n/);
  const trimmedLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (!trimmedLines.length) {
    return { drafts: [], error: 'קובץ CSV ריק. ודא שהעתקת גם את שורת הכותרת וגם את השורות.' };
  }

  const headerLine = trimmedLines[0].replace(/^\uFEFF/, '');
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const hasTabs = headerLine.includes('\t');
  const delimiter =
    semiCount > commaCount ? ';' : commaCount > 0 ? ',' : hasTabs ? '\t' : ',';

  const headerCellsRaw = parseCsvRow(headerLine, delimiter);
  if (!headerCellsRaw.length) {
    return {
      drafts: [],
      error:
        'שורת הכותרת ב‑CSV לא זוהתה. ודא שהשורה הראשונה היא: odakanitNo,assignedLawyer',
    };
  }

  const headerNormalized = headerCellsRaw.map((h) => normalizeHeaderName(h));
  const odakanitIdx = headerNormalized.findIndex((h) => h === 'odakanitno');
  const assignedIdx = headerNormalized.findIndex((h) => h === 'assignedlawyer');

  if (odakanitIdx < 0 || assignedIdx < 0) {
    return {
      drafts: [],
      error:
        'שורת הכותרת אינה תקינה. יש לוודא שהיא כוללת לפחות את העמודות: odakanitNo,assignedLawyer (בסדר כלשהו). לדוגמה:\nodakanitNo,assignedLawyer',
    };
  }

  const drafts: SeedCaseDraft[] = [];
  const seenOdakanit = new Set<string>();

  for (let i = 1; i < trimmedLines.length; i += 1) {
    const line = trimmedLines[i];
    if (!line) continue;
    const cols = parseCsvRow(line, delimiter);
    const rawOd = cols[odakanitIdx] || '';
    const odakanitNo = normalizeOdakanitNo(rawOd);
    if (!odakanitNo) continue;
    if (seenOdakanit.has(odakanitNo)) continue; // first occurrence wins
    seenOdakanit.add(odakanitNo);

    const rawAssigned = (cols[assignedIdx] || '').trim();
    if (!rawAssigned) {
      return {
        drafts: [],
        error: `בשורה ${i + 1} חסר AssignedLawyer עבור תיק ${odakanitNo}. יש להשלים שם משתמש/מזהה עורכת הדין.`,
        delimiter,
      };
    }

    const normalizedAssigned = rawAssigned.toLowerCase();
    const matchedUser = USERS.find(
      (u) =>
        u.id.toLowerCase() === normalizedAssigned ||
        u.username.toLowerCase() === normalizedAssigned,
    );

    if (!matchedUser) {
      const allowedExamples = USERS.map((u) => `${u.username} (id: ${u.id})`).join(', ');
      return {
        drafts: [],
        error: `בשורה ${i + 1} הערך AssignedLawyer="${rawAssigned}" עבור תיק ${odakanitNo} אינו תואם לשום משתמש במערכת.\n` +
          'יש להשתמש בשם המשתמש או במספר המשתמש (id) כפי שמופיעים ברשימת המשתמשים.\n' +
          `ערכים מותרים לדוגמה: ${allowedExamples}`,
        delimiter,
      };
    }

    drafts.push({
      odakanitNo,
      assignedLawyer: rawAssigned,
      reports: [],
      status: 'MISSING_HISTORY',
    });
  }

  if (!drafts.length) {
    return {
      drafts: [],
      error:
        'לא נמצאו שורות תיקים ב‑CSV. ודא שיש לפחות תיק אחד עם odakanitNo ו‑assignedLawyer בכל שורה.',
      delimiter,
    };
  }

  return { drafts, delimiter };
};

const serializeDrafts = (drafts: SeedCaseDraft[]): string => {
  try {
    return JSON.stringify(drafts);
  } catch {
    return '[]';
  }
};

const loadDrafts = (): SeedCaseDraft[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SeedCaseDraft[];
  } catch {
    return [];
  }
};

const saveDrafts = (drafts: SeedCaseDraft[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, serializeDrafts(drafts));
  } catch {
    // ignore
  }
};

const isFinalized = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FINALIZED_KEY) === '1';
  } catch {
    return false;
  }
};

const setFinalized = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FINALIZED_KEY, '1');
  } catch {
    // ignore
  }
};

const isCaseSeedStale = (
  folder: CaseFolder | undefined,
  reports: ReportData[],
  maxAgeDays: number = SEED_STALE_DAYS_DEFAULT,
): boolean => {
  if (!folder) return false;
  const { odakanitNo, seededAt, seedSourceLastReportNo, seedSourceLastReportDate } = folder;
  const key = normalizeOdakanitNo(odakanitNo);
  if (!key) return false;

  const hasSeedMeta = Boolean(seededAt || seedSourceLastReportNo || seedSourceLastReportDate);
  if (!hasSeedMeta) return false;

  // Condition 1 – real reports beyond seed snapshot
  const matchingReports = reports.filter(
    (r) =>
      !r.deletedAt &&
      normalizeOdakanitNo(r.odakanitNo) === key,
  );
  if (matchingReports.length > 0) {
    const seedNo = typeof seedSourceLastReportNo === 'number' ? seedSourceLastReportNo : 0;
    const seedDateMs = seedSourceLastReportDate
      ? new Date(seedSourceLastReportDate).getTime()
      : 0;

    let maxReportNo = 0;
    let maxReportDateMs = 0;

    matchingReports.forEach((r) => {
      if (typeof r.reportNumber === 'number' && r.reportNumber > maxReportNo) {
        maxReportNo = r.reportNumber;
      }
      const t = new Date(r.sentAt || r.reportDate).getTime();
      if (!Number.isNaN(t) && t > maxReportDateMs) {
        maxReportDateMs = t;
      }
    });

    if (maxReportNo > seedNo && seedNo > 0) return true;
    if (maxReportDateMs > seedDateMs && seedDateMs > 0) return true;
  }

  // Condition 2 – seed older than threshold
  if (seededAt) {
    const seededMs = new Date(seededAt).getTime();
    if (!Number.isNaN(seededMs)) {
      const nowMs = Date.now();
      const ageDays = (nowMs - seededMs) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) return true;
    }
  }

  // Condition 3 – seededAt exists but missing last report number
  if (seededAt && (seedSourceLastReportNo == null || Number.isNaN(seedSourceLastReportNo))) {
    return true;
  }

  return false;
};

const SeedExistingCasesPanel: React.FC<Props> = ({ caseFolders: _caseFolders, onUpdateCaseFolders, reports }) => {
  const [drafts, setDrafts] = useState<SeedCaseDraft[]>(() => loadDrafts());
  const [csvText, setCsvText] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showOnlyStale, setShowOnlyStale] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  useEffect(() => {
    saveDrafts(drafts);
  }, [drafts]);

  const finalized = isFinalized();

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.odakanitNo === selectedCaseId) || null,
    [drafts, selectedCaseId],
  );

  const handleDownloadTemplate = () => {
    const header = 'odakanitNo,assignedLawyer\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seed-cases-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleParseCsv = () => {
    const { drafts: next, error, delimiter } = parseCsv(csvText);
    if (error) {
      setCsvError(error);
      setParseInfo(null);
      return;
    }
    setCsvError(null);
    if (next.length) {
      setParseInfo(
        `Loaded ${next.length} cases. Detected delimiter: "${delimiter || ','}".`,
      );
    } else {
      setParseInfo(null);
    }
    setDrafts(next);
  };

  const handleExportJson = () => {
    const json = serializeDrafts(drafts);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seedDraftCases_v1.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearDrafts = () => {
    if (!window.confirm('למחוק את טיוטת ה-Seed (ללא נגיעה בתיקי CaseFolders)?')) return;
    setDrafts([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  };

  const handleFinalize = () => {
    if (!window.confirm('לאחר Finalize הפאנל יהיה לקריאה בלבד. להמשיך?')) return;
    setFinalized();
  };

  const computeRowStatus = (draft: SeedCaseDraft): SeedStatus => {
    if (draft.status === 'APPLIED') return 'APPLIED';
    if (draft.reports && draft.reports.length > 0) return 'READY';
    return 'MISSING_HISTORY';
  };

  const handleApplyToCaseFolder = (draft: SeedCaseDraft) => {
    if (!draft.reports.length) return;
    onUpdateCaseFolders((prev) => {
      const key = normalizeOdakanitNo(draft.odakanitNo);
      if (!key) return prev;
      const existing = prev[key];
      const timestamp = new Date().toISOString();
      const base: CaseFolder = existing || {
        odakanitNo: key,
        reTemplate: existing?.reTemplate || '',
        insuredName: existing?.insuredName || '',
        insurerName: existing?.insurerName || '',
        plaintiffName: existing?.plaintiffName || '',
        marketRef: existing?.marketRef || '',
        lineSlipNo: existing?.lineSlipNo || '',
        certificateRef: existing?.certificateRef || '',
        createdAt: existing?.createdAt || timestamp,
        updatedAt: existing?.updatedAt || timestamp,
        reportIds: existing?.reportIds || [],
        sentReports: existing?.sentReports || [],
      };

      const nextSent = [...base.sentReports];
      let maxReportNo = 0;
      let latestDateIso: string | null = null;

      draft.reports.forEach((r) => {
        if (!r.reportNo || !r.title || !r.sentAt) return;
        const existingIndex = nextSent.findIndex((s) => s.reportNo === r.reportNo);
        const snapshot = {
          odakanitNo: key,
          reportNumber: r.reportNo,
          insurerName: base.insurerName,
          insuredName: draft.insuredName || base.insuredName,
          plaintiffName: draft.plaintiffName || base.plaintiffName,
          reportSubject: r.title,
          reportDate: r.sentAt,
        };
        if (existingIndex >= 0) {
          nextSent[existingIndex] = {
            ...nextSent[existingIndex],
            reportNo: r.reportNo,
            sentAt: r.sentAt,
            snapshot: {
              ...(nextSent[existingIndex].snapshot || {}),
              ...snapshot,
            },
          };
        } else {
          nextSent.push({
            reportId: `seed-${key.replace(/[^\w-]+/g, '_')}-${r.reportNo}`,
            reportNo: r.reportNo,
            sentAt: r.sentAt,
            fileName: undefined,
            snapshot,
          });
        }

        if (r.reportNo > maxReportNo) {
          maxReportNo = r.reportNo;
        }
        if (r.sentAt) {
          if (!latestDateIso || r.sentAt > latestDateIso) {
            latestDateIso = r.sentAt;
          }
        }
      });

      nextSent.sort((a, b) => (a.reportNo || 0) - (b.reportNo || 0));

      const nextInsured =
        draft.insuredName?.trim() || base.insuredName || undefined;
      const nextPlaintiff =
        draft.plaintiffName?.trim() || base.plaintiffName || undefined;
      const nextLineSlip =
        draft.lineSlipNo?.trim() || base.lineSlipNo || undefined;
      const nextMarketRef =
        draft.marketRef?.trim() || base.marketRef || undefined;

      const reLines: string[] = [];
      if (nextInsured || nextPlaintiff) {
        reLines.push(
          `Re: ${nextInsured || ''}${nextInsured && nextPlaintiff ? ' / ' : ''}${
            nextPlaintiff || ''
          }`.trim(),
        );
      }
      if (nextLineSlip) {
        reLines.push(`LineSlip No. ${nextLineSlip}`);
      }
      if (nextMarketRef) {
        reLines.push(`Unique Market Ref: ${nextMarketRef}`);
      }
      const reTemplate = reLines.join('\n');

      const nextFolder: CaseFolder = {
        ...base,
        insuredName: nextInsured || base.insuredName,
        plaintiffName: nextPlaintiff || base.plaintiffName,
        lineSlipNo: nextLineSlip || base.lineSlipNo,
        marketRef: nextMarketRef || base.marketRef,
        assignedLawyer: draft.assignedLawyer || existing?.assignedLawyer,
        reTemplate: reTemplate || base.reTemplate,
        seededAt: timestamp,
        seedSourceLastReportNo: maxReportNo || base.seedSourceLastReportNo,
        seedSourceLastReportDate: latestDateIso || base.seedSourceLastReportDate,
        updatedAt: timestamp,
        sentReports: nextSent,
      };

      return { ...prev, [key]: nextFolder };
    });

    setDrafts((prev) =>
      prev.map((d) =>
        d.odakanitNo === draft.odakanitNo
          ? {
              ...d,
              status: 'APPLIED',
            }
          : d,
      ),
    );
  };

  const tableRows = drafts.map((d) => {
    const status = computeRowStatus(d);
    const reportsCount = d.reports.length;
    const lastDate =
      reportsCount > 0
        ? d.reports
            .map((r) => r.sentAt)
            .filter(Boolean)
            .sort()
            .slice(-1)[0]
        : '';
    const folder = _caseFolders[normalizeOdakanitNo(d.odakanitNo)];
    const stale = isCaseSeedStale(folder, reports);
    const lastSeedInfo = folder?.seededAt || null;
    const seedSummary =
      folder?.seedSourceLastReportNo && folder.seedSourceLastReportDate
        ? `#${folder.seedSourceLastReportNo} (${folder.seedSourceLastReportDate})`
        : '';
    return { draft: d, status, reportsCount, lastDate, stale, lastSeedInfo, seedSummary };
  }).filter((row) => (showOnlyStale ? row.stale : true));

  const totalCases = drafts.length;
  const completedCases = drafts.filter((d) => computeRowStatus(d) === 'APPLIED').length;

  return (
    <div className="mt-6 border border-slate-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-slate-900">Seed Existing Cases (Admin only)</h2>
          <div className="text-[11px] text-slate-600">
            <span className="font-semibold">
              {completedCases} / {totalCases || 0}
            </span>{' '}
            cases completed
            {totalCases > 0 && completedCases === totalCases && (
              <span className="ml-2 text-emerald-600 font-medium">✓ All cases completed</span>
            )}
          </div>
        </div>
        {finalized && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Finalized – read only
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-800">1) Download Template CSV</h3>
          <p className="text-slate-600">
            העתקת המספרים מתוכנת העודכנית לאקסל → שמירה כ‑CSV → ייבוא לכאן. העמודות הנדרשות:
            odakanitNo, assignedLawyer.
          </p>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-900"
            onClick={handleDownloadTemplate}
          >
            Download Seed Template (CSV)
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-slate-800">2) Import Cases CSV</h3>
          <p className="text-slate-600">
            הדבק כאן את תוכן קובץ ה‑CSV (כולל שורת כותרת) ולחץ Parse. הנתונים יישמרו כטיוטה בדפדפן
            בלבד (localStorage).
          </p>
          <textarea
            className="w-full border border-slate-300 rounded p-2 h-24 font-mono"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            disabled={finalized}
          />
          {csvError && (
            <div className="mt-1 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 whitespace-pre-line">
              {csvError}
            </div>
          )}
          {parseInfo && !csvError && (
            <div className="mt-1 text-[11px] text-slate-600">
              {parseInfo}
            </div>
          )}
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleParseCsv}
            disabled={finalized}
          >
            Parse CSV
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-slate-800">Imported Cases</h3>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={showOnlyStale}
              onChange={(e) => setShowOnlyStale(e.target.checked)}
            />
            Show only stale cases
          </label>
        </div>
        {tableRows.length === 0 ? (
          <p className="text-xs text-slate-500">עוד לא יובאו תיקים.</p>
        ) : (
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="min-w-full text-[11px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-right">odakanitNo</th>
                  <th className="px-2 py-1 text-right">Lawyer</th>
                  <th className="px-2 py-1 text-right">Status</th>
                  <th className="px-2 py-1 text-right">Fresh / Stale</th>
                  <th className="px-2 py-1 text-right">#Reports</th>
                  <th className="px-2 py-1 text-right">Last date</th>
                  <th className="px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ draft, status, reportsCount, lastDate, stale, lastSeedInfo, seedSummary }) => (
                  <tr
                    key={draft.odakanitNo}
                    className={`border-t border-slate-200 ${stale ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-2 py-1 font-mono">{draft.odakanitNo}</td>
                    <td className="px-2 py-1">
                      {draft.assignedLawyer ||
                        USERS.find((u) => u.id === draft.assignedLawyer || u.username === draft.assignedLawyer)
                          ?.name ||
                        '—'}
                    </td>
                    <td className="px-2 py-1">
                      {status === 'APPLIED'
                        ? 'APPLIED'
                        : status === 'READY'
                        ? 'READY'
                        : 'MISSING_HISTORY'}
                    </td>
                    <td className="px-2 py-1">
                      {status === 'APPLIED' ? (
                        <div className="space-y-0.5">
                          <div className={stale ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                            {stale ? 'STALE' : 'FRESH'}
                          </div>
                          {lastSeedInfo && (
                            <div className="text-[9px] text-slate-500">
                              Last seeded: {new Date(lastSeedInfo).toLocaleDateString()}
                            </div>
                          )}
                          {seedSummary && (
                            <div className="text-[9px] text-slate-500">
                              Seed based on {seedSummary}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-center">{reportsCount}</td>
                    <td className="px-2 py-1">{lastDate || '—'}</td>
                    <td className="px-2 py-1 text-left">
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 mr-2"
                        onClick={() => setSelectedCaseId(draft.odakanitNo)}
                        disabled={finalized}
                      >
                        {stale ? 'Re-seed' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-emerald-400 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        onClick={() => handleApplyToCaseFolder(draft)}
                        disabled={status === 'MISSING_HISTORY' || finalized}
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDraft && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <CaseEditor
            draft={selectedDraft}
            index={drafts.findIndex((d) => d.odakanitNo === selectedDraft.odakanitNo)}
            total={drafts.length}
            finalized={finalized}
            onChangeDraft={(next) => {
              setDrafts((prev) =>
                prev.map((d) => (d.odakanitNo === next.odakanitNo ? next : d)),
              );
            }}
            onApply={handleApplyToCaseFolder}
            onNavigateRelative={(delta) => {
              const currentIndex = drafts.findIndex(
                (d) => d.odakanitNo === selectedDraft.odakanitNo,
              );
              if (currentIndex < 0) return;
              const nextIndex = currentIndex + delta;
              if (nextIndex < 0 || nextIndex >= drafts.length) return;
              setSelectedCaseId(drafts[nextIndex].odakanitNo);
            }}
            onResetSeedMeta={() => {
              const key = normalizeOdakanitNo(selectedDraft.odakanitNo);
              if (!key) return;
              onUpdateCaseFolders((prev) => {
                const existing = prev[key];
                if (!existing) return prev;
                const { seededAt, seedSourceLastReportNo, seedSourceLastReportDate, ...rest } = existing;
                return { ...prev, [key]: rest as CaseFolder };
              });
              // also clear current draft reports – they will be rebuilt from new OCR
              setDrafts((prev) =>
                prev.map((d) =>
                  d.odakanitNo === selectedDraft.odakanitNo
                    ? { ...d, reports: [], status: 'MISSING_HISTORY' }
                    : d,
                ),
              );
            }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          onClick={handleExportJson}
        >
          Export Draft JSON
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
          onClick={handleClearDrafts}
          disabled={finalized}
        >
          Clear Draft Only
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-emerald-400 text-emerald-700 hover:bg-emerald-50 ml-auto disabled:opacity-50"
          onClick={handleFinalize}
          disabled={finalized}
        >
          Finalize (read‑only)
        </button>
      </div>
    </div>
  );
};

export default SeedExistingCasesPanel;

function CaseEditor({
  draft,
  index,
  total,
  finalized,
  onChangeDraft,
  onApply,
  onNavigateRelative,
  onResetSeedMeta,
}: CaseEditorProps) {
  const [panelError, setPanelError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ reportNo?: string; sentAt?: string; title?: string }[]>(
    [],
  );
  const [proposedReports, setProposedReports] = useState<ExtractedPreviousReport[]>([]);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const numberInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pasteAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // reset errors when switching case
    setPanelError(null);
    setRowErrors([]);
    setProposedReports([]);
  }, [draft.odakanitNo]);

  // Clipboard image paste
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!draft || finalized) return;

      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageItem = Array.from(items).find((item) =>
        item.type && item.type.startsWith('image/'),
      );
      if (!imageItem) {
        // light‑weight message via panel error
        setPanelError('Clipboard does not contain an image.');
        return;
      }

      const blob = imageItem.getAsFile();
      if (!blob) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onChangeDraft({
          ...draft,
          screenshotDataUrl: result,
        });
        setPanelError(null);
      };
      reader.readAsDataURL(blob);
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [draft, finalized, onChangeDraft]);

  // Keyboard shortcuts – scoped to editor
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputLike =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrlOrMeta = isMac ? event.metaKey : event.ctrlKey;

      // Do not interfere with normal typing in inputs unless Ctrl/Cmd is pressed
      if (isInputLike && !ctrlOrMeta) {
        return;
      }

      // Ctrl+S / Cmd+S – Approve & Apply
      if (ctrlOrMeta && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!finalized) {
          if (validateAndMaybeFocusFirstError()) return;
          onApply(draft);
        }
        return;
      }

      // Ctrl+Shift+O / Cmd+Shift+O – OCR
      if (
        ctrlOrMeta &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'o'
      ) {
        event.preventDefault();
        if (!finalized && draft.screenshotDataUrl && !isOcrRunning) {
          void runOcr();
        }
        return;
      }

      // Ctrl+Enter / Cmd+Enter – add row
      if (ctrlOrMeta && !event.shiftKey && !event.altKey && event.key === 'Enter') {
        event.preventDefault();
        if (!finalized) {
          handleAddRow();
        }
        return;
      }

      // Ctrl+Alt+ArrowDown / ArrowUp – navigate cases
      if (
        ctrlOrMeta &&
        event.altKey &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        if (validateAndMaybeFocusFirstError(true)) {
          const ok = window.confirm(
            'This case has invalid rows. Navigate to another case anyway?',
          );
          if (!ok) return;
        }
        onNavigateRelative(delta);
      }

      // Optional: "/" focuses search/filter in list – only when not typing
      if (!ctrlOrMeta && !event.altKey && !event.shiftKey && event.key === '/') {
        const search = document.getElementById('seed-cases-search-input') as
          | HTMLInputElement
          | null;
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draft, finalized, onApply, onNavigateRelative, isOcrRunning]);

  const validateAndMaybeFocusFirstError = (forNavigation = false): boolean => {
    const errors: { reportNo?: string; sentAt?: string; title?: string }[] = [];
    let hasError = false;

    if (!draft.reports || draft.reports.length === 0) {
      setPanelError('לפחות שורה אחת נדרשת.');
      return true;
    }

    const seenNumbers = new Set<number>();

    draft.reports.forEach((r, idx) => {
      const rowErr: { reportNo?: string; sentAt?: string; title?: string } = {};

      if (!Number.isInteger(r.reportNo) || r.reportNo <= 0) {
        rowErr.reportNo = 'מספר דוח חייב להיות מספר חיובי.';
      } else if (seenNumbers.has(r.reportNo)) {
        rowErr.reportNo = 'מספר דוח מוכפל.';
      } else {
        seenNumbers.add(r.reportNo);
      }

      if (!r.sentAt) {
        rowErr.sentAt = 'תאריך נדרש.';
      } else if (Number.isNaN(new Date(r.sentAt).getTime())) {
        rowErr.sentAt = 'תאריך לא תקין.';
      }

      if (!r.title || r.title.trim().length < 2) {
        rowErr.title = 'כותרת נדרשת (לפחות 2 תווים).';
      }

      if (rowErr.reportNo || rowErr.sentAt || rowErr.title) {
        hasError = true;
      }
      errors[idx] = rowErr;
    });

    setRowErrors(errors);
    setPanelError(hasError ? 'נא לתקן את השורות המסומנות.' : null);

    if (hasError && !forNavigation) {
      const firstIdx = errors.findIndex(
        (e) => e.reportNo || e.sentAt || e.title,
      );
      if (firstIdx >= 0 && numberInputRefs.current[firstIdx]) {
        numberInputRefs.current[firstIdx]?.focus();
      }
    }

    return hasError;
  };

  const handleAddRow = () => {
    const maxNo =
      draft.reports.length > 0
        ? Math.max(...draft.reports.map((r) => r.reportNo || 0))
        : 0;
    const next: SeedCaseDraft = {
      ...draft,
      reports: [
        ...draft.reports,
        {
          reportNo: maxNo + 1,
          sentAt: '',
          title: '',
        },
      ],
    };
    onChangeDraft(next);
  };

  const handleAddRowBelow = (rowIndex: number) => {
    const current = draft.reports[rowIndex];
    const maxNo =
      draft.reports.length > 0
        ? Math.max(...draft.reports.map((r) => r.reportNo || 0))
        : 0;
    const baseNo =
      current && Number.isInteger(current.reportNo) && current.reportNo > 0
        ? current.reportNo
        : maxNo;
    const newRow: SeedCaseDraftReport = {
      reportNo: baseNo + 1,
      sentAt: '',
      title: '',
    };
    const nextReports = [...draft.reports];
    nextReports.splice(rowIndex + 1, 0, newRow);
    onChangeDraft({ ...draft, reports: nextReports });
    // Focus the new row's report number after render
    setTimeout(() => {
      const ref = numberInputRefs.current[rowIndex + 1];
      if (ref) {
        ref.focus();
      }
    }, 0);
  };

  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
  ) => {
    if (
      e.key === 'Enter' &&
      e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      if (!finalized) {
        handleAddRowBelow(rowIndex);
      }
    }
  };

  const handleUpdateRow = (
    idx: number,
    field: keyof SeedCaseDraftReport,
    value: string,
  ) => {
    const nextReports = draft.reports.map((r, i) =>
      i === idx
        ? {
            ...r,
            [field]:
              field === 'reportNo' ? Number(value.replace(/[^\d]/g, '')) || 0 : value,
          }
        : r,
    );
    onChangeDraft({ ...draft, reports: nextReports });
  };

  const handleDeleteRow = (idx: number) => {
    const nextReports = draft.reports.filter((_, i) => i !== idx);
    onChangeDraft({ ...draft, reports: nextReports });
  };

  const runOcr = async () => {
    if (!draft.screenshotDataUrl) return;
    setIsOcrRunning(true);
    try {
      const { previousReports, identifiers } = await ocrReportsFromImage(draft.screenshotDataUrl);
      setProposedReports(previousReports);
      const nextDraft: SeedCaseDraft = {
        ...draft,
        insuredName: identifiers.insuredName || draft.insuredName,
        plaintiffName: identifiers.plaintiffOrClaimant || draft.plaintiffName,
        lineSlipNo: identifiers.lineSlipNo || draft.lineSlipNo,
        marketRef: identifiers.marketRef || draft.marketRef,
      };
      onChangeDraft(nextDraft);
      if (!previousReports.length) {
        setPanelError('לא זוהו שורות מהתמונה. ניתן לערוך ידנית.');
      } else {
        setPanelError(null);
      }
    } catch (e) {
      setPanelError('OCR נכשל. אפשר להזין ידנית.');
    } finally {
      setIsOcrRunning(false);
    }
  };

  const applyProposedToTable = () => {
    if (!proposedReports.length) return;
    const rows: SeedCaseDraftReport[] = proposedReports
      .filter((p) => p.reportNo && p.sentAt && p.title)
      .map((p) => ({
        reportNo: p.reportNo as number,
        sentAt: p.sentAt as string,
        title: p.title as string,
      }));
    if (!rows.length) return;
    onChangeDraft({ ...draft, reports: rows });
    setPanelError(null);
    setRowErrors([]);
  };

  const handleScreenshotFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onChangeDraft({
        ...draft,
        screenshotDataUrl: result,
      });
      setPanelError(null);
    };
    reader.readAsDataURL(file);
  };

  const screenshotUrl = draft.screenshotDataUrl;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] relative">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-slate-800">
          Case editor – {draft.odakanitNo}{' '}
          <span className="text-slate-500">
            ({index + 1}/{total})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-[10px] px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={onResetSeedMeta}
            disabled={finalized}
          >
            Re-seed this case
          </button>
          <div className="text-[10px] text-slate-500 hidden md:block">
            קיצורי מקלדת: Ctrl+S / ⌘S – Apply, Ctrl+Enter – הוספת שורה, Ctrl+Shift+O – OCR,
            Ctrl+Alt+↑/↓ – מעבר תיק
          </div>
        </div>
      </div>

      {panelError && (
        <div className="mb-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] text-amber-900">
          {panelError}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {/* Screenshot / OCR column */}
        <div className="space-y-2">
          <div className="font-semibold text-slate-800">Screenshot / OCR</div>
          <div
            ref={pasteAreaRef}
            tabIndex={0}
            className="border border-dashed border-slate-300 rounded-lg p-2 text-center text-slate-600 bg-white cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            onClick={() => pasteAreaRef.current?.focus()}
          >
            <div className="mb-1 font-medium text-slate-800">
              Click here and press Ctrl+V / ⌘V to paste screenshot
            </div>
            <div className="text-[10px] text-slate-500 mb-2">
              or choose file from disk
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshotFileChange}
              disabled={finalized}
              className="mx-auto block text-[10px]"
            />
          </div>

          {screenshotUrl && (
            <div className="mt-2">
              <div className="text-[10px] text-slate-600 mb-1">Preview:</div>
              <div className="border border-slate-200 rounded overflow-hidden bg-white max-h-64 flex items-center justify-center">
                <img src={screenshotUrl} alt="Seed screenshot" className="max-h-64" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={runOcr}
              disabled={!screenshotUrl || finalized || isOcrRunning}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 text-[11px]"
            >
              {isOcrRunning ? 'Running OCR…' : 'Extract Previous Reports from Screenshot'}
            </button>
          </div>

          {proposedReports.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded bg-white p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-slate-800 text-[11px]">
                  Proposed extraction ({proposedReports.length})
                </div>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded bg-slate-800 text-white text-[10px]"
                  onClick={applyProposedToTable}
                  disabled={finalized}
                >
                  Apply to table
                </button>
              </div>
              <div className="max-h-40 overflow-auto text-[10px]">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-1 py-0.5 text-right">#</th>
                      <th className="px-1 py-0.5 text-right">Title</th>
                      <th className="px-1 py-0.5 text-right">Date</th>
                      <th className="px-1 py-0.5 text-right">Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedReports.map((p, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-1 py-0.5 text-right">
                          {p.reportNo ?? '—'}
                        </td>
                        <td className="px-1 py-0.5 text-right">{p.title || '—'}</td>
                        <td className="px-1 py-0.5 text-right">{p.sentAt || '—'}</td>
                        <td className="px-1 py-0.5 text-right">
                          {typeof p.confidence === 'number'
                            ? `${Math.round(p.confidence)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Manual table + identifiers column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-800">Previous reports table</div>
            <button
              type="button"
              onClick={handleAddRow}
              disabled={finalized}
              className="px-2 py-1 rounded border border-slate-300 text-[10px] hover:bg-slate-100"
            >
              + Add row (Ctrl+Enter)
            </button>
          </div>
          <div className="border border-slate-200 rounded bg-white max-h-72 overflow-auto">
            <table className="min-w-full text-[11px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-1 py-1 text-right w-16">Report #</th>
                  <th className="px-1 py-1 text-right w-32">Date</th>
                  <th className="px-1 py-1 text-right">Title</th>
                  <th className="px-1 py-1 text-left w-16" />
                </tr>
              </thead>
              <tbody>
                {draft.reports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-2 text-center text-slate-400 text-[10px]"
                    >
                      אין שורות עדיין. הוסף שורה ידנית או הפעל OCR מהצילום.
                    </td>
                  </tr>
                ) : (
                  draft.reports.map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-1 py-1 align-top">
                        <input
                          ref={(el) => {
                            numberInputRefs.current[idx] = el;
                          }}
                          type="number"
                          className={`w-full border rounded px-1 py-0.5 text-[11px] ${
                            rowErrors[idx]?.reportNo ? 'border-rose-400' : 'border-slate-300'
                          }`}
                          value={r.reportNo ?? ''}
                          onChange={(e) =>
                            handleUpdateRow(idx, 'reportNo', e.target.value)
                          }
                          onKeyDown={(e) => handleRowKeyDown(e, idx)}
                          disabled={finalized}
                        />
                        {rowErrors[idx]?.reportNo && (
                          <div className="mt-0.5 text-[9px] text-rose-600">
                            {rowErrors[idx]?.reportNo}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input
                          type="date"
                          className={`w-full border rounded px-1 py-0.5 text-[11px] ${
                            rowErrors[idx]?.sentAt ? 'border-rose-400' : 'border-slate-300'
                          }`}
                          value={r.sentAt || ''}
                          onChange={(e) =>
                            handleUpdateRow(idx, 'sentAt', e.target.value)
                          }
                          onKeyDown={(e) => handleRowKeyDown(e, idx)}
                          disabled={finalized}
                        />
                        {rowErrors[idx]?.sentAt && (
                          <div className="mt-0.5 text-[9px] text-rose-600">
                            {rowErrors[idx]?.sentAt}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input
                          type="text"
                          className={`w-full border rounded px-1 py-0.5 text-[11px] ${
                            rowErrors[idx]?.title ? 'border-rose-400' : 'border-slate-300'
                          }`}
                          value={r.title}
                          onChange={(e) =>
                            handleUpdateRow(idx, 'title', e.target.value)
                          }
                          onKeyDown={(e) => handleRowKeyDown(e, idx)}
                          disabled={finalized}
                        />
                        {rowErrors[idx]?.title && (
                          <div className="mt-0.5 text-[9px] text-rose-600">
                            {rowErrors[idx]?.title}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1 align-top text-left">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          disabled={finalized}
                          className="px-1.5 py-0.5 rounded border border-slate-300 text-[10px] text-slate-700 hover:bg-slate-100"
                        >
                          מחיקה
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 rounded bg-white p-2 space-y-2">
            <div className="font-semibold text-slate-800 text-[11px]">
              Extracted identifiers
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-600">Insured</label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-0.5 text-[11px] border-slate-300"
                  value={draft.insuredName || ''}
                  onChange={(e) =>
                    onChangeDraft({ ...draft, insuredName: e.target.value })
                  }
                  disabled={finalized}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-600">
                  Plaintiff / Claimant
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-0.5 text-[11px] border-slate-300"
                  value={draft.plaintiffName || ''}
                  onChange={(e) =>
                    onChangeDraft({ ...draft, plaintiffName: e.target.value })
                  }
                  disabled={finalized}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-600">LineSlip No.</label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-0.5 text-[11px] border-slate-300"
                  value={draft.lineSlipNo || ''}
                  onChange={(e) =>
                    onChangeDraft({ ...draft, lineSlipNo: e.target.value })
                  }
                  disabled={finalized}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-slate-600">
                  Unique Market Ref
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-0.5 text-[11px] border-slate-300"
                  value={draft.marketRef || ''}
                  onChange={(e) =>
                    onChangeDraft({ ...draft, marketRef: e.target.value })
                  }
                  disabled={finalized}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <SeedShortcutsSticker />
    </div>
  );
}


