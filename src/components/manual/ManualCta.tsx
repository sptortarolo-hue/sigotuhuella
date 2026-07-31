import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type ManualCtaProps = {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  icon?: LucideIcon;
  className?: string;
};

export default function ManualCta({ to, children, variant = 'primary', icon: Icon, className }: ManualCtaProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all',
        variant === 'primary'
          ? 'bg-brand-primary text-white'
          : 'bg-white border border-brand-accent text-brand-primary hover:border-brand-primary',
        className,
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </Link>
  );
}
