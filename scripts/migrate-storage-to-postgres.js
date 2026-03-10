import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { LEGAL_SNIPPETS } from '../src/constants.js';
import {
  initPostgresStore,
  runPostgresSchemaMigrations,
  importLegacyJsonToPostgres,
  closePostgresStore,
} from '../src/server/postgresStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');

const templatesFilePath =
  process.env.TEMPLATES_FILE_PATH || path.join(dataDir, 'sectionTemplates.json');
const bestPracticesFilePath =
  process.env.BEST_PRACTICES_FILE_PATH || path.join(dataDir, 'bestPractices.json');
const sessionsFilePath =
  process.env.SESSIONS_FILE_PATH || path.join(dataDir, 'sessions.json');

async function run() {
  console.log('[DB Migration] Running schema migrations');
  await runPostgresSchemaMigrations();
  console.log('[DB Migration] Schema migrations completed');

  console.log('[DB Migration] Initializing store for import');
  await initPostgresStore();
  console.log('[DB Migration] Store initialized');

  await importLegacyJsonToPostgres({
    templatesFilePath,
    bestPracticesFilePath,
    sessionsFilePath,
    legalSnippets: LEGAL_SNIPPETS,
  });

  await closePostgresStore();
  console.log('[DB Migration] Done');
}

run().catch((error) => {
  console.error('Failed to initialize/migrate PostgreSQL storage:', error);
  process.exitCode = 1;
});
