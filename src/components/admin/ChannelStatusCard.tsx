import React from 'react';
import { cn } from '@/src/lib/utils';
import { Loader2, Check, Pause, X, Clock } from 'lucide-react';

interface ChannelStatusCardProps {
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  status: 'ok' | 'idle' | 'error' | 'connected' | 'disconnected';
  lastRun: string | null;
  detail: string;
}

const statusConfig = {
  ok: { label: 'Activo', color: 'bg-emerald-100 text-emerald-700', icon: Check },
  connected: { label: 'Conectado', color: 'bg-emerald-100 text-emerald-700', icon: Check },
  idle: { label: 'Pausado', color: 'bg-gray-100 text-gray-500', icon: Pause },
  disconnected: { label: 'Desconectado', color: 'bg-red-100 text-red-600', icon: X },
  error: { label: 'Error', color: 'bg-red-100 text-red-600', icon: X },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

export default function ChannelStatusCard({ name, icon, enabled, status, lastRun, detail }: ChannelStatusCardProps) {
  const cfg = statusConfig[status] || statusConfig.idle;
  const StatusIcon = cfg.icon;

  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-all",
      enabled ? "border-brand-accent bg-white" : "border-gray-200 bg-gray-50/50"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", enabled ? "bg-brand-primary/10" : "bg-gray-100")}>
            {icon}
          </div>
          <span className="font-bold text-sm text-gray-800">{name}</span>
        </div>
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", cfg.color)}>
          <StatusIcon className="w-3 h-3 inline mr-0.5" />
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-1 mb-1">{detail}</p>
      <div className="flex items-center gap-1 text-[10px] text-gray-400">
        <Clock className="w-3 h-3" />
        {timeAgo(lastRun)}
      </div>
    </div>
  );
}
