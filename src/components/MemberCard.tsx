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

// Draw a stylized pet paw print helper
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

    // Use higher resolution backing store for crisp display and download
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // ── 1. Elegant Premium Base Gradient ─────────────────────────────────────────
    const [c1, c2] = isSuspended ? ['#4B5563', '#1F2937'] : lvl.gradient;
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, c1);
    bg.addColorStop(1, c2);
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, CARD_W, CARD_H, 28);
    ctx.fill();

    // ── 2. Vector Wavy Background Patterns (Aesthetics) ─────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 3;
    
    // Wave 1
    ctx.beginPath();
    ctx.moveTo(-50, CARD_H * 0.65);
    ctx.bezierCurveTo(CARD_W * 0.25, CARD_H * 0.85, CARD_W * 0.5, CARD_H * 0.35, CARD_W + 50, CARD_H * 0.55);
    ctx.stroke();

    // Wave 2
    ctx.beginPath();
    ctx.moveTo(-50, CARD_H * 0.8);
    ctx.bezierCurveTo(CARD_W * 0.3, CARD_H * 0.55, CARD_W * 0.6, CARD_H * 0.9, CARD_W + 50, CARD_H * 0.45);
    ctx.stroke();

    // Translucent glowing circles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath(); ctx.arc(CARD_W * 0.8, -20, 160, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(50, CARD_H + 30, 120, 0, Math.PI * 2); ctx.fill();

    // ── 3. Stylized Floating Paw Print Watermarks ──────────────────────────────
    drawPawPrint(ctx, 45, CARD_H - 45, 28, 0.05);
    drawPawPrint(ctx, CARD_W - 130, 45, 38, 0.04);
    drawPawPrint(ctx, CARD_W - 50, CARD_H - 50, 22, 0.05);

    // ── 4. Frosted Glass Panel Container ──────────────────────────────────────────
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, PAD, PAD, CARD_W - PAD * 2, CARD_H - PAD * 2, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── 5. Left Column Info (Avatar, Name, Level) ──────────────────────────────
    const avatarSize = 90;
    const avatarX = PAD + 24;
    const avatarY = PAD + 24;

    // Draw avatar image or fallback icon
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
      // Sleek fallback circle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
    }

    // Avatar glowing ring based on member level
    ctx.strokeStyle = isSuspended ? '#9CA3AF' : (lvl.glow.replace('0.4', '0.85'));
    ctx.lineWidth = 3.5;
    ctx.shadowColor = isSuspended ? 'transparent' : lvl.glow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    // Reset shadow
    ctx.shadowBlur = 0;

    const nameX = avatarX + avatarSize + 20;

    // Organization Logo Badge & Tagline
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('ASOCIADO ACTIVO', nameX, avatarY + 2);

    // Display Name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(displayName || 'Miembro', nameX, avatarY + 16);

    // Member number with glowing aesthetic text
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = isSuspended ? '#EF4444' : '#FBBF24';
    ctx.fillText(`SOCIO Nº ${memberNumber || '—'}`, nameX, avatarY + 46);

    // Dynamic level Badge Pill
    const levelText = `${lvl.icon}  ${effectiveLevelName.toUpperCase()}`;
    ctx.font = 'bold 9px sans-serif';
    const textWidth = ctx.measureText(levelText).width;
    const pillW = textWidth + 18;
    const pillH = 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    roundRect(ctx, nameX, avatarY + 65, pillW, pillH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();
    
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(levelText, nameX + 9, avatarY + 65 + pillH / 2);

    // Org footer tagline
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '9px sans-serif';
    ctx.fillText('SIGO TU HUELLA · Sicardi / Garibaldi', nameX, avatarY + avatarSize - 4);

    // ── 6. Glassmorphic Statistics Box (Middle Section) ──────────────────────
    if (stats) {
      const statsY = avatarY + avatarSize + 22;
      const statItems = [
        { label: 'REPORTES', value: stats.total_reports, emoji: '📋' },
        { label: 'REENCUENTROS', value: stats.reunited_count, emoji: '💞' },
        { label: 'AVISTAJES', value: stats.sighted_count, emoji: '👁️' },
        { label: 'ADOPCIONES', value: stats.adopted_count, emoji: '🏡' },
      ];
      const maxStatsWidth = CARD_W - PAD * 2 - 40 - 150; // Leave 150px for QR area on the right
      const statW = maxStatsWidth / statItems.length;

      statItems.forEach((stat, i) => {
        const sx = PAD + 24 + i * statW;
        // Frosted card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, sx, statsY, statW - 8, 54, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        // Stat value with emoji
        ctx.fillStyle = 'white';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${stat.emoji} ${stat.value}`, sx + (statW - 8) / 2, statsY + 18);

        // Stat Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(stat.label, sx + (statW - 8) / 2, statsY + 38);
      });
    }

    // ── 7. Gorgeous Badges Section (Frosted Coins) ──────────────────────────────────
    const badgeAreaY = stats ? avatarY + avatarSize + 94 : avatarY + avatarSize + 26;
    const badgeSize = 42;
    const badgeGap = 12;
    const badgesLeft = PAD + 24;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('INSIGNIAS LOGRADAS', badgesLeft, badgeAreaY);

    const displayBadges = badges.slice(0, 8);
    displayBadges.forEach((badge, i) => {
      const config = BADGE_CONFIG[badge.code];
      const bx = badgesLeft + i * (badgeSize + badgeGap);
      const by = badgeAreaY + 16;

      // Draw glass coin
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      roundRect(ctx, bx, by, badgeSize, badgeSize, 21); // Circular coin
      ctx.fill();
      
      // Coin border glowing in badge-specific color
      ctx.strokeStyle = config?.color || 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Emoji/icon inside coin
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(config?.icon || '⭐', bx + badgeSize / 2, by + badgeSize / 2);

      // Label under coin (first word)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const cleanLabel = (config?.label || badge.code).split(' ')[0];
      ctx.fillText(cleanLabel, bx + badgeSize / 2, by + badgeSize + 4);
    });

    // ── 8. High-Fidelity Floating QR Code (Right Column) ────────────────────
    const QR_BOX_W = 126;
    const QR_BOX_H = 176;
    const qrBoxX = CARD_W - PAD - 24 - QR_BOX_W;
    const qrBoxY = PAD + 24;

    // Draw polished white card background with drop-shadow feel
    ctx.fillStyle = 'white';
    roundRect(ctx, qrBoxX, qrBoxY, QR_BOX_W, QR_BOX_H, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();

    const QR_SIZE = 106;
    const qrX = qrBoxX + (QR_BOX_W - QR_SIZE) / 2;
    const qrY = qrBoxY + 10;

    if (!isSuspended) {
      const verifyUrl = `https://sigotuhuella.online/verificar/${memberNumber}`;
      try {
        await QRCode.toCanvas(canvas, verifyUrl, {
          width: QR_SIZE, margin: 1,
          color: { dark: isSuspended ? '#000000' : lvl.gradient[0], light: '#FFFFFF' },
        });
      } catch { /* ignore */ }
    } else {
      // Draw standard red X watermark over the QR area
      ctx.fillStyle = '#FEF2F2';
      roundRect(ctx, qrX, qrY, QR_SIZE, QR_SIZE, 10);
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(qrX + 20, qrY + 20); ctx.lineTo(qrX + QR_SIZE - 20, qrY + QR_SIZE - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(qrX + QR_SIZE - 20, qrY + 20); ctx.lineTo(qrX + 20, qrY + QR_SIZE - 20); ctx.stroke();
    }

    // Escanear instructions
    ctx.fillStyle = '#4B5563';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(isSuspended ? 'SUSPENDIDO' : 'VERIFICAR SOCIO', qrBoxX + QR_BOX_W / 2, qrY + QR_SIZE + 12);

    // Cute small logo paw mark inside QR box
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '8px sans-serif';
    ctx.fillText('🐾 ESCANEAR QR', qrBoxX + QR_BOX_W / 2, qrY + QR_SIZE + 26);

    // ── 9. Suspended Watermark overlay ───────────────────────────────────────
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
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="relative w-full max-w-[620px] group">
        {/* Glow behind the card on hover */}
        <div 
          className="absolute -inset-1.5 rounded-[2rem] opacity-50 group-hover:opacity-75 blur-2xl transition duration-500"
          style={{ 
            background: `linear-gradient(135deg, ${lvl.gradient[0]}, ${lvl.gradient[1]})`,
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
        className="w-full sm:w-auto px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
      >
        Descargar Carnet (PNG)
      </button>
    </div>
  );
}
