import { useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { Badge } from '@/src/hooks/AuthProvider';

// ── Badge catalogue ────────────────────────────────────────────────────────────
export const BADGE_CONFIG: Record<string, { label: string; color: string; icon: string; auto: boolean }> = {
  // Automatic badges
  first_report:     { label: '1er Reporte',      color: '#10B981', icon: '🐾', auto: true },
  reporter_5:       { label: '5 Reportes',        color: '#0EA5E9', icon: '📋', auto: true },
  reporter_15:      { label: '15 Reportes',       color: '#6366F1', icon: '🌟', auto: true },
  reunited_hero:    { label: 'Héroe Reencuentro', color: '#EC4899', icon: '💞', auto: true },
  reunited_legend:  { label: 'Leyenda Reunión',   color: '#F59E0B', icon: '🏆', auto: true },
  // Manual badges
  volunteer:        { label: 'Voluntario/a',      color: '#10B981', icon: '🤝', auto: false },
  first_donation:   { label: '1ra Donación',      color: '#EC4899', icon: '❤️', auto: false },
  frequent_donor:   { label: 'Donante Frecuente', color: '#8B5CF6', icon: '💜', auto: false },
  foster_hero:      { label: 'Héroe Tránsito',    color: '#F59E0B', icon: '🏠', auto: false },
  rescuer:          { label: 'Rescatista',         color: '#3B82F6', icon: '🛡️', auto: false },
  founder:          { label: 'Fundador/a',         color: '#FBBF24', icon: '👑', auto: false },
};

// ── Level catalogue ────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { label: string; gradient: [string, string]; icon: string }> = {
  volunteer:  { label: 'Voluntario',    gradient: ['#10B981', '#059669'], icon: '🌱' },
  protector:  { label: 'Proteccionista',gradient: ['#0EA5E9', '#0369A1'], icon: '🛡️' },
  hero:       { label: 'Héroe Local',   gradient: ['#8B5CF6', '#6D28D9'], icon: '⚡' },
  legend:     { label: 'Leyenda',       gradient: ['#F59E0B', '#B45309'], icon: '👑' },
};

interface Stats {
  total_reports: number;
  reunited_count: number;
  sighted_count: number;
  adopted_count: number;
}

interface MemberCardProps {
  displayName: string;
  memberNumber: string;
  avatarData?: string;
  avatarMime?: string;
  avatarType: string;
  badges: Badge[];
  volunteerStatus: string;
  levelCode?: string;
  levelName?: string;
  stats?: Stats;
  onDownload?: (blob: Blob) => void;
}

