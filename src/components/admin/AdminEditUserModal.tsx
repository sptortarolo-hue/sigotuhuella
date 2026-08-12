import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Loader2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { cn } from '@/src/lib/utils';

interface AdminEditUserModalProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updatedUser: any) => void;
}

const NOTIF_OPTIONS = [
  { value: 'email', label: 'Solo Email' },
  { value: 'whatsapp', label: 'Solo WhatsApp' },
  { value: 'both', label: 'WhatsApp + Email' },
];

const VOLUNTEER_OPTIONS = [
  { value: 'none', label: 'Ninguno' },
  { value: 'active', label: 'Activo' },
  { value: 'suspended', label: 'Suspendido' },
];

const AVATAR_OPTIONS = [
  { value: 'pawprint', label: 'Huella' },
  { value: 'photo', label: 'Foto' },
];

const MANUAL_BADGES = [
  { code: 'volunteer', label: 'Voluntario/a' },
  { code: 'first_donation', label: '1ra Donación' },
  { code: 'frequent_donor', label: 'Donante Frecuente' },
  { code: 'foster_hero', label: 'Héroe Tránsito' },
  { code: 'rescuer', label: 'Rescatista' },
  { code: 'founder', label: 'Fundador/a' },
  { code: 'ayuda_traslados', label: 'Ayuda en traslados' },
  { code: 'hogares_transito', label: 'Hogares de tránsito' },
  { code: 'difusion_redes', label: 'Difusión en redes' },
  { code: 'logistica', label: 'Logística y org.' },
  { code: 'aporte_economico', label: 'Aporte económico' },
  { code: 'fotografia_video', label: 'Fotografía y video' },
  { code: 'recoleccion_insumos', label: 'Recolección insumos' },
  { code: 'apoyo_veterinario', label: 'Apoyo veterinario' },
  { code: 'asesoria_legal', label: 'Asesoría legal' },
  { code: 'diseno_grafico', label: 'Diseño gráfico' },
];

export default function AdminEditUserModal({ user, isOpen, onClose, onSaved }: AdminEditUserModalProps) {
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    phone: '',
    member_number: '',
    volunteer_status: 'none',
    notification_preference: 'email',
    points: 0,
    level: 1,
    email_verified: false,
    registration_pending: false,
    avatar_type: 'pawprint',
    badges: [] as string[],
    contribution_areas: [] as string[],
    neighborhoods: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && isOpen) {
      setForm({
        display_name: user.display_name || '',
        email: user.email || '',
        phone: user.phone || '',
        member_number: user.member_number || '',
        volunteer_status: user.volunteer_status || 'none',
        notification_preference: user.notification_preference || 'email',
        points: user.points || 0,
        level: user.level || 1,
        email_verified: !!user.email_verified,
        registration_pending: !!user.registration_pending,
        avatar_type: user.avatar_type || 'pawprint',
        badges: (user.badges || []).map((b: any) => b.code || b),
        contribution_areas: Array.isArray(user.contribution_areas) ? user.contribution_areas : [],
        neighborhoods: Array.isArray(user.neighborhoods) ? user.neighborhoods : (() => {
          try { return JSON.parse(user.neighborhoods || '[]'); } catch { return []; }
        })(),
      });
    }
  }, [user, isOpen]);

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleToggleBadge = (code: string) => {
    setForm(prev => ({
      ...prev,
      badges: prev.badges.includes(code)
        ? prev.badges.filter(b => b !== code)
        : [...prev.badges, code],
    }));
  };

  const handleToggleContribution = (area: string) => {
    setForm(prev => ({
      ...prev,
      contribution_areas: prev.contribution_areas.includes(area)
        ? prev.contribution_areas.filter(a => a !== area)
        : [...prev.contribution_areas, area],
    }));
  };

  const handleToggleNeighborhood = (id: string) => {
    setForm(prev => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(id)
        ? prev.neighborhoods.filter(n => n !== id)
        : [...prev.neighborhoods, id],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.users.update(user.id, {
        displayName: form.display_name,
        email: form.email,
        phone: form.phone,
        memberNumber: form.member_number,
        volunteerStatus: form.volunteer_status,
        notificationPreference: form.notification_preference,
        points: form.points,
        level: form.level,
        emailVerified: form.email_verified,
        registrationPending: form.registration_pending,
        avatarType: form.avatar_type,
        badges: form.badges.map(code => ({ code, awarded_at: new Date().toISOString() })),
        contributionAreas: form.contribution_areas,
        neighborhoods: form.neighborhoods,
      });
      onSaved(updated.user);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-brand-accent shrink-0">
              <h2 className="text-xl font-bold text-brand-primary">Editar Usuario</h2>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={form.display_name}
                    onChange={e => update('display_name', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => update('email', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Teléfono</label>
                  <input type="text" value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary"
                    placeholder="549XXXXXXXXXX" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Número de Socio</label>
                  <input type="text" value={form.member_number}
                    onChange={e => update('member_number', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
              </div>

              {/* Selects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Notificaciones</label>
                  <select value={form.notification_preference}
                    onChange={e => update('notification_preference', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {NOTIF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Estado Voluntario</label>
                  <select value={form.volunteer_status}
                    onChange={e => update('volunteer_status', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {VOLUNTEER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Tipo Avatar</label>
                  <select value={form.avatar_type}
                    onChange={e => update('avatar_type', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {AVATAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Points & Level */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Puntos</label>
                  <input type="number" min={0} value={form.points}
                    onChange={e => update('points', parseInt(e.target.value) || 0)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nivel</label>
                  <input type="number" min={1} value={form.level}
                    onChange={e => update('level', parseInt(e.target.value) || 1)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.email_verified}
                    onChange={e => update('email_verified', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300" />
                  Email verificado
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.registration_pending}
                    onChange={e => update('registration_pending', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300" />
                  Registro pendiente
                </label>
              </div>

              {/* Badges */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Insignias</label>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_BADGES.map(badge => {
                    const active = form.badges.includes(badge.code);
                    return (
                      <button key={badge.code} type="button" onClick={() => handleToggleBadge(badge.code)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          active ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary' : 'border border-dashed border-gray-300 text-gray-400 hover:text-brand-primary hover:border-brand-primary'
                        }`}>
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contribution areas */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Áreas de contribución</label>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_BADGES.filter(b => !['volunteer', 'first_donation', 'frequent_donor', 'foster_hero', 'rescuer', 'founder'].includes(b.code)).map(area => {
                    const active = form.contribution_areas.includes(area.code);
                    return (
                      <button key={area.code} type="button" onClick={() => handleToggleContribution(area.code)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          active ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'border border-dashed border-gray-300 text-gray-400 hover:text-purple-500 hover:border-purple-300'
                        }`}>
                        {area.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Barrios para alertas vecinales */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Barrios (alertas vecinales)</label>
                <div className="flex flex-wrap gap-2">
                  {NEIGHBORHOODS.map(n => {
                    const active = form.neighborhoods.includes(n.id);
                    return (
                      <button key={n.id} type="button" onClick={() => handleToggleNeighborhood(n.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          active ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary' : 'border border-dashed border-gray-300 text-gray-400 hover:text-brand-primary hover:border-brand-primary'
                        }`}>
                        {n.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 sm:px-8 py-5 border-t border-brand-accent shrink-0">
              <button onClick={onClose}
                className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}