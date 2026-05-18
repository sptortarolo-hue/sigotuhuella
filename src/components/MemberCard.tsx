import { useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { Badge } from '@/src/hooks/AuthProvider';

const BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  volunteer: { label: 'Voluntario/a', color: '#10B981' },
  first_donation: { label: '1ra Donación', color: '#EC4899' },
  frequent_donor: { label: 'Donante Frecuente', color: '#8B5CF6' },
  foster_hero: { label: 'Héroe Tránsito', color: '#F59E0B' },
  rescuer: { label: 'Rescatista', color: '#3B82F6' },
  founder: { label: 'Fundador/a', color: '#FBBF24' },
};

interface MemberCardProps {
  displayName: string;
  memberNumber: string;
  avatarData?: string;
  avatarMime?: string;
  avatarType: string;
  badges: Badge[];
  volunteerStatus: string;
  onDownload?: (blob: Blob) => void;
}

const CARD_WIDTH = 600;
const CARD_HEIGHT = 380;
const PADDING = 30;
const QR_SIZE = 100;

export default function MemberCard({
  displayName,
  memberNumber,
  avatarData,
  avatarMime,
  avatarType,
  badges,
  volunteerStatus,
  onDownload,
}: MemberCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#10B981');
    gradient.addColorStop(1, '#059669');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 20);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(PADDING, PADDING, CARD_WIDTH - PADDING * 2, CARD_HEIGHT - PADDING * 2, 16);
    ctx.fill();

    const avatarSize = 70;
    const avatarX = PADDING + 15;
    const avatarY = PADDING + 15;

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
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐾', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 2);
    }

    ctx.fillStyle = 'white';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName || 'Miembro', avatarX + avatarSize + 20, avatarY + 18);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(memberNumber || '—', avatarX + avatarSize + 20, avatarY + 48);

    const statusLabel: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', pending: 'Pendiente', none: '' };
    const label = statusLabel[volunteerStatus] || '';
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.roundRect(avatarX + avatarSize + 20, avatarY + 55, ctx.measureText(label).width + 16, 22, 11);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, avatarX + avatarSize + 20 + (ctx.measureText(label).width + 16) / 2, avatarY + 66);
    }

    const badgesY = avatarY + avatarSize + 25;
    const maxBadgesPerRow = 4;
    const badgeSize = 55;
    const badgeGap = 10;
    const badgesStartX = PADDING + 15;

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.roundRect(badgesStartX - 5, badgesY - 5, CARD_WIDTH - PADDING * 2 - 10, 125, 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('INSIGNIAS', badgesStartX, badgesY + 3);

    const gridY = badgesY + 22;
    badges.forEach((badge, i) => {
      const config = BADGE_CONFIG[badge.code];
      const col = i % maxBadgesPerRow;
      const row = Math.floor(i / maxBadgesPerRow);
      const bx = badgesStartX + col * (badgeSize + badgeGap);
      const by = gridY + row * (badgeSize + 20);

      ctx.fillStyle = config?.color || '#6B7280';
      ctx.beginPath();
      ctx.roundRect(bx, by, badgeSize, badgeSize, 10);
      ctx.fill();

      const iconMap: Record<string, string> = {
        volunteer: '🤝',
        first_donation: '❤️',
        frequent_donor: '💜',
        foster_hero: '🏠',
        rescuer: '🛡️',
        founder: '👑',
      };
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconMap[badge.code] || '⭐', bx + badgeSize / 2, by + badgeSize / 2);

      ctx.fillStyle = 'white';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(config?.label || badge.code, bx + badgeSize / 2, by + badgeSize + 3);
    });

    const qrX = CARD_WIDTH - PADDING - QR_SIZE - 10;
    const qrY = Math.round((CARD_HEIGHT - QR_SIZE) / 2) - 5;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(qrX - 8, qrY - 8, QR_SIZE + 16, QR_SIZE + 40, 10);
    ctx.fill();

    const verifyUrl = `https://sigotuhuella.online/verificar/${memberNumber}`;
    try {
      await QRCode.toCanvas(canvas, verifyUrl, {
        width: QR_SIZE,
        margin: 1,
        color: { dark: '#10B981', light: '#FFFFFF' },
      });
    } catch {
      // fallback: draw manual QR placeholder
    }

    ctx.fillStyle = '#374151';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Escané para verificar', qrX - 8 + (QR_SIZE + 16) / 2, qrY + QR_SIZE + 10);
  }, [displayName, memberNumber, avatarData, avatarMime, avatarType, badges, volunteerStatus]);

  useEffect(() => {
    drawCard();
  }, [drawCard]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onDownload?.(blob);
    }, 'image/png');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className="w-full max-w-[600px] rounded-2xl shadow-2xl"
        style={{ aspectRatio: `${CARD_WIDTH}/${CARD_HEIGHT}` }}
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
