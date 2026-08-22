import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, Heart, PawPrint, MessageCircle, Share2, AlertTriangle, CheckCircle, Info, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/src/lib/volunteerService';

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
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

function typeIcon(type: string) {
  switch (type) {
    case 'case_update': return <PawPrint className="w-5 h-5 text-brand-primary" />;
    case 'share': return <Share2 className="w-5 h-5 text-purple-500" />;
    case 'comment': return <MessageCircle className="w-5 h-5 text-blue-500" />;
    case 'found': return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'alert': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'volunteer': return <Heart className="w-5 h-5 text-red-500" />;
    default: return <Info className="w-5 h-5 text-gray-500" />;
  }
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadNotifications();
  }, [user, navigate]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      try {
        await markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
        );
      } catch {}
    }
    if (n.data?.url) navigate(n.data.url);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-brand-primary/10 text-brand-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">Notificaciones</h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 bg-brand-primary/10 text-brand-primary text-sm font-medium rounded-xl hover:bg-brand-primary/20 transition-colors"
            >
              Marcar todo como leído
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-[2rem] p-5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-full" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] p-12 text-center"
          >
            <BellOff className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 font-serif text-lg">No tenés notificaciones</p>
            <p className="text-gray-400 text-sm mt-2">Cuando tengas novedades, aparecerán acá</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n, i) => (
              <motion.button
                key={n.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left bg-white rounded-[2rem] p-5 sm:p-6 transition-all hover:shadow-md border border-brand-accent/50 ${
                  !n.read ? 'ring-1 ring-brand-primary/20 bg-brand-primary/[0.02]' : ''
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-brand-bg flex items-center justify-center">
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-brand-primary shrink-0" />}
                      <p className={`text-sm sm:text-base font-medium ${!n.read ? 'text-brand-primary font-bold' : 'text-gray-700'}`}>
                        {n.title}
                      </p>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                      {n.data?.url && (
                        <span className="flex items-center gap-1 text-xs text-brand-primary">
                          <ExternalLink className="w-3 h-3" />
                          Ver
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
