import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, PawPrint, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import MemberCard, { BADGE_CONFIG } from '@/src/components/MemberCard';
import ImageCropper from '@/src/components/ImageCropper';
import { fileToBase64 } from '@/src/lib/storageService';

export default function MemberCardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [memberData, setMemberData] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    fetchAll();
  }, [user, authLoading]);

  const fetchAll = async () => {
    try {
      const [memberRes, statsRes] = await Promise.allSettled([
        api.members.me(),
        user ? api.users.stats(user.id) : Promise.reject(),
      ]);
      if (memberRes.status === 'fulfilled') setMemberData(memberRes.value.user);
      if (statsRes.status === 'fulfilled') {
        setStatsData(statsRes.value);
        // Merge auto badges from stats into memberData if they were updated
        if (statsRes.value.badges && memberRes.status === 'fulfilled') {
          setMemberData(prev => prev ? { ...prev, badges: statsRes.value.badges } : prev);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error al obtener datos');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropFile(null);
    setAvatarLoading(true); setMsg(''); setError('');
    try {
      const { data, mimeType } = await fileToBase64(new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' }));
      await api.users.uploadAvatar(user!.id, { imageData: data, mimeType });
      setMsg('Foto de perfil actualizada');
      fetchAll();
    } catch (err: any) { setError(err.message || 'Error al subir foto'); }
    finally { setAvatarLoading(false); }
  };

  const handleCropCancel = () => {
    setCropFile(null);
  };

  const handleDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carnet-${memberData?.member_number || 'miembro'}.png`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (authLoading || loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isMember = memberData?.member_number && memberData?.volunteer_status !== 'none';
  const isSuspended = memberData?.volunteer_status === 'suspended';
  const level = statsData?.level;
  const stats = statsData?.stats;
  const nextLevel = statsData?.nextLevel;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 space-y-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 sm:p-8 rounded-[2rem] border border-brand-accent shadow-xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
            <PawPrint className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-brand-primary">Mi Carnet</h1>
            <p className="text-sm text-gray-500">
              {isMember ? `Miembro ${memberData.member_number}` : 'No sos miembro aún'}
            </p>
          </div>
        </div>

        {error && <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        {msg && <div className="mb-6 p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4 shrink-0" />{msg}</div>}

        {isSuspended ? (
          <div className="text-center py-12 bg-red-50 rounded-[2rem] border-2 border-dashed border-red-200">
            <AlertCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
            <p className="text-red-600 font-bold text-lg mb-2">Suscripción suspendida</p>
            <p className="text-sm text-red-500">No podés acceder a tu carnet. Comunicate con la organización para más información.</p>
          </div>
        ) : !isMember ? (
          <div className="text-center py-12 bg-brand-bg rounded-[2rem] border-2 border-dashed border-brand-accent">
            <PawPrint className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium mb-2">Aún no tenés carnet de miembro</p>
            <p className="text-sm text-gray-400">Completá el formulario en "Sumate" para convertirte en voluntario/a</p>
          </div>
        ) : (
          <MemberCard
            displayName={memberData.display_name || ''}
            memberNumber={memberData.member_number}
            avatarData={memberData.avatar_data}
            avatarMime={memberData.avatar_mime_type}
            avatarType={memberData.avatar_type || 'pawprint'}
            badges={memberData.badges || []}
            volunteerStatus={memberData.volunteer_status || 'none'}
            levelCode={level?.code}
            levelName={level?.name}
            stats={stats}
            onDownload={handleDownload}
          />
        )}
      </motion.div>

      {/* Level & Progress */}
      {isMember && !isSuspended && stats && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white p-6 sm:p-8 rounded-[2rem] border border-brand-accent shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-bold text-brand-primary">Mi Nivel</h2>
              <p className="text-sm font-bold text-brand-primary">{level?.name || 'Voluntario'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Reportes', value: stats.total_reports, icon: '📋' },
              { label: 'Reencuentros', value: stats.reunited_count, icon: '💞' },
              { label: 'Avistajes', value: stats.sighted_count, icon: '👁️' },
              { label: 'Adopciones', value: stats.adopted_count, icon: '🏡' },
            ].map(s => (
              <div key={s.label} className="bg-brand-bg rounded-2xl p-4 text-center">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="text-2xl font-bold text-brand-primary">{s.value}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
          {nextLevel && (
            <div className="bg-brand-bg rounded-2xl p-4">
              <p className="text-xs font-bold uppercase text-gray-500 mb-2">Próximo nivel: {nextLevel.name}</p>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>📋 {stats.total_reports}/{nextLevel.reports} reportes</span>
                <span>💞 {stats.reunited_count}/{nextLevel.reunited} reencuentros</span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Badges */}
      {isMember && !isSuspended && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-white p-6 sm:p-8 rounded-[2rem] border border-brand-accent shadow-xl">
          <h2 className="text-xl font-serif font-bold text-brand-primary mb-6">Mis Insignias</h2>
          {Array.isArray(memberData?.badges) && memberData.badges.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {(memberData.badges as { code: string; awarded_at: string }[]).map(badge => {
                const cfg = BADGE_CONFIG[badge.code];
                return (
                  <div key={badge.code} className="flex flex-col items-center gap-2 p-3 rounded-2xl" style={{ backgroundColor: `${cfg?.color || '#6B7280'}18` }}>
                    <span className="text-3xl">{cfg?.icon || '⭐'}</span>
                    <span className="text-xs font-bold text-center text-gray-700 leading-tight">{cfg?.label || badge.code}</span>
                    <span className="text-[9px] text-gray-400">{new Date(badge.awarded_at).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 bg-brand-bg rounded-2xl border-2 border-dashed border-brand-accent">
              <p className="text-gray-400 font-medium mb-1">Aún no tenés insignias</p>
              <p className="text-xs text-gray-400">Reportá mascotas y ayudá en reencuentros para ganar tus primeras insignias</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Avatar upload */}
      {isMember && !isSuspended && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="bg-white p-6 sm:p-8 rounded-[2rem] border border-brand-accent shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center"><Camera className="w-6 h-6" /></div>
            <div><h2 className="text-xl font-serif font-bold text-brand-primary">Foto de Perfil</h2><p className="text-xs text-gray-500">Subí una foto para tu carnet</p></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand-accent shrink-0 bg-brand-bg flex items-center justify-center">
              {memberData?.avatar_type === 'photo' && memberData?.avatar_data
                ? <img src={`data:${memberData.avatar_mime_type};base64,${memberData.avatar_data}`} alt="Avatar" className="w-full h-full object-cover" />
                : <PawPrint className="w-8 h-8 text-brand-primary" />}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-50">
              {avatarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {memberData?.avatar_type === 'photo' ? 'Cambiar Foto' : 'Subir Foto'}
            </button>
          </div>
        </motion.div>
      )}

      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
