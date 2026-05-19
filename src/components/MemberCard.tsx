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
  volunteer:  { label: 'Voluntario',    gradient: ['#059669', '#10B981'], icon: '🌱', glow: 'rgba(16, 185, 129, 0.4)' },
  protector:  { label: 'Proteccionista',gradient: ['#0284C7', '#0EA5E9'], icon: '🛡️', glow: 'rgba(14, 165, 233, 0.4)' },
  hero:       { label: 'Héroe Local',   gradient: ['#6D28D9', '#8B5CF6'], icon: '⚡', glow: 'rgba(139, 92, 246, 0.4)' },
  legend:     { label: 'Leyenda',       gradient: ['#B45309', '#F59E0B'], icon: '👑', glow: 'rgba(245, 158, 11, 0.4)' },
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Draw a stylized pet paw print
function drawPawPrint(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, alpha: number) {
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  
  // Pad base
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.15, size * 0.4, size * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // 4 toes
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

// Draw a dog silhouette watermark
function drawDogSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐕', x, y);
  ctx.restore();
}

// Draw a cat silhouette watermark
function drawCatSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) {
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐈', x, y);
  ctx.restore();
}

// Draw a golden credit card chip
function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Chip background
  const chipGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  chipGrad.addColorStop(0, '#D4A017');
  chipGrad.addColorStop(0.5, '#F5D060');
  chipGrad.addColorStop(1, '#D4A017');
  ctx.fillStyle = chipGrad;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();

  // Chip border
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();

  // Chip lines
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.5)';
  ctx.lineWidth = 0.8;
  // Horizontal center line
  ctx.beginPath();
  ctx.moveTo(x + 6, y + h / 2);
  ctx.lineTo(x + w - 6, y + h / 2);
  ctx.stroke();
  // Vertical center line
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 6);
  ctx.lineTo(x + w / 2, y + h - 6);
  ctx.stroke();
  // Inner rectangle
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.4)';
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 3);
  ctx.stroke();
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

    // ── 1. Warm mascot-themed gradient background ──────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    if (isSuspended) {
      bg.addColorStop(0, '#6B7280');
      bg.addColorStop(0.5, '#4B5563');
      bg.addColorStop(1, '#374151');
    } else {
      bg.addColorStop(0, '#F59E0B');
      bg.addColorStop(0.4, '#D97706');
      bg.addColorStop(0.7, '#10B981');
      bg.addColorStop(1, '#059669');
    }
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 28);
    ctx.fill();

    // ── 2. Paw print watermark pattern across background ───────────────────────
    const pawPositions = [
      { x: 80, y: 380, size: 35, a: 0.08 },
      { x: 320, y: 350, size: 28, a: 0.06 },
      { x: 550, y: 390, size: 32, a: 0.07 },
      { x: 600, y: 60, size: 25, a: 0.06 },
      { x: 150, y: 80, size: 22, a: 0.05 },
      { x: 450, y: 200, size: 30, a: 0.05 },
      { x: 250, y: 150, size: 20, a: 0.04 },
      { x: 500, y: 300, size: 26, a: 0.05 },
    ];
    pawPositions.forEach(p => drawPawPrint(ctx, p.x, p.y, p.size, p.a));

    // Pet silhouettes as subtle watermarks
    drawDogSilhouette(ctx, 620, 370, 40, 0.06);
    drawCatSilhouette(ctx, 50, 370, 35, 0.06);

    // Decorative bokeh circles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath(); ctx.arc(600, 50, 100, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(100, 350, 80, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(400, 380, 60, 0, Math.PI * 2); ctx.fill();

    // ── 3. Header: Organization name ───────────────────────────────────────────
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🐾  SIGO TU HUELLA', PAD, PAD - 4);

    // Thin separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 14);
    ctx.lineTo(CARD_W - PAD, PAD + 14);
    ctx.stroke();

    // ── 4. Golden credit card chip (left side) ─────────────────────────────────
    const chipX = PAD + 10;
    const chipY = PAD + 28;
    const chipW = 52;
    const chipH = 38;
    drawChip(ctx, chipX, chipY, chipW, chipH);

    // ── 5. Avatar circle (overlapping chip slightly) ───────────────────────────
    const avatarSize = 72;
    const avatarX = chipX + chipW - 10;
    const avatarY = chipY - 8;

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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
    }

    // Avatar glowing ring
    ctx.strokeStyle = isSuspended ? '#9CA3AF' : (lvl.glow.replace('0.4', '0.85'));
    ctx.lineWidth = 3;
    ctx.shadowColor = isSuspended ? 'transparent' : lvl.glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── 6. Member info section ─────────────────────────────────────────────────
    const infoX = avatarX + avatarSize + 16;
    const infoY = PAD + 30;

    // Display Name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayName || 'Miembro', infoX, infoY);

    // Member number - credit card style
    const spacedNumber = (memberNumber || '—').replace(/-/g, ' ');
    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 14px monospace';
    ctx.letterSpacing = '2px';
    ctx.fillText(`SOCIO Nº  ${spacedNumber}`, infoX, infoY + 28);

    // Level pill
    const levelText = `${lvl.icon}  ${effectiveLevelName.toUpperCase()}`;
    ctx.font = 'bold 9px sans-serif';
    const textWidth = ctx.measureText(levelText).width;
    const pillW = textWidth + 16;
    const pillH = 18;
    const pillX = infoX;
    const pillY = infoY + 50;

    const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
    pillGrad.addColorStop(0, lvl.gradient[0]);
    pillGrad.addColorStop(1, lvl.gradient[1]);
    ctx.fillStyle = pillGrad;
    roundRect(ctx, pillX, pillY, pillW, pillH, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(levelText, pillX + 8, pillY + pillH / 2);

    // ── 7. Statistics row ──────────────────────────────────────────────────────
    if (stats) {
      const statsY = pillY + pillH + 14;
      const statItems = [
        { label: 'REPORTES', value: stats.total_reports, emoji: '📋' },
        { label: 'REENCUENTROS', value: stats.reunited_count, emoji: '💞' },
        { label: 'AVISTAJES', value: stats.sighted_count, emoji: '👁️' },
        { label: 'ADOPCIONES', value: stats.adopted_count, emoji: '🏡' },
      ];
      const statsAreaW = CARD_W - PAD * 2 - 160; // Leave space for QR
      const statW = statsAreaW / statItems.length;

      statItems.forEach((stat, i) => {
        const sx = PAD + 10 + i * statW;
        // White frosted card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        roundRect(ctx, sx, statsY, statW - 8, 48, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Stat value with emoji
        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${stat.emoji} ${stat.value}`, sx + (statW - 8) / 2, statsY + 16);

        // Stat Label
        ctx.fillStyle = '#6B7280';
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(stat.label, sx + (statW - 8) / 2, statsY + 34);
      });
    }

    // ── 8. Badges row ──────────────────────────────────────────────────────────
    const badgeCount = Math.min(badges.length, 8);
    if (badgeCount > 0) {
      const badgeAreaY = stats ? (pillY + pillH + 14 + 48 + 10) : pillY + pillH + 14;
      const badgeSize = 36;
      const badgeGap = 10;
      const badgesLeft = PAD + 10;

      // Dark strip behind badges
      const stripW = badgeCount * (badgeSize + badgeGap) - badgeGap + 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      roundRect(ctx, badgesLeft - 4, badgeAreaY - 4, stripW + 8, badgeSize + 24, 8);
      ctx.fill();

      // Title
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('INSIGNIAS', badgesLeft, badgeAreaY);

      badges.slice(0, 8).forEach((badge, i) => {
        const config = BADGE_CONFIG[badge.code];
        const bx = badgesLeft + i * (badgeSize + badgeGap);
        const by = badgeAreaY + 12;

        // Coin background with badge color
        ctx.fillStyle = config?.color || '#6B7280';
        roundRect(ctx, bx, by, badgeSize, badgeSize, 18);
        ctx.fill();

        // Coin border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Icon inside coin
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(config?.icon || '⭐', bx + badgeSize / 2, by + badgeSize / 2);

        // Label under coin
        ctx.fillStyle = 'white';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const cleanLabel = (config?.label || badge.code).split(' ')[0];
        ctx.fillText(cleanLabel, bx + badgeSize / 2, by + badgeSize + 3);
      });
    }

    // ── 9. QR Code verification box (right side) ───────────────────────────────
    const QR_BOX_W = 130;
    const QR_BOX_H = 180;
    const qrBoxX = CARD_W - PAD - 10 - QR_BOX_W;
    const qrBoxY = PAD + 20;

    // White card background
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, qrBoxX, qrBoxY, QR_BOX_W, QR_BOX_H, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // QR code
    const QR_SIZE = 108;
    const qrX = qrBoxX + (QR_BOX_W - QR_SIZE) / 2;
    const qrY = qrBoxY + 10;

    if (!isSuspended) {
      const verifyUrl = `https://sigotuhuella.online/verificar/${memberNumber}`;
      try {
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          width: QR_SIZE, margin: 1,
          color: { dark: lvl.gradient[0], light: '#FFFFFF' },
        });
        const qrImg = new Image();
        await new Promise((resolve) => { qrImg.onload = resolve; qrImg.onerror = resolve; qrImg.src = qrDataUrl; });
        if (qrImg.complete && qrImg.naturalWidth > 0) {
          ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);
        }
      } catch { /* ignore */ }
    } else {
      // Red X watermark
      ctx.fillStyle = '#FEF2F2';
      roundRect(ctx, qrX, qrY, QR_SIZE, QR_SIZE, 8);
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(qrX + 20, qrY + 20); ctx.lineTo(qrX + QR_SIZE - 20, qrY + QR_SIZE - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(qrX + QR_SIZE - 20, qrY + 20); ctx.lineTo(qrX + 20, qrY + QR_SIZE - 20); ctx.stroke();
    }

    // Verification text
    ctx.fillStyle = '#4B5563';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isSuspended ? 'SUSPENDIDO' : 'VERIFICAR SOCIO', qrBoxX + QR_BOX_W / 2, qrY + QR_SIZE + 10);

    // Paw scan icon
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '7px sans-serif';
    ctx.fillText('🐾 Escaneá para verificar', qrBoxX + QR_BOX_W / 2, qrY + QR_SIZE + 24);

    // ── 10. Footer tagline ─────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('SIGO TU HUELLA · Sicardi / Garibaldi', PAD, CARD_H - PAD + 4);

    // ── 11. Suspended watermark ────────────────────────────────────────────────
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
        {/* Glow behind the card on hover */}
        <div 
          className="absolute -inset-1.5 rounded-[2rem] opacity-50 group-hover:opacity-75 blur-2xl transition duration-500"
          style={{ 
            background: isSuspended ? 'linear-gradient(135deg, #6B7280, #374151)' : `linear-gradient(135deg, ${lvl.gradient[0]}, ${lvl.gradient[1]})`,
            boxShadow: `0 0 40px ${lvl.glow}`
          }}
        />
        <canvas
          ref={canvasRef}
          className="relative w-full rounded-[1.8rem] shadow-2xl border border-white/20 overflow-hidden transform group-hover:scale-[1.01] transition-transform duration-500"
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
