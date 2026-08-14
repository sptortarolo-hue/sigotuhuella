#!/bin/bash
# ============================================================
# Backup SiHuella — PostgreSQL + filesystem + verificación
# Uso:
#   scripts/backup.sh [--on-demand]
# Cron: 0 3 * * * /var/www/sigotuhuella/scripts/backup.sh >> /var/log/sihuella-backup.log 2>&1
# ============================================================
set -euo pipefail

APP_DIR="/var/www/sigotuhuella"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sihuella}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_COPIES="${KEEP_COPIES:-7}"
LOG_FILE="/var/log/sihuella-backup.log"
DATE=$(date +%Y%m%d-%H%M%S)
TS=$(date -Iseconds)

mkdir -p "$BACKUP_DIR"
# En modo on-demand la salida se muestra en el panel admin; en cron va al logfile
if [ "${1:-}" != "--on-demand" ]; then
  exec >> "$LOG_FILE" 2>&1
fi
echo "=== [$TS] Backup iniciado ==="

# --- Resolver DATABASE_URL desde server/.env o el archivo persistente ---
DATABASE_URL=""
if [ -f "$APP_DIR/server/.env" ] && grep -q '^DATABASE_URL=' "$APP_DIR/server/.env"; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$APP_DIR/server/.env" | head -1 | cut -d= -f2-)
fi
if [ -z "$DATABASE_URL" ] && [ -f /root/.sihuella-db.env ] && grep -q '^DATABASE_URL=' /root/.sihuella-db.env; then
  DATABASE_URL=$(grep '^DATABASE_URL=' /root/.sihuella-db.env | head -1 | cut -d= -f2-)
fi
# Fallback hardcoded (ver AGENTS.md)
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="postgresql://sigotuhuella:javier040484@localhost:5432/sigotuhuella"
fi

db_file="$BACKUP_DIR/db-$DATE.sql.gz"
fs_file="$BACKUP_DIR/fs-$DATE.tar.gz"
meta_file="$BACKUP_DIR/backups.json"

# --- 1. Dump PostgreSQL ---
echo "Dump DB -> $db_file"
if pg_dump "$DATABASE_URL" | gzip -9 > "$db_file" 2>>"$LOG_FILE"; then
  DB_OK=true
else
  DB_OK=false
  echo "ERROR: pg_dump falló"
fi

# --- 2. Filesystem (no regenerable) ---
echo "Tar filesystem -> $fs_file"
cd "$APP_DIR" || exit 1
tar_excludes=(
  --exclude='public/generated'
  --exclude='public/uploads/raffle-videos'
  --exclude='node_modules'
  --exclude='dist'
)
tar_files=()
[ -d public/uploads ] && tar_files+=(public/uploads)
[ -d fb_scraper_profile ] && tar_files+=(fb_scraper_profile)
[ -f cookies.txt ] && tar_files+=(cookies.txt)
[ -f server/.env ] && tar_files+=(server/.env)
[ -f /root/.sihuella-db.env ] && tar_files+=(/root/.sihuella-db.env)
[ -f /root/.sihuella-mail.env ] && tar_files+=(/root/.sihuella-mail.env)
if tar czf "$fs_file" "${tar_excludes[@]}" --ignore-failed-read "${tar_files[@]}" > /dev/null 2>&1; then
  FS_OK=true
else
  FS_OK=false
  echo "ERROR: tar falló"
fi

# --- 3. Verificación de integridad ---
DB_VERIFY=false
FS_VERIFY=false
DB_SIZE=0
FS_SIZE=0

if [ -f "$db_file" ]; then
  DB_SIZE=$(stat -c%s "$db_file" 2>/dev/null || echo 0)
  if gzip -t "$db_file" 2>/dev/null; then
    HEADER=$(zcat "$db_file" 2>/dev/null | head -c 30 || true)
    case "$HEADER" in
      *"PostgreSQL database dump"*) DB_VERIFY=true ;;
    esac
  fi
fi
if [ -f "$fs_file" ]; then
  FS_SIZE=$(stat -c%s "$fs_file" 2>/dev/null || echo 0)
  if gzip -t "$fs_file" 2>/dev/null && tar tzf "$fs_file" > /dev/null 2>&1; then
    FS_VERIFY=true
  fi
fi

DB_OK=${DB_OK:-false}
FS_OK=${FS_OK:-false}
ALL_OK=false
[ "$DB_VERIFY" = true ] && [ "$FS_VERIFY" = true ] && ALL_OK=true

echo "Verificación: db=${DB_VERIFY} fs=${FS_VERIFY}"

# --- 4. Rotación (borrar backups viejos) ---
echo "Rotación: borrando backups > $RETENTION_DAYS días (quedan ~$KEEP_COPIES)"
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'fs-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

# --- 5. Registrar estado en backups.json (los N más recientes de cada tipo) ---
tmp=$(mktemp)
node - "$BACKUP_DIR" "$db_file" "$fs_file" "$DB_SIZE" "$FS_SIZE" "$DB_VERIFY" "$FS_VERIFY" "$TS" "$KEEP_COPIES" <<'NODE'
const fs = require('fs');
const path = require('path');
const [dir, dbFile, fsFile, dbSize, fsSize, dbOk, fsOk, ts, keep] = process.argv.slice(2);
let list = [];
try { list = JSON.parse(fs.readFileSync(path.join(dir, 'backups.json'), 'utf8')); } catch {}
list.push({
  file: path.basename(dbFile),
  type: 'db',
  size: Number(dbSize),
  ok: dbOk === 'true',
  created_at: ts,
});
list.push({
  file: path.basename(fsFile),
  type: 'fs',
  size: Number(fsSize),
  ok: fsOk === 'true',
  created_at: ts,
});
const keepN = Number(keep) || 7;
const dbKeep = list.filter(x => x.type === 'db').sort((a, b) => a.file.localeCompare(b.file)).slice(-keepN);
const fsKeep = list.filter(x => x.type === 'fs').sort((a, b) => a.file.localeCompare(b.file)).slice(-keepN);
const kept = dbKeep.concat(fsKeep);
const keptFiles = new Set(kept.map(x => x.file));
list = list.filter(x => keptFiles.has(x.file));
for (const x of kept) {
  const p = path.join(dir, x.file);
  if (!fs.existsSync(p)) continue;
  const st = fs.statSync(p);
  x.size = st.size;
}
fs.writeFileSync(path.join(dir, 'backups.json'), JSON.stringify(kept, null, 2));
NODE
rm -f "$tmp"

echo "=== [$TS] Backup finalizado (ok=$ALL_OK) ==="

# Exit code: para on-demand el server puede reportar el estado
if [ "$ALL_OK" = true ]; then
  exit 0
else
  exit 1
fi
