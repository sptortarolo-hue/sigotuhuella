import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, UserPlus, Copy, Check, ExternalLink, KeyRound, Link as LinkIcon } from 'lucide-react';
import { api } from '@/src/lib/api';

interface AdminCreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (user: any) => void;
}

const NOTIF_OPTIONS = [
  { value: 'email', label: 'Solo Email' },
  { value: 'whatsapp', label: 'Solo WhatsApp' },
  { value: 'both', label: 'WhatsApp + Email' },
];

export default function AdminCreateUserModal({ isOpen, onClose, onSaved }: AdminCreateUserModalProps) {
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    phone: '',
    memberNumber: '',
    role: 'user' as 'user' | 'admin',
    mode: 'pending' as 'pending' | 'password',
    password: '',
    notificationPreference: 'both',
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdRes, setCreatedRes] = useState<any>(null);

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const reset = () => {
    setForm({
      email: '', displayName: '', phone: '', memberNumber: '',
      role: 'user', mode: 'pending', password: '', notificationPreference: 'both',
    });
  };

  const copyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleClose = () => {
    reset();
    setCreatedRes(null);
    onClose();
  };

  const handleSave = async () => {
    if (!form.email) { alert('El email es obligatorio'); return; }
    if (form.mode === 'password' && form.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      const res = await api.users.create({
        email: form.email,
        displayName: form.displayName,
        phone: form.phone,
        memberNumber: form.memberNumber,
        role: form.role,
        mode: form.mode,
        password: form.mode === 'password' ? form.password : undefined,
        notificationPreference: form.notificationPreference,
      });
      setCreatedRes(res);
      onSaved(res.user);
    } catch (err: any) {
      alert(err.message || 'Error al crear usuario');
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
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-brand-accent shrink-0">
              <h2 className="text-xl font-bold text-brand-primary">Nuevo Usuario</h2>
              <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              <div className="p-4 bg-brand-bg rounded-2xl text-sm text-gray-600 flex items-start gap-3">
                <UserPlus className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
                <span>
                  Alta de cuenta para personas que no pueden registrarse solas. Elegí cómo accederá: por contraseña o por enlace de registro pendiente.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Email *</label>
                  <input type="email" value={form.email}
                    onChange={e => update('email', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nombre</label>
                  <input type="text" value={form.displayName}
                    onChange={e => update('displayName', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Teléfono</label>
                  <input type="text" value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    placeholder="549XXXXXXXXXX"
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Número de Socio</label>
                  <input type="text" value={form.memberNumber}
                    onChange={e => update('memberNumber', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Rol</label>
                  <select value={form.role}
                    onChange={e => update('role', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    <option value="user">Usuario</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Notificaciones</label>
                  <select value={form.notificationPreference}
                    onChange={e => update('notificationPreference', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {NOTIF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Registration mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">¿Cómo accede la persona?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button type="button" onClick={() => update('mode', 'pending')}
                    className={`p-4 rounded-2xl border text-left transition-all ${form.mode === 'pending' ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-brand-primary'}`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-brand-primary mb-1">
                      <LinkIcon className="w-4 h-4" /> Enlace de registro
                    </div>
                    <p className="text-xs text-gray-500">Se genera un enlace para que la persona elija su propia contraseña (se envía por email).</p>
                  </button>
                  <button type="button" onClick={() => update('mode', 'password')}
                    className={`p-4 rounded-2xl border text-left transition-all ${form.mode === 'password' ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-brand-primary'}`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-brand-primary mb-1">
                      <KeyRound className="w-4 h-4" /> Contraseña
                    </div>
                    <p className="text-xs text-gray-500">El admin define una contraseña ahora. La persona puede iniciar sesión de inmediato.</p>
                  </button>
                </div>
                {form.mode === 'password' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Contraseña *</label>
                    <input type="text" value={form.password}
                      onChange={e => update('password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                  </div>
                )}
              </div>

              {/* Success: show registration link */}
              {createdRes && createdRes.registrationLink && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-2 flex items-center gap-1.5">
                    <LinkIcon className="w-4 h-4" /> Enlace de registro
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">Compartilo con la persona (también lo enviamos por email).</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={createdRes.registrationLink}
                      className="w-full p-2.5 rounded-xl border border-amber-200 bg-white text-xs text-gray-700 break-all" />
                    <button onClick={() => copyLink(createdRes.registrationLink)}
                      className="p-2.5 rounded-xl bg-brand-primary text-white hover:shadow-md transition-all shrink-0">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a href={createdRes.registrationLink} target="_blank" rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-all shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 sm:px-8 py-5 border-t border-brand-accent shrink-0">
              <button onClick={handleClose}
                className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {createdRes ? 'Cerrar' : 'Cancelar'}
              </button>
              {!createdRes && (
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Crear usuario
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}