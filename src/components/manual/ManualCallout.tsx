import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type Tone = 'info' | 'success' | 'warning';

const tones: Record<Tone, { container: string; title: string; body: string; icon: string }> = {
  info: {
    container: 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200',
    title: 'text-amber-900',
    body: 'text-amber-700',
    icon: 'text-amber-600',
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200',
    title: 'text-emerald-900',
    body: 'text-emerald-700',
    icon: 'text-emerald-600',
  },
  warning: {
    container: 'bg-rose-50 border-rose-200',
    title: 'text-rose-900',
    body: 'text-rose-700',
    icon: 'text-rose-600',
  },
};

type ManualCalloutProps = {
  title?: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
};

export default function ManualCallout({ title, icon: Icon, tone = 'info', children }: ManualCalloutProps) {
  const t = tones[tone];
  return (
    <div className={cn('rounded-[2rem] border p-5 sm:p-8', t.container)}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className={`w-6 h-6 shrink-0 mt-0.5 ${t.icon}`} />}
        <div className="space-y-2 min-w-0">
          {title && <h3 className={`font-bold ${t.title}`}>{title}</h3>}
          <div className={`text-sm sm:text-base leading-relaxed space-y-2 ${t.body}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
