import fs from 'fs';
import { Pool } from 'pg';

let pool = null;
let initialized = false;

const REQUIRED_TABLES = ['section_templates', 'best_practices', 'user_sessions', 'reports', 'case_folders'];

const buildConnectionStringFromParts = () => {
  const host = process.env.PGHOST || process.env.POSTGRES_HOST;
  const port = process.env.PGPORT || process.env.POSTGRES_PORT || '5432';
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB;
  const user = process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;

  if (!host || !database || !user || !password) {
    return null;
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

const getDatabaseUrlOrThrow = () => {
  const value =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_INTERNAL ||
    process.env.DATABASE_INTERNAL_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    buildConnectionStringFromParts();
  if (!value || !String(value).trim()) {
    throw new Error(
      'PostgreSQL connection string is missing. Set DATABASE_URL (preferred) or provide PGHOST/PGUSER/PGPASSWORD/PGDATABASE.',
    );
  }
  return String(value).trim();
};

const createPool = () => {
  if (pool) return pool;
  const shouldUseSsl =
    process.env.PGSSLMODE !== 'disable' &&
    (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production');

  pool = new Pool({
    connectionString: getDatabaseUrlOrThrow(),
    ssl: shouldUseSsl ? { rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false' } : false,
  });
  return pool;
};

const getPoolOrThrow = () => {
  if (!pool) {
    throw new Error('PostgreSQL store is not initialized. Call initPostgresStore() during startup.');
  }
  return pool;
};

const mapTemplateRow = (row) => ({
  id: row.id,
  sectionKey: row.section_key,
  title: row.title,
  body: row.body,
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
  isEnabled: row.is_enabled,
  orderIndex: row.order_index,
});

const mapBestPracticeRow = (row) => ({
  id: row.id,
  sectionKey: row.section_key,
  title: row.title,
  body: row.body,
  label: row.label,
  tags: Array.isArray(row.tags) ? row.tags : [],
  isEnabled: row.is_enabled,
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
  usageCount: row.usage_count,
  lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  behavior: row.behavior,
  sourceReportId: row.source_report_id || undefined,
  orderIndex: row.order_index,
});

const readJsonArrayFile = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const tableCount = async (tableName) => {
  const db = getPoolOrThrow();
  const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return result.rows[0]?.count || 0;
};

export const runPostgresSchemaMigrations = async () => {
  const db = createPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS section_templates (
      id TEXT PRIMARY KEY,
      section_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      order_index INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS best_practices (
      id TEXT PRIMARY KEY,
      section_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'BEST_PRACTICE',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ NULL,
      behavior TEXT NOT NULL DEFAULT 'INSERTABLE',
      source_report_id TEXT NULL,
      order_index INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
    ON user_sessions (expires_at);
  `);

  // --- Reports table (full ReportData stored as JSONB with queryable columns) ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      owner_name TEXT NOT NULL DEFAULT '',
      report_number INTEGER,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      hebrew_workflow_status TEXT,
      odakanit_no TEXT,
      report_subject TEXT,
      recipient_id TEXT,
      insurer_name TEXT,
      insured_name TEXT,
      plaintiff_name TEXT,
      line_slip_no TEXT,
      market_ref TEXT,
      certificate_ref TEXT,
      sent_at TIMESTAMPTZ,
      first_sent_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports (created_by);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_odakanit_no ON reports (odakanit_no);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_updated_at ON reports (updated_at DESC);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_deleted_at ON reports (deleted_at);`);

  // --- Case folders table ---
  await db.query(`
    CREATE TABLE IF NOT EXISTS case_folders (
      odakanit_no TEXT PRIMARY KEY,
      re_template TEXT NOT NULL DEFAULT '',
      insured_name TEXT,
      insurer_name TEXT,
      plaintiff_name TEXT,
      assigned_lawyer TEXT,
      market_ref TEXT,
      line_slip_no TEXT,
      certificate_ref TEXT,
      closed_at TIMESTAMPTZ,
      closed_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
};

const validateRequiredTablesExist = async () => {
  const db = getPoolOrThrow();
  const result = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES],
  );
  const existing = new Set(result.rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((name) => !existing.has(name));
  if (missing.length > 0) {
    throw new Error(
      `PostgreSQL schema is not initialized. Missing tables: ${missing.join(', ')}.`,
    );
  }
};

export const importLegacyJsonToPostgres = async ({
  templatesFilePath,
  bestPracticesFilePath,
  sessionsFilePath,
  legalSnippets,
} = {}) => {
  const db = getPoolOrThrow();

  console.log('[DB Migration] Starting legacy JSON import checks');
  const templatesCount = await tableCount('section_templates');
  if (templatesCount === 0) {
    console.log('[DB Migration] section_templates empty -> importing legacy data');
    const fileTemplates = readJsonArrayFile(templatesFilePath);
    let templatesToInsert = fileTemplates;

    if (templatesToInsert.length === 0 && legalSnippets && typeof legalSnippets === 'object') {
      const nowIso = new Date().toISOString();
      const seeded = [];
      Object.entries(legalSnippets).forEach(([sectionKey, snippets]) => {
        if (!Array.isArray(snippets)) return;
        snippets.forEach((body, idx) => {
          if (typeof body !== 'string' || !body.trim()) return;
          const words = body.trim().split(/\s+/).slice(0, 6).join(' ');
          seeded.push({
            id: `seed-${sectionKey}-${idx}`,
            sectionKey,
            title: words || `${sectionKey} template ${idx + 1}`,
            body,
            createdByUserId: 'system',
            createdAt: nowIso,
            updatedAt: nowIso,
            isEnabled: true,
            orderIndex: seeded.length,
          });
        });
      });
      templatesToInsert = seeded;
    }

    for (const t of templatesToInsert) {
      await db.query(
        `INSERT INTO section_templates
          (id, section_key, title, body, created_by_user_id, created_at, updated_at, is_enabled, order_index)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(t.id),
          String(t.sectionKey || ''),
          String(t.title || ''),
          String(t.body || ''),
          String(t.createdByUserId || 'system'),
          t.createdAt || new Date().toISOString(),
          t.updatedAt || t.createdAt || new Date().toISOString(),
          t.isEnabled !== false,
          Number.isFinite(t.orderIndex) ? t.orderIndex : 0,
        ],
      );
    }
    console.log(`[DB Migration] Imported section_templates rows: ${templatesToInsert.length}`);
  } else {
    console.log('[DB Migration] section_templates already has data -> skipping import');
  }

  const bestPracticesCount = await tableCount('best_practices');
  if (bestPracticesCount === 0) {
    console.log('[DB Migration] best_practices empty -> importing legacy data');
    const fileBestPractices = readJsonArrayFile(bestPracticesFilePath);
    let imported = 0;
    for (const bp of fileBestPractices) {
      if (!bp || !bp.sectionKey || !bp.title || !bp.body) continue;
      await db.query(
        `INSERT INTO best_practices
          (id, section_key, title, body, label, tags, is_enabled, created_by_user_id, created_at, updated_at, usage_count, last_used_at, behavior, source_report_id, order_index)
         VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(bp.id),
          String(bp.sectionKey),
          String(bp.title),
          String(bp.body),
          bp.label === 'LLOYDS_RECOMMENDED' ? 'LLOYDS_RECOMMENDED' : 'BEST_PRACTICE',
          JSON.stringify(Array.isArray(bp.tags) ? bp.tags.map(String) : []),
          bp.isEnabled !== false,
          String(bp.createdByUserId || 'system'),
          bp.createdAt || new Date().toISOString(),
          bp.updatedAt || bp.createdAt || new Date().toISOString(),
          Number.isFinite(bp.usageCount) ? bp.usageCount : 0,
          bp.lastUsedAt || null,
          bp.behavior === 'COPY_ONLY' ? 'COPY_ONLY' : 'INSERTABLE',
          bp.sourceReportId ? String(bp.sourceReportId) : null,
          Number.isFinite(bp.orderIndex) ? bp.orderIndex : 0,
        ],
      );
      imported += 1;
    }
    console.log(`[DB Migration] Imported best_practices rows: ${imported}`);
  } else {
    console.log('[DB Migration] best_practices already has data -> skipping import');
  }

  const sessionsCount = await tableCount('user_sessions');
  if (sessionsCount === 0) {
    console.log('[DB Migration] user_sessions empty -> importing legacy data');
    const sessionsFromFile = readJsonArrayFile(sessionsFilePath);
    let imported = 0;
    for (const row of sessionsFromFile) {
      if (!row?.id || !row?.user) continue;
      await db.query(
        `INSERT INTO user_sessions (id, user_payload, expires_at)
         VALUES ($1, $2::jsonb, NOW() + INTERVAL '12 hours')
         ON CONFLICT (id) DO NOTHING`,
        [String(row.id), JSON.stringify(row.user)],
      );
      imported += 1;
    }
    console.log(`[DB Migration] Imported user_sessions rows: ${imported}`);
  } else {
    console.log('[DB Migration] user_sessions already has data -> skipping import');
  }

  console.log('[DB Migration] Legacy JSON import check completed');
};

export const initPostgresStore = async () => {
  const db = createPool();
  try {
    await db.query('SELECT 1');
    // Keep startup self-healing in environments where manual migration is hard to run.
    await runPostgresSchemaMigrations();
    await validateRequiredTablesExist();
    await db.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
    initialized = true;
    console.log('[DB] PostgreSQL initialized and schema verified');
  } catch (error) {
    throw new Error(`PostgreSQL startup initialization failed: ${error.message || error}`);
  }
};

export const listSectionTemplates = async (sectionKey) => {
  const db = getPoolOrThrow();
  const result = await db.query(
    `SELECT * FROM section_templates
     WHERE ($1::text IS NULL OR section_key = $1)
     ORDER BY order_index ASC, created_at ASC`,
    [sectionKey || null],
  );
  return result.rows.map(mapTemplateRow);
};

export const createSectionTemplate = async (template) => {
  const db = getPoolOrThrow();
  await db.query(
    `INSERT INTO section_templates
      (id, section_key, title, body, created_by_user_id, created_at, updated_at, is_enabled, order_index)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      template.id,
      template.sectionKey,
      template.title,
      template.body,
      template.createdByUserId || 'system',
      template.createdAt,
      template.updatedAt,
      template.isEnabled !== false,
      template.orderIndex ?? 0,
    ],
  );
};

export const updateSectionTemplate = async (id, patch) => {
  if (!patch || Object.keys(patch).length === 0) return;
  const db = getPoolOrThrow();
  const fields = [];
  const values = [];
  let idx = 1;
  Object.entries(patch).forEach(([key, value]) => {
    fields.push(`${key} = $${idx++}`);
    values.push(value);
  });
  values.push(id);
  await db.query(`UPDATE section_templates SET ${fields.join(', ')} WHERE id = $${idx}`, values);
};

export const deleteSectionTemplate = async (id) => {
  const db = getPoolOrThrow();
  await db.query('DELETE FROM section_templates WHERE id = $1', [id]);
};

export const reorderSectionTemplate = async (id, direction) => {
  const db = getPoolOrThrow();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      'SELECT id FROM section_templates ORDER BY order_index ASC, created_at ASC FOR UPDATE',
    );
    const sorted = rows.rows.map((r) => r.id);
    const index = sorted.indexOf(id);
    if (index === -1) {
      await client.query('ROLLBACK');
      return false;
    }
    const target = direction === 'UP' ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) {
      await client.query('ROLLBACK');
      return true;
    }
    const tmp = sorted[index];
    sorted[index] = sorted[target];
    sorted[target] = tmp;
    for (let i = 0; i < sorted.length; i += 1) {
      await client.query('UPDATE section_templates SET order_index = $1 WHERE id = $2', [i, sorted[i]]);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const listBestPractices = async (sectionKey) => {
  const db = getPoolOrThrow();
  const result = await db.query(
    `SELECT * FROM best_practices
     WHERE ($1::text IS NULL OR section_key = $1)
     ORDER BY order_index ASC, created_at ASC`,
    [sectionKey || null],
  );
  return result.rows.map(mapBestPracticeRow);
};

export const createBestPractice = async (snippet) => {
  const db = getPoolOrThrow();
  await db.query(
    `INSERT INTO best_practices
      (id, section_key, title, body, label, tags, is_enabled, created_by_user_id, created_at, updated_at, usage_count, last_used_at, behavior, source_report_id, order_index)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      snippet.id,
      snippet.sectionKey,
      snippet.title,
      snippet.body,
      snippet.label,
      JSON.stringify(Array.isArray(snippet.tags) ? snippet.tags : []),
      snippet.isEnabled !== false,
      snippet.createdByUserId || 'system',
      snippet.createdAt,
      snippet.updatedAt,
      snippet.usageCount || 0,
      snippet.lastUsedAt || null,
      snippet.behavior || 'INSERTABLE',
      snippet.sourceReportId || null,
      snippet.orderIndex ?? 0,
    ],
  );
};

export const updateBestPractice = async (id, patch) => {
  if (!patch || Object.keys(patch).length === 0) return;
  const db = getPoolOrThrow();
  const fields = [];
  const values = [];
  let idx = 1;
  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'tags') {
      fields.push(`${key} = $${idx++}::jsonb`);
      values.push(value);
      return;
    }
    fields.push(`${key} = $${idx++}`);
    values.push(value);
  });
  values.push(id);
  await db.query(`UPDATE best_practices SET ${fields.join(', ')} WHERE id = $${idx}`, values);
};

export const deleteBestPractice = async (id) => {
  const db = getPoolOrThrow();
  await db.query('DELETE FROM best_practices WHERE id = $1', [id]);
};

export const reorderBestPractice = async (id, direction) => {
  const db = getPoolOrThrow();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      'SELECT id FROM best_practices ORDER BY order_index ASC, created_at ASC FOR UPDATE',
    );
    const sorted = rows.rows.map((r) => r.id);
    const index = sorted.indexOf(id);
    if (index === -1) {
      await client.query('ROLLBACK');
      return false;
    }
    const target = direction === 'UP' ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) {
      await client.query('ROLLBACK');
      return true;
    }
    const tmp = sorted[index];
    sorted[index] = sorted[target];
    sorted[target] = tmp;
    for (let i = 0; i < sorted.length; i += 1) {
      await client.query('UPDATE best_practices SET order_index = $1 WHERE id = $2', [i, sorted[i]]);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const createSession = async (sessionId, userPayload, sessionTtlHours = 12) => {
  const db = getPoolOrThrow();
  await db.query(
    `INSERT INTO user_sessions (id, user_payload, expires_at, last_seen_at)
     VALUES ($1, $2::jsonb, NOW() + ($3::text || ' hours')::interval, NOW())
     ON CONFLICT (id)
     DO UPDATE SET user_payload = EXCLUDED.user_payload, expires_at = EXCLUDED.expires_at, last_seen_at = NOW()`,
    [sessionId, JSON.stringify(userPayload), String(sessionTtlHours)],
  );
};

export const getSessionUser = async (sessionId) => {
  const db = getPoolOrThrow();
  const result = await db.query(
    `SELECT user_payload
     FROM user_sessions
     WHERE id = $1 AND expires_at > NOW()`,
    [sessionId],
  );
  if (!result.rows.length) return null;
  await db.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [sessionId]);
  return result.rows[0].user_payload || null;
};

export const deleteSession = async (sessionId) => {
  const db = getPoolOrThrow();
  await db.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
};

// ---------------------------------------------------------------------------
// Reports CRUD
// ---------------------------------------------------------------------------

const reportToRow = (r) => ({
  id: r.id,
  created_by: r.createdBy || '',
  owner_name: r.ownerName || '',
  report_number: r.reportNumber ?? null,
  status: r.status || 'DRAFT',
  hebrew_workflow_status: r.hebrewWorkflowStatus || null,
  odakanit_no: r.odakanitNo || null,
  report_subject: r.reportSubject || null,
  recipient_id: r.recipientId || null,
  insurer_name: r.insurerName || null,
  insured_name: r.insuredName || null,
  plaintiff_name: r.plaintiffName || null,
  line_slip_no: r.lineSlipNo || null,
  market_ref: r.marketRef || null,
  certificate_ref: r.certificateRef || null,
  sent_at: r.sentAt || null,
  first_sent_at: r.firstSentAt || null,
  deleted_at: r.deletedAt || null,
  deleted_by: r.deletedBy || null,
  updated_at: r.updatedAt || new Date().toISOString(),
  data: JSON.stringify(r),
});

export const listReports = async ({ createdBy, status, odakanitNo, includeDeleted, limit = 200, offset = 0 } = {}) => {
  const db = getPoolOrThrow();
  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }
  if (createdBy) {
    conditions.push(`created_by = $${idx++}`);
    values.push(createdBy);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }
  if (odakanitNo) {
    conditions.push(`odakanit_no = $${idx++}`);
    values.push(odakanitNo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);
  const result = await db.query(
    `SELECT data FROM reports ${where} ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    values,
  );
  return result.rows.map((row) => row.data);
};

export const getReport = async (id) => {
  const db = getPoolOrThrow();
  const result = await db.query('SELECT data FROM reports WHERE id = $1', [id]);
  return result.rows.length > 0 ? result.rows[0].data : null;
};

export const upsertReport = async (reportData) => {
  const db = getPoolOrThrow();
  const row = reportToRow(reportData);
  await db.query(
    `INSERT INTO reports
      (id, created_by, owner_name, report_number, status, hebrew_workflow_status,
       odakanit_no, report_subject, recipient_id, insurer_name, insured_name,
       plaintiff_name, line_slip_no, market_ref, certificate_ref,
       sent_at, first_sent_at, deleted_at, deleted_by, created_at, updated_at, data)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),$20,$21::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       created_by = EXCLUDED.created_by,
       owner_name = EXCLUDED.owner_name,
       report_number = EXCLUDED.report_number,
       status = EXCLUDED.status,
       hebrew_workflow_status = EXCLUDED.hebrew_workflow_status,
       odakanit_no = EXCLUDED.odakanit_no,
       report_subject = EXCLUDED.report_subject,
       recipient_id = EXCLUDED.recipient_id,
       insurer_name = EXCLUDED.insurer_name,
       insured_name = EXCLUDED.insured_name,
       plaintiff_name = EXCLUDED.plaintiff_name,
       line_slip_no = EXCLUDED.line_slip_no,
       market_ref = EXCLUDED.market_ref,
       certificate_ref = EXCLUDED.certificate_ref,
       sent_at = EXCLUDED.sent_at,
       first_sent_at = EXCLUDED.first_sent_at,
       deleted_at = EXCLUDED.deleted_at,
       deleted_by = EXCLUDED.deleted_by,
       updated_at = EXCLUDED.updated_at,
       data = EXCLUDED.data`,
    [
      row.id, row.created_by, row.owner_name, row.report_number, row.status,
      row.hebrew_workflow_status, row.odakanit_no, row.report_subject,
      row.recipient_id, row.insurer_name, row.insured_name, row.plaintiff_name,
      row.line_slip_no, row.market_ref, row.certificate_ref,
      row.sent_at, row.first_sent_at, row.deleted_at, row.deleted_by,
      row.updated_at, row.data,
    ],
  );
};

export const softDeleteReport = async (id, userId) => {
  const db = getPoolOrThrow();
  const now = new Date().toISOString();
  // Update both the column and the JSONB data
  await db.query(
    `UPDATE reports
     SET deleted_at = $2, deleted_by = $3, updated_at = $2,
         data = jsonb_set(jsonb_set(data, '{deletedAt}', to_jsonb($2::text)), '{deletedBy}', to_jsonb($3::text))
     WHERE id = $1`,
    [id, now, userId],
  );
};

export const bulkImportReports = async (reportsArray) => {
  const db = getPoolOrThrow();
  const client = await db.connect();
  let imported = 0;
  try {
    await client.query('BEGIN');
    for (const report of reportsArray) {
      if (!report || !report.id) continue;
      const row = reportToRow(report);
      await client.query(
        `INSERT INTO reports
          (id, created_by, owner_name, report_number, status, hebrew_workflow_status,
           odakanit_no, report_subject, recipient_id, insurer_name, insured_name,
           plaintiff_name, line_slip_no, market_ref, certificate_ref,
           sent_at, first_sent_at, deleted_at, deleted_by, created_at, updated_at, data)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),$20,$21::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id, row.created_by, row.owner_name, row.report_number, row.status,
          row.hebrew_workflow_status, row.odakanit_no, row.report_subject,
          row.recipient_id, row.insurer_name, row.insured_name, row.plaintiff_name,
          row.line_slip_no, row.market_ref, row.certificate_ref,
          row.sent_at, row.first_sent_at, row.deleted_at, row.deleted_by,
          row.updated_at, row.data,
        ],
      );
      imported += 1;
    }
    await client.query('COMMIT');
    console.log(`[DB] Bulk-imported ${imported} reports`);
    return imported;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------------
// Case Folders CRUD
// ---------------------------------------------------------------------------

export const listCaseFolders = async () => {
  const db = getPoolOrThrow();
  const result = await db.query('SELECT data FROM case_folders ORDER BY updated_at DESC');
  return result.rows.map((row) => row.data);
};

export const upsertCaseFolder = async (odakanitNo, folderData) => {
  const db = getPoolOrThrow();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO case_folders
      (odakanit_no, re_template, insured_name, insurer_name, plaintiff_name,
       assigned_lawyer, market_ref, line_slip_no, certificate_ref,
       closed_at, closed_by_user_id, updated_at, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     ON CONFLICT (odakanit_no) DO UPDATE SET
       re_template = EXCLUDED.re_template,
       insured_name = EXCLUDED.insured_name,
       insurer_name = EXCLUDED.insurer_name,
       plaintiff_name = EXCLUDED.plaintiff_name,
       assigned_lawyer = EXCLUDED.assigned_lawyer,
       market_ref = EXCLUDED.market_ref,
       line_slip_no = EXCLUDED.line_slip_no,
       certificate_ref = EXCLUDED.certificate_ref,
       closed_at = EXCLUDED.closed_at,
       closed_by_user_id = EXCLUDED.closed_by_user_id,
       updated_at = EXCLUDED.updated_at,
       data = EXCLUDED.data`,
    [
      odakanitNo,
      folderData.reTemplate || '',
      folderData.insuredName || null,
      folderData.insurerName || null,
      folderData.plaintiffName || null,
      folderData.assignedLawyer || folderData.createdBy || null,
      folderData.marketRef || null,
      folderData.lineSlipNo || null,
      folderData.certificateRef || null,
      folderData.closedAt || null,
      folderData.closedByUserId || null,
      now,
      JSON.stringify(folderData),
    ],
  );
};

export const closePostgresStore = async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
  initialized = false;
};

