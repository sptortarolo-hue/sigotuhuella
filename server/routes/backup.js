import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, stat } from 'fs/promises';
import { join, normalize, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireAdmin } from '../auth.js';

const execFileAsync = promisify(execFile);

const router = Router();

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/sihuella';
const BACKUP_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'backup.sh');

function safeBackupPath(name) {
  if (!name) return null;
  const base = basename(name);
  const full = normalize(join(BACKUP_DIR, base));
  if (!full.startsWith(normalize(BACKUP_DIR)) || !/^(db-[\w.-]+\.sql\.gz|fs-[\w.-]+\.tar\.gz)$/.test(base)) return null;
  return full;
}

// GET /api/backup/list — lista de backups disponibles
router.get('/list', requireAdmin, async (_req, res) => {
  try {
    let meta = [];
    try {
      meta = JSON.parse(await readFile(join(BACKUP_DIR, 'backups.json'), 'utf8'));
    } catch {}
    const entries = [];
    const seen = new Set(meta.map(m => m.file));
    for (const file of meta) {
      try {
        const st = await stat(join(BACKUP_DIR, file.file));
        entries.push({ file: file.file, type: file.type, size: st.size, ok: !!file.ok, created_at: file.created_at });
      } catch {}
    }
    try {
      const files = await readdir(BACKUP_DIR);
      for (const f of files.filter(f => /^(db-|fs-)/.test(f) && !seen.has(f))) {
        const st = await stat(join(BACKUP_DIR, f));
        entries.push({ file: f, type: f.startsWith('db-') ? 'db' : 'fs', size: st.size, ok: null, created_at: st.mtime.toISOString() });
      }
    } catch {}
    entries.sort((a, b) => b.file.localeCompare(a.file));

    let disk = null;
    try {
      const { stdout } = await execFileAsync('df', ['-h', '--output=size,used,avail,pcent', BACKUP_DIR]);
      const lines = stdout.trim().split('\n');
      if (lines.length === 2) {
        const parts = lines[1].trim().split(/\s+/);
        disk = { total: parts[0], used: parts[1], available: parts[2], percent: parseInt(parts[3]) || 0 };
      }
    } catch {}

    res.json({ backups: entries, dir: BACKUP_DIR, disk });
  } catch (err) {
    console.error('GET /api/backup/list error:', err);
    res.status(500).json({ error: 'Error al listar backups' });
  }
});

// GET /api/backup/download/:file — descarga el archivo
router.get('/download/:file', requireAdmin, async (req, res) => {
  try {
    const full = safeBackupPath(req.params.file);
    if (!full) return res.status(400).json({ error: 'Nombre de archivo inválido' });
    res.download(full);
  } catch (err) {
    console.error('GET /api/backup/download error:', err);
    res.status(500).json({ error: 'Error al descargar backup' });
  }
});

// POST /api/backup/run — backup manual on-demand
router.post('/run', requireAdmin, async (_req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync('bash', [BACKUP_SCRIPT, '--on-demand'], { timeout: 600000 });
    const ok = /\(ok=true\)/.test(stdout + stderr);
    res.json({ ok, output: (stdout + stderr).slice(-3000) });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar backup', output: (err.stdout || '') + (err.stderr || '') });
  }
});

export default router;
