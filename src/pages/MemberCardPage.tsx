import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Upload, Loader2, CheckCircle2, AlertCircle, PawPrint } from 'lucide-react';
import { motion } from 'motion/react';
import MemberCard from '@/src/components/MemberCard';

export default function MemberCardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [memberData, setMemberData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    fetchMemberData();
  }, [user, authLoading]);

  const fetchMemberData = async () => {
    try {
      const data = await api.members.me();
      setMemberData(data.user);
    } catch (err: any) {
      setError(err.message || 'Error al obtener datos');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setMsg('');
    setError('');
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });
      await api.users.uploadAvatar(user!.id, {
        imageData: base64,
        mimeType: file.type,
      });
      setMsg('Foto de perfil actualizada');
      fetchMemberData();
    } catch (err: any) {
      setError(err.message || 'Error al subir foto');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carnet-${memberData?.member_number || 'miembro'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (authLoading || loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const isMember = memberData?.member_number && memberData?.volunteer_status !== 'none';

  return (
    <div className="max-w-lg mx-auto px-4 py-12 space-y-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
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

        {!isMember ? (
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
            onDownload={handleDownload}
          />
        )}
      </motion.div>

      {isMember && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-bold text-brand-primary">Foto de Perfil</h2>
              <p className="text-xs text-gray-500">Subí una foto para tu carnet</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand-accent shrink-0 bg-brand-bg flex items-center justify-center">
              {memberData?.avatar_type === 'photo' && memberData?.avatar_data ? (
                <img
                  src={`data:${memberData.avatar_mime_type};base64,${memberData.avatar_data}`}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <PawPrint className="w-8 h-8 text-brand-primary" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
            >
              {avatarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {memberData?.avatar_type === 'photo' ? 'Cambiar Foto' : 'Subir Foto'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
