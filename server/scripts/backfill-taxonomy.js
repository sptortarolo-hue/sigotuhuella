import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

import pool from '../db.js';
import { backfillTaxonomy } from '../services/taxonomy.js';

async function main() {
  const { total, normalized } = await backfillTaxonomy(10000, (ok, n) => console.log(`  ...${ok}/${n} procesadas`));
  console.log(`[backfill-taxonomy] ${normalized}/${total} mascotas normalizadas`);
  await pool.end();
}

main().catch(err => {
  console.error('[backfill-taxonomy] error:', err);
  process.exit(1);
});
