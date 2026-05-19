import { useRef, useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { Badge } from '@/src/hooks/AuthProvider';

// ── Badge catalogue ────────────────────────────────────────────────────────────
export const BADGE_CONFIG: Record<string, { label: string; color: string; icon: string; auto: boolean }> = {
  first_report:     { label: '1er Reporte',      color: '#10B981', icon: '🐾', auto: true },
  reporter_5:       { label: '5 Reportes',        color: '#0EA5E9', icon: '📋', auto: true },
  reporter_15:      { label: '15 Reportes',       color: '#6366F1', icon: '🌟', auto: true },
  reunited_hero:    { label: 'Héroe Reencuentro', color: '#EC4899', icon: '💞', auto: true },
  reunited_legend:  { label: 'Leyenda Reunión',   color: '#F59E0B', icon: '🏆', auto: true },
  volunteer:        { label: 'Voluntario/a',      color: '#10B981', icon: '🤝', auto: false },
  first_donation:   { label: '1ra Donación',      color: '#EC4899', icon: '❤️', auto: false },
  frequent_donor:   { label: 'Donante Frecuente', color: '#8B5CF6', icon: '💜', auto: false },
  foster_hero:      { label: 'Héroe Tránsito',    color: '#F59E0B', icon: '🏠', auto: false },
  rescuer:          { label: 'Rescatista',         color: '#3B82F6', icon: '🛡️', auto: false },
  founder:          { label: 'Fundador/a',         color: '#FBBF24', icon: '👑', auto: false },
};

// ── Level catalogue ────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, { label: string; gradient: [string, string]; icon: string; glow: string }> = {
  volunteer:  { label: 'Voluntario',    gradient: ['#5A5A40', '#D48C70'], icon: '🌱', glow: 'rgba(90, 90, 64, 0.4)' },
  protector:  { label: 'Proteccionista',gradient: ['#4A7C59', '#8FBC8F'], icon: '🛡️', glow: 'rgba(74, 124, 89, 0.4)' },
  hero:       { label: 'Héroe Local',   gradient: ['#D48C70', '#E8A87C'], icon: '⚡', glow: 'rgba(212, 140, 112, 0.4)' },
  legend:     { label: 'Leyenda',       gradient: ['#8B6914', '#D4A017'], icon: '👑', glow: 'rgba(139, 105, 20, 0.4)' },
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
const PAD = 24;
const SPLIT_X = 410;

const BRAND_OLIVE = '#5A5A40';
const BRAND_TERRACOTTA = '#D48C70';
const BRAND_CREAM = '#F5F5F0';
const BRAND_GRAY = '#E6E6DF';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawPawPrint(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.15, size * 0.4, size * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  const toeY = cy - size * 0.22;
  const toeXOffsets = [-size * 0.38, -size * 0.13, size * 0.13, size * 0.38];
  const toeAngles = [-0.25, -0.08, 0.08, 0.25];
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + toeXOffsets[i], toeY + Math.abs(toeXOffsets[i]) * 0.12, size * 0.14, size * 0.18, toeAngles[i], 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

    // ── 1. LEFT PANEL: Cream background ────────────────────────────────────────
    ctx.fillStyle = BRAND_CREAM;
    roundRect(ctx, 0, 0, SPLIT_X, CARD_H, 28);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SPLIT_X, CARD_H);
    ctx.clip();

    const pawPositions = [
      { x: 50, y: 380, size: 30 },
      { x: 200, y: 350, size: 24 },
      { x: 350, y: 390, size: 28 },
      { x: 100, y: 80, size: 20 },
      { x: 300, y: 200, size: 26 },
      { x: 180, y: 150, size: 18 },
    ];
    pawPositions.forEach(p => drawPawPrint(ctx, p.x, p.y, p.size, `rgba(90, 90, 64, ${p.a || 0.05})`));

    ctx.restore();

    // ── 2. RIGHT PANEL: Gradient olive → terracotta ────────────────────────────
    const rightGrad = ctx.createLinearGradient(SPLIT_X, 0, CARD_W, CARD_H);
    if (isSuspended) {
      rightGrad.addColorStop(0, '#6B7280');
      rightGrad.addColorStop(1, '#4B5563');
    } else {
      rightGrad.addColorStop(0, BRAND_OLIVE);
      rightGrad.addColorStop(0.5, '#6B6B52');
      rightGrad.addColorStop(1, BRAND_TERRACOTTA);
    }
    ctx.fillStyle = rightGrad;
    roundRect(ctx, SPLIT_X - 14, 0, CARD_W - SPLIT_X + 14, CARD_H, 28);
    ctx.fill();

    const rightPaws = [
      { x: 550, y: 350, size: 28, a: 0.08 },
      { x: 620, y: 80, size: 22, a: 0.07 },
      { x: 480, y: 200, size: 20, a: 0.06 },
    ];
    rightPaws.forEach(p => drawPawPrint(ctx, p.x, p.y, p.size, `rgba(255, 255, 255, ${p.a})`));

    // ── 3. Header ──────────────────────────────────────────────────────────────
    ctx.fillStyle = BRAND_OLIVE;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🐾  SIGO TU HUELLA', PAD, PAD - 2);

    ctx.strokeStyle = BRAND_TERRACOTTA;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 14);
    ctx.lineTo(SPLIT_X - PAD, PAD + 14);
    ctx.stroke();

    // ── 4. Avatar ──────────────────────────────────────────────────────────────
    const avatarSize = 76;
    const avatarX = PAD + 10;
    const avatarY = PAD + 28;

    if (avatarType === 'photo' && avatarData && avatarMime) {
      try {
        const img = new Image();
        img.src = `data:${avatarMime};base64,${avatarData}`;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 3000);
        });
        if (!img.complete || img.naturalWidth === 0) throw new Error();
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      } catch {
        ctx.fillStyle = 'rgba(90, 90, 64, 0.1)';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
      }
    } else {
      ctx.fillStyle = 'rgba(90, 90, 64, 0.1)';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
    }

    ctx.strokeStyle = isSuspended ? '#9CA3AF' : BRAND_TERRACOTTA;
    ctx.lineWidth = 3;
    ctx.shadowColor = isSuspended ? 'transparent' : 'rgba(212, 140, 112, 0.3)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── 5. Member info ─────────────────────────────────────────────────────────
    const infoX = avatarX + avatarSize + 16;
    const infoY = avatarY + 4;

    ctx.fillStyle = BRAND_OLIVE;
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayName || 'Miembro', infoX, infoY);

    ctx.fillStyle = BRAND_TERRACOTTA;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`SOCIO Nº  ${memberNumber || '—'}`, infoX, infoY + 28);

    const levelText = `${lvl.icon}  ${effectiveLevelName.toUpperCase()}`;
    ctx.font = 'bold 9px sans-serif';
    const textWidth = ctx.measureText(levelText).width;
    const pillW = textWidth + 16;
    const pillH = 18;
    const pillX = infoX;
    const pillY = infoY + 48;

    const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
    pillGrad.addColorStop(0, BRAND_OLIVE);
    pillGrad.addColorStop(1, BRAND_TERRACOTTA);
    ctx.fillStyle = pillGrad;
    roundRect(ctx, pillX, pillY, pillW, pillH, 9);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(levelText, pillX + 8, pillY + pillH / 2);

    // ── 6. Statistics ──────────────────────────────────────────────────────────
    if (stats) {
      const statsY = pillY + pillH + 16;
      const statItems = [
        { label: 'REPORTES', value: stats.total_reports, emoji: '📋' },
        { label: 'REENCUENTROS', value: stats.reunited_count, emoji: '💞' },
        { label: 'AVISTAJES', value: stats.sighted_count, emoji: '👁️' },
        { label: 'ADOPCIONES', value: stats.adopted_count, emoji: '🏡' },
      ];
      const statsAreaW = SPLIT_X - PAD * 2 - 10;
      const statW = statsAreaW / statItems.length;

      statItems.forEach((stat, i) => {
        const sx = PAD + 5 + i * statW;
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, sx, statsY, statW - 8, 50, 10);
        ctx.fill();
        ctx.strokeStyle = BRAND_GRAY;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = BRAND_OLIVE;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${stat.emoji} ${stat.value}`, sx + (statW - 8) / 2, statsY + 18);

        ctx.fillStyle = '#8B8B73';
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(stat.label, sx + (statW - 8) / 2, statsY + 36);
      });
    }

    // ── 7. Badges ──────────────────────────────────────────────────────────────
    const badgeCount = Math.min(badges.length, 8);
    if (badgeCount > 0) {
      const badgeAreaY = stats ? (pillY + pillH + 16 + 50 + 12) : pillY + pillH + 16;
      const badgeSize = 34;
      const badgeGap = 8;
      const badgesLeft = PAD + 5;

      const stripW = badgeCount * (badgeSize + badgeGap) - badgeGap + 6;
      ctx.fillStyle = 'rgba(90, 90, 64, 0.06)';
      roundRect(ctx, badgesLeft - 2, badgeAreaY - 4, stripW + 4, badgeSize + 22, 8);
      ctx.fill();

      ctx.fillStyle = BRAND_OLIVE;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('INSIGNIAS', badgesLeft, badgeAreaY);

      badges.slice(0, 8).forEach((badge, i) => {
        const config = BADGE_CONFIG[badge.code];
        const bx = badgesLeft + i * (badgeSize + badgeGap);
        const by = badgeAreaY + 12;

        ctx.fillStyle = config?.color || '#6B7280';
        roundRect(ctx, bx, by, badgeSize, badgeSize, 17);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(config?.icon || '⭐', bx + badgeSize / 2, by + badgeSize / 2);

        ctx.fillStyle = BRAND_OLIVE;
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const cleanLabel = (config?.label || badge.code).split(' ')[0];
        ctx.fillText(cleanLabel, bx + badgeSize / 2, by + badgeSize + 3);
      });
    }

    // ── 8. Footer ──────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(90, 90, 64, 0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('SIGO TU HUELLA · Sicardi / Garibaldi', PAD, CARD_H - PAD + 4);

    // ── 9. RIGHT PANEL: QR Code ────────────────────────────────────────────────
    const qrCenterX = SPLIT_X + (CARD_W - SPLIT_X) / 2;
    const QR_BOX_W = 120;
    const QR_BOX_H = 170;
    const qrBoxX = qrCenterX - QR_BOX_W / 2;
    const qrBoxY = (CARD_H - QR_BOX_H) / 2 - 20;

    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, qrBoxX, qrBoxY, QR_BOX_W, QR_BOX_H, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const QR_SIZE = 100;
    const qrX = qrBoxX + (QR_BOX_W - QR_SIZE) / 2;
    const qrY = qrBoxY + 10;

    if (!isSuspended) {
      const verifyUrl = `https://sigotuhuella.online/verificar/${memberNumber}`;
      try {
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          width: QR_SIZE, margin: 1,
          color: { dark: BRAND_OLIVE, light: '#FFFFFF' },
        });
        const qrImg = new Image();
        await new Promise((resolve) => { qrImg.onload = resolve; qrImg.onerror = resolve; qrImg.src = qrDataUrl; });
        if (qrImg.complete && qrImg.naturalWidth > 0) {
          ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);
        }
      } catch { /* ignore */ }
    } else {
      ctx.fillStyle = '#FEF2F2';
      roundRect(ctx, qrX, qrY, QR_SIZE, QR_SIZE, 8);
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(qrX + 20, qrY + 20); ctx.lineTo(qrX + QR_SIZE - 20, qrY + QR_SIZE - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(qrX + QR_SIZE - 20, qrY + 20); ctx.lineTo(qrX + 20, qrY + QR_SIZE - 20); ctx.stroke();
    }

    ctx.fillStyle = BRAND_OLIVE;
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isSuspended ? 'SUSPENDIDO' : 'VERIFICAR SOCIO', qrCenterX, qrY + QR_SIZE + 14);

    ctx.fillStyle = '#8B8B73';
    ctx.font = '8px sans-serif';
    ctx.fillText('🐾 Escaneá para verificar', qrCenterX, qrY + QR_SIZE + 30);

    // ── 10. Suspended watermark ────────────────────────────────────────────────
    if (isSuspended) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(SPLIT_X / 2, CARD_H / 2);
      ctx.rotate(-Math.PI / 8);
      ctx.fillText('SUSPENDIDO', 0, 0);
      ctx.restore();
    }
  }, [displayName, memberNumber, avatarData, avatarMime, avatarType, badges, volunteerStatus, levelCode, levelName, stats, isSuspended, lvl, effectiveLevelName]);

  useEffect(() => { drawCard().catch(console.error); }, [drawCard]);

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    await new Promise(requestAnimationFrame);
    try {
      await drawCard();
      await new Promise(r => setTimeout(r, 50));
      canvas.toBlob((blob) => {
        if (blob) {
          onDownload?.(blob);
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          fetch(dataUrl).then(r => r.blob()).then(blob2 => {
            if (blob2.size > 0) onDownload?.(blob2);
          });
        }
        setDownloading(false);
      }, 'image/png');
    } catch {
      console.error('Error al descargar carnet');
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="relative w-full max-w-[620px] group">
        <div 
          className="absolute -inset-1.5 rounded-[2rem] opacity-50 group-hover:opacity-75 blur-2xl transition duration-500"
          style={{ 
            background: isSuspended ? 'linear-gradient(135deg, #6B7280, #4B5563)' : `linear-gradient(135deg, ${BRAND_OLIVE}, ${BRAND_TERRACOTTA})`,
          }}
        />
        <canvas
          ref={canvasRef}
          className="relative w-full rounded-[1.8rem] shadow-2xl overflow-hidden transform group-hover:scale-[1.01] transition-transform duration-500"
          style={{ aspectRatio: `${CARD_W}/${CARD_H}` }}
        />
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full sm:w-auto px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? 'Generando...' : 'Descargar Carnet (PNG)'}
      </button>
    </div>
  );
}