const CARD_W = 680;
const CARD_H = 420;
const PAD = 28;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export default function MemberCard({
  displayName, memberNumber, avatarData, avatarMime, avatarType,
  badges, volunteerStatus, levelCode = 'volunteer', levelName, stats,
  onDownload,
}: MemberCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSuspended = volunteerStatus === 'suspended';
  const lvl = LEVEL_CONFIG[levelCode] || LEVEL_CONFIG.volunteer;
  const effectiveLevelName = levelName || lvl.label;

  const drawCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CARD_W;
    canvas.height = CARD_H;
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // ── Background gradient ──────────────────────────────────────────────────
    const [c1, c2] = isSuspended ? ['#6B7280', '#374151'] : lvl.gradient;
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, c1);
    bg.addColorStop(1, c2);
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 24);
    ctx.fill();

    // Decorative circles
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(CARD_W - 80, -40, 120, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CARD_W - 20, CARD_H + 20, 100, 0, Math.PI * 2); ctx.fill();

    // Inner card glass panel
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, PAD, PAD, CARD_W - PAD * 2, CARD_H - PAD * 2, 16);
    ctx.fill();

    // ── Left column: avatar + name + level ──────────────────────────────────
    const avatarSize = 80;
    const avatarX = PAD + 18;
    const avatarY = PAD + 18;

    if (avatarType === 'photo' && avatarData && avatarMime) {
      const img = new Image();
      img.src = `data:${avatarMime};base64,${avatarData}`;
      await new Promise((resolve) => { img.onload = resolve; });
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
    }

    // Avatar ring
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    const nameX = avatarX + avatarSize + 18;

    // Display name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(displayName || 'Miembro', nameX, avatarY + 20);

    // Member number
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.fillText(memberNumber || '—', nameX, avatarY + 46);

    // Level pill
    const levelText = `${lvl.icon} ${effectiveLevelName}`;
    const levelW = ctx.measureText(levelText).width + 22;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, nameX, avatarY + 58, levelW, 24, 12);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(levelText, nameX + 11, avatarY + 70);

    // Org name
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('SIGO TU HUELLA · Sicardi / Garibaldi', nameX, avatarY + avatarSize - 4);

    // ── Stats row ─────────────────────────────────────────────────────────────
    if (stats) {
      const statsY = avatarY + avatarSize + 20;
      const statItems = [
        { label: 'Reportes', value: stats.total_reports },
        { label: 'Reencuentros', value: stats.reunited_count },
        { label: 'Avistajes', value: stats.sighted_count },
        { label: 'Adopciones', value: stats.adopted_count },
      ];
      const statW = (CARD_W - PAD * 2 - 36 - 120) / statItems.length;
      statItems.forEach((stat, i) => {
        const sx = PAD + 18 + i * statW;
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        roundRect(ctx, sx, statsY, statW - 8, 52, 10);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(stat.value), sx + (statW - 8) / 2, statsY + 18);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '9px sans-serif';
        ctx.fillText(stat.label.toUpperCase(), sx + (statW - 8) / 2, statsY + 38);
      });
    }

    // ── Badges section ────────────────────────────────────────────────────────
    const badgeAreaY = stats ? avatarY + avatarSize + 90 : avatarY + avatarSize + 22;
    const badgeSize = 48;
    const badgeGap = 8;
    const badgesLeft = PAD + 18;

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('INSIGNIAS', badgesLeft, badgeAreaY);

    const displayBadges = badges.slice(0, 8);
    displayBadges.forEach((badge, i) => {
      const config = BADGE_CONFIG[badge.code];
      const bx = badgesLeft + i * (badgeSize + badgeGap);
      const by = badgeAreaY + 14;
      ctx.fillStyle = config?.color || '#6B7280';
      roundRect(ctx, bx, by, badgeSize, badgeSize, 10);
      ctx.fill();
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(config?.icon || '⭐', bx + badgeSize / 2, by + badgeSize / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText((config?.label || badge.code).split(' ')[0], bx + badgeSize / 2, by + badgeSize + 3);
    });

    // ── QR code ───────────────────────────────────────────────────────────────
    const QR_SIZE = 110;
    const qrX = CARD_W - PAD - QR_SIZE - 10;
    const qrY = Math.round((CARD_H - QR_SIZE - 28) / 2);

    ctx.fillStyle = 'white';
    roundRect(ctx, qrX - 8, qrY - 8, QR_SIZE + 16, QR_SIZE + 44, 12);
    ctx.fill();

    if (!isSuspended) {
      const verifyUrl = `https://sigotuhuella.online/verificar/${memberNumber}`;
      try {
        await QRCode.toCanvas(canvas, verifyUrl, {
          width: QR_SIZE, margin: 1,
          color: { dark: lvl.gradient[1], light: '#FFFFFF' },
        });
      } catch { /* ignore */ }
    } else {
      // Draw a red X over QR area
      ctx.fillStyle = '#FEE2E2';
      roundRect(ctx, qrX, qrY, QR_SIZE, QR_SIZE, 8);
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(qrX + 16, qrY + 16); ctx.lineTo(qrX + QR_SIZE - 16, qrY + QR_SIZE - 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(qrX + QR_SIZE - 16, qrY + 16); ctx.lineTo(qrX + 16, qrY + QR_SIZE - 16); ctx.stroke();
    }

    ctx.fillStyle = '#374151';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isSuspended ? 'SUSPENDIDO' : 'Escanear para verificar', qrX - 8 + (QR_SIZE + 16) / 2, qrY + QR_SIZE + 10);

    ctx.fillStyle = '#374151';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(memberNumber || '', qrX - 8 + (QR_SIZE + 16) / 2, qrY + QR_SIZE + 23);

    // ── Suspended watermark ───────────────────────────────────────────────────
    if (isSuspended) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 78px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(CARD_W / 2 - 60, CARD_H / 2);
      ctx.rotate(-Math.PI / 8);
      ctx.fillText('SUSPENDIDO', 0, 0);
      ctx.restore();
    }
  }, [displayName, memberNumber, avatarData, avatarMime, avatarType, badges, volunteerStatus, levelCode, levelName, stats, isSuspended, lvl, effectiveLevelName]);

  useEffect(() => { drawCard(); }, [drawCard]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => { if (blob) onDownload?.(blob); }, 'image/png');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className="w-full max-w-[680px] rounded-2xl shadow-2xl"
        style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
      />
      <button
        onClick={handleDownload}
        className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
      >
        Descargar Carnet
      </button>
    </div>
  );
}
