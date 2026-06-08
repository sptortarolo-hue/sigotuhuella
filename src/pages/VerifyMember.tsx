import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { Badge } from '@/src/hooks/AuthProvider';
import { CheckCircle2, XCircle, Loader2, PawPrint } from 'lucide-react';
import { motion } from 'motion/react';

const BADGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  // Automatic badges
  first_report:     { label: '1er Reporte',      color: 'bg-emerald-100 text-emerald-700', icon: '🐾' },
  reporter_5:       { label: '5 Reportes',        color: 'bg-sky-100 text-sky-700', icon: '📋' },
  reporter_15:      { label: '15 Reportes',       color: 'bg-indigo-100 text-indigo-700', icon: '🌟' },
  reunited_hero:    { label: 'Héroe Reencuentro', color: 'bg-pink-100 text-pink-700', icon: '💞' },
  reunited_legend:  { label: 'Leyenda Reunión',   color: 'bg-amber-100 text-amber-700', icon: '🏆' },
  // Manual badges
  volunteer:        { label: 'Voluntario/a',      color: 'bg-emerald-100 text-emerald-700', icon: '🤝' },
  first_donation:   { label: '1ra Donación',      color: 'bg-pink-100 text-pink-700', icon: '❤️' },
  frequent_donor:   { label: 'Donante Frecuente', color: 'bg-purple-100 text-purple-700', icon: '💜' },
  foster_hero:      { label: 'Héroe Tránsito',    color: 'bg-amber-100 text-amber-700', icon: '🏠' },
  rescuer:          { label: 'Rescatista',         color: 'bg-blue-100 text-blue-700', icon: '🛡️' },
  founder:          { label: 'Fundador/a',         color: 'bg-yellow-100 text-yellow-700', icon: '👑' },
};

interface MemberData {
  display_name: string;
  avatar_data?: string;
  avatar_mime_type?: string;
  avatar_type: string;
  member_number: string;
  volunteer_status: string;
  badges: Badge[];
}

export default function VerifyMember() {
  const { memberNumber } = useParams<{ memberNumber: string }>();
  const [member, setMember] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!memberNumber) { setError('Número de miembro inválido'); setLoading(false); return; }
    api.members.verify(memberNumber)
      .then(data => setMember(data.member))
      .catch(err => setError(err.message || 'Miembro no encontrado'))
      .finally(() => setLoading(false));
  }, [memberNumber]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <XCircle className="w-20 h-20 mx-auto text-red-400 mb-6" />
        <h1 className="text-2xl font-serif font-bold text-gray-700 mb-2">Miembro no encontrado</h1>
        <p className="text-gray-500">{error || 'El código de verificación no es válido'}</p>
      </div>
    );
  }

  const statusLabel: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', pending: 'Pendiente', suspended: 'Suspendido' };
  const statusColor: Record<string, string> = { active: 'text-emerald-600', inactive: 'text-gray-400', pending: 'text-amber-600', suspended: 'text-gray-400' };

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[2.5rem] border border-brand-accent shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 sm:p-8 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-white mb-4" />
          <h1 className="text-2xl font-serif font-bold text-white">Verificado</h1>
          <p className="text-emerald-100 text-sm mt-1">Miembro confirmado de Sigo Tu Huella</p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-brand-accent shrink-0 bg-brand-bg flex items-center justify-center">
              {member.avatar_type === 'photo' && member.avatar_data ? (
                <img
                  src={`data:${member.avatar_mime_type};base64,${member.avatar_data}`}
                  alt={member.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <PawPrint className="w-10 h-10 text-brand-primary" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-primary">{member.display_name || 'Miembro'}</h2>
              <p className="text-sm text-gray-500 font-mono">{member.member_number}</p>
              <p className={`text-sm font-bold ${statusColor[member.volunteer_status] || 'text-gray-500'}`}>
                {statusLabel[member.volunteer_status] || member.volunteer_status}
              </p>
            </div>
          </div>

          {member.badges && member.badges.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Insignias</h3>
              <div className="flex flex-wrap gap-2">
                {member.badges.map((badge, i) => {
                  const config = BADGE_CONFIG[badge.code];
                  if (!config) return null;
                  return (
                    <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${config.color}`}>
                      <span>{config.icon}</span> {config.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-brand-accent text-center">
            <p className="text-xs text-gray-400">
              Verificado en Sigo Tu Huella · {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
