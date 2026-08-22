import { useState, useEffect } from 'react';
import { getNotificationChannels, updateNotificationChannels } from '@/src/lib/volunteerService';
import { Bell, Mail, Phone, Inbox, Loader2, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface NotificationPreferencesProps {
  onClose?: () => void;
}

interface Channels {
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  in_app: boolean;
}

const CHANNELS_CONFIG: { key: keyof Channels; label: string; description: string; icon: typeof Bell; color: string }[] = [
  { key: 'push', label: 'Push (FCM)', description: 'Notificaciones push en tu dispositivo', icon: Bell, color: 'text-brand-primary' },
  { key: 'email', label: 'Email', description: 'Resumen de actividad por correo electrónico', icon: Mail, color: 'text-blue-600' },
  { key: 'whatsapp', label: 'WhatsApp (Relay)', description: 'Alertas vía WhatsApp del relay', icon: Phone, color: 'text-emerald-600' },
  { key: 'in_app', label: 'In-app', description: 'Notificaciones dentro de la aplicación', icon: Inbox, color: 'text-purple-600' },
];

export default function NotificationPreferences({ onClose }: NotificationPreferencesProps) {
  const [channels, setChannels] = useState<Channels>({ push: true, email: true, whatsapp: true, in_app: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getNotificationChannels();
        if (data) {
          setChannels({
            push: data.push ?? true,
            email: data.email ?? true,
            whatsapp: data.whatsapp ?? true,
            in_app: data.in_app ?? true,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (key: keyof Channels) => {
    const next = { ...channels, [key]: !channels[key] };
    setChannels(next);
    setSaving(true);
    setSaved(false);
    try {
      await updateNotificationChannels(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      setChannels(prev => ({ ...prev, [key]: !prev[key] }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
      </div>
    );
  }

  const content = (
    <div className="space-y-3">
      {CHANNELS_CONFIG.map(({ key, label, description, icon: Icon, color }) => (
        <button
          key={key}
          type="button"
          role="switch"
          aria-checked={channels[key]}
          onClick={() => toggle(key)}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-brand-accent hover:border-brand-primary/30 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', channels[key] ? 'bg-brand-primary/10' : 'bg-gray-100')}>
              <Icon className={cn('w-5 h-5', channels[key] ? color : 'text-gray-400')} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">{label}</p>
              <p className="text-xs text-gray-500">{description}</p>
            </div>
          </div>
          <div className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0',
            channels[key] ? 'bg-brand-primary' : 'bg-gray-300'
          )}>
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              channels[key] && 'translate-x-5'
            )} />
          </div>
        </button>
      ))}

      <div className="flex items-center justify-between pt-2">
        <AnimatePresence>
          {saving && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
            </motion.span>
          )}
          {saved && !saving && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-xs text-emerald-600 font-bold">
              Guardado
            </motion.span>
          )}
        </AnimatePresence>
        {onClose && (
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
            Cerrar
          </button>
        )}
      </div>
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-xl"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-serif font-bold text-brand-primary flex items-center gap-2">
              <Bell className="w-5 h-5" /> Canales de notificación
            </h3>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
          {content}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <h3 className="text-lg font-serif font-bold text-brand-primary flex items-center gap-2 mb-5">
        <Bell className="w-5 h-5" /> Canales de notificación
      </h3>
      {content}
    </div>
  );
}
