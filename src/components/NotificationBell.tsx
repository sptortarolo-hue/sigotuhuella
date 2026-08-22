import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Heart, PawPrint, MessageCircle, Share2, AlertTriangle, CheckCircle, Info, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { getNotifications, markAllNotificationsRead } from '@/src/lib/volunteerService';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  data?: { url?: string };
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function typeIcon(type: string) {
  switch (type) {
    case 'case_update': return <PawPrint className="w-4 h-4 text-brand-primary" />;
    case 'share': return <Share2 className="w-4 h-4 text-purple-500" />;
    case 'comment': return <MessageCircle className="w-4 h-4 text-blue-500" />;
    case 'found': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'alert': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'volunteer': return <Heart className="w-4 h-4 text-red-500" />;
    default: return <Info className="w-4 h-4 text-gray-500" />;
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    getNotifications()
      .then((data) => {
        const list = (data.notifications || []).slice(0, 20);
        setNotifications(list);
        setUnreadCount(list.filter((n: Notification) => !n.read).length);
      })
      .catch(() => {});
  }, [user, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!user) return null;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleNotificationClick = (n: Notification) => {
    if (n.data?.url) navigate(n.data.url);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full transition-colors hover:bg-brand-primary/10 text-gray-600 hover:text-brand-primary"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.25 }}
            className="absolute right-0 mt-2 w-[340px] max-h-[70vh] bg-white rounded-[2rem] shadow-2xl border border-brand-accent overflow-hidden z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-accent">
              <h3 className="font-serif font-bold text-brand-primary text-base">Notificaciones</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-brand-primary hover:text-brand-secondary font-medium transition-colors"
                >
                  Marcar todo como leído
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No tenés notificaciones
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-brand-bg/60 border-b border-brand-accent/50 last:border-b-0 ${
                      !n.read ? 'bg-brand-primary/5' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-brand-bg flex items-center justify-center">
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${!n.read ? 'text-brand-primary font-bold' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-brand-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.body}</p>
                      <span className="text-[10px] text-gray-400 mt-1 block">{timeAgo(n.created_at)}</span>
                    </div>
                    {n.data?.url && <ChevronRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" />}
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => { navigate('/notificaciones'); setOpen(false); }}
              className="px-5 py-3 text-center text-xs font-medium text-brand-primary hover:bg-brand-bg/60 border-t border-brand-accent transition-colors"
            >
              Ver todas
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
